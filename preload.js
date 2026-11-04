// Safe bridge between the pet window and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bytepet', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onEvent: (cb) => ipcRenderer.on('event', (_e, ev) => cb(ev)),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  action: (name) => ipcRenderer.send('action', name),
  contextMenu: () => ipcRenderer.send('context-menu'),
  ready: () => ipcRenderer.send('ready'),
  onToast: (cb) => ipcRenderer.on('toast', (_e, t) => cb(t)),
  messClick: (kind) => ipcRenderer.send('mess-click', kind),
  graveClick: (id) => ipcRenderer.send('grave-click', id),
  onReset: (cb) => ipcRenderer.on('reset', () => cb()),
});
