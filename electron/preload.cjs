const { contextBridge, ipcRenderer } = require('electron');
const names = ['models', 'chat', 'cancel', 'importFile', 'saveFile', 'notify', 'screenshot', 'command', 'openChrome', 'permissions'];
contextBridge.exposeInMainWorld('desktop', Object.fromEntries(names.map(name => [name, payload => ipcRenderer.invoke(name, payload)])));
