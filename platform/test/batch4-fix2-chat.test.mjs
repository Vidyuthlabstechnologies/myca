import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { localToday } from '../src/dates.mjs';

const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const TWO_B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
  'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y',
  'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,15-09-2026,2000,180,180,0,0,2360,Y',
  'CDNR,27AABCT1332L1ZE,FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y',
].join('\n');
const RAW_CODE = /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/;
const TODAY = localToday();

function shiftDay(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mondayOf(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return shiftDay(iso, -((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7));
}

function previousQuarter(iso) {
  const [year, month] = iso.split('-').map(Number);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const before = startMonth - 3;
  const fromYear = before < 1 ? year - 1 : year;
  const fromMonth = before < 1 ? before + 12 : before;
  const from = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
  return { from, to: shiftDay(`${year}-${String(startMonth).padStart(2, '0')}-01`, -1) };
}

function lastMonthOf(iso) {
  const [year, month] = iso.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
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

async function books({ with2b = true } = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  sale(state, 'Kiran Stores', 100000, '2026-10-01');
  sale(state, 'Audit Trail Associates', 5000, '2026-10-02', 18);
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  bill(state, 'Pack House', '29AABCL1234J1ZL', 'PH-9', '2026-09-10', 6000, 12);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-14', 2000, 18);
  if (with2b) {
    const added = await runTool(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B, fileName: 'GSTR2B_092026.csv' });
    assert.equal(added.ok, true, JSON.stringify(added));
  }
  return state;
}

function usBooks() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', pan: '', fy: '', address: '12 Maple St, Austin, TX 78701' };
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
  return out.kind === 'reply' ? out.reply : `${out.kind} ${out.name} ${JSON.stringify(out.args)}`;
}

test('R1-15: a bulk IMS decision that names a supplier or leaves one out is declined in words and changes nothing', async () => {
  const state = await books();
  const qualified = [
    'reject all undecided invoices from Pack House in ims for 2026-09',
    'accept all matched invoices except Fabric Co in ims for 2026-09',
    'accept all matched invoices from Fabric Co in ims',
    'accept all matched invoices excluding Fabric Co in ims for 2026-09',
    'accept all matched invoices other than Fabric Co in ims for 2026-09',
    'accept all matched invoices apart from Fabric Co in ims for 2026-09',
    'accept all matched invoices but not Fabric Co in ims for 2026-09',
    'accept only the Pack House invoices in ims for 2026-09',
    'accept all matched invoices of Dye Works in ims for 2026-09',
    'reject Pack House in ims for 2026-09',
    'accept Fabric Co in ims for 2026-09',
    'reject all undecided invoices from Acme Traders in ims for 2026-09',
  ];
  for (const sentence of qualified) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.deepEqual(out.tools, [], sentence);
    assert.match(out.reply, /changed nothing/i, sentence);
    assert.match(out.reply, /every row of that set/i, sentence);
    assert.match(out.reply, /IMS screen/, sentence);
    assert.doesNotMatch(out.reply, RAW_CODE, sentence);
    const said = await chat(state, sentence);
    assert.notEqual(said.awaitingConfirmation, true, `${sentence}: ${said.reply}`);
    assert.match(said.reply, /changed nothing/i, sentence);
    assert.equal(state.pendingChatAction ?? null, null, sentence);
    assert.deepEqual(state.imsDecisions ?? {}, {}, `${sentence} decided nothing`);
  }

  assert.deepEqual(toolArgs(state, 'accept all matched in ims for 2026-09', 'ims_decide'), { period: '2026-09', select: 'matched', decision: 'accept' });
  assert.deepEqual(toolArgs(state, 'reject all undecided in ims for 2026-09', 'ims_decide'), { period: '2026-09', select: 'undecided', decision: 'reject' });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices from 2026-09 in ims', 'ims_decide'), { period: '2026-09', select: 'matched', decision: 'accept' }, 'a month after "from" is the period, not a supplier');
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims from last month', 'ims_decide').decision, 'accept');
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims from the portal for 2026-09', 'ims_decide'), { period: '2026-09', select: 'matched', decision: 'accept' });
  assert.deepEqual(toolArgs(state, 'accept only matched invoices in ims for 2026-09', 'ims_decide'), { period: '2026-09', select: 'matched', decision: 'accept' }, '"only" in front of the set itself is not a narrowing');
  for (const sentence of ['accept all matched invoices in ims only', 'accept all matched invoices only in ims for 2026-09', 'accept all matched invoices in ims from my gstr-2b for 2026-09']) {
    assert.deepEqual(toolArgs(state, sentence, 'ims_decide'), { period: '2026-09', select: 'matched', decision: 'accept' }, `${sentence}: only, or the portal as the source, does not name a subset`);
  }
  assert.equal(plan(state, 'ims review for 2026-09').name, 'ims_review');
  assert.equal(plan(state, 'is Fabric Co in ims for 2026-09?').name, 'ims_review', 'a question stays a read-only review');

  const whole = await chat(state, 'accept all matched in ims for 2026-09');
  assert.equal(whole.awaitingConfirmation, true, whole.reply);
  assert.match(whole.reply, /Mark 2 invoices/, 'the unqualified sentence still decides the whole set');
  await chat(state, 'no');
});

test('R1-16: a receipt sentence that carries TDS is never settled as the whole invoice (round 1 answers with the two steps)', async () => {
  const state = await books();
  const tds = [
    'received 98000 against INV-0001, tds withheld 2000',
    'Kiran paid 98000 on INV-0001 after deducting tds 2000',
    'received 98000 on INV-0001 and 2000 tds deducted',
    'INV-0001 paid 98000 tds 2000',
  ];
  for (const sentence of tds) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.match(out.reply, /recorded nothing/, sentence);
    assert.match(out.reply, /tds withheld 2000 on INV-0001/, sentence);
    assert.match(out.reply, /received 98000 against INV-0001/, sentence);
    const said = await chat(state, sentence);
    assert.notEqual(said.awaitingConfirmation, true, sentence);
  }
  for (const sentence of ['received 98000 from Kiran Stores after tds of 2000', 'Kiran Stores paid 98000 less tds 2000']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.match(out.reply, /recorded nothing/, sentence);
    assert.match(out.reply, /tds withheld 2000/, sentence);
  }
  const control = await chat(state, 'received 98000 against INV-0001');
  assert.equal(control.awaitingConfirmation, true, control.reply);
  assert.match(control.reply, /Receipt of ₹98,000\.00 against INV-0001/, control.reply);
  await chat(state, 'no');
});

test('R1-16: two amounts in a receipt or payment sentence are asked about, never read as "settle the whole invoice or bill"', async () => {
  const state = await books();
  const receipts = [
    'received 98000 bank and 2000 tax deducted at source against INV-0001',
    'received 98000 against INV-0001 less 2000',
    'received 98000 and 2000 against INV-0001',
    'received 50000 against INV-0001, 48000 against INV-0002',
    'received 98000 against INV-0001 after 5 days',
    'Kiran Stores paid 98000 less tax deducted at source 2000',
    'received 98000 from Kiran Stores net of tax deducted at source of 2000',
    'received 5000 and 3000 from Kiran Stores',
  ];
  for (const sentence of receipts) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.deepEqual(out.tools, [], sentence);
    assert.match(out.reply, /more than one amount/, sentence);
    assert.match(out.reply, /recorded nothing/, sentence);
    assert.doesNotMatch(out.reply, RAW_CODE, sentence);
    const said = await chat(state, sentence);
    assert.notEqual(said.awaitingConfirmation, true, `${sentence}: ${said.reply}`);
    assert.equal(state.pendingChatAction ?? null, null, sentence);
  }
  assert.match(plan(state, 'received 98000 bank and 2000 tax deducted at source against INV-0001').reply, /tds withheld 2000 on INV-0001 under 194J/, 'the TDS wording gets the next step in words');
  assert.doesNotMatch(plan(state, 'received 98000 against INV-0001 after 5 days').reply, /tds withheld/, 'no TDS advice when no TDS was mentioned');

  assert.deepEqual(toolArgs(state, 'received 98000 against INV-0001', 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', date: TODAY, amount: 98000 });
  assert.deepEqual(toolArgs(state, 'received 98000 against INV-0001 on 2026-10-20', 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', date: '2026-10-20', amount: 98000 }, 'a date is not a second amount');
  assert.deepEqual(toolArgs(state, 'received 1,00,000 against INV-0001 at 18%', 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', date: TODAY, amount: 100000 }, 'a rate is not a second amount');
  for (const sentence of ['received 98000 on INV-0001 (tds 2000 recorded earlier)', 'received 98000 against INV-0001, tds 2000 not deducted', 'received 98000 from Kiran Stores, tds 2000 already recorded', 'received 98000 from Kiran Stores, tds 2000 not deducted']) {
    assert.deepEqual(toolArgs(state, sentence, 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', date: TODAY, amount: 98000 }, `${sentence}: a TDS amount said to be booked already or not deducted is not a second amount`);
  }
  assert.deepEqual(toolArgs(state, 'record receipt INV-0001', 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', date: TODAY }, 'no amount said still settles the whole invoice');
  assert.deepEqual(toolArgs(state, 'paid INV-0001', 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', date: TODAY });

  const payments = [
    'paid Fabric Co 4000 and 2000',
    'paid Pack House 3000 less 500',
    'paid BILL-0001 4000 and 2000',
  ];
  for (const sentence of payments) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.match(out.reply, /more than one amount/, sentence);
    assert.match(out.reply, /recorded nothing/, sentence);
  }
  assert.equal(toolArgs(state, 'paid Fabric Co 4000', 'record_payment').amount, 4000);
  assert.equal(toolArgs(state, 'paid Fabric Co 4000 in 30 days', 'record_payment').amount, 4000, 'a number of days is not a second amount');
  assert.equal(Object.hasOwn(toolArgs(state, 'paid BILL-0001', 'record_payment'), 'amount'), false, 'no amount said still settles the whole bill');
});

test('R1-17: audit-trail and IMS words inside a posting, a credit note or a reminder do not turn the sentence into a lookup', async () => {
  const state = await books();
  const kept = {
    'invoice Kiran Stores 25000 for audit trail review GST 18%': 'create_invoice',
    'paid Fabric Co 4000 for audit log': 'record_payment',
    'expense 1200 audit trail software': 'post_expense',
    'bill from Fabric Co 5000 for audit log software GST 18%': 'create_purchase',
    'quote Audit Trail Associates 25000 for design GST 18%': 'create_quote',
    'received 5000 from Audit Trail Associates': 'record_receipt',
    'credit note INV-0002 1000 audit trail error': 'create_credit_note',
    'debit note INV-0002 1000 audit log mistake': 'create_debit_note',
    'received 5000 against INV-0002 for audit trail work': 'record_receipt',
    'invoice Kiran Stores 25000 for edit log review GST 18%': 'create_invoice',
    'invoice Kiran Stores 25000 for audit trails review GST 18%': 'create_invoice',
  };
  for (const [sentence, tool] of Object.entries(kept)) assert.equal(plan(state, sentence).name, tool, sentence);
  assert.deepEqual(toolArgs(state, 'credit note INV-0002 1000 audit trail error', 'create_credit_note'), { invoiceId: 'INV-0002', date: TODAY, reason: 'audit trail error', amount: 1000 });
  assert.equal(toolArgs(state, 'received 5000 against INV-0002 for audit trail work', 'record_receipt').amount, 5000);
  const owed = plan(state, 'how much does Audit Trail Associates owe me');
  assert.notEqual(owed.name, 'audit_trail');
  assert.match(owed.reply || '', /Audit Trail Associates/);
  assert.notEqual(plan(state, 'send a reminder to Audit Trail Associates').name, 'audit_trail');

  const reminders = {
    'remind me to review the audit trail tomorrow': { text: 'Review the audit trail', due: shiftDay(TODAY, 1) },
    'remind me to look at the audit log tomorrow': { text: 'Look at the audit log', due: shiftDay(TODAY, 1) },
    'remind me to accept all matched in ims tomorrow': { text: 'Accept all matched in ims', due: shiftDay(TODAY, 1) },
    'remind me tomorrow to check the audit trail': { text: 'Check the audit trail', due: shiftDay(TODAY, 1) },
    'remind me to check ims on 2026-12-01': { text: 'Check ims', due: '2026-12-01' },
  };
  for (const [sentence, args] of Object.entries(reminders)) assert.deepEqual(toolArgs(state, sentence, 'add_reminder'), args, sentence);
  for (const sentence of ['remind me about the audit trail', 'remind me about ims', 'please remind me about the audit trail']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.match(out.reply, /When should I remind you/, sentence);
  }
  for (const sentence of ['add reminder to review the audit trail tomorrow', 'add a reminder: check ims on friday', 'can you remind me to look at the audit log on friday', 'i need a reminder to check the audit trail tomorrow']) {
    const out = plan(state, sentence);
    assert.notEqual(out.name, 'audit_trail', `${sentence} -> ${words(out)}`);
    assert.notEqual(out.name, 'ims_review', `${sentence} -> ${words(out)}`);
    assert.doesNotMatch(out.reply || '', /date range/, `${sentence} -> ${words(out)}`);
  }

  for (const sentence of ['show the audit trail', 'please show me the audit trail', 'who changed the books last month', 'audit log for last month', 'show the audit trail for IMS decisions', 'what changed in the books this week']) {
    assert.equal(plan(state, sentence).name, 'audit_trail', sentence);
  }
  assert.equal(plan(state, 'ims review for 2026-09').name, 'ims_review');
  assert.equal(plan(state, 'accept all matched in ims for 2026-09').name, 'ims_decide');
});

test('R1-18: a typed yes for an IMS decision and for MSME terms is in the default view of the audit trail (already fixed by round 1)', async () => {
  const s = openSession(createMemoryStores(), { seed: false });
  assert.equal((await s.signIn('USR-ADMIN', '1234')).ok, true);
  const made = await s.tool('create_purchase', { partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', supplierInvoiceNo: 'F-101', date: '2026-09-05', lines: [{ description: 'Grey cloth', qty: 1, rate: 10000, gstRate: 5 }] });
  assert.equal(made.ok, true, JSON.stringify(made));
  const imported = await s.tool('import_gstr2b', { period: '2026-09', csv: TWO_B, fileName: 'g.csv' });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const held = await s.chat('accept all matched in ims for 2026-09');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const done = await s.chat('yes');
  assert.equal(done.posted, true, done.reply);
  const terms = await s.chat('Fabric Co is MSME, 30 days');
  assert.equal(terms.awaitingConfirmation, true, terms.reply);
  assert.equal((await s.chat('yes')).posted, true);
  const trail = await s.tool('audit_trail', {});
  assert.equal(trail.ok, true, JSON.stringify(trail));
  const typed = trail.data.events.filter((event) => event.action === 'chat.run').map((event) => `${event.kind} ${event.summary}`);
  assert.ok(typed.includes('change Chat message (IMS decide)'), typed.join(' | '));
  assert.ok(typed.includes('change Chat message (Set supplier terms)'), typed.join(' | '));
});

test('R1-20: the audit trail is found in the plural and with a hyphen, and the sentence is read for the actor, the limit and the range', async () => {
  const state = await books();
  const audit = (sentence) => {
    const args = toolArgs(state, sentence, 'audit_trail');
    assert.equal(validateAssistantToolCall('audit_trail', args).ok, true, sentence);
    return args;
  };
  for (const sentence of ['show the audit logs', 'show the audit trails', 'show audit-trail', 'show the audit-trails', 'show the edit logs', 'show the change logs', 'show the change-log', 'audit logs for last month']) {
    assert.equal(plan(state, sentence).name, 'audit_trail', `${sentence} -> ${words(plan(state, sentence))}`);
  }
  assert.deepEqual(audit('audit trail by Priya'), { actor: 'Priya' });
  assert.deepEqual(audit('audit trail by Priya Sharma last month'), { actor: 'Priya Sharma', period: 'last-month' });
  assert.deepEqual(audit('audit trail by user Priya'), { actor: 'Priya' }, 'a label in front of the name is not part of the name');
  assert.deepEqual(audit('show the audit trail by the accountant Ravi Kumar'), { actor: 'Ravi Kumar' });
  for (const sentence of ['audit trail by date', 'audit trail by invoice', 'show the audit trail by customer', 'audit trail by user']) assert.deepEqual(audit(sentence), {}, `${sentence}: a grouping word is not a person`);
  assert.deepEqual(audit('audit trail confirmed by typing yes'), {}, 'a way of doing something is not a person');
  assert.deepEqual(audit('show the audit trail by Ravi for 2026-10'), { actor: 'Ravi', period: '2026-10' });
  assert.deepEqual(audit('audit trail limit 5'), { limit: 5 });
  assert.deepEqual(audit('who changed the books, limit 5'), { limit: 5 });
  assert.deepEqual(audit('show the last 5 changes in the audit trail'), { limit: 5 });
  assert.deepEqual(audit('audit trail last 12 entries'), { limit: 12 });
  assert.deepEqual(audit('audit trail everything by Priya since 2026-10-01 limit 20'), { from: '2026-10-01', actor: 'Priya', limit: 20, view: 'all' });
  assert.deepEqual(audit('audit trail last 7 days'), { from: shiftDay(TODAY, -7), to: TODAY }, 'last N days is still a range, not a limit');
  assert.deepEqual(audit('audit trail from 2026-10-05 to 2026-10-10'), { from: '2026-10-05', to: '2026-10-10' });
  assert.deepEqual(audit('audit trail for fy 2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail yesterday'), { from: shiftDay(TODAY, -1), to: shiftDay(TODAY, -1) });

  for (const [sentence, wanted] of [
    ['audit trail by me', /by name/],
    ['audit trail by myself', /by name/],
    ['audit trail limit 5000', /between 1 and 2000/],
    ['audit trail limit 0', /between 1 and 2000/],
    ['audit trail last 3000 changes', /between 1 and 2000/],
  ]) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.deepEqual(out.tools, [], sentence);
    assert.match(out.reply, wanted, sentence);
    assert.match(out.reply, /not looked anything up/, sentence);
  }

  const said = await chat(state, 'audit trail by Priya limit 5');
  assert.equal(said.tools[0].name, 'audit_trail');
  assert.equal(said.tools[0].result.data.view, 'changes');
});

test('R2-8: last week, last quarter and the other ranges are read, and a range that cannot be read is answered with a sentence', async () => {
  const state = await books();
  const lastWeek = { from: shiftDay(mondayOf(TODAY), -7), to: shiftDay(mondayOf(TODAY), -1) };
  const lastQuarter = previousQuarter(TODAY);
  assert.deepEqual(toolArgs(state, 'what changed in the books last week', 'audit_trail'), lastWeek);
  assert.deepEqual(toolArgs(state, 'audit trail last week', 'audit_trail'), lastWeek);
  assert.deepEqual(toolArgs(state, 'audit trail for the previous week', 'audit_trail'), lastWeek);
  assert.deepEqual(toolArgs(state, 'audit trail for last quarter', 'audit_trail'), lastQuarter);
  assert.deepEqual(toolArgs(state, 'audit trail last quarter', 'audit_trail'), lastQuarter);
  assert.deepEqual(toolArgs(state, 'audit trail for the last quarter', 'audit_trail'), lastQuarter);
  assert.deepEqual(toolArgs(state, 'audit trail for the previous quarter', 'audit_trail'), lastQuarter);
  assert.deepEqual(toolArgs(state, 'audit trail this quarter', 'audit_trail'), { period: 'this-quarter' });
  assert.deepEqual(toolArgs(state, 'audit trail this week', 'audit_trail'), { from: mondayOf(TODAY), to: TODAY });
  assert.deepEqual(toolArgs(state, 'audit trail from 2026-09-01 to 2026-09-30', 'audit_trail'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(toolArgs(state, 'audit trail since 2026-10-01', 'audit_trail'), { from: '2026-10-01' });
  assert.deepEqual(toolArgs(state, 'audit trail for FY 2025-26', 'audit_trail'), { from: '2025-04-01', to: '2026-03-31' });

  for (const sentence of ['audit trail since monday', 'audit trail for the last 3 months', 'audit trail for Q2', 'audit trail last week and last quarter', 'audit trail for the last fortnight', 'audit trail from last friday']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.deepEqual(out.tools, [], sentence);
    assert.match(out.reply, /could not read that date range/, sentence);
    assert.match(out.reply, /not looked anything up/, sentence);
  }

  const week = await chat(state, 'what changed in the books last week');
  assert.equal(week.tools[0].name, 'audit_trail');
  assert.equal(week.tools[0].result.data.from, lastWeek.from);
  assert.equal(week.tools[0].result.data.to, lastWeek.to);
});

test('R1-20 and R2-8: the audit trail Excel row takes the plural, the hyphen and "what changed in the books", and keeps the range that was said', async () => {
  const state = await books();
  const excel = (sentence) => toolArgs(state, sentence, 'export_xlsx');
  for (const sentence of ['export the audit logs to excel', 'export audit-trail to excel', 'export the audit trails to excel', 'export edit logs to excel', 'export the change logs to excel', 'save the change-log as a spreadsheet']) {
    assert.deepEqual(excel(sentence), { report: 'audit_trail' }, sentence);
  }
  assert.deepEqual(excel('what changed in the books in excel'), { report: 'audit_trail' });
  assert.deepEqual(excel('what changed in the books last month in excel'), { report: 'audit_trail', period: 'last-month' });
  assert.deepEqual(excel('export what changed in the books for 2026-10 to excel'), { report: 'audit_trail', period: '2026-10' });
  assert.deepEqual(excel('audit trail for last quarter in excel'), { report: 'audit_trail', ...previousQuarter(TODAY) });
  assert.deepEqual(excel('audit trail for fy 2025-26 in excel'), { report: 'audit_trail', from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(excel('audit trail last week in excel'), { report: 'audit_trail', from: shiftDay(mondayOf(TODAY), -7), to: shiftDay(mondayOf(TODAY), -1) });
  assert.deepEqual(excel('audit trail from 2026-09-01 to 2026-09-30 in excel'), { report: 'audit_trail', from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(excel('audit trail for October in excel'), { report: 'audit_trail', period: '2026-10' });
  assert.deepEqual(excel('audit trail in excel'), { report: 'audit_trail' });
  const unread = plan(state, 'audit trail for the last 3 months in excel');
  assert.equal(unread.kind, 'reply', words(unread));
  assert.match(unread.reply, /could not read that date range/);
  const saved = await chat(state, 'export the audit logs to excel');
  assert.match(saved.reply, /^Saved myca-audit-trail-/, saved.reply);
  assert.equal(saved.tools[0].result.data.report, 'audit_trail');
});

test('R1-21 and R2-10: 26AS, TDS receivable and IMS words reach their own Excel report, and IMS with 2B still wins over credit at risk', async () => {
  const state = await books();
  const excel = (sentence) => toolArgs(state, sentence, 'export_xlsx');
  for (const sentence of [
    'reconcile 26AS in excel',
    'reconcile 26 AS in excel',
    'export 26 AS reconciliation to excel',
    'export 26AS entries to excel',
    'export 26AS ledger to excel',
    'export 26AS vouchers to excel',
    'export tds receivable to excel',
    'export outstanding tds credits to excel',
    'excel of 26as',
  ]) assert.deepEqual(excel(sentence), { report: 'tds_credit_check' }, sentence);
  for (const sentence of [
    'export ims entries to excel',
    'export ims journal to excel',
    'export ims bank to excel',
    'export ims credit notes to excel',
    'export ims debit notes to excel',
    'ims in excel',
    'ims for gstr-2b in excel',
    'ims for 2b in excel',
    'export invoice management entries to excel',
  ]) assert.deepEqual(excel(sentence), { report: 'ims_review', period: '2026-09' }, sentence);
  assert.deepEqual(excel('gstr-2b in excel'), { report: 'credit_at_risk' });
  assert.deepEqual(excel('2b in excel'), { report: 'credit_at_risk' });
  assert.deepEqual(excel('credit at risk in excel'), { report: 'credit_at_risk' });

  assert.deepEqual(excel('bank reconciliation in excel'), { report: 'bank_reconciliation' });
  assert.deepEqual(excel('export bank statement reconciliation to excel'), { report: 'bank_reconciliation' });
  assert.deepEqual(excel('export entries to excel'), { report: 'entries' });
  assert.deepEqual(excel('export the journal to excel'), { report: 'day_book' });
  assert.deepEqual(excel('export credit notes to excel'), { report: 'credit_notes' });
  assert.deepEqual(excel('customer dues in excel'), { report: 'customer_dues' });
  assert.deepEqual(excel('export what customers owe to excel'), { report: 'customer_dues' });
  assert.deepEqual(excel('tds summary in excel'), { report: 'tds_summary' });
  assert.deepEqual(excel('trial balance in excel'), { report: 'trial_balance' });
  assert.deepEqual(excel('reconcile gst in excel'), { report: 'gst_period_summary' });
});

test('R1-22: a customer that deducted TDS in any word order is recorded, and a 26AS question is not taken for a TDS return (already fixed by round 1)', async () => {
  const state = await books();
  assert.deepEqual(toolArgs(state, 'Kiran Stores deducted 2000 TDS from INV-0001 under 194J', 'record_tds_withheld'), { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.deepEqual(toolArgs(state, 'deducted 2000 tds on INV-0001 under 194J', 'record_tds_withheld'), { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.deepEqual(toolArgs(state, 'customer deducted 2000 tds on INV-0001', 'record_tds_withheld'), { invoiceId: 'INV-0001', amount: 2000 });
  assert.deepEqual(toolArgs(state, 'Kiran Stores deducted tds 2000 from INV-0001 under 194J', 'record_tds_withheld'), { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.deepEqual(toolArgs(state, 'review tds against 26AS', 'tds_credit_check'), {});
  assert.deepEqual(toolArgs(state, 'compare my tds statement with 26AS', 'tds_credit_check'), {});
  const held = await chat(state, 'Kiran Stores deducted 2000 TDS from INV-0001 under 194J');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.tool, 'record_tds_withheld');
  await chat(state, 'no');
});

test('R2-9: the 26AS check is not refused for the words imported or importing, and an import request still answers with the attach prompt', async () => {
  const state = await books();
  for (const sentence of ['check the imported 26AS against my books', 'verify the 26AS I imported', 'check my imported 26AS', 'did the imported 26AS match my books?', 'compare the imported 26AS with my books', 'compare my books with 26AS']) {
    assert.deepEqual(toolArgs(state, sentence, 'tds_credit_check'), {}, sentence);
  }
  for (const sentence of ['import 26AS', 'import form 26AS', 'upload 26AS', 'upload Form 26AS', 'import 26AS and check it', 'import the 26AS and check it against my books', 'please upload my 26AS']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.match(out.reply, /Attach Form 26AS/, sentence);
  }
  state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking\n194C,KIRAN STORES,MUMK12345B,50000,500,2026-10-20' };
  assert.equal(plan(state, 'upload 26AS').name, 'import_26as_credits');
});

test('R1-23a: the left-out rows of a Form 26AS import are counted in the singular and the plural in the blocker, the preview and the done sentence', async () => {
  const header = 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking';
  const good = '194C,KIRAN STORES,MUMK12345B,50000,500,2026-10-20';
  const cases = [
    { csv: [header, good, 'ZZZ,UNKNOWN LLP,UNKN12345B,75000,1500,2026-09-15'].join('\n'), left: /; 1 row with no readable section left out\./ },
    { csv: [header, good, 'ZZZ,UNKNOWN LLP,UNKN12345B,75000,1500,2026-09-15', ',OTHER LLP,OTHR12345B,75000,1500,2026-09-16'].join('\n'), left: /; 2 rows with no readable section left out\./ },
  ];
  for (const { csv, left } of cases) {
    const state = await books();
    state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: csv };
    const held = await chat(state, 'import 26AS');
    assert.equal(held.awaitingConfirmation, true, held.reply);
    assert.match(held.reply, /^Form 26AS: 1 entry totalling ₹500\.00 \(194C 1\)/, held.reply);
    assert.match(held.reply.split('\n')[0], left, held.reply);
    const done = await chat(state, 'yes');
    assert.equal(done.posted, true, done.reply);
    assert.match(done.reply, left, done.reply);
  }
  for (const [rows, wanted] of [[['ZZZ,UNKNOWN LLP,UNKN12345B,75000,1500,2026-09-15'], /\(1 row had no section I can read\)/], [['ZZZ,UNKNOWN LLP,UNKN12345B,75000,1500,2026-09-15', ',OTHER LLP,OTHR12345B,75000,1500,2026-09-16'], /\(2 rows had no section I can read\)/]]) {
    const state = await books();
    state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: [header, ...rows].join('\n') };
    const out = await chat(state, 'import 26AS');
    assert.notEqual(out.awaitingConfirmation, true, out.reply);
    assert.match(out.reply, /No row with a readable section could be read/, out.reply);
    assert.match(out.reply, wanted, out.reply);
  }
});

test('R1-23b: micro, small and medium are read from the MSME sentence, and a malformed Udyam number is still refused in words', async () => {
  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  const udyam = 'UDYAM-MH-12-1234567';
  assert.deepEqual(terms(`Fabric Co is MSME Udyam ${udyam} small 30 days`), { partyName: 'Fabric Co', msme: true, udyam, category: 'small', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME, small, 30 days'), { partyName: 'Fabric Co', msme: true, category: 'small', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME small 30 days'), { partyName: 'Fabric Co', msme: true, category: 'small', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME, 30 days, small'), { partyName: 'Fabric Co', msme: true, category: 'small', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME (medium)'), { partyName: 'Fabric Co', msme: true, category: 'medium' });
  assert.deepEqual(terms('mark Fabric Co as MSME micro'), { partyName: 'Fabric Co', msme: true, category: 'micro' });
  assert.deepEqual(terms('Fabric Co is a micro enterprise, 30 days'), { partyName: 'Fabric Co', msme: true, category: 'micro', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME, medium category, 30 days'), { partyName: 'Fabric Co', msme: true, category: 'medium', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME, 30 days'), { partyName: 'Fabric Co', msme: true, days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME, small instalments agreed, 30 days'), { partyName: 'Fabric Co', msme: true, days: 30 }, 'a word after "small" that is not a category keeps the sentence as it was');
  assert.deepEqual(terms('Small Mills is MSME, 30 days'), { partyName: 'Small Mills', msme: true, days: 30 }, 'a supplier called Small is not a category');

  const held = await chat(state, `Fabric Co is MSME Udyam ${udyam} small 30 days`);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, new RegExp(`Mark Fabric Co as an MSME supplier \\(small, Udyam ${udyam}\\) to be paid within 30 days`), held.reply);
  await chat(state, 'no');

  for (const sentence of ['Fabric Co is MSME Udyam UDYAM-MH-12-123 small 30 days', 'Fabric Co is MSME udyam 123456 micro', 'Fabric Co is MSME UDYAM-MH-12-123 small']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.equal(out.reply, 'A Udyam number looks like UDYAM-XX-00-0000000.', sentence);
  }
});

test('R1-23c: the MSME preview promises the reminder only to an India book', async () => {
  const india = await books();
  const inIndia = await chat(india, 'Fabric Co is MSME, 30 days');
  assert.equal(inIndia.awaitingConfirmation, true, inIndia.reply);
  assert.match(inIndia.reply, /MyCA reminds you a week before it/, inIndia.reply);
  const abroad = usBooks();
  const inUs = await chat(abroad, 'Fabric Co is MSME, 30 days');
  assert.equal(inUs.awaitingConfirmation, true, inUs.reply);
  assert.match(inUs.reply, /Mark Fabric Co as an MSME supplier/, inUs.reply);
  assert.doesNotMatch(inUs.reply, /remind/i, inUs.reply);
  assert.match(inUs.reply, /New bills from them get a pay-by date 30 days from the bill date\. Nothing is posted\./, inUs.reply);
});

test('R1-23d: the 26AS check ends with its source as a sentence, not as a bare lowercase line', async () => {
  const state = await books();
  const none = await chat(state, 'check 26AS against the books');
  assert.equal(none.tools[0].name, 'tds_credit_check');
  assert.equal(none.reply.split('\n').at(-1), 'No 26AS imported yet.', none.reply);
  state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking\n194C,KIRAN STORES,MUMK12345B,50000,500,2026-10-20' };
  const waiting = await chat(state, 'check the 26AS file I attached');
  assert.match(waiting.reply, /not been imported/, waiting.reply);
  assert.equal(waiting.reply.split('\n').at(-1), 'No 26AS imported yet.', waiting.reply);
  const held = await chat(state, 'import 26AS');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal((await chat(state, 'yes')).posted, true);
  const after = await chat(state, 'check 26AS against the books');
  assert.match(after.reply.split('\n').at(-1), /^26AS imported .*\.$/, after.reply);
});

test('R1-23e: an audit trail asked only up to a date says "the start", not an empty date', async () => {
  const state = await books();
  const out = await chat(state, 'audit trail until 2026-10-31');
  assert.equal(out.tools[0].name, 'audit_trail');
  assert.deepEqual(out.tools[0].result.data.from, '');
  assert.match(out.reply, /^0 changes between the start and 31 October 2026, log chain verified/, out.reply);
  assert.doesNotMatch(out.reply, /between\s+and/, out.reply);
  const range = await chat(state, 'audit trail from 2026-10-01 to 2026-10-31');
  assert.match(range.reply, /^0 changes between 1 October 2026 and 31 October 2026/, range.reply);
});

test('set_supplier_bank takes the same long supplier name that set_supplier_terms takes', async () => {
  const long = 'Hindustan Unilever Consumer Products Distribution Cooperative Marketing Federation Limited Pune';
  assert.ok(long.length > 80 && long.length < 120);
  const terms = validateAssistantToolCall('set_supplier_terms', { partyName: long, days: 30 });
  const bank = validateAssistantToolCall('set_supplier_bank', { partyName: long, account: '123456789012', ifsc: 'HDFC0001234' });
  assert.equal(terms.ok, true, JSON.stringify(terms));
  assert.equal(bank.ok, true, JSON.stringify(bank));
  const state = await books({ with2b: false });
  bill(state, long, '27AABCT1332L1ZE', 'LONG-1', '2026-09-20', 10000, 5);
  const set = await runTool(state, 'set_supplier_bank', { partyName: long, account: '123456789012', ifsc: 'HDFC0001234' });
  assert.equal(set.ok, true, JSON.stringify(set));
  const marked = await runTool(state, 'set_supplier_terms', { partyName: long, msme: true, days: 30 });
  assert.equal(marked.ok, true, JSON.stringify(marked));
  assert.equal(validateAssistantToolCall('set_supplier_bank', { partyName: 'x'.repeat(300), account: '123456789012', ifsc: 'HDFC0001234' }).ok, validateAssistantToolCall('set_supplier_terms', { partyName: 'x'.repeat(300), days: 30 }).ok, 'the two tools agree on any length');
});

test('the new chat readings stay fast on a 2,000-character message of spaces and of repeated words', async () => {
  const state = await books();
  const messages = [
    ' '.repeat(2000),
    `audit trail by${' '.repeat(1980)}`,
    `ims${' '.repeat(1990)}`,
    `audit trail ${'by '.repeat(660)}`,
    `audit trail ${'last '.repeat(390)}`,
    `audit trail ${'limit 5 '.repeat(250)}`,
    `audit trail ${'by Priya '.repeat(220)}`,
    `audit trail ${'last quarter '.repeat(150)}`,
    `what changed in the books ${'last week '.repeat(190)}`,
    `accept all matched in ims ${'from '.repeat(390)}`,
    `accept all matched in ims ${'except Fabric Co '.repeat(115)}`,
    `accept ${'only '.repeat(390)}matched in ims`,
    `remind me to ${'audit trail '.repeat(160)}`,
    `export audit trail to excel ${'for '.repeat(380)}`,
    `export ${'26 AS '.repeat(320)}to excel`,
    `export ${'ims '.repeat(480)}to excel`,
    `received ${'5000 '.repeat(390)}against INV-0001`,
    `paid Fabric Co ${'4000 '.repeat(390)}`,
    `Fabric Co is MSME ${'small '.repeat(320)}`,
    `Fabric Co is MSME ${'30 days '.repeat(240)}`,
    `upload ${'26AS '.repeat(380)}`,
  ];
  for (const message of messages) {
    const started = process.hrtime.bigint();
    planLocalToolCall(state, message);
    const took = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(took < 1000, `${message.slice(0, 40).trim()}... took ${took} ms`);
  }
});
