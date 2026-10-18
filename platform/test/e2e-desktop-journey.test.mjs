import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'journey-token-0123456789abcdef0123456789abcdef';
const SMELL = /undefined|NaN|\[object Object\]|TypeError|ReferenceError|\.mjs:\d+/;
const BANK = ['Date,Narration,Withdrawal,Deposit,Balance', '05/09/2026,UPI/Retail Mart/INV-0001,,10500.00,210500.00', '06/09/2026,NEFT/Fabrics Co/BILL,10500.00,,200000.00', '07/09/2026,Bank charges,118.00,,199882.00'].join('\n');
const AMAZON = ['settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date,sku,quantity-purchased', '12345678901,Order,403-1111111-1111111,ItemPrice,Principal,1200.00,2026-09-03,SKU-A,1', '12345678901,Order,403-1111111-1111111,ItemPrice,Tax,60.00,2026-09-03,SKU-A,1', '12345678901,Order,403-1111111-1111111,ItemFees,Commission,-180.00,2026-09-03,SKU-A,1', '12345678901,other-transaction,,,TCS,-20.00,2026-09-07,,'].join('\n');
const MTR = ['Order Id,Shipment Date,Transaction Type,Ship To State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount', '403-1111111-1111111,2026-09-03,Shipment,MAHARASHTRA,SKU-A,1,1200.00,60.00,5,1260.00'].join('\n');

let child;
let base = '';
const stderr = [];

before(async () => {
  const home = mkdtempSync(join(tmpdir(), 'myca-e2e-'));
  child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, env: { ...process.env, APPDATA: home, HOME: home, MYCA_MOCK_MODE: '1', MYCA_ENABLE_LIVE_CALLS: '0', MYCA_API_TOKEN: TOKEN, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => stderr.push(String(d)));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { const m = /MyCA (http:\/\/127\.0\.0\.1:\d+)/.exec(String(d)); if (m) { base = m[1]; resolve(); } });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${stderr.join('')}`)));
    setTimeout(() => reject(new Error('server did not start')), 30000);
  });
});
after(() => { child?.kill(); });

async function api(path, body, method = 'POST') {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', 'x-myca-client': TOKEN }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  return res.json();
}
async function say(message, expect) {
  const out = await api('/api/chat', { message });
  const reply = String(out.reply ?? '');
  assert.doesNotMatch(reply, SMELL, `${message}\n${reply}`);
  if (expect) assert.match(reply, expect, `${message}\n${reply}`);
  return out;
}
const attach = (kind, name, content) => api('/api/attach', { kind, name, content });

test('a new business is set up, trades for a month, imports its bank and marketplace files, reviews and files GST in mock mode, and survives a backup and restore, all through the server the desktop uses', async () => {
  const health = await api('/api/health', undefined, 'GET');
  assert.equal(health.ok, true);
  const snapshot0 = await api('/api/snapshot', undefined, 'GET');
  assert.equal((snapshot0.invoices || snapshot0.recentInvoices || []).length, 0, 'a fresh install has no demo invoices');
  assert.equal(snapshot0.company.setupNeeded, true, 'a fresh install asks for the business first');
  assert.equal(snapshot0.company.name, '');
  assert.match(snapshot0.company.fy, /^\d{4}-\d{2}$/);

  assert.equal((await api('/api/company', { name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27', pan: 'AABCU9603R' })).ok, true);
  const snapshot1 = await api('/api/snapshot', undefined, 'GET');
  assert.equal(snapshot1.company.setupNeeded, undefined, 'setup is done once the business is named');
  assert.equal(snapshot1.company.pan, 'AABCU9603R');
  await say('company profile', /Nalanda Textiles|27AABCU9603R1ZN/);
  await say('we deduct TDS, TAN MUMN12345A', /MUMN12345A/);
  await say('yes', /MUMN12345A|deduct/i);

  await say('Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 1000, GST 5% dated 2026-09-05', /Reply "yes"/);
  await say('yes', /Posted INV-0001 to Retail Mart on 5 September 2026 for ₹10,500\.00/);
  await say('Invoice Kiran Stores 2 shirts at 500 GST 12% dated 2026-09-08', /Reply "yes"/);
  await say('yes', /Posted INV-0002 to Kiran Stores on 8 September 2026/);
  await say('purchase from Fabrics Co GSTIN 27AABCT1332L1ZE at 10000 GST 5% dated 2026-09-06', /Reply "yes"/);
  await say('yes', /Booked BILL-0001 from Fabrics Co for ₹10,500\.00/);
  await say('paid 60000 office rent to Mehta tds 194I PAN ABCPM1234Q', /Reply "yes"/);
  await say('yes', /Posted|Recorded|rent/i);
  await say('INV-0001 paid by bank', /Reply "yes"/);
  await say('yes', /INV-0001/);
  await say('credit note for INV-0002 100 on 2026-09-09 - short delivery', /Reply "yes"/);
  await say('yes', /CN-0001/);
  await say('print INV-0001', /Printable INV-0001 for Retail Mart/);

  await attach('bank', 'bank.csv', BANK);
  await say('import bank', /3 rows parsed/);
  await say('yes', /Bank statement brought in: 3 rows read/);
  await say('show trial balance', /Total|Dr|Cr/i);
  await say('gst payable for 2026-09', /₹/);
  await say('gstr-1', /GSTR-1/);
  await say('gstr-3b for 2026-09', /^GSTR-3B September 2026/);
  await say('export gstr1 json', /GSTR-1|json/i);

  const review = await api('/api/tool', { name: 'gst_review', args: { period: '2026-09' } });
  assert.equal(review.ok, true, JSON.stringify(review));
  for (const step of review.data.steps) {
    const answered = await api('/api/tool', { name: 'gst_review_answer', args: { period: '2026-09', step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash } });
    assert.equal(answered.ok, true, JSON.stringify(answered));
  }
  await say('save GSTR-1 for 2026-09 to the portal', /Simulated: GSTR-1 for September 2026 \(27AABCU9603R1ZN\) saved to the portal/);
  await say('file GSTR-1 for 2026-09 with OTP 123456', /Simulated: GSTR-1 for September 2026 filed/);
  await say('generate FVU for Q2 2026-27 26Q', /Simulated: FVU job for 26Q Q2 2026-27/);
  await say('portal status', /GSTR-1 September 2026 27AABCU9603R1ZN: saved .* filed .* \(MOCK-ACK-2026-09\) \(simulated\)/);

  await say('deadlines', /GSTR|due/i);
  await say('exceptions', /open|Nothing needs attention/);
  await say('daily close', /close|checked|day/i);
  await say('remind me to call Rajesh tomorrow', /Reply "yes"/);
  await say('yes', /Call Rajesh/);
  await say('what do our notes say about Rajesh', /Simulated|Rajesh/);

  await attach('settlement', 'settlement.csv', AMAZON);
  await say('import amazon settlement', /Reply "yes"/);
  await say('yes', /Recorded STL-0001/);
  await attach('orders', 'orders.csv', MTR);
  await say('import amazon orders', /Reply "yes"/);
  await say('yes', /Posted|invoice/i);
  await say('did amazon pay correctly?', /paid|short|settlement|exception/i);
  await say('audit the books', /^Audited \d+ entries from the books/);
  await say('monitor tds', /No payments file is attached/);
  await say('help', /MyCA posts/);
  await say('please dance', /did not match/);

  const backup = await api('/api/backup');
  assert.ok(backup.state?.invoices?.length >= 2, 'the backup carries the invoices');
  const before = await api('/api/query', { name: 'trial_balance', args: {} });
  const restored = await api('/api/restore', { ...backup, confirm: true });
  assert.equal(restored.ok, true, JSON.stringify(restored).slice(0, 300));
  const afterRestore = await api('/api/query', { name: 'trial_balance', args: {} });
  assert.deepEqual(afterRestore, before, 'the trial balance is identical after a restore');
  const unexpected = stderr.join('').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('MyCA daily checks:'));
  assert.deepEqual(unexpected, [], 'the server logged nothing but the daily checks');
});
