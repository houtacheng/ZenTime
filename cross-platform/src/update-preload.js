const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zenUpdate', {
  onProgress: callback => ipcRenderer.on('update:progress', (_event, data) => callback(data)),
})
