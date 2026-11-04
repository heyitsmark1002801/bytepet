// Safe bridge for the mini-games overlay.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameApi', {
  info: () => ipcRenderer.invoke('game:info'),
  result: (r) => ipcRenderer.invoke('game:result', r),
  close: () => ipcRenderer.invoke('game:close'),
});
