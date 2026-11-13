const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { writeFileSync, unlinkSync } = require('fs');
const { randomBytes } = require('crypto');
const { checkForUpdate } = require('./update-check.cjs');
const { fetchAndVerify, runInstallerSilently } = require('./update-install.cjs');
const { isAppUrl, externalTarget, fromApp } = require('./window-guard.cjs');

const PORT = process.env.PORT ? Number(process.env.PORT) : app.isPackaged ? 0 : 4780;
if (app.isPackaged) process.env.MYCA_REQUIRE_SAFE_STORAGE = '1';
const apiToken = randomBytes(32).toString('hex');
process.env.MYCA_API_TOKEN = apiToken;
process.env.MYCA_TOKEN_IN_PAGE = '0';
const MAX_HTML_BYTES = 5 * 1024 * 1024;
let mainWindow = null;
let appPort = 0;

function createWindow(port) {
  appPort = port;
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const target = externalTarget(url);
    if (target) shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, port)) return;
    event.preventDefault();
    const target = externalTarget(url);
    if (target) shell.openExternal(target);
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.loadURL(`http://127.0.0.1:${port}/?v=17`);
}

ipcMain.handle('myca:save-pdf', async (event, payload = {}) => {
  if (!fromApp(event, appPort)) return { ok: false, error: 'NOT_FROM_MYCA' };
  const html = String(payload.html || '');
  if (!html) return { ok: false, error: 'NO_CONTENT' };
  if (html.length > MAX_HTML_BYTES) return { ok: false, error: 'CONTENT_TOO_LARGE' };
  const suggested = String(payload.suggestedName || 'MyCA-document.pdf').replace(/[\\/:*?"<>|]/g, '-');
  const tmpHtml = path.join(app.getPath('temp'), `myca-print-${Date.now()}.html`);
  let win;
  try {
    const strict = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;
    writeFileSync(tmpHtml, /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (open) => `${open}${strict}`) : `${strict}${html}`, 'utf8');
    win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false, webSecurity: true, allowRunningInsecureContent: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
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

ipcMain.handle('myca:open-external', async (event, url) => {
  if (!fromApp(event, appPort)) return { ok: false, error: 'NOT_FROM_MYCA' };
  const target = String(url || '');
  const allowed = /^mailto:[^<>\s]+$/i.test(target)
    || /^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(target);
  if (!allowed) return { ok: false, error: 'URL_NOT_ALLOWED' };
  await shell.openExternal(target);
  return { ok: true };
});

ipcMain.on('myca:api-token', (event) => {
  event.returnValue = fromApp(event, appPort) ? apiToken : '';
});

async function offerUpdate() {
  if (!app.isPackaged && !process.env.MYCA_UPDATE_URL) return;
  const found = await checkForUpdate({ current: app.getVersion() });
  if (!found.ok || !found.newer) return;
  const canInstall = Boolean(found.assets) && process.platform === 'win32';
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'MyCA update',
    message: `MyCA ${found.latest} is available; you have ${found.current}.`,
    detail: canInstall
      ? 'MyCA downloads the installer, checks its SHA-256 against the release and its publisher signature, then installs it quietly and restarts. Your books stay where they are.'
      : 'The download opens in your browser. Your books stay where they are; install the new version over this one.',
    buttons: canInstall ? ['Install now', 'Later'] : found.url ? ['Download', 'Later'] : ['OK'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  if (!canInstall) {
    if (found.url) await shell.openExternal(found.url);
    return;
  }
  const verified = await fetchAndVerify(found);
  if (!verified.ok) {
    const why = verified.error === 'SIGNER_NOT_PINNED'
      ? 'This build of MyCA does not yet carry the publisher certificate to check against, so the installer was not run.'
      : verified.error === 'SIGNATURE_NOT_VALID' || verified.error === 'SIGNATURE_WRONG_PUBLISHER' || verified.error === 'SIGNATURE_UNREADABLE'
      ? 'The installer is not signed by the MyCA publisher, so it was not run.'
      : verified.error === 'SHA256_MISMATCH' ? 'The download did not match the checksum published with the release, so it was not run.' : `The download did not complete (${verified.error}).`;
    const { response: fallback } = await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'MyCA update', message: 'MyCA could not install the update itself.', detail: `${why}${found.url ? ' You can download it from the release page instead.' : ''}`, buttons: found.url ? ['Open release page', 'Later'] : ['OK'], defaultId: 0, cancelId: 1 });
    if (fallback === 0 && found.url) await shell.openExternal(found.url);
    return;
  }
  runInstallerSilently(verified.path);
  app.quit();
}

app.whenReady().then(async () => {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '../src/server.mjs')).href);
  const started = await startServer(PORT);
  if (started.error) dialog.showErrorBox('MyCA could not open your books', started.error);
  createWindow(started.port);
  offerUpdate().catch(() => {});
});

app.on('window-all-closed', () => app.quit());
