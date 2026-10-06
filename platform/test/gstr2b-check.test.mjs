import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { purchaseRegisterCsv } from '../src/post-import.mjs';
import { isImport } from '../src/import-documents.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';

const TWO_B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,24AAACF7856R1ZY,GUJARAT MILLS,GM/77,08-09-2026,20000,0,0,3600,0,23600,N',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
  'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y',
  'B2B,27AAACH7409R1Z1,RETAIL SUPPLY,RS-1,15-09-2026,3000,90,90,0,0,3180,Y',
].join('\n');

function bill(state, partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate) {
  const out = createPurchase(state, { date, partyName, partyGstin, ...(supplierInvoiceNo ? { supplierInvoiceNo } : {}), lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

function books() {
  const state = createState();
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  bill(state, 'Gujarat Mills', '24AAACF7856R1ZY', 'GM/77', '2026-09-08', 20000, 18);
  bill(state, 'Pack House', '29AABCL1234J1ZL', 'PH-9', '2026-09-10', 6000, 12);
  bill(state, 'Thread Ltd', '33AAACZ1234F1Z5', 'T-55', '2026-09-12', 8000, 12);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-14', 2000, 18);
  bill(state, 'Box Mart', '27AAACB2222B1Z5', '', '2026-09-16', 1000, 18);
  return state;
}

test('a purchase keeps the supplier bill number, one per supplier, and the register uses it', () => {
  const state = createState();
  const first = bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 100, 5);
  assert.equal(first.id, 'BILL-0001');
  assert.equal(first.supplierInvoiceNo, 'F-101');
  const again = createPurchase(state, { date: '2026-09-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', supplierInvoiceNo: 'f101', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 5 }] });
  assert.equal(again.error, 'DUPLICATE_SUPPLIER_BILL');
  assert.equal(again.existing, 'BILL-0001');
  assert.equal(createPurchase(state, { date: '2026-09-06', partyName: 'Other', partyGstin: '27AAACH7409R1Z1', supplierInvoiceNo: 'F-101', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 5 }] }).ok, true);
  assert.equal(createPurchase(state, { date: '2026-09-06', partyName: 'Other', supplierInvoiceNo: 'X'.repeat(17), lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 5 }] }).error, 'SUPPLIER_NUMBER_TOO_LONG');
  assert.match(purchaseRegisterCsv(state.purchases).split('\n')[1], /,F-101,/);
});

test('before any 2B is added, every numbered bill is at risk and says why', async () => {
  const data = (await runTool(books(), 'credit_at_risk', { period: '2026-09' })).data;
  assert.equal(data.statement, null);
  assert.equal(data.creditMatched, 0);
  assert.equal(data.creditAtRisk, data.creditInBooks);
  assert.match(data.risks.find((r) => r.supplier === 'Fabric Co').why, /No 2B has been added/);
});

test('with the 2B added, each bill is matched or explained, and money at risk is grouped by supplier', async () => {
  const state = books();
  const added = await runTool(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B, fileName: 'GSTR2B_092026.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.rows, 5);
  const data = (await runTool(state, 'credit_at_risk', { period: '2026-09' })).data;
  assert.deepEqual(data.statement, { fileName: 'GSTR2B_092026.csv', importedOn: data.statement.importedOn, rows: 5 });
  const reasons = Object.fromEntries(data.risks.map((r) => [r.supplier, r.reason]));
  assert.deepEqual(reasons, {
    'Gujarat Mills': 'ITC_NOT_AVAILABLE',
    'Pack House': 'AMOUNT_DIFFERS',
    'Thread Ltd': 'DATE_DIFFERS',
    'Dye Works': 'NOT_IN_2B',
    'Box Mart': 'NO_SUPPLIER_NUMBER',
  });
  assert.equal(data.creditMatched, 500);
  assert.equal(data.creditAtRisk, 3600 + 720 + 960 + 360 + 180);
  assert.equal(data.creditInBooks, data.creditMatched + data.creditAtRisk);
  assert.match(data.risks.find((r) => r.supplier === 'Pack House').why, /taxable value 6000 in your books, 5000 in 2B/);
  assert.match(data.risks.find((r) => r.supplier === 'Thread Ltd').why, /2B has this bill dated 2026-09-11; your books have 2026-09-12/);
  assert.match(data.risks.find((r) => r.supplier === 'Dye Works').why, /has not reported this bill in any 2B/);
  assert.deepEqual(data.bySupplier[0], { supplier: 'Gujarat Mills', gstin: '24AAACF7856R1ZY', credit: 3600, bills: 1 });
  assert.deepEqual(data.notBooked, [{ supplier: 'RETAIL SUPPLY', gstin: '27AAACH7409R1Z1', invoiceNo: 'RS-1', date: '2026-09-15', credit: 180 }]);
  assert.equal(state.ledger.transfers.length, (await (async () => { const s = books(); return s.ledger.transfers.length; })()), 'adding 2B posts nothing');
});

test('a bill reported in a later month 2B is matched once that 2B is added', async () => {
  const state = books();
  await runTool(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B });
  await runTool(state, 'import_gstr2b', { period: '2026-10', csv: [HEADER, 'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,14-09-2026,2000,180,180,0,0,2360,Y'].join('\n') });
  const data = (await runTool(state, 'credit_at_risk', { period: '2026-09' })).data;
  assert.equal(data.risks.some((r) => r.supplier === 'Dye Works'), false);
  assert.deepEqual(data.statements, ['2026-09', '2026-10']);
});

test('the import is previewed, posts nothing, replaces the same month, and refuses an unreadable file or a missing month', async () => {
  const state = books();
  const preview = previewOf(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /^GSTR-2B for 2026-09: 5 entries from 5 suppliers\.$/);
  assert.match(preview.effects[0], /Nothing is posted to your books/);
  await runTool(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B });
  assert.match(previewOf(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B }).summary, /replaces the 2B already added/);
  assert.deepEqual(previewOf(state, 'import_gstr2b', { period: '2026-09', csv: 'nothing,here' }).blockers, ['No GSTR-2B rows could be read from this file. Use the CSV downloaded from the GST portal.']);
  assert.equal((await runTool(state, 'import_gstr2b', { csv: TWO_B })).error, 'INVALID_PERIOD');
  assert.equal((await runTool(state, 'import_gstr2b', { period: '2026-09', csv: 'x' })).error, 'NO_ROWS');
});

test('the 2B import goes through chat preview and confirm by file hash, and persists', async () => {
  const state = books();
  state.pendingFile = null;
  const { propose, confirmPending } = await import('../src/router.mjs');
  const held = await propose(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B, fileName: '2b.csv' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.equal(JSON.stringify(state.pendingChatAction).includes('FABRIC CO'), false, 'the held import carries a hash, not the file');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.gstr2b['2026-09'].rows.length, 5);
  assert.equal(isImport('import_gstr2b'), true);
  assert.equal(isRemoteQuery('credit_at_risk'), true);
  assert.equal(validateAssistantToolCall('create_purchase', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 5 }], supplierInvoiceNo: 'F-1' }).ok, true);
  assert.equal(validateAssistantToolCall('import_gstr2b', { csv: 'x' }).ok, false);
  assert.equal(validateAssistantToolCall('credit_at_risk', { period: 'Sep' }).ok, false);
});
