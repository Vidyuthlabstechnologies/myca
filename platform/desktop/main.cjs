const { app, BrowserWindow } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT || 4780);

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: 'MyCA',
    backgroundColor: '#0c1220',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/?v=9`);
}

app.whenReady().then(async () => {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '../src/server.mjs')).href);
  await startServer(PORT);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
