import { createServer } from 'node:http';
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import pg from 'pg';
import { createApi } from '../src/api.mjs';
import { createCaptureSender } from '../src/auth.mjs';
import { createDb, migrate } from '../src/db.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { openState } from '../src/books-seal.mjs';

process.env.MYCA_TRUSTED_PROXY_HOPS = '1';

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
export const SECRET = 'test-secret-that-is-long-enough-for-hmac-0123456789';
export const GOOGLE_CLIENT = 'myca-test.apps.googleusercontent.com';
const GOOGLE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const TEST_GOOGLE_KEYS = { get: async (kid) => (kid === 'test-kid' ? GOOGLE_KEY.publicKey : null) };

export const OIDC_ISSUER = 'https://login.example.test/realms/myca';
export const OIDC_CLIENT = 'myca-android';

export function googleToken(claims = {}, { kid = 'test-kid', privateKey = GOOGLE_KEY.privateKey, alg = 'RS256' } = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const body = { iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT, sub: '110169484474386276334', email: 'asha@example.com', email_verified: true, name: 'Asha Rao', iat: seconds, exp: seconds + 3600, ...claims };
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signing = `${part({ alg, kid, typ: 'JWT' })}.${part(body)}`;
  const signature = createSign('RSA-SHA256').update(signing).sign(privateKey).toString('base64url');
  return `${signing}.${signature}`;
}

export const SALE = {
  partyName: 'Kiran Stores',
  partyGstin: '',
  lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }],
};

async function admin(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function sessionsGone(name) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    for (let waited = 0; waited < 5000; waited += 10) {
      const open = await client.query('select count(*)::int as n from pg_stat_activity where datname = $1', [name]);
      if (open.rows[0].n === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    await client.end();
  }
}

export const BOOKS_KEY = 'test-books-key-0123456789abcdef0123456789abcdef';

export async function startApi(options = {}) {
  const name = `myca_t_${randomBytes(6).toString('hex')}`;
  await admin(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const db = createDb(url.toString());
  await migrate(db);
  const sender = createCaptureSender();
  const clock = { now: Date.now(), advance(ms) { this.now += ms; } };
  const logs = [];
  const handler = createApi({ billing: options.billing ? options.billing({ db, now: () => clock.now }) : null, db, secret: SECRET, otpSender: options.phone === false ? null : sender, googleClientIds: [GOOGLE_CLIENT], googleKeys: TEST_GOOGLE_KEYS, oidc: options.oidc || {}, oidcKeys: options.oidcKeys || null, documentVault: options.documentVault || null, connectorKey: options.connectorKey || '', booksKey: options.booksKey === undefined ? BOOKS_KEY : options.booksKey, now: () => clock.now, log: (entry) => logs.push(entry), jobToken: options.jobToken || '', inboundEmail: options.inboundEmail || {}, whatsapp: options.whatsapp || {}, whatsappSender: options.whatsappSender || null, gspFetch: options.gspFetch || null });
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
    return { status: res.status, body: parsed, text, requestId: res.headers.get('x-request-id') };
  }

  async function signIn(phone, { agree = true } = {}) {
    const otp = await call('POST', '/v1/auth/otp', { body: { phone } });
    const verified = await call('POST', '/v1/auth/verify', {
      body: { challengeId: otp.body.challengeId, phone, code: sender.last().code, deviceLabel: 'test phone' },
    });
    if (verified.status !== 200) throw new Error(`sign-in failed: ${verified.text}`);
    if (agree) {
      const agreed = await call('POST', '/v1/me/consent', { token: verified.body.accessToken, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } });
      if (agreed.status !== 200) throw new Error(`consent failed: ${agreed.text}`);
    }
    return verified.body;
  }

  async function ownerWithBusiness(phone, business = { name: 'Asha Traders', state: '29' }) {
    const session = await signIn(phone);
    const created = await call('POST', '/v1/businesses', { token: session.accessToken, body: business });
    if (created.status !== 200) throw new Error(`business not created: ${created.text}`);
    return { ...session, token: session.accessToken, businessId: created.body.business.id };
  }

  const books = async (businessId) => {
    const found = await db.query('select state from books where business_id = $1', [businessId]);
    return openState(options.booksKey === undefined ? BOOKS_KEY : options.booksKey, businessId, found.rows[0].state);
  };
  return {
    base,
    db,
    sender,
    clock,
    books,
    logs,
    call,
    signIn,
    ownerWithBusiness,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
      await sessionsGone(name);
      await admin(`drop database if exists ${name} with (force)`);
    },
  };
}
