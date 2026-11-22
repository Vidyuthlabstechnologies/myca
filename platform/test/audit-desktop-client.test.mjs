import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { appOrigin, isAppUrl, externalTarget, fromApp } = require('../desktop/window-guard.cjs');
const MAIN = readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');

function served(paths, headers = {}) {
  const home = mkdtempSync(join(tmpdir(), 'myca-desktop-client-'));
  const server = new URL('../src/server.mjs', import.meta.url).href;
  const script = [
    "import http from 'node:http';",
    `const { startServer } = await import(${JSON.stringify(server)});`,
    'const started = await startServer(0);',
    `const paths = ${JSON.stringify(paths)};`,
    'const out = {};',
    'for (const path of paths) {',
    '  out[path] = await new Promise((done) => {',
    `    http.get({ host: "127.0.0.1", port: started.port, path, headers: ${JSON.stringify(headers)} }, (res) => { res.resume(); res.on("end", () => done({ status: res.statusCode, csp: res.headers["content-security-policy"] || "" })); });`,
    '  });',
    '}',
    'console.log("RESULT" + JSON.stringify(out));',
    'process.exit(0);',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, APPDATA: home, HOME: home, MYCA_MOCK_MODE: '0', MYCA_ENABLE_LIVE_CALLS: '0' },
    encoding: 'utf8',
    timeout: 60000,
  });
  rmSync(home, { recursive: true, force: true });
  assert.equal(child.status, 0, child.stderr);
  const line = child.stdout.split('\n').find((l) => l.startsWith('RESULT'));
  assert.ok(line, child.stdout);
  return JSON.parse(line.slice('RESULT'.length));
}

test('#206: only the local MyCA origin on the bound port counts as the app', () => {
  assert.equal(appOrigin(4780), 'http://127.0.0.1:4780');
  assert.equal(isAppUrl('http://127.0.0.1:4780/?v=17', 4780), true);
  assert.equal(isAppUrl('http://127.0.0.1:4780/keys.html', 4780), true);
  assert.equal(isAppUrl('http://127.0.0.1:4781/', 4780), false, 'another local port is another app');
  assert.equal(isAppUrl('http://localhost:4780/', 4780), false);
  assert.equal(isAppUrl('https://127.0.0.1:4780/', 4780), false);
  assert.equal(isAppUrl('https://developer.sandbox.co.in/', 4780), false);
  assert.equal(isAppUrl('file:///C:/Windows/system.ini', 4780), false);
  assert.equal(isAppUrl('not a url', 4780), false);
});

test('#206: links leave the app only for https pages, and only through the system browser', () => {
  assert.equal(externalTarget('https://einv-apisandbox.nic.in/'), 'https://einv-apisandbox.nic.in/');
  assert.equal(externalTarget('http://example.com/'), '');
  assert.equal(externalTarget('file:///etc/passwd'), '');
  assert.equal(externalTarget('javascript:alert(1)'), '');
  assert.equal(externalTarget('smb://server/share'), '');
  assert.equal(externalTarget('https://user:pass@example.com/'), '');
  assert.equal(externalTarget(''), '');
});

test('#206: the bridge answers only the top frame of a MyCA page', () => {
  const frame = (url, parent = null) => ({ senderFrame: { url, parent } });
  assert.equal(fromApp(frame('http://127.0.0.1:4780/?v=17'), 4780), true);
  assert.equal(fromApp(frame('https://cdn.plaid.com/link/v2/stable/link.html'), 4780), false);
  assert.equal(fromApp(frame('http://127.0.0.1:4780/', { url: 'http://127.0.0.1:4780/' }), 4780), false, 'a sub-frame is not the app');
  assert.equal(fromApp({}, 4780), false);
  assert.equal(fromApp(null, 4780), false);
});

test('#206: the main window is sandboxed, cannot open windows or leave MyCA, and the IPC handlers check their sender', () => {
  const main = MAIN.slice(MAIN.indexOf('function createWindow'), MAIN.indexOf("ipcMain.handle('myca:save-pdf'"));
  assert.match(main, /sandbox: true/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /setWindowOpenHandler\([\s\S]*action: 'deny'/);
  assert.match(main, /'will-navigate'[\s\S]*isAppUrl\(url, port\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(main, /'will-attach-webview', \(event\) => event\.preventDefault\(\)/);
  for (const channel of ['myca:save-pdf', 'myca:open-external']) {
    const at = MAIN.indexOf(`ipcMain.handle('${channel}'`);
    assert.match(MAIN.slice(at, at + 200), /if \(!fromApp\(event, appPort\)\) return \{ ok: false, error: 'NOT_FROM_MYCA' \}/, channel);
  }
  assert.match(MAIN, /event\.returnValue = fromApp\(event, appPort\) \? apiToken : ''/);
});

test('#206: MyCA pages carry a script policy that allows only MyCA and Plaid Link scripts; API answers keep the frame-only policy', () => {
  const out = served(['/', '/keys.html', '/index.html']);
  for (const path of ['/', '/keys.html', '/index.html']) {
    assert.equal(out[path].status, 200, path);
    assert.match(out[path].csp, /script-src 'self' 'unsafe-inline' https:\/\/cdn\.plaid\.com(;|$)/, path);
    assert.match(out[path].csp, /object-src 'none'/, path);
    assert.match(out[path].csp, /base-uri 'none'/, path);
    assert.match(out[path].csp, /frame-ancestors 'none'/, path);
  }
  const api = served(['/api/snapshot'])['/api/snapshot'];
  assert.equal(api.status, 403);
  assert.equal(api.csp, "frame-ancestors 'none'");
});

test('#206: the reviewer form needs no inline handler, so the strict page policy does not block it', () => {
  const index = readFileSync(new URL('../desktop/renderer/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /\son[a-z]+="/, 'no inline event handlers');
  const app = readFileSync(new URL('../desktop/renderer/app.js', import.meta.url), 'utf8');
  assert.match(app, /getElementById\('reviewerForm'\)\?\.addEventListener\('submit', \(event\) => event\.preventDefault\(\)\)/);
});

test('#206: Gusto can send the system browser back to the desktop callback, and nothing else accepts a cross-site request', () => {
  const crossSite = { 'sec-fetch-site': 'cross-site' };
  const out = served(['/api/oauth/gusto/callback?code=abc&state=wrong', '/api/snapshot', '/'], crossSite);
  assert.equal(out['/api/oauth/gusto/callback?code=abc&state=wrong'].status, 400, 'reaches the state check instead of a 403');
  assert.equal(out['/api/snapshot'].status, 403);
  assert.equal(out['/'].status, 403);
  const rebound = served(['/api/oauth/gusto/callback?code=abc&state=wrong'], { ...crossSite, host: 'books.evil.com' });
  assert.equal(rebound['/api/oauth/gusto/callback?code=abc&state=wrong'].status, 403, 'a rebound host is still refused');
});
