const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, screen, Tray, nativeImage, shell } = require('electron')
const http = require('http')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { pathToFileURL } = require('url')

let hostWindow, participantWindow, timer, apiServer, tray
let isQuitting = false
const trayVisibilityItems = {}
const undo = [], redo = []
const state = {
  status: 'ready', selectedMinutes: 10, remaining: 600,
  text: '靜心練習', showText: true, textFont: '系統預設字體', textSize: 80, textColor: '#f7f7f7', textPosition: { x: .5, y: .62 },
  showClock: false, clock24: false, clockFont: '系統預設字體', clockSize: 50, clockPosition: { x: .5, y: .86 },
  showCountdown: false, countdownFont: '系統預設字體', countdownSize: 60, countdownPosition: { x: .5, y: .25 },
  progressStyle: 'ring', progressSize: 25, progressStart: '#32d05b', progressEnd: '#e3c767',
  background: '#000000', background2: '#123326', gradient: false, backgroundImage: '',
  alwaysOnTop: false, silent: false, musicEnabled: false,
  opening: { file: '', volume: 30, fadeIn: true, fadeOut: true },
  music: { file: '', files: [], mode: 'single', volume: 30, fadeIn: true, fadeOut: true },
  closing: { file: '', volume: 30, fadeIn: true, fadeOut: true },
}
let dragSnapshot = null
let windowDragSnapshot = null
let fontCache = null

function runFile(command, args) { return new Promise((resolve, reject) => execFile(command, args, { maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout))) }
async function listLocalFonts() {
  if (fontCache) return fontCache
  let names = []
  try {
    if (process.platform === 'darwin') {
      const data = JSON.parse(await runFile('/usr/sbin/system_profiler', ['SPFontsDataType', '-json', '-detailLevel', 'mini']))
      names = (data.SPFontsDataType || []).flatMap(font => (font.typefaces || []).map(face => face.family || face.fullname)).filter(Boolean)
    } else if (process.platform === 'win32') {
      const roots = [['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'], ['query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']]
      const outputs = await Promise.all(roots.map(args => runFile('reg.exe', args).catch(() => '')))
      names = outputs.join('\n').split(/\r?\n/).map(line => line.match(/^\s{2,}(.+?)\s+REG_\w+\s+/)?.[1]?.replace(/\s*\((TrueType|OpenType)\)\s*$/i, '')).filter(Boolean)
    } else names = (await runFile('fc-list', [':', 'family'])).split(/\r?\n/).flatMap(line => line.split(',')).map(x => x.trim()).filter(Boolean)
  } catch (error) { console.error('Unable to list local fonts:', error.message) }
  fontCache = [...new Set(['系統預設字體', ...names.filter(name => !name.startsWith('.'))])].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return fontCache
}

const snapshotPositions = () => JSON.parse(JSON.stringify({ clockPosition: state.clockPosition, textPosition: state.textPosition, countdownPosition: state.countdownPosition }))
function applyPositions(p) { Object.assign(state, JSON.parse(JSON.stringify(p))); broadcast() }
function undoPosition() { const p = undo.pop(); if (!p) return; redo.push(snapshotPositions()); applyPositions(p) }
function redoPosition() { const p = redo.pop(); if (!p) return; undo.push(snapshotPositions()); applyPositions(p) }

function publicState() {
  const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const elapsed = Math.max(0, state.selectedMinutes * 60 - state.remaining)
  return { ...state, state: state.status, remainingText: formatTime(state.remaining), elapsed, elapsedText: formatTime(elapsed), progress: 1 - state.remaining / Math.max(1, state.selectedMinutes * 60) }
}
function broadcast() {
  const s = publicState(); hostWindow?.webContents.send('state', s); participantWindow?.webContents.send('state', s)
  if (trayVisibilityItems.countdown) trayVisibilityItems.countdown.checked = state.showCountdown
  if (trayVisibilityItems.clock) trayVisibilityItems.clock.checked = state.showClock
  if (trayVisibilityItems.text) trayVisibilityItems.text.checked = state.showText
  if (trayVisibilityItems.alwaysOnTop) trayVisibilityItems.alwaysOnTop.checked = state.alwaysOnTop
}
function start() {
  if (state.status === 'ready' || state.status === 'finished') state.remaining = state.selectedMinutes * 60
  state.status = 'running'; clearInterval(timer)
  timer = setInterval(() => { if (state.status !== 'running') return; if (state.remaining > 0) state.remaining--; else finish(); broadcast() }, 1000)
  broadcast()
}
function pause() { if (state.status === 'running') state.status = 'paused'; broadcast() }
function reset() { clearInterval(timer); state.status = 'ready'; state.remaining = state.selectedMinutes * 60; broadcast() }
function finish() { clearInterval(timer); state.remaining = 0; state.status = 'finished'; broadcast() }
function setDuration(minutes) { if (!Number.isFinite(minutes) || minutes < 1 || minutes > 999 || state.status === 'running') return; state.selectedMinutes = Math.round(minutes); state.remaining = state.selectedMinutes * 60; broadcast() }

function execute(name, value) {
  if (name === 'start') start(); else if (name === 'pause') pause(); else if (name === 'toggle') state.status === 'running' ? pause() : start()
  else if (name === 'reset') reset(); else if (name === 'finish') finish(); else if (name === 'duration') setDuration(Number(value))
  else if (name === 'undo') undoPosition(); else if (name === 'redo') redoPosition()
  else if (name === 'toggleCountdown') { state.showCountdown = !state.showCountdown; broadcast() }
  else if (name === 'toggleClock') { state.showClock = !state.showClock; broadcast() }
  else if (name === 'toggleText') { state.showText = !state.showText; broadcast() }
  else if (name === 'toggleAlwaysOnTop') { state.alwaysOnTop = !state.alwaysOnTop; participantWindow?.setAlwaysOnTop(state.alwaysOnTop); broadcast() }
  else if (name === 'set') { Object.assign(state, value); if ('alwaysOnTop' in value) participantWindow?.setAlwaysOnTop(state.alwaysOnTop); broadcast() }
  return publicState()
}

function createWindows() {
  const work = screen.getPrimaryDisplay().workArea
  hostWindow = new BrowserWindow({ width: 410, height: Math.min(860, work.height), x: work.x + work.width - 430, y: work.y + 20, title: '靜心主持台', webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  const pw = Math.min(work.width - 470, (work.height - 80) * 16 / 9), ph = pw * 9 / 16
  participantWindow = new BrowserWindow({ width: Math.round(pw), height: Math.round(ph), x: work.x + 20, y: Math.round(work.y + (work.height - ph) / 2), frame: false, title: '靜心參與者畫面', backgroundColor: '#000000', webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  hostWindow.loadFile(path.join(__dirname, 'host.html')); participantWindow.loadFile(path.join(__dirname, 'participant.html'))
  participantWindow.webContents.on('context-menu', () => showParticipantContextMenu())
  hostWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault(); hostWindow.hide()
      if (process.platform === 'darwin') app.setActivationPolicy('accessory')
    }
  })
  participantWindow.on('close', event => {
    if (!isQuitting) { event.preventDefault(); participantWindow.hide() }
  })
}

function showHostWindow() {
  if (process.platform === 'darwin') app.setActivationPolicy('regular')
  hostWindow?.show(); hostWindow?.focus()
}
function showParticipantWindow() {
  participantWindow?.show(); participantWindow?.focus()
}
function quitApplication() { isQuitting = true; app.quit() }
function showParticipantContextMenu() {
  Menu.buildFromTemplate([{ label: '參與者畫面永遠置頂', type: 'checkbox', checked: state.alwaysOnTop, click: () => execute('toggleAlwaysOnTop') }]).popup({ window: participantWindow })
}

function installTray() {
  const iconPath = path.join(__dirname, '..', 'resources', process.platform === 'darwin' ? 'menubar-icon.png' : 'icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: process.platform === 'darwin' ? 18 : 20, height: process.platform === 'darwin' ? 18 : 20 })
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('靜心主持台')
  const trayMenu = Menu.buildFromTemplate([
    { label: '顯示主持台', click: showHostWindow },
    { label: '顯示參與者畫面', click: showParticipantWindow },
    { type: 'separator' },
    { label: '開始／繼續', click: start },
    { label: '暫停／繼續', click: () => state.status === 'running' ? pause() : start() },
    { label: '重新準備', click: reset },
    { label: '提早結束', click: finish },
    { type: 'separator' },
    { id: 'show-countdown', label: '顯示倒數計時', type: 'checkbox', checked: state.showCountdown, click: () => execute('toggleCountdown') },
    { id: 'show-clock', label: '顯示目前時間', type: 'checkbox', checked: state.showClock, click: () => execute('toggleClock') },
    { id: 'show-text', label: '顯示主文字', type: 'checkbox', checked: state.showText, click: () => execute('toggleText') },
    { id: 'always-on-top', label: '參與者畫面永遠置頂', type: 'checkbox', checked: state.alwaysOnTop, click: () => execute('toggleAlwaysOnTop') },
    { type: 'separator' },
    { label: '結束靜心主持台', click: quitApplication },
  ])
  trayVisibilityItems.countdown = trayMenu.getMenuItemById('show-countdown')
  trayVisibilityItems.clock = trayMenu.getMenuItemById('show-clock')
  trayVisibilityItems.text = trayMenu.getMenuItemById('show-text')
  trayVisibilityItems.alwaysOnTop = trayMenu.getMenuItemById('always-on-top')
  tray.setContextMenu(trayMenu)
  tray.on('click', showHostWindow)
  tray.on('double-click', showHostWindow)
}

function installMenu() {
  const template = []
  if (process.platform === 'darwin') template.push({ label: app.name, submenu: [
    { role: 'about', label: '關於靜心主持台' }, { type: 'separator' },
    { role: 'hide', label: '隱藏靜心主持台' }, { role: 'hideOthers', label: '隱藏其他程式' }, { role: 'unhide', label: '全部顯示' },
    { type: 'separator' }, { label: '結束靜心主持台', accelerator: 'Command+Q', click: quitApplication }
  ] })
  template.push(
    { label: '檔案', submenu: [
      { label: process.platform === 'darwin' ? '將主持台收進選單列' : '隱藏主持台到系統匣', click: () => { hostWindow?.hide(); if (process.platform === 'darwin') app.setActivationPolicy('accessory') } },
      { label: '關閉目前視窗', accelerator: 'CmdOrCtrl+W', role: 'close' },
      { type: 'separator' }, { label: '結束', accelerator: process.platform === 'darwin' ? undefined : 'Alt+F4', click: quitApplication }
    ] },
    { label: '編輯', submenu: [{ label: '還原物件位置', accelerator: 'CmdOrCtrl+Z', click: undoPosition }, { label: '重做物件位置', accelerator: 'CmdOrCtrl+Shift+Z', click: redoPosition }] },
    { label: '控制', submenu: [
      { label: '開始／繼續', accelerator: 'Enter', click: start }, { label: '暫停／繼續', accelerator: 'Space', click: () => state.status === 'running' ? pause() : start() },
      { label: '重新準備', accelerator: 'CmdOrCtrl+R', click: reset }, { label: '提早結束', accelerator: 'Esc', click: finish },
      { type: 'separator' },
      { label: '顯示／隱藏倒數計時', click: () => execute('toggleCountdown') },
      { label: '顯示／隱藏目前時間', click: () => execute('toggleClock') },
      { label: '顯示／隱藏主文字', click: () => execute('toggleText') },
      { label: '切換參與者畫面永遠置頂', click: () => execute('toggleAlwaysOnTop') },
      { type: 'separator' }, { label: '切換參與者全螢幕', accelerator: 'CmdOrCtrl+Shift+F', click: () => participantWindow?.setFullScreen(!participantWindow.isFullScreen()) }
    ]}
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function startAPI() {
  const remote = require('fs').readFileSync(path.join(__dirname, 'remote.html'))
  apiServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/' || url.pathname === '/remote') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(remote) }
    const routes = { '/api/start': 'start', '/api/pause': 'pause', '/api/toggle': 'toggle', '/api/reset': 'reset', '/api/finish': 'finish', '/api/toggle-countdown': 'toggleCountdown', '/api/toggle-clock': 'toggleClock', '/api/toggle-text': 'toggleText', '/api/toggle-always-on-top': 'toggleAlwaysOnTop' }
    if (url.pathname === '/api/duration') execute('duration', Number(url.searchParams.get('minutes')))
    else if (routes[url.pathname]) execute(routes[url.pathname])
    else if (url.pathname !== '/api/state') { res.writeHead(404); return res.end('{}') }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(publicState()))
  }).listen(4747, '0.0.0.0')
}

ipcMain.handle('state:get', () => publicState())
ipcMain.handle('network:addresses', () => ['127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal).map(x => x.address)])
ipcMain.handle('fonts:list', () => listLocalFonts())
ipcMain.handle('browser:open', (_event, url) => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Unsupported URL')
  return shell.openExternal(parsed.href)
})
ipcMain.handle('command', (_e, name, value) => execute(name, value))
ipcMain.handle('file:choose', async (_e, kind) => {
  const filters = kind === 'image' ? [{ name: '圖片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] : [{ name: '音訊', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] }]
  const r = await dialog.showOpenDialog(hostWindow, { properties: ['openFile'], filters }); return r.canceled ? '' : pathToFileURL(r.filePaths[0]).href
})
ipcMain.handle('files:choose', async (_e, kind) => {
  const filters = [{ name: '音訊', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] }]
  const r = await dialog.showOpenDialog(hostWindow, { properties: ['openFile', 'multiSelections'], filters })
  return r.canceled ? [] : r.filePaths.map(file => pathToFileURL(file).href)
})
ipcMain.on('position:drag', (_e, target, position, phase) => {
  if (phase === 'begin') dragSnapshot = snapshotPositions()
  if (position) state[`${target}Position`] = position
  if (phase === 'end' && dragSnapshot) { undo.push(dragSnapshot); redo.length = 0; dragSnapshot = null }
  broadcast()
})
ipcMain.on('participant:window-drag', (_e, point, phase) => {
  if (phase === 'begin') windowDragSnapshot = { point, bounds: participantWindow?.getBounds() }
  else if (phase === 'move' && windowDragSnapshot && participantWindow) participantWindow.setPosition(Math.round(windowDragSnapshot.bounds.x + point.x - windowDragSnapshot.point.x), Math.round(windowDragSnapshot.bounds.y + point.y - windowDragSnapshot.point.y), false)
  else if (phase === 'end') windowDragSnapshot = null
})
ipcMain.on('participant:toggle-fullscreen', () => participantWindow?.setFullScreen(!participantWindow.isFullScreen()))

app.whenReady().then(() => {
  const builtInChime = pathToFileURL(path.join(__dirname, '..', 'resources', 'BuiltInChime.m4a')).href
  state.opening.file = builtInChime; state.closing.file = builtInChime
  createWindows(); installTray(); installMenu(); startAPI(); broadcast()
})
app.on('window-all-closed', () => {})
app.on('before-quit', () => { isQuitting = true; clearInterval(timer); apiServer?.close(); globalShortcut.unregisterAll(); tray?.destroy() })

module.exports = { networkAddresses: () => Object.values(os.networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal).map(x => x.address) }
