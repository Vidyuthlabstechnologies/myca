import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createApi } from '../src/api.mjs';
import { createCaptureSender } from '../src/auth.mjs';
import { createDb, migrate } from '../src/db.mjs';
import { createBooksRunner } from '../src/books-runner.mjs';
import { createDocumentVault } from '../src/document-vault.mjs';
import { openSecrets } from '../src/connectors.mjs';
import { INBOUND_HEADER } from '../src/inbound.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { openState } from '../src/books-seal.mjs';
import { setChannelClient, ChannelClient } from '../../platform/src/channel-client.mjs';
import { BOOKS_KEY, GOOGLE_CLIENT, SECRET, TEST_GOOGLE_KEYS } from './helpers.mjs';

const clientEmit = pg.Client.prototype.emit;
pg.Client.prototype.emit = function emit(event, ...args) {
  if (event === 'error' && this.listenerCount('error') === 0) return false;
  return clientEmit.call(this, event, ...args);
};

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
const CONNECTOR_KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const PATIENCE_MS = 10_000;
const SALE = { partyName: 'Kiran Stores', lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function admin(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function within(ms, work, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: `${what} was still waiting after ${ms} ms` })), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function watchPool(raw) {
  const inside = new AsyncLocalStorage();
  const violations = [];
  const note = (kind, text) => violations.push(`${kind} ${String(text || '').replace(/\s+/g, ' ').slice(0, 70)} from ${String(new Error().stack.split('\n')[3] || '').trim()}`);
  return {
    violations,
    db: {
      query: (text, params) => {
        if (inside.getStore()) note('query', text);
        return raw.query(text, params);
      },
      tx: (run) => {
        if (inside.getStore()) note('tx', '');
        return raw.tx((q) => inside.run(true, () => run(q)));
      },
      close: () => raw.close(),
    },
  };
}

async function startPooled({ max = 3, connectionTimeoutMillis, phone = true, google = true, billing = null, jobToken = '' } = {}) {
  const name = `myca_t_${randomBytes(6).toString('hex')}`;
  await admin(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const rawDb = createDb(url.toString(), { max, ...(connectionTimeoutMillis ? { connectionTimeoutMillis } : {}) });
  await migrate(rawDb);
  const watched = watchPool(rawDb);
  const watcher = new pg.Client({ connectionString: url.toString() });
  watcher.on('error', () => {});
  await watcher.connect();
  const sender = createCaptureSender();
  const clock = { now: Date.now() };
  const logs = [];
  const handler = createApi({ billing, db: watched.db, secret: SECRET, otpSender: phone ? sender : null, googleClientIds: google ? [GOOGLE_CLIENT] : [], googleKeys: TEST_GOOGLE_KEYS, connectorKey: CONNECTOR_KEY, booksKey: BOOKS_KEY, now: () => clock.now, log: (entry) => logs.push(entry), jobToken });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { token, body, raw, headers = {} } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { unparsed: text };
    }
    return { status: res.status, body: parsed, text, requestId: res.headers.get('x-request-id'), retryAfter: res.headers.get('retry-after') };
  }

  async function signIn(number) {
    const otp = await call('POST', '/v1/auth/otp', { body: { phone: number } });
    const verified = await call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone: number, code: sender.last().code, deviceLabel: 'test phone' } });
    if (verified.status !== 200) throw new Error(`sign-in failed: ${verified.text}`);
    const agreed = await call('POST', '/v1/me/consent', { token: verified.body.accessToken, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } });
    if (agreed.status !== 200) throw new Error(`consent failed: ${agreed.text}`);
    return verified.body;
  }

  async function ownerWithBusiness(number, business = { name: 'Asha Traders', state: '29' }) {
    const session = await signIn(number);
    const created = await call('POST', '/v1/businesses', { token: session.accessToken, body: business });
    if (created.status !== 200) throw new Error(`business not created: ${created.text}`);
    return { ...session, token: session.accessToken, businessId: created.body.business.id };
  }

  return {
    db: watched.db,
    rawDb,
    watcher,
    logs,
    violations: watched.violations,
    call,
    signIn,
    ownerWithBusiness,
    books: async (businessId) => openState(BOOKS_KEY, businessId, (await watcher.query('select state from books where business_id = $1', [businessId])).rows[0].state),
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      const closing = rawDb.close().catch(() => {});
      const closed = await Promise.race([closing.then(() => true), sleep(1000).then(() => false)]);
      if (!closed) {
        await watcher.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [name]).catch(() => {});
        await Promise.race([closing, sleep(3000)]);
      }
      await watcher.end().catch(() => {});
      await admin(`drop database if exists ${name} with (force)`);
    },
  };
}

async function burst(sends, what = 'the burst') {
  const settled = sends.map((send) => send().then((value) => ({ value }), (error) => ({ error })));
  const answers = await within(PATIENCE_MS, Promise.all(settled), what);
  for (const answer of answers) if (answer.error) throw answer.error;
  return answers.map((answer) => answer.value);
}

async function holdConnections(db, count) {
  const doors = [];
  const running = [];
  let inside = 0;
  for (let i = 0; i < count; i += 1) {
    running.push(db.tx(async (q) => {
      await q("set local idle_in_transaction_session_timeout = '30s'");
      await q('select pg_sleep(0.05)');
      inside += 1;
      await new Promise((resolve) => doors.push(resolve));
    }));
  }
  for (let waited = 0; inside < count && waited < 5000; waited += 10) await sleep(10);
  assert.equal(inside, count, 'every pooled connection is held');
  return {
    async release() {
      for (const open of doors) open();
      await Promise.all(running);
    },
  };
}

async function posKey(api, owner) {
  const made = await api.call('POST', `/v1/businesses/${owner.businessId}/inbound`, { token: owner.token, body: { label: 'till', source: 'pos' } });
  assert.equal(made.status, 200, made.text);
  return made.body.key.secret;
}

const sale = (api, key, saleId, extra = {}) => api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: key }, body: { saleId, lines: [{ description: 'Item', qty: 1, rate: 100, gstRate: 18 }], ...extra } });

test('P1: ten concurrent company renames by the owner all answer on a pool of three, the business ends with one of the names, and another user is served meanwhile', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000001', { name: 'Pool Traders', state: '29' });
    const other = await api.signIn('+919810000002');
    const names = Array.from({ length: 10 }, (_, i) => `Pool Traders ${i + 1}`);
    const rename = (name) => () => api.call('POST', `/v1/businesses/${owner.businessId}/company`, { token: owner.token, body: { name } });
    const meanwhile = async () => {
      await sleep(40);
      return api.call('GET', '/v1/me', { token: other.accessToken });
    };
    const answers = await burst([...names.map(rename), meanwhile], 'ten renames and another user');
    answers.slice(0, 10).forEach((answer, i) => assert.equal(answer.status, 200, `rename ${i + 1}: ${answer.text}`));
    assert.equal(answers[10].status, 200, answers[10].text);
    assert.equal(answers[10].body.user.id, other.user.id);
    const listed = await api.watcher.query('select name from businesses where id = $1', [owner.businessId]);
    assert.ok(names.includes(listed.rows[0].name), listed.rows[0].name);
    assert.ok(names.includes((await api.books(owner.businessId)).company.name));
    assert.deepEqual(api.violations, []);
  } finally {
    await api.close();
  }
});

test('P1: a company rename reaches the business list only when the books have committed it', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000003', { name: 'Pool Traders', state: '29' });
    const renamed = await api.call('POST', `/v1/businesses/${owner.businessId}/company`, { token: owner.token, body: { name: 'Pool Traders Pvt Ltd' } });
    assert.equal(renamed.status, 200, renamed.text);
    const listed = await api.call('GET', '/v1/businesses', { token: owner.token });
    assert.equal(listed.body.businesses[0].name, 'Pool Traders Pvt Ltd');
    await api.watcher.query("create function revoke_during_audit() returns trigger language plpgsql as $$ begin update devices set revoked_at = now() where id = new.device_id; return new; end $$");
    await api.watcher.query("create trigger revoke_during_audit after insert on audit_log for each row when (new.action = 'tool.set_company') execute function revoke_during_audit()");
    const refused = await api.call('POST', `/v1/businesses/${owner.businessId}/company`, { token: owner.token, body: { name: 'Never Kept Ltd' } });
    assert.equal(refused.status, 401, refused.text);
    assert.equal(refused.body.reason, 'DEVICE_REVOKED');
    const after = await api.watcher.query('select name from businesses where id = $1', [owner.businessId]);
    assert.equal(after.rows[0].name, 'Pool Traders Pvt Ltd');
    assert.equal((await api.books(owner.businessId)).company.name, 'Pool Traders Pvt Ltd');
    assert.deepEqual(api.violations, []);
  } finally {
    await api.close();
  }
});

test('P2: ten concurrent POS sales with distinct sale ids all answer on a pool of three, make ten invoices, and another user is served meanwhile', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000011', { name: 'POS Traders', state: '29' });
    const other = await api.signIn('+919810000012');
    const key = await posKey(api, owner);
    const before = (await api.books(owner.businessId)).invoices.length;
    const meanwhile = async () => {
      await sleep(40);
      return api.call('GET', '/v1/me', { token: other.accessToken });
    };
    const answers = await burst([...Array.from({ length: 10 }, (_, i) => () => sale(api, key, `S-${i + 1}`)), meanwhile], 'ten sales and another user');
    answers.slice(0, 10).forEach((answer, i) => {
      assert.equal(answer.status, 200, `sale ${i + 1}: ${answer.text}`);
      assert.equal(answer.body.duplicate, false);
      assert.equal(answer.body.total, 118);
    });
    assert.equal(answers[10].status, 200, answers[10].text);
    assert.equal(new Set(answers.slice(0, 10).map((answer) => answer.body.invoiceId)).size, 10);
    assert.equal((await api.books(owner.businessId)).invoices.length, before + 10);
    const rows = await api.watcher.query('select count(*)::int as n from inbound_sales where business_id = $1', [owner.businessId]);
    assert.equal(rows.rows[0].n, 10);
    assert.deepEqual(api.violations, []);
  } finally {
    await api.close();
  }
});

test('P2: ten concurrent requests with the same sale id make one invoice and the rest answer duplicate with that invoice', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000013', { name: 'POS Traders', state: '29' });
    const key = await posKey(api, owner);
    const answers = await burst(Array.from({ length: 10 }, () => () => sale(api, key, 'S-SAME')), 'ten sales with one id');
    answers.forEach((answer) => assert.equal(answer.status, 200, answer.text));
    const first = answers.filter((answer) => answer.body.duplicate === false);
    assert.equal(first.length, 1, JSON.stringify(answers.map((answer) => answer.body)));
    for (const answer of answers) assert.equal(answer.body.invoiceId, first[0].body.invoiceId);
    assert.equal((await api.books(owner.businessId)).invoices.length, 1);
    assert.deepEqual(api.violations, []);
  } finally {
    await api.close();
  }
});

test('P2: a sale the engine refuses leaves no sale row and no invoice, and the same sale id posts once it is corrected', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000014', { name: 'POS Traders', state: '29' });
    const key = await posKey(api, owner);
    const refused = await sale(api, key, 'S-BAD', { lines: [{ description: 'Item', qty: -1, rate: 100, gstRate: 18 }] });
    assert.equal(refused.status, 400, refused.text);
    assert.equal(refused.body.error, 'BAD_LINE');
    assert.equal((await api.books(owner.businessId)).invoices.length, 0);
    assert.equal((await api.watcher.query('select count(*)::int as n from inbound_sales')).rows[0].n, 0);
    const corrected = await sale(api, key, 'S-BAD');
    assert.equal(corrected.status, 200, corrected.text);
    assert.equal(corrected.body.duplicate, false);
    assert.equal((await api.books(owner.businessId)).invoices.length, 1);
    assert.deepEqual(api.violations, []);
  } finally {
    await api.close();
  }
});

test('P2: a duplicate sale answers from the sale row alone and does not open the books', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000015', { name: 'POS Traders', state: '29' });
    const key = await posKey(api, owner);
    const first = await sale(api, key, 'S-ONCE');
    assert.equal(first.body.duplicate, false);
    const mark = async () => (await api.watcher.query('select b.version, (select count(*)::int from audit_log where business_id = b.business_id) as audits from books b where b.business_id = $1', [owner.businessId])).rows[0];
    const before = await mark();
    const again = await sale(api, key, 'S-ONCE');
    assert.equal(again.status, 200, again.text);
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.invoiceId, first.body.invoiceId);
    assert.deepEqual(await mark(), before);
  } finally {
    await api.close();
  }
});

test('P2: the invoice and the sale row are one transaction: a failure in the sale row leaves no invoice, and the retry makes exactly one', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000016', { name: 'POS Traders', state: '29' });
    const key = await posKey(api, owner);
    await api.watcher.query("create function refuse_sale() returns trigger language plpgsql as $$ begin raise exception 'sale row refused'; end $$");
    await api.watcher.query('create trigger refuse_sale before insert on inbound_sales for each row execute function refuse_sale()');
    const failed = await sale(api, key, 'S-ATOMIC');
    assert.equal(failed.status, 500, failed.text);
    assert.equal((await api.books(owner.businessId)).invoices.length, 0, 'the invoice went with the failed sale row');
    await api.watcher.query('drop trigger refuse_sale on inbound_sales');
    const retried = await sale(api, key, 'S-ATOMIC');
    assert.equal(retried.status, 200, retried.text);
    assert.equal(retried.body.duplicate, false);
    assert.equal((await api.books(owner.businessId)).invoices.length, 1);
  } finally {
    await api.close();
  }
});

test('P2: each books wrapper runs inside a transaction the caller names, hands that handle on, and leaves the commit to the caller', async () => {
  const api = await startPooled({ max: 3 });
  try {
    const owner = await api.ownerWithBusiness('+919810000017', { name: 'Unit Traders', state: '29' });
    const runner = createBooksRunner({ db: api.rawDb, vault: createDocumentVault({}), booksKey: BOOKS_KEY });
    const context = { userId: owner.user.id, deviceId: null, requestId: 'unit' };
    const actor = { actor: { userId: owner.user.id, role: 'admin', name: 'Unit' } };
    const invoice = { partyName: 'Kiran Stores', lines: [{ description: 'Supply', qty: 1, rate: 100, gstRate: 18 }] };
    const version = async () => Number((await api.watcher.query('select version from books where business_id = $1', [owner.businessId])).rows[0].version);
    const invoices = async () => (await api.books(owner.businessId)).invoices.length;
    const start = await version();
    const backup = await runner.withReadOnlyBooks(owner.businessId, context, (session) => session.backup());

    const seen = {};
    let given;
    await assert.rejects(api.rawDb.tx(async (q) => {
      given = q;
      const txid = async (handle) => (await handle('select txid_current() as id')).rows[0].id;
      seen.own = await txid(q);
      await runner.withBooks(owner.businessId, context, async (session, handle) => {
        seen.write = { handle, txid: await txid(handle) };
        return session.tool('create_invoice', invoice, actor);
      }, { q });
      await runner.withReadOnlyBooks(owner.businessId, context, async (session, handle) => {
        seen.read = { handle, txid: await txid(handle), invoices: session.state.invoices.length };
      }, { q });
      await runner.withSharedBooks(owner.businessId, context, async (session, { asOf }, handle) => {
        seen.shared = { handle, asOf, txid: await txid(handle) };
      }, { q }).catch((error) => { seen.sharedError = error.message; });
      await runner.replaceBooks(owner.businessId, context, { version: 1, state: backup.state, documents: backup.documents, exportedAt: backup.exportedAt }, { q });
      seen.versionInside = Number((await q('select version from books where business_id = $1', [owner.businessId])).rows[0].version);
      seen.invoicesInside = (await openState(BOOKS_KEY, owner.businessId, (await q('select state from books where business_id = $1', [owner.businessId])).rows[0].state)).invoices.length;
      throw new Error('the caller stops');
    }), /the caller stops/);

    assert.equal(seen.write.handle, given, 'the books callback gets the caller\'s handle');
    assert.equal(seen.write.txid, seen.own, 'and runs in the caller\'s transaction');
    assert.equal(seen.read.handle, given);
    assert.equal(seen.read.txid, seen.own);
    assert.equal(seen.read.invoices, 1, 'the read sees the write of the same transaction');
    assert.equal(seen.sharedError, 'NOT_SHARED_YET');
    assert.equal(seen.versionInside, start + 2, 'the write and the replace each moved the version inside the caller\'s transaction');
    assert.equal(seen.invoicesInside, 0, 'the replace put the earlier books back');
    assert.equal(await version(), start, 'nothing was committed by the wrappers');
    assert.equal(await invoices(), 0);

    await runner.share(owner.businessId, owner.user.id);
    await api.rawDb.tx(async (q) => {
      await runner.withBooks(owner.businessId, context, (session) => session.tool('create_invoice', invoice, actor), { q });
      await runner.withBooks(owner.businessId, context, (session) => session.tool('create_invoice', invoice, actor), { q });
      await runner.withSharedBooks(owner.businessId, context, async (session, { asOf }, handle) => {
        seen.shared = { handle, asOf, txid: (await handle('select txid_current() as id')).rows[0].id };
        seen.own = (await q('select txid_current() as id')).rows[0].id;
      }, { q });
    });
    assert.equal(seen.shared.txid, seen.own);
    assert.ok(seen.shared.asOf instanceof Date);
    assert.equal(await invoices(), 2, 'two wrappers in one caller transaction commit together');

    const failure = new Error('the engine failed');
    await assert.rejects(api.rawDb.tx(async (q) => {
      await runner.withBooks(owner.businessId, context, () => { throw failure; }, { q });
    }), (error) => error === failure);
    assert.equal(await invoices(), 2);
    assert.deepEqual(api.violations, []);
  } finally {
    await api.close();
  }
});

function fakeTransport(log, onExchange = async () => {}) {
  return async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    log.push({ url, body });
    const json = (status, data) => ({ ok: status < 400, status, headers: { get: () => '' }, text: async () => JSON.stringify(data) });
    if (url === 'https://sandbox.plaid.com/link/token/create') return body.secret === 'plaid-secret-1234' ? json(200, { link_token: 'link-sandbox-123', expiration: '2026-10-22T10:00:00Z' }) : json(400, { error_code: 'INVALID_API_KEYS' });
    if (url === 'https://sandbox.plaid.com/item/public_token/exchange') {
      await onExchange();
      return body.public_token === 'public-sandbox-abcdefgh' ? json(200, { access_token: 'access-sandbox-xyz', item_id: 'item-1' }) : json(400, { error_code: 'INVALID_PUBLIC_TOKEN' });
    }
    if (url === 'https://api.gusto-demo.com/oauth/token') return body.code === 'code-777' ? json(200, { access_token: 'gusto-access-1', refresh_token: 'gusto-refresh-1', expires_in: 7200 }) : json(400, { error: 'invalid_grant' });
    if (url === 'https://api.gusto-demo.com/v1/token_info') return json(200, { resource: { type: 'Company', uuid: 'company-uuid-9' } });
    if (url.startsWith('https://api.sandbox.taxjar.com/v2/rates/78701')) return json(200, { rate: { zip: '78701', state: 'TX', county: 'TRAVIS', city: 'AUSTIN', state_rate: '0.0625', county_rate: '0.0', city_rate: '0.01', special_rate: '0.01', combined_rate: '0.0825', freight_taxable: true } });
    return json(404, { raw: 'no route' });
  };
}

const connectorRow = async (api, businessId, channel) => (await api.watcher.query('select fields, secrets from business_connectors where business_id = $1 and channel = $2', [businessId, channel])).rows[0];

test('P3: eight concurrent plaid exchanges on a pool of three all answer and the connector row holds the exchanged fields, sealed', async () => {
  const api = await startPooled({ max: 3 });
  try {
    await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_MOCK_MODE: '0' }, async () => {
      setChannelClient(new ChannelClient({ fetchFn: fakeTransport([]) }));
      const owner = await api.ownerWithBusiness('+919810000021', { name: 'Luna Bakery LLC', country: 'US' });
      const post = (action, body) => api.call('POST', `/v1/businesses/${owner.businessId}/${action}`, { token: owner.token, body });
      const saved = await post('connectors', { channel: 'plaid', clientId: 'plaid-client-1', secret: 'plaid-secret-1234', environment: 'sandbox' });
      assert.equal(saved.status, 200, saved.text);
      const answers = await burst(Array.from({ length: 8 }, () => () => post('plaid-exchange', { publicToken: 'public-sandbox-abcdefgh' })), 'eight exchanges');
      answers.forEach((answer, i) => {
        assert.equal(answer.status, 200, `exchange ${i + 1}: ${answer.text}`);
        assert.equal(answer.body.data.itemId, 'item-1');
      });
      const row = await connectorRow(api, owner.businessId, 'plaid');
      assert.equal(row.fields.itemId, 'item-1');
      assert.equal(openSecrets(CONNECTOR_KEY, owner.businessId, row.secrets).accessToken, 'access-sandbox-xyz');
      assert.equal(JSON.stringify(row).includes('access-sandbox-xyz'), false, 'the token is only in the sealed column');
      const listed = await api.call('GET', `/v1/businesses/${owner.businessId}/connectors`, { token: owner.token });
      const plaid = listed.body.connectors.find((c) => c.channel === 'plaid');
      assert.equal(plaid.configured, true);
      assert.equal(plaid.accessToken, 'set');
      assert.deepEqual(api.violations, []);
    });
  } finally {
    setChannelClient(null);
    await api.close();
  }
});

test('P3: eight concurrent Gusto callbacks on a pool of three all answer and the connector row holds the tokens, sealed', async () => {
  const api = await startPooled({ max: 3 });
  try {
    await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_MOCK_MODE: '0' }, async () => {
      setChannelClient(new ChannelClient({ fetchFn: fakeTransport([]) }));
      const owner = await api.ownerWithBusiness('+919810000022', { name: 'Luna Bakery LLC', country: 'US' });
      const post = (action, body) => api.call('POST', `/v1/businesses/${owner.businessId}/${action}`, { token: owner.token, body });
      const saved = await post('connectors', { channel: 'gusto', clientId: 'gusto-client-1', clientSecret: 'gusto-secret-1', environment: 'demo' });
      assert.equal(saved.status, 200, saved.text);
      const connect = await post('gusto-connect', {});
      assert.equal(connect.status, 200, connect.text);
      const oauthState = new URL(connect.body.data.url).searchParams.get('state');
      assert.ok(oauthState.startsWith(`${owner.businessId}.`));
      const answers = await burst(Array.from({ length: 8 }, () => () => api.call('GET', `/v1/oauth/gusto/callback?code=code-777&state=${oauthState}`)), 'eight callbacks');
      answers.forEach((answer, i) => assert.equal(answer.status, 200, `callback ${i + 1}: ${answer.text}`));
      assert.ok(answers.some((answer) => /Gusto is connected/.test(answer.text)), 'at least the first callback connects');
      const row = await connectorRow(api, owner.businessId, 'gusto');
      assert.equal(row.fields.companyUuid, 'company-uuid-9');
      assert.equal(row.fields.oauthState, '');
      const sealed = openSecrets(CONNECTOR_KEY, owner.businessId, row.secrets);
      assert.equal(sealed.accessToken, 'gusto-access-1');
      assert.equal(sealed.refreshToken, 'gusto-refresh-1');
      assert.equal(JSON.stringify(row).includes('gusto-access-1'), false);
      const replay = await api.call('GET', `/v1/oauth/gusto/callback?code=code-777&state=${oauthState}`);
      assert.match(replay.text, /Gusto was not connected/);
      assert.deepEqual(api.violations, []);
    });
  } finally {
    setChannelClient(null);
    await api.close();
  }
});

test('P3: a failure after the connector fields are saved takes them back with the books', async () => {
  const api = await startPooled({ max: 3 });
  try {
    await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_MOCK_MODE: '0' }, async () => {
      const owner = await api.ownerWithBusiness('+919810000023', { name: 'Luna Bakery LLC', country: 'US' });
      setChannelClient(new ChannelClient({ fetchFn: fakeTransport([], () => api.watcher.query('update devices set revoked_at = now() where user_id = $1', [owner.user.id])) }));
      const post = (action, body) => api.call('POST', `/v1/businesses/${owner.businessId}/${action}`, { token: owner.token, body });
      const saved = await post('connectors', { channel: 'plaid', clientId: 'plaid-client-1', secret: 'plaid-secret-1234', environment: 'sandbox' });
      assert.equal(saved.status, 200, saved.text);
      const audits = async () => (await api.watcher.query("select count(*)::int as n from audit_log where business_id = $1 and action = 'connector.saved'", [owner.businessId])).rows[0].n;
      const before = await audits();
      const exchanged = await post('plaid-exchange', { publicToken: 'public-sandbox-abcdefgh' });
      assert.equal(exchanged.status, 401, exchanged.text);
      assert.equal(exchanged.body.reason, 'DEVICE_REVOKED');
      const row = await connectorRow(api, owner.businessId, 'plaid');
      assert.equal(row.fields.itemId, undefined, 'the item id was taken back');
      assert.equal(openSecrets(CONNECTOR_KEY, owner.businessId, row.secrets).accessToken, undefined, 'and so was the token');
      assert.equal(await audits(), before, 'and the audit row of the save');
      assert.deepEqual(api.violations, []);
    });
  } finally {
    setChannelClient(null);
    await api.close();
  }
});

test('P4: with every pooled connection busy a request answers 503 SERVER_BUSY with Retry-After inside a second, records no crash and logs no stack, and the next one is served after the release', async () => {
  const api = await startPooled({ max: 2, connectionTimeoutMillis: 300 });
  let held = null;
  try {
    const user = await api.signIn('+919810000041');
    held = await holdConnections(api.db, 2);
    const started = Date.now();
    const busy = await within(3000, api.call('GET', '/v1/me', { token: user.accessToken }), 'the request');
    const waited = Date.now() - started;
    assert.equal(busy.status, 503, busy.text);
    assert.deepEqual(busy.body, { ok: false, error: 'SERVER_BUSY' });
    assert.equal(busy.retryAfter, '2');
    assert.ok(waited < 1500, `it answered after ${waited} ms`);

    const busyStep = await within(3000, api.call('POST', '/v1/auth/otp', { body: { phone: '+919810000042' } }), 'the sign-in request');
    assert.equal(busyStep.status, 503, busyStep.text);
    assert.deepEqual(busyStep.body, { ok: false, error: 'SERVER_BUSY' });
    assert.equal(busyStep.retryAfter, '2');

    const health = await within(3000, api.call('GET', '/v1/health/live'), 'the liveness check');
    assert.equal(health.status, 200, 'the liveness check touches no database');
    assert.equal(health.retryAfter, null);

    const crashes = await api.watcher.query('select count(*)::int as n from crash_reports');
    assert.equal(crashes.rows[0].n, 0);
    const lines = api.logs.filter((entry) => entry.requestId === busy.requestId);
    assert.equal(lines.length, 1, JSON.stringify(lines));
    assert.equal(lines[0].status, 503);
    assert.equal(lines[0].db, 'pool busy');
    assert.equal(api.logs.some((entry) => entry.error), false, 'nothing is logged as an error, which is where stacks go');
    assert.equal(JSON.stringify(api.logs).includes('    at '), false, 'no stack in the log');

    await held.release();
    held = null;
    const served = await within(3000, api.call('GET', '/v1/me', { token: user.accessToken }), 'the request after the release');
    assert.equal(served.status, 200, served.text);
    assert.equal(served.retryAfter, null);
  } finally {
    if (held) await held.release().catch(() => {});
    await api.close();
  }
});

test('P4: every 503 carries Retry-After and keeps its body, and no other answer does', async () => {
  const noPhone = await startPooled({ phone: false });
  const noGoogle = await startPooled({ google: false });
  const play = await startPooled({ billing: { notify: async () => ({ ok: false, statusCode: 503, error: 'PROVIDER_UNAVAILABLE' }), plans: () => ({ ok: true }) } });
  try {
    const phone = await noPhone.call('POST', '/v1/auth/otp', { body: { phone: '9876543210' } });
    assert.equal(phone.status, 503);
    assert.deepEqual(phone.body, { ok: false, error: 'PHONE_SIGN_IN_UNAVAILABLE' });
    assert.equal(phone.retryAfter, '2');

    const google = await noGoogle.call('POST', '/v1/auth/google', { body: { idToken: 'x.y.z' } });
    assert.equal(google.status, 503);
    assert.deepEqual(google.body, { ok: false, error: 'GOOGLE_SIGN_IN_UNAVAILABLE' });
    assert.equal(google.retryAfter, '2');

    const notified = await play.call('POST', '/v1/billing/play/notify', { body: {}, headers: { 'x-myca-notify-token': 't' } });
    assert.equal(notified.status, 503);
    assert.deepEqual(notified.body, { ok: false, error: 'PROVIDER_UNAVAILABLE' });
    assert.equal(notified.retryAfter, '2');

    const wrong = await noGoogle.call('POST', '/v1/auth/otp', { body: { phone: '123' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.retryAfter, null);
    assert.equal((await noGoogle.call('GET', '/v1/health')).retryAfter, null);
    assert.equal((await noGoogle.call('GET', '/v1/nothing')).retryAfter, null);
  } finally {
    await noPhone.close();
    await noGoogle.close();
    await play.close();
  }
});

test('P4: createDb waits five seconds for a pooled connection unless told otherwise, and only that wait becomes SERVER_BUSY', async () => {
  const RealPool = pg.Pool;
  const options = [];
  pg.Pool = class extends RealPool {
    constructor(given) {
      options.push(given);
      super(given);
    }
  };
  try {
    await createDb(ADMIN_URL).close();
    await createDb(ADMIN_URL, { connectionTimeoutMillis: 300 }).close();
  } finally {
    pg.Pool = RealPool;
  }
  assert.equal(options[0].connectionTimeoutMillis, 5000);
  assert.equal(options[1].connectionTimeoutMillis, 300);

  const db = createDb(ADMIN_URL, { max: 1, connectionTimeoutMillis: 200 });
  let release;
  let held;
  const door = new Promise((resolve) => { release = resolve; });
  const holding = new Promise((resolve) => { held = resolve; });
  const running = db.tx(async () => {
    held();
    await door;
  });
  try {
    await holding;
    for (const attempt of [() => db.query('select 1'), () => db.tx(async (q) => q('select 1'))]) {
      const error = await within(3000, attempt().then(() => null, (failure) => failure), 'the waiting query');
      assert.ok(error, 'the wait ended in an error');
      assert.equal(error.statusCode, 503);
      assert.deepEqual(error.body, { ok: false, error: 'SERVER_BUSY' });
      assert.equal(error.message, 'SERVER_BUSY');
    }
  } finally {
    release();
    await running;
  }
  await assert.rejects(db.query('select * from a_table_that_is_not_there'), (error) => error.code === '42P01' && error.statusCode === undefined);
  assert.equal((await db.query('select 1 as one')).rows[0].one, 1);
  await db.close();
});

test('P4: a database that takes the connection and never answers also ends in SERVER_BUSY once the connection timeout has passed', async () => {
  const taken = new Set();
  const silent = net.createServer((socket) => {
    taken.add(socket);
    socket.on('error', () => {});
  });
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const db = createDb(`postgres://myca@127.0.0.1:${silent.address().port}/silent`, { max: 2, connectionTimeoutMillis: 200 });
  try {
    for (const attempt of [() => db.query('select 1'), () => db.tx(async (q) => q('select 1'))]) {
      const started = Date.now();
      const error = await within(3000, attempt().then(() => null, (failure) => failure), 'the connection that never opened');
      assert.ok(error, 'the wait ended in an error');
      assert.equal(error.statusCode, 503);
      assert.deepEqual(error.body, { ok: false, error: 'SERVER_BUSY' });
      assert.ok(Date.now() - started < 2500, 'and it did not take longer than the timeout asked for');
    }
  } finally {
    for (const socket of taken) socket.destroy();
    await Promise.race([db.close().catch(() => {}), sleep(2000)]);
    silent.close();
  }
});

test('P1 and P2 and P3: across the routes that open the books no pooled connection is asked for while a books transaction holds one', async () => {
  const api = await startPooled({ max: 3 });
  try {
    await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_MOCK_MODE: '0' }, async () => {
      setChannelClient(new ChannelClient({ fetchFn: fakeTransport([]) }));
      const ok = (out, what) => {
        assert.equal(out.status, 200, `${what}: ${out.text}`);
        return out;
      };

      const owner = await api.ownerWithBusiness('+919810000051', { name: 'Sweep Traders', state: '29' });
      const accountant = await api.signIn('+919810000052');
      const biz = (rest) => `/v1/businesses/${owner.businessId}/${rest}`;
      const post = (action, body, who = owner) => api.call('POST', biz(action), { token: who.accessToken, body });
      ok(await post('company', { name: 'Sweep Traders Pvt Ltd' }), 'company');
      const held = ok(await post('propose', { name: 'create_invoice', args: SALE }), 'propose');
      ok(await post('confirm', { token: held.body.preview.token }), 'confirm');
      ok(await post('ask', { message: 'who owes me?' }), 'ask');
      ok(await post('query', { name: 'business_summary', args: {} }), 'query');
      ok(await post('uploads', { name: 'bill.txt', content: 'Supplier: Kiran Stores' }), 'uploads');
      ok(await api.call('GET', biz('snapshot'), { token: owner.accessToken }), 'snapshot');
      const exported = ok(await api.call('GET', biz('export'), { token: owner.accessToken }), 'export');
      ok(await post('replace', exported.body), 'replace');
      ok(await api.call('GET', biz('approvals'), { token: owner.accessToken }), 'approvals');
      const invited = ok(await post('invitations', { phone: '+919810000052', role: 'accountant' }), 'invitation');
      ok(await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: accountant.accessToken }), 'accept');
      ok(await post('ca-sync', { mode: 'manual' }), 'ca-sync');
      const shared = ok(await api.call('GET', biz('snapshot'), { token: accountant.accessToken }), 'shared snapshot');
      assert.ok(shared.body.sharedAsOf, 'the accountant reads the shared copy');
      ok(await post('query', { name: 'business_summary', args: {} }, accountant), 'shared query');
      ok(await post('ask', { message: 'who owes me?' }, accountant), 'shared ask');
      const key = await posKey(api, owner);
      ok(await sale(api, key, 'S-SWEEP'), 'sale');
      ok(await sale(api, key, 'S-SWEEP'), 'duplicate sale');

      const luna = await api.ownerWithBusiness('+919810000053', { name: 'Luna Bakery LLC', country: 'US' });
      const lunaPost = (action, body) => api.call('POST', `/v1/businesses/${luna.businessId}/${action}`, { token: luna.accessToken, body });
      ok(await lunaPost('connectors', { channel: 'plaid', clientId: 'plaid-client-1', secret: 'plaid-secret-1234', environment: 'sandbox' }), 'plaid keys');
      ok(await lunaPost('connectors', { channel: 'gusto', clientId: 'gusto-client-1', clientSecret: 'gusto-secret-1', environment: 'demo' }), 'gusto keys');
      ok(await lunaPost('connectors', { channel: 'taxjar', apiToken: 'taxjar-sandbox-token-1', environment: 'sandbox' }), 'taxjar keys');
      ok(await lunaPost('plaid-link-token', {}), 'plaid link token');
      ok(await lunaPost('plaid-exchange', { publicToken: 'public-sandbox-abcdefgh' }), 'plaid exchange');
      const rate = ok(await lunaPost('taxjar-rate', { zip: '78701', city: 'Austin', state: 'TX' }), 'taxjar rate');
      assert.equal(rate.body.data.recorded, true);
      const connect = ok(await lunaPost('gusto-connect', {}), 'gusto connect');
      const done = await api.call('GET', `/v1/oauth/gusto/callback?code=code-777&state=${new URL(connect.body.data.url).searchParams.get('state')}`);
      assert.match(done.text, /Gusto is connected/);
    });
    assert.deepEqual(api.violations, []);
  } finally {
    setChannelClient(null);
    await api.close();
  }
});
