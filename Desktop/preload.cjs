const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desk', {
  filePath: (f) => webUtils.getPathForFile(f),
  call: (name, data) => ipcRenderer.invoke('desk', name, data),
  on: (fn) => {
    const handler = (_, event) => fn(event);
    ipcRenderer.on('update', handler);
    return () => ipcRenderer.removeListener('update', handler);
  },
});
