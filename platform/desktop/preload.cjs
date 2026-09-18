const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myca', {
  saveInvoicePdf: (payload) => ipcRenderer.invoke('myca:save-pdf', payload || {}),
});
