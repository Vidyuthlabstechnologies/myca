import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { propose, confirmPending } from '../src/router.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { localToday } from '../src/dates.mjs';

const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const TWO_B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,24AAACF7856R1ZY,GUJARAT MILLS,GM/77,08-09-2026,20000,0,0,3600,0,23600,N',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
].join('\n');

function bill(state, partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate) {
  const out = createPurchase(state, { date, partyName, partyGstin, ...(supplierInvoiceNo ? { supplierInvoiceNo } : {}), lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
}

async function books({ withStatement = true } = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  bill(state, 'Gujarat Mills', '24AAACF7856R1ZY', 'GM/77', '2026-09-08', 20000, 18);
  bill(state, 'Pack House', '29AABCL1234J1ZL', 'PH-9', '2026-09-10', 6000, 12);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-14', 2000, 18);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-4', '2026-09-20', 1000, 18);
  bill(state, 'Box Mart', '27AAACB2222B1Z5', '', '2026-09-16', 1000, 18);
  if (withStatement) await runTool(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B, fileName: 'GSTR2B_092026.csv' });
  return state;
}

test('the draft names only the supplier\'s own bills, dates and amounts, and what is wrong', async () => {
  const state = await books();
  const out = await runTool(state, 'supplier_reminder_draft', { supplier: '27AAACD1111A1Z5', period: '2026-09' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.supplier, 'Dye Works');
  assert.deepEqual(out.data.bills.map((b) => [b.supplierInvoiceNo, b.reason]), [['DW-3', 'NOT_IN_2B'], ['DW-4', 'NOT_IN_2B']]);
  assert.equal(out.data.message, [
    'Hello Dye Works,',
    '',
    'This is Asha Traders (GSTIN 27AABCU9603R1ZN). For September 2026, these bills from you are not showing correctly for us:',
    '• Bill DW-3 dated 14 September 2026, ₹2,360.00: not in our GSTR-2B yet',
    '• Bill DW-4 dated 20 September 2026, ₹1,180.00: not in our GSTR-2B yet',
    '',
    'Please report or correct them in your GSTR-1 so that we can take the input credit. Thank you.',
  ].join('\n'));
  assert.doesNotMatch(out.data.message, /BILL-\d|Fabric|Pack House|input credit of ₹/);
  assert.equal(out.data.timesSent, 0);
});

test('each reason reads plainly to the supplier, and the supplier can be named instead of a GSTIN', async () => {
  const state = await books();
  assert.match((await runTool(state, 'supplier_reminder_draft', { supplier: 'Gujarat Mills', period: '2026-09' })).data.message, /this bill from you is not showing correctly[\s\S]*Bill GM\/77 .*credit marked not available/);
  assert.match((await runTool(state, 'supplier_reminder_draft', { supplier: 'pack house', period: '2026-09' })).data.message, /Bill PH-9 .*with a different amount/);
});

test('no draft without a 2B, for a matched supplier, or when only the owner\'s own bill number is missing', async () => {
  assert.equal((await runTool(await books({ withStatement: false }), 'supplier_reminder_draft', { supplier: 'Dye Works', period: '2026-09' })).error, 'NO_STATEMENT');
  const state = await books();
  assert.equal((await runTool(state, 'supplier_reminder_draft', { supplier: 'Fabric Co', period: '2026-09' })).error, 'NOTHING_TO_ASK');
  const own = await runTool(state, 'supplier_reminder_draft', { supplier: 'Box Mart', period: '2026-09' });
  assert.equal(own.error, 'OWN_GAPS_ONLY');
  assert.match(previewOf(state, 'record_supplier_reminder', { supplier: 'Box Mart', period: '2026-09' }).blockers[0], /missing their supplier bill number/);
});

test('sending is previewed, recorded with the message as sent, and offered again with the last date', async () => {
  const state = await books();
  const edited = 'Hi Dye Works team, please upload DW-3 and DW-4 for September. Thanks, Asha';
  const held = propose(state, 'record_supplier_reminder', { supplier: 'Dye Works', period: '2026-09', message: edited, channel: 'whatsapp' });
  assert.match(held.preview.summary, /^Send a reminder to Dye Works about 2 bills for 2026-09, with ₹540\.00 of your input credit waiting on them\.$/);
  assert.equal((state.supplierReminders || []).length, 0, 'nothing before yes');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.reply, 'Reminder SRM-0001 to Dye Works for 2026-09 is ready to send from your phone. Nothing has gone from MyCA.');
  const [sent] = state.supplierReminders;
  assert.equal(sent.message, edited);
  assert.equal(sent.edited, true);
  assert.equal(sent.channel, 'whatsapp');
  assert.deepEqual(sent.billIds, ['BILL-0004', 'BILL-0005']);
  const again = await runTool(state, 'supplier_reminder_draft', { supplier: 'Dye Works', period: '2026-09' });
  assert.equal(again.data.timesSent, 1);
  assert.equal(again.data.lastSent, localToday());
  assert.match(previewOf(state, 'record_supplier_reminder', { supplier: 'Dye Works', period: '2026-09' }).summary, new RegExp(`You last reminded them on ${localToday()}\\.$`));
  assert.deepEqual(deserialize(serialize(state)).supplierReminders, state.supplierReminders);
});

test('the draft is a phone query; the send is a strict, proposable write', () => {
  assert.equal(isRemoteQuery('supplier_reminder_draft'), true);
  assert.equal(isRemoteQuery('record_supplier_reminder'), false);
  assert.equal(validateAssistantToolCall('record_supplier_reminder', { supplier: 'Dye Works', period: '2026-09', channel: 'sms' }).ok, false);
  assert.equal(validateAssistantToolCall('record_supplier_reminder', { supplier: 'Dye Works', period: '2026-09', to: '+919999999999' }).ok, false);
  assert.equal(validateAssistantToolCall('record_supplier_reminder', { supplier: 'Dye Works', period: '2026-09', message: 'x', channel: 'email' }).ok, true);
});
