const $ = id => document.getElementById(id)
const mode = new URLSearchParams(location.search).get('mode') || 'timed'
const embedded = new URLSearchParams(location.search).get('embedded') === '1'
const modeNames = { timed: '定時提醒', temporary: '臨時文字提醒', marquee: '跑馬燈提醒', image: 'PNG 圖片提醒' }
document.body.dataset.mode = mode
document.body.dataset.embedded = String(embedded)
$('hoverHint').textContent = `${modeNames[mode]} · 拖曳調整位置 · 滑鼠離開後隱藏預覽`

const modeElements = { timed: ['timed', 'timedPreview'], temporary: ['temporary'], marquee: ['marquee'], image: ['image', 'imagePreview'] }
let lastContentSize = ''
let latestMarquee = null
let lastMarqueeMotion = ''
let lastMarqueeStyle = ''
function reportContentSize(payload) {
  const signature = JSON.stringify(payload)
  if (signature === lastContentSize) return
  lastContentSize = signature
  window.reminderWindow?.reportContentSize(payload)
}
function syncMarqueeSpeed() {
  if (mode !== 'marquee' || !latestMarquee) return
  const span = $('marqueeText'), horizontalMotion = ['rtl', 'ltr'].includes(latestMarquee.direction)
  const signature = JSON.stringify([latestMarquee.direction, latestMarquee.speed, latestMarquee.text, latestMarquee.layout, latestMarquee.style.size, innerWidth, innerHeight, span.scrollWidth, span.scrollHeight])
  if (signature === lastMarqueeMotion) return
  lastMarqueeMotion = signature
  const distance = horizontalMotion ? window.innerWidth + span.scrollWidth : window.innerHeight + span.scrollHeight
  $('marquee').style.setProperty('--duration', `${Math.max(.5, distance / Math.max(20, latestMarquee.speed))}s`)
  $('marquee').style.setProperty('--track-width', `${$('marquee').clientWidth}px`)
  $('marquee').style.setProperty('--track-height', `${$('marquee').clientHeight}px`)
}
function position(element, value, fallback = { x: 50, y: 50 }) { const p = value || fallback; element.style.left = `${p.x}%`; element.style.top = `${p.y}%` }
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
  const enabled = { timed: r.timedEnabled, temporary: r.temporaryEnabled, marquee: r.marqueeEnabled, image: r.imageEnabled }[mode]
  document.documentElement.style.visibility = enabled ? 'visible' : 'hidden'
  const controlPreview = !!s.reminderPreview?.[mode]
  $('stage').classList.toggle('control-preview', controlPreview)
  const fullRed = mode === 'timed' && r.timed?.effect === 'red'
  $('stage').classList.toggle('fullscreen-red', fullRed)
  $('stage').style.backgroundColor = fullRed ? colorAlpha(r.overlayColor, r.overlayOpacity) : ''
  if (mode === 'timed') {
  const timed = $('timed')
  timed.className = `notice ${r.sameLine ? '' : 'column'}`
  timed.style.gap = `${r.gap}px`
  timed.style.setProperty('--fade-in', `${r.fadeInSeconds}s`)
  timed.style.setProperty('--fade-out', `${r.fadeOutSeconds}s`)
  timed.style.setProperty('--overlay', r.overlayColor)
  timed.style.setProperty('--overlay-opacity', r.overlayOpacity)
  const timedContent = $('timedContent')
  timedContent.className = `notice-content ${r.sameLine ? '' : 'column'}`
  timedContent.style.gap = `${r.gap}px`
  position(timedContent, embedded ? r.position : null)
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
  const previewContent = $('previewContent')
  previewContent.className = `notice-content ${r.sameLine ? '' : 'column'}`
  previewContent.style.gap = `${r.gap}px`
  position(previewContent, embedded ? r.position : null)
  $('previewText').textContent = r.text || '提醒'
  $('previewTime').textContent = r.showTime ? r.timeText : ''
  styleText($('previewText'), r.textStyle)
  styleText($('previewTime'), r.timeStyle)
  preview.hidden = mode !== 'timed' || !!r.timed
  }

  if (mode === 'temporary') {
  const temporary = $('temporary')
  temporary.textContent = r.temporary.text
  temporary.className = `temporary ${r.temporary.position} ${embedded ? 'positioned' : ''}`
  position(temporary, embedded ? r.temporary.screenPosition : null)
  if (mode === 'temporary' && r.temporaryPhase) temporary.classList.add('active', r.temporaryPhase)
  temporary.classList.toggle('preview', mode === 'temporary' && !r.temporaryVisible)
  temporary.style.setProperty('--fade-in', `${r.temporary.fadeInSeconds}s`)
  temporary.style.setProperty('--fade-out', `${r.temporary.fadeOutSeconds}s`)
  styleText(temporary, r.temporary.style)
  }

  if (mode === 'marquee') {
  const marquee = $('marquee')
  if ($('marqueeText').textContent !== r.marquee.text) $('marqueeText').textContent = r.marquee.text
  const vertical = r.marquee.layout === 'vertical'
  latestMarquee = r.marquee
  const marqueeClasses = ['marquee', embedded ? 'positioned' : '', vertical ? 'vertical' : 'horizontal', r.marquee.direction]
  if (mode === 'marquee' && r.marqueePhase) marqueeClasses.push('active', r.marqueePhase)
  if (mode === 'marquee' && !r.marquee.active) marqueeClasses.push('preview')
  const marqueeClassName = marqueeClasses.filter(Boolean).join(' ')
  if (marquee.className !== marqueeClassName) marquee.className = marqueeClassName
  const marqueePosition = r.marquee.screenPosition || { x: 50, y: 82 }
  const marqueeBackground = colorAlpha(r.marquee.background, r.marquee.opacity)
  const marqueeStyleSignature = JSON.stringify([marqueePosition, r.marquee.width, r.marquee.height, marqueeBackground, r.marquee.fadeInSeconds, r.marquee.fadeOutSeconds, r.marquee.style, r.marquee.layout, r.marquee.direction, r.marquee.speed, r.marquee.text])
  if (marqueeStyleSignature !== lastMarqueeStyle) {
    lastMarqueeStyle = marqueeStyleSignature; lastMarqueeMotion = ''
    marquee.style.setProperty('--marquee-x', `${marqueePosition.x}%`)
    marquee.style.setProperty('--marquee-y', `${marqueePosition.y}%`)
    marquee.style.setProperty('--marquee-width', `${r.marquee.width ?? 80}%`)
    marquee.style.setProperty('--marquee-height', `${r.marquee.height ?? 14}%`)
    marquee.style.backgroundColor = marqueeBackground
    $('marqueeBar').style.backgroundColor = marqueeBackground
    marquee.style.setProperty('--marquee-background', marqueeBackground)
    marquee.style.setProperty('--fade-in', `${r.marquee.fadeInSeconds}s`)
    marquee.style.setProperty('--fade-out', `${r.marquee.fadeOutSeconds}s`)
    styleText($('marqueeText'), r.marquee.style)
    requestAnimationFrame(syncMarqueeSpeed)
  }
  if (mode === 'marquee') {
    const extra = Math.max(r.marquee.style.glow ? r.marquee.style.glowSize * 2 : 0, r.marquee.style.stroke ? r.marquee.style.strokeWidth * 2 : 0)
    reportContentSize({ mode: 'marquee', layout: r.marquee.layout, thickness: Math.ceil(r.marquee.style.size * 1.55 + extra + 24) })
  }
  }

  if (mode === 'image') {
  const image = $('image')
  if (image.src !== (r.image.url || '')) image.src = r.image.url || ''
  const pulseScale = r.image.effect === 'pulse' ? 1 / 1.1 : 1
  image.style.width = embedded ? `${pulseScale * r.image.size}vw` : `${pulseScale * 100}%`
  image.style.height = embedded ? `${pulseScale * r.image.size}vh` : `${pulseScale * 100}%`
  position(image, embedded ? r.image.screenPosition : null)
  image.className = mode === 'image' && r.imageVisible ? `active ${r.image.effect === 'pulse' ? 'pulse' : ''}` : ''
  if (mode === 'image' && r.image.url && !r.imageVisible) image.classList.add('preview')
  const imagePreview = $('imagePreview')
  imagePreview.textContent = r.image.url ? 'PNG 圖片預覽' : '尚未選擇 PNG 圖片'
  imagePreview.classList.toggle('preview', mode === 'image' && !r.imageVisible && !r.image.url)
  if (mode === 'image' && image.complete && image.naturalWidth) reportContentSize({ mode: 'image', naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, size: r.image.size, effect: r.image.effect })
  }
}

new EventSource('/api/events').onmessage = event => paint(JSON.parse(event.data))
fetch('/api/state').then(response => response.json()).then(paint)
$('stage').onmouseenter = () => $('stage').classList.add('hovered')
$('stage').onmouseleave = () => $('stage').classList.remove('hovered')
$('image').onload = () => { if (mode === 'image' && $('image').naturalWidth) fetch('/api/state').then(response => response.json()).then(s => reportContentSize({ mode: 'image', naturalWidth: $('image').naturalWidth, naturalHeight: $('image').naturalHeight, size: s.reminder.image.size, effect: s.reminder.image.effect })) }
window.addEventListener('resize', () => { lastMarqueeMotion = ''; requestAnimationFrame(syncMarqueeSpeed) })
