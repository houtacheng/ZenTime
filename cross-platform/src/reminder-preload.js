const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('reminderWindow', {
  reportContentSize: payload => ipcRenderer.send('reminder:content-size', payload),
})

window.addEventListener('DOMContentLoaded', () => {
  const sendResize = (edge, phase) => ipcRenderer.send('reminder:window-resize', edge, null, phase)
  const sendDrag = phase => ipcRenderer.send('reminder:window-drag', null, phase)
  let resizing = false
  let dragging = false
  let pointerId = null
  let resizeEdge = null
  window.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    const handle = event.target.closest?.('.resize-handle')
    event.preventDefault()
    event.stopPropagation()
    pointerId = event.pointerId
    if (handle) {
      resizing = true
      resizeEdge = handle.dataset.edge
    } else dragging = true
    event.target.setPointerCapture?.(event.pointerId)
    if (resizing) sendResize(resizeEdge, 'begin')
    else sendDrag('begin')
  })
  window.addEventListener('pointermove', event => {
    if (resizing && event.pointerId === pointerId) {
      event.preventDefault()
      sendResize(resizeEdge, 'move')
    } else if (dragging && event.pointerId === pointerId) {
      event.preventDefault()
      sendDrag('move')
    }
  })
  const endResize = event => {
    if (resizing) ipcRenderer.send('reminder:window-resize', resizeEdge, null, 'end')
    if (dragging) sendDrag('end')
    resizing = false
    dragging = false
    pointerId = null
    resizeEdge = null
  }
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  window.addEventListener('dblclick', () => ipcRenderer.send('reminder:toggle-fullscreen'))
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    ipcRenderer.send('reminder:escape')
  }, true)
})
