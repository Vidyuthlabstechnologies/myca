import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { saidPeriod } from '../src/filing-intent.mjs';
import { supplierDues } from '../src/supplier-dues.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { localToday } from '../src/dates.mjs';
import { inWords } from '../src/words.mjs';

const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const TWO_B_SEP = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
  'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y',
  'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,15-09-2026,2000,180,180,0,0,2360,Y',
  'CDNR,27AABCT1332L1ZE,FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y',
].join('\n');
const TWO_B_OCT = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-201,05-10-2026,10000,250,250,0,0,10500,Y',
  'B2B,27AAACD1111A1Z5,DYE WORKS,DW-9,15-10-2026,2000,180,180,0,0,2360,Y',
  'B2B,27AAAAI1234B1Z5,IMS TRADERS,IT-1,16-10-2026,3000,270,270,0,0,3540,Y',
].join('\n');
const RAW_CODE = /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/;
const TODAY = localToday();
const [THIS_YEAR, THIS_MONTH] = TODAY.split('-').map(Number);
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (number) => String(number).padStart(2, '0');
const keyOf = (year, month) => `${year}-${pad(month)}`;
const NOW_KEY = keyOf(THIS_YEAR, THIS_MONTH);
const bareMonth = (month) => keyOf(month <= THIS_MONTH ? THIS_YEAR : THIS_YEAR - 1, month);
const lastMonthOf = (iso) => {
  const [year, month] = iso.split('-').map(Number);
  return month === 1 ? keyOf(year - 1, 12) : keyOf(year, month - 1);
};
const LAST_KEY = lastMonthOf(TODAY);

function shiftDay(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function sale(state, partyName, rate, date, gstRate = 0) {
  const out = createInvoice(state, { date, partyName, lines: [{ description: 'Services', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

function bill(state, partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate) {
  const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

async function addTwob(state, period, csv = TWO_B_SEP) {
  const added = await runTool(state, 'import_gstr2b', { period, csv, fileName: `GSTR2B_${period}.csv` });
  assert.equal(added.ok, true, JSON.stringify(added));
}

async function books({ with2b = true } = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  sale(state, 'Kiran Stores', 100000, '2026-10-01');
  sale(state, 'Audit Associates', 5000, '2026-10-02', 18);
  sale(state, 'IMS Traders', 7000, '2026-10-03', 18);
  sale(state, 'Retail Mart', 20000, '2026-10-04', 18);
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  bill(state, 'Pack House', '29AABCL1234J1ZL', 'PH-9', '2026-09-10', 6000, 12);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-14', 2000, 18);
  bill(state, 'Acme Steel', '27AAACA1234C1Z5', 'AS-1', '2026-10-05', 40000, 18);
  if (with2b) {
    await addTwob(state, '2026-09', TWO_B_SEP);
    await addTwob(state, '2026-10', TWO_B_OCT);
  }
  return state;
}

const plan = (state, sentence) => planLocalToolCall(state, sentence);

function toolArgs(state, sentence, name) {
  const out = plan(state, sentence);
  assert.equal(out.kind, 'tool', `${sentence} -> ${JSON.stringify(out)}`);
  assert.equal(out.name, name, `${sentence} -> ${JSON.stringify(out)}`);
  return out.args;
}

function words(out) {
  if (!out) return 'null';
  return out.kind === 'reply' ? `REPLY ${out.reply}` : `TOOL ${out.name} ${JSON.stringify(out.args)}${out.fallback ? ' (fallback)' : ''}`;
}

const nameNow = MONTH_LONG[THIS_MONTH - 1];
const nameEarlier = THIS_MONTH > 1 ? MONTH_LONG[THIS_MONTH - 2] : '';
const nameLater = THIS_MONTH < 12 ? MONTH_LONG[THIS_MONTH] : '';

test('R3: a bare month name that is the current month means this month of this year in the audit trail, the audit Excel and IMS, and a later month still means last year', async () => {
  const state = await books();
  const audit = (sentence) => toolArgs(state, sentence, 'audit_trail');
  const excel = (sentence) => toolArgs(state, sentence, 'export_xlsx');
  for (const spelling of [nameNow, nameNow.toLowerCase(), nameNow.toUpperCase(), MONTH_SHORT[THIS_MONTH - 1]]) {
    assert.deepEqual(audit(`audit trail for ${spelling}`), { period: NOW_KEY }, spelling);
    assert.deepEqual(audit(`who changed what in ${spelling}`), { period: NOW_KEY }, spelling);
    assert.deepEqual(excel(`export audit trail for ${spelling} to excel`), { report: 'audit_trail', period: NOW_KEY }, spelling);
    assert.deepEqual(toolArgs(state, `ims for ${spelling}`, 'ims_review'), { period: NOW_KEY }, spelling);
    assert.deepEqual(toolArgs(state, `accept all matched invoices in IMS for ${spelling}`, 'ims_decide'), { period: NOW_KEY, select: 'matched', decision: 'accept' }, spelling);
  }
  assert.deepEqual(audit(`audit trail for ${nameNow} ${THIS_YEAR - 1}`), { period: keyOf(THIS_YEAR - 1, THIS_MONTH) }, 'a year that is said is the year');
  assert.deepEqual(audit(`audit trail for ${nameNow} ${THIS_YEAR}`), { period: NOW_KEY });
  assert.deepEqual(audit('audit trail for this month'), { period: 'this-month' });
  if (nameEarlier) {
    assert.deepEqual(audit(`audit trail for ${nameEarlier}`), { period: keyOf(THIS_YEAR, THIS_MONTH - 1) }, 'an earlier month is this year, as before');
    assert.deepEqual(toolArgs(state, `ims for ${nameEarlier}`, 'ims_review'), { period: keyOf(THIS_YEAR, THIS_MONTH - 1) });
  }
  if (nameLater) {
    assert.deepEqual(audit(`audit trail for ${nameLater}`), { period: keyOf(THIS_YEAR - 1, THIS_MONTH + 1) }, 'a later month is last year, as before');
    assert.deepEqual(excel(`export audit trail for ${nameLater} to excel`), { report: 'audit_trail', period: keyOf(THIS_YEAR - 1, THIS_MONTH + 1) });
    assert.deepEqual(toolArgs(state, `ims for ${nameLater}`, 'ims_review'), { period: keyOf(THIS_YEAR - 1, THIS_MONTH + 1) });
    assert.deepEqual(toolArgs(state, `accept all matched invoices in IMS for ${nameLater}`, 'ims_decide').period, keyOf(THIS_YEAR - 1, THIS_MONTH + 1));
  }

  delete state.gstr2b[NOW_KEY];
  const missing = plan(state, `ims review in excel for ${nameNow}`);
  assert.equal(missing.kind, 'reply', words(missing));
  assert.equal(missing.reply, `Add the GSTR-2B for ${inWords(NOW_KEY)} first.`);
  await addTwob(state, NOW_KEY);
  assert.deepEqual(excel(`ims review in excel for ${nameNow}`), { report: 'ims_review', period: NOW_KEY });
  const review = await chat(state, `ims for ${nameNow}`);
  assert.match(review.reply, new RegExp(`^IMS for ${inWords(NOW_KEY)}:`), review.reply);
});

test('R3: the audit trail for the current month name lists the change made today, and the returns planners keep reading the month as they did', async () => {
  const session = openSession(createMemoryStores(), { seed: false });
  await session.signIn('USR-ADMIN', '1234');
  session.state.company = { ...session.state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  sale(session.state, 'Kiran Stores', 100000, '2026-10-01');
  await session.chat('received 5000 against INV-0001');
  const posted = await session.chat('yes');
  assert.equal(posted.posted, true, posted.reply);

  const named = await session.chat(`audit trail for ${nameNow}`);
  const thisMonth = await session.chat('audit trail for this month');
  assert.equal(named.tools[0].name, 'audit_trail', named.reply);
  assert.equal(named.tools[0].result.data.from, `${NOW_KEY}-01`);
  assert.equal(named.tools[0].result.data.count, thisMonth.tools[0].result.data.count);
  assert.ok(named.tools[0].result.data.count >= 1, named.reply);
  assert.match(named.reply, /Chat message/, named.reply);
  const saved = await session.chat(`export audit trail for ${nameNow} to excel`);
  assert.match(saved.reply, new RegExp(`^Saved myca-audit-trail-${NOW_KEY}\\.xlsx`), saved.reply);

  const state = await books();
  const filed = plan(state, `filed GSTR-1 for ${nameNow}, ARN AA2909261234567`);
  assert.equal(filed.name, 'record_filing', words(filed));
  assert.equal(filed.args.period, saidPeriod(nameNow), 'the returns planners read the month as they always did');
});

const UNREAD_PERIODS = [
  'FY 2025-26',
  'FY 2026-27',
  'FY 25-26',
  'financial year 2025-26',
  'last quarter',
  'this quarter',
  'the last two months',
  'two months ago',
  'the month before last',
  'the first half',
  'the whole year',
  'this year',
  'last year',
  'all months',
  'every month',
  'each month',
  'july to september',
  'the july-sept quarter',
  'september and october',
  '2026-09 and 2026-10',
  'this month and last month',
  '2026-13',
  '2026',
  'q2',
  'next month',
];
const EXCEL_ASKS_ITS_OWN_REFUSAL = new Set(['this quarter', 'this year', 'last year']);
const SAY_IT = {
  decide: { start: 'accept all matched invoices in IMS for', tool: 'ims_decide' },
  read: { start: 'show IMS for', tool: 'ims_review' },
  excel: { start: 'ims review in excel for', tool: 'export_xlsx' },
};

function sayItExample(state, out, kind, sentence) {
  const found = new RegExp(`Say the month, for example "(${SAY_IT[kind].start} [A-Z][a-z]+ \\d{4})"`).exec(out.reply);
  assert.ok(found, `${sentence}: ${out.reply}`);
  const again = plan(state, found[1]);
  assert.equal(again.kind, 'tool', `${sentence}: the example must be a sentence the planner runs: ${words(again)}`);
  assert.equal(again.name, SAY_IT[kind].tool, `${sentence}: ${words(again)}`);
  assert.equal(again.args.period, '2026-10', `${sentence}: ${words(again)}`);
}

test('R5: an IMS sentence whose period is not exactly one month changes nothing and asks for the month, and never becomes the latest 2B month', async () => {
  const state = await books();
  for (const period of UNREAD_PERIODS) {
    const sentences = [
      [`reject all undecided invoices in IMS for ${period}`, 'decide'],
      [`accept all matched invoices in IMS for ${period}`, 'decide'],
      [`ims for ${period}`, 'read'],
      [`what is pending in IMS for ${period}?`, 'read'],
    ];
    if (!EXCEL_ASKS_ITS_OWN_REFUSAL.has(period)) sentences.push([`ims review in excel for ${period}`, 'excel']);
    for (const [sentence, kind] of sentences) {
      const out = plan(state, sentence);
      assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
      assert.deepEqual(out.tools, [], sentence);
      assert.match(out.reply, /changed nothing in IMS/, sentence);
      sayItExample(state, out, kind, sentence);
      assert.doesNotMatch(out.reply, RAW_CODE, sentence);
      assert.doesNotMatch(out.reply, /\d{4}-\d{2}/, `${sentence}: the example month is in words`);
    }
  }
  for (const sentence of ['reject all undecided invoices in IMS for the first half', 'ims for FY 2025-26', 'ims review in excel for sept 2026 to oct 2026']) {
    const held = await chat(state, sentence);
    assert.equal(held.awaitingConfirmation, undefined, `${sentence}: ${held.reply}`);
    assert.match(held.reply, /changed nothing in IMS/, sentence);
    assert.deepEqual(held.tools, [], sentence);
  }
  assert.equal(state.pendingChatAction ?? null, null, 'nothing is waiting for a yes');
  assert.deepEqual(state.imsDecisions ?? {}, {}, 'nothing was decided');
});

test('R5: the example month in the reply is the latest 2B month, or last month when there is no 2B', async () => {
  const state = await books();
  assert.match(plan(state, 'ims for the first half').reply, /show IMS for October 2026"/);
  assert.match(plan(state, 'reject all undecided invoices in IMS for the first half').reply, /accept all matched invoices in IMS for October 2026"/);
  assert.match(plan(state, 'ims review in excel for the first half').reply, /ims review in excel for October 2026"/);
  const bare = await books({ with2b: false });
  assert.match(plan(bare, 'ims for the first half').reply, new RegExp(`show IMS for ${inWords(LAST_KEY)}"`));
  assert.match(plan(bare, 'accept all matched invoices in IMS for the first half').reply, new RegExp(`accept all matched invoices in IMS for ${inWords(LAST_KEY)}"`));
});

test('R5: sept is September in the audit trail and IMS, and a month, a previous month and a plain sentence are read as before', async () => {
  const state = await books();
  const sept = bareMonth(9);
  const septBooks = await books();
  if (!septBooks.gstr2b[sept]) await addTwob(septBooks, sept);
  assert.deepEqual(toolArgs(state, 'ims for sept', 'ims_review'), { period: sept });
  assert.deepEqual(toolArgs(state, 'ims for Sept.', 'ims_review'), { period: sept });
  assert.deepEqual(toolArgs(state, 'reject all undecided invoices in IMS for sept', 'ims_decide'), { period: sept, select: 'undecided', decision: 'reject' });
  assert.deepEqual(toolArgs(state, 'reject all undecided invoices in IMS for sept 2026', 'ims_decide'), { period: '2026-09', select: 'undecided', decision: 'reject' });
  assert.deepEqual(toolArgs(septBooks, 'ims review in excel for sept', 'export_xlsx'), { report: 'ims_review', period: sept });
  assert.deepEqual(toolArgs(state, 'audit trail for sept', 'audit_trail'), { period: sept });
  assert.deepEqual(toolArgs(state, 'who changed what in sept 2026', 'audit_trail'), { period: '2026-09' });
  assert.deepEqual(toolArgs(state, 'export audit trail for sept to excel', 'export_xlsx'), { report: 'audit_trail', period: sept });

  const unchanged = {
    ims: { period: '2026-10' },
    'ims for 2026-09': { period: '2026-09' },
    'ims for september': { period: bareMonth(9) },
    'ims for september 2026': { period: '2026-09' },
    'ims for September (2026)': { period: '2026-09' },
    'ims for the month of september': { period: bareMonth(9) },
    'ims for this month': { period: NOW_KEY },
    'ims for last month': { period: LAST_KEY },
    'ims for the previous month': { period: LAST_KEY },
    'ims for prior month': { period: LAST_KEY },
    'ims for the current month': { period: NOW_KEY },
    'what is pending in ims?': { period: '2026-10' },
  };
  for (const [sentence, args] of Object.entries(unchanged)) assert.deepEqual(toolArgs(state, sentence, 'ims_review'), args, sentence);
  const decided = { period: '2026-10', select: 'matched', decision: 'accept' };
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims', 'ims_decide'), decided);
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for 2026-09', 'ims_decide'), { ...decided, period: '2026-09' });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for the previous month', 'ims_decide'), { ...decided, period: LAST_KEY });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices from ims for the month of september', 'ims_decide'), { ...decided, period: bareMonth(9) });
  assert.deepEqual(toolArgs(state, 'ims in excel', 'export_xlsx'), { report: 'ims_review', period: '2026-10' });
  if (!state.gstr2b[LAST_KEY]) await addTwob(state, LAST_KEY);
  assert.deepEqual(toolArgs(state, 'ims review in excel last month', 'export_xlsx'), { report: 'ims_review', period: LAST_KEY });
  assert.deepEqual(toolArgs(state, 'ims review in excel this year', 'export_xlsx'), { report: 'ims_review', period: 'this-year' }, 'the report itself says it covers one month at a time');
  assert.deepEqual(toolArgs(state, 'audit trail from 2026-10-01 to 2026-10-31', 'audit_trail'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(toolArgs(state, 'audit trail for last month', 'audit_trail'), { period: 'last-month' });
  assert.equal(plan(state, 'audit trail for the first half').kind, 'reply', 'the audit trail still asks for a range it cannot read');
  assert.match(plan(state, 'audit trail for the first half').reply, /could not read that date range/);
});

const LEAD_INS = ['note', 'please note', 'now', 'today', 'hey', 'btw', 'fyi', 'actually', 'remember', 'confirm', 'once', 'after', 'maybe', 'Note:', 'FYI,', 'btw -', 'please note that', 'hey, note', 'NOTE'];
const CONDITIONALS = ['if', 'when', 'suppose', 'whenever', 'unless', 'assuming', 'in case', 'If', 'ok so if'];

test('R8: lead-in words are never part of the supplier name, and a conditional sentence writes nothing', async () => {
  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  for (const lead of LEAD_INS) {
    assert.deepEqual(terms(`${lead} Acme Steel is MSME, 30 days`), { partyName: 'Acme Steel', msme: true, days: 30 }, lead);
  }
  for (const lead of ['since', 'because', 'also', 'update', 'as', 'so']) assert.deepEqual(terms(`${lead} Acme Steel is MSME, 30 days`), { partyName: 'Acme Steel', msme: true, days: 30 }, lead);
  assert.deepEqual(terms('note: Zenith Dyes is MSME, 30 days'), { partyName: 'Zenith Dyes', msme: true, days: 30 }, 'a supplier not in the books yet loses the lead-in word too');
  assert.deepEqual(terms('btw Zenith Dyes is MSME'), { partyName: 'Zenith Dyes', msme: true });
  assert.deepEqual(terms('Acme Steel is MSME, 30 days'), { partyName: 'Acme Steel', msme: true, days: 30 });
  assert.deepEqual(terms('mark Acme Steel as MSME'), { partyName: 'Acme Steel', msme: true });

  for (const lead of CONDITIONALS) {
    for (const sentence of [`${lead} Acme Steel is MSME, 30 days`, `${lead} Zenith Dyes is MSME, 30 days`, `${lead} Acme Steel is an MSME supplier`]) {
      const out = plan(state, sentence);
      assert.equal(out.name === 'set_supplier_terms', false, `${sentence} -> ${words(out)}`);
      assert.equal(out.kind, 'tool', sentence);
      assert.equal(out.fallback, true, `${sentence} falls back`);
    }
  }
  const held = await chat(state, 'if Acme Steel is MSME, 30 days');
  assert.equal(held.awaitingConfirmation, undefined, held.reply);
  assert.match(held.reply, /did not match that to anything I can do, so nothing was recorded/);
  assert.ok(!state.pendingChatAction, 'nothing is waiting for a yes');
  assert.deepEqual(state.supplierTerms || {}, {}, 'no terms were written');
});

test('R8: a note in front of a known supplier marks that supplier, so its bills carry the MSME date', async () => {
  const state = await books();
  const held = await chat(state, 'note Acme Steel is MSME, 30 days');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^Mark Acme Steel as an MSME supplier/, held.reply);
  assert.doesNotMatch(held.reply, /note/i);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /^Acme Steel is recorded as an MSME; agreed terms 30 days\./, done.reply);
  assert.equal(Object.keys(state.supplierTerms || {}).some((key) => /note/.test(key)), false, JSON.stringify(Object.keys(state.supplierTerms || {})));
  const row = supplierDues(state, {}).data.bills.find((item) => item.supplier === 'Acme Steel');
  assert.ok(row, 'the Acme Steel bill is listed');
  assert.equal(row.msme, true, 'the real Acme Steel is marked');
  assert.ok(row.payBy, 'its bill carries a pay-by date');
});

test('R8: a supplier whose real name starts with such a word is still matched by its own name, and a name that holds a pronoun is still not guessed', async () => {
  const state = await books();
  bill(state, 'Today Traders', '27AAACT1234C1Z5', 'TT-1', '2026-10-09', 3000, 18);
  bill(state, 'Note Books Co', '27AAACN1234C1Z5', 'NB-1', '2026-10-10', 3000, 18);
  assert.deepEqual(toolArgs(state, 'Today Traders is MSME, 30 days', 'set_supplier_terms'), { partyName: 'Today Traders', msme: true, days: 30 });
  assert.deepEqual(toolArgs(state, 'Note Books Co is MSME, 30 days', 'set_supplier_terms'), { partyName: 'Note Books Co', msme: true, days: 30 });
  assert.deepEqual(toolArgs(state, 'note Today Traders is MSME, 30 days', 'set_supplier_terms'), { partyName: 'Today Traders', msme: true, days: 30 });
  assert.notEqual(plan(state, 'I think Fabric Co is MSME').name, 'set_supplier_terms');
  assert.notEqual(plan(state, 'note I think Fabric Co is MSME').name, 'set_supplier_terms');
  assert.notEqual(plan(state, 'note Fabric Co and Acme Steel is MSME').name, 'set_supplier_terms');
  assert.notEqual(plan(state, 'note he is MSME').name, 'set_supplier_terms');
});

test('R10: an audit trail lookup that names an invoice, a bill, a credit note or a known party says the list is not narrowed to it', async () => {
  const session = openSession(createMemoryStores(), { seed: false });
  await session.signIn('USR-ADMIN', '1234');
  session.state.company = { ...session.state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  sale(session.state, 'Kiran Stores', 100000, '2026-10-01');
  sale(session.state, 'Retail Mart', 20000, '2026-10-04', 18);
  bill(session.state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  await session.chat('received 5000 against INV-0002');
  await session.chat('yes');
  const state = session.state;

  const noted = (sentence) => {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'tool', `${sentence} -> ${words(out)}`);
    assert.equal(out.name, 'audit_trail', sentence);
    assert.equal(typeof out.note, 'string', `${sentence} has a note`);
    assert.equal(out.note.includes('\n'), false, `${sentence}: the note is one line`);
    assert.match(out.note, /every change in the period/, sentence);
    assert.match(out.note, /not narrowed to/, sentence);
    assert.doesNotMatch(out.note, RAW_CODE, sentence);
    return out;
  };
  assert.match(noted('who changed INV-0001').note, /not narrowed to INV-0001[,.]/);
  assert.match(noted('INV-0002 audit trail').note, /not narrowed to INV-0002[,.]/);
  assert.match(noted('audit trail for BILL-0001').note, /not narrowed to BILL-0001[,.]/);
  assert.match(noted('audit trail for credit note CN-0001').note, /not narrowed to CN-0001[,.]/);
  assert.match(noted('audit trail for Kiran Stores').note, /not narrowed to Kiran Stores[,.]/);
  assert.match(noted('audit trail for payments to Fabric Co').note, /not narrowed to Fabric Co[,.]/);
  assert.match(noted('show who changed inv-0001 last month').note, /not narrowed to INV-0001[,.]/);
  assert.match(noted('audit trail for INV-0001 and Kiran Stores').note, /not narrowed to INV-0001 and Kiran Stores[,.]/);
  assert.match(noted('audit trail for INV-0001 and INV-0002').note, /not narrowed to INV-0001 and INV-0002[,.]/);
  assert.deepEqual(noted('who changed INV-0001').args, {}, 'the list itself is as before');
  assert.deepEqual(noted('audit trail for Kiran Stores last month').args, { period: 'last-month' });

  const personOrCountApplied = 'It is not narrowed to INV-0001, because I cannot narrow the audit trail to one document or party yet.';
  for (const sentence of ['audit trail by Priya for INV-0001', 'audit trail for INV-0001 limit 5', 'audit trail for INV-0001 limit 5 by Priya']) {
    assert.equal(plan(state, sentence).note, personOrCountApplied, `${sentence}: the list is narrowed by the person or the count, so the note only says what is not applied`);
  }
  assert.deepEqual(plan(state, 'audit trail by Priya for INV-0001').args, { actor: 'Priya' });
  const crowded = plan(state, 'audit trail for INV-0001, INV-0002, INV-0003, INV-0004, INV-0005, INV-0006');
  assert.match(crowded.note, /not narrowed to INV-0001, INV-0002, INV-0003, INV-0004 and 2 more, because/, crowded.note);

  for (const sentence of ['audit trail', 'audit trail for this month', 'who changed what last month', 'audit trail by Priya', 'audit trail for the last 7 days', 'what changed in the books today', 'audit trail everything', 'audit trail for sept', 'edit log limit 5']) {
    const out = plan(state, sentence);
    assert.equal(out.name, 'audit_trail', `${sentence} -> ${words(out)}`);
    assert.equal('note' in out, false, `${sentence} names no document or party, so there is no note`);
  }

  const asked = await chat(state, 'who changed INV-0001');
  assert.equal(asked.tools[0].name, 'audit_trail', asked.reply);
  const lines = asked.reply.split('\n');
  assert.match(lines[0], /^\d+ changes? between /, asked.reply);
  assert.match(lines[lines.length - 1], /^This lists every change in the period\. It is not narrowed to INV-0001, because I cannot narrow the audit trail to one document or party yet\.$/, asked.reply);
  const party = await chat(state, 'audit trail for Kiran Stores');
  assert.match(party.reply.split('\n').pop(), /not narrowed to Kiran Stores/, party.reply);
  const plain = await chat(state, 'audit trail for this month');
  assert.doesNotMatch(plain.reply, /not narrowed/, plain.reply);
});

test('R10: a party called like a word in the sentence, a person asked for by name and a posting are not taken for a narrowing', async () => {
  const state = await books();
  sale(state, 'Audit', 1000, '2026-10-12');
  sale(state, 'Month', 1000, '2026-10-13');
  sale(state, 'Priya Textiles', 1000, '2026-10-14');
  for (const sentence of ['audit trail', 'audit trail for this month', 'who changed what last month', 'audit trail by Priya', 'audit log for last month']) {
    const out = plan(state, sentence);
    assert.equal(out.name, 'audit_trail', `${sentence} -> ${words(out)}`);
    assert.equal('note' in out, false, `${sentence}: ${out.note}`);
  }
  assert.equal(plan(state, 'invoice Kiran Stores 5000 audit trail GST 18%').name, 'create_invoice');
});

test('R11: "what changed in my books" is an audit trail request, like "what changed in the books", with or without a day or a week', async () => {
  const state = await books();
  const audit = (sentence) => toolArgs(state, sentence, 'audit_trail');
  for (const owner of ['the', 'my', 'our', 'your', 'My', '']) {
    const prefix = `what changed in ${owner ? `${owner} ` : ''}books`;
    assert.deepEqual(audit(`${prefix} today`), { from: TODAY, to: TODAY }, prefix);
    assert.deepEqual(audit(prefix), {}, prefix);
    assert.deepEqual(audit(`${prefix} this month`), { period: 'this-month' }, prefix);
    assert.deepEqual(audit(`${prefix} last month`), { period: 'last-month' }, prefix);
    assert.deepEqual(audit(`${prefix} yesterday`), { from: shiftDay(TODAY, -1), to: shiftDay(TODAY, -1) }, prefix);
  }
  const monday = (() => {
    const [year, month, day] = TODAY.split('-').map(Number);
    return shiftDay(TODAY, -((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7));
  })();
  assert.deepEqual(audit('what changed in my books last week'), { from: shiftDay(monday, -7), to: shiftDay(monday, -1) });
  assert.deepEqual(audit('what changed in our books this week'), { from: monday, to: TODAY });
  assert.deepEqual(audit('What changed in my books?'), {});
  assert.deepEqual(audit('what changed in my books by Priya'), { actor: 'Priya' });
  assert.deepEqual(toolArgs(state, 'what changed in my books in excel', 'export_xlsx'), { report: 'audit_trail' });
  assert.deepEqual(toolArgs(state, 'what changed in my books last month in excel', 'export_xlsx'), { report: 'audit_trail', period: 'last-month' });
  assert.notEqual(plan(state, 'what changed in my bookshelf today').name, 'audit_trail');
  assert.notEqual(plan(state, 'what changed in my sales today').name, 'audit_trail');
  const answered = await chat(state, 'what changed in my books today');
  assert.equal(answered.tools[0].name, 'audit_trail', answered.reply);
  assert.doesNotMatch(answered.reply, /did not match/);
});

test('R12: every IMS decision sentence the planner will not run gets the one reply that says nothing was changed and how to say it', async () => {
  const state = await books();
  const bulk = plan(state, 'accept all matched invoices from Fabric Co in ims');
  assert.equal(bulk.kind, 'reply', words(bulk));
  assert.match(bulk.reply, /^I have changed nothing in IMS\./);
  assert.match(bulk.reply, /"accept all matched invoices in IMS"/);
  const notRun = [
    'accept all matched invoices above 5000 in ims',
    'accept all matched invoices in ims of 5000',
    'accept F-101 in ims',
    'accept invoice F-101 in ims',
    'reject the invoice DW-3 in ims for 2026-09',
    'accept all invoices in IMS',
    'accept everything in IMS',
    'reject everything in ims',
    'accept all in ims',
    'reject all in ims',
    'accept the rest in ims',
    'reject all unmatched invoices in ims',
    'reject all not-matched invoices in ims for 2026-10',
    'reject all invoices that are not matched in ims',
    'accept all matched invoices over 1 lakh in ims',
    'accept all matched invoices worth 5000 in ims',
    'accept 18% gst invoices in ims',
    'accept all matched invoices in ims dated 5th',
    'mark everything pending in ims',
    'mark all invoices as pending in ims',
    'please reject all invoices in IMS',
  ];
  for (const sentence of notRun) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.equal(out.reply, bulk.reply, sentence);
    assert.deepEqual(out.tools, [], sentence);
    const said = await chat(state, sentence);
    assert.equal(said.reply, bulk.reply, sentence);
    assert.equal(said.awaitingConfirmation, undefined, sentence);
    assert.equal(state.pendingChatAction ?? null, null, sentence);
    assert.deepEqual(state.imsDecisions ?? {}, {}, `${sentence} decided nothing`);
  }
});

test('R12: the IMS sentences the planner runs, answers or hands on are unchanged', async () => {
  const state = await books();
  const decide = (decision, select, period = '2026-10') => ({ period, select, decision });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims', 'ims_decide'), decide('accept', 'matched'));
  assert.deepEqual(toolArgs(state, 'reject all undecided invoices in ims for 2026-09', 'ims_decide'), decide('reject', 'undecided', '2026-09'));
  assert.deepEqual(toolArgs(state, 'accept all suggested invoices in ims', 'ims_decide'), decide('accept', 'suggested'));
  assert.deepEqual(toolArgs(state, 'accept every not decided invoice in ims', 'ims_decide'), decide('accept', 'undecided'));
  assert.deepEqual(toolArgs(state, 'mark all undecided as pending in ims', 'ims_decide'), decide('pending', 'undecided'));
  assert.deepEqual(toolArgs(state, 'accepted all matched invoices in ims', 'ims_decide'), decide('accept', 'matched'));
  for (const sentence of ['ims', 'show ims', 'what is pending in ims?', 'show pending invoices in ims', 'pending invoices in ims', 'accepted invoices in ims', 'which invoices did I accept in ims', 'can you accept everything in IMS?', 'should I reject all unmatched invoices in ims?', 'is everything accepted in ims']) {
    assert.deepEqual(toolArgs(state, sentence, 'ims_review'), { period: '2026-10' }, sentence);
  }
  assert.match(plan(state, 'accept all matched invoices in ims and reject all undecided invoices in ims').reply, /one decision at a time/);
  assert.match(plan(state, 'accept all matched invoices from Fabric Co in ims').reply, /^I have changed nothing in IMS\./);
  assert.match(plan(state, 'accept the first two matched invoices in ims').reply, /^I have changed nothing in IMS\./);
  for (const sentence of ['what is the IMS credit above 5000?', 'accept 3 and reject 2 in ims', 'remind me to accept all matched invoices in ims on the 5th', "don't accept all matched invoices in ims 5000"]) {
    assert.notEqual(plan(state, sentence).name, 'ims_decide', sentence);
    assert.notEqual(plan(state, sentence).name, 'ims_review', sentence);
  }
  assert.equal(plan(state, 'invoice IMS Traders 5000 GST 18%').name, 'create_invoice', 'an amount with a party called IMS is still a posting');
  assert.notEqual(plan(state, 'paid 3000 to IMS Traders').name, 'ims_review');
  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', pan: '', fy: '', address: '12 Maple St, Austin, TX 78701' };
  assert.doesNotMatch(plan(us, 'accept all unmatched invoices in ims').reply ?? '', /IMS/, 'US books are not an IMS user');
});

test('R13: agreed days above 365, however many digits, are refused with the days rule and nothing is changed', async () => {
  const state = await books();
  const rule = 'Agreed days must be a whole number from 0 to 365.';
  for (const days of ['366', '400', '999', '1000', '4000', '9999', '12345', '100000', '123456789012', '99999999999999999999', '0400']) {
    for (const sentence of [`Acme Steel is MSME, ${days} days`, `we pay Acme Steel in ${days} days`, `supplier terms for Acme Steel ${days} days`, `mark Acme Steel as MSME, net ${days}`, `payment terms for Acme Steel net ${days}`, `Acme Steel is MSME, ${days}-days`, `please pay Acme Steel within ${days} days`]) {
      const out = plan(state, sentence);
      assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
      assert.equal(out.reply, rule, sentence);
      assert.equal(out.blocked, true, sentence);
      assert.deepEqual(out.tools, [], sentence);
    }
  }
  const refused = await chat(state, 'Acme Steel is MSME, 400 days');
  assert.equal(refused.reply, rule);
  assert.equal(refused.blocked, true);
  assert.equal(refused.awaitingConfirmation, undefined);
  assert.ok(!state.pendingChatAction, 'nothing is waiting for a yes');
  assert.deepEqual(state.supplierTerms || {}, {}, 'no terms were written');
  for (const [sentence, args] of [
    ['Acme Steel is MSME, 365 days', { partyName: 'Acme Steel', msme: true, days: 365 }],
    ['Acme Steel is MSME, 45 days', { partyName: 'Acme Steel', msme: true, days: 45 }],
    ['Acme Steel is MSME, 0 days', { partyName: 'Acme Steel', msme: true, days: 0 }],
    ['we pay Acme Steel in 365 days', { partyName: 'Acme Steel', days: 365 }],
    ['we pay Acme Steel net 30', { partyName: 'Acme Steel', days: 30 }],
    ['supplier terms for Acme Steel 90 days', { partyName: 'Acme Steel', days: 90 }],
  ]) {
    assert.deepEqual(toolArgs(state, sentence, 'set_supplier_terms'), args, sentence);
  }
});

test('R-regexp: no pattern is built from a stored party, vendor or payee name, and names that look like patterns are matched by their words', async () => {
  const source = readFileSync(new URL('../src/assistant-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /new RegExp\(`\(\?<!\[a-z0-9\]\)/, 'the lookbehind pattern built from a name is gone');
  assert.doesNotMatch(source, /known\.reduce\(\(rest, name\) => rest\.replace\(new RegExp/, 'the names are removed by string search');

  const state = await books();
  const hostile = ['Audit Log (Pune) Associates', 'Audit Trail [Pvt.] Ltd', 'Edit Log+ Studio', 'Who Changed $$ Traders', '(a+)+$ Audit Log', 'Audit.Trail Co', 'Change Log \\ Works'];
  for (const name of hostile) sale(state, name, 1000, '2026-10-12');
  for (const name of hostile) {
    const paid = plan(state, `paid 1000 to ${name}`);
    assert.notEqual(paid.name, 'audit_trail', `${name} -> ${words(paid)}`);
    assert.equal(paid.kind, 'reply', `${name} is a name, so the payment is not guessed: ${words(paid)}`);
    assert.match(paid.reply, /is a customer/, name);
    const asked = plan(state, `audit trail for ${name}`);
    assert.equal(asked.name, 'audit_trail', `${name} -> ${words(asked)}`);
  }
  assert.equal(plan(state, 'audit trail for this month').name, 'audit_trail');
  assert.equal(plan(state, 'audit trail').name, 'audit_trail');
  assert.equal(plan(state, `audit trail ${'x'.repeat(1900)}`).name, 'audit_trail');

  bill(state, 'Audit Trail Associates', '27AAACA9999A1Z1', 'ATA-1', '2026-10-04', 2000, 18);
  sale(state, 'Audit Trail Associates', 2000, '2026-10-13');
  assert.equal(plan(state, 'paid 1000 to Audit-Trail   Associates').name, 'record_payment', 'a name spelt with a hyphen and spaces is still the name');
  assert.equal(plan(state, 'invoice Audit Trail Associates 5000 GST 18%').name, 'create_invoice');
  assert.equal(plan(state, 'invoice  AUDIT-TRAIL   associates 5000 GST 18%').name, 'create_invoice');
  assert.equal(plan(state, 'audit trail for Audit Trail Associates').name, 'audit_trail');
  assert.equal(plan(state, 'audit trail for AUDIT-TRAIL   associates').name, 'audit_trail');
  assert.equal(plan(state, 'who changed Audit Trail Associates').name, 'audit_trail');
  assert.equal(plan(state, 'received 5000 from Audit Trail Associates').name === 'audit_trail', false);
});

const IMS_BULK_REPLY = 'I have changed nothing in IMS. A bulk decision applies to every row of that set, so I will not run it for one supplier, for only some of the rows or with an exception left out. Say it for the whole set, for example "accept all matched invoices in IMS", or pick single rows in the IMS screen.';

function asksForTheMonth(state, sentence, kind) {
  const out = plan(state, sentence);
  assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
  assert.deepEqual(out.tools, [], sentence);
  assert.match(out.reply, /^I could not read that period as one month, so I have changed nothing in IMS\./, sentence);
  sayItExample(state, out, kind, sentence);
  assert.doesNotMatch(out.reply, RAW_CODE, sentence);
  assert.doesNotMatch(out.reply, /\d{4}-\d{2}/, `${sentence}: the example month is in words`);
}

const FY_SPELLINGS = ['FY2026', 'FY26', 'FY25-26', 'fy2025-26', 'FY2025-26', 'fy26', "FY'26", 'FY-2026', 'F.Y.2025-26', 'F.Y.2026', 'FY 2025-26', 'fy 26'];

test('R5: a financial year written without a space is not a month either, for a decision, a read and the Excel report', async () => {
  const state = await books();
  for (const fy of FY_SPELLINGS) {
    asksForTheMonth(state, `accept all matched invoices in ims for ${fy}`, 'decide');
    asksForTheMonth(state, `reject all undecided invoices in IMS for ${fy}`, 'decide');
    asksForTheMonth(state, `show IMS for ${fy}`, 'read');
    asksForTheMonth(state, `ims for ${fy}`, 'read');
    asksForTheMonth(state, `what is pending in IMS for ${fy}?`, 'read');
    asksForTheMonth(state, `ims review in excel for ${fy}`, 'excel');
    asksForTheMonth(state, `export the ims excel for ${fy}`, 'excel');
  }
  const held = await chat(state, 'accept all matched invoices in ims for FY2026');
  assert.equal(held.awaitingConfirmation, undefined, held.reply);
  assert.match(held.reply, /changed nothing in IMS/);
  assert.equal(state.pendingChatAction ?? null, null);
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims, fyi', 'ims_decide'), { period: '2026-10', select: 'matched', decision: 'accept' }, 'fyi is not a financial year');
  assert.deepEqual(toolArgs(state, 'fyi accept all matched invoices in ims', 'ims_decide'), { period: '2026-10', select: 'matched', decision: 'accept' });
  assert.deepEqual(toolArgs(state, 'ims for fyi', 'ims_review'), { period: '2026-10' });
});

test('R5: the modal verb may is never read as the month May in an IMS sentence', async () => {
  const state = await books();
  const october = bareMonth(10);
  const may = bareMonth(5);
  const decide = (period) => ({ period, select: 'matched', decision: 'accept' });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for october, you may proceed', 'ims_decide'), decide(october));
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for october 2026, you may proceed', 'ims_decide'), decide('2026-10'));
  assert.deepEqual(toolArgs(state, 'you may accept all matched invoices in ims for october', 'ims_decide'), decide(october));
  assert.deepEqual(toolArgs(state, 'ims for october, you may show me', 'ims_review'), { period: october });
  assert.deepEqual(toolArgs(state, 'may I accept all matched invoices in ims for october?', 'ims_review'), { period: october });
  assert.deepEqual(toolArgs(state, 'ims review in excel for october 2026, you may proceed', 'export_xlsx'), { report: 'ims_review', period: '2026-10' });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims, you may proceed', 'ims_decide'), decide('2026-10'), 'no month said: the latest 2B month, never May');
  assert.deepEqual(toolArgs(state, 'you may accept all matched invoices in ims', 'ims_decide'), decide('2026-10'));
  assert.deepEqual(toolArgs(state, 'we may reject all undecided invoices in ims', 'ims_decide'), { period: '2026-10', select: 'undecided', decision: 'reject' });
  assert.deepEqual(toolArgs(state, 'ims, you may proceed', 'ims_review'), { period: '2026-10' });
  assert.deepEqual(toolArgs(state, 'ims for may', 'ims_review'), { period: may });
  assert.deepEqual(toolArgs(state, 'ims for may 2026', 'ims_review'), { period: '2026-05' });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for may', 'ims_decide'), decide(may));
  assert.deepEqual(toolArgs(state, 'ims for may, you may proceed', 'ims_review'), { period: may });
  asksForTheMonth(state, 'accept all matched invoices in ims for may and october', 'decide');
  asksForTheMonth(state, 'ims for may or october, you may choose', 'read');
});

test('R5: the word may right after in, for, of, to, and or a dash is the month May even when a verb or a pronoun follows it', async () => {
  const state = await books();
  const may = bareMonth(5);
  const decide = (period) => ({ period, select: 'matched', decision: 'accept' });
  asksForTheMonth(state, 'ims for sept and may check', 'read');
  asksForTheMonth(state, 'ims for march to may show me the totals', 'read');
  asksForTheMonth(state, 'accept all matched invoices in ims for april and may get it done', 'decide');
  asksForTheMonth(state, 'ims for april or may we should look', 'read');
  asksForTheMonth(state, 'ims from march - may see the totals', 'read');
  assert.deepEqual(toolArgs(state, 'ims for may i want to see what is pending', 'ims_review'), { period: may });
  assert.deepEqual(toolArgs(state, 'ims in may we have pending invoices', 'ims_review'), { period: may });
  assert.deepEqual(toolArgs(state, 'ims for the month of may get me the list', 'ims_review'), { period: may });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for may i guess', 'ims_decide'), decide(may));
  assert.deepEqual(toolArgs(state, 'may I see ims for october', 'ims_review'), { period: bareMonth(10) });
  assert.deepEqual(toolArgs(state, 'ims for october, may i proceed', 'ims_review'), { period: bareMonth(10) });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for october. may we proceed', 'ims_decide'), decide(bareMonth(10)));
});

const UNREAD_PHRASES = [
  'for last fortnight', 'for the past fortnight', 'for the past month', 'for a month back', 'for one month back', 'for all periods', 'for every period', 'for each period', 'for any period',
  'annually', 'monthly', 'quarterly', 'yearly', 'weekly', 'daily', 'for yesterday', 'so far', 'ytd', 'mtd', 'month to date', 'month-to-date',
  'for 09/2026', 'for 9/2026', 'for 9-2026', 'for 09.2026', 'for 2026/09', 'for 2026.09', "for sept'26", "for sep'26", 'for sep-26', 'for sep/26', 'for Sept-26',
  'for the 2nd quarter', 'for the 1st quarter', 'for the 2nd half', 'for the 3rd quarter',
];

test('R5: more period words and numeric month shapes that are not exactly one month are asked for, and a month is still read', async () => {
  const state = await books();
  for (const phrase of UNREAD_PHRASES) {
    asksForTheMonth(state, `accept all matched invoices in ims ${phrase}`, 'decide');
    asksForTheMonth(state, `reject all undecided invoices in IMS ${phrase}`, 'decide');
    asksForTheMonth(state, `ims ${phrase}`, 'read');
    asksForTheMonth(state, `show pending invoices in ims ${phrase}`, 'read');
    asksForTheMonth(state, `ims review in excel ${phrase}`, 'excel');
  }
  const held = await chat(state, "accept all matched invoices in ims for sept'26");
  assert.equal(held.awaitingConfirmation, undefined, held.reply);
  assert.match(held.reply, /changed nothing in IMS/);
  assert.match(held.reply, /Say the month/);
  assert.equal(state.pendingChatAction ?? null, null);
  assert.deepEqual(state.imsDecisions ?? {}, {}, 'nothing was decided');
  const read = {
    'ims for 2026-09': { period: '2026-09' },
    'ims for september 2026': { period: '2026-09' },
    'ims for this month': { period: NOW_KEY },
    'ims for last month': { period: LAST_KEY },
    'ims for the previous month': { period: LAST_KEY },
    'ims for the month of september': { period: bareMonth(9) },
    'ims for sept': { period: bareMonth(9) },
    'what is pending in ims': { period: '2026-10' },
  };
  for (const [sentence, args] of Object.entries(read)) assert.deepEqual(toolArgs(state, sentence, 'ims_review'), args, sentence);
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for 2026-09', 'ims_decide'), { period: '2026-09', select: 'matched', decision: 'accept' });
  assert.equal(plan(state, 'accept all matched invoices in ims above 5000 for sept\'26').reply, IMS_BULK_REPLY, 'an amount is still the bulk-only reply');
  assert.equal(plan(state, 'accept all matched invoices dated 12/09/2026 in ims').reply, IMS_BULK_REPLY, 'a day is still the bulk-only reply');
  assert.equal(plan(state, 'accept all matched invoices in ims dated 12.09.2026').reply, IMS_BULK_REPLY);
});

test('R12: a sentence that asks about, lists or talks about what to accept is shown the review, and a decision sentence still hears that nothing was changed', async () => {
  const state = await books();
  const informational = [
    'ims invoices I should accept',
    'I want to see what to accept in ims',
    'ims: what do I accept',
    'review ims and decide what to accept',
    'make a list of pending invoices in ims',
    'keep me posted on pending invoices in ims',
    'ims invoices to accept',
    'ims invoices to reject',
    'tell me which invoices to reject in ims',
    'ims invoices I can accept',
    'ims rows I need to accept',
    'things to reject in ims',
    'help me decide what to reject in ims',
    'keep me updated on pending invoices in ims',
    'put together a summary of pending invoices in ims',
    'ims: how do I reject',
  ];
  for (const sentence of informational) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'tool', `${sentence} -> ${words(out)}`);
    assert.equal(out.name, 'ims_review', `${sentence} -> ${words(out)}`);
    assert.deepEqual(out.args, { period: '2026-10' }, sentence);
  }
  const commanded = [
    'I want to accept everything in ims',
    'we need to reject all unmatched invoices in ims',
    'go ahead and accept the rest in ims',
    'ok now reject everything in ims',
    'in ims, accept everything',
    'ims: accept all invoices',
    'then mark everything pending in ims',
    'just accept all in ims',
    "let's accept everything in ims",
    'put everything on pending in ims',
    'leave all invoices pending in ims',
    'I would like to reject all in ims',
    'you can accept everything in ims',
    'please accept the invoices in ims',
    'accept invoice F-101 in ims',
    'reject all matched invoices over 5000 in ims',
  ];
  for (const sentence of commanded) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.equal(out.reply, IMS_BULK_REPLY, sentence);
    const said = await chat(state, sentence);
    assert.equal(said.reply, IMS_BULK_REPLY, sentence);
    assert.equal(state.pendingChatAction ?? null, null, sentence);
  }
  assert.deepEqual(state.imsDecisions ?? {}, {});
});

test('R12: an accept or reject command that has a clause about telling or showing after it still hears that nothing was changed, and the same words in front of it make it a question', async () => {
  const state = await books();
  const commanded = [
    'accept everything in ims and tell me what changed',
    'reject all in ims and let me see the result',
    'accept all the invoices in ims so I can see what is left',
    'please accept everything in ims and explain what you did',
    'ims: accept everything, tell me when done',
    'reject everything in ims and keep me posted',
    'accept all unmatched invoices in ims and summarise what was left',
    'then reject all invoices in ims, and tell me which invoices were rejected',
  ];
  for (const sentence of commanded) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.equal(out.reply, IMS_BULK_REPLY, sentence);
  }
  const informational = [
    'tell me what to accept in ims and why',
    'show me which invoices to reject in ims',
    'let me see what I should accept in ims',
    'ims: tell me what to accept',
    'summarise what to reject in ims',
  ];
  for (const sentence of informational) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'tool', `${sentence} -> ${words(out)}`);
    assert.equal(out.name, 'ims_review', `${sentence} -> ${words(out)}`);
  }
});

test('R12: a sentence that asks about or lists what to accept is shown the review even when it names a set, and a command that names a set still decides', async () => {
  const state = await books();
  const informational = [
    'ims matched invoices to accept',
    'ims matched invoices I can accept',
    'let me see all matched invoices accepted in ims',
    'ims: what should I accept among all matched invoices',
    'ims: pending invoices to accept',
    'tell me which undecided invoices to reject in ims',
    'show me the matched invoices I should accept in ims',
    'which matched invoices should I accept in ims',
  ];
  for (const sentence of informational) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'tool', `${sentence} -> ${words(out)}`);
    assert.equal(out.name, 'ims_review', `${sentence} -> ${words(out)}`);
    assert.deepEqual(out.args, { period: '2026-10' }, sentence);
  }
  asksForTheMonth(state, 'ims matched invoices to accept for FY2026', 'read');
  asksForTheMonth(state, 'ims: what should I accept among all matched invoices for the past month', 'read');
  const decided = {
    'accept all matched invoices in ims and tell me what changed': { period: '2026-10', select: 'matched', decision: 'accept' },
    'reject all undecided invoices in ims, tell me when done': { period: '2026-10', select: 'undecided', decision: 'reject' },
    'please accept all matched invoices in ims so I can see the rest': { period: '2026-10', select: 'matched', decision: 'accept' },
    'set all undecided invoices to pending in ims and tell me what changed': { period: '2026-10', select: 'undecided', decision: 'pending' },
    'I want to accept all matched invoices in ims': { period: '2026-10', select: 'matched', decision: 'accept' },
    'ims: accept all matched invoices': { period: '2026-10', select: 'matched', decision: 'accept' },
  };
  for (const [sentence, args] of Object.entries(decided)) assert.deepEqual(toolArgs(state, sentence, 'ims_decide'), args, sentence);
});

test('R12: an IMS sentence with an amount, a rate, a count or an invoice number in it keeps the bulk-only reply, informational or not, and never reaches the invoice, expense or GST review planners', async () => {
  const state = await books();
  const sentences = [
    'I should accept the invoice from Acme Steel for 5000 with GST 18% in ims',
    'I should accept an invoice of 5000 with GST 18% in ims',
    'ims invoices I should accept of 5000 GST 18%',
    'in ims what do I accept 5000 gst 18',
    'make a list of pending invoices in ims for 5000 gst 18',
    'review ims and decide what to accept for 5000 gst 18 percent',
    'I should accept 5 matched invoices on the invoice management system',
    'I should accept the 5 matched invoices in ims',
    'ims invoices to accept F-101 for 5000',
    'invoice 5000 GST 18% ims invoices to accept',
    'bill 5000 GST 18% ims what to accept',
    'paid 5000 to Acme Steel ims invoices I should accept',
    'reject invoice INV09/2026 in ims',
    'reject invoice INV-09-2026 in ims',
    'reject invoice INV/09/2026 in ims',
    'reject invoice 2026.50 in ims',
  ];
  for (const sentence of sentences) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.equal(out.reply, IMS_BULK_REPLY, sentence);
    assert.deepEqual(out.tools, [], sentence);
  }
  asksForTheMonth(state, 'accept all matched invoices in ims for 2026/09.', 'decide');
  asksForTheMonth(state, 'ims for 09/2026.', 'read');
  asksForTheMonth(state, 'ims for 2026.09, thanks', 'read');
});

test('R8: more lead-in words and phrases are never part of a known supplier name, and more conditionals write nothing', async () => {
  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  const marked = { partyName: 'Acme Steel', msme: true, days: 30 };
  for (const lead of ['kindly note', 'pls note', 'Pls note,', 'by the way', 'By the way,', 'for the record', 'For the record:', 'note down', 'note to self', 'note to self:', 'just', 'well', 'hi', 'hello', 'Hi,', 'oh', 'just so you know', 'for your information', 'kindly note that', 'please note down', 'ok']) {
    assert.deepEqual(terms(`${lead} Acme Steel is MSME, 30 days`), marked, lead);
  }
  assert.deepEqual(terms('Acme Steel, by the way, is MSME, 30 days'), marked, 'an aside after the name');
  assert.deepEqual(terms('mark Acme Steel as MSME, by the way, 30 days'), marked);
  assert.deepEqual(terms('kindly note Acme Steel is MSME'), { partyName: 'Acme Steel', msme: true });

  const conditionals = ['even if', 'only if', 'as if', 'not sure if', 'wondering if', 'check if', 'checking if', 'see if', 'ask if', 'whether', 'what if', 'Even if', 'note, even if', 'btw only if', 'ok so if', 'please check whether', 'I wonder if', 'wonder if'];
  for (const lead of conditionals) {
    for (const sentence of [`${lead} Acme Steel is MSME, 30 days`, `${lead} Zenith Dyes is MSME, 30 days`, `${lead} Acme Steel is an MSME supplier`]) {
      const out = plan(state, sentence);
      assert.equal(out.name === 'set_supplier_terms', false, `${sentence} -> ${words(out)}`);
      assert.equal(out.kind, 'tool', sentence);
      assert.equal(out.fallback, true, `${sentence} falls back`);
    }
  }
  const held = await chat(state, 'even if Acme Steel is MSME, 30 days');
  assert.equal(held.awaitingConfirmation, undefined, held.reply);
  assert.ok(!state.pendingChatAction, 'nothing is waiting for a yes');
  assert.deepEqual(state.supplierTerms || {}, {}, 'no terms were written');
});

test('R8: a word that can start a business name is kept in front of a name that is not in the books, unless a comma, colon or dash follows it', async () => {
  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  for (const name of ['Note Books Co', 'Today Traders', 'Now Foods', 'Confirm Tech', 'Just Dial', 'Hello Fresh', 'Hi Tech Industries', 'After Hours Pvt Ltd', 'Once Upon Ltd', 'Well Made Goods', 'OK Packaging', 'Okay Plast', 'Oh My Goods']) {
    assert.deepEqual(terms(`${name} is MSME, 30 days`), { partyName: name, msme: true, days: 30 }, name);
    assert.deepEqual(terms(`mark ${name} as MSME`), { partyName: name, msme: true }, name);
    assert.deepEqual(terms(`${name} is MSME`), { partyName: name, msme: true }, name);
  }
  for (const lead of ['btw', 'hey', 'fyi', 'actually', 'please', 'pls', 'kindly', 'since', 'because', 'also', 'maybe', 'by the way', 'for the record', 'please note', 'note that', 'remember that', 'confirm that', 'Hey,']) {
    assert.deepEqual(terms(`${lead} Zenith Dyes is MSME, 30 days`), { partyName: 'Zenith Dyes', msme: true, days: 30 }, lead);
  }
  for (const lead of ['Note:', 'note,', 'Now,', 'today -', 'Hi,', 'well,', 'Hello,', 'just -', 'after:', 'once,', 'confirm:', 'Today;', 'ok,', 'okay:', 'oh,']) {
    assert.deepEqual(terms(`${lead} Zenith Dyes is MSME, 30 days`), { partyName: 'Zenith Dyes', msme: true, days: 30 }, lead);
  }
  assert.deepEqual(terms('note Zenith Dyes is MSME, 30 days'), { partyName: 'note Zenith Dyes', msme: true, days: 30 }, 'the name is shown in the preview and can be said again without the word');
  const held = await chat(state, 'note Zenith Dyes is MSME, 30 days');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^Mark note Zenith Dyes as an MSME supplier/, held.reply);
  await chat(state, 'no');
  assert.deepEqual(terms('Zenith Dyes is MSME, 30 days'), { partyName: 'Zenith Dyes', msme: true, days: 30 });
});

test('R13: a day count with a decimal point or a thousands comma is refused with the days rule, and a zero-padded count is its value', async () => {
  const state = await books();
  const rule = 'Agreed days must be a whole number from 0 to 365.';
  for (const days of ['1,000', '10,000', '1,00,000', '30.5', '1.5', '0.5', '45.0', '3,65', '1,2,3', '99,999', '1000000,5']) {
    for (const sentence of [`Acme Steel is MSME, ${days} days`, `we pay Acme Steel in ${days} days`, `supplier terms for Acme Steel ${days} days`, `mark Acme Steel as MSME, net ${days}`, `payment terms for Acme Steel net ${days}`, `Acme Steel is MSME, ${days}-days`, `please pay Acme Steel within ${days} days`, `Acme Steel is MSME, small category, net ${days}`]) {
      const out = plan(state, sentence);
      assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
      assert.equal(out.reply, rule, sentence);
      assert.equal(out.blocked, true, sentence);
      assert.deepEqual(out.tools, [], sentence);
    }
  }
  const refused = await chat(state, 'Acme Steel is MSME, 1,000 days');
  assert.equal(refused.reply, rule);
  assert.equal(refused.blocked, true);
  assert.ok(!state.pendingChatAction, 'nothing is waiting for a yes');
  assert.deepEqual(state.supplierTerms || {}, {}, 'no terms were written');

  for (const [sentence, args] of [
    ['Acme Steel is MSME, 00030 days', { partyName: 'Acme Steel', msme: true, days: 30 }],
    ['Acme Steel is MSME, 0030 days', { partyName: 'Acme Steel', msme: true, days: 30 }],
    ['Acme Steel is MSME, net 00030', { partyName: 'Acme Steel', msme: true, days: 30 }],
    ['Acme Steel is MSME, 000 days', { partyName: 'Acme Steel', msme: true, days: 0 }],
    ['Acme Steel is MSME, 000365 days', { partyName: 'Acme Steel', msme: true, days: 365 }],
    ['supplier terms for Acme Steel 00030 days', { partyName: 'Acme Steel', days: 30 }],
    ['payment terms for Acme Steel to net 00030', { partyName: 'Acme Steel', days: 30 }],
    ['we pay Acme Steel in 00030 days', { partyName: 'Acme Steel', days: 30 }],
    ['we pay Acme Steel net 00045', { partyName: 'Acme Steel', days: 45 }],
    ['Acme Steel is MSME,45 days', { partyName: 'Acme Steel', msme: true, days: 45 }],
    ['Acme Steel is MSME, 45 days.', { partyName: 'Acme Steel', msme: true, days: 45 }],
    ['Acme Steel is MSME, 45-days, small category', { partyName: 'Acme Steel', msme: true, category: 'small', days: 45 }],
    ['Acme Steel is MSME, net 30, small category', { partyName: 'Acme Steel', msme: true, category: 'small', days: 30 }],
    ['Acme Steel is MSME, 30 days, 45 days', { partyName: 'Acme Steel', msme: true, days: 30 }],
  ]) {
    assert.deepEqual(toolArgs(state, sentence, 'set_supplier_terms'), args, sentence);
  }
  for (const sentence of ['Acme Steel is MSME, 000366 days', 'Acme Steel is MSME, net 00366', 'we pay Acme Steel in 0400 days']) {
    assert.equal(plan(state, sentence).reply, rule, sentence);
  }
  assert.notEqual(plan(state, 'paid 1,000 to Acme Steel in 30 days').name, 'set_supplier_terms', 'an amount with a comma is not a day count');
});

test('the changed planners stay fast on 2,000-character messages', async () => {
  const state = await books();
  const messages = [
    `accept all matched in ims ${'for sept '.repeat(220)}`,
    `ims ${'for the first half '.repeat(105)}`,
    `ims ${'july to september '.repeat(115)}`,
    `accept all matched in ims ${'2026-09 '.repeat(250)}`,
    `audit trail ${'for sept '.repeat(220)}`,
    `audit trail for ${'INV-0001 '.repeat(220)}`,
    `audit trail for ${'Kiran Stores '.repeat(150)}`,
    `what changed in my books ${'last week '.repeat(190)}`,
    `note ${'note '.repeat(390)}Acme Steel is MSME, 30 days`,
    `if ${'Acme Steel '.repeat(170)}is MSME, 30 days`,
    `Acme Steel is MSME ${'400 days '.repeat(220)}`,
    `we pay Acme Steel in ${'9'.repeat(1900)} days`,
    `accept ${'everything '.repeat(180)}in ims`,
    `accept all matched invoices above ${'5000 '.repeat(330)}in ims`,
    `reject all ${'unmatched '.repeat(190)}invoices in ims`,
    `audit trail ${' '.repeat(1980)}`,
    `ims ${'for may i '.repeat(200)}`,
    `accept all matched in ims ${'you may '.repeat(250)}`,
    `accept all matched in ims ${'09/2026 '.repeat(240)}`,
    `ims ${'2026.09 '.repeat(240)}`,
    `ims ${"sep'26 ".repeat(300)}`,
    `ims ${'daily monthly yearly '.repeat(90)}`,
    `ims ${'what should I accept to see '.repeat(70)}`,
    `${'by the way '.repeat(170)}Acme Steel is MSME, 30 days`,
    `${'kindly '.repeat(280)}Acme Steel is MSME, 30 days`,
    `${'hi, '.repeat(480)}Acme Steel is MSME, 30 days`,
    `${'even if '.repeat(240)}Acme Steel is MSME, 30 days`,
    `Acme Steel is MSME ${'1,2,3,4,5,6,7,8,9 '.repeat(100)}days`,
    `Acme Steel is MSME, ${'9.'.repeat(900)} days`,
    `Acme Steel is MSME, ${'0'.repeat(1900)} days`,
  ];
  for (const message of messages) {
    const started = process.hrtime.bigint();
    plan(state, message.slice(0, 2000));
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(elapsed < 1000, `${message.slice(0, 40)} took ${elapsed.toFixed(1)} ms`);
  }
});
