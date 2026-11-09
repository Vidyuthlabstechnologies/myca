import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession } from './session.mjs';
import { migrateGovtVault } from './govt.mjs';
import { verifyChain } from './ledger.mjs';
import { automationStatus } from './automation.mjs';

const APP_VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version;
const TICK_MS = 60 * 60 * 1000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const TOKEN_HEADER = 'x-myca-client';
const TOKEN_MARKER = '__MYCA_API_TOKEN__';

let session;
let httpServer;
let openError = '';
let apiToken = '';
let boundPort = 0;
let tick = null;
let startedAt = 0;
let lastTick = null;

async function runDailyChecks(reason) {
  if (!session) return;
  try {
    const out = await session.tool('run_automation', {});
    lastTick = { at: new Date().toISOString(), reason, ok: out.ok !== false, skipped: out.data?.skipped === true, warnings: out.data?.run?.warnings?.length || 0 };
    if (out.data?.skipped !== true) {
      const synced = await session.tool('sync_channels', {});
      if (synced.data?.fetched) console.log(`MyCA fetched ${synced.data.fetched} channel report(s)`);
    }
    try {
      const watched = await session.tool('govt_watch_check', {});
      if (watched.data?.skipped !== true && (watched.data?.changed || []).length) console.log(`MyCA portal watch: ${(watched.data.changed || []).join(', ')}`);
    } catch {
    }
    if (lastTick.warnings) console.warn(`MyCA daily checks: ${out.data.run.warnings.join(' | ')}`);
  } catch (err) {
    lastTick = { at: new Date().toISOString(), reason, ok: false, error: String(err?.message || err) };
    console.error(`MyCA daily checks failed: ${lastTick.error}`);
  }
}

export function healthReport() {
  const stores = session?.stores?.books?.health ? session.stores.books.health() : null;
  const chain = session ? verifyChain(session.state.ledger) : null;
  const automation = session ? automationStatus(session.state).data : null;
  const ok = Boolean(session) && !openError && (chain ? chain.ok : false);
  return {
    ok,
    version: APP_VERSION,
    uptimeSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    books: session ? { open: true, path: session.path || '', invoices: session.state.invoices.length, transfers: session.state.ledger.transfers.length } : { open: false, error: openError },
    chain: chain ? (chain.ok ? { ok: true } : { ok: false, error: chain.error, at: chain.at }) : null,
    backups: stores ? stores.backups : null,
    lastBackup: stores ? stores.lastBackup : null,
    recovered: stores ? stores.recovered : null,
    automation: automation ? { lastRun: automation.lastRun, warnings: automation.warnings } : null,
    lastTick,
  };
}

export function apiClientToken() {
  return apiToken;
}

// The token is minted per launch, so another local process cannot reach the API
// with a constant header, and it never leaves this machine.
// A launcher (the Electron shell, or a test harness that spawns the server) may
// supply the token so it can call the API; anything shorter than 32 characters is
// ignored and a random one is used instead.
function mintToken() {
  const supplied = String(process.env.MYCA_API_TOKEN || '').trim();
  apiToken = supplied.length >= 32 ? supplied : randomBytes(32).toString('hex');
  return apiToken;
}

function tokenInPage() {
  return String(process.env.MYCA_TOKEN_IN_PAGE ?? '1').trim() !== '0';
}

function tokenMatches(value) {
  const given = Buffer.from(String(value == null ? '' : value));
  const expected = Buffer.from(apiToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Without this check a page on any domain that resolves to 127.0.0.1 (DNS
// rebinding) becomes same-origin with the books and can read them.
export function isAllowedHost(host, port = boundPort) {
  const raw = String(host == null ? '' : host).trim();
  if (!raw) return false;
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(raw);
  if (!match) return false;
  const [, hostname, hostPort] = match;
  if (!LOCAL_HOSTS.has(hostname.toLowerCase())) return false;
  if (!port) return true;
  return hostPort == null ? false : Number(hostPort) === Number(port);
}

function isCrossSite(req) {
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return site !== '' && site !== 'same-origin' && site !== 'none';
}

export function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  try {
    const src = new URL(origin);
    const dst = new URL(`http://${host || '127.0.0.1'}`);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(src.hostname);
    return local && src.port === dst.port;
  } catch {
    return false;
  }
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin, req.headers.host)) return {};
  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}

function send(req, res, code, body, type = 'application/json') {
  const headers = {
    'content-type': type,
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'content-security-policy': "frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    ...corsHeaders(req),
  };
  res.writeHead(code, headers);
  if (Buffer.isBuffer(body)) return res.end(body);
  const json = typeof body === 'string'
    ? body
    : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        const err = new Error('request body too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function refuse(message) {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function assertLocalRequest(req) {
  if (!isAllowedHost(req.headers.host)) throw refuse('host not allowed');
  if (isCrossSite(req)) throw refuse('cross-site request not allowed');
}

function assertApiRequest(req) {
  assertLocalRequest(req);
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) throw refuse('origin not allowed');
  if (!tokenMatches(req.headers[TOKEN_HEADER])) throw refuse('missing or stale MyCA client token');
}

function handler(req, res) {
  return (async () => {
    const url = new URL(req.url, 'http://127.0.0.1');
    assertLocalRequest(req);
    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
        res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify({ error: 'origin not allowed' }));
      }
      res.writeHead(204, {
        ...corsHeaders(req),
        'access-control-allow-headers': 'content-type, x-myca-client',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-max-age': '600',
      });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/oauth/gusto/callback') {
      if (!session) return send(req, res, 503, { error: openError || 'books not open yet' });
      const out = await session.tool('gusto_callback', { code: url.searchParams.get('code') || '', state: url.searchParams.get('state') || '' });
      const page = `<!doctype html><meta charset="utf-8"><title>MyCA</title><body style="font:16px system-ui;background:#0c1220;color:#e8edf6;padding:40px"><h1>${out.ok ? 'Gusto is connected' : 'Gusto was not connected'}</h1><p>${out.ok ? 'MyCA keeps the tokens in its vault. You can close this tab and go back to MyCA.' : `${String(out.error || '')}${out.hint ? `: ${out.hint}` : ''}`}</p><p><a style="color:#4f8cff" href="/keys.html">Back to the keys page</a></p></body>`;
      return send(req, res, out.ok ? 200 : 400, page, types['.html']);
    }
    if (url.pathname.startsWith('/api/')) assertApiRequest(req);
    if (!session && url.pathname.startsWith('/api/')) {
      return send(req, res, 503, { error: openError || 'books not open yet' });
    }
    if (req.method === 'POST' && url.pathname === '/api/session/login') {
      const { userId, pin } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.signIn(userId, pin));
    }
    if (req.method === 'POST' && url.pathname === '/api/session/logout') {
      return send(req, res, 200, await session.signOut());
    }
    if (req.method === 'GET' && url.pathname === '/api/session/user') {
      return send(req, res, 200, { ok: true, user: session.activeUser() });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const { message } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.chat(message));
    }
    if (req.method === 'POST' && url.pathname === '/api/propose') {
      const { name, args } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.propose(name, args || {}));
    }
    if (req.method === 'POST' && url.pathname === '/api/confirm') {
      const { token } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.confirm(token));
    }
    if (req.method === 'POST' && url.pathname === '/api/discard') {
      return send(req, res, 200, await session.discard());
    }
    if (req.method === 'POST' && url.pathname === '/api/query') {
      const { name, args } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.query(name, args || {}));
    }
    if (req.method === 'POST' && url.pathname === '/api/company') {
      return send(req, res, 200, await session.updateCompany(JSON.parse(await readBody(req) || '{}')));
    }
    if (req.method === 'POST' && url.pathname === '/api/tool') {
      const { name, args } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.tool(name, args || {}));
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const { name, content } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.uploadDocument(name, content));
    }
    if (req.method === 'POST' && url.pathname === '/api/attach') {
      const { kind, name, content } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.attachFile(kind, name, content));
    }
    if (req.method === 'POST' && url.pathname === '/api/backup') {
      return send(req, res, 200, session.backup());
    }
    if (req.method === 'POST' && url.pathname === '/api/restore') {
      const raw = JSON.parse(await readBody(req) || '{}');
      const payload = raw && raw.books && !raw.state ? { ...raw, version: 1, state: raw.books } : raw;
      return send(req, res, 200, await session.restore(payload));
    }
    if (url.pathname.startsWith('/api/ca/')) {
      const body = req.method === 'POST' ? JSON.parse(await readBody(req) || '{}') : {};
      return send(req, res, 200, await session.caApi(req.method, url.pathname, body));
    }
    if (url.pathname === '/api/health') return send(req, res, healthReport().ok ? 200 : 503, healthReport());
    if (url.pathname === '/api/snapshot') return send(req, res, 200, session.snapshot());
    const ui = resolve(root, 'desktop', 'renderer');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.replace(/^\//, ''));
    const abs = resolve(ui, rel);
    const escaped = isAbsolute(relative(ui, abs)) || relative(ui, abs).startsWith('..');
    if (escaped || !existsSync(abs)) return send(req, res, 404, { error: 'not found' });
    // The page is served this launch's token; nothing else can read it, because a
    // request from any other host or site was refused above.
    if (extname(abs) === '.html') {
      const html = readFileSync(abs, 'utf8').split(TOKEN_MARKER).join(tokenInPage() ? apiToken : '');
      return send(req, res, 200, html, types['.html']);
    }
    send(req, res, 200, readFileSync(abs), types[extname(abs)] || 'application/octet-stream');
  })().catch((err) => send(req, res, err.statusCode || 400, { error: String(err.message || err) }));
}

export function startServer(port = Number(process.env.PORT || 4780)) {
  if (httpServer) return Promise.resolve(openError ? { port, reused: true, error: openError } : { port, reused: true });
  mintToken();
  httpServer = createServer(handler);
  return new Promise((resolveListen, reject) => {
    httpServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        httpServer = null;
        resolveListen({ port, reused: true });
      } else reject(err);
    });
    httpServer.listen(port, '127.0.0.1', () => {
      const bound = httpServer.address().port;
      boundPort = bound;
      try {
        migrateGovtVault();
        session = openSession();
      } catch (err) {
        openError = `books could not be opened: ${String(err?.message || err)}`;
        console.error(`MyCA ${openError}`);
        resolveListen({ port: bound, reused: false, error: openError });
        return;
      }
      startedAt = Date.now();
      runDailyChecks('startup');
      tick = setInterval(() => runDailyChecks('timer'), TICK_MS);
      tick.unref();
      console.log(`MyCA http://127.0.0.1:${bound}`);
      resolveListen({ port: bound, reused: false });
    });
  });
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && self.replace(/\\/g, '/').endsWith(String(process.argv[1]).replace(/\\/g, '/'))) startServer();
