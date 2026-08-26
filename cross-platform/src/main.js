const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, screen, Tray, nativeImage, shell } = require('electron')
const http = require('http')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { pathToFileURL } = require('url')

let hostWindow, participantWindow, reminderWindow, temporaryWindow, marqueeWindow, imageWindow, reminderControlWindow, timer, reminderTimer, apiServer, tray
let isQuitting = false
const eventClients = new Set()
let reminderManual = null
let reminderEffectFullscreen = false, reminderRestoreBounds = null, reminderEffectTransitioning = false
const reminderHiddenUntil = { timed: 0, temporary: 0, marquee: 0, image: 0 }
const reminderPreviewUntil = { timed: 0, temporary: 0, marquee: 0, image: 0 }
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
  reminder: {
    timedEnabled: false, temporaryEnabled: false, marqueeEnabled: false, imageEnabled: false,
    boundToMeditation: false, status: 'idle', elapsed: 0, startedAt: null,
    intervalMinutes: 10, durationSeconds: 10, fadeInSeconds: 3, fadeOutSeconds: 2,
    text: '已進行', showTime: true, timeFormat: 'minutes', sameLine: true, gap: 16,
    effect: 'blinkZoom', overlayColor: '#b40000', overlayOpacity: .45,
    textStyle: { font: 'system-ui', size: 72, color: '#ffffff', stroke: true, strokeWidth: 2, strokeColor: '#000000', glow: true, glowSize: 16, glowColor: '#ffffff' },
    timeStyle: { font: 'system-ui', size: 64, color: '#ffffff', stroke: true, strokeWidth: 2, strokeColor: '#000000', glow: true, glowSize: 16, glowColor: '#ffffff' },
    manualResetsInterval: false,
    temporary: { active: false, text: '請保持安靜', durationSeconds: 8, startedAt: null, stoppingAt: null, position: 'center', fadeIn: true, fadeInSeconds: 1, fadeOut: true, fadeOutSeconds: 1, style: { font: 'system-ui', size: 72, color: '#ffffff', stroke: false, strokeWidth: 2, strokeColor: '#000000', glow: false, glowSize: 12, glowColor: '#ffffff' } },
    marquee: { active: false, text: '活動即將開始', layout: 'horizontal', direction: 'rtl', speed: 80, position: 'bottom', background: '#000000', opacity: .55, startedAt: null, stoppingAt: null, fadeIn: true, fadeInSeconds: 1, fadeOut: true, fadeOutSeconds: 1, style: { font: 'system-ui', size: 46, color: '#ffffff', stroke: false, strokeWidth: 2, strokeColor: '#000000', glow: false, glowSize: 12, glowColor: '#ffffff' } },
    image: { active: false, url: '', size: 30, durationSeconds: 10, startedAt: null, effect: 'fade' },
  },
}
let dragSnapshot = null
let windowDragSnapshot = null
const reminderDragSnapshots = new Map()
const reminderResizeSnapshots = new Map()
let fontCache = null
let fontRecordCache = null

function runFile(command, args) { return new Promise((resolve, reject) => execFile(command, args, { maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout))) }
async function listLocalFontRecords() {
  if (fontRecordCache) return fontRecordCache
  let records = []
  try {
    if (process.platform === 'darwin') {
      try {
        records = JSON.parse(await runFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); var names=ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFonts),seen={}; JSON.stringify(names.map(function(n){var f=$.NSFont.fontWithNameSize(n,12),label=ObjC.unwrap(f.displayName)||ObjC.unwrap(f.familyName)||n;return {value:n,label:String(label).replace(/:1\\.0$/,"")}}).filter(function(x){if(seen[x.label])return false;seen[x.label]=true;return true}))']))
      } catch {
        const data = JSON.parse(await runFile('/usr/sbin/system_profiler', ['SPFontsDataType', '-json', '-detailLevel', 'mini']))
        records = (data.SPFontsDataType || []).flatMap(font => (font.typefaces || []).map(face => ({ value: face._name || face.fullname || face.family, label: face.fullname || face.family }))).filter(record => record.value && record.label)
      }
    } else if (process.platform === 'win32') {
      const roots = [['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'], ['query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']]
      const outputs = await Promise.all(roots.map(args => runFile('reg.exe', args).catch(() => '')))
      records = outputs.join('\n').split(/\r?\n/).map(line => line.match(/^\s{2,}(.+?)\s+REG_\w+\s+/)?.[1]?.replace(/\s*\((TrueType|OpenType)\)\s*$/i, '')).filter(Boolean).map(name => ({ value: name, label: name }))
    } else records = (await runFile('fc-list', [':', 'family'])).split(/\r?\n/).flatMap(line => line.split(',')).map(x => x.trim()).filter(Boolean).map(name => ({ value: name, label: name }))
  } catch (error) { console.error('Unable to list local fonts:', error.message) }
  const unique = new Map([['系統預設字體', { value: '系統預設字體', label: '系統預設字體' }]])
  for (const record of records) if (record?.value && record?.label && !record.label.startsWith('.')) unique.set(record.value, record)
  fontRecordCache = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))
  return fontRecordCache
}
async function listLocalFonts() {
  if (fontCache) return fontCache
  fontCache = (await listLocalFontRecords()).map(record => record.label)
  return fontCache
}

const snapshotPositions = () => JSON.parse(JSON.stringify({ clockPosition: state.clockPosition, textPosition: state.textPosition, countdownPosition: state.countdownPosition }))
function applyPositions(p) { Object.assign(state, JSON.parse(JSON.stringify(p))); broadcast() }
function undoPosition() { const p = undo.pop(); if (!p) return; redo.push(snapshotPositions()); applyPositions(p) }
function redoPosition() { const p = redo.pop(); if (!p) return; undo.push(snapshotPositions()); applyPositions(p) }

const formatTime = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
function reminderElapsed() {
  const r = state.reminder
  if (r.boundToMeditation) return Math.max(0, state.selectedMinutes * 60 - state.remaining)
  return r.status === 'running' && r.startedAt ? r.elapsed + Math.floor((Date.now() - r.startedAt) / 1000) : r.elapsed
}
function reminderTimeText(seconds) {
  const minutes = Math.floor(seconds / 60)
  if (state.reminder.timeFormat === 'hours' && minutes >= 60) return `${Math.floor(minutes / 60)}小時${minutes % 60 ? `${minutes % 60}分鐘` : ''}`
  return `${minutes}分鐘`
}
function reminderPresentation(elapsed) {
  const r = state.reminder, now = Date.now(), interval = Math.max(1, r.intervalMinutes) * 60
  const previousDue = Math.floor(elapsed / interval) * interval
  const nextDue = previousDue + interval
  const previousOffset = elapsed - previousDue
  const nextOffset = elapsed - nextDue
  let due = 0, offset = 0
  if (previousDue > 0 && previousOffset <= r.durationSeconds + r.fadeOutSeconds) { due = previousDue; offset = previousOffset }
  else if (nextDue - elapsed <= r.fadeInSeconds) { due = nextDue; offset = nextOffset }
  let timed = due ? { kind: 'timed', phase: offset < 0 ? 'fadeIn' : offset <= r.durationSeconds ? 'effect' : 'fadeOut', progress: offset, text: r.text, timeText: reminderTimeText(due), effect: r.effect } : null
  if (reminderManual) {
    const seconds = (now - reminderManual.effectAt) / 1000
    if (now <= reminderManual.hideAt) timed = { kind: 'manual', phase: seconds < 0 ? 'fadeIn' : seconds <= r.durationSeconds ? 'effect' : 'fadeOut', progress: seconds, text: r.text, timeText: reminderTimeText(elapsed), effect: r.effect }
    else reminderManual = null
  }
  if (now < reminderHiddenUntil.timed) timed = null
  const temp = r.temporary
  const tempElapsed = temp.startedAt ? (now - temp.startedAt) / 1000 : 0
  const tempFadeIn = temp.fadeIn ? temp.fadeInSeconds : 0
  const tempFadeOut = temp.fadeOut ? temp.fadeOutSeconds : 0
  const tempStopping = temp.stoppingAt ? (now - temp.stoppingAt) / 1000 : null
  let temporaryPhase = null
  if (temp.active) {
    if (tempStopping !== null) temporaryPhase = tempStopping < tempFadeOut ? 'fadeOut' : null
    else if (tempElapsed < tempFadeIn) temporaryPhase = 'fadeIn'
    else if (tempElapsed < tempFadeIn + temp.durationSeconds) temporaryPhase = 'effect'
    else if (tempElapsed < tempFadeIn + temp.durationSeconds + tempFadeOut) temporaryPhase = 'fadeOut'
    if (!temporaryPhase) { temp.active=false; temp.stoppingAt=null }
  }
  const temporaryVisible = !!temporaryPhase
  const mq = r.marquee
  const marqueeStopping = mq.stoppingAt ? (now - mq.stoppingAt) / 1000 : null
  let marqueePhase = null
  if (mq.active) {
    if (marqueeStopping !== null) marqueePhase = marqueeStopping < (mq.fadeOut ? mq.fadeOutSeconds : 0) ? 'fadeOut' : null
    else if (mq.fadeIn && mq.startedAt && (now - mq.startedAt) / 1000 < mq.fadeInSeconds) marqueePhase = 'fadeIn'
    else marqueePhase = 'effect'
    if (!marqueePhase) { mq.active=false; mq.stoppingAt=null }
  }
  const imageVisible = r.image.active && now - r.image.startedAt < r.image.durationSeconds * 1000
  if (r.image.active && !imageVisible) r.image.active = false
  const nextIn = interval - (elapsed % interval || 0)
  return { elapsedText: formatTime(elapsed), timeText: reminderTimeText(elapsed), nextIn, nextText: formatTime(nextIn), timed, temporaryVisible, temporaryPhase, marqueePhase, imageVisible }
}
function publicState() {
  const elapsed = Math.max(0, state.selectedMinutes * 60 - state.remaining)
  const reminderSeconds = reminderElapsed()
  const result = { ...state, reminder: { ...state.reminder, elapsed: reminderSeconds, ...reminderPresentation(reminderSeconds) }, reminderPreview: Object.fromEntries(Object.entries(reminderPreviewUntil).map(([mode,until])=>[mode,Date.now()<until])), state: state.status, remainingText: formatTime(state.remaining), elapsed, elapsedText: formatTime(elapsed), progress: 1 - state.remaining / Math.max(1, state.selectedMinutes * 60) }
  if (!app.isPackaged) result.debugReminderBounds = { marquee: marqueeWindow?.getBounds(), image: imageWindow?.getBounds() }
  return result
}
function broadcast() {
  const s = publicState(); hostWindow?.webContents.send('state', s); participantWindow?.webContents.send('state', s)
  const needsFullScreen = s.reminder.effect === 'red' && !!s.reminder.timed
  if (reminderWindow && needsFullScreen !== reminderEffectFullscreen) {
    reminderEffectFullscreen = needsFullScreen
    reminderEffectTransitioning = true
    reminderWindow.hide()
    if (needsFullScreen) {
      reminderRestoreBounds = reminderWindow.getBounds()
      reminderWindow.setBounds(screen.getDisplayMatching(reminderRestoreBounds).bounds)
      reminderWindow.setAlwaysOnTop(true, 'screen-saver')
    } else {
      if (reminderRestoreBounds) reminderWindow.setBounds(reminderRestoreBounds)
      reminderWindow.setAlwaysOnTop(true, 'floating')
    }
    setTimeout(() => { reminderEffectTransitioning=false; syncReminderVisibility() }, 60)
  }
  syncReminderVisibility()
  for (const client of eventClients) client.write(`data: ${JSON.stringify(s)}\n\n`)
  if (trayVisibilityItems.countdown) trayVisibilityItems.countdown.checked = state.showCountdown
  if (trayVisibilityItems.clock) trayVisibilityItems.clock.checked = state.showClock
  if (trayVisibilityItems.text) trayVisibilityItems.text.checked = state.showText
  if (trayVisibilityItems.alwaysOnTop) trayVisibilityItems.alwaysOnTop.checked = state.alwaysOnTop
  if (trayVisibilityItems.reminderTimed) trayVisibilityItems.reminderTimed.checked = state.reminder.timedEnabled
  if (trayVisibilityItems.reminderTemporary) trayVisibilityItems.reminderTemporary.checked = state.reminder.temporaryEnabled
  if (trayVisibilityItems.reminderMarquee) trayVisibilityItems.reminderMarquee.checked = state.reminder.marqueeEnabled
  if (trayVisibilityItems.reminderImage) trayVisibilityItems.reminderImage.checked = state.reminder.imageEnabled
}
function syncReminderVisibility() {
  const r = state.reminder
  const now = Date.now()
  for (const [mode, win, enabled] of [['timed',reminderWindow,r.timedEnabled],['temporary',temporaryWindow,r.temporaryEnabled],['marquee',marqueeWindow,r.marqueeEnabled],['image',imageWindow,r.imageEnabled]]) {
    if (!win || win.isDestroyed()) continue
    const transitioning = mode === 'timed' && reminderEffectTransitioning
    if (enabled && !transitioning && now >= reminderHiddenUntil[mode]) { if (!win.isVisible()) win.showInactive() } else if (win.isVisible()) win.hide()
  }
}

function reminderStart() {
  const r = state.reminder
  reminderHiddenUntil.timed = 0
  if (r.status !== 'running') { const now=Date.now(); r.startedAt=now; r.status='running'; reminderManual={effectAt:now-r.durationSeconds*1000,hideAt:now+r.fadeOutSeconds*1000} }
  broadcast()
}
function reminderPause() { const r=state.reminder; r.elapsed=reminderElapsed(); r.startedAt=null; r.status='paused'; broadcast() }
function reminderReset() { const r=state.reminder; r.elapsed=0; r.startedAt=null; r.status='idle'; reminderManual=null; reminderHiddenUntil.timed=0; broadcast() }
function reminderTrigger() { const r=state.reminder,now=Date.now(); reminderHiddenUntil.timed=0; reminderManual={effectAt:now+r.fadeInSeconds*1000,hideAt:now+(r.fadeInSeconds+r.durationSeconds+r.fadeOutSeconds)*1000}; broadcast() }
function hideAllReminders(seconds = 5) {
  const until = Date.now() + seconds * 1000
  for (const mode of Object.keys(reminderHiddenUntil)) reminderHiddenUntil[mode] = until
  reminderManual=null; state.reminder.temporary.active=false; state.reminder.marquee.active=false; state.reminder.image.active=false
  broadcast()
}
function dismissReminderWindow(win) {
  const entries = [[reminderWindow,'timed'],[temporaryWindow,'temporary'],[marqueeWindow,'marquee'],[imageWindow,'image']]
  const mode = entries.find(([window]) => window === win)?.[1]
  if (!mode) return false
  reminderHiddenUntil[mode] = Date.now() + Math.max(5, state.reminder.durationSeconds + state.reminder.fadeOutSeconds) * 1000
  if (mode === 'timed') reminderManual = null
  if (mode === 'temporary') state.reminder.temporary.active = false
  if (mode === 'marquee') state.reminder.marquee.active = false
  if (mode === 'image') state.reminder.image.active = false
  broadcast()
  return true
}
function handleEscape() {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused === reminderControlWindow) return hideAllReminders()
  if (!dismissReminderWindow(focused)) finish()
}
function start() {
  if (state.status === 'ready' || state.status === 'finished') state.remaining = state.selectedMinutes * 60
  state.status = 'running'; clearInterval(timer)
  if (state.reminder.boundToMeditation) state.reminder.status = 'running'
  timer = setInterval(() => { if (state.status !== 'running') return; if (state.remaining > 0) state.remaining--; else finish(); broadcast() }, 1000)
  broadcast()
}
function pause() { if (state.status === 'running') state.status = 'paused'; if (state.reminder.boundToMeditation) state.reminder.status = 'paused'; broadcast() }
function reset() { clearInterval(timer); state.status = 'ready'; state.remaining = state.selectedMinutes * 60; if (state.reminder.boundToMeditation) { state.reminder.status='idle'; state.reminder.elapsed=0; state.reminder.startedAt=null }; broadcast() }
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
  else if (name === 'showReminderControl') showReminderControl()
  else if (name === 'set') { Object.assign(state, value); if ('alwaysOnTop' in value) participantWindow?.setAlwaysOnTop(state.alwaysOnTop); broadcast() }
  return publicState()
}

function createWindows() {
  const work = screen.getPrimaryDisplay().workArea
  hostWindow = new BrowserWindow({ width: 410, height: Math.min(860, work.height), x: work.x + work.width - 430, y: work.y + 20, title: '靜心主持台', webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  const pw = Math.min(work.width - 470, (work.height - 80) * 16 / 9), ph = pw * 9 / 16
  participantWindow = new BrowserWindow({ width: Math.round(pw), height: Math.round(ph), x: work.x + 20, y: Math.round(work.y + (work.height - ph) / 2), frame: false, resizable: false, maximizable: false, fullscreenable: true, title: '靜心參與者畫面', backgroundColor: '#000000', webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  const createReminder = (mode, title, bounds) => {
    const win = new BrowserWindow({ ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, hasShadow: false, resizable: true, minWidth: 280, minHeight: 120, maxWidth: work.width, maxHeight: work.height, title, webPreferences: { preload: path.join(__dirname, 'reminder-preload.js') } })
    win.loadURL(`http://127.0.0.1:4747/reminder?mode=${mode}`)
    win.on('close', event => { if (!isQuitting) { event.preventDefault(); win.hide() } })
    return win
  }
  reminderWindow = createReminder('timed', 'ZenTime 定時提醒', { width: 760, height: 260, x: work.x + 80, y: work.y + 70 })
  temporaryWindow = createReminder('temporary', 'ZenTime 臨時文字提醒', { width: Math.min(900, work.width - 120), height: Math.min(420, work.height - 120), x: work.x + 150, y: work.y + 300 })
  marqueeWindow = createReminder('marquee', 'ZenTime 跑馬燈提醒', { width: Math.min(900, work.width - 120), height: 320, x: work.x + 60, y: work.y + work.height - 380 })
  imageWindow = createReminder('image', 'ZenTime PNG 圖片提醒', { width: 420, height: 320, x: work.x + work.width - 500, y: work.y + 110 })
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

function showReminderControl() {
  if (!reminderControlWindow || reminderControlWindow.isDestroyed()) {
    const work = screen.getPrimaryDisplay().workArea
    reminderControlWindow = new BrowserWindow({ width: 430, height: Math.min(900, work.height - 40), title: '時間提醒控制' })
    reminderControlWindow.loadURL('http://127.0.0.1:4747/reminder-control')
    reminderControlWindow.on('closed', () => { reminderControlWindow = null })
  }
  reminderControlWindow.show(); reminderControlWindow.focus(); syncReminderVisibility()
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

function setReminderEnabled(mode, enabled) {
  state.reminder[`${mode}Enabled`] = enabled
  reminderHiddenUntil[mode] = 0
  if (enabled) reminderPreviewUntil[mode] = Date.now() + 3000
  broadcast()
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
    { label: '時間提醒', submenu: [
      { label: '開啟提醒控制台', click: showReminderControl },
      { type: 'separator' },
      { id: 'reminder-timed', label: '啟用定時提醒視窗', type: 'checkbox', checked: state.reminder.timedEnabled, click: item => setReminderEnabled('timed', item.checked) },
      { id: 'reminder-temporary', label: '啟用臨時提醒視窗', type: 'checkbox', checked: state.reminder.temporaryEnabled, click: item => setReminderEnabled('temporary', item.checked) },
      { id: 'reminder-marquee', label: '啟用跑馬燈視窗', type: 'checkbox', checked: state.reminder.marqueeEnabled, click: item => setReminderEnabled('marquee', item.checked) },
      { id: 'reminder-image', label: '啟用圖片提醒視窗', type: 'checkbox', checked: state.reminder.imageEnabled, click: item => setReminderEnabled('image', item.checked) },
      { type: 'separator' },
      { label: '開始／繼續提醒計時', click: reminderStart },
      { label: '暫停／繼續提醒計時', click: () => state.reminder.status === 'running' ? reminderPause() : reminderStart() },
      { label: '重設提醒計時', click: reminderReset },
      { label: '立即中途提醒', click: reminderTrigger },
      { label: '顯示／取消臨時提醒', click: () => {
        const item = state.reminder.temporary
        if (item.active) item.stoppingAt = item.fadeOut ? Date.now() : null, item.active = !!item.fadeOut
        else item.active = true, item.startedAt = Date.now(), item.stoppingAt = null
        broadcast()
      } },
      { label: '顯示／取消跑馬燈', click: () => {
        const item = state.reminder.marquee
        if (item.active) item.stoppingAt = item.fadeOut ? Date.now() : null, item.active = !!item.fadeOut
        else item.active = true, item.startedAt = Date.now(), item.stoppingAt = null
        broadcast()
      } },
      { label: '顯示／取消圖片提醒', click: () => { state.reminder.image.active = !state.reminder.image.active; state.reminder.image.startedAt = Date.now(); broadcast() } },
      { label: '立即隱藏所有提醒', click: () => hideAllReminders() },
    ] },
    { type: 'separator' },
    { label: '結束靜心主持台', click: quitApplication },
  ])
  trayVisibilityItems.countdown = trayMenu.getMenuItemById('show-countdown')
  trayVisibilityItems.clock = trayMenu.getMenuItemById('show-clock')
  trayVisibilityItems.text = trayMenu.getMenuItemById('show-text')
  trayVisibilityItems.alwaysOnTop = trayMenu.getMenuItemById('always-on-top')
  trayVisibilityItems.reminderTimed = trayMenu.getMenuItemById('reminder-timed')
  trayVisibilityItems.reminderTemporary = trayMenu.getMenuItemById('reminder-temporary')
  trayVisibilityItems.reminderMarquee = trayMenu.getMenuItemById('reminder-marquee')
  trayVisibilityItems.reminderImage = trayMenu.getMenuItemById('reminder-image')
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
      { label: '重新準備', accelerator: 'CmdOrCtrl+R', click: reset }, { label: '提早結束／隱藏目前提醒', accelerator: 'Esc', click: handleEscape },
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
  const staticFiles = { '/reminder': ['reminder.html','text/html; charset=utf-8'], '/reminder.css':['reminder.css','text/css'], '/reminder.js':['reminder.js','text/javascript'], '/reminder-control':['reminder-control.html','text/html; charset=utf-8'], '/reminder-control.js':['reminder-control.js','text/javascript'], '/common.css':['common.css','text/css'] }
  const readBody = req => new Promise(resolve => { let data=''; req.on('data', c => data += c); req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } }) })
  const merge = (target, source) => { for (const [key,value] of Object.entries(source || {})) value && typeof value === 'object' && !Array.isArray(value) ? merge(target[key] ||= {}, value) : target[key] = value }
  apiServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/' || url.pathname === '/remote') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(remote) }
    if (staticFiles[url.pathname]) { const [file,type]=staticFiles[url.pathname]; res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}); return require('fs').createReadStream(path.join(__dirname,file)).pipe(res) }
    if (url.pathname === '/api/fonts') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(await listLocalFontRecords())) }
    if (url.pathname === '/api/events') { res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','Access-Control-Allow-Origin':'*'}); eventClients.add(res); res.write(`data: ${JSON.stringify(publicState())}\n\n`); return req.on('close',()=>eventClients.delete(res)) }
    const routes = { '/api/start': 'start', '/api/pause': 'pause', '/api/toggle': 'toggle', '/api/reset': 'reset', '/api/finish': 'finish', '/api/toggle-countdown': 'toggleCountdown', '/api/toggle-clock': 'toggleClock', '/api/toggle-text': 'toggleText', '/api/toggle-always-on-top': 'toggleAlwaysOnTop' }
    if (url.pathname === '/api/duration') execute('duration', Number(url.searchParams.get('minutes')))
    else if (routes[url.pathname]) execute(routes[url.pathname])
    else if (url.pathname === '/api/reminder/config') {
      const previous = Object.fromEntries(['timed','temporary','marquee','image'].map(mode => [mode, state.reminder[`${mode}Enabled`]]))
      merge(state.reminder, await readBody(req))
      for (const mode of Object.keys(previous)) if (!previous[mode] && state.reminder[`${mode}Enabled`]) reminderPreviewUntil[mode] = Date.now() + 3000
      broadcast()
    }
    else if (url.pathname === '/api/reminder/preview') { const {mode}=await readBody(req);if(mode in reminderPreviewUntil)reminderPreviewUntil[mode]=Date.now()+900;broadcast() }
    else if (url.pathname === '/api/reminder/start') reminderStart()
    else if (url.pathname === '/api/reminder/pause') reminderPause()
    else if (url.pathname === '/api/reminder/reset') reminderReset()
    else if (url.pathname === '/api/reminder/trigger') reminderTrigger()
    else if (url.pathname === '/api/reminder/temp/show') { reminderHiddenUntil.temporary=0;merge(state.reminder.temporary,await readBody(req));state.reminder.temporary.active=true;state.reminder.temporary.startedAt=Date.now();state.reminder.temporary.stoppingAt=null;broadcast() }
    else if (url.pathname === '/api/reminder/temp/hide') { const t=state.reminder.temporary;if(t.active&&t.fadeOut)t.stoppingAt=Date.now();else t.active=false;broadcast() }
    else if (url.pathname === '/api/reminder/marquee/show') { reminderHiddenUntil.marquee=0;merge(state.reminder.marquee,await readBody(req));state.reminder.marquee.active=true;state.reminder.marquee.startedAt=Date.now();state.reminder.marquee.stoppingAt=null;broadcast() }
    else if (url.pathname === '/api/reminder/marquee/hide') { const m=state.reminder.marquee;if(m.active&&m.fadeOut)m.stoppingAt=Date.now();else m.active=false;broadcast() }
    else if (url.pathname === '/api/reminder/image/show') { reminderHiddenUntil.image=0;merge(state.reminder.image,await readBody(req));state.reminder.image.active=true;state.reminder.image.startedAt=Date.now();broadcast() }
    else if (url.pathname === '/api/reminder/image/hide') { state.reminder.image.active=false;broadcast() }
    else if (url.pathname === '/api/reminder/hide-all') hideAllReminders()
    else if (url.pathname === '/api/reminder/control/show') showReminderControl()
    else if (url.pathname !== '/api/state') { res.writeHead(404); return res.end('{}') }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(publicState()))
  })
  apiServer.on('error', error => {
    const message = error.code === 'EADDRINUSE' ? '另一個靜心主持台仍在執行中。請先從選單列或 Dock 完整結束舊版本，再重新開啟。' : `網頁控制服務無法啟動：${error.message}`
    dialog.showMessageBox({ type: 'warning', title: '靜心主持台無法啟動', message }).finally(() => app.quit())
  })
  apiServer.listen(4747, '0.0.0.0')
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
ipcMain.on('participant:window-drag', (_e, _point, phase) => {
  const cursor = screen.getCursorScreenPoint()
  const validPoint = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)
  if (phase === 'begin' && validPoint && participantWindow) windowDragSnapshot = { point: cursor, bounds: participantWindow.getBounds() }
  else if (phase === 'move' && validPoint && windowDragSnapshot && participantWindow) {
    const x = Math.round(windowDragSnapshot.bounds.x + cursor.x - windowDragSnapshot.point.x)
    const y = Math.round(windowDragSnapshot.bounds.y + cursor.y - windowDragSnapshot.point.y)
    if (Number.isSafeInteger(x) && Number.isSafeInteger(y) && Math.abs(x) < 2147483647 && Math.abs(y) < 2147483647) {
      const width = windowDragSnapshot.bounds.width, height = windowDragSnapshot.bounds.height
      try { participantWindow.setBounds({ x, y, width, height }, false) } catch (error) { console.warn('Ignored invalid participant window bounds:', x, y, width, height, error.message) }
    }
  }
  else if (phase === 'end') windowDragSnapshot = null
})
ipcMain.on('participant:toggle-fullscreen', () => participantWindow?.setFullScreen(!participantWindow.isFullScreen()))
ipcMain.on('reminder:window-drag', (event, point, phase) => {
  const win = BrowserWindow.fromWebContents(event.sender), key = event.sender.id
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const validPoint = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)
  if (phase === 'begin' && validPoint) reminderDragSnapshots.set(key, { point: cursor, bounds: win.getBounds() })
  else if (phase === 'move' && validPoint && reminderDragSnapshots.has(key)) {
    const drag = reminderDragSnapshots.get(key)
    const x = Math.round(drag.bounds.x + cursor.x - drag.point.x)
    const y = Math.round(drag.bounds.y + cursor.y - drag.point.y)
    if (Number.isSafeInteger(x) && Number.isSafeInteger(y) && Math.abs(x) < 2147483647 && Math.abs(y) < 2147483647) {
      try { win.setPosition(x, y, false) } catch (error) { console.warn('Ignored invalid reminder window position:', x, y, error.message) }
    }
  }
  else if (phase === 'end') reminderDragSnapshots.delete(key)
})
ipcMain.on('reminder:window-resize', (event, edge, point, phase) => {
  const win = BrowserWindow.fromWebContents(event.sender), key = event.sender.id
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const validPoint = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)
  const validEdge = /^(n|s|e|w|ne|nw|se|sw)$/.test(edge || '')
  if (phase === 'begin' && validPoint && validEdge) {
    reminderResizeSnapshots.set(key, { edge, point: cursor, bounds: win.getBounds() })
    return
  }
  if (phase === 'end') { reminderResizeSnapshots.delete(key); return }
  const resize = reminderResizeSnapshots.get(key)
  if (phase !== 'move' || !validPoint || !resize) return
  const dx = Math.round(cursor.x - resize.point.x), dy = Math.round(cursor.y - resize.point.y)
  const original = resize.bounds
  const display = screen.getDisplayMatching(original)
  const work = display.workArea
  const minWidth = 280, minHeight = 120
  const maxWidth = Math.max(minWidth, work.width), maxHeight = Math.max(minHeight, work.height)
  let left = original.x, top = original.y, right = original.x + original.width, bottom = original.y + original.height
  if (resize.edge.includes('w')) left = Math.min(right - minWidth, original.x + dx)
  if (resize.edge.includes('e')) right = Math.max(left + minWidth, original.x + original.width + dx)
  if (resize.edge.includes('n')) top = Math.min(bottom - minHeight, original.y + dy)
  if (resize.edge.includes('s')) bottom = Math.max(top + minHeight, original.y + original.height + dy)
  left = Math.max(work.x, left); top = Math.max(work.y, top)
  right = Math.min(work.x + work.width, right); bottom = Math.min(work.y + work.height, bottom)
  if (right - left > maxWidth) right = left + maxWidth
  if (bottom - top > maxHeight) bottom = top + maxHeight
  const bounds = { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) }
  if (bounds.width < minWidth || bounds.height < minHeight) return
  try { win.setBounds(bounds, false) } catch (error) { console.warn('Ignored invalid reminder resize:', bounds, error.message) }
})
ipcMain.on('reminder:content-size', (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !payload || typeof payload !== 'object') return
  const current = win.getBounds()
  const work = screen.getDisplayMatching(current).workArea
  let width = current.width, height = current.height
  if (payload.mode === 'marquee') {
    const thickness = Math.max(48, Math.min(360, Math.round(Number(payload.thickness) || 96)))
    if (payload.layout === 'vertical') { width = thickness; height = Math.min(720, Math.max(420, Math.round(work.height * .68))) }
    else { width = Math.min(1100, Math.max(560, Math.round(work.width * .62))); height = thickness }
  } else if (payload.mode === 'image') {
    const naturalWidth = Number(payload.naturalWidth), naturalHeight = Number(payload.naturalHeight), size = Math.max(5, Math.min(100, Number(payload.size) || 30)) / 100
    if (!(naturalWidth > 0 && naturalHeight > 0)) return
    const scale = Math.min((work.width * size) / naturalWidth, (work.height * size) / naturalHeight)
    const frameScale = payload.effect === 'pulse' ? 1.1 : 1
    width = Math.max(40, Math.round(naturalWidth * scale * frameScale)); height = Math.max(40, Math.round(naturalHeight * scale * frameScale))
  } else return
  if (width === current.width && height === current.height) return
  const x = Math.round(current.x + (current.width - width) / 2), y = Math.round(current.y + (current.height - height) / 2)
  try { win.setBounds({ x, y, width, height }, false) } catch (error) { console.warn('Ignored invalid reminder content size:', error.message) }
})
ipcMain.on('reminder:toggle-fullscreen', event => { const win = BrowserWindow.fromWebContents(event.sender); if (win) win.setFullScreen(!win.isFullScreen()) })
ipcMain.on('reminder:escape', event => dismissReminderWindow(BrowserWindow.fromWebContents(event.sender)))

app.whenReady().then(() => {
  const builtInChime = pathToFileURL(path.join(__dirname, '..', 'resources', 'BuiltInChime.m4a')).href
  state.opening.file = builtInChime; state.closing.file = builtInChime
  startAPI(); createWindows(); installTray(); installMenu(); broadcast()
  reminderTimer = setInterval(broadcast, 250)
})
app.on('window-all-closed', () => {})
app.on('before-quit', () => { isQuitting = true; clearInterval(timer); clearInterval(reminderTimer); apiServer?.close(); globalShortcut.unregisterAll(); tray?.destroy() })

module.exports = { networkAddresses: () => Object.values(os.networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal).map(x => x.address) }
