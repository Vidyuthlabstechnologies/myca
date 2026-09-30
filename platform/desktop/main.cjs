const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { writeFileSync, unlinkSync } = require('fs');

const PORT = Number(process.env.PORT || 4780);
const MAX_HTML_BYTES = 5 * 1024 * 1024;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/?v=17`);
}

ipcMain.handle('myca:save-pdf', async (_event, payload = {}) => {
  const html = String(payload.html || '');
  if (!html) return { ok: false, error: 'NO_CONTENT' };
  if (html.length > MAX_HTML_BYTES) return { ok: false, error: 'CONTENT_TOO_LARGE' };
  const suggested = String(payload.suggestedName || 'MyCA-document.pdf').replace(/[\\/:*?"<>|]/g, '-');
  const tmpHtml = path.join(app.getPath('temp'), `myca-print-${Date.now()}.html`);
  let win;
  try {
    writeFileSync(tmpHtml, html, 'utf8');
    win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    await win.loadFile(tmpHtml);
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF',
      defaultPath: suggested.endsWith('.pdf') ? suggested : `${suggested}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    writeFileSync(filePath, pdf);
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    try { unlinkSync(tmpHtml); } catch { /* ignore */ }
  }
});

ipcMain.handle('myca:open-external', async (_event, url) => {
  const target = String(url || '');
  const allowed = /^mailto:[^<>\s]+$/i.test(target)
    || /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(target);
  if (!allowed) return { ok: false, error: 'URL_NOT_ALLOWED' };
  await shell.openExternal(target);
  return { ok: true };
});

app.whenReady().then(async () => {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '../src/server.mjs')).href);
  const started = await startServer(PORT);
  if (started.error) dialog.showErrorBox('MyCA could not open your books', started.error);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
