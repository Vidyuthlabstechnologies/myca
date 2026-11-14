import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { gstr3bPortalJson, offsetPlan } from '../src/gstr3b-portal.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { invoiceToNicPayload, nicPayloadProblems, nicPartyFor, nicSupplyType } from '../src/nic-config.mjs';
import { ewayBillPartA } from '../src/eway-bill.mjs';
import { documentPreview } from '../src/confirm-sales-purchases.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { periodSummary } from '../src/period-summary.mjs';

const SEZ_MH = '27AAACS1234K1ZH';
const SEZ_KA = '29AAACD5678L1Z2';
const BUYER_GJ = '24AAACE4321M1ZV';
const PERIOD = '2026-09';
const DAY = `${PERIOD}-10`;
const CESS_PERIOD = '2025-12';
const CESS_DAY = `${CESS_PERIOD}-10`;

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', pan: 'AABCU9603R', state: '27', address: '12 Market Road, Pune 411001', city: 'Pune', pin: '411001' };
  return state;
}

function balanceOf(state, code) {
  const account = listAccounts(state.ledger).find((row) => row.code === code);
  return account ? Math.round((account.creditsPosted - account.debitsPosted) * 100) / 100 : 0;
}

function gstr1(state, fp = '092026') {
  return invoicesToGstr1Json(state.company, state.invoices, fp, { creditNotes: state.creditNotes || [], debitNotes: state.debitNotes || [] });
}

function sale(extra = {}, line = {}) {
  return { partyName: 'Zone Unit', partyGstin: SEZ_MH, partyAddress: 'Plot 9, SEEPZ, Mumbai 400096', date: DAY, lines: [{ description: 'Fabric', hsn: '5208', qty: 100, rate: 1000, gstRate: 18, ...line }], ...extra };
}

test('IGST Act s.16: SEZWOP invoice carries no tax and goes to 3.1(b)', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWOP' }));
  assert.equal(out.ok, true, JSON.stringify(out));
  const inv = out.invoice;
  assert.equal(inv.supplyType, 'SEZWOP');
  assert.equal(inv.zeroRated, true);
  assert.deepEqual([inv.taxable, inv.cgst, inv.sgst, inv.igst, inv.total], [100000, 0, 0, 0, 100000]);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const body = gstr3bPortalJson(state, PERIOD).body;
  assert.deepEqual(body.sup_details.osup_zero, { txval: 100000, iamt: 0, camt: 0, samt: 0, csamt: 0 });
  assert.equal(body.sup_details.osup_det.txval, 0);
  const b2b = gstr1(state).b2b.find((row) => row.ctin === SEZ_MH).inv[0];
  assert.equal(b2b.inv_typ, 'SEWOP');
  assert.deepEqual(b2b.itms[0].itm_det, { rt: 18, txval: 100000, camt: 0, samt: 0, iamt: 0, csamt: 0 });
  const summary = periodSummary(state, PERIOD);
  assert.equal(summary.data.taxableSales, 100000);
});

test('IGST Act s.7(5)(b): an SEZWP supply in the supplier\'s own state is charged IGST, never CGST and SGST', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', sale({ supplyType: 'sezwp' }));
  assert.equal(out.ok, true, JSON.stringify(out));
  const inv = out.invoice;
  assert.equal(inv.supplyType, 'SEZWP');
  assert.equal(inv.zeroRated, false);
  assert.deepEqual([inv.cgst, inv.sgst, inv.igst, inv.total], [0, 0, 18000, 118000]);
  assert.equal(inv.lines[0].intra, false);
  assert.equal(balanceOf(state, '2102'), 18000);
  assert.equal(balanceOf(state, '2100'), 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const body = gstr3bPortalJson(state, PERIOD).body;
  assert.deepEqual(body.sup_details.osup_zero, { txval: 100000, iamt: 18000, camt: 0, samt: 0, csamt: 0 });
  assert.deepEqual(body.sup_details.osup_det, { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
  const b2b = gstr1(state).b2b[0].inv[0];
  assert.equal(b2b.inv_typ, 'SEWP');
  assert.equal(b2b.pos, '27');
  assert.equal(b2b.itms[0].itm_det.iamt, 18000);
  assert.equal(b2b.itms[0].itm_det.camt, 0);
  const summary = periodSummary(state, PERIOD);
  assert.deepEqual([summary.data.taxableSales, summary.data.outputTax.igst], [100000, 18000]);
});

test('IGST Act s.16(3): an SEZWP supply to an SEZ in another state is IGST and also zero-rated in 3.1(b)', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWP', partyGstin: SEZ_KA, partyName: 'Bengaluru SEZ Unit', partyAddress: 'Electronic City SEZ, Bengaluru 560100' }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.invoice.igst, 18000);
  const body = gstr3bPortalJson(state, PERIOD).body;
  assert.equal(body.sup_details.osup_zero.iamt, 18000);
  assert.equal(body.sup_details.osup_det.iamt, 0);
  assert.deepEqual(body.inter_sup.unreg_details, []);
});

test('CGST s.147 and Notification 48/2017-CT: a deemed export is taxed as per rate, needs the buyer GSTIN and stays in 3.1(a)', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', sale({ supplyType: 'DEXP', partyName: 'EOU Mills' }));
  assert.equal(out.ok, true, JSON.stringify(out));
  const inv = out.invoice;
  assert.equal(inv.supplyType, 'DEXP');
  assert.equal(inv.zeroRated, undefined);
  assert.deepEqual([inv.cgst, inv.sgst, inv.igst, inv.total], [9000, 9000, 0, 118000]);
  const body = gstr3bPortalJson(state, PERIOD).body;
  assert.deepEqual(body.sup_details.osup_det, { txval: 100000, iamt: 0, camt: 9000, samt: 9000, csamt: 0 });
  assert.equal(body.sup_details.osup_zero.txval, 0);
  assert.equal(gstr1(state).b2b[0].inv[0].inv_typ, 'DE');
  const noGstin = await runTool(state, 'create_invoice', sale({ supplyType: 'DEXP', partyGstin: '' }));
  assert.equal(noGstin.error, 'BUYER_GSTIN_REQUIRED');
  const service = await runTool(state, 'create_invoice', sale({ supplyType: 'DEXP' }, { hsn: '998314' }));
  assert.equal(service.error, 'DEEMED_EXPORT_GOODS_ONLY');
});

test('IGST Act s.16: a supply to an SEZ needs the unit\'s GSTIN, is not also an export, and takes only SEZWP, SEZWOP or DEXP', async () => {
  const state = books();
  assert.equal((await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWOP', partyGstin: '' }))).error, 'BUYER_GSTIN_REQUIRED');
  assert.equal((await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWOP', partyGstin: '', exportSale: { currency: 'INR' } }))).error, 'SEZ_NOT_EXPORT');
  assert.equal((await runTool(state, 'create_invoice', sale({ supplyType: 'B2C' }))).error, 'BAD_INVOICE_SUPPLY_TYPE');
  assert.equal(validateAssistantToolCall('create_invoice', sale({ supplyType: 'SEZWOP' })).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', sale({ supplyType: 'SEZ' })).ok, false);
  assert.equal(state.invoices?.length || 0, 0);
  assert.equal(trialBalance(state.ledger).debit, 0);
});

test('e-invoice schema: SupTyp is SEZWP, SEZWOP or DEXP and an SEZ buyer needs a PIN like any B2B buyer', async () => {
  const state = books();
  for (const supplyType of ['SEZWP', 'SEZWOP', 'DEXP']) {
    const out = await runTool(state, 'create_invoice', sale({ supplyType }));
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(nicSupplyType(out.invoice), supplyType);
    const payload = invoiceToNicPayload(state.company, out.invoice, nicPartyFor(state, out.invoice));
    assert.equal(payload.TranDtls.SupTyp, supplyType);
    assert.equal(payload.BuyerDtls.Gstin, SEZ_MH);
    assert.deepEqual(nicPayloadProblems(state.company, out.invoice, nicPartyFor(state, out.invoice), '2026-12-31'), []);
    assert.ok(nicPayloadProblems(state.company, out.invoice, { address: 'SEEPZ Mumbai' }, '2026-12-31').some((p) => p.code === 'BUYER_PIN_REQUIRED'));
  }
  const sezwp = invoiceToNicPayload(state.company, state.invoices[0], null);
  assert.deepEqual([sezwp.ItemList[0].IgstAmt, sezwp.ItemList[0].CgstAmt, sezwp.ValDtls.IgstVal], [18000, 0, 18000]);
  assert.equal(sezwp.ItemList[0].CesRt, undefined, 'no cess keys when the line has no cess');
});

test('CGST s.34 with IGST Act s.16: a credit note follows the SEZ treatment of its invoice, zero-rated for SEZWOP and IGST for SEZWP', async () => {
  const state = books();
  const wop = (await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWOP' }))).invoice;
  const wp = (await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWP' }))).invoice;
  const cnWop = await runTool(state, 'create_credit_note', { invoiceId: wop.id, amount: 50000, reason: 'Rate revised', date: `${PERIOD}-20` });
  assert.equal(cnWop.ok, true, JSON.stringify(cnWop));
  assert.deepEqual([cnWop.creditNote.taxable, cnWop.creditNote.igst, cnWop.creditNote.cgst], [50000, 0, 0]);
  assert.equal(cnWop.creditNote.supplyType, 'SEZWOP');
  const cnWp = await runTool(state, 'create_credit_note', { invoiceId: wp.id, amount: 11800, reason: 'Short supply', date: `${PERIOD}-20` });
  assert.equal(cnWp.ok, true, JSON.stringify(cnWp));
  assert.deepEqual([cnWp.creditNote.taxable, cnWp.creditNote.igst, cnWp.creditNote.cgst, cnWp.creditNote.sgst], [10000, 1800, 0, 0]);
  const dn = await runTool(state, 'create_debit_note', { invoiceId: wp.id, amount: 1180, reason: 'Freight', date: `${PERIOD}-21` });
  assert.equal(dn.ok, true, JSON.stringify(dn));
  assert.deepEqual([dn.debitNote.igst, dn.debitNote.cgst], [180, 0]);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const file = gstr1(state);
  assert.deepEqual(file.cdnr[0].nt.map((note) => [note.ntty, note.inv_typ]), [['C', 'SEWOP'], ['C', 'SEWP'], ['D', 'SEWP']]);
  const body = gstr3bPortalJson(state, PERIOD).body;
  assert.deepEqual(body.sup_details.osup_zero, { txval: 141000, iamt: 16380, camt: 0, samt: 0, csamt: 0 });
  assert.deepEqual(body.sup_details.osup_det, { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
  const nic = invoiceToNicPayload(state.company, cnWp.creditNote, null);
  assert.equal(nic.TranDtls.SupTyp, 'SEZWP');
  assert.equal(nic.DocDtls.Typ, 'CRN');
});

test('CGST s.37(3) with IGST Act s.7(5)(b): an amended SEZWP invoice stays IGST and goes to B2BA as SEWP; an invoice with cess is corrected by note', async () => {
  const state = books();
  const inv = (await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWP' }))).invoice;
  const cessSale = (await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_GJ, date: DAY, lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 18, cessRate: 1 }] })).invoice;
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: PERIOD, arn: 'AA270926123456A', filedOn: '2026-10-11' })).ok, true);
  const out = await runTool(state, 'amend_invoice', { invoiceId: inv.id, reason: 'Rate was wrong', lines: [{ description: 'Fabric', hsn: '5208', qty: 100, rate: 1100, gstRate: 18 }], date: '2026-10-12' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual([inv.igst, inv.cgst, inv.total], [19800, 0, 129800]);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const file = invoicesToGstr1Json(state.company, state.invoices, '102026', {});
  assert.equal(file.b2ba[0].inv[0].inv_typ, 'SEWP');
  const refused = await runTool(state, 'amend_invoice', { invoiceId: cessSale.id, reason: 'x', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 900, gstRate: 18 }], date: '2026-10-12' });
  assert.equal(refused.error, 'CESS_AMENDMENT_BY_NOTE');
});

test('E-way Bill Rule 138: a supply to an SEZ is an outward supply carrying IGST rates even within the state', async () => {
  const state = books();
  const inv = (await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWP' }))).invoice;
  inv.transport = { mode: 'road', distanceKm: 30, vehicleNo: 'MH12AB1234', setOn: DAY };
  const built = ewayBillPartA(state, inv);
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.deepEqual([built.partA.supplyType, built.partA.subSupplyType], ['O', '1']);
  assert.deepEqual([built.partA.itemList[0].igstRate, built.partA.itemList[0].cgstRate, built.partA.igstValue], [18, 0, 18000]);
  assert.equal(built.partA.cessValue, 0);
});

test('GST (Compensation to States) Cess Act s.8: ad valorem and specific cess are levied on the taxable value and posted to Output Cess', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_GJ, partyAddress: '7 Ring Road, Surat 395002', date: CESS_DAY, lines: [{ description: 'Pan masala', hsn: '21069020', qty: 1000, rate: 10, gstRate: 28, cessRate: 5, cessPerUnit: 0.5 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  const inv = out.invoice;
  const line = inv.lines[0];
  assert.deepEqual([line.taxable, line.igst, line.cessRate, line.cessPerUnit, line.cessAdval, line.cessNonAdval, line.cess, line.amount], [10000, 2800, 5, 0.5, 500, 500, 1000, 13800]);
  assert.deepEqual([inv.cess, inv.total], [1000, 13800]);
  assert.equal(balanceOf(state, '2103'), 1000);
  assert.equal(listAccounts(state.ledger).find((row) => row.code === '2103').name, 'GST output Cess');
  assert.equal(trialBalance(state.ledger).balanced, true);
  const b2b = gstr1(state, '122025').b2b[0].inv[0];
  assert.equal(b2b.val, 13800);
  assert.equal(b2b.itms[0].itm_det.csamt, 1000);
  const body = gstr3bPortalJson(state, CESS_PERIOD).body;
  assert.deepEqual(body.sup_details.osup_det, { txval: 10000, iamt: 2800, camt: 0, samt: 0, csamt: 1000 });
  const nic = invoiceToNicPayload(state.company, inv, nicPartyFor(state, inv));
  assert.deepEqual([nic.ItemList[0].CesRt, nic.ItemList[0].CesAmt, nic.ItemList[0].CesNonAdvlAmt, nic.ItemList[0].TotItemVal], [5, 500, 500, 13800]);
  assert.deepEqual([nic.ValDtls.CesVal, nic.ValDtls.TotInvVal], [1000, 13800]);
  inv.transport = { mode: 'road', distanceKm: 260, vehicleNo: 'MH12AB1234', setOn: CESS_DAY };
  const ewb = ewayBillPartA(state, inv).partA;
  assert.deepEqual([ewb.cessValue, ewb.cessNonAdvolValue, ewb.otherValue, ewb.totInvValue], [500, 500, 0, 13800]);
  assert.deepEqual([ewb.itemList[0].cessRate, ewb.itemList[0].cessNonadvol], [5, 0.5]);
  const paid = await runTool(state, 'record_receipt', { invoiceId: inv.id });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.invoice.status, 'paid');
});

test('Compensation Cess Act s.8: cess on unregistered sales is reported as csamt in B2CS and B2CL', async () => {
  const state = books();
  const small = await runTool(state, 'create_invoice', { partyName: 'Walk-in', date: CESS_DAY, lines: [{ description: 'Cigarettes', hsn: '24022090', qty: 10, rate: 100, gstRate: 28, cessRate: 5 }] });
  assert.equal(small.ok, true, JSON.stringify(small));
  const large = await runTool(state, 'create_invoice', { partyName: 'Traveller', partyState: '29', date: CESS_DAY, lines: [{ description: 'Cigarettes', hsn: '24022090', qty: 1000, rate: 300, gstRate: 28, cessRate: 5 }] });
  assert.equal(large.ok, true, JSON.stringify(large));
  const file = gstr1(state, '122025');
  assert.equal(file.b2cs[0].csamt, 50);
  assert.equal(file.b2cl[0].inv[0].itms[0].itm_det.csamt, 15000);
});

test('Compensation Cess Act s.11 with IGST Act s.16: an SEZWOP supply carries no cess either', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', sale({ supplyType: 'SEZWOP' }, { gstRate: 28, cessRate: 12 }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual([out.invoice.lines[0].cess, out.invoice.cess, out.invoice.total], [0, 0, 100000]);
  assert.equal(balanceOf(state, '2103'), 0);
});

test('Compensation Cess Act s.8 with CGST s.34: credit and debit notes scale cess in proportion to the invoice', async () => {
  const state = books();
  const inv = (await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_GJ, date: CESS_DAY, lines: [{ description: 'Pan masala', hsn: '21069020', qty: 1000, rate: 10, gstRate: 28, cessRate: 5, cessPerUnit: 0.5 }] })).invoice;
  const cn = await runTool(state, 'create_credit_note', { invoiceId: inv.id, amount: 6900, reason: 'Half returned', date: `${CESS_PERIOD}-20` });
  assert.equal(cn.ok, true, JSON.stringify(cn));
  assert.deepEqual([cn.creditNote.taxable, cn.creditNote.igst, cn.creditNote.cess, cn.creditNote.total], [5000, 1400, 500, 6900]);
  assert.deepEqual([cn.creditNote.lines[0].cessAdval, cn.creditNote.lines[0].cessNonAdval], [250, 250]);
  const dn = await runTool(state, 'create_debit_note', { invoiceId: inv.id, amount: 1380, reason: 'Price raised', date: `${CESS_PERIOD}-21` });
  assert.equal(dn.ok, true, JSON.stringify(dn));
  assert.deepEqual([dn.debitNote.taxable, dn.debitNote.igst, dn.debitNote.cess, dn.debitNote.total], [1000, 280, 100, 1380]);
  assert.equal(balanceOf(state, '2103'), 600);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const file = gstr1(state, '122025');
  assert.deepEqual(file.cdnr[0].nt.map((note) => note.itms[0].itm_det.csamt), [500, 100]);
  assert.equal(gstr3bPortalJson(state, CESS_PERIOD).body.sup_details.osup_det.csamt, 600);
  const full = await runTool(state, 'create_credit_note', { invoiceId: inv.id, reason: 'Rest returned', date: `${CESS_PERIOD}-22` });
  assert.equal(full.ok, true, JSON.stringify(full));
  assert.equal(full.creditNote.cess, 500);
  assert.equal(balanceOf(state, '2103'), 100, 'the cess of the debit note stays payable');
  assert.equal(trialBalance(state.ledger).balanced, true);
  const itemised = await runTool(state, 'create_credit_note', { invoiceId: (await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_GJ, date: CESS_DAY, lines: [{ description: 'Pan masala', hsn: '21069020', qty: 10, rate: 10, gstRate: 28, cessRate: 5 }] })).invoice.id, reason: 'x', date: `${CESS_PERIOD}-22`, lines: [{ rate: 10, gstRate: 28 }] });
  assert.equal(itemised.error, 'CESS_NOTE_BY_AMOUNT');
});

test('Compensation Cess Act s.11 with CGST s.16: cess on a purchase is Input Cess and reported in 3B table 4', async () => {
  const state = books();
  const bill = await runTool(state, 'create_purchase', { partyName: 'Gujarat Tobacco', partyGstin: BUYER_GJ, date: CESS_DAY, lines: [{ description: 'Leaf', hsn: '2401', qty: 100, rate: 100, gstRate: 28, cessRate: 10, cessPerUnit: 1 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.deepEqual([bill.invoice.cess, bill.invoice.total], [1100, 13900]);
  const input = listAccounts(state.ledger).find((row) => row.code === '1203');
  assert.equal(input.name, 'GST input Cess');
  assert.equal(input.debitsPosted - input.creditsPosted, 1100);
  const blocked = await runTool(state, 'create_purchase', { partyName: 'Gujarat Tobacco', partyGstin: BUYER_GJ, date: CESS_DAY, itcEligible: false, lines: [{ description: 'Leaf', hsn: '2401', qty: 10, rate: 100, gstRate: 28, cessRate: 10 }] });
  assert.equal(blocked.ok, true, JSON.stringify(blocked));
  assert.equal(listAccounts(state.ledger).find((row) => row.code === '1203').debitsPosted, 1100);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const note = await runTool(state, 'create_purchase_note', { billId: bill.invoice.id, amount: 1390, reason: 'Short', date: `${CESS_PERIOD}-20` });
  assert.equal(note.ok, true, JSON.stringify(note));
  assert.equal(note.purchaseNote?.cess ?? note.note?.cess, 110);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const body = gstr3bPortalJson(state, CESS_PERIOD).body;
  assert.equal(body.itc_elg.itc_avl.find((row) => row.ty === 'OTH').csamt, 990);
  assert.equal(body.itc_elg.itc_net.csamt, 990);
  assert.equal(body.itc_elg.itc_inelg.find((row) => row.ty === 'RUL').csamt, 100);
});

test('Compensation Cess Act s.9: GSTR-3B set-off uses cess credit only against cess and pays the rest in cash', () => {
  const plan = offsetPlan({ used: {}, cash: {}, reverseCharge: {} }, {}, { output: 1000, input: 300 });
  assert.equal(plan.pditc.cs_pdcs, 300);
  assert.equal(plan.pdcash[0].cspd, 700);
  const none = offsetPlan({ used: {}, cash: {}, reverseCharge: {} }, {});
  assert.deepEqual([none.pditc.cs_pdcs, none.pdcash[0].cspd], [0, 0]);
});

test('Compensation Cess Act s.8: lines without cess are unchanged and bad cess is refused', async () => {
  const state = books();
  const plain = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_GJ, date: DAY, lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(plain.ok, true);
  assert.equal('cess' in plain.invoice, false);
  assert.equal('cess' in plain.invoice.lines[0], false);
  assert.equal('supplyType' in plain.invoice, false);
  assert.equal(listAccounts(state.ledger).find((row) => row.code === '2103').creditsPosted, 0);
  assert.equal((await runTool(state, 'create_invoice', { partyName: 'A', date: DAY, lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 28, cessRate: -1 }] })).error, 'BAD_CESS');
  assert.equal((await runTool(state, 'create_invoice', { partyName: 'A', date: DAY, lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 0, supply: 'exempt', cessPerUnit: 2 }] })).error, 'CESS_ON_ZERO_RATE_SUPPLY');
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 28, cessRate: 5, cessPerUnit: 1.5 }] }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 28, cessRate: -5 }] }).ok, false);
});

test('IGST Act s.16 and Cess Act s.8: the confirmation words say SEZ, deemed export and cess before anything is posted', () => {
  const state = books();
  const wop = documentPreview(state, sale({ supplyType: 'SEZWOP' }), 'sale');
  assert.deepEqual(wop.blockers, []);
  assert.match(wop.summary, /SEZ/);
  assert.match(wop.summary, /LUT or bond/);
  assert.equal(wop.figures.total, 100000);
  assert.ok(wop.effects.some((line) => /6B/.test(line)), JSON.stringify(wop.effects));
  const wp = documentPreview(state, sale({ supplyType: 'SEZWP' }), 'sale');
  assert.match(wp.summary, /IGST ₹18,000/);
  assert.equal(wp.figures.total, 118000);
  const dexp = documentPreview(state, sale({ supplyType: 'DEXP' }), 'sale');
  assert.match(dexp.summary, /Deemed export/);
  assert.ok(dexp.effects.some((line) => /6C/.test(line)));
  assert.ok(documentPreview(state, sale({ supplyType: 'SEZWOP', partyGstin: '' }), 'sale').blockers.length > 0);
  const cess = documentPreview(state, { partyName: 'Kiran Stores', partyGstin: BUYER_GJ, date: CESS_DAY, lines: [{ description: 'Pan masala', hsn: '21069020', qty: 1000, rate: 10, gstRate: 28, cessRate: 5, cessPerUnit: 0.5 }] }, 'sale');
  assert.match(cess.summary, /cess ₹1,000/);
  assert.equal(cess.figures.total, 13800);
});
