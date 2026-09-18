import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSession } from './session.mjs';
import { migrateGovtVault } from './govt.mjs';

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
const API_CLIENT_HEADER = 'renderer';

let session;
let httpServer;

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

function assertApiRequest(req) {
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    const err = new Error('origin not allowed');
    err.statusCode = 403;
    throw err;
  }
  if (req.headers['x-myca-client'] !== API_CLIENT_HEADER) {
    const err = new Error('missing MyCA client header');
    err.statusCode = 403;
    throw err;
  }
}

function handler(req, res) {
  return (async () => {
    const url = new URL(req.url, 'http://127.0.0.1');
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
    if (url.pathname.startsWith('/api/')) assertApiRequest(req);
    if (!session && url.pathname.startsWith('/api/')) {
      return send(req, res, 503, { error: 'books not open yet' });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const { message } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.chat(message));
    }
    if (req.method === 'POST' && url.pathname === '/api/tool') {
      const { name, args } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.tool(name, args || {}));
    }
    if (req.method === 'POST' && url.pathname === '/api/attach') {
      const { kind, name, content } = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.attachFile(kind, name, content));
    }
    if (req.method === 'POST' && url.pathname === '/api/backup') {
      return send(req, res, 200, session.backup());
    }
    if (req.method === 'POST' && url.pathname === '/api/restore') {
      const payload = JSON.parse(await readBody(req) || '{}');
      return send(req, res, 200, await session.restore(payload));
    }
    if (url.pathname.startsWith('/api/ca/')) {
      const body = req.method === 'POST' ? JSON.parse(await readBody(req) || '{}') : {};
      return send(req, res, 200, await session.caApi(req.method, url.pathname, body));
    }
    if (url.pathname === '/api/snapshot') return send(req, res, 200, session.snapshot());
    const ui = resolve(root, 'desktop', 'renderer');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.replace(/^\//, ''));
    const abs = resolve(ui, rel);
    const escaped = isAbsolute(relative(ui, abs)) || relative(ui, abs).startsWith('..');
    if (escaped || !existsSync(abs)) return send(req, res, 404, { error: 'not found' });
    send(req, res, 200, readFileSync(abs), types[extname(abs)] || 'application/octet-stream');
  })().catch((err) => send(req, res, err.statusCode || 400, { error: String(err.message || err) }));
}

export function startServer(port = Number(process.env.PORT || 4780)) {
  if (httpServer) return Promise.resolve({ port, reused: true });
  httpServer = createServer(handler);
  return new Promise((resolveListen, reject) => {
    httpServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        httpServer = null;
        resolveListen({ port, reused: true });
      } else reject(err);
    });
    httpServer.listen(port, '127.0.0.1', () => {
      migrateGovtVault();
      session = openSession();
      console.log(`MyCA http://127.0.0.1:${port}`);
      resolveListen({ port, reused: false });
    });
  });
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && self.replace(/\\/g, '/').endsWith(String(process.argv[1]).replace(/\\/g, '/'))) startServer();
