/**
 * MyCA stress: ledger volume, concurrent HTTP writes, live read burst.
 * Isolated writes use a temp APPDATA so %APPDATA%\MyCA books are not flooded.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { trialBalance, verifyChain } from '../src/ledger.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { chat } from '../src/router.mjs';

const LIVE = process.env.STRESS_LIVE_URL || 'http://127.0.0.1:4780';
const API_TOKEN = process.env.MYCA_API_TOKEN || randomBytes(32).toString('hex');
const HTTP_N = Number(process.env.STRESS_HTTP || 300);
const ENGINE_N = Number(process.env.STRESS_ENGINE || 1500);
const BILLS = Number(process.env.STRESS_BILLS || 400);

function mem() {
  const m = process.memoryUsage();
  return { rssMb: +(m.rss / 1048576).toFixed(1), heapMb: +(m.heapUsed / 1048576).toFixed(1) };
}

function report(name, extra) {
  console.log(JSON.stringify({ name, ...extra, mem: mem() }));
}

async function engineVolume() {
  const t0 = performance.now();
  const state = createState();
  let fail = 0;
  for (let i = 0; i < ENGINE_N; i++) {
    const r = createInvoice(state, {
      date: '2026-08-05',
      partyName: `Buyer ${i % 80}`,
      partyGstin: i % 3 === 0 ? '27AAACH7409R1Z1' : '',
      partyState: '27',
      lines: [{ description: 'Roll', hsn: '5208', qty: 1, rate: 1000 + (i % 50), gstRate: 5 }],
    });
    if (!r.ok) fail += 1;
    if (i % 250 === 0 && i) {
      const tb = trialBalance(state.ledger);
      if (!tb.balanced) throw new Error(`TB broke at invoice ${i}`);
    }
  }
  for (let i = 0; i < BILLS; i++) {
    const r = createPurchase(state, {
      date: '2026-08-06',
      partyName: `Vendor ${i % 40}`,
      partyGstin: '27AABCT1332L1ZE',
      partyState: '27',
      lines: [{ description: 'Grey', hsn: '5208', qty: 2, rate: 500, gstRate: 5 }],
    });
    if (!r.ok) fail += 1;
  }
  const tb = trialBalance(state.ledger);
  const chain = verifyChain(state.ledger);
  const g1t0 = performance.now();
  const g1 = invoicesToGstr1Json(state.company, state.invoices);
  const chatOut = await chat(state, 'trial balance');
  report('engine_volume', {
    ms: +(performance.now() - t0).toFixed(1),
    invoices: state.invoices.length,
    bills: state.purchases.length,
    transfers: state.ledger.transfers.length,
    fail,
    tb: tb.balanced,
    chain: chain.ok,
    gstr1B2b: g1.b2b.length,
    gstr1Ms: +(performance.now() - g1t0).toFixed(1),
    chatTied: /ties/i.test(chatOut.reply),
  });
  if (!tb.balanced || !chain.ok || fail) throw new Error('engine volume failed');
}

function waitFor(url, timeoutMs = 20000) {
  const t0 = Date.now();
  return (async function loop() {
    try {
      const r = await fetch(url, { headers: { 'x-myca-client': API_TOKEN } });
      if (r.ok || r.status === 400) return;
    } catch { /* retry */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting ${url}`);
    await new Promise((r) => setTimeout(r, 150));
    return loop();
  })();
}

async function httpBurst(base, label) {
  const post = (name, args) => fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-myca-client': API_TOKEN },
    body: JSON.stringify({ name, args }),
  }).then((r) => r.json());

  const t0 = performance.now();
  const jobs = Array.from({ length: HTTP_N }, (_, i) => post('create_invoice', {
    partyName: `Burst ${i}`,
    partyGstin: i % 2 ? '27AAACH7409R1Z1' : '24AAACF7856R1ZY',
    partyState: i % 2 ? '27' : '24',
    lines: [{ description: 'Load', qty: 1, rate: 10000, gstRate: 18 }],
  }));
  const results = await Promise.all(jobs);
  const ok = results.filter((r) => r.ok).length;
  const tb = await post('trial_balance', {});
  const d = tb.data || tb;
  const snap = await fetch(`${base}/api/snapshot`, { headers: { 'x-myca-client': API_TOKEN } }).then((r) => r.json());
  const reads = await Promise.all(Array.from({ length: 200 }, () => fetch(`${base}/api/snapshot`, { headers: { 'x-myca-client': API_TOKEN } }).then((r) => r.status)));
  report(`http_${label}`, {
    ms: +(performance.now() - t0).toFixed(1),
    posts: HTTP_N,
    postedOk: ok,
    tb: d.balanced,
    invoices: (snap.invoices || []).length,
    bills: (snap.purchases || []).length,
    snapshot200: reads.filter((s) => s === 200).length,
  });
  if (ok !== HTTP_N || !d.balanced) throw new Error(`http ${label} failed ok=${ok} tb=${d.balanced}`);
}

async function liveReads() {
  const t0 = performance.now();
  try {
    const ping = await fetch(`${LIVE}/api/snapshot`, { headers: { 'x-myca-client': API_TOKEN } });
    if (!ping.ok) {
      report('live_reads', { skipped: true, reason: `HTTP ${ping.status}` });
      return;
    }
  } catch {
    report('live_reads', { skipped: true, reason: 'server not up' });
    return;
  }
  const n = 250;
  const codes = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const path = i % 3 === 0 ? '/api/snapshot' : '/api/tool';
    if (path === '/api/snapshot') return (await fetch(`${LIVE}${path}`, { headers: { 'x-myca-client': API_TOKEN } })).status;
    const r = await fetch(`${LIVE}/api/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-myca-client': API_TOKEN },
      body: JSON.stringify({ name: 'trial_balance', args: {} }),
    });
    return r.status;
  }));
  report('live_reads', {
    ms: +(performance.now() - t0).toFixed(1),
    n,
    http200: codes.filter((c) => c === 200).length,
    note: 'reads only; did not post invoices to your live books',
  });
  if (codes.some((c) => c !== 200)) throw new Error('live read burst had non-200');
}

async function isolatedHttp() {
  const root = mkdtempSync(join(tmpdir(), 'myca-stress-'));
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, APPDATA: root, PORT: '4799', MYCA_API_TOKEN: API_TOKEN },
    stdio: 'pipe',
  });
  let err = '';
  child.stderr.on('data', (b) => { err += b; });
  try {
    await waitFor('http://127.0.0.1:4799/api/snapshot');
    await httpBurst('http://127.0.0.1:4799', 'isolated');
  } finally {
    child.kill();
    await new Promise((r) => child.once('exit', r));
    try { rmSync(root, { recursive: true, force: true }); } catch { /* keep */ }
    if (err && !err.includes('MyCA')) console.error(err.slice(0, 500));
  }
}

const tAll = performance.now();
await engineVolume();
await isolatedHttp();
await liveReads();
report('stress_done', { totalMs: +(performance.now() - tAll).toFixed(1) });
