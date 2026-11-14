import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { invoiceToNicPayload, nicDocumentById, nicPartyFor, nicPayloadProblems, nicSupplyType } from '../src/nic-config.mjs';
import { simulateIrn } from '../src/nic-actions.mjs';
import { gstr3bPortalJson, offsetPlan } from '../src/gstr3b-portal.mjs';
import { documentPreview } from '../src/confirm-sales-purchases.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);
const balance = (state, code) => Math.round((acc(state, code).creditsPosted - acc(state, code).debitsPosted) * 100) / 100;

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', pan: 'AABCU9603R', state: '27', address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' };
  return state;
}

const domestic = { partyName: 'Ravi Security', partyState: '27', partyAddress: 'Shop 3, Hadapsar, Pune 411028', reverseCharge: true, lines: [{ description: 'Guards for August', hsn: '998525', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-08-12' };
const imported = { partyName: 'Cloud Host Inc', originCountry: 'us', lines: [{ description: 'Hosting', hsn: '998315', qty: 1, rate: 20000, gstRate: 18 }], date: '2026-08-14' };
const codes = (state, doc) => nicPayloadProblems(state.company, doc, nicPartyFor(state, doc), '2026-09-01').map((problem) => problem.code);

test('a reverse charge buy from an unregistered supplier owes the supplier only the price, books the GST as tax you owe, and numbers a self-invoice', () => {
  const state = books();
  const out = createPurchase(state, domestic);
  assert.equal(out.ok, true, JSON.stringify(out));
  const bill = out.invoice;
  assert.deepEqual(bill.reverseCharge, { kind: 'domestic' });
  assert.equal(bill.selfInvoiceNo, 'SI-0001');
  assert.equal(bill.total, 10000);
  assert.equal(bill.cgst, 900);
  assert.equal(bill.sgst, 900);
  assert.equal(balance(state, String(bill.partyAccountId)), 10000);
  assert.equal(balance(state, '2100'), 900);
  assert.equal(balance(state, '2101'), 900);
  assert.equal(-balance(state, '1200'), 900);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(createPurchase(state, { ...domestic, date: '2026-08-13' }).invoice.selfInvoiceNo, 'SI-0002');
});

test('the self-invoice goes to the IRP as RCMDOM: supplier URP with its PIN, you as the buyer, RegRev Y', async () => {
  const state = books();
  const bill = createPurchase(state, domestic).invoice;
  assert.equal(nicDocumentById(state, 'SI-0001'), bill);
  assert.equal(nicDocumentById(state, bill.id), bill);
  assert.equal(nicSupplyType(bill), 'RCMDOM');
  assert.deepEqual(codes(state, bill), []);
  const payload = invoiceToNicPayload(state.company, bill, nicPartyFor(state, bill));
  assert.deepEqual(payload.TranDtls, { TaxSch: 'GST', SupTyp: 'RCMDOM', RegRev: 'Y', IgstOnIntra: 'N' });
  assert.deepEqual(payload.DocDtls, { Typ: 'INV', No: 'SI-0001', Dt: '12/08/2026' });
  assert.equal(payload.SellerDtls.Gstin, 'URP');
  assert.equal(payload.SellerDtls.LglNm, 'Ravi Security');
  assert.equal(payload.SellerDtls.Pin, 411028);
  assert.equal(payload.SellerDtls.Stcd, '27');
  assert.equal(payload.BuyerDtls.Gstin, '27AABCU9603R1ZN');
  assert.equal(payload.BuyerDtls.Pos, '27');
  assert.equal(payload.BuyerDtls.Pin, 411019);
  assert.equal(payload.ValDtls.TotInvVal, 11800);
  assert.equal(payload.ItemList[0].OrgCntry, undefined);
  assert.equal(payload.ExpDtls, undefined);
  const mock = await simulateIrn(state, 'SI-0001');
  assert.equal(mock.ok, true, JSON.stringify(mock));
  assert.equal(mock.payload.TranDtls.SupTyp, 'RCMDOM');
  assert.ok(bill.mockIrn);

  const noAddress = createPurchase(state, { ...domestic, partyName: 'Ramesh Guards', partyAddress: '' }).invoice;
  assert.deepEqual(codes(state, noAddress), ['SUPPLIER_PIN_REQUIRED']);
});

test('an import of services is RCMIMP: IGST, supplier URP outside India with PIN 999999 and the origin country on every line', () => {
  const state = books();
  const out = createPurchase(state, imported);
  assert.equal(out.ok, true, JSON.stringify(out));
  const bill = out.invoice;
  assert.deepEqual(bill.reverseCharge, { kind: 'import', originCountry: 'US' });
  assert.equal(bill.igst, 3600);
  assert.equal(bill.cgst, 0);
  assert.equal(bill.total, 20000);
  assert.equal(balance(state, '2102'), 3600);
  assert.deepEqual(codes(state, bill), []);
  const payload = invoiceToNicPayload(state.company, bill);
  assert.equal(payload.TranDtls.SupTyp, 'RCMIMP');
  assert.equal(payload.TranDtls.RegRev, 'Y');
  assert.equal(payload.SellerDtls.Gstin, 'URP');
  assert.equal(payload.SellerDtls.Stcd, '96');
  assert.equal(payload.SellerDtls.Pin, 999999);
  assert.equal(payload.BuyerDtls.Gstin, '27AABCU9603R1ZN');
  assert.deepEqual(payload.ItemList.map((item) => [item.OrgCntry, item.IsServc, item.IgstAmt]), [['US', 'Y', 3600]]);
});

test('an import must be services from outside India from a supplier without a GSTIN', () => {
  const state = books();
  assert.equal(createPurchase(state, { ...imported, originCountry: 'IN' }).error, 'ORIGIN_COUNTRY_INDIA');
  assert.equal(createPurchase(state, { ...imported, originCountry: 'USA' }).error, 'ORIGIN_COUNTRY_INVALID');
  assert.equal(createPurchase(state, { ...imported, partyGstin: '27AAACF7856R1ZY' }).error, 'IMPORT_SUPPLIER_HAS_GSTIN');
  const goods = createPurchase(state, { ...imported, lines: [{ description: 'Server', hsn: '8471', qty: 1, rate: 50000, gstRate: 18 }] });
  assert.equal(goods.error, 'RCM_IMPORT_SERVICES_ONLY');
  assert.equal(goods.line, 1);
  assert.equal(createPurchase(state, { ...imported, reverseCharge: false }).error, 'RCM_CONFLICT');
  assert.equal((state.purchases || []).length, 0);
  assert.equal(state.selfInvoiceSeq || 0, 0);
});

test('a registered supplier under reverse charge issues its own invoice, so there is no self-invoice and no IRN; ordinary bills get none either', () => {
  const state = books();
  const bill = createPurchase(state, { partyName: 'Shah Advocates', partyGstin: '27AAACF7856R1ZY', reverseCharge: 'yes', lines: [{ description: 'Legal advice', hsn: '998212', qty: 1, rate: 5000, gstRate: 18 }], date: '2026-08-20' }).invoice;
  assert.deepEqual(bill.reverseCharge, { kind: 'notified' });
  assert.equal(bill.selfInvoiceNo, undefined);
  assert.equal(bill.total, 5000);
  assert.equal(nicDocumentById(state, bill.id), null);
  assert.deepEqual(codes(state, bill), ['RCM_SUPPLIER_INVOICES']);
  const plain = createPurchase(state, { partyName: 'Fabric Co', partyGstin: '27AAACF7856R1ZY', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-08-21' }).invoice;
  assert.equal(plain.reverseCharge, undefined);
  assert.deepEqual(codes(state, plain), ['NOT_A_SELF_INVOICE']);
});

test('GSTR-3B shows reverse charge in 3.1(d), its credit in 4(A)(2) and 4(A)(3), and the tax is paid in cash on its own ledger row', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 100000, gstRate: 18 }], date: '2026-08-05' });
  assert.equal(createPurchase(state, domestic).ok, true);
  assert.equal(createPurchase(state, imported).ok, true);
  const built = gstr3bPortalJson(state, '2026-08');
  assert.equal(built.ok, true, JSON.stringify(built));
  const body = built.body;
  assert.deepEqual(body.sup_details.isup_rev, { txval: 30000, iamt: 3600, camt: 900, samt: 900, csamt: 0 });
  const avl = Object.fromEntries(body.itc_elg.itc_avl.map((row) => [row.ty, row]));
  assert.deepEqual(avl.IMPS, { ty: 'IMPS', iamt: 3600, camt: 0, samt: 0, csamt: 0 });
  assert.deepEqual(avl.ISRC, { ty: 'ISRC', iamt: 0, camt: 900, samt: 900, csamt: 0 });
  assert.deepEqual(avl.OTH, { ty: 'OTH', iamt: 0, camt: 0, samt: 0, csamt: 0 });
  assert.deepEqual(body.itc_elg.itc_net, { iamt: 3600, camt: 900, samt: 900, csamt: 0 });
  assert.ok(built.warnings.some((line) => /Reverse charge tax of ₹5400 on 2 purchases/.test(line)));

  const payable = await runTool(state, 'gst_payable', { period: '2026-08', payOn: '2026-09-15' });
  assert.equal(payable.ok, true, JSON.stringify(payable));
  const d = payable.data;
  assert.deepEqual({ igst: d.reverseCharge.igst, cgst: d.reverseCharge.cgst, sgst: d.reverseCharge.sgst }, { igst: 3600, cgst: 900, sgst: 900 });
  assert.equal(d.output.total, 18000);
  assert.equal(d.toPay, Math.round((d.cash.igst + d.cash.cgst + d.cash.sgst + 5400) * 100) / 100);
  assert.ok(d.notes.some((line) => /paid in cash/.test(line)));
  const plan = offsetPlan(d, { 30002: 11, 30003: 12 });
  assert.equal(plan.pdcash.length, 2);
  assert.deepEqual([plan.pdcash[1].liab_ldg_id, plan.pdcash[1].trans_typ, plan.pdcash[1].ipd, plan.pdcash[1].cpd, plan.pdcash[1].spd], [12, 30003, 3600, 900, 900]);
  assert.equal(plan.pdcash[0].trans_typ, 30002);

  const paid = await runTool(state, 'record_gst_payment', { period: '2026-08', date: '2026-09-15', cpin: '26080012345678' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  for (const code of ['2100', '2101', '2102']) assert.equal(balance(state, code), 0, `${code} cleared`);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('without reverse charge purchases the 3B offset keeps one cash row', () => {
  const plan = offsetPlan({ cash: { igst: 10, cgst: 5, sgst: 5 }, used: {} });
  assert.equal(plan.pdcash.length, 1);
});

test('the chat preview says the GST is yours to pay and that a self-invoice is numbered', () => {
  const state = books();
  const preview = documentPreview(state, imported, 'purchase');
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Import of services from Cloud Host Inc \(US\)/);
  assert.match(preview.effects[0], /You owe Cloud Host Inc ₹?20,?000/);
  assert.match(preview.effects[1], /self-invoice/);
  assert.equal(preview.figures.total, 20000);
  assert.deepEqual(documentPreview(state, { ...imported, originCountry: 'IN' }, 'purchase').blockers.length, 1);
});
