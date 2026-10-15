import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isAllowedHost } from '../src/server.mjs';

// The server is started in a child process so it gets its own books directory
// and its own per-launch token.
function probe(requests) {
  const home = mkdtempSync(join(tmpdir(), 'myca-hardening-'));
  const server = new URL('../src/server.mjs', import.meta.url).href;
  // node:http is used rather than fetch because fetch refuses to send a forged
  // Host header, which is exactly what a rebinding attack relies on.
  const script = [
    "import http from 'node:http';",
    `const { startServer, apiClientToken } = await import(${JSON.stringify(server)});`,
    'const started = await startServer(0);',
    'const token = apiClientToken();',
    `const cases = ${JSON.stringify(requests)};`,
    'const out = [];',
    'const ask = (path, method, headers) => new Promise((done) => {',
    '  const req = http.request({ host: "127.0.0.1", port: started.port, path, method, headers }, (res) => {',
    '    let body = "";',
    '    res.setEncoding("utf8");',
    '    res.on("data", (c) => { body += c; });',
    '    res.on("end", () => done({ status: res.statusCode, body: body.slice(0, 400) }));',
    '  });',
    '  req.on("error", (e) => done({ status: 0, body: String(e.message) }));',
    '  req.end();',
    '});',
    'for (const c of cases) {',
    '  const headers = {};',
    '  for (const [k, v] of Object.entries(c.headers || {})) headers[k] = v === "TOKEN" ? token : v;',
    '  const res = await ask(c.path || "/api/snapshot", c.method || "GET", headers);',
    '  out.push({ name: c.name, ...res });',
    '}',
    'console.log("RESULT" + JSON.stringify({ token, results: out }));',
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

test('H16: isAllowedHost accepts only the loopback names on the bound port', () => {
  assert.equal(isAllowedHost('127.0.0.1:4780', 4780), true);
  assert.equal(isAllowedHost('localhost:4780', 4780), true);
  assert.equal(isAllowedHost('[::1]:4780', 4780), true);
  assert.equal(isAllowedHost('books.evil.com:4780', 4780), false, 'a rebound domain must be refused');
  assert.equal(isAllowedHost('127.0.0.1.nip.io:4780', 4780), false);
  assert.equal(isAllowedHost('127.0.0.1:4781', 4780), false, 'another local port is another server');
  assert.equal(isAllowedHost('127.0.0.1', 4780), false, 'a host with no port cannot be this server');
  assert.equal(isAllowedHost('', 4780), false);
  assert.equal(isAllowedHost('LOCALHOST:4780', 4780), true);
});

test('H16: the API needs this launch token, and a rebound Host or a cross-site request is refused', () => {
  const { token, results } = probe([
    { name: 'renderer', headers: { 'x-myca-client': 'TOKEN' } },
    { name: 'constant-header', headers: { 'x-myca-client': 'renderer' } },
    { name: 'no-header', headers: {} },
    { name: 'rebound-host', headers: { 'x-myca-client': 'TOKEN', host: 'books.evil.com' } },
    { name: 'cross-site', headers: { 'x-myca-client': 'TOKEN', 'sec-fetch-site': 'cross-site' } },
    { name: 'foreign-origin', headers: { 'x-myca-client': 'TOKEN', origin: 'https://evil.com' } },
    { name: 'ca-route', path: '/api/ca/clients', headers: { 'x-myca-client': 'TOKEN' } },
    { name: 'static-rebound', path: '/', headers: { host: 'books.evil.com' } },
    { name: 'page', path: '/', headers: {} },
  ]);
  const by = Object.fromEntries(results.map((r) => [r.name, r]));

  assert.match(token, /^[0-9a-f]{64}$/, 'the token is 32 random bytes, not a constant');
  assert.equal(by.renderer.status, 200);
  assert.equal(by['ca-route'].status, 200);

  assert.equal(by['constant-header'].status, 403, 'the old constant header must no longer work');
  assert.equal(by['no-header'].status, 403);
  assert.equal(by['rebound-host'].status, 403, 'DNS rebinding is refused even with a token');
  assert.equal(by['cross-site'].status, 403);
  assert.equal(by['foreign-origin'].status, 403);
  assert.equal(by['static-rebound'].status, 403, 'a rebound page cannot even read the UI');

  assert.equal(by.page.status, 200);
  assert.equal(by.page.body.includes('__MYCA_API_TOKEN__'), false, 'the placeholder is replaced when served');
  assert.ok(by.page.body.includes(token.slice(0, 16)), 'the page carries this launch token');
});

test('H16: a second launch mints a different token, so a stale one stops working', () => {
  const first = probe([{ name: 'ok', headers: { 'x-myca-client': 'TOKEN' } }]);
  const second = probe([{ name: 'ok', headers: { 'x-myca-client': 'TOKEN' } }]);
  assert.notEqual(first.token, second.token);
  const stale = probe([{ name: 'stale', headers: { 'x-myca-client': first.token } }]);
  assert.equal(stale.results[0].status, 403);
});

test('H16: the packaged app listens on a random port and opens the window on the port actually bound', () => {
  const main = readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  assert.match(main, /app\.isPackaged \? 0 : 4780/, 'port 0 when packaged, 4780 for npm run dev');
  assert.match(main, /createWindow\(started\.port\)/, 'the window uses the bound port, not the requested one');
  assert.match(main, /loadURL\(`http:\/\/127\.0\.0\.1:\$\{port\}/);
});
