import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { startUsSandbox, runUsSandboxCheck, sandboxRefusal, sandboxTaxYear } from '../sandbox/us-sandbox.mjs';
import { normalizePhone } from '../src/auth.mjs';

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
const name = `myca_t_${randomBytes(6).toString('hex')}`;
let databaseUrl;

async function admin(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

before(async () => {
  await admin(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  databaseUrl = url.toString();
});

after(async () => {
  await admin(`drop database if exists ${name} with (force)`);
});

test('US numbers sign in by phone in E.164 form, and a bare ten-digit number stays Indian', () => {
  assert.equal(normalizePhone('+1 (202) 555-0143'), '+12025550143');
  assert.equal(normalizePhone('+12025550143'), '+12025550143');
  assert.equal(normalizePhone('+11025550143'), '', 'an area code cannot start with 0 or 1');
  assert.equal(normalizePhone('+12021550143'), '', 'nor can an exchange');
  assert.equal(normalizePhone('9175550143'), '+919175550143');
  assert.equal(normalizePhone('+919400000001'), '+919400000001');
  assert.equal(normalizePhone('12025550143'), '', 'a US number needs its +1');
});

test('the sandbox refuses live switches, live Stripe keys, real partner keys and production hosts', () => {
  assert.equal(sandboxRefusal({}), '');
  assert.match(sandboxRefusal({ MYCA_ENABLE_LIVE_CALLS: '1' }), /live calls/);
  assert.match(sandboxRefusal({ K_SERVICE: 'myca-api' }), /production/);
  assert.match(sandboxRefusal({ MYCA_STRIPE_SECRET_KEY: 'sk_live_abc' }), /live Stripe key/);
  assert.match(sandboxRefusal({ MYCA_US_FILER_API_KEY: 'real', MYCA_US_FILER_BASE_URL: 'https://api.columntax.com' }), /partner/);
  assert.equal(sandboxTaxYear(Date.parse('2026-11-14T00:00:00Z')), 2025);
  assert.equal(sandboxTaxYear(Date.parse('2027-02-01T00:00:00Z')), 2026);
});

test('the documented sandbox runs the whole US path through the fake partner with Plus by card', async () => {
  const sandbox = await startUsSandbox({ databaseUrl, port: 0, consolePort: 0, log: () => {} });
  try {
    const out = await runUsSandboxCheck(sandbox, { phone: '+12025550101' });
    assert.equal(out.ok, true);
    assert.ok(out.steps.length >= 18, JSON.stringify(out.steps));
    const outside = await fetch('https://api.stripe.com/v1/charges').then(() => 'reached', (err) => err.message);
    assert.match(outside, /refused/, 'no request leaves the machine');
    const refunded = await fetch(`${sandbox.consoleUrl}/checkout/${sandbox.state().checkouts.find((item) => item.mode === 'payment').id}/refund`, { method: 'POST', headers: { accept: 'application/json' } }).then((res) => res.json());
    assert.equal(refunded.recorded, true, JSON.stringify(refunded));
  } finally {
    await sandbox.close();
  }
});

test('the documented sandbox runs the own MeF simulator route with Plus bought in Google Play', async () => {
  const sandbox = await startUsSandbox({ databaseUrl, port: 0, consolePort: 0, route: 'mef', plus: 'play', log: () => {} });
  try {
    const out = await runUsSandboxCheck(sandbox, { phone: '+12025550102' });
    assert.equal(out.ok, true);
    assert.equal(sandbox.state().partnerSessions.length, 0);
  } finally {
    await sandbox.close();
  }
});
