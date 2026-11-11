import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import net from 'node:net';
import { createApi, MAX_BUSINESS_BYTES, MAX_UPLOAD_BYTES } from '../src/api.mjs';
import { startApi, SECRET, BOOKS_KEY } from './helpers.mjs';

const KiB = 1024;
const MiB = 1024 * KiB;
const BLOCK = 64 * KiB;
const BUDGET = MiB;
const BODY = 6 * BLOCK;

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const biz = (who, rest) => `/v1/businesses/${who.businessId}${rest ? `/${rest}` : ''}`;
const budgetModule = () => import('../src/body-budget.mjs');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const crashCount = async () => (await api.db.query('select count(*)::int as n from crash_reports')).rows[0].n;
const lockWaiters = async () => (await api.db.query("select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")).rows[0].n;

async function until(done, what, within = 5000) {
  for (let waited = 0; waited < within; waited += 10) {
    if (await done()) return;
    await sleep(10);
  }
  assert.fail(`timed out waiting for ${what}`);
}

function parseResponse(text) {
  const split = text.indexOf('\r\n\r\n');
  if (split < 0) return null;
  const lines = text.slice(0, split).split('\r\n');
  const status = Number(lines[0].split(' ')[1]);
  const headers = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  const rest = text.slice(split + 4);
  if (headers['transfer-encoding'] === 'chunked') {
    let body = '';
    let at = 0;
    for (;;) {
      const eol = rest.indexOf('\r\n', at);
      if (eol < 0) return null;
      const size = parseInt(rest.slice(at, eol), 16);
      if (size === 0) {
        if (rest.length < eol + 4) return null;
        return { status, headers, body, rest: rest.slice(eol + 4) };
      }
      if (rest.length < eol + 2 + size + 2) return null;
      body += rest.slice(eol + 2, eol + 2 + size);
      at = eol + 2 + size + 2;
    }
  }
  const length = Number(headers['content-length'] || 0);
  if (rest.length < length) return null;
  return { status, headers, body: rest.slice(0, length), rest: rest.slice(length) };
}

function wire(port) {
  const socket = net.connect(port, '127.0.0.1');
  socket.setNoDelay(true);
  let text = '';
  let closed = false;
  const watchers = new Set();
  const poke = () => { for (const watcher of [...watchers]) watcher(); };
  socket.on('data', (chunk) => { text += chunk.toString('utf8'); poke(); });
  socket.on('close', () => { closed = true; poke(); });
  socket.on('error', () => {});
  const take = () => {
    const parsed = parseResponse(text);
    if (!parsed) return null;
    text = parsed.rest;
    let json = null;
    try { json = JSON.parse(parsed.body); } catch { json = null; }
    return { status: parsed.status, headers: parsed.headers, body: parsed.body, json };
  };
  return {
    write: (data) => new Promise((resolve, reject) => socket.write(data, (err) => (err ? reject(err) : resolve()))),
    answer: (within = 3000) => new Promise((resolve) => {
      const ready = take();
      if (ready || closed) return resolve(ready);
      let timer;
      const check = () => { if (closed || parseResponse(text)) finish(); };
      const finish = () => { clearTimeout(timer); watchers.delete(check); resolve(take()); };
      timer = setTimeout(finish, within);
      watchers.add(check);
    }),
    end: () => socket.end(),
    destroy: () => socket.destroy(),
  };
}

function head({ path, method = 'POST', token, length, chunked = false }) {
  const lines = [`${method} ${path} HTTP/1.1`, 'Host: localhost', 'Content-Type: application/json'];
  if (token) lines.push(`Authorization: Bearer ${token}`);
  if (chunked) lines.push('Transfer-Encoding: chunked');
  else if (length !== undefined) lines.push(`Content-Length: ${length}`);
  return `${lines.join('\r\n')}\r\n\r\n`;
}

const frame = (data) => `${Buffer.byteLength(data).toString(16)}\r\n${data}\r\n`;
const LAST_FRAME = '0\r\n\r\n';

function uploadJson(size, tag) {
  const open = `{"name":"${tag}.txt","content":"${tag}`;
  const close = '"}';
  const text = `${open}${'x'.repeat(size - open.length - close.length)}${close}`;
  assert.equal(Buffer.byteLength(text), size);
  return text;
}

function queryJson(size) {
  const open = '{"name":"business_summary","args":{"pad":"';
  const close = '"}}';
  const text = `${open}${'x'.repeat(size - open.length - close.length)}${close}`;
  assert.equal(Buffer.byteLength(text), size);
  return text;
}

const pieces = (text, size) => Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size));

async function serveWith(options = {}) {
  const logs = [];
  const handler = createApi({ db: api.db, secret: SECRET, otpSender: api.sender, booksKey: BOOKS_KEY, now: () => api.clock.now, log: (entry) => logs.push(entry), ...options });
  const server = createServer(handler);
  const sockets = new Set();
  const wires = [];
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    handler,
    logs,
    port,
    held: () => {
      assert.ok(handler.bodyBudget, 'createApi exposes the budget it reads bodies against');
      return handler.bodyBudget.held();
    },
    wire: () => {
      const made = wire(port);
      wires.push(made);
      return made;
    },
    async call(method, path, { token, body, raw } = {}) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { unparsed: text }; }
      return { status: res.status, body: parsed, text };
    },
    async close() {
      for (const made of wires) made.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

let nextPhone = 9140000000;
const freshPhone = () => `+91${nextPhone++}`;

async function join(owner, role) {
  const phone = freshPhone();
  const sent = await api.call('POST', biz(owner, 'invitations'), { token: owner.token, body: { phone, role } });
  assert.equal(sent.status, 200, sent.text);
  const person = await api.signIn(phone);
  const joined = await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: person.accessToken });
  assert.equal(joined.status, 200, joined.text);
  return person.accessToken;
}

async function team() {
  const owner = await api.ownerWithBusiness(freshPhone(), { name: `Body Traders ${nextPhone}`, state: '29' });
  return { ...owner, staff: await join(owner, 'staff'), accountant: await join(owner, 'accountant') };
}

async function startUpload(live, who, tag, { size = BODY, sent = 1000 } = {}) {
  const w = live.wire();
  const body = uploadJson(size, tag);
  await w.write(head({ path: biz(who, 'uploads'), token: who.token, length: size }) + body.slice(0, sent));
  return { w, body, sent };
}

async function sendRest(upload) {
  await upload.w.write(upload.body.slice(upload.sent));
}

async function finishUpload(upload) {
  await sendRest(upload);
  return upload.w.answer(5000);
}

async function startChunked(live, who, tag, count, { size = BODY } = {}) {
  const w = live.wire();
  const parts = pieces(uploadJson(size, tag), BLOCK);
  await w.write(head({ path: biz(who, 'uploads'), token: who.token, chunked: true }) + parts.slice(0, count).map(frame).join(''));
  return { w, parts, count };
}

async function finishChunked(upload) {
  await upload.w.write(upload.parts.slice(upload.count).map(frame).join('') + LAST_FRAME);
  return upload.w.answer(5000);
}

function holdBooks(businessId) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let locked;
  const ready = new Promise((resolve) => { locked = resolve; });
  const done = api.db.tx(async (q) => {
    await q('select 1 from books where business_id = $1 for update', [businessId]);
    locked();
    await held;
  });
  return { ready: Promise.race([ready, done]), release, done };
}

test('createBodyBudget reserves what fits, refuses what does not, and gives each reservation back once', async () => {
  const { createBodyBudget } = await budgetModule();
  const budget = createBodyBudget(1000);
  assert.equal(budget.limit, 1000);
  assert.equal(budget.held(), 0);
  const first = budget.reserve(600);
  assert.equal(typeof first, 'function');
  assert.equal(budget.held(), 600);
  assert.equal(budget.reserve(401), null, 'one byte too many is refused');
  assert.equal(budget.held(), 600, 'a refused reservation holds nothing');
  const second = budget.reserve(400);
  assert.equal(typeof second, 'function');
  assert.equal(budget.held(), 1000);
  assert.equal(budget.reserve(1), null);
  first();
  assert.equal(budget.held(), 400);
  first();
  assert.equal(budget.held(), 400, 'releasing twice gives the bytes back once');
  second();
  second();
  assert.equal(budget.held(), 0);
  const whole = budget.reserve(1000);
  assert.equal(typeof whole, 'function', 'the whole budget fits when nothing else is held');
  assert.equal(budget.reserve(0) !== null, true, 'nothing at all always fits');
  whole();
  assert.equal(budget.reserve(1001), null, 'more than the whole budget never fits');
  assert.equal(budget.held(), 0);
});

test('createBodyBudget refuses nonsense sizes, counts a forced reservation past the limit and takes it back', async () => {
  const { createBodyBudget } = await budgetModule();
  for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null, undefined]) {
    assert.throws(() => createBodyBudget(bad), /budget/, `a limit of ${String(bad)} is refused`);
  }
  const budget = createBodyBudget(100);
  for (const bad of [-1, NaN, Infinity, 1.5, '5', null, undefined]) {
    assert.equal(budget.reserve(bad), null, `${String(bad)} bytes is not a size`);
  }
  assert.equal(budget.held(), 0);
  const filling = budget.reserve(100);
  assert.equal(budget.reserve(1), null);
  const forced = budget.reserve(30, { force: true });
  assert.equal(typeof forced, 'function', 'a forced reservation is never refused');
  assert.equal(budget.held(), 130, 'and it counts, so the next ordinary reservation sees it');
  filling();
  assert.equal(budget.reserve(71), null, 'the forced bytes still count against what fits');
  assert.equal(typeof budget.reserve(70), 'function');
  forced();
  forced();
  assert.equal(budget.held(), 70);
});

test('the default budget is a sixteenth of the memory the process may use, between 16 MiB and the stored-bytes cap, and 64 MiB when that memory is unknown', async () => {
  const { defaultBodyBudgetBytes } = await budgetModule();
  const figure = (constrainedMemory) => defaultBodyBudgetBytes({ constrainedMemory, env: {}, ceiling: MAX_BUSINESS_BYTES });
  assert.equal(figure(512 * MiB), 32 * MiB, 'the 512 MiB Cloud Run instance');
  assert.equal(figure(128 * MiB), 16 * MiB, 'eight sixteenths is raised to the 16 MiB floor');
  assert.equal(figure(256 * MiB), 16 * MiB);
  assert.equal(figure(1024 * MiB), 64 * MiB);
  assert.equal(figure(4096 * MiB), MAX_BUSINESS_BYTES, 'a sixteenth of 4 GiB is cut to the stored-bytes cap');
  assert.equal(figure(2 ** 53 - 1), MAX_BUSINESS_BYTES);
  assert.equal(figure(0), 64 * MiB, 'no memory limit known');
  assert.equal(figure(undefined), 64 * MiB);
  assert.equal(figure(NaN), 64 * MiB);
  assert.equal(figure(-1), 64 * MiB);
  assert.equal(defaultBodyBudgetBytes({ constrainedMemory: 4096 * MiB, env: {} }) > MAX_BUSINESS_BYTES, true, 'the cap is the caller\'s to give');
});

test('MYCA_BODY_BUDGET_BYTES overrides the default when it is a positive whole number and is ignored otherwise', async () => {
  const { defaultBodyBudgetBytes } = await budgetModule();
  const figure = (value) => defaultBodyBudgetBytes({ constrainedMemory: 512 * MiB, env: { MYCA_BODY_BUDGET_BYTES: value }, ceiling: MAX_BUSINESS_BYTES });
  assert.equal(figure('4194304'), 4 * MiB);
  assert.equal(figure(' 4194304 '), 4 * MiB, 'blanks around the number are ignored');
  assert.equal(figure('1'), 1);
  assert.equal(figure('999999999999'), 999999999999, 'an explicit figure is taken as given, past the cap');
  for (const bad of ['abc', '', '   ', '0', '-5', '1.5', '12abc', '0x20', '1e6', 'NaN', 'Infinity', '99999999999999999999', undefined]) {
    assert.equal(figure(bad), 32 * MiB, `${JSON.stringify(bad)} leaves the derived default`);
  }
  assert.equal(defaultBodyBudgetBytes({ constrainedMemory: 0, env: { MYCA_BODY_BUDGET_BYTES: '5000000' } }), 5000000);
  assert.equal(defaultBodyBudgetBytes({ constrainedMemory: 0, env: { MYCA_BODY_BUDGET_BYTES: 'x' } }), 64 * MiB);
});

test('createApi builds its budget from the option, then the environment, then the memory the process may use', async () => {
  const { defaultBodyBudgetBytes } = await budgetModule();
  const derived = () => defaultBodyBudgetBytes({ constrainedMemory: process.constrainedMemory(), ceiling: MAX_BUSINESS_BYTES });
  const saved = process.env.MYCA_BODY_BUDGET_BYTES;
  const opened = [];
  const make = async (options) => {
    const live = await serveWith(options);
    opened.push(live);
    return live.handler.bodyBudget;
  };
  try {
    delete process.env.MYCA_BODY_BUDGET_BYTES;
    assert.equal((await make({})).limit, derived());
    assert.equal((await make({ bodyBudgetBytes: 3 * MiB })).limit, 3 * MiB);
    process.env.MYCA_BODY_BUDGET_BYTES = String(2 * MiB);
    assert.equal((await make({})).limit, 2 * MiB, 'the environment replaces the derived default');
    assert.equal((await make({ bodyBudgetBytes: 5 * MiB })).limit, 5 * MiB, 'the option replaces the environment');
    process.env.MYCA_BODY_BUDGET_BYTES = 'plenty';
    assert.equal((await make({})).limit, derived(), 'a value that is not a number is ignored');
    for (const bad of [0, -1, 1.5, NaN, '7']) {
      assert.equal((await make({ bodyBudgetBytes: bad })).limit, derived(), `an option of ${String(bad)} is ignored`);
    }
    assert.equal(MAX_BUSINESS_BYTES, 200 * MiB, 'the stored-bytes cap keeps its value');
    assert.equal(MAX_UPLOAD_BYTES, 8 * MiB);
  } finally {
    if (saved === undefined) delete process.env.MYCA_BODY_BUDGET_BYTES;
    else process.env.MYCA_BODY_BUDGET_BYTES = saved;
    for (const live of opened) await live.close();
  }
});

test('B1/B2: a declared length over the whole budget is answered 413 before any of the body is read, and the rest of it is discarded', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Declared Traders', state: '29' });
    const w = live.wire();
    const size = 3 * MiB;
    await w.write(head({ path: biz(owner, 'uploads'), token: owner.token, length: size }) + '0123456789');
    const refused = await w.answer(2000);
    assert.ok(refused, 'the 413 comes while the body is still unsent, not after it');
    assert.equal(refused.status, 413);
    assert.deepEqual(refused.json, { ok: false, error: 'BODY_TOO_LARGE' });
    assert.equal(live.held(), 0, 'a refused request holds nothing');
    await w.write(Buffer.alloc(size - 10, 'x'));
    await w.write(head({ path: '/v1/health', method: 'GET' }));
    const next = await w.answer(3000);
    assert.equal(next?.status, 200, 'the rest of the refused body was discarded and the connection is still in step');
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B2: a declared length over the route limit is answered before the body is read, on the JSON routes and on both raw routes', async () => {
  const live = await serveWith({ bodyBudgetBytes: 8 * MiB });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Route Traders', state: '29' });
    const routes = [
      ['a JSON route under a business', biz(owner, 'query'), owner.token],
      ['a public JSON route', '/v1/auth/otp', undefined],
      ['the billing notification', '/v1/billing/play/notify', undefined],
      ['the WhatsApp webhook', '/v1/whatsapp/webhook', undefined],
    ];
    for (const [name, path, token] of routes) {
      const w = live.wire();
      await w.write(head({ path, token, length: 2 * MiB }) + '{"a":');
      const refused = await w.answer(2000);
      assert.ok(refused, `${name}: the 413 comes before the body`);
      assert.equal(refused.status, 413, name);
      assert.deepEqual(refused.json, { ok: false, error: 'BODY_TOO_LARGE' }, name);
      w.destroy();
    }
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B1/B2: the third overlapping body is answered 503 SERVER_BUSY unread while the first two, which fit, complete 200', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Overlap Traders', state: '29' });
    const first = await startUpload(live, owner, 'a');
    const second = await startUpload(live, owner, 'b');
    await until(() => live.held() === 2 * BODY, 'the first two bodies to be reserved');
    const third = await startUpload(live, owner, 'c');
    const busy = await third.w.answer(2000);
    assert.ok(busy, 'the 503 comes while the third body is still unsent');
    assert.equal(busy.status, 503);
    assert.deepEqual(busy.json, { ok: false, error: 'SERVER_BUSY' });
    assert.equal(live.held(), 2 * BODY, 'the refused request holds nothing and the others still hold theirs');
    const [done1, done2] = await Promise.all([finishUpload(first), finishUpload(second)]);
    assert.equal(done1?.status, 200, done1?.body);
    assert.equal(done2?.status, 200, done2?.body);
    assert.equal(live.held(), 0, 'every byte is given back by the time the answers are out');
  } finally {
    await live.close();
  }
});

test('B1/B2: the same with chunked bodies and no Content-Length: each chunk is counted and the one that no longer fits ends the request with 503', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Chunked Traders', state: '29' });
    const first = await startChunked(live, owner, 'a', 4);
    const second = await startChunked(live, owner, 'b', 4);
    await until(() => live.held() === 8 * BLOCK, 'the chunks sent so far to be counted');
    const third = live.wire();
    await third.write(head({ path: biz(owner, 'uploads'), token: owner.token, chunked: true }));
    const filler = 'y'.repeat(BLOCK);
    for (let i = 0; i < 8; i += 1) await third.write(frame(filler));
    await until(() => live.held() === 16 * BLOCK, 'the third body to take the rest of the budget');
    await third.write(frame(filler));
    const busy = await third.answer(2000);
    assert.ok(busy, 'the 503 comes when the chunk that does not fit arrives');
    assert.equal(busy.status, 503);
    assert.deepEqual(busy.json, { ok: false, error: 'SERVER_BUSY' });
    assert.equal(live.held(), 8 * BLOCK, 'what the refused body held is given back at once');
    const [done1, done2] = await Promise.all([finishChunked(first), finishChunked(second)]);
    assert.equal(done1?.status, 200, done1?.body);
    assert.equal(done2?.status, 200, done2?.body);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B2: a chunked body larger than the whole budget is a 413, not a 503, because waiting would never make it fit', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Huge Chunks', state: '29' });
    const w = live.wire();
    await w.write(head({ path: biz(owner, 'uploads'), token: owner.token, chunked: true }));
    const filler = 'z'.repeat(BLOCK);
    for (let i = 0; i < 16; i += 1) await w.write(frame(filler));
    await until(() => live.held() === 16 * BLOCK, 'the budget to be taken by this one body');
    await w.write(frame(filler));
    const refused = await w.answer(2000);
    assert.ok(refused);
    assert.equal(refused.status, 413);
    assert.deepEqual(refused.json, { ok: false, error: 'BODY_TOO_LARGE' });
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B2: a request refused for lack of room holds nothing, its body is discarded and the connection stays in step', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Busy Traders', state: '29' });
    const holder = await startUpload(live, owner, 'a', { size: 700000 });
    await until(() => live.held() === 700000, 'the first body to be reserved');
    const refused = await startUpload(live, owner, 'b', { size: 400000 });
    const busy = await refused.w.answer(2000);
    assert.ok(busy, 'the 503 comes before the rest of the body');
    assert.equal(busy.status, 503);
    assert.equal(live.held(), 700000);
    await refused.w.write(refused.body.slice(refused.sent));
    await refused.w.write(head({ path: '/v1/health', method: 'GET' }));
    const next = await refused.w.answer(3000);
    assert.equal(next?.status, 200, 'the connection carried on with the next request');
    assert.equal(live.held(), 700000, 'discarding the refused body took nothing from the budget');
    const done = await finishUpload(holder);
    assert.equal(done?.status, 200, done?.body);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B1: two bodies that together fill the budget exactly both fit, one big body more does not, and a body as large as the budget fits alone', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Exact Traders', state: '29' });
    const half = BUDGET / 2;
    const a = await startUpload(live, owner, 'a', { size: half });
    const b = await startUpload(live, owner, 'b', { size: half });
    await until(() => live.held() === BUDGET, 'both halves to be reserved');
    const extra = await startUpload(live, owner, 'c', { size: BLOCK + 1 });
    assert.equal((await extra.w.answer(2000))?.status, 503, 'a body just over 64 KiB does not fit in what is left');
    const query = JSON.stringify({ name: 'business_summary', args: {} });
    const small = live.wire();
    await small.write(head({ path: biz(owner, 'query'), token: owner.token, length: Buffer.byteLength(query) }) + query);
    const tiny = await small.answer(5000);
    assert.notEqual(tiny?.status, 503, 'a body of 64 KiB or less is counted but never refused');
    const [doneA, doneB] = await Promise.all([finishUpload(a), finishUpload(b)]);
    assert.equal(doneA?.status, 200, doneA?.body);
    assert.equal(doneB?.status, 200, doneB?.body);
    assert.equal(live.held(), 0);
    const alone = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(BUDGET, 'whole') });
    assert.equal(alone.status, 200, alone.text);
    const over = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(BUDGET + 1, 'over') });
    assert.equal(over.status, 413, 'one byte past the whole budget can never fit');
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B1: the bytes come back however the read ends: answered, bad JSON, refused for size, dropped half way, dropped between chunks', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Release Traders', state: '29' });
    const answered = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(300000, 'ok') });
    assert.equal(answered.status, 200, answered.text);
    assert.equal(live.held(), 0, 'a body that is read, parsed and answered has given its bytes back by the time the answer is out');

    const garbage = await live.call('POST', biz(owner, 'query'), { token: owner.token, raw: 'x'.repeat(300000) });
    assert.equal(garbage.status, 400);
    assert.equal(garbage.body.error, 'INVALID_JSON');
    assert.equal(live.held(), 0, 'a body that does not parse');

    const tooBig = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(BUDGET + 10, 'big') });
    assert.equal(tooBig.status, 413);
    assert.equal(live.held(), 0, 'a body refused for size');

    const dropped = await startUpload(live, owner, 'gone', { size: 500000 });
    await until(() => live.held() === 500000, 'the body to be reserved');
    dropped.w.destroy();
    await until(() => live.held() === 0, 'the dropped body to be given back');

    const between = await startChunked(live, owner, 'cut', 3);
    await until(() => live.held() === 3 * BLOCK, 'three chunks to be counted');
    between.w.destroy();
    await until(() => live.held() === 0, 'the chunked body that stopped to be given back');

    const halfClosed = await startUpload(live, owner, 'fin', { size: 450000 });
    await until(() => live.held() === 450000, 'the body to be reserved');
    halfClosed.w.end();
    await until(() => live.held() === 0, 'the body of a client that closed its side to be given back');
  } finally {
    await live.close();
  }
});

test('B1: bodies waiting for the books lock keep their bytes counted until they are answered, small ones included', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Queued Traders', state: '29' });
  const lock = holdBooks(owner.businessId);
  try {
    await lock.ready;
    const first = await startUpload(live, owner, 'a');
    await sendRest(first);
    const second = await startUpload(live, owner, 'b');
    await sendRest(second);
    await until(async () => (await lockWaiters()) >= 2, 'both uploads to be waiting for the lock');
    assert.equal(live.held(), 2 * BODY, 'bodies that were read in full but wait for the lock are still held');
    const third = await startUpload(live, owner, 'c');
    const busy = await third.w.answer(2000);
    assert.equal(busy?.status, 503, 'a third one is refused although the first two have finished sending');
    const query = JSON.stringify({ name: 'business_summary', args: {} });
    const reading = live.wire();
    await reading.write(head({ path: biz(owner, 'query'), token: owner.token, length: Buffer.byteLength(query) }) + query);
    await until(async () => (await lockWaiters()) >= 3, 'the small read to be waiting for the lock');
    assert.equal(live.held(), 2 * BODY + Buffer.byteLength(query), 'a small body counts while its request is in flight');
    lock.release();
    await lock.done;
    const answers = await Promise.all([first.w.answer(5000), second.w.answer(5000), reading.answer(5000)]);
    assert.deepEqual(answers.map((a) => a?.status), [200, 200, 200]);
    assert.equal(live.held(), 0);
  } finally {
    lock.release();
    await lock.done.catch(() => {});
    await live.close();
  }
});

test('B1: one budget serves the JSON routes, the raw routes and uploads, and small bodies are never refused', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Shared Budget', state: '29' });
    const holder = await startUpload(live, owner, 'a', { size: 700000 });
    await until(() => live.held() === 700000, 'the first body to be reserved');
    const big = [
      ['uploads', biz(owner, 'uploads'), owner.token],
      ['a JSON route under a business', biz(owner, 'query'), owner.token],
      ['a public JSON route', '/v1/auth/otp', undefined],
      ['the billing notification', '/v1/billing/play/notify', undefined],
      ['the WhatsApp webhook', '/v1/whatsapp/webhook', undefined],
    ];
    for (const [name, path, token] of big) {
      const w = live.wire();
      await w.write(head({ path, token, length: 400000 }) + '{"a":');
      const busy = await w.answer(2000);
      assert.equal(busy?.status, 503, `${name}: no room for another 400000 bytes`);
      assert.deepEqual(busy?.json, { ok: false, error: 'SERVER_BUSY' }, name);
      w.destroy();
    }
    const small = [
      ['a JSON route under a business', 'POST', biz(owner, 'query'), owner.token, '{"name":"business_summary","args":{}}'],
      ['a public JSON route', 'POST', '/v1/auth/otp', undefined, '{"phone":"abc"}'],
      ['the billing notification', 'POST', '/v1/billing/play/notify', undefined, '{}'],
      ['the WhatsApp webhook', 'POST', '/v1/whatsapp/webhook', undefined, '{}'],
    ];
    for (const [name, method, path, token, text] of small) {
      const out = await live.call(method, path, { token, raw: text });
      assert.notEqual(out.status, 503, `${name}: a small body is let in while the budget is full of big ones`);
    }
    assert.equal(live.held(), 700000, 'the small ones gave their bytes back and the big one still holds its own');
    const done = await finishUpload(holder);
    assert.equal(done?.status, 200, done?.body);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B1: a budget smaller than 64 KiB still lets every small body through and refuses what is larger', async () => {
  const live = await serveWith({ bodyBudgetBytes: 10 * KiB });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Tiny Budget', state: '29' });
    const query = await live.call('POST', biz(owner, 'query'), { token: owner.token, body: { name: 'business_summary', args: {} } });
    assert.equal(query.status, 200, query.text.slice(0, 200));
    const small = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(40 * KiB, 'small') });
    assert.equal(small.status, 200, small.text.slice(0, 200));
    assert.equal(live.held(), 0);
    const large = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(70 * KiB, 'large') });
    assert.equal(large.status, 413, 'more than 64 KiB can never fit a budget of 10 KiB');
    const chunked = live.wire();
    await chunked.write(head({ path: biz(owner, 'query'), token: owner.token, chunked: true }));
    await chunked.write(frame(queryJson(30 * KiB)) + LAST_FRAME);
    assert.equal((await chunked.answer(5000))?.status, 200, 'a small body sent in chunks is not refused either');
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B1: a body arriving as a hundred thousand one-byte chunks is read whole and parsed', async () => {
  const live = await serveWith({ bodyBudgetBytes: 4 * MiB });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Crumb Traders', state: '29' });
    const text = queryJson(100000);
    const w = live.wire();
    await w.write(head({ path: biz(owner, 'query'), token: owner.token, chunked: true }));
    await w.write(Array.from(text, (character) => `1\r\n${character}\r\n`).join('') + LAST_FRAME);
    const out = await w.answer(10000);
    assert.equal(out?.status, 200, out?.body);
    assert.equal(out.json.ok !== false, true);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B2: the limits at the edge: a JSON body of exactly 1 MiB and an upload of exactly 8 MiB are read, one byte more is a 413', async () => {
  const live = await serveWith({ bodyBudgetBytes: 32 * MiB });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Edge Traders', state: '29' });
    const exact = await live.call('POST', biz(owner, 'query'), { token: owner.token, raw: queryJson(MiB) });
    assert.equal(exact.status, 200, exact.text.slice(0, 200));
    const over = await live.call('POST', biz(owner, 'query'), { token: owner.token, raw: queryJson(MiB + 1) });
    assert.equal(over.status, 413);
    assert.deepEqual(over.body, { ok: false, error: 'BODY_TOO_LARGE' });
    const upload = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(MAX_UPLOAD_BYTES, 'edge') });
    assert.equal(upload.status, 200, upload.text.slice(0, 200));
    const tooBig = await live.call('POST', biz(owner, 'uploads'), { token: owner.token, raw: uploadJson(MAX_UPLOAD_BYTES + 1, 'edge2') });
    assert.equal(tooBig.status, 413);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B3: a restore is accepted up to the budget, not up to the stored-bytes cap, and one under the budget still restores', async () => {
  const live = await serveWith({ bodyBudgetBytes: BUDGET });
  try {
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Restore Traders', state: '29' });
    const w = live.wire();
    await w.write(head({ path: biz(owner, 'replace'), token: owner.token, length: 2 * MiB }) + '{"state":');
    const refused = await w.answer(2000);
    assert.ok(refused, 'a restore larger than the budget is refused before its body is read');
    assert.equal(refused.status, 413);
    assert.deepEqual(refused.json, { ok: false, error: 'BODY_TOO_LARGE' });
    assert.equal(live.held(), 0);

    const exported = await live.call('GET', biz(owner, 'export'), { token: owner.token });
    assert.equal(exported.status, 200, exported.text.slice(0, 200));
    const padding = 'restore me '.repeat(40000);
    const backup = { ...exported.body, documents: { ...exported.body.documents, [sha256(padding)]: padding } };
    const raw = JSON.stringify(backup);
    assert.ok(raw.length > 400000 && raw.length < BUDGET, `a backup of ${raw.length} bytes is under the budget`);
    const restored = await live.call('POST', biz(owner, 'replace'), { token: owner.token, raw });
    assert.equal(restored.status, 200, restored.text.slice(0, 300));
    assert.equal(restored.body.replaced, true);
    assert.equal(restored.body.documentsStored, 1);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

const OWNER_ONLY_POSTS = ['ca-sync', 'ca-share', 'subscription', 'invitations', 'inbound', 'connectors', 'plaid-link-token', 'plaid-exchange', 'gusto-connect', 'taxjar-rate', 'connector-sync', 'replace'];

test('B4: every owner-only action refuses staff and accountants with 403 before any of a large body is read', async () => {
  const live = await serveWith();
  try {
    const who = await team();
    for (const [role, token] of [['staff', who.staff], ['accountant', who.accountant]]) {
      for (const action of OWNER_ONLY_POSTS) {
        const w = live.wire();
        await w.write(head({ path: biz(who, action), token, length: 64 * MiB }) + '{"mode":"da');
        const refused = await w.answer(2000);
        assert.ok(refused, `${role} ${action}: the refusal comes while the body is still unsent`);
        assert.equal(refused.status, 403, `${role} ${action}: ${refused.body}`);
        assert.deepEqual(refused.json, { ok: false, error: 'OWNER_ONLY' }, `${role} ${action}`);
        w.destroy();
      }
    }
    assert.equal(live.held(), 0, 'nothing was reserved for them');
    for (const [role, token] of [['staff', who.staff], ['accountant', who.accountant]]) {
      for (const action of OWNER_ONLY_POSTS) {
        const small = await live.call('POST', biz(who, action), { token, body: { mode: 'daily' } });
        assert.equal(small.status, 403, `${role} ${action} with a small body: ${small.text}`);
        assert.deepEqual(small.body, { ok: false, error: 'OWNER_ONLY' }, `${role} ${action}`);
        const broken = await live.call('POST', biz(who, action), { token, raw: '{not json' });
        assert.equal(broken.status, 403, `${role} ${action} with a body that is not JSON: the role is checked before the body is parsed`);
        assert.equal(broken.body.error, 'OWNER_ONLY');
      }
    }
  } finally {
    await live.close();
  }
});

test('B4: the owner is not affected: the same actions still read the body and answer as before', async () => {
  const live = await serveWith({ bodyBudgetBytes: 32 * MiB });
  try {
    const who = await team();
    const bad = await live.call('POST', biz(who, 'ca-sync'), { token: who.token, body: { mode: 'sometimes' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'BAD_SYNC_MODE');
    const broken = await live.call('POST', biz(who, 'ca-sync'), { token: who.token, raw: '{not json' });
    assert.equal(broken.status, 400);
    assert.equal(broken.body.error, 'INVALID_JSON');
    const share = await live.call('POST', biz(who, 'ca-share'), { token: who.token, body: {} });
    assert.equal(share.status, 409);
    assert.equal(share.body.error, 'CA_SEES_LIVE_BOOKS');
    const huge = live.wire();
    await huge.write(head({ path: biz(who, 'ca-sync'), token: who.token, length: 5 * MiB }) + '{"mode":');
    const tooBig = await huge.answer(2000);
    assert.equal(tooBig?.status, 413, 'the owner still gets the size answer');
    const replaced = live.wire();
    await replaced.write(head({ path: biz(who, 'replace'), token: who.token, length: 4 * MiB }));
    await replaced.write('{"state":');
    assert.equal(await replaced.answer(300), null, 'with room for it, the owner\'s restore is read: no answer until the body is in');
    const saved = await live.call('POST', biz(who, 'ca-sync'), { token: who.token, body: { mode: 'daily' } });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.mode, 'daily');
  } finally {
    await live.close();
  }
});

test('B4: an accountant on a shared view still gets the answer the order of the checks always gave, without the body being read', async () => {
  const live = await serveWith();
  try {
    const who = await team();
    const shared = await live.call('POST', biz(who, 'ca-sync'), { token: who.token, body: { mode: 'manual' } });
    assert.equal(shared.status, 200, shared.text);
    for (const action of ['ca-sync', 'ca-share']) {
      const w = live.wire();
      await w.write(head({ path: biz(who, action), token: who.accountant, length: 64 * MiB }) + '{"mode":"da');
      const refused = await w.answer(2000);
      assert.ok(refused, `${action}: refused while the body is unsent`);
      assert.equal(refused.status, 403, action);
      assert.deepEqual(refused.json, { ok: false, error: 'OWNER_ONLY' }, action);
      w.destroy();
    }
    for (const action of OWNER_ONLY_POSTS.filter((name) => name !== 'ca-sync' && name !== 'ca-share')) {
      const w = live.wire();
      await w.write(head({ path: biz(who, action), token: who.accountant, length: 64 * MiB }) + '{"mode":"da');
      const refused = await w.answer(2000);
      assert.ok(refused, `${action}: refused while the body is unsent`);
      assert.equal(refused.status, 403, action);
      assert.equal(refused.json.error, 'SHARED_VIEW_READ_ONLY', action);
      assert.equal(typeof refused.json.sharedAsOf, 'string', action);
      w.destroy();
    }
    const small = await live.call('POST', biz(who, 'replace'), { token: who.accountant, body: { state: {} } });
    assert.equal(small.status, 403);
    assert.equal(small.body.error, 'SHARED_VIEW_READ_ONLY');
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B4: actions with their own role rules keep their order: the body is still read first', async () => {
  const live = await serveWith();
  try {
    const who = await team();
    const company = await live.call('POST', biz(who, 'company'), { token: who.staff, raw: '{not json' });
    assert.equal(company.status, 400, 'company reads its body before it asks who is calling');
    assert.equal(company.body.error, 'INVALID_JSON');
    const companyOk = await live.call('POST', biz(who, 'company'), { token: who.staff, body: { name: 'Renamed' } });
    assert.equal(companyOk.status, 403);
    assert.equal(companyOk.body.error, 'OWNER_ONLY');
    const brief = await live.call('POST', biz(who, 'brief'), { token: who.accountant, raw: '{not json' });
    assert.equal(brief.status, 400);
    assert.equal(brief.body.error, 'INVALID_JSON');
    const briefOk = await live.call('POST', biz(who, 'brief'), { token: who.accountant, body: { weekly: true } });
    assert.equal(briefOk.status, 403);
    assert.equal(briefOk.body.error, 'NOT_FOR_ACCOUNTANTS');
    const w = live.wire();
    await w.write(head({ path: biz(who, 'uploads'), token: who.staff, length: 9 * MiB }) + '{"name":');
    assert.equal((await w.answer(2000))?.status, 413, 'a staff member\'s oversize upload is still a size error');
  } finally {
    await live.close();
  }
});

test('B5: a client that drops the connection mid-body is not a server fault: no 500 line, no stack, no crash record', async () => {
  const live = await serveWith();
  try {
    await api.db.query('delete from crash_reports');
    for (let i = 0; i < 5; i += 1) {
      const w = live.wire();
      await w.write(head({ path: '/v1/auth/otp', length: 100 }) + '{"phone":');
      w.destroy();
    }
    await until(() => live.logs.filter((entry) => entry.path === '/v1/auth/otp').length === 5, 'the five dropped requests to be logged');
    for (let i = 0; i < 2; i += 1) {
      const w = live.wire();
      await w.write(head({ path: '/v1/auth/otp', length: 100 }) + '{"phone":');
      w.end();
    }
    await until(() => live.logs.filter((entry) => entry.path === '/v1/auth/otp').length === 7, 'the two half-closed requests to be logged');
    assert.deepEqual(live.logs.filter((entry) => entry.status === 500), [], 'no request is logged as a server error');
    assert.deepEqual(live.logs.filter((entry) => entry.error), [], 'no stack is logged');
    assert.deepEqual(live.logs.filter((entry) => entry.path === '/v1/auth/otp').map((entry) => entry.status), [400, 400, 400, 400, 400, 400, 400]);
    assert.equal(await crashCount(), 0, 'nothing is recorded as a crash');
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B5: a client that drops while the server is still checking who it is, or on a raw route, ends the same way and is not left waiting', async () => {
  const live = await serveWith();
  try {
    await api.db.query('delete from crash_reports');
    const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Dropped Traders', state: '29' });
    for (let i = 0; i < 3; i += 1) {
      const raw = live.wire();
      await raw.write(head({ path: '/v1/billing/play/notify', length: 100 }) + '{"message":');
      raw.destroy();
      const tokened = live.wire();
      await tokened.write(head({ path: biz(owner, 'query'), token: owner.token, length: 100 }) + '{"name":');
      tokened.destroy();
    }
    await until(() => live.logs.filter((entry) => entry.path === '/v1/billing/play/notify').length === 3, 'the dropped raw requests to be logged');
    await until(() => live.logs.filter((entry) => entry.path === '/v1/businesses/:id/query').length === 3, 'the dropped signed-in requests to be logged');
    assert.deepEqual(live.logs.filter((entry) => entry.status !== 400 && entry.status !== undefined), []);
    assert.deepEqual(live.logs.filter((entry) => entry.error), []);
    assert.equal(await crashCount(), 0);
    assert.equal(live.held(), 0);
  } finally {
    await live.close();
  }
});

test('B5: a real server error is still logged as a 500 with its stack and recorded as a crash', async () => {
  const live = await serveWith({ billing: { plans() { throw new TypeError('plans exploded'); } } });
  try {
    await api.db.query('delete from crash_reports');
    const w = live.wire();
    await w.write(head({ path: '/v1/auth/otp', length: 100 }) + '{"phone":');
    w.destroy();
    await until(() => live.logs.some((entry) => entry.path === '/v1/auth/otp'), 'the dropped request to be logged');
    assert.equal(await crashCount(), 0);
    const out = await live.call('GET', '/v1/plans');
    assert.equal(out.status, 500);
    assert.deepEqual(out.body, { ok: false, error: 'INTERNAL_ERROR' });
    assert.equal(live.logs.filter((entry) => entry.status === 500).length, 1);
    assert.match(String(live.logs.find((entry) => entry.error)?.error), /TypeError: plans exploded/);
    const rows = (await api.db.query('select kind, error_type, occurrences from crash_reports')).rows;
    assert.deepEqual(rows, [{ kind: 'server', error_type: 'TypeError', occurrences: 1 }]);
  } finally {
    await live.close();
  }
});

async function within(promise, ms, what) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve('late'), ms); });
  const out = await Promise.race([promise, late]);
  clearTimeout(timer);
  assert.notEqual(out, 'late', `${what} did not finish within ${ms} ms`);
  return out;
}

function fakeBody(path = '/v1/auth/otp') {
  const req = new EventEmitter();
  return Object.assign(req, { method: 'POST', url: path, headers: { 'content-type': 'application/json', 'content-length': '100' }, socket: { remoteAddress: '127.0.0.1' }, destroyed: false, readableEnded: false, resume() {} });
}

function fakeResponse() {
  const sent = { status: 0, body: '', ended: false };
  return {
    sent,
    get headersSent() { return sent.status !== 0; },
    writeHead(status) { sent.status = status; },
    end(body) { sent.body = String(body ?? ''); sent.ended = true; },
    destroy() {},
  };
}

test('B5: each way a request can be dropped ends the read with 400 REQUEST_ABORTED and gives the bytes back; other request errors stay server errors', async () => {
  const logs = [];
  const handler = createApi({ db: api.db, secret: SECRET, otpSender: api.sender, booksKey: BOOKS_KEY, now: () => api.clock.now, log: (entry) => logs.push(entry), bodyBudgetBytes: BUDGET });
  await api.db.query('delete from crash_reports');
  const dropped = {
    'an aborted event': (req) => req.emit('aborted'),
    'a close before the end': (req) => req.emit('close'),
    'an ECONNRESET error': (req) => req.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
    'an error whose message is aborted': (req) => req.emit('error', new Error('aborted')),
    'an aborted error that carries the reset code': (req) => req.emit('error', Object.assign(new Error('aborted'), { code: 'ECONNRESET' })),
  };
  for (const [name, drop] of Object.entries(dropped)) {
    const req = fakeBody();
    const res = fakeResponse();
    const done = handler(req, res);
    await until(() => req.listenerCount('data') > 0, `${name}: the body to be read`);
    req.emit('data', Buffer.from('{"phone":'));
    drop(req);
    await within(done, 2000, `${name}: the request`);
    assert.equal(res.sent.status, 400, name);
    assert.deepEqual(JSON.parse(res.sent.body), { ok: false, error: 'REQUEST_ABORTED' }, name);
    assert.equal(handler.bodyBudget.held(), 0, name);
  }

  const gone = fakeBody();
  gone.destroyed = true;
  const goneRes = fakeResponse();
  await within(handler(gone, goneRes), 2000, 'a request dropped before its body was asked for');
  assert.equal(goneRes.sent.status, 400, 'a request that was already dropped before its body was asked for does not wait for events that have passed');
  assert.deepEqual(JSON.parse(goneRes.sent.body), { ok: false, error: 'REQUEST_ABORTED' });

  const finished = fakeBody();
  const finishedRes = fakeResponse();
  const complete = handler(finished, finishedRes);
  await until(() => finished.listenerCount('data') > 0, 'the body to be read');
  finished.emit('data', Buffer.from('{"phone":"abc"}'));
  finished.emit('end');
  finished.emit('close');
  await within(complete, 2000, 'a request whose body ended and then closed');
  assert.notEqual(JSON.parse(finishedRes.sent.body).error, 'REQUEST_ABORTED', 'a close after the end is the normal end of a request');

  assert.deepEqual(logs.filter((entry) => entry.status === 500), []);
  assert.deepEqual(logs.filter((entry) => entry.error), []);
  assert.equal(await crashCount(), 0);

  const broken = fakeBody();
  const brokenRes = fakeResponse();
  const failing = handler(broken, brokenRes);
  await until(() => broken.listenerCount('data') > 0, 'the body to be read');
  broken.emit('data', Buffer.from('{"phone":'));
  broken.emit('error', new Error('the socket layer fell over'));
  await within(failing, 2000, 'a request that failed with another error');
  assert.equal(brokenRes.sent.status, 500, 'an error that is not a dropped connection is still a server error');
  assert.equal(logs.filter((entry) => entry.status === 500).length, 1);
  assert.match(String(logs.find((entry) => entry.error)?.error), /the socket layer fell over/);
  assert.equal(await crashCount(), 1);
  assert.equal(handler.bodyBudget.held(), 0);
});
