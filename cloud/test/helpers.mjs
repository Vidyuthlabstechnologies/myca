import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createApi } from '../src/api.mjs';
import { createCaptureSender } from '../src/auth.mjs';
import { createDb, migrate } from '../src/db.mjs';

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
export const SECRET = 'test-secret-that-is-long-enough-for-hmac-0123456789';

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

export async function startApi() {
  const name = `myca_t_${randomBytes(6).toString('hex')}`;
  await admin(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const db = createDb(url.toString());
  await migrate(db);
  const sender = createCaptureSender();
  const clock = { now: Date.now(), advance(ms) { this.now += ms; } };
  const logs = [];
  const handler = createApi({ db, secret: SECRET, otpSender: sender, now: () => clock.now, log: (entry) => logs.push(entry) });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { token, body, raw } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
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

  async function signIn(phone) {
    const otp = await call('POST', '/v1/auth/otp', { body: { phone } });
    const verified = await call('POST', '/v1/auth/verify', {
      body: { challengeId: otp.body.challengeId, phone, code: sender.last().code, deviceLabel: 'test phone' },
    });
    if (verified.status !== 200) throw new Error(`sign-in failed: ${verified.text}`);
    return verified.body;
  }

  async function ownerWithBusiness(phone, business = { name: 'Asha Traders', state: '29' }) {
    const session = await signIn(phone);
    const created = await call('POST', '/v1/businesses', { token: session.accessToken, body: business });
    if (created.status !== 200) throw new Error(`business not created: ${created.text}`);
    return { ...session, token: session.accessToken, businessId: created.body.business.id };
  }

  return {
    base,
    db,
    sender,
    clock,
    logs,
    call,
    signIn,
    ownerWithBusiness,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
      await admin(`drop database if exists ${name} with (force)`);
    },
  };
}
