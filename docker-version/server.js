const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PORT = Number(process.env.PORT || 4747)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const PUBLIC_DIR = path.join(__dirname, 'public')
const presetMinutes = [3, 5, 7, 10, 15, 20]
const mediaBase = process.env.MEDIA_BASE_URL || 'http://10.43.50.145:8088/ZenTime/music/'

const defaults = {
  selectedMinutes: 10, remaining: 600, status: 'ready', startedAt: null, pausedAt: null,
  showClock: false, clock24: false, clockSize: 50, clockFont: 'system-ui', clockPosition: { x: 50, y: 12 },
  showText: true, text: '靜心練習', textSize: 80, textFont: 'system-ui', textColor: '#ffffff', textPosition: { x: 50, y: 34 },
  showCountdown: true, countdownSize: 60, countdownFont: 'system-ui', countdownPosition: { x: 50, y: 73 },
  progressStyle: 'ring', progressSize: 25, progressStart: '#20d760', progressEnd: '#e4bd55',
  background: '#000000', background2: '#17241d', gradient: false, backgroundImage: '',
  silent: false, musicEnabled: false, musicMode: 'single',
  opening: { url: new URL('磬聲.m4a', mediaBase).href, volume: 30, fadeIn: true, fadeOut: true, duration: 8 },
  music: { urls: [], volume: 30, fadeIn: true, fadeOut: true },
  closing: { url: new URL('磬聲.m4a', mediaBase).href, volume: 30, fadeIn: true, fadeOut: true },
  wiim: { host: process.env.WIIM_HOST || '', mac: process.env.WIIM_MAC || '00:22:6c:36:0f:67', scanPrefix: process.env.WIIM_SCAN_PREFIX || '10.43.50', status: '尚未連線' },
}

fs.mkdirSync(DATA_DIR, { recursive: true })
let state = structuredClone(defaults)
try { state = deepMerge(state, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))) } catch {}
state.status = 'ready'; state.remaining = state.selectedMinutes * 60; state.startedAt = null; state.pausedAt = null
let sseClients = new Set(), tickTimer, openingTimer, fadeTimer, audioPhase = 'idle', musicIndex = 0, lastReplayAt = 0

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) target[key] = value && typeof value === 'object' && !Array.isArray(value) ? deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value) : value
  return target
}
function formatTime(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}` }
function elapsedSeconds() { return Math.max(0, state.selectedMinutes * 60 - state.remaining) }
function publicState() {
  return { ...state, state: state.status, remainingText: formatTime(state.remaining), elapsed: elapsedSeconds(), elapsedText: formatTime(elapsedSeconds()), progress: elapsedSeconds() / Math.max(1, state.selectedMinutes * 60), presetMinutes }
}
function save() {
  const copy = structuredClone(state); copy.status = 'ready'; copy.remaining = copy.selectedMinutes * 60; copy.startedAt = null; copy.pausedAt = null; copy.wiim.status = state.wiim.status
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(copy, null, 2))
}
function broadcast() { const data = `data: ${JSON.stringify(publicState())}\n\n`; for (const res of sseClients) res.write(data) }
function updateRemaining() {
  if (state.status !== 'running' || !state.startedAt) return
  state.remaining = Math.max(0, state.selectedMinutes * 60 - (Date.now() - state.startedAt) / 1000)
  if (state.remaining <= 0) finish(false)
  broadcast()
}
function startTick() { clearInterval(tickTimer); tickTimer = setInterval(updateRemaining, 200) }

function request(url, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, res => { let body=''; res.setEncoding('utf8'); res.on('data', c => body += c); res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(body) : reject(new Error(`HTTP ${res.statusCode}`))) })
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject)
  })
}
function normalizedMac(value) { return String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '') }
async function testWiiM(host) {
  try { const body = await request(`http://${host}/httpapi.asp?command=getStatusEx`, 700); return normalizedMac(body).includes(normalizedMac(state.wiim.mac)) || body.includes('uuid') || body.includes('DeviceName') } catch { return false }
}
async function discoverWiiM(force = false) {
  if (!force && state.wiim.host && await testWiiM(state.wiim.host)) { state.wiim.status = `已連線 ${state.wiim.host}`; broadcast(); return state.wiim.host }
  state.wiim.status = '正在尋找 WiiM Pro…'; broadcast()
  const prefixes = new Set([state.wiim.scanPrefix, ...Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address.split('.').slice(0,3).join('.'))].filter(Boolean))
  const targets = [...prefixes].flatMap(prefix => Array.from({length:254}, (_,i) => `${prefix}.${i+1}`))
  let cursor = 0, found = ''
  async function worker() { while (!found && cursor < targets.length) { const host = targets[cursor++]; try { const body = await request(`http://${host}/httpapi.asp?command=getStatusEx`, 350); if (normalizedMac(body).includes(normalizedMac(state.wiim.mac))) found = host } catch {} } }
  await Promise.all(Array.from({length:32}, worker))
  if (found) { state.wiim.host = found; state.wiim.status = `已連線 ${found}`; save() } else state.wiim.status = '找不到 WiiM Pro，請輸入 IP'
  broadcast(); return found
}
async function wiimCommand(command) {
  const host = state.wiim.host || await discoverWiiM()
  if (!host) throw new Error('找不到 WiiM Pro')
  try { const result = await request(`http://${host}/httpapi.asp?command=${encodeURIComponent(command)}`, 3000); state.wiim.status = `已連線 ${host}`; return result }
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
  if (state.status === 'paused') { state.startedAt = Date.now() - elapsedSeconds()*1000; state.status = 'running'; await wiimCommand('setPlayerCmd:resume').catch(()=>{}); broadcast(); return }
  state.remaining = state.selectedMinutes * 60; state.startedAt = Date.now(); state.status = 'running'; audioPhase = 'idle'; broadcast()
  clearTimeout(openingTimer)
  if (!state.silent && state.opening.url) {
    playUrl(state.opening.url, state.opening, 'opening').catch(()=>{})
    openingTimer = setTimeout(() => startMusic(), Math.max(0, Number(state.opening.duration || 0))*1000)
  } else startMusic()
}
async function pause() { if (state.status !== 'running') return; updateRemaining(); state.status='paused'; state.pausedAt=Date.now(); await wiimCommand('setPlayerCmd:pause').catch(()=>{}); broadcast() }
async function reset() { clearTimeout(openingTimer); clearInterval(fadeTimer); state.status='ready'; state.remaining=state.selectedMinutes*60; state.startedAt=null; audioPhase='idle'; await wiimCommand('setPlayerCmd:stop').catch(()=>{}); broadcast() }
async function finish(early = true) {
  if (state.status === 'finished') return
  clearTimeout(openingTimer); state.status='finished'; state.remaining=0; state.startedAt=null; broadcast()
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
  const routes={'/':'host.html','/host':'host.html','/display':'display.html','/control':'control.html'}; const rel=routes[pathname] || pathname.replace(/^\//,''); const file=path.normalize(path.join(PUBLIC_DIR,rel)); if(!file.startsWith(PUBLIC_DIR)||!fs.existsSync(file)) return false
  const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'}); fs.createReadStream(file).pipe(res); return true
}
async function api(req,res,url) {
  try {
    const p=url.pathname
    if(p==='/api/state') return json(res,publicState())
    if(p==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write(`data: ${JSON.stringify(publicState())}\n\n`);sseClients.add(res);req.on('close',()=>sseClients.delete(res));return}
    if(p==='/api/start') await start(); else if(p==='/api/pause') await pause(); else if(p==='/api/toggle') state.status==='running'?await pause():await start(); else if(p==='/api/reset') await reset(); else if(p==='/api/finish') await finish(true)
    else if(p==='/api/duration'){const m=Math.max(1,Math.min(999,Math.round(Number(url.searchParams.get('minutes')))));state.selectedMinutes=m;if(state.status!=='running'){state.remaining=m*60;state.status='ready'}save();broadcast()}
    else if(p==='/api/toggle-countdown'){state.showCountdown=!state.showCountdown;save();broadcast()} else if(p==='/api/toggle-clock'){state.showClock=!state.showClock;save();broadcast()} else if(p==='/api/toggle-text'){state.showText=!state.showText;save();broadcast()}
    else if(p==='/api/config'&&req.method==='POST'){const previous=structuredClone(state);deepMerge(state,await readJson(req));save();broadcast();await reconcileAudio(previous);if(state.wiim.host!==previous.wiim.host&&state.wiim.host)discoverWiiM();}
    else if(p==='/api/wiim/discover'){await discoverWiiM(true)} else if(p==='/api/wiim/test'){await wiimCommand('getPlayerStatus')}
    else return json(res,{error:'Not found'},404)
    return json(res,publicState())
  } catch(error){return json(res,{error:error.message},500)}
}
const server=http.createServer((req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return api(req,res,url);if(!serveFile(req,res,url.pathname)){res.writeHead(404);res.end('Not found')}})
server.listen(PORT,'0.0.0.0',()=>console.log(`ZenTime Docker listening on http://0.0.0.0:${PORT}`))
