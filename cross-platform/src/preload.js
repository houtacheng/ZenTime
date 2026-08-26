const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('meditation', {
  getState: () => ipcRenderer.invoke('state:get'),
  command: (name, value) => ipcRenderer.invoke('command', name, value),
  chooseFile: kind => ipcRenderer.invoke('file:choose', kind),
  chooseFiles: kind => ipcRenderer.invoke('files:choose', kind),
  getAddresses: () => ipcRenderer.invoke('network:addresses'),
  getFonts: () => ipcRenderer.invoke('fonts:list'),
  openBrowser: url => ipcRenderer.invoke('browser:open', url),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  dragPosition: (target, position, phase) => ipcRenderer.send('position:drag', target, position, phase),
  dragParticipantWindow: (point, phase) => ipcRenderer.send('participant:window-drag', point, phase),
  resizeParticipantWindow: (edge, phase) => ipcRenderer.send('participant:window-resize', edge, null, phase),
  toggleParticipantFullscreen: () => ipcRenderer.send('participant:toggle-fullscreen'),
})
