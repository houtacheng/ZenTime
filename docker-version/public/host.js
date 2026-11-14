const $=id=>document.getElementById(id);let state
const labels={ready:'準備完成',running:'靜心進行中',paused:'已暫停',finished:'靜心已完成'}
for(const m of [3,5,7,10,15,20]){const b=document.createElement('button');b.className='preset';b.dataset.minutes=m;b.textContent=`${m} 分鐘`;b.onclick=()=>api(`/api/duration?minutes=${m}`);$('presets').append(b)}
for(const f of ['system-ui','PingFang TC','蘋方-繁','Heiti TC','Noto Sans TC','Microsoft JhengHei','Arial','Helvetica Neue']){const o=document.createElement('option');o.value=f;$('fonts').append(o)}
async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw Error(j.error||r.status);render(j);return j}
function paint(s){state=s;$('remaining').textContent=s.remainingText;$('elapsed').textContent=s.elapsedText;$('status').textContent=labels[s.status]||s.status;const preset=[3,5,7,10,15,20].includes(s.selectedMinutes);for(const b of document.querySelectorAll('.preset'))b.classList.toggle('selected',Number(b.dataset.minutes)===s.selectedMinutes);$('custom').classList.toggle('selected',!preset);if(!preset&&document.activeElement!==$('custom'))$('custom').value=s.selectedMinutes;for(const id of ['showClock','clock24','showText','showCountdown','gradient','silent','musicEnabled'])$(id).checked=!!s[id];for(const id of ['text','textFont','textColor','countdownFont','textSize','countdownSize','background','background2','backgroundImage','progressStyle','progressMode','progressDirection','progressSize','musicMode'])$(id).value=s[id]??'';$('wiimHost').value=s.wiim.host||'';$('wiimMac').value=s.wiim.mac||'';$('wiimStatus').textContent=s.wiim.status;$('wiimStatus').className=s.wiim.status.startsWith('已連線')?'wiim-ok':'wiim-bad';$('openingUrl').value=s.opening.url||'';$('openingVolume').value=s.opening.volume;$('openingDuration').value=s.opening.duration;$('musicUrls').value=(s.music.urls||[]).join('\n');$('musicVolume').value=s.music.volume;$('closingUrl').value=s.closing.url||'';$('closingVolume').value=s.closing.volume}
const positionDefinitions=[['clockPosition','現在時間'],['textPosition','主文字'],['countdownPosition','倒數時間'],['progressPosition','進度圖形']]
const positionInputs={};let positionSaveTimer
for(const [key,label] of positionDefinitions){const card=document.createElement('div');card.className='position-card';card.innerHTML=`<strong>${label}</strong>`;positionInputs[key]={};for(const axis of ['x','y']){const row=document.createElement('label');row.className='axis-row';const axisLabel=document.createElement('span');axisLabel.textContent=axis.toUpperCase();const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='1';const output=document.createElement('output');input.oninput=()=>{const value=Number(input.value);output.value=value+'%';state[key]={...(state[key]||{x:50,y:50}),[axis]:value};clearTimeout(positionSaveTimer);positionSaveTimer=setTimeout(()=>fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({[key]:state[key]})}).catch(error=>alert(error.message)),70)};row.append(axisLabel,input,output);card.append(row);positionInputs[key][axis]={input,output}}$('positionControls').append(card)}
function syncPositions(s){for(const [key] of positionDefinitions){const value=s[key]||(key==='progressPosition'?s.countdownPosition:null)||{x:50,y:50};for(const axis of ['x','y']){const control=positionInputs[key][axis];if(document.activeElement!==control.input)control.input.value=value[axis];control.output.value=Math.round(value[axis])+'%'}}}
function syncSizes(s){for(const key of ['clockSize','textSize','countdownSize']){const input=$(key),output=$(key+'Value');if(document.activeElement!==input)input.value=s[key];output.value=Math.round(s[key])+' px'}}
function render(s){const editingText=document.activeElement===$('text')?$('text').value:null;paint(s);if(editingText!==null)$('text').value=editingText;syncPositions(s);syncSizes(s);syncBackgroundSlots(s)}
function clock(){$('now').textContent=new Date().toLocaleTimeString('zh-TW',{hour12:false})}clock();setInterval(clock,500)
new EventSource('/api/events').onmessage=e=>render(JSON.parse(e.data));fetch('/api/state').then(r=>r.json()).then(render)
for(const id of ['start','toggle','reset','finish'])$(id).onclick=()=>api('/api/'+id).catch(alert);$('setDuration').onclick=()=>api('/api/duration?minutes='+Number($('custom').value)).catch(alert)
$('saveVisual').onclick=()=>api('/api/config',{showClock:$('showClock').checked,clock24:$('clock24').checked,showText:$('showText').checked,showCountdown:$('showCountdown').checked,text:$('text').value,textFont:$('textFont').value,textColor:$('textColor').value,countdownFont:$('countdownFont').value,clockSize:Number($('clockSize').value),textSize:Number($('textSize').value),countdownSize:Number($('countdownSize').value),background:$('background').value,background2:$('background2').value,gradient:$('gradient').checked,backgroundImage:$('backgroundImage').value,progressStyle:$('progressStyle').value,progressMode:$('progressMode').value,progressDirection:$('progressDirection').value,progressSize:Number($('progressSize').value)}).catch(alert)
$('saveAudio').onclick=()=>api('/api/config',{silent:$('silent').checked,musicEnabled:$('musicEnabled').checked,musicMode:$('musicMode').value,wiim:{...state.wiim,host:$('wiimHost').value.trim(),mac:$('wiimMac').value.trim()},opening:{...state.opening,url:$('openingUrl').value.trim(),volume:Number($('openingVolume').value),duration:Number($('openingDuration').value)},music:{...state.music,urls:$('musicUrls').value.split('\n').map(x=>x.trim()).filter(Boolean),volume:Number($('musicVolume').value)},closing:{...state.closing,url:$('closingUrl').value.trim(),volume:Number($('closingVolume').value)}}).catch(alert)
$('discover').onclick=()=>api('/api/wiim/discover').catch(alert);$('testWiim').onclick=()=>api('/api/wiim/test').catch(alert)
const backgroundSlots = []
for (const kind of ['video','image']) for (const slot of [1,2]) {
  const label = (kind === 'video' ? '影片' : '圖片') + slot
  const endpoint = `/api/background-slots/${kind}/${slot}`
  const card = document.createElement('div')
  card.className = 'position-card background-slot'
  card.innerHTML = '<button type="button" disabled><span class="background-slot-preview">尚未上傳</span><strong></strong></button><input type="file"><output class="background-slot-status muted" aria-live="polite"></output>'
  const [button, input, status] = card.children
  const [preview, title] = button.children
  title.textContent = label
  input.setAttribute('aria-label', '上傳' + label)
  input.accept = kind === 'video' ? '.mp4,.webm,.mov,.m4v' : '.jpg,.jpeg,.png,.webp'
  button.onclick = () => api(endpoint + '/select', {}).catch(error => alert(error.message))
  input.onchange = async () => {
    const file = input.files[0]
    if (!file) return
    input.disabled = true
    status.textContent = '上傳中…'
    try {
      const response = await fetch(endpoint, {method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name)},body:file})
      const result = await response.json()
      if (!response.ok) throw Error(result.error || response.status)
      render(result)
      status.textContent = '已儲存'
    } catch(error) { status.textContent = error.message }
    finally { input.disabled = false; input.value = '' }
  }
  backgroundSlots.push({kind, slot, label, title, button, preview, url: ''})
  $('backgroundSlots').append(card)
}
function syncBackgroundSlots(s) {
  for (const item of backgroundSlots) {
    const {kind, slot, label, title, button, preview} = item
    const url = s.backgroundSlots?.[kind]?.[slot - 1] || ''
    const active = !!url && (kind === 'video' ? s.backgroundVideo === url : !s.backgroundVideo && s.backgroundImage === url)
    title.textContent = label + (active ? '・使用中' : '')
    button.disabled = !url
    button.classList.toggle('selected', active)
    button.setAttribute('aria-pressed', String(active))
    if (item.url === url) continue
    item.url = url
    if (!url) { preview.textContent = '尚未上傳'; continue }
    const media = document.createElement(kind === 'video' ? 'video' : 'img')
    media.setAttribute('aria-hidden','true')
    if (kind === 'video') {
      media.muted = true
      media.preload = 'auto'
      media.playsInline = true
      media.onloadeddata = () => {
        if (!preview.contains(media) || !media.videoWidth) return
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(480, media.videoWidth)
        canvas.height = Math.max(1, Math.round(canvas.width * media.videoHeight / media.videoWidth))
        try {
          canvas.getContext('2d').drawImage(media, 0, 0, canvas.width, canvas.height)
          const thumbnail = document.createElement('img')
          thumbnail.alt = ''
          thumbnail.src = canvas.toDataURL('image/jpeg', .8)
          preview.replaceChildren(thumbnail)
          media.removeAttribute('src')
          media.load()
        } catch { /* Keep the paused video as preview if canvas is unavailable. */ }
      }
    }
    else { media.alt = ''; media.loading = 'lazy' }
    media.onerror = () => { if (preview.contains(media)) preview.textContent = '無法預覽' }
    preview.replaceChildren(media)
    media.src = url
  }
}
$('clearBackground').onclick = () => api('/api/background-slots/clear', {}).catch(error => alert(error.message))
for(const id of ['showClock','clock24','showText','showCountdown'])$(id).onchange=()=>api('/api/config',{[id]:$(id).checked}).catch(alert)
let sizeSaveTimer
for(const key of ['clockSize','textSize','countdownSize'])$(key).oninput=()=>{const value=Number($(key).value);$(key+'Value').value=value+' px';state[key]=value;clearTimeout(sizeSaveTimer);sizeSaveTimer=setTimeout(()=>fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({[key]:value})}).catch(error=>alert(error.message)),70)}
let textSaveTimer
$('text').oninput=()=>{const value=$('text').value;state.text=value;clearTimeout(textSaveTimer);textSaveTimer=setTimeout(()=>fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:value})}).catch(error=>alert(error.message)),120)}
$('textColor').oninput=()=>{const value=$('textColor').value;state.textColor=value;fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({textColor:value})}).catch(error=>alert(error.message))}
