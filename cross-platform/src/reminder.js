const $ = id => document.getElementById(id)
const mode = new URLSearchParams(location.search).get('mode') || 'timed'
const modeNames = { timed: '定時提醒', temporary: '臨時文字提醒', marquee: '跑馬燈提醒', image: 'PNG 圖片提醒' }
document.body.dataset.mode = mode
$('hoverHint').textContent = `${modeNames[mode]} · 拖曳調整位置 · 滑鼠離開後隱藏預覽`

const modeElements = { timed: ['timed', 'timedPreview'], temporary: ['temporary'], marquee: ['marquee'], image: ['image', 'imagePreview'] }
let lastContentSize = ''
let latestMarquee = null
function reportContentSize(payload) {
  const signature = JSON.stringify(payload)
  if (signature === lastContentSize) return
  lastContentSize = signature
  window.reminderWindow?.reportContentSize(payload)
}
function syncMarqueeSpeed() {
  if (mode !== 'marquee' || !latestMarquee) return
  const span = $('marqueeText'), horizontalMotion = ['rtl', 'ltr'].includes(latestMarquee.direction)
  const distance = horizontalMotion ? window.innerWidth + span.getBoundingClientRect().width : window.innerHeight + span.getBoundingClientRect().height
  $('marquee').style.setProperty('--duration', `${Math.max(.5, distance / Math.max(20, latestMarquee.speed))}s`)
}
for (const id of ['timed', 'timedPreview', 'temporary', 'marquee', 'image', 'imagePreview']) {
  if (!modeElements[mode].includes(id)) $(id).hidden = true
}

function shadow(style) {
  const layers = []
  // Draw the outline as shadows behind the glyph fill. Unlike -webkit-text-stroke,
  // this never covers the inside half of the original letter shapes.
  if (style.stroke && Number(style.strokeWidth) > 0) {
    const width = Number(style.strokeWidth)
    for (let radius = .5; radius <= width; radius += .5) {
      const points = Math.max(12, Math.ceil(radius * 8))
      for (let index = 0; index < points; index++) {
        const angle = index * Math.PI * 2 / points
        layers.push(`${(Math.cos(angle) * radius).toFixed(2)}px ${(Math.sin(angle) * radius).toFixed(2)}px 0 ${style.strokeColor}`)
      }
    }
  }
  if (style.glow) layers.push(`0 0 ${style.glowSize}px ${style.glowColor}`, `0 0 ${style.glowSize * 2}px ${style.glowColor}`)
  return layers.join(',') || 'none'
}
function styleText(element, style) {
  element.style.fontFamily = style.font === '系統預設字體' ? 'system-ui' : `"${style.font}",system-ui`
  element.style.fontSize = `${style.size}px`
  element.style.color = style.color
  element.style.webkitTextStroke = '0 transparent'
  element.style.textShadow = shadow(style)
}
function colorAlpha(hex, alpha) {
  const value = (hex || '#000000').replace('#', '')
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${alpha})`
}

function paint(s) {
  const r = s.reminder
  const controlPreview = !!s.reminderPreview?.[mode]
  $('stage').classList.toggle('control-preview', controlPreview)
  const fullRed = mode === 'timed' && r.timed?.effect === 'red'
  $('stage').classList.toggle('fullscreen-red', fullRed)
  $('stage').style.backgroundColor = fullRed ? colorAlpha(r.overlayColor, r.overlayOpacity) : ''
  const timed = $('timed')
  timed.className = `notice ${r.sameLine ? '' : 'column'}`
  timed.style.gap = `${r.gap}px`
  timed.style.setProperty('--fade-in', `${r.fadeInSeconds}s`)
  timed.style.setProperty('--fade-out', `${r.fadeOutSeconds}s`)
  timed.style.setProperty('--overlay', r.overlayColor)
  timed.style.setProperty('--overlay-opacity', r.overlayOpacity)
  if (r.timed && mode === 'timed') {
    $('timedText').textContent = r.timed.text
    $('timedTime').textContent = r.showTime ? r.timed.timeText : ''
    styleText($('timedText'), r.textStyle)
    styleText($('timedTime'), r.timeStyle)
    timed.classList.add(r.timed.phase, r.timed.effect)
  }

  const preview = $('timedPreview')
  preview.className = `notice preview ${r.sameLine ? '' : 'column'}`
  preview.style.gap = `${r.gap}px`
  $('previewText').textContent = r.text || '提醒'
  $('previewTime').textContent = r.showTime ? r.timeText : ''
  styleText($('previewText'), r.textStyle)
  styleText($('previewTime'), r.timeStyle)
  preview.hidden = mode !== 'timed' || !!r.timed

  const temporary = $('temporary')
  temporary.textContent = r.temporary.text
  temporary.className = `temporary ${r.temporary.position}`
  if (mode === 'temporary' && r.temporaryPhase) temporary.classList.add('active', r.temporaryPhase)
  temporary.classList.toggle('preview', mode === 'temporary' && !r.temporaryVisible)
  temporary.style.setProperty('--fade-in', `${r.temporary.fadeInSeconds}s`)
  temporary.style.setProperty('--fade-out', `${r.temporary.fadeOutSeconds}s`)
  styleText(temporary, r.temporary.style)

  const marquee = $('marquee')
  $('marqueeText').textContent = r.marquee.text
  const vertical = r.marquee.layout === 'vertical'
  latestMarquee = r.marquee
  marquee.className = `marquee ${vertical ? 'vertical' : 'horizontal'} ${r.marquee.direction}`
  if (mode === 'marquee' && r.marqueePhase) marquee.classList.add('active', r.marqueePhase)
  marquee.classList.toggle('preview', mode === 'marquee' && !r.marquee.active)
  const marqueeBackground = colorAlpha(r.marquee.background, r.marquee.opacity)
  marquee.style.backgroundColor = marqueeBackground
  marquee.style.setProperty('--marquee-background', marqueeBackground)
  marquee.style.setProperty('--fade-in', `${r.marquee.fadeInSeconds}s`)
  marquee.style.setProperty('--fade-out', `${r.marquee.fadeOutSeconds}s`)
  styleText($('marqueeText'), r.marquee.style)
  requestAnimationFrame(syncMarqueeSpeed)
  if (mode === 'marquee') {
    const extra = Math.max(r.marquee.style.glow ? r.marquee.style.glowSize * 2 : 0, r.marquee.style.stroke ? r.marquee.style.strokeWidth * 2 : 0)
    reportContentSize({ mode: 'marquee', layout: r.marquee.layout, thickness: Math.ceil(r.marquee.style.size * 1.55 + extra + 24) })
  }

  const image = $('image')
  if (image.src !== (r.image.url || '')) image.src = r.image.url || ''
  const pulseScale = r.image.effect === 'pulse' ? 1 / 1.1 : 1
  image.style.width = `${pulseScale * 100}%`
  image.style.height = `${pulseScale * 100}%`
  image.className = mode === 'image' && r.imageVisible ? `active ${r.image.effect === 'pulse' ? 'pulse' : ''}` : ''
  if (mode === 'image' && r.image.url && !r.imageVisible) image.classList.add('preview')
  const imagePreview = $('imagePreview')
  imagePreview.textContent = r.image.url ? 'PNG 圖片預覽' : '尚未選擇 PNG 圖片'
  imagePreview.classList.toggle('preview', mode === 'image' && !r.imageVisible && !r.image.url)
  if (mode === 'image' && image.complete && image.naturalWidth) reportContentSize({ mode: 'image', naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, size: r.image.size, effect: r.image.effect })
}

new EventSource('/api/events').onmessage = event => paint(JSON.parse(event.data))
fetch('/api/state').then(response => response.json()).then(paint)
$('stage').onmouseenter = () => $('stage').classList.add('hovered')
$('stage').onmouseleave = () => $('stage').classList.remove('hovered')
$('image').onload = () => { if (mode === 'image' && $('image').naturalWidth) fetch('/api/state').then(response => response.json()).then(s => reportContentSize({ mode: 'image', naturalWidth: $('image').naturalWidth, naturalHeight: $('image').naturalHeight, size: s.reminder.image.size, effect: s.reminder.image.effect })) }
window.addEventListener('resize', () => requestAnimationFrame(syncMarqueeSpeed))
