import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-hard-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose } from '../src/router.mjs';
import { openSession } from '../src/session.mjs';
import { parseDocument } from '../src/intent.mjs';
import { booksAuditLedger } from '../src/audit-ledger.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const STAFF = { actor: { userId: 'staff1', role: 'staff', name: 'Staff' } };
const OWNER = { actor: { userId: 'owner1', role: 'admin', name: 'Owner' } };
const AMAZON = ['settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date', '12345678901,Order,403-1,ItemPrice,Principal,1200.00,2026-09-03', '12345678901,Order,403-1,ItemFees,Commission,-180.00,2026-09-03'].join('\n');

test('a fresh install opens with empty books, and sample books come only when asked for', () => {
  const session = openSession(join(process.env.APPDATA, 'fresh', 'state.json'));
  assert.equal(session.state.invoices.length, 0);
  assert.equal(session.state.purchases.length, 0);
});

test('only the owner can change the invoice design, the bank details on it, or the numbering; both are previewed first', async () => {
  const session = openSession(join(process.env.APPDATA, 'owner', 'state.json'));
  const staff = await session.tool('set_invoice_template', { bank: { account: '1234567890', ifsc: 'HDFC0001234', upi: 'x@y' } }, STAFF);
  assert.equal(staff.error, 'OWNER_ONLY', JSON.stringify(staff));
  assert.equal(session.state.company.invoiceTemplate?.bank?.account, undefined);
  const numbering = await session.tool('set_invoice_numbering', { mode: 'yearly' }, STAFF);
  assert.equal(numbering.error, 'OWNER_ONLY');
  const staffChat = await session.chat('bank details on invoices: a/c 1234567890 ifsc HDFC0001234', STAFF);
  assert.doesNotMatch(staffChat.reply, /updated/i, staffChat.reply);
  assert.equal(session.state.company.invoiceTemplate?.bank?.account, undefined, 'a staff chat cannot change the bank details either');
  const held = await session.propose('set_invoice_numbering', { mode: 'yearly' }, OWNER);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /one series per financial year/);
  const done = await session.confirm(held.preview.token, OWNER);
  assert.equal(done.posted, true, done.reply);
  assert.equal(session.state.company.invoiceNumbering, 'yearly');
  const design = await session.propose('set_invoice_template', { accent: '#1d4ed8' }, OWNER);
  assert.equal(design.awaitingConfirmation, true, design.reply);
  assert.match(design.reply, /Invoice design: colour/);
});

test('salary TDS rows stay with the owner', async () => {
  const session = openSession(join(process.env.APPDATA, 'tds', 'state.json'));
  await session.tool('set_tds_deductor', { tan: 'MUMN12345A' }, OWNER);
  const staff = await session.tool('tds_return', { form: 'salary', quarter: 'Q2 2026-27' }, STAFF);
  assert.equal(staff.error, 'SALARIES_PRIVATE', JSON.stringify(staff));
  const other = await session.tool('tds_return', { form: 'other', quarter: 'Q2 2026-27' }, STAFF);
  assert.notEqual(other.error, 'SALARIES_PRIVATE');
});

test('in mock mode an unmatched message gets the honest reply, not a canned model answer', async () => {
  const state = books();
  const out = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'please dance'));
  assert.match(out.reply, /did not match/, out.reply);
  assert.doesNotMatch(out.reply, /Simulated assistant reply/);
});

test('a chat invoice can carry its date', async () => {
  const doc = parseDocument('Invoice Retail Mart 2 rolls at 1000 GST 5% dated 2026-08-15');
  assert.equal(doc.date, '2026-08-15');
  assert.equal(doc.partyName, 'Retail Mart');
  assert.equal(parseDocument('Invoice Kiran Stores 1 item at 100 GST 5% on 15/08/2026').date, '2026-08-15');
  const state = books();
  await chat(state, 'Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 2 rolls at 1000, GST 5% dated 2026-08-15');
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Posted INV-0001 to Retail Mart on 15 August 2026/, posted.reply);
});

test('a file attached on the desktop is found by the import that follows, without the file sitting in the books', async () => {
  const session = openSession(join(process.env.APPDATA, 'attach', 'state.json'));
  await session.updateCompany({ name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' });
  await session.attachFile('settlement', 'settlement.csv', AMAZON);
  assert.equal(session.state.pendingFile.content, undefined, 'the pending file holds a hash, not the bytes');
  const held = await session.chat('import amazon settlement');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const posted = await session.chat('yes');
  assert.match(posted.reply, /Recorded STL-0001/, posted.reply);
});

test('GSTR-3B and the TDS monitor answer in words, and the audit runs on the books themselves', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cotton', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }], date: '2026-09-05' });
  await runTool(state, 'post_expense', { narration: 'office rent', amount: 250000, payee: 'Mehta', date: '2026-09-10' });
  const b = await chat(state, 'gstr-3b for 2026-09');
  assert.match(b.reply, /^GSTR-3B September 2026/, b.reply);
  assert.match(b.reply, /Outward \(3\.1\): taxable ₹10,000\.00; IGST ₹0\.00, CGST ₹250\.00, SGST ₹250\.00/);
  assert.match(b.reply, /ITC \(4A\)/);
  const t = await chat(state, 'monitor tds');
  assert.match(t.reply, /No payments file is attached/, t.reply);
  const ledger = booksAuditLedger(state);
  assert.equal(ledger.ok, true);
  assert.equal(ledger.rows, 2);
  assert.match(ledger.text, /INV-0001 sale,,10500,Retail Mart,sales,/);
  assert.match(ledger.text, /office rent,250000,,Mehta,rent,/);
  const audit = await chat(state, 'audit the books');
  assert.match(audit.reply, /^Audited 2 entries from the books \(2 entries\)/, audit.reply);
  assert.match(audit.reply, /TDS 194I not deducted/, 'the rent without TDS is flagged');
  const empty = await runTool(createState(), 'audit_books', {});
  assert.equal(empty.error, 'NO_ENTRIES');
});
