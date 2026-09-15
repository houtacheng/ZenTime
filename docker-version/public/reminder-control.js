const $ = id => document.getElementById(id)
let state
let imageData = ''
document.querySelector('.links')?.remove()
document.getElementById('fonts')?.remove()
$('marqueePosition')?.remove()
const fontPickers = new Map()
const fontLabels = new Map()
for (const prefix of ['text', 'time', 'temp', 'marquee']) {
  const input = $(prefix + 'Font')
  if (!input) continue
  const picker = document.createElement('div')
  picker.className = 'font-picker'
  picker.innerHTML = `<input id="${input.id}" type="hidden"><button class="font-picker-button" type="button">正在載入本機字體…</button><div class="font-picker-menu" hidden><input class="font-picker-search" type="search" placeholder="搜尋字體名稱"><div class="font-picker-options"></div></div>`
  input.replaceWith(picker)
  const button = picker.querySelector('.font-picker-button')
  const menu = picker.querySelector('.font-picker-menu')
  const search = picker.querySelector('.font-picker-search')
  button.onclick = event => {
    event.stopPropagation()
    for (const other of fontPickers.values()) if (other.menu !== menu) other.menu.hidden = true
    menu.hidden = !menu.hidden
    if (!menu.hidden) { search.value = ''; for (const option of menu.querySelectorAll('button')) option.hidden = false; search.focus() }
  }
  search.oninput = () => {
    const wanted = search.value.trim().toLocaleLowerCase()
    for (const option of menu.querySelectorAll('button')) option.hidden = wanted && !option.textContent.toLocaleLowerCase().includes(wanted)
  }
  fontPickers.set(prefix, { button, menu, search, options: picker.querySelector('.font-picker-options') })
}
for (const prefix of ['text', 'time', 'temp', 'marquee']) {
  const color = $(prefix + 'StrokeColor')
  if (!color) continue
  const field = document.createElement('div')
  field.className = 'field'
  field.innerHTML = `<label>描邊粗細 <span id="${prefix}StrokeWidthValue" class="value"></span></label><input id="${prefix}StrokeWidth" type="range" min="0" max="12" step=".5" value="2">`
  color.insertAdjacentElement('beforebegin', field)
}
fetch('/api/fonts').then(response => response.json()).then(fonts => {
  for (const font of fonts) fontLabels.set(font.value, font.label)
  for (const prefix of ['text', 'time', 'temp', 'marquee']) {
    const input = $(prefix + 'Font')
    const picker = fontPickers.get(prefix)
    const selected = prefix === 'text' ? state?.reminder.textStyle.font : prefix === 'time' ? state?.reminder.timeStyle.font : state?.reminder[prefix === 'temp' ? 'temporary' : 'marquee']?.style.font
    const values = selected && !fonts.some(font => font.value === selected) ? [{ value: selected, label: selected }, ...fonts] : fonts
    picker.options.replaceChildren(...values.map(font => {
      const option = Object.assign(document.createElement('button'), { type: 'button', textContent: font.label })
      option.style.fontFamily = font.value === '系統預設字體' ? 'system-ui' : `"${font.value}",system-ui`
      option.onclick = () => { input.value = font.value; picker.button.textContent = font.label; picker.button.style.fontFamily = option.style.fontFamily; picker.menu.hidden = true; input.dispatchEvent(new Event('change', { bubbles: true })) }
      return option
    }))
    input.value = selected || '系統預設字體'
    picker.button.textContent = values.find(font => font.value === input.value)?.label || input.value
  }
}).catch(error => console.error('無法載入本機字體', error))
document.addEventListener('click', event => { for (const picker of fontPickers.values()) if (!picker.menu.contains(event.target) && event.target !== picker.button) picker.menu.hidden = true })

async function api(url, body) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const json = await response.json()
  if (!response.ok) throw Error(json.error || response.status)
  paint(json)
  return json
}
const set = (id, value) => {
  if (document.activeElement !== $(id)) $(id).value = value ?? ''
  if (id.endsWith('Font')) {
    const prefix = id.slice(0, -4), picker = fontPickers.get(prefix)
    if (picker && picker.menu.hidden) picker.button.textContent = fontLabels.get(value) || value || '系統預設字體'
  }
}
const check = (id, value) => { if (document.activeElement !== $(id)) $(id).checked = !!value }
const valueLabel = (id, suffix = '') => { $(`${id}Value`).textContent = `${$(id).value}${suffix}` }

const allDirections = [['rtl', '右到左'], ['ltr', '左到右'], ['ttb', '從上到下'], ['btt', '從下到上']]
const directions = { horizontal: allDirections, vertical: allDirections }
function updateDirectionOptions(preferred) {
  const layout = $('marqueeLayout').value
  const select = $('marqueeDirection')
  const wanted = directions[layout].some(([value]) => value === preferred) ? preferred : directions[layout][0][0]
  select.replaceChildren(...directions[layout].map(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    return option
  }))
  select.value = wanted
}

function paint(s) {
  state = s
  const r = s.reminder
  $('rStatus').textContent = { idle: '未開始', running: '進行中', paused: '已暫停', finished: '已結束' }[r.status] || r.status
  $('rElapsed').textContent = r.elapsedText
  $('rNext').textContent = r.nextText
  for (const id of ['timedEnabled', 'temporaryEnabled', 'marqueeEnabled', 'imageEnabled']) check(id, r[id])
  check('boundToMeditation', r.boundToMeditation)
  check('manualResetsInterval', r.manualResetsInterval)
  const preset = [5, 10, 15, 30].includes(r.intervalMinutes)
  set('intervalPreset', preset ? String(r.intervalMinutes) : 'custom')
  set('intervalMinutes', r.intervalMinutes)
  for (const id of ['durationSeconds', 'fadeInSeconds', 'fadeOutSeconds', 'effect', 'timeFormat', 'gap']) set(id, r[id])
  set('rText', r.text)
  check('showTime', r.showTime)
  check('sameLine', r.sameLine)
  for (const [prefix, style] of [['text', r.textStyle], ['time', r.timeStyle]]) {
    for (const key of ['Font', 'Size', 'Color', 'StrokeWidth', 'StrokeColor', 'GlowColor', 'GlowSize']) set(prefix + key, style[key[0].toLowerCase() + key.slice(1)])
    check(prefix + 'Stroke', style.stroke)
    check(prefix + 'Glow', style.glow)
  }
  set('overlayColor', r.overlayColor)
  set('overlayOpacity', r.overlayOpacity)
  $('overlayValue').textContent = `${Math.round(r.overlayOpacity * 100)}%`
  for (const id of ['textSize', 'timeSize', 'textStrokeWidth', 'timeStrokeWidth', 'textGlowSize', 'timeGlowSize']) valueLabel(id, ' px')

  set('marqueeLayout', r.marquee.layout || (['ttb', 'btt'].includes(r.marquee.direction) ? 'vertical' : 'horizontal'))
  if (document.activeElement !== $('marqueeDirection')) updateDirectionOptions(r.marquee.direction)
  set('marqueeSpeed', r.marquee.speed)
  valueLabel('marqueeSpeed')
  set('imageSize', r.image.size)
  valueLabel('imageSize', '%')
  set('tempText', r.temporary.text);set('tempPosition',r.temporary.position);set('tempDuration',r.temporary.durationSeconds)
  for(const key of ['Font','Size','Color','StrokeWidth','StrokeColor','GlowColor','GlowSize'])set('temp'+key,r.temporary.style[key[0].toLowerCase()+key.slice(1)])
  check('tempStroke',r.temporary.style.stroke);check('tempGlow',r.temporary.style.glow);check('tempFadeIn',r.temporary.fadeIn);check('tempFadeOut',r.temporary.fadeOut);set('tempFadeInSeconds',r.temporary.fadeInSeconds);set('tempFadeOutSeconds',r.temporary.fadeOutSeconds);valueLabel('tempSize',' px');valueLabel('tempStrokeWidth',' px');valueLabel('tempGlowSize',' px')
  set('marqueeText',r.marquee.text);set('marqueeFont',r.marquee.style.font);set('marqueeSize',r.marquee.style.size);set('marqueeColor',r.marquee.style.color);set('marqueeBackground',r.marquee.background);set('marqueeOpacity',r.marquee.opacity);set('marqueeStrokeWidth',r.marquee.style.strokeWidth);set('marqueeStrokeColor',r.marquee.style.strokeColor);set('marqueeGlowColor',r.marquee.style.glowColor);set('marqueeGlowSize',r.marquee.style.glowSize);check('marqueeStroke',r.marquee.style.stroke);check('marqueeGlow',r.marquee.style.glow);check('marqueeFadeIn',r.marquee.fadeIn);check('marqueeFadeOut',r.marquee.fadeOut);set('marqueeFadeInSeconds',r.marquee.fadeInSeconds);set('marqueeFadeOutSeconds',r.marquee.fadeOutSeconds);valueLabel('marqueeSize',' px');valueLabel('marqueeStrokeWidth',' px');valueLabel('marqueeGlowSize',' px');$('marqueeOpacityValue').textContent=`${Math.round(r.marquee.opacity*100)}%`
}

function style(prefix) {
  return { font: $(prefix + 'Font').value, size: Number($(prefix + 'Size').value), color: $(prefix + 'Color').value, stroke: $(prefix + 'Stroke').checked, strokeWidth: Number($(prefix + 'StrokeWidth').value), strokeColor: $(prefix + 'StrokeColor').value, glow: $(prefix + 'Glow').checked, glowSize: Number($(prefix + 'GlowSize').value), glowColor: $(prefix + 'GlowColor').value }
}
function config() {
  return {
    timedEnabled: $('timedEnabled').checked, temporaryEnabled: $('temporaryEnabled').checked, marqueeEnabled: $('marqueeEnabled').checked, imageEnabled: $('imageEnabled').checked,
    boundToMeditation: $('boundToMeditation').checked, manualResetsInterval: $('manualResetsInterval').checked,
    intervalMinutes: Number($('intervalPreset').value === 'custom' ? $('intervalMinutes').value : $('intervalPreset').value),
    durationSeconds: Number($('durationSeconds').value), fadeInSeconds: Number($('fadeInSeconds').value), fadeOutSeconds: Number($('fadeOutSeconds').value),
    text: $('rText').value, showTime: $('showTime').checked, timeFormat: $('timeFormat').value, sameLine: $('sameLine').checked, gap: Number($('gap').value),
    effect: $('effect').value, overlayColor: $('overlayColor').value, overlayOpacity: Number($('overlayOpacity').value), textStyle: style('text'), timeStyle: style('time'),
  }
}

new EventSource('/api/events').onmessage = event => paint(JSON.parse(event.data))
fetch('/api/state').then(response => response.json()).then(paint)
$('save').onclick = () => api('/api/reminder/config', config()).catch(alert)
$('start').onclick = () => api('/api/reminder/start').catch(alert)
$('pause').onclick = () => api(state?.reminder.status === 'paused' ? '/api/reminder/start' : '/api/reminder/pause').catch(alert)
$('reset').onclick = () => api('/api/reminder/reset').catch(alert)
$('trigger').onclick = () => api('/api/reminder/trigger').catch(alert)
$('intervalPreset').onchange = () => { if ($('intervalPreset').value !== 'custom') $('intervalMinutes').value = $('intervalPreset').value }
$('overlayOpacity').oninput = () => $('overlayValue').textContent = `${Math.round($('overlayOpacity').value * 100)}%`

let saveTimer
const saveConfigSoon = () => {
  const next = config()
  clearTimeout(saveTimer)
  api('/api/reminder/preview',{mode:'timed'}).catch(console.error)
  saveTimer = setTimeout(() => api('/api/reminder/config', next).catch(console.error), 100)
}
$('intervalMinutes').addEventListener('input', () => {
  $('intervalPreset').value = 'custom'
  saveConfigSoon()
})
for (const element of document.querySelectorAll('section:first-of-type input:not(.reminder-enable),section:first-of-type select')) {
  element.addEventListener(element.type === 'range' ? 'input' : 'change', saveConfigSoon)
}
for (const id of ['textSize', 'timeSize', 'textStrokeWidth', 'timeStrokeWidth', 'textGlowSize', 'timeGlowSize']) $(id).addEventListener('input', () => valueLabel(id, ' px'))
for (const id of ['timedEnabled', 'temporaryEnabled', 'marqueeEnabled', 'imageEnabled']) {
  $(id).addEventListener('change', () => api('/api/reminder/config', { [id]: $(id).checked }).catch(console.error))
}

const tempTexts = ['請保持安靜', '活動即將開始', '請將手機調為靜音', '可自由調整為舒適坐姿', '休息時間即將結束', '請回到座位', '請勿拍照錄音錄影', '請依次出班']
for (const text of tempTexts) {
  const button = document.createElement('button')
  button.textContent = text
  button.onclick = () => { $('tempText').value = text; showTemp() }
  $('tempPresets').append(button)
}
function temporarySettings() { return { text:$('tempText').value,position:$('tempPosition').value,durationSeconds:Number($('tempDuration').value),fadeIn:$('tempFadeIn').checked,fadeInSeconds:Number($('tempFadeInSeconds').value),fadeOut:$('tempFadeOut').checked,fadeOutSeconds:Number($('tempFadeOutSeconds').value),style:style('temp') } }
function showTemp() { api('/api/reminder/temp/show', temporarySettings()).catch(alert) }
$('tempShow').onclick = showTemp
$('tempHide').onclick = () => api('/api/reminder/temp/hide').catch(alert)
for(const id of ['tempText','tempPosition','tempDuration','tempFont','tempSize','tempColor','tempStroke','tempStrokeWidth','tempStrokeColor','tempGlow','tempGlowColor','tempGlowSize','tempFadeIn','tempFadeInSeconds','tempFadeOut','tempFadeOutSeconds'])$(id).addEventListener(['range','text','color','number'].includes($(id).type)?'input':'change',()=>{if(['tempSize','tempStrokeWidth','tempGlowSize'].includes(id))valueLabel(id,' px');api('/api/reminder/config',{temporary:temporarySettings()}).catch(console.error);api('/api/reminder/preview',{mode:'temporary'}).catch(console.error)})

$('marqueeLayout').onchange = () => updateDirectionOptions()
$('marqueeSpeed').oninput = () => valueLabel('marqueeSpeed')
function marqueeSettings(){return{text:$('marqueeText').value,layout:$('marqueeLayout').value,direction:$('marqueeDirection').value,speed:Number($('marqueeSpeed').value),background:$('marqueeBackground').value,opacity:Number($('marqueeOpacity').value),fadeIn:$('marqueeFadeIn').checked,fadeInSeconds:Number($('marqueeFadeInSeconds').value),fadeOut:$('marqueeFadeOut').checked,fadeOutSeconds:Number($('marqueeFadeOutSeconds').value),style:style('marquee')}}
$('marqueeShow').onclick = () => api('/api/reminder/marquee/show', marqueeSettings()).catch(alert)
$('marqueeHide').onclick = () => api('/api/reminder/marquee/hide').catch(alert)
for(const id of ['marqueeText','marqueeLayout','marqueeDirection','marqueeFont','marqueeColor','marqueeBackground','marqueeSize','marqueeOpacity','marqueeSpeed','marqueeStroke','marqueeStrokeWidth','marqueeStrokeColor','marqueeGlow','marqueeGlowColor','marqueeGlowSize','marqueeFadeIn','marqueeFadeInSeconds','marqueeFadeOut','marqueeFadeOutSeconds'])$(id).addEventListener(['range','text','color','number'].includes($(id).type)?'input':'change',()=>{if(['marqueeSize','marqueeStrokeWidth','marqueeGlowSize'].includes(id))valueLabel(id,' px');if(id==='marqueeOpacity')$('marqueeOpacityValue').textContent=`${Math.round($('marqueeOpacity').value*100)}%`;api('/api/reminder/config',{marquee:marqueeSettings()}).catch(console.error);api('/api/reminder/preview',{mode:'marquee'}).catch(console.error)})

$('imageSize').oninput = () => {
  valueLabel('imageSize', '%')
  api('/api/reminder/config', { image: { size: Number($('imageSize').value) } }).catch(console.error)
  api('/api/reminder/preview',{mode:'image'}).catch(console.error)
}
$('imageFile').onchange = () => {
  const file = $('imageFile').files[0]
  if (!file) return
  if (file.type !== 'image/png') return alert('請選擇 PNG 檔')
  const reader = new FileReader()
  reader.onload = () => {
    imageData = reader.result
    api('/api/reminder/config', { image: { url: imageData, size: Number($('imageSize').value) } }).catch(alert)
  }
  reader.readAsDataURL(file)
}
$('imageShow').onclick = () => {
  const url = imageData || state.reminder.image.url
  if (!url) return alert('請先選擇 PNG 圖片')
  api('/api/reminder/image/show', { url, size: Number($('imageSize').value), durationSeconds: Number($('imageDuration').value), effect: $('imageEffect').value }).catch(alert)
}
$('imageHide').onclick = () => api('/api/reminder/image/hide').catch(alert)
$('hideAll').onclick = () => api('/api/reminder/hide-all').catch(alert)
