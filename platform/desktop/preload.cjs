const { contextBridge, ipcRenderer } = require('electron');

const apiToken = ipcRenderer.sendSync('myca:api-token');

contextBridge.exposeInMainWorld('myca', {
  apiToken,
  saveInvoicePdf: (payload) => ipcRenderer.invoke('myca:save-pdf', payload || {}),
  openExternal: (url) => ipcRenderer.invoke('myca:open-external', String(url || '')),
});
