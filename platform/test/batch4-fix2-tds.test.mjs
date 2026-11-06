import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, fmtToolResult } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { tdsCreditCheck, planTdsWithheld, tdsWithheldInFy, TDS_CHECK_NOTE } from '../src/tds-credits.mjs';
import { advanceTax } from '../src/advance-tax.mjs';

const HEADER = 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking';
const ACME_ROW = '194C,ACME CORP,ACME12345A,50000,500,2026-09-10';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

async function sale(state, partyName, amount, date) {
  const out = await runTool(state, 'create_invoice', { partyName, lines: [{ description: 'Services', qty: 1, rate: amount, gstRate: 0 }], date });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.invoice;
}

async function withheld(state, args) {
  const out = await runTool(state, 'record_tds_withheld', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

async function received(state, args) {
  const out = await runTool(state, 'record_receipt', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

async function importLines(state, ...lines) {
  const out = await runTool(state, 'import_26as_credits', { csv: [HEADER, ...lines].join('\n') });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

const checkOf = (state, fy = '2026-27') => tdsCreditCheck(state, { fy }).data;
const brief = (data) => data.rows.map((row) => [row.section, row.tan, row.quarter, row.in26as, row.inBooks, row.status]);

test('R1-0: a 26AS file that lists the same row twice stores both on fresh books, and sending the file again stores nothing', async () => {
  const state = books();
  const first = await importLines(state, ACME_ROW, ACME_ROW);
  assert.equal(first.data.imported, 2);
  assert.equal(first.data.total, 1000);
  assert.deepEqual(first.data.skipped, []);
  assert.equal(state.tdsCreditStatements.length, 2);
  const d = checkOf(state);
  assert.deepEqual(brief(d), [['194C', 'ACME12345A', 'Q2 2026-27', 1000, 0, 'not in books']]);
  assert.equal(d.totals.in26as, 1000);

  const again = await importLines(state, ACME_ROW, ACME_ROW);
  assert.equal(again.data.imported, 0);
  assert.deepEqual(again.data.skipped.map((row) => row.reason), ['exists', 'exists']);
  assert.equal(state.tdsCreditStatements.length, 2);
});

test('R1-0: only the file lines beyond the rows already stored are imported, line by line', async () => {
  const state = books();
  await importLines(state, ACME_ROW);
  const more = await importLines(state, ACME_ROW, ACME_ROW, ACME_ROW);
  assert.equal(more.data.imported, 2);
  assert.deepEqual(more.data.skipped.map((row) => row.reason), ['exists']);
  assert.equal(more.data.total, 1000);
  assert.equal(state.tdsCreditStatements.length, 3);
  const none = await importLines(state, ACME_ROW, ACME_ROW, ACME_ROW);
  assert.equal(none.data.imported, 0);
  assert.deepEqual(none.data.skipped.map((row) => row.reason), ['exists', 'exists', 'exists']);
  assert.equal(state.tdsCreditStatements.length, 3);

  const apart = books();
  await importLines(apart, ACME_ROW);
  const different = await importLines(apart, ACME_ROW, '194C,ACME CORP,ACME12345A,50000,500,2026-09-11', '194J,ACME CORP,ACME12345A,50000,500,2026-09-10', '194C,ACME CORP,ACME12345A,60000,500,2026-09-10');
  assert.equal(different.data.imported, 3);
  assert.deepEqual(different.data.skipped.map((row) => row.reason), ['exists']);

  const legacy = books();
  legacy.tdsCreditStatements = [{ tan: 'BLRA12345A', name: 'AMAZON', date: '2026-09-30', quarter: 'Q2 2026-27', channel: 'amazon', amountPaid: 20000, taxDeducted: 150, importedOn: '2026-10-01' }];
  const marketplace = '194O,AMAZON SELLER SERVICES PVT LTD,BLRA12345A,20000,150,2026-09-30';
  const older = await importLines(legacy, marketplace, marketplace);
  assert.equal(older.data.imported, 1);
  assert.deepEqual(older.data.skipped.map((row) => row.reason), ['exists']);
  assert.equal(legacy.tdsCreditStatements.length, 2);
});

test('R1-0: the check and advance tax count every identical 26AS row that was imported', async () => {
  const state = books();
  state.company.entityType = 'proprietorship';
  await importLines(state, ACME_ROW, ACME_ROW);
  assert.equal(advanceTax(state, { asOf: '2026-11-30' }).data.credits.tds26as, 1000);
  assert.equal(checkOf(state).totals.notInBooks, 1000);
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  await withheld(state, { invoiceId: invoice.id, amount: 1000, date: '2026-09-10', section: '194C', tan: 'ACME12345A' });
  const d = checkOf(state);
  assert.deepEqual(brief(d), [['194C', 'ACME12345A', 'Q2 2026-27', 1000, 1000, 'matched']]);
  assert.deepEqual(d.totals, { in26as: 1000, inBooks: 1000, gap: 0, notInBooks: 0, notIn26as: 0 });
});

test('R1-0: the preview and the done message count the lines the same way', async () => {
  const file = { name: '26as.csv', content: [HEADER, ACME_ROW, ACME_ROW].join('\n') };
  const state = books();
  state.pendingFile = { ...file };
  const held = await chat(state, 'import 26as');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Form 26AS: 2 entries totalling ₹1,000\.00 \(194C 2\)/, held.reply);
  assert.doesNotMatch(held.reply, /already recorded/, held.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Recorded 2 entries of TDS from Form 26AS totalling ₹1,000\.00 \(194C 2\)\./, done.reply);
  assert.equal(state.tdsCreditStatements.length, 2);

  state.pendingFile = { ...file };
  const repeat = await chat(state, 'import 26as');
  assert.equal(repeat.awaitingConfirmation, undefined, repeat.reply);
  assert.match(repeat.reply, /Every row is already recorded/, repeat.reply);
  assert.equal(state.tdsCreditStatements.length, 2);

  const partly = books();
  await importLines(partly, ACME_ROW);
  partly.pendingFile = { ...file };
  const half = await chat(partly, 'import 26as');
  assert.equal(half.awaitingConfirmation, true, half.reply);
  assert.match(half.reply, /Form 26AS: 1 entry totalling ₹500\.00 \(194C 1\); 1 already recorded\./, half.reply);
  const rest = await chat(partly, 'yes');
  assert.match(rest.reply, /Recorded 1 entry of TDS from Form 26AS totalling ₹500\.00 \(194C 1\)\./, rest.reply);
  assert.equal(partly.tdsCreditStatements.length, 2);
});

test('R1-1: a TDS date left blank is the date of the latest cash receipt on the invoice, else the invoice date, never today', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  const args = { invoiceId: invoice.id, amount: 2000, section: '194C', tan: 'ACME12345A' };
  assert.equal(planTdsWithheld(state, args).date, '2026-08-01');
  await received(state, { invoiceId: invoice.id, amount: 30000, mode: 'cash', date: '2026-09-25' });
  await received(state, { invoiceId: invoice.id, amount: 40000, mode: 'bank', date: '2026-09-10' });
  await withheld(state, { invoiceId: invoice.id, amount: 500, date: '2026-10-15', section: '194C' });
  for (const blank of [undefined, null, '', '   ']) assert.equal(planTdsWithheld(state, { ...args, date: blank }).date, '2026-09-25', JSON.stringify(blank));
  assert.equal(planTdsWithheld(state, { ...args, date: '2026-10-02' }).date, '2026-10-02');
  assert.equal(planTdsWithheld(state, { ...args, date: '2026-13-45' }).error, 'INVALID_DATE');
  const out = await runTool(state, 'record_tds_withheld', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.receipt.date, '2026-09-25');
  assert.equal(state.ledger.transfers.at(-1).userData, '2026-09-25');
});

test('R1-1: the remedy the check prescribes closes the gap it found', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  await received(state, { invoiceId: invoice.id, amount: 98000, mode: 'bank', date: '2026-09-10' });
  const header = `${HEADER.replace('Date of Booking', 'Transaction Date,Date of Booking')}`;
  const imported = await runTool(state, 'import_26as_credits', { csv: [header, '194C,ACME CORP,ACME12345A,100000,2000,2026-09-10,2026-10-28'].join('\n') });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.deepEqual(brief(checkOf(state)), [['194C', 'ACME12345A', 'Q2 2026-27', 2000, 0, 'not in books']]);

  const out = await runTool(state, 'record_tds_withheld', { invoiceId: invoice.id, amount: 2000, section: '194C', tan: 'ACME12345A' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.receipt.date, '2026-09-10');
  const d = checkOf(state);
  assert.deepEqual(brief(d), [['194C', 'ACME12345A', 'Q2 2026-27', 2000, 2000, 'matched']]);
  assert.deepEqual(d.totals, { in26as: 2000, inBooks: 2000, gap: 0, notInBooks: 0, notIn26as: 0 });
});

test('R1-1: a deduction in March recorded without a date stays in the financial year it was made in', async () => {
  const state = books();
  state.company.entityType = 'proprietorship';
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-02-10');
  await received(state, { invoiceId: invoice.id, amount: 98000, mode: 'bank', date: '2026-03-05' });
  await importLines(state, '194C,ACME CORP,ACME12345A,100000,2000,2026-03-05');
  const out = await withheld(state, { invoiceId: invoice.id, amount: 2000, section: '194C', tan: 'ACME12345A' });
  assert.equal(out.receipt.date, '2026-03-05');
  assert.deepEqual(brief(checkOf(state, '2025-26')), [['194C', 'ACME12345A', 'Q4 2025-26', 2000, 2000, 'matched']]);
  assert.deepEqual(checkOf(state, '2026-27').rows, []);
  assert.equal(tdsWithheldInFy(state, { label: '2025-26', from: '2025-04-01', to: '2026-03-31' }, '2026-03-31'), 2000);
  assert.equal(tdsWithheldInFy(state, { label: '2026-27', from: '2026-04-01', to: '2027-03-31' }, '2027-03-31'), 0);
});

test('R1-1: the preview and the done message show the date that is used', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  await received(state, { invoiceId: invoice.id, amount: 98000, mode: 'bank', date: '2026-09-10' });
  const blank = previewOf(state, 'record_tds_withheld', { invoiceId: invoice.id, amount: 2000, section: '194C' });
  assert.deepEqual(blank.blockers, []);
  assert.equal(blank.summary, 'TDS of ₹2,000.00 withheld by Acme Corp on INV-0001 (section 194C), dated 10 Sep 2026');
  const said = previewOf(state, 'record_tds_withheld', { invoiceId: invoice.id, amount: 2000, section: '194C', date: '2026-08-12' });
  assert.equal(said.summary, 'TDS of ₹2,000.00 withheld by Acme Corp on INV-0001 (section 194C), dated 12 Aug 2026');

  const held = await chat(state, 'record tds withheld 2000 on INV-0001 under 194C');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /\(section 194C\), dated 10 Sep 2026/, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.reply, 'Recorded TDS of ₹2,000.00 withheld on INV-0001, dated 10 Sep 2026; ₹0.00 still owed.');
  assert.equal(state.invoices[0].receipts.at(-1).date, '2026-09-10');
  assert.deepEqual(brief(checkOf(state)), [['194C', '', 'Q2 2026-27', 0, 2000, 'not in 26AS']]);
  assert.equal(fmtToolResult('record_tds_withheld', { ok: true, invoice: { id: 'INV-0001' }, receipt: { amount: 5, date: '2026-09-04' }, remaining: 1 }), 'Recorded TDS of ₹5.00 withheld on INV-0001; ₹1.00 still owed.');
});

test('R1-1: a date worked out from the invoice that falls in a closed period is refused, and the preview names it', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  await received(state, { invoiceId: invoice.id, amount: 98000, mode: 'bank', date: '2026-09-10' });
  await runTool(state, 'lock_period', { through: '2026-09-30', reason: 'closed' });
  const args = { invoiceId: invoice.id, amount: 2000, section: '194C' };
  const refused = await runTool(state, 'record_tds_withheld', args);
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'PERIOD_LOCKED');
  assert.equal(refused.date, '2026-09-10');
  assert.equal(state.invoices[0].receipts.length, 1);
  const preview = previewOf(state, 'record_tds_withheld', args);
  assert.equal(preview.blockers.length, 1);
  assert.match(preview.blockers[0], /locked period/);
  assert.match(preview.blockers[0], /10 Sep 2026/);
  assert.doesNotMatch(preview.blockers[0], /[A-Z]{3,}_[A-Z]{3,}/);
  const later = await runTool(state, 'record_tds_withheld', { ...args, date: '2026-10-05' });
  assert.equal(later.ok, true, JSON.stringify(later));
});

test('R1-1: a TDS entry dated in a different quarter of the same year than 26AS shows it still lines up, and the row says so', async () => {
  const early = books();
  const one = await sale(early, 'Acme Corp', 100000, '2026-08-01');
  await withheld(early, { invoiceId: one.id, amount: 1000, date: '2026-09-28', section: '194C', tan: 'ACME12345A' });
  await importLines(early, '194C,ACME CORPORATION,ACME12345A,100000,1000,2026-10-07');
  const a = checkOf(early);
  assert.equal(a.rows.length, 1, JSON.stringify(a.rows));
  assert.deepEqual(a.rows[0], { section: '194C', tan: 'ACME12345A', deductor: 'ACME CORPORATION', customer: 'Acme Corp', quarter: 'Q3 2026-27', in26as: 1000, inBooks: 1000, gap: 0, status: 'matched', note: 'Books date it 28 Sep 2026; Form 26AS dates it 7 Oct 2026.' });
  assert.deepEqual(a.totals, { in26as: 1000, inBooks: 1000, gap: 0, notInBooks: 0, notIn26as: 0 });
  assert.deepEqual(a.bySection, [{ section: '194C', rows: 1, in26as: 1000, inBooks: 1000 }]);

  const late = books();
  const two = await sale(late, 'Acme Corp', 100000, '2026-08-01');
  await withheld(late, { invoiceId: two.id, amount: 2000, date: '2026-11-06', section: '194C', tan: 'ACME12345A' });
  await importLines(late, '194C,ACME CORP,ACME12345A,100000,2000,2026-09-10');
  const b = checkOf(late);
  assert.deepEqual(brief(b), [['194C', 'ACME12345A', 'Q2 2026-27', 2000, 2000, 'matched']]);
  assert.equal(b.rows[0].note, 'Books date it 6 Nov 2026; Form 26AS dates it 10 Sep 2026.');
  assert.deepEqual(b.totals, { in26as: 2000, inBooks: 2000, gap: 0, notInBooks: 0, notIn26as: 0 });
});

test('R1-1: the date note spans the dates when a quarter holds several entries on either side', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  await withheld(state, { invoiceId: invoice.id, amount: 600, date: '2026-11-09', section: '194C', tan: 'ACME12345A' });
  await withheld(state, { invoiceId: invoice.id, amount: 400, date: '2026-11-02', section: '194C', tan: 'ACME12345A' });
  await importLines(state, '194C,ACME CORP,ACME12345A,50000,500,2026-09-20', '194C,ACME CORP,ACME12345A,50000,500,2026-09-10');
  const d = checkOf(state);
  assert.deepEqual(brief(d), [['194C', 'ACME12345A', 'Q2 2026-27', 1000, 1000, 'matched']]);
  assert.equal(d.rows[0].note, 'Books date it 2 Nov 2026 to 9 Nov 2026; Form 26AS dates it 10 Sep 2026 to 20 Sep 2026.');
});

test('R1-1: with no TAN in the books the names must agree, with the same four-letter floor as inside one quarter', async () => {
  const agree = books();
  const one = await sale(agree, 'Acme Corp', 100000, '2026-08-01');
  await withheld(agree, { invoiceId: one.id, amount: 1000, date: '2026-09-28', section: '194C' });
  await importLines(agree, '194C,ACME CORPORATION,ACME12345A,100000,1000,2026-10-07');
  const a = checkOf(agree);
  assert.deepEqual(brief(a), [['194C', 'ACME12345A', 'Q3 2026-27', 1000, 1000, 'matched']]);
  assert.equal(a.rows[0].customer, 'Acme Corp');

  const apart = books();
  const two = await sale(apart, 'Kiran Stores', 100000, '2026-08-01');
  await withheld(apart, { invoiceId: two.id, amount: 1000, date: '2026-09-28', section: '194C' });
  await importLines(apart, '194C,ACME CORPORATION,ACME12345A,100000,1000,2026-10-07');
  assert.deepEqual(brief(checkOf(apart)), [['194C', '', 'Q2 2026-27', 0, 1000, 'not in 26AS'], ['194C', 'ACME12345A', 'Q3 2026-27', 1000, 0, 'not in books']]);

  const short = books();
  const three = await sale(short, 'Zen', 100000, '2026-08-01');
  await withheld(short, { invoiceId: three.id, amount: 1000, date: '2026-09-28', section: '194C' });
  await importLines(short, '194C,ZEN INDUSTRIES,ZENI12345B,100000,1000,2026-10-07');
  assert.equal(checkOf(short).rows.length, 2);
});

test('R1-1: rows are lined up across quarters only when section, TAN and amount all agree', async () => {
  const cases = [
    ['a different section', { section: '194C', tan: 'ACME12345A', amount: 1000 }, '194J,ACME CORP,ACME12345A,100000,1000,2026-10-07'],
    ['a different TAN', { section: '194C', tan: 'ACME12345A', amount: 1000 }, '194C,ACME CORP,BLRA12345A,100000,1000,2026-10-07'],
    ['an amount more than a rupee apart', { section: '194C', tan: 'ACME12345A', amount: 1000 }, '194C,ACME CORP,ACME12345A,100000,998.99,2026-10-07'],
  ];
  for (const [label, entry, line] of cases) {
    const state = books();
    const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
    await withheld(state, { invoiceId: invoice.id, date: '2026-09-28', ...entry });
    await importLines(state, line);
    const d = checkOf(state);
    assert.deepEqual(d.rows.map((row) => row.status), ['not in 26AS', 'not in books'], label);
    assert.ok(d.rows.every((row) => row.note === undefined), label);
    assert.equal(d.totals.notInBooks + d.totals.notIn26as > 0, true, label);
  }
  for (const as26 of ['999', '1000.5', '1001']) {
    const state = books();
    const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
    await withheld(state, { invoiceId: invoice.id, amount: 1000, date: '2026-09-28', section: '194C', tan: 'ACME12345A' });
    await importLines(state, `194C,ACME CORP,ACME12345A,100000,${as26},2026-10-07`);
    const d = checkOf(state);
    assert.deepEqual(d.rows.map((row) => row.status), ['matched'], as26);
  }
});

test('R1-1: one 26AS row is lined up with one books group only, the earliest first', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-08-01');
  await withheld(state, { invoiceId: invoice.id, amount: 1000, date: '2026-11-02', section: '194C', tan: 'ACME12345A' });
  await withheld(state, { invoiceId: invoice.id, amount: 1000, date: '2027-01-15', section: '194C', tan: 'ACME12345A' });
  await importLines(state, '194C,ACME CORP,ACME12345A,100000,1000,2026-09-10');
  const d = checkOf(state);
  assert.deepEqual(brief(d), [['194C', 'ACME12345A', 'Q2 2026-27', 1000, 1000, 'matched'], ['194C', 'ACME12345A', 'Q4 2026-27', 0, 1000, 'not in 26AS']]);
  assert.equal(d.rows[0].note, 'Books date it 2 Nov 2026; Form 26AS dates it 10 Sep 2026.');
  assert.deepEqual(d.totals, { in26as: 1000, inBooks: 2000, gap: 1000, notInBooks: 0, notIn26as: 1000 });
});

test('R1-1: rows are never lined up across financial years', async () => {
  const state = books();
  const invoice = await sale(state, 'Acme Corp', 100000, '2026-02-01');
  await withheld(state, { invoiceId: invoice.id, amount: 2000, date: '2026-04-10', section: '194C', tan: 'ACME12345A' });
  await importLines(state, '194C,ACME CORP,ACME12345A,100000,2000,2026-03-20');
  assert.deepEqual(brief(checkOf(state, '2025-26')), [['194C', 'ACME12345A', 'Q4 2025-26', 2000, 0, 'not in books']]);
  assert.deepEqual(brief(checkOf(state, '2026-27')), [['194C', 'ACME12345A', 'Q1 2026-27', 0, 2000, 'not in 26AS']]);
});

test('R1-1: a 26AS row and a TDS entry of another quarter, section and amount stay two separate rows', async () => {
  const state = books();
  const invoice = await sale(state, 'Delta Projects', 100000, '2026-05-05');
  await importLines(state, '194J,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,50000,1000,2026-05-20');
  await withheld(state, { invoiceId: invoice.id, amount: 500, date: '2026-08-20', section: '194C', tan: 'DELD12345A' });
  const d = checkOf(state);
  assert.deepEqual(brief(d), [['194J', 'DELD12345A', 'Q1 2026-27', 1000, 0, 'not in books'], ['194C', 'DELD12345A', 'Q2 2026-27', 0, 500, 'not in 26AS']]);
  assert.deepEqual(d.totals, { in26as: 1000, inBooks: 500, gap: -500, notInBooks: 1000, notIn26as: 500 });
});

test('R1-1: the check note tells the user to use the date 26AS shows', async () => {
  const d = checkOf(books());
  assert.equal(d.note, TDS_CHECK_NOTE);
  assert.match(d.note, /using the date 26AS shows/);
  assert.match(d.note, /"TDS withheld" on that invoice/);
});

function pairedState(pairs) {
  const state = books();
  state.invoices = [];
  state.tdsCreditStatements = [];
  pairs.forEach(([inBooks, in26as], i) => {
    const tan = `TANA${String(i).padStart(5, '0')}Z`;
    state.invoices.push({ id: `INV-${i + 1}`, partyName: `Party${i}`, total: 1000000, status: 'partial', receipts: [{ amount: inBooks, date: '2026-09-10', mode: 'tds', section: '194C', tan }] });
    state.tdsCreditStatements.push({ section: '194C', tan, name: `PARTY${i} LTD`, date: '2026-09-10', quarter: 'Q2 2026-27', channel: '', amountPaid: null, taxDeducted: in26as, importedOn: '2026-11-01' });
  });
  return state;
}

test('R1-7: a gap of exactly one rupee is matched whichever paise the two amounts carry, in both directions', async () => {
  const round2 = (value) => Math.round(value * 100) / 100;
  const pairs = [];
  for (let cents = 1; cents <= 8000; cents += 1) {
    const low = round2(cents / 100);
    const high = round2(low + 1);
    pairs.push([high, low], [low, high]);
  }
  const d = checkOf(pairedState(pairs));
  assert.equal(d.rows.length, pairs.length);
  const wrong = d.rows.filter((row) => row.status !== 'matched').map((row) => `${row.inBooks} vs ${row.in26as}: gap ${row.gap} ${row.status}`);
  assert.deepEqual(wrong, []);
  assert.ok(d.rows.every((row) => Math.abs(row.gap) === 1));
});

test('R1-7: the examples from the review read matched, and a gap above a rupee is still a gap', async () => {
  for (const [booksAmount, as26] of [[2.14, 1.14], [2.5, 1.5], [3.14, 2.14], [4096.14, 4095.14], [1.14, 2.14], [4095.14, 4096.14]]) {
    const state = books();
    const invoice = await sale(state, 'Acme Corp', 10000, '2026-08-01');
    await withheld(state, { invoiceId: invoice.id, amount: booksAmount, date: '2026-09-10', section: '194C', tan: 'ACME12345A' });
    await importLines(state, `194C,ACME,ACME12345A,100,${as26},2026-09-10`);
    const d = checkOf(state);
    assert.deepEqual(d.rows.map((row) => [Math.abs(row.gap), row.status]), [[1, 'matched']], `${booksAmount} vs ${as26}`);
  }
  const over = pairedState([[2.15, 1.14], [1.14, 2.15]]);
  assert.deepEqual(checkOf(over).rows.map((row) => [row.inBooks, row.in26as, row.status]), [[2.15, 1.14, 'short in 26AS'], [1.14, 2.15, 'more in 26AS']]);
});
