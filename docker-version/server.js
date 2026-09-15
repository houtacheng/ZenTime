const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PORT = Number(process.env.PORT || 4747)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const PUBLIC_DIR = path.join(__dirname, 'public')
const presetMinutes = [3, 5, 7, 10, 15, 20]
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 15000)
const VERSION = (() => { try { return require('./package.json').version } catch { return '0.0.0' } })()
// 必須在載入 config.json 之前宣告：const 沒有提升，放在 deepMerge 旁邊會踩到 TDZ
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype'])
const mediaBase = process.env.MEDIA_BASE_URL || ''
// 沒有設定 MEDIA_BASE_URL 時就留空，讓使用者自己在主持台填音檔網址
function mediaUrl(name) { try { return mediaBase ? new URL(name, mediaBase).href : '' } catch { return '' } }

const defaults = {
  selectedMinutes: 10, remaining: 600, status: 'ready', startedAt: null, pausedAt: null,
  showClock: false, clock24: false, clockSize: 50, clockFont: 'system-ui', clockPosition: { x: 50, y: 12 },
  showText: true, text: '靜心練習', textSize: 80, textFont: 'system-ui', textColor: '#ffffff', textPosition: { x: 50, y: 34 },
  showCountdown: true, countdownSize: 60, countdownFont: 'system-ui', countdownPosition: { x: 50, y: 73 },
  progressStyle: 'ring', progressSize: 25, progressStart: '#20d760', progressEnd: '#e4bd55',
  background: '#000000', background2: '#17241d', gradient: false, backgroundImage: '',
  alwaysOnTop: false,
  silent: false, musicEnabled: false, musicMode: 'single',
  opening: { url: mediaUrl('磬聲.m4a'), volume: 30, fadeIn: true, fadeOut: true, duration: 8 },
  music: { urls: [], volume: 30, fadeIn: true, fadeOut: true },
  closing: { url: mediaUrl('磬聲.m4a'), volume: 30, fadeIn: true, fadeOut: true },
  wiim: { host: process.env.WIIM_HOST || '', mac: process.env.WIIM_MAC || '', scanPrefix: process.env.WIIM_SCAN_PREFIX || '', status: '尚未連線' },
  reminder: {
    timedEnabled: true, temporaryEnabled: true, marqueeEnabled: true, imageEnabled: true,
    boundToMeditation: false, status: 'idle', elapsed: 0, startedAt: null,
    intervalMinutes: 10, durationSeconds: 10, fadeInSeconds: 3, fadeOutSeconds: 2,
    text: '已進行', showTime: true, timeFormat: 'minutes', sameLine: true, gap: 16,
    effect: 'blinkZoom', overlayColor: '#b40000', overlayOpacity: 0.45,
    textStyle: { font: 'system-ui', size: 72, color: '#ffffff', stroke: true, strokeWidth: 2, strokeColor: '#000000', glow: true, glowSize: 16, glowColor: '#ffffff' },
    timeStyle: { font: 'system-ui', size: 64, color: '#ffffff', stroke: true, strokeWidth: 2, strokeColor: '#000000', glow: true, glowSize: 16, glowColor: '#ffffff' },
    manualResetsInterval: false,
    temporary: { active: false, text: '請保持安靜', durationSeconds: 8, startedAt: null, stoppingAt: null, position: 'center', fadeIn: true, fadeInSeconds: 1, fadeOut: true, fadeOutSeconds: 1, style: { font: 'system-ui', size: 72, color: '#ffffff', stroke: false, strokeWidth: 2, strokeColor: '#000000', glow: false, glowSize: 12, glowColor: '#ffffff' } },
    marquee: { active: false, text: '活動即將開始', layout: 'horizontal', direction: 'rtl', speed: 80, position: 'bottom', background: '#000000', opacity: 0.55, startedAt: null, stoppingAt: null, fadeIn: true, fadeInSeconds: 1, fadeOut: true, fadeOutSeconds: 1, style: { font: 'system-ui', size: 46, color: '#ffffff', stroke: false, strokeWidth: 2, strokeColor: '#000000', glow: false, glowSize: 12, glowColor: '#ffffff' } },
    image: { active: false, url: '', size: 30, durationSeconds: 10, startedAt: null, effect: 'fade' },
  },
}

fs.mkdirSync(DATA_DIR, { recursive: true })
let state = structuredClone(defaults)
// 這裡原本是空的 catch，設定載入失敗時會靜默退回預設值，事後完全查不出來
try { state = deepMerge(state, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); console.log(`已載入設定 ${CONFIG_FILE}`) }
catch (error) { if (error.code !== 'ENOENT') console.error(`設定載入失敗，改用預設值：${error.message}`); else console.log('尚無設定檔，使用預設值') }
state.selectedMinutes = safeMinutes(state.selectedMinutes, defaults.selectedMinutes)
state.status = 'ready'; state.remaining = state.selectedMinutes * 60; state.startedAt = null; state.pausedAt = null
state.reminder.status = 'idle'; state.reminder.elapsed = 0; state.reminder.startedAt = null; state.reminder.temporary.active = false; state.reminder.image.active = false
let sseClients = new Set(), tickTimer, openingTimer, fadeTimer, audioPhase = 'idle', musicIndex = 0, lastReplayAt = 0
let reminderManual = null
const reminderPreviewUntil = { timed: 0, temporary: 0, marquee: 0, image: 0 }

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (unsafeKeys.has(key)) continue
    target[key] = value && typeof value === 'object' && !Array.isArray(value) ? deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value) : value
  }
  return target
}
function safeMinutes(value, fallback = 10) { const minutes = Math.round(Number(value)); return Number.isFinite(minutes) ? Math.max(1, Math.min(999, minutes)) : fallback }
function formatTime(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}` }
function elapsedSeconds() { return Math.max(0, state.selectedMinutes * 60 - state.remaining) }
function reminderElapsed() {
  const r = state.reminder
  if (r.boundToMeditation) return elapsedSeconds()
  if (r.status !== 'running' || !r.startedAt) return Math.max(0, r.elapsed || 0)
  return Math.max(0, (r.elapsed || 0) + (Date.now() - r.startedAt) / 1000)
}
function reminderTimeText(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (state.reminder.timeFormat !== 'hours' || minutes < 60) return `${minutes}分鐘`
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return `${hours}小時${rest ? `${rest}分鐘` : ''}`
}
function reminderPresentation(elapsed) {
  const r = state.reminder, now = Date.now(), interval = Math.max(60, r.intervalMinutes * 60)
  let timed = null
  if ((r.boundToMeditation ? state.status === 'running' : r.status === 'running') && elapsed > 0) {
    const due = Math.ceil(elapsed / interval) * interval
    const previousDue = Math.floor(elapsed / interval) * interval
    const activeDue = elapsed - previousDue <= r.durationSeconds + r.fadeOutSeconds ? previousDue : due
    const offset = elapsed - activeDue
    if (offset >= -r.fadeInSeconds && offset <= r.durationSeconds + r.fadeOutSeconds && activeDue > 0) timed = { kind:'timed', phase:offset<0?'fadeIn':offset<=r.durationSeconds?'effect':'fadeOut', progress:offset, text:r.text, timeText:reminderTimeText(activeDue), effect:r.effect }
  }
  if (reminderManual && now < reminderManual.hideAt) {
    const offset=(now-reminderManual.effectAt)/1000
    timed={kind:'manual',phase:offset<0?'fadeIn':offset<=r.durationSeconds?'effect':'fadeOut',progress:offset,text:r.text,timeText:reminderTimeText(elapsed),effect:r.effect}
  } else if (reminderManual) reminderManual=null
  const tempElapsed=r.temporary.startedAt?(now-r.temporary.startedAt)/1000:0,tempIn=r.temporary.fadeIn?r.temporary.fadeInSeconds:0,tempOut=r.temporary.fadeOut?r.temporary.fadeOutSeconds:0,tempStopping=r.temporary.stoppingAt?(now-r.temporary.stoppingAt)/1000:null
  let temporaryPhase=null
  if(r.temporary.active){if(tempStopping!==null)temporaryPhase=tempStopping<tempOut?'fadeOut':null;else if(tempElapsed<tempIn)temporaryPhase='fadeIn';else if(tempElapsed<tempIn+r.temporary.durationSeconds)temporaryPhase='effect';else if(tempElapsed<tempIn+r.temporary.durationSeconds+tempOut)temporaryPhase='fadeOut';if(!temporaryPhase){r.temporary.active=false;r.temporary.stoppingAt=null}}
  const temporary=!!temporaryPhase
  const mq=r.marquee,mqStopping=mq.stoppingAt?(now-mq.stoppingAt)/1000:null
  let marqueePhase=null
  if(mq.active){if(mqStopping!==null)marqueePhase=mqStopping<(mq.fadeOut?mq.fadeOutSeconds:0)?'fadeOut':null;else if(mq.fadeIn&&mq.startedAt&&(now-mq.startedAt)/1000<mq.fadeInSeconds)marqueePhase='fadeIn';else marqueePhase='effect';if(!marqueePhase){mq.active=false;mq.stoppingAt=null}}
  const image = r.image.active && (!r.image.startedAt || now-r.image.startedAt < r.image.durationSeconds*1000)
  if (r.image.active && !image) r.image.active=false
  const nextDue = Math.ceil(Math.max(1,elapsed)/interval)*interval
  return { elapsed, elapsedText:formatTime(elapsed), timeText:reminderTimeText(elapsed), nextIn:Math.max(0,nextDue-elapsed), nextText:formatTime(Math.max(0,nextDue-elapsed)), timed, temporaryVisible:temporary, temporaryPhase, marqueePhase, imageVisible:image }
}
function publicState() {
  const re=reminderElapsed()
  const reminder={...state.reminder,...reminderPresentation(re)}
  if(reminder.boundToMeditation)reminder.status=state.status==='ready'?'idle':state.status
  return { ...state, state: state.status, remainingText: formatTime(state.remaining), elapsed: elapsedSeconds(), elapsedText: formatTime(elapsedSeconds()), progress: elapsedSeconds() / Math.max(1, state.selectedMinutes * 60), presetMinutes, reminder, reminderPreview:Object.fromEntries(Object.entries(reminderPreviewUntil).map(([mode,until])=>[mode,Date.now()<until])) }
}
function save() {
  const copy = structuredClone(state); copy.status = 'ready'; copy.remaining = copy.selectedMinutes * 60; copy.startedAt = null; copy.pausedAt = null; copy.wiim.status = state.wiim.status
  copy.reminder.status='idle';copy.reminder.elapsed=0;copy.reminder.startedAt=null;copy.reminder.temporary.active=false;copy.reminder.temporary.startedAt=null;copy.reminder.marquee.active=false;copy.reminder.image.active=false;copy.reminder.image.startedAt=null
  const temp = `${CONFIG_FILE}.tmp`
  try { fs.writeFileSync(temp, JSON.stringify(copy, null, 2)); fs.renameSync(temp, CONFIG_FILE) }
  catch (error) { console.error('儲存設定失敗：', error.message) }
}
let lastBroadcastAt = 0
function broadcast() {
  lastBroadcastAt = Date.now()
  const data = `data: ${JSON.stringify(publicState())}\n\n`
  for (const res of sseClients) { try { res.write(data) } catch { sseClients.delete(res) } }
}
function updateRemaining() {
  if (state.status !== 'running' || !state.startedAt) return
  state.remaining = Math.max(0, state.selectedMinutes * 60 - (Date.now() - state.startedAt) / 1000)
}
// 所有畫面都只靠 SSE 推播，沒有任何輪詢。只要還有以時間為準的效果在跑就必須持續推播，
// 否則畫面會凍結在最後一次收到的狀態（例如臨時提醒、圖片提醒永遠不會自己消失，
// 未綁定靜心的定時提醒也永遠不會出現）。閒置時則改用心跳，順便維持 SSE 連線。
function timeDrivenActive() {
  const r = state.reminder, now = Date.now()
  if (state.status === 'running') return true
  if (reminderManual) return true
  if (r.temporary.active || r.image.active) return true
  if (r.marquee.active && r.marquee.stoppingAt) return true
  if (Object.values(reminderPreviewUntil).some(until => now < until + 400)) return true
  return r.boundToMeditation ? false : r.status === 'running'
}
function tick() {
  updateRemaining()
  if (state.status === 'running' && state.remaining <= 0) return void finish(false)
  if (timeDrivenActive()) return broadcast()
  if (sseClients.size && Date.now() - lastBroadcastAt >= HEARTBEAT_MS) broadcast()
}
function startTick() { clearInterval(tickTimer); tickTimer = setInterval(tick, 200) }

function request(url, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const options = url.startsWith('https:') ? { timeout, rejectUnauthorized: false } : { timeout }
    const req = client.get(url, options, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk; if (body.length > 1_000_000) { res.destroy(); reject(new Error('回應過大')) } })
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(body) : reject(new Error(`HTTP ${res.statusCode}`)))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject)
  })
}
function normalizedMac(value) { return String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '') }
const wiimProtocols = new Map()
async function requestWiiM(host, command, timeout = 1200) {
  const preferred = wiimProtocols.get(host)
  const protocols = preferred ? [preferred, preferred === 'https' ? 'http' : 'https'] : ['http', 'https']
  let lastError
  for (const protocol of protocols) {
    try {
      const body = await request(`${protocol}://${host}/httpapi.asp?command=${encodeURIComponent(command)}`, timeout)
      wiimProtocols.set(host, protocol)
      return body
    } catch (error) { lastError = error }
  }
  throw lastError || new Error('無法連線')
}
async function testWiiM(host) {
  try { const body = await requestWiiM(host, 'getStatusEx', 1000); return normalizedMac(body).includes(normalizedMac(state.wiim.mac)) || body.includes('uuid') || body.includes('DeviceName') } catch { return false }
}
let discovering = null
async function discoverWiiM(force = false) {
  if (discovering) return discovering
  discovering = runDiscoverWiiM(force).finally(() => { discovering = null })
  return discovering
}
async function runDiscoverWiiM(force = false) {
  if (!force && state.wiim.host && await testWiiM(state.wiim.host)) { state.wiim.status = `已連線 ${state.wiim.host}`; broadcast(); return state.wiim.host }
  state.wiim.status = '正在尋找 WiiM Pro…'; broadcast()
  const prefixes = new Set([state.wiim.scanPrefix, ...Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address.split('.').slice(0,3).join('.'))].filter(Boolean))
  const targets = [...prefixes].flatMap(prefix => Array.from({length:254}, (_,i) => `${prefix}.${i+1}`))
  let cursor = 0, found = ''
  const wanted = normalizedMac(state.wiim.mac)
  const matches = body => wanted ? normalizedMac(body).includes(wanted) : /uuid|DeviceName/.test(body)
  async function worker() { while (!found && cursor < targets.length) { const host = targets[cursor++]; try { const body = await requestWiiM(host, 'getStatusEx', 500); if (matches(body)) found = host } catch {} } }
  await Promise.all(Array.from({length:32}, worker))
  if (found) { state.wiim.host = found; state.wiim.status = `已連線 ${found}`; save() } else state.wiim.status = '找不到 WiiM Pro，請輸入 IP'
  broadcast(); return found
}
async function wiimCommand(command) {
  const host = state.wiim.host || await discoverWiiM()
  if (!host) throw new Error('找不到 WiiM Pro')
  try { const result = await requestWiiM(host, command, 3000); state.wiim.status = `已連線 ${host}（${wiimProtocols.get(host).toUpperCase()}）`; return result }
  catch (error) { state.wiim.status = `WiiM 錯誤：${error.message}`; broadcast(); throw error }
}
async function setVolume(volume) { return wiimCommand(`setPlayerCmd:vol:${Math.max(0,Math.min(100,Math.round(volume)))}`) }
async function fadeVolume(from, to, duration = 2000) {
  clearInterval(fadeTimer); let step = 0; const steps = 10; await setVolume(from).catch(()=>{})
  return new Promise(resolve => { fadeTimer = setInterval(async () => { step++; await setVolume(from + (to-from)*step/steps).catch(()=>{}); if (step >= steps) { clearInterval(fadeTimer); resolve() } }, duration/steps) })
}
async function playUrl(url, sound, phase) {
  if (!url || state.silent) return
  audioPhase = phase
  if (sound.fadeIn) await setVolume(0); else await setVolume(sound.volume)
  await wiimCommand(`setPlayerCmd:play:${url}`)
  if (sound.fadeIn) await fadeVolume(0, sound.volume, 1600)
}
async function startMusic() {
  const urls = state.music.urls.filter(Boolean); if (!state.musicEnabled || state.silent || !urls.length || state.status !== 'running') return
  musicIndex = state.musicMode === 'playlist' ? Math.min(musicIndex, urls.length-1) : 0
  await wiimCommand(`setPlayerCmd:loopmode:${state.musicMode === 'single' ? 1 : 0}`).catch(()=>{})
  await playUrl(urls[musicIndex], state.music, 'music').catch(()=>{})
}
async function start() {
  if (state.status === 'running') return
  if (state.status === 'paused') { state.startedAt = Date.now() - elapsedSeconds()*1000; state.status = 'running'; if(state.reminder.boundToMeditation)state.reminder.status='running'; await wiimCommand('setPlayerCmd:resume').catch(()=>{}); broadcast(); return }
  state.remaining = state.selectedMinutes * 60; state.startedAt = Date.now(); state.status = 'running'; audioPhase = 'idle'; broadcast()
  if (state.reminder.boundToMeditation) { state.reminder.status='running'; state.reminder.elapsed=0; state.reminder.startedAt=Date.now() }
  clearTimeout(openingTimer)
  if (!state.silent && state.opening.url) {
    playUrl(state.opening.url, state.opening, 'opening').catch(()=>{})
    openingTimer = setTimeout(() => startMusic(), Math.max(0, Number(state.opening.duration || 0))*1000)
  } else startMusic()
}
async function pause() { if (state.status !== 'running') return; updateRemaining(); state.status='paused'; state.pausedAt=Date.now(); if(state.reminder.boundToMeditation)state.reminder.status='paused'; await wiimCommand('setPlayerCmd:pause').catch(()=>{}); broadcast() }
async function reset() { clearTimeout(openingTimer); clearInterval(fadeTimer); state.status='ready'; state.remaining=state.selectedMinutes*60; state.startedAt=null; audioPhase='idle'; if(state.reminder.boundToMeditation){state.reminder.status='idle';state.reminder.elapsed=0;state.reminder.startedAt=null} await wiimCommand('setPlayerCmd:stop').catch(()=>{}); broadcast() }
async function finish(early = true) {
  if (state.status === 'finished') return
  clearTimeout(openingTimer); state.status='finished'; state.remaining=0; state.startedAt=null; broadcast()
  if(state.reminder.boundToMeditation)state.reminder.status='finished'
  if (state.silent) return
  if (audioPhase === 'music' && state.music.fadeOut) await fadeVolume(state.music.volume, 0, 1800).catch(()=>{})
  await wiimCommand('setPlayerCmd:stop').catch(()=>{})
  await playUrl(state.closing.url, state.closing, 'closing').catch(()=>{})
}
async function monitorWiiM() {
  if (state.status !== 'running' || audioPhase !== 'music' || state.silent || !state.musicEnabled) return
  try { const raw=await wiimCommand('getPlayerStatus'); const info=JSON.parse(raw); const stopped=String(info.status || '').toLowerCase()==='stop'; if (!stopped || Date.now()-lastReplayAt<2500) return; lastReplayAt=Date.now(); const urls=state.music.urls.filter(Boolean); if (!urls.length) return; if (state.musicMode==='playlist') musicIndex=(musicIndex+1)%urls.length; await playUrl(urls[musicIndex], {...state.music,fadeIn:false}, 'music') } catch {}
}
async function reconcileAudio(previous) {
  if (state.status !== 'running') return
  if (state.silent) { clearTimeout(openingTimer); audioPhase='idle'; await wiimCommand('setPlayerCmd:stop').catch(()=>{}); return }
  if (previous.silent && !state.silent) { await startMusic(); return }
  if (previous.musicEnabled && !state.musicEnabled && audioPhase==='music') { audioPhase='idle'; await wiimCommand('setPlayerCmd:stop').catch(()=>{}); return }
  if (!previous.musicEnabled && state.musicEnabled && audioPhase!=='opening') await startMusic()
}
setInterval(monitorWiiM, 1500); startTick(); if(process.env.AUTO_DISCOVER!=='false')setTimeout(()=>discoverWiiM(), 500)

function json(res, value, status=200) { const body=JSON.stringify(value); res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}); res.end(body) }
function readJson(req) { return new Promise((resolve,reject)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch(e){reject(e)}});req.on('error',reject)}) }
function serveFile(req,res,pathname) {
  const routes={'/':'host.html','/host':'host.html','/display':'display.html','/control':'control.html','/reminder':'reminder.html','/reminder-control':'reminder-control.html'}
  let rel = routes[pathname]
  if (!rel) { try { rel = decodeURIComponent(pathname).replace(/^\//,'') } catch { return false } }
  const file = path.normalize(path.join(PUBLIC_DIR, rel))
  // 結尾要帶分隔符，否則 /app/public-xxx 這種同前綴的路徑會被誤判為合法
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return false
  let stats
  try { stats = fs.statSync(file) } catch { return false }
  if (!stats.isFile()) return false
  const ext=path.extname(file).toLowerCase()
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'}
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'})
  const stream = fs.createReadStream(file)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
  return true
}
async function api(req,res,url) {
  try {
    const p=url.pathname
    if(p==='/api/health') return json(res,{ok:true,version:VERSION,status:state.status,uptime:Math.round(process.uptime()),clients:sseClients.size,wiim:state.wiim.status})
    if(p==='/api/state') return json(res,publicState())
    if(p==='/api/fonts') return json(res,[{value:'system-ui',label:'系統預設字體'},{value:'Arial',label:'Arial'},{value:'Helvetica',label:'Helvetica'},{value:'Microsoft JhengHei',label:'微軟正黑體'},{value:'Noto Sans TC',label:'Noto Sans TC'},{value:'PingFang TC',label:'蘋方－繁'}])
    if(p==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no','Access-Control-Allow-Origin':'*'});res.write('retry: 2000\n\n');res.write(`data: ${JSON.stringify(publicState())}\n\n`);sseClients.add(res);const drop=()=>sseClients.delete(res);req.on('close',drop);req.on('error',drop);res.on('close',drop);res.on('error',drop);lastBroadcastAt=Date.now();return}
    if(p==='/api/start') await start(); else if(p==='/api/pause') await pause(); else if(p==='/api/toggle') state.status==='running'?await pause():await start(); else if(p==='/api/reset') await reset(); else if(p==='/api/finish') await finish(true)
    else if(p==='/api/duration'){const raw=url.searchParams.get('minutes'),parsed=Math.round(Number(raw));if(raw===null||raw.trim()===''||!Number.isFinite(parsed))return json(res,{error:'minutes 必須是 1 到 999 的數字'},400);const m=Math.max(1,Math.min(999,parsed));state.selectedMinutes=m;if(state.status!=='running'){state.remaining=m*60;state.status='ready'}save();broadcast()}
    else if(p==='/api/toggle-countdown'){state.showCountdown=!state.showCountdown;save();broadcast()} else if(p==='/api/toggle-clock'){state.showClock=!state.showClock;save();broadcast()} else if(p==='/api/toggle-text'){state.showText=!state.showText;save();broadcast()}
    // 瀏覽器做不到作業系統層級的視窗置頂。這支保持存在只是為了不讓 Companion 收到 404
    // 而把整條連線標成失敗；狀態固定是 false，按鈕不會亮起來謊稱畫面已置頂。
    else if(p==='/api/toggle-always-on-top'){state.alwaysOnTop=false}
    else if(p==='/api/config'&&req.method==='POST'){const previous=structuredClone(state);deepMerge(state,await readJson(req));save();broadcast();await reconcileAudio(previous);if(state.wiim.host!==previous.wiim.host&&state.wiim.host)discoverWiiM();}
    else if(p==='/api/reminder/config'&&req.method==='POST'){deepMerge(state.reminder,await readJson(req));save();broadcast()}
    else if(p==='/api/reminder/preview'){const body=req.method==='POST'?await readJson(req):{};if(body.mode in reminderPreviewUntil)reminderPreviewUntil[body.mode]=Date.now()+900;broadcast()}
    else if(p==='/api/reminder/start'){const r=state.reminder;if(r.status==='paused'){r.status='running';r.startedAt=Date.now()}else{r.status='running';r.elapsed=0;r.startedAt=Date.now()}broadcast()}
    else if(p==='/api/reminder/pause'){const r=state.reminder;if(r.status==='running'){r.elapsed=reminderElapsed();r.startedAt=null;r.status='paused'}broadcast()}
    else if(p==='/api/reminder/reset'){const r=state.reminder;r.status='idle';r.elapsed=0;r.startedAt=null;reminderManual=null;broadcast()}
    else if(p==='/api/reminder/trigger'){const now=Date.now(),r=state.reminder;reminderManual={effectAt:now+r.fadeInSeconds*1000,hideAt:now+(r.fadeInSeconds+r.durationSeconds+r.fadeOutSeconds)*1000};if(r.manualResetsInterval&&!r.boundToMeditation){r.elapsed=0;r.startedAt=now}broadcast()}
    else if(p==='/api/reminder/temp/show'){const body=req.method==='POST'?await readJson(req):{};deepMerge(state.reminder.temporary,body);state.reminder.temporary.active=true;state.reminder.temporary.startedAt=Date.now();state.reminder.temporary.stoppingAt=null;broadcast()}
    else if(p==='/api/reminder/temp/hide'){const t=state.reminder.temporary;if(t.active&&t.fadeOut)t.stoppingAt=Date.now();else t.active=false;broadcast()}
    else if(p==='/api/reminder/marquee/show'){const body=req.method==='POST'?await readJson(req):{};deepMerge(state.reminder.marquee,body);state.reminder.marquee.active=true;state.reminder.marquee.startedAt=Date.now();state.reminder.marquee.stoppingAt=null;save();broadcast()}
    else if(p==='/api/reminder/marquee/hide'){const m=state.reminder.marquee;if(m.active&&m.fadeOut)m.stoppingAt=Date.now();else m.active=false;save();broadcast()}
    else if(p==='/api/reminder/image/show'){const body=req.method==='POST'?await readJson(req):{};deepMerge(state.reminder.image,body);state.reminder.image.active=true;state.reminder.image.startedAt=Date.now();broadcast()}
    else if(p==='/api/reminder/image/hide'){state.reminder.image.active=false;broadcast()}
    else if(p==='/api/reminder/hide-all'){reminderManual=null;state.reminder.temporary.active=false;state.reminder.marquee.active=false;state.reminder.image.active=false;broadcast()}
    else if(p==='/api/wiim/discover'){await discoverWiiM(true)} else if(p==='/api/wiim/test'){await wiimCommand('getPlayerStatus')}
    else return json(res,{error:'Not found'},404)
    return json(res,publicState())
  } catch(error){return json(res,{error:error.message},500)}
}
const server=http.createServer((req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return api(req,res,url);if(!serveFile(req,res,url.pathname)){res.writeHead(404);res.end('Not found')}})
server.keepAliveTimeout = 65000
server.headersTimeout = 70000
// 監聽失敗必須直接結束行程，否則容器會「活著卻沒有在服務」，Docker 的 restart 也不會啟動
server.on('error', error => { console.error(`無法在 ${PORT} 連接埠啟動：${error.message}`); process.exit(1) })
server.listen(PORT,'0.0.0.0',()=>console.log(`ZenTime Docker listening on http://0.0.0.0:${PORT}`))

// 容器裡 node 是 PID 1，沒有自訂處理器時 SIGTERM 會被忽略，docker stop 要等十秒才會強制砍掉
let shuttingDown = false
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`收到 ${signal}，正在關閉…`)
  clearInterval(tickTimer)
  for (const res of sseClients) { try { res.end() } catch {} }
  sseClients.clear()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
})
// 現場活動進行中，寧可記錄錯誤也不要讓整個主持台中斷。
// 啟動階段的錯誤不適用這條：那時候還沒開始服務，繼續跑只會變成假活著。
process.on('uncaughtException', error => {
  console.error('未攔截的例外：', error)
  if (!server.listening) process.exit(1)
})
process.on('unhandledRejection', error => console.error('未處理的 Promise 錯誤：', error))
