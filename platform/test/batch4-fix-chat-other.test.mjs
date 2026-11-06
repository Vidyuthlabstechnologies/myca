import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, billOutstanding } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { planPaymentFromChat } from '../src/payment-intent.mjs';
import { supplierTerms, supplierDues } from '../src/supplier-dues.mjs';
import { saidPeriod } from '../src/filing-intent.mjs';
import { inWords } from '../src/words.mjs';
import { localToday } from '../src/dates.mjs';

const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const TWO_B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-10-2026,10000,250,250,0,0,10500,Y',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-10-2026,5000,0,0,600,0,5600,Y',
].join('\n');
const UDYAM = 'UDYAM-MH-12-1234567';
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

function lastMonthOf(today) {
  const [year, month] = today.split('-').map(Number);
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
  sale(state, 'IMS Traders', 30000, '2026-10-07');
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-10-05', 10000, 5);
  bill(state, 'Acme Steel', '27AAACA1234B1Z9', 'A-1', '2026-10-08', 20000, 18);
  bill(state, 'IMS Logistics', '29AABCI1234J1ZL', 'IL-1', '2026-10-10', 7000, 18);
  if (with2b) {
    const added = await runTool(state, 'import_gstr2b', { period: '2026-10', csv: TWO_B, fileName: 'GSTR2B_102026.csv' });
    assert.equal(added.ok, true, JSON.stringify(added));
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

test('routing-5: an Excel sentence that names a party called IMS exports the report it asked for, and "ims in excel" still exports the IMS sheet', async () => {
  const state = await books();
  const excel = (sentence) => toolArgs(state, sentence, 'export_xlsx');
  assert.deepEqual(excel('export dues of IMS Traders to excel'), { report: 'customer_dues' });
  assert.deepEqual(excel('customer dues for IMS Traders in excel'), { report: 'customer_dues' });
  assert.deepEqual(excel('excel of what IMS Traders owes'), { report: 'customer_dues' });
  assert.deepEqual(excel('sales to IMS Traders in excel'), { report: 'sales' });
  assert.deepEqual(excel('excel of purchases from IMS Logistics'), { report: 'purchases' });
  assert.deepEqual(excel('ims in excel'), { report: 'ims_review', period: '2026-10' });
  assert.deepEqual(excel('ims review in excel for 2026-10'), { report: 'ims_review', period: '2026-10' });
  const saved = await chat(state, 'export dues of IMS Traders to excel');
  assert.match(saved.reply, /^Saved myca-customer-dues-\d{4}-\d{2}-\d{2}\.xlsx with \d+ rows?\./, saved.reply);
  assert.equal(saved.tools[0].name, 'export_xlsx');
  assert.equal(saved.tools[0].result.data.report, 'customer_dues');
});

test('routing-6: a sentence that marks a supplier MSME is understood before the GST-rate demand, in every form it is said', async () => {
  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  assert.deepEqual(terms(`mark Acme Steel as an MSME supplier with Udyam number ${UDYAM}, 30 days`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM, days: 30 });
  assert.deepEqual(terms('Acme Steel is an MSME supplier, 30 days'), { partyName: 'Acme Steel', msme: true, days: 30 });
  assert.deepEqual(terms('our supplier Acme Steel is MSME, 30 days'), { partyName: 'Acme Steel', msme: true, days: 30 });
  assert.deepEqual(terms('mark supplier Acme Steel as MSME, 30 days'), { partyName: 'Acme Steel', msme: true, days: 30 });
  assert.deepEqual(terms(`Fabric Co is an MSME supplier, ${UDYAM}, 45 days`), { partyName: 'Fabric Co', msme: true, udyam: UDYAM, days: 45 });
  assert.deepEqual(terms('mark Acme Steel as an MSME supplier'), { partyName: 'Acme Steel', msme: true });
  assert.deepEqual(terms('mark Acme Steel as MSME'), { partyName: 'Acme Steel', msme: true });
  assert.deepEqual(terms('Unknown Supplier is MSME, 30 days'), { partyName: 'Unknown', msme: true, days: 30 });
  assert.deepEqual(terms(`supplier terms for Acme Steel: MSME, udyam ${UDYAM}, 30 days`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM, days: 30 });
  assert.deepEqual(terms('update the supplier terms of Fabric Co: MSME, 30 days'), { partyName: 'Fabric Co', msme: true, days: 30 });
  assert.deepEqual(terms('supplier terms for Fabric Co 30 days'), { partyName: 'Fabric Co', days: 30 });
  assert.deepEqual(terms('vendor terms of Acme Steel are net 30'), { partyName: 'Acme Steel', days: 30 });
  assert.deepEqual(terms('supplier terms for Fabric Co MSME 30 days'), { partyName: 'Fabric Co', msme: true, days: 30 });
  assert.deepEqual(terms('supplier terms for Fabric Co payable in 30 days'), { partyName: 'Fabric Co', days: 30 });
  assert.deepEqual(terms('supplier terms for Fabric Co Mumbai 30 days'), { partyName: 'Fabric Co Mumbai', days: 30 }, 'a longer name is not the supplier it starts with');
  assert.deepEqual(terms('supplier terms for Zenith Dyes 30 days'), { partyName: 'Zenith Dyes', days: 30 });
  for (const sentence of ['supplier terms for Fabric Co', 'supplier terms for Fabric Co is not MSME', 'supplier terms for Fabric Co, not MSME, 30 days', 'supplier terms for Fabric Co: non-MSME, 30 days', 'supplier terms for Fabric Co not MSME, 30 days', 'supplier terms for Zenith Dyes MSME 30 days']) {
    const out = plan(state, sentence);
    assert.equal(out.fallback, true, `${sentence} is left unread, never read the other way round: ${JSON.stringify(out)}`);
  }
  const unread = await chat(await books(), 'supplier terms for Fabric Co is not MSME');
  assert.equal(unread.awaitingConfirmation, undefined, unread.reply);
  assert.match(unread.reply, /did not match that to anything I can do, so nothing was recorded/);
  for (const sentence of ['supplier terms for Fabric Co', 'supplier Acme Steel msme 30 days', 'Acme Steel supplier msme 30 days', 'our supplier Acme Steel is registered under MSME, 30 days']) {
    assert.doesNotMatch(plan(state, sentence).reply || '', /GST rate/, `${sentence} is not an invoice, so it is not asked for a GST rate`);
  }
  for (const sentence of ['my supplier is MSME', 'the supplier is MSME', 'my udyam is UDYAM-MH-12-1234567']) {
    assert.notEqual(plan(state, sentence).name, 'set_supplier_terms', `${sentence} names no supplier`);
  }
  for (const sentence of ['bill from Fabric Co 10000 GST 5%, Fabric Co is an MSME', 'bill from Acme Steel 5000 GST 18% Acme Steel udyam UDYAM-MH-12-1234567', 'Acme Steel is an MSME, invoice them 5000 GST 18%', 'Fabric Co 10000 GST 5% is an MSME']) {
    assert.notEqual(plan(state, sentence).name, 'set_supplier_terms', `${sentence} posts something, so it is not read as a statement about terms`);
  }
  assert.equal(toolArgs(state, 'bill from Fabric Co 10000 GST 5%, Fabric Co is an MSME', 'create_purchase').lines[0].rate, 10000);
  for (const sentence of ['mark Acme Steel as an MSME supplier with Udyam number UDYAM-MH-12-1234567, 30 days', 'Acme Steel is an MSME supplier, 30 days', 'Fabric Co is an MSME supplier, UDYAM-MH-12-1234567, 45 days']) {
    assert.equal(validateAssistantToolCall('set_supplier_terms', plan(state, sentence).args).ok, true, sentence);
  }

  const asked = await chat(state, `mark Acme Steel as an MSME supplier with Udyam number ${UDYAM}, 30 days`);
  assert.equal(asked.awaitingConfirmation, true, asked.reply);
  assert.match(asked.reply, /Mark Acme Steel as an MSME supplier \(category not given, Udyam UDYAM-MH-12-1234567\) to be paid within 30 days/);
  assert.doesNotMatch(asked.reply, /GST rate/);

  assert.equal(plan(state, 'invoice Udyam Enterprises 20000 GST 18%').name, 'create_invoice', 'a customer called Udyam is still invoiced');
  assert.equal(plan(state, 'bill from MSME Traders 10000 GST 18%').name, 'create_purchase', 'a supplier called MSME is still billed');
});

test('routing-7: the terms are saved under the real supplier, and a Udyam number, the days and the category are read wherever they are written', async () => {
  const mine = await books();
  const first = await chat(mine, 'my supplier Fabric Co is MSME');
  assert.equal(first.awaitingConfirmation, true, first.reply);
  assert.match(first.reply, /^Mark Fabric Co as an MSME supplier/);
  const yes = await chat(mine, 'yes');
  assert.equal(yes.posted, true, yes.reply);
  assert.deepEqual(Object.keys(mine.supplierTerms), ['gstin:27AABCT1332L1ZE']);
  assert.equal(supplierTerms(mine, { name: 'Fabric Co', gstin: '27AABCT1332L1ZE' }).msme, true);
  assert.equal(supplierDues(mine, { asOf: '2026-10-20' }).data.msme.count, 1, 'the real Fabric Co bill is the MSME one');
  const dues = await chat(mine, 'msme dues');
  assert.doesNotMatch(dues.reply, /No supplier is marked as an MSME/);

  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  assert.deepEqual(terms('Acme Steel supplier is MSME, net 30'), { partyName: 'Acme Steel', msme: true, days: 30 });
  assert.deepEqual(terms(`Acme Steel is MSME with Udyam number ${UDYAM}`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM });
  assert.deepEqual(terms(`Fabric Co is an MSME supplier with Udyam ${UDYAM}`), { partyName: 'Fabric Co', msme: true, udyam: UDYAM });
  assert.deepEqual(terms(`Acme Steel is MSME, 30 days, ${UDYAM}`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM, days: 30 });
  assert.deepEqual(terms('acme steel is msme, udyam-mh-12-1234567, net 20'), { partyName: 'Acme Steel', msme: true, udyam: UDYAM, days: 20 });
  assert.deepEqual(terms(`Acme Steel ${UDYAM} is MSME`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM });
  assert.deepEqual(terms('Fabric Co is micro enterprise'), { partyName: 'Fabric Co', msme: true, category: 'micro' });
  assert.deepEqual(terms('Fabric Co is a small enterprise, 40 days'), { partyName: 'Fabric Co', msme: true, category: 'small', days: 40 });
  assert.deepEqual(terms('Fabric Co is a medium enterprise'), { partyName: 'Fabric Co', msme: true, category: 'medium' });
  assert.deepEqual(terms('Fabric Co is an MSME supplier, medium category'), { partyName: 'Fabric Co', msme: true, category: 'medium' });
  assert.deepEqual(terms('Small Traders Ltd is an MSME, 20 days'), { partyName: 'Small Traders Ltd', msme: true, days: 20 }, 'a word in the name is not the category');
  assert.deepEqual(terms("Steel Co's udyam number is UDYAM-GJ-01-0000001"), { partyName: 'Steel Co', msme: true, udyam: 'UDYAM-GJ-01-0000001' });
  assert.deepEqual(terms(`Acme Steel has udyam ${UDYAM}`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM });
  assert.deepEqual(terms(`set Fabric Co udyam ${UDYAM}`), { partyName: 'Fabric Co', msme: true, udyam: UDYAM });
  assert.deepEqual(terms(`Fabric Co msme udyam ${UDYAM}`), { partyName: 'Fabric Co', msme: true, udyam: UDYAM });
  assert.notEqual(plan(state, `set udyam ${UDYAM} for Fabric Co`).name, 'set_supplier_terms', 'a verb is not the supplier');
  assert.deepEqual(terms(`my supplier Acme Steel has udyam ${UDYAM} and 30 days`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM, days: 30 });
  assert.deepEqual(terms(`Acme Steel's udyam number is ${UDYAM}, small category, 20 days`), { partyName: 'Acme Steel', msme: true, udyam: UDYAM, category: 'small', days: 20 });
  assert.deepEqual(terms('Fabric Co is MSME, 1000 days'), { partyName: 'Fabric Co', msme: true, days: 1000 });
  assert.deepEqual(terms('Since Fabric Co is MSME we pay in 30 days'), { partyName: 'Fabric Co', msme: true, days: 30 });
  assert.deepEqual(terms('As Acme Steel is MSME, pay within 30 days'), { partyName: 'Acme Steel', msme: true, days: 30 });
  for (const sentence of ['mark all suppliers as MSME', 'mark Fabric Co as MSME and Acme Steel as MSME', 'all vendors are MSME']) {
    assert.notEqual(plan(state, sentence).name, 'set_supplier_terms', `${sentence} does not name one supplier`);
  }

  const refused = await chat(state, 'Fabric Co is MSME, 1000 days');
  assert.equal(refused.awaitingConfirmation, undefined, 'a silly number of days is not held for a yes');
  assert.equal(refused.blocked, true);
  assert.notEqual(refused.posted, true);
  assert.deepEqual(Object.keys(state.supplierTerms || {}), [], 'nothing was saved');
  assert.doesNotMatch(refused.reply, RAW_CODE);

  const BAD_UDYAM = 'A Udyam number looks like UDYAM-XX-00-0000000.';
  for (const sentence of ['Acme Steel is MSME udyam UDYAM-MH-12-123', 'Acme Steel is MSME, Udyam number 12345', 'Fabric Co is an MSME supplier with Udyam UDYAM-MH-12-12345678']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${JSON.stringify(out)}`);
    assert.equal(out.reply, BAD_UDYAM, sentence);
    assert.deepEqual(out.tools, []);
  }
  const named = plan(state, 'Udyam Enterprises is MSME, 30 days');
  assert.equal(named.kind, 'tool', 'a supplier called Udyam is not a malformed number');
  assert.deepEqual(named.args, { partyName: 'Udyam Enterprises', msme: true, days: 30 });
});

test('routing-8: the audit trail reads the dates, the financial year and the days it was asked for, and says so when it cannot', async () => {
  const state = await books();
  const audit = (sentence) => {
    const args = toolArgs(state, sentence, 'audit_trail');
    assert.equal(validateAssistantToolCall('audit_trail', args).ok, true, sentence);
    return args;
  };
  assert.deepEqual(audit('audit trail from 2026-10-01 to 2026-10-31'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(audit('audit trail between 2026-10-01 and 2026-10-31'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(audit('show the audit trail 2026-10-05 to 2026-10-20'), { from: '2026-10-05', to: '2026-10-20' });
  assert.deepEqual(audit('audit trail since 2026-10-01'), { from: '2026-10-01' });
  assert.deepEqual(audit('audit trail until 2026-10-31'), { to: '2026-10-31' });
  assert.deepEqual(audit('audit trail 2026-10-15'), { from: '2026-10-15', to: '2026-10-15' });
  assert.deepEqual(audit('audit trail today'), { from: TODAY, to: TODAY });
  assert.deepEqual(audit('audit trail yesterday'), { from: shiftDay(TODAY, -1), to: shiftDay(TODAY, -1) });
  assert.deepEqual(audit('audit trail since yesterday'), { from: shiftDay(TODAY, -1) });
  assert.deepEqual(audit('audit trail this week'), { from: mondayOf(TODAY), to: TODAY });
  assert.deepEqual(audit('audit trail for the last 30 days'), { from: shiftDay(TODAY, -30), to: TODAY });
  assert.deepEqual(audit('who changed what in the last 7 days'), { from: shiftDay(TODAY, -7), to: TODAY });
  assert.deepEqual(audit('audit trail for FY 2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail for financial year 2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail fy2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail F.Y. 2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail for FY 25-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail for 2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail for FY 2025-2026'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(audit('audit trail from 1 October 2026 to 31 October 2026'), { from: '2026-10-01', to: '2026-10-31' }, 'the example in the reply, as it is shown');
  assert.deepEqual(audit('audit trail from 15/10/2026 to 20/10/2026'), { from: '2026-10-15', to: '2026-10-20' });
  assert.deepEqual(audit('audit trail from 2026-10-01 to today'), { from: '2026-10-01', to: TODAY });
  assert.deepEqual(audit('audit trail before 2026-10-15'), { to: '2026-10-14' });
  assert.deepEqual(audit('audit trail after 2026-10-15'), { from: '2026-10-16' });
  assert.deepEqual(audit('audit trail everything since 2026-10-01'), { from: '2026-10-01', view: 'all' });
  assert.deepEqual(audit('audit trail for 2026-10'), { period: '2026-10' }, 'a month still goes as a period');
  assert.deepEqual(audit('audit trail for October'), { period: saidPeriod('October') });
  assert.deepEqual(audit('audit trail last month'), { period: 'last-month' });
  assert.deepEqual(audit('audit trail for this year'), { period: 'this-year' });
  assert.deepEqual(audit('audit trail'), {});

  const unreadable = [
    'audit trail from 2026-13-45 to 2026-14-99',
    'audit trail from 2026-10-31 to 2026-10-01',
    'audit trail for FY 2025-27',
    'audit trail for FY 2026',
    'audit trail from 5 October to 20 October',
    'audit trail for 15 october',
    'audit trail last week',
    'audit trail for the last 3 months',
    'audit trail for the last 0 days',
    'audit trail from 31/02/2026',
    'audit trail from 2026-10-01 to 2026-10-15 to 2026-10-31',
    'audit trail today this month',
    'audit trail for Q2',
    'audit trail for the last quarter',
    'audit trail since monday',
    'audit trail from last friday',
    'audit trail 2026',
    'audit trail for october and november',
  ];
  for (const sentence of unreadable) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${JSON.stringify(out)}`);
    assert.deepEqual(out.tools, []);
    assert.match(out.reply, /could not read that date range/, sentence);
    assert.match(out.reply, /audit trail from 2026-10-01 to 2026-10-31/, 'the reply shows how to say it');
    assert.doesNotMatch(out.reply, RAW_CODE);
  }

  const said = await chat(state, 'audit trail from 2026-10-01 to 2026-10-31');
  assert.equal(said.tools[0].name, 'audit_trail');
  assert.equal(said.tools[0].result.data.from, '2026-10-01');
  assert.equal(said.tools[0].result.data.to, '2026-10-31');
  assert.match(said.reply, /^0 changes between 1 October 2026 and 31 October 2026, log chain verified \(0 events\)$/);
  const year = await chat(state, 'audit trail for FY 2025-26');
  assert.match(year.reply, /^0 changes between 1 April 2025 and 31 March 2026/, year.reply);
});

test('routing-13: a party whose name holds audit words is posted to, not looked up, and an audit question about IMS goes to the audit trail', async () => {
  const state = await books();
  bill(state, 'Audit Log Systems', '27AAACL1111A1Z1', 'AL-1', '2026-10-03', 5000, 18);
  const posted = {
    'paid 5000 to Audit Trail Consultants': 'post_expense',
    'bill from Audit Log Systems 10000 GST 18%': 'create_purchase',
    'invoice Change Log Technologies 20000 GST 18%': 'create_invoice',
    'paid 2000 to Who Changed It Ltd': 'post_expense',
  };
  for (const [sentence, tool] of Object.entries(posted)) assert.equal(plan(state, sentence).name, tool, sentence);
  const received = plan(state, 'received 5000 from Edit Log Media');
  assert.equal(received.kind, 'reply');
  assert.match(received.reply, /no customer called Edit Log Media/);
  const owed = plan(state, 'how much do I owe Audit Log Systems?');
  assert.notEqual(owed.name, 'audit_trail', 'a supplier called Audit Log Systems is not the audit log');
  assert.match(owed.reply || '', /Audit Log Systems/);

  const held = await chat(state, 'invoice Change Log Technologies 20000 GST 18%');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.tool, 'create_invoice');
  await chat(state, 'no');

  assert.equal(plan(state, 'show the audit trail for IMS decisions').name, 'audit_trail');
  assert.equal(plan(state, 'who changed the IMS decisions').name, 'audit_trail');
  assert.equal(plan(state, 'ims audit trail').name, 'audit_trail');
  assert.equal(plan(state, 'ims').name, 'ims_review');
  assert.equal(plan(state, 'ims for 2026-10').name, 'ims_review');
  assert.equal(plan(state, 'accept all matched invoices in ims for 2026-10').name, 'ims_decide');

  for (const sentence of ['audit trail', 'audit trail for payments to Fabric Co', 'audit trail for receipts from Kiran Stores', 'audit trail for expenses', 'who changed the invoice INV-0001?', 'who changed the books', 'audit log for last month', 'edit log']) {
    assert.equal(plan(state, sentence).name, 'audit_trail', sentence);
  }
  assert.equal(plan(state, 'show me the audit books').name, 'audit_books');
});

test('routing-15: "ims in excel" uses the latest month with a 2B like chat does, and a month with no 2B says so instead of saving an empty file', async () => {
  const state = await books();
  assert.deepEqual(toolArgs(state, 'ims in excel', 'export_xlsx'), { report: 'ims_review', period: '2026-10' });
  assert.deepEqual(toolArgs(state, 'ims review in excel', 'export_xlsx'), { report: 'ims_review', period: '2026-10' });
  assert.deepEqual(toolArgs(state, 'export ims decisions to excel for 2026-10', 'export_xlsx'), { report: 'ims_review', period: '2026-10' });
  const saved = await chat(state, 'ims in excel');
  assert.match(saved.reply, /^Saved myca-ims-review-2026-10\.xlsx with 2 rows\./, saved.reply);

  assert.deepEqual(toolArgs(state, 'export ims to excel from 2026-10-01 to 2026-10-31', 'export_xlsx'), { report: 'ims_review', period: '2026-10' });
  for (const sentence of ['export ims to excel from 2026-09-01 to 2026-09-30', 'ims in excel since 2026-09-01', 'excel of ims until 2026-09-30']) {
    assert.equal(plan(state, sentence).reply, 'Add the GSTR-2B for September 2026 first.', sentence);
  }
  const missing = plan(state, 'export ims decisions to excel for 2026-09');
  assert.equal(missing.kind, 'reply', JSON.stringify(missing));
  assert.equal(missing.reply, 'Add the GSTR-2B for September 2026 first.');
  assert.deepEqual(missing.tools, []);
  const refused = await chat(state, 'export ims decisions to excel for 2026-09');
  assert.equal(refused.reply, 'Add the GSTR-2B for September 2026 first.');
  assert.deepEqual(refused.tools, [], 'nothing was exported');

  const bare = await books({ with2b: false });
  const none = plan(bare, 'ims in excel');
  assert.equal(none.kind, 'reply', JSON.stringify(none));
  assert.equal(none.reply, `Add the GSTR-2B for ${inWords(TODAY.slice(0, 7))} first.`);

  const last = lastMonthOf(TODAY);
  const earlier = await books({ with2b: false });
  const filed = await runTool(earlier, 'import_gstr2b', { period: last, csv: TWO_B });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  assert.deepEqual(toolArgs(earlier, 'ims in excel last month', 'export_xlsx'), { report: 'ims_review', period: last });
  assert.deepEqual(toolArgs(earlier, 'ims in excel', 'export_xlsx'), { report: 'ims_review', period: last });
  assert.equal(plan(earlier, 'ims in excel this month').reply, `Add the GSTR-2B for ${inWords(TODAY.slice(0, 7))} first.`);

  const quarter = plan(state, 'ims review in excel this year');
  assert.equal(quarter.kind, 'tool', 'a period that is not a month is still refused by the report itself');
  assert.deepEqual(quarter.args, { report: 'ims_review', period: 'this-year' });
  const fresh = await runTool(createState(), 'export_xlsx', { report: 'ims_review' });
  assert.equal(fresh.ok, true, 'the report itself still builds on fresh books');
});

test('routing-16: "we pay a supplier in 45 days" states the agreed terms; it is never a payment of 45 rupees', async () => {
  const state = await books();
  const terms = (sentence) => toolArgs(state, sentence, 'set_supplier_terms');
  assert.deepEqual(terms('we pay Acme Steel in 45 days'), { partyName: 'Acme Steel', days: 45 });
  assert.deepEqual(terms('pay Acme Steel within 45 days'), { partyName: 'Acme Steel', days: 45 });
  assert.deepEqual(terms('we pay acme steel within 30 days of the bill date'), { partyName: 'Acme Steel', days: 30 });
  assert.deepEqual(terms('I will pay Acme Steel after 60 days'), { partyName: 'Acme Steel', days: 60 });
  assert.deepEqual(terms('we pay Acme Steel within 30 days of invoice'), { partyName: 'Acme Steel', days: 30 });
  assert.deepEqual(terms('pay Acme Steel within 30 days of the invoice date'), { partyName: 'Acme Steel', days: 30 });
  assert.deepEqual(terms('Fabric Co is MSME, we pay in 30 days'), { partyName: 'Fabric Co', msme: true, days: 30 });

  const held = await chat(state, 'we pay Acme Steel in 45 days');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.tool, 'set_supplier_terms');
  assert.match(held.reply, /Set Acme Steel's terms to 45 days/);
  assert.doesNotMatch(held.reply, /₹45\.00/);
  const yes = await chat(state, 'yes');
  assert.equal(yes.posted, true, yes.reply);
  const acme = state.purchases.find((item) => item.partyName === 'Acme Steel');
  assert.equal(billOutstanding(acme), acme.total, 'no payment was made');
  assert.deepEqual(supplierTerms(state, { name: 'Acme Steel', gstin: '27AAACA1234B1Z9' }), { msme: false, udyam: '', category: '', days: 45 });

  const msme = await books();
  await runTool(msme, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  const long = await chat(msme, 'we pay Fabric Co in 60 days');
  assert.equal(long.awaitingConfirmation, undefined, long.reply);
  assert.match(long.reply, /An MSME supplier must be paid within 45 days/);

  const money = (sentence) => {
    const out = planPaymentFromChat(state, sentence);
    assert.equal(out.kind, 'tool', `${sentence} -> ${JSON.stringify(out)}`);
    assert.equal(out.name, 'record_payment');
    return out.args.amount;
  };
  assert.equal(money('paid Acme Steel 5000'), 5000);
  assert.equal(money('pay Acme Steel 5000 within 45 days'), 5000, 'the days are not an amount, the 5000 is');
  assert.equal(money('paid Acme Steel 5000, they gave us 45 days'), 5000);
  assert.equal(plan(state, 'pay Acme Steel 5000 within 45 days').args.amount, 5000);
  assert.equal(plan(state, 'paid Acme Steel 23600').args.amount, 23600);
  assert.match(plan(state, 'should we pay Acme Steel within 45 days?').reply, /You owe Acme Steel/, 'a question is still only answered');
  assert.notEqual(plan(state, 'pay rent within 5 days').name, 'set_supplier_terms', 'only a supplier in the books gets terms');
  assert.notEqual(plan(state, 'we pay Zenith Dyes in 30 days').name, 'set_supplier_terms');
});

test('routing-10 (Excel): the 26AS workbook is for the financial year that was named', async () => {
  const state = await books();
  const fy = { report: 'tds_credit_check', from: '2025-04-01', to: '2026-03-31' };
  for (const sentence of ['excel of 26as for FY 2025-26', '26AS check in excel for FY 2025-26', 'export the 26as check to excel for financial year 2025-26', 'excel of 26as for F.Y. 2025-26', 'excel of 26as fy 25-26', 'excel of 26as 2025-26']) {
    assert.deepEqual(toolArgs(state, sentence, 'export_xlsx'), fy, sentence);
  }
  assert.deepEqual(toolArgs(state, 'excel of 26as for FY 2024-25', 'export_xlsx'), { report: 'tds_credit_check', from: '2024-04-01', to: '2025-03-31' });
  assert.deepEqual(toolArgs(state, 'excel of 26as', 'export_xlsx'), { report: 'tds_credit_check' });
  assert.deepEqual(toolArgs(state, 'excel of 26as for last year', 'export_xlsx'), { report: 'tds_credit_check', period: 'last-year' });
  assert.deepEqual(toolArgs(state, 'excel of 26as from 2025-04-01 to 2026-03-31', 'export_xlsx'), fy);
  assert.deepEqual(toolArgs(state, 'excel of sales for FY 2025-26', 'export_xlsx'), { report: 'sales' }, 'only the 26AS check turns a financial year into dates');
  const built = await runTool(state, 'export_xlsx', toolArgs(state, 'excel of 26as for FY 2025-26', 'export_xlsx'));
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(built.data.period, 'FY 2025-26');
  const asked = await chat(state, '26AS check in excel for FY 2025-26');
  assert.equal(asked.tools[0].result.data.period, 'FY 2025-26');
});

test('IMS chat: a sentence about rows that are not matched never selects the matched rows', async () => {
  const state = await books();
  const negative = [
    'reject all not-matched invoices in ims for 2026-10',
    'reject all non-matched invoices in ims for 2026-10',
    'reject all non matched invoices in ims for 2026-10',
    "reject everything that isn't matched in ims for 2026-10",
    'reject everything that isn’t matched in ims for 2026-10',
    "reject all invoices that aren't matched in ims for 2026-10",
    "reject all invoices that weren't matched in ims for 2026-10",
    "reject all invoices that wasn't matched in ims for 2026-10",
    "reject all invoices that didn't get matched in ims for 2026-10",
    "reject all invoices that doesn't match in ims for 2026-10",
    'reject all invoices with no match in ims for 2026-10',
    'reject all not yet matched invoices in ims for 2026-10',
    'reject all unmatched invoices in ims for 2026-10',
    'reject all mismatched invoices in ims for 2026-10',
  ];
  for (const sentence of negative) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'tool', `${sentence} -> ${JSON.stringify(out)}`);
    assert.equal(out.name, 'ims_review', sentence);
    assert.deepEqual(out.args, { period: '2026-10' }, sentence);
  }
  assert.deepEqual(toolArgs(state, 'reject all matched invoices in ims for 2026-10', 'ims_decide'), { period: '2026-10', select: 'matched', decision: 'reject' });
  assert.deepEqual(toolArgs(state, 'accept all matched invoices in ims for 2026-10', 'ims_decide'), { period: '2026-10', select: 'matched', decision: 'accept' });
});

test('IMS chat: only a real return period is taken as the month, and a date or a financial year is not an amount', async () => {
  const state = await books();
  const decide = (sentence) => toolArgs(state, sentence, 'ims_decide');
  assert.deepEqual(decide('accept all matched invoices in ims for FY 2026-27'), { period: '2026-10', select: 'matched', decision: 'accept' });
  assert.deepEqual(decide('accept all matched invoices in ims for 2026-13'), { period: '2026-10', select: 'matched', decision: 'accept' });
  assert.deepEqual(decide('accept all matched invoices in ims for FY 25-26'), { period: '2026-10', select: 'matched', decision: 'accept' });
  assert.deepEqual(decide('accept all matched invoices in ims for 2026-09'), { period: '2026-09', select: 'matched', decision: 'accept' });
  const october = saidPeriod('october');
  assert.deepEqual(decide('accept all matched invoices in ims for 15 october'), { period: october, select: 'matched', decision: 'accept' });
  assert.deepEqual(decide('accept all matched invoices in ims for october 15'), { period: october, select: 'matched', decision: 'accept' });
  assert.deepEqual(decide('accept all matched invoices in ims for 15th of october'), { period: october, select: 'matched', decision: 'accept' });
  assert.deepEqual(toolArgs(state, 'ims for 15 october', 'ims_review'), { period: october });
  assert.deepEqual(toolArgs(state, 'ims for FY 2026-27', 'ims_review'), { period: '2026-10' });
  assert.equal(plan(state, 'invoice IMS Traders 5000 GST 18%').name, 'create_invoice', 'an amount still means a posting');
  assert.equal(plan(state, 'paid 3000 to IMS Traders').name !== 'ims_review', true);
});
