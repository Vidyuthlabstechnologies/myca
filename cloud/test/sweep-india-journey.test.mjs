import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { testSignInFromEnv } from '../src/test-sign-in.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { gstr3bPortalJson } from '../../platform/src/gstr3b-portal.mjs';

const JOB_TOKEN = 'job-token-for-india-journey-0123456789abcdef';
const CONNECTOR_KEY = 'connector-key-for-india-journey-0123456789abcdef';
const OWNER_PHONE = '+919811100001';
const MEMBER_PHONE = '+919811100002';
const CODE = '480213';
const SELLER_GSTIN = '27AABCU9603R1ZN';
const INTRA_BUYER = '27AAACH7409R1Z1';
const INTER_BUYER = '29AAACG1234F1Z0';
const SEZ_BUYER = '24AAACG1234F1ZA';
const ENV = { MYCA_MOCK_MODE: '1', MYCA_PROVIDER_ENV: 'test' };
const DAY = 24 * 60 * 60 * 1000;

const saved = {};
const seen = [];
let api;
let owner;
let member;
let period;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  const testSignIn = testSignInFromEnv({ MYCA_TEST_PHONES: `${OWNER_PHONE},${MEMBER_PHONE}`, MYCA_TEST_CODE: CODE }, 'staging');
  assert.equal(testSignIn.problem, '');
  api = await startApi({ phone: false, testSignIn, environment: 'staging', jobToken: JOB_TOKEN, connectorKey: CONNECTOR_KEY });
});

after(async () => {
  await api.close();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const paise = (n) => Math.round(Number(n || 0) * 100);
const sum = (rows, pick) => rows.reduce((total, row) => total + paise(pick(row)), 0);

async function call(method, path, options = {}) {
  const out = await api.call(method, path, options);
  seen.push({ path, text: out.text });
  return out;
}

async function signInByTestCode(phone, deviceLabel) {
  const otp = await call('POST', '/v1/auth/otp', { body: { phone } });
  assert.equal(otp.status, 200, otp.text);
  const verified = await call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code: CODE, deviceLabel } });
  assert.equal(verified.status, 200, verified.text);
  return verified.body;
}

const agree = (token) => call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } });

function as(who) {
  const path = (action) => `/v1/businesses/${who.businessId}/${action}`;
  const post = (action, body) => call('POST', path(action), { token: who.token, body });
  const get = (action) => call('GET', path(action), { token: who.token });
  return {
    post,
    get,
    async snapshot() {
      const out = await get('snapshot');
      assert.equal(out.status, 200, out.text);
      return out.body;
    },
    async query(name, args) {
      const out = await post('query', { name, ...(args ? { args } : {}) });
      assert.equal(out.status, 200, `${name}: ${out.text}`);
      assert.equal(out.body.ok, true, `${name}: ${out.text}`);
      return out.body.data;
    },
    async book(name, args) {
      const before = await api.books(who.businessId);
      const held = await post('propose', { name, args });
      assert.equal(held.status, 200, `${name}: ${held.text}`);
      assert.ok(held.body.preview?.token, `${name} is previewed first: ${held.text}`);
      assert.equal(held.body.posted, false);
      const waiting = await api.books(who.businessId);
      assert.equal(waiting.ledger.transfers.length, before.ledger.transfers.length, `${name} posts nothing before confirm`);
      const posted = await post('confirm', { token: held.body.preview.token });
      assert.equal(posted.status, 200, `${name}: ${posted.text}`);
      assert.equal(posted.body.posted, true, `${name} posts on confirm: ${posted.text}`);
      const landed = await api.books(who.businessId);
      const again = await post('confirm', { token: held.body.preview.token });
      assert.equal(again.body.replayed, true, `${name}: a retried confirm replays the answer: ${again.text}`);
      assert.equal((await api.books(who.businessId)).ledger.transfers.length, landed.ledger.transfers.length, `${name}: a retried confirm posts nothing twice`);
      return { preview: held.body.preview, result: posted.body.tools.find((t) => t.name === name)?.result, reply: posted.body.reply };
    },
  };
}

async function booksBalance(who) {
  const trial = await as(who).query('trial_balance');
  assert.equal(sum(trial.rows, (row) => row.posted), 0, 'the trial balance ties to the paisa');
  assert.equal(sum(trial.rows, (row) => row.debitsPosted), sum(trial.rows, (row) => row.creditsPosted), 'debits equal credits');
  return Object.fromEntries(trial.rows.map((row) => [row.code, paise(row.posted)]));
}

function indiaMonth(at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date(at));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

test('1. sign in with the staging test number: no SMS, and nothing works until the privacy notice is accepted', async () => {
  period = indiaMonth();
  const session = await signInByTestCode(OWNER_PHONE, 'Pixel 8');
  assert.ok(session.accessToken && session.refreshToken);
  assert.equal(session.consent.accepted, false);
  assert.equal(api.sender.sent.length, 0, 'the test number gets no SMS');

  const early = await call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Too Early', gstin: SELLER_GSTIN } });
  assert.equal(early.status, 403);
  assert.equal(early.body.error, 'CONSENT_REQUIRED');

  const notice = await call('GET', '/v1/privacy-notice');
  assert.equal(notice.body.notice.version, PRIVACY_NOTICE.version);
  assert.equal(notice.body.notice.region, 'IN');
  const accepted = await agree(session.accessToken);
  assert.equal(accepted.status, 200, accepted.text);
  const me = await call('GET', '/v1/me', { token: session.accessToken });
  assert.equal(me.status, 200, me.text);
  assert.deepEqual((await call('GET', '/v1/businesses', { token: session.accessToken })).body.businesses, [], 'the refused business was not saved');

  const created = await call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Shree Ganesh Textiles', gstin: SELLER_GSTIN, address: 'Plot 4, MIDC Bhosari', city: 'Pune', pin: '411026' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.business.country, 'IN');
  owner = { token: session.accessToken, businessId: created.body.business.id, userId: session.user.id };
  const company = (await as(owner).snapshot()).company;
  assert.equal(company.state, '27', 'the state comes from the GSTIN');
  assert.equal(company.pan, 'AABCU9603R', 'the PAN comes from the GSTIN');
});

test('2. customers and suppliers get their addresses, then B2B, B2C, inter-state, export and SEZ invoices post with the right tax split', async () => {
  const books = as(owner);
  await books.book('set_party_address', { partyName: 'Pune Retail', partyGstin: INTRA_BUYER, address: '12 FC Road, Pune 411004' });
  await books.book('set_party_address', { partyName: 'Bengaluru Mart', partyGstin: INTER_BUYER, address: '45 MG Road, Bengaluru 560001' });
  await books.book('set_party_address', { partyName: 'Kolkata Fabrics', address: '9 Burrabazar, Kolkata 700007' });

  const intra = (await books.book('create_invoice', { partyName: 'Pune Retail', partyGstin: INTRA_BUYER, lines: [{ description: 'Cotton fabric', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }] })).result.invoice;
  assert.deepEqual([intra.id, paise(intra.cgst), paise(intra.sgst), paise(intra.igst), paise(intra.total)], ['INV-0001', 25000, 25000, 0, 1050000]);
  await booksBalance(owner);

  const walkIn = (await books.book('create_invoice', { partyName: 'Walk-in customer', lines: [{ description: 'Saree', hsn: '5407', qty: 1, rate: 2000, gstRate: 5 }] })).result.invoice;
  assert.deepEqual([paise(walkIn.cgst), paise(walkIn.sgst), paise(walkIn.igst)], [5000, 5000, 0], 'a walk-in sale in the home state is CGST and SGST');

  const inter = (await books.book('create_invoice', { partyName: 'Bengaluru Mart', partyGstin: INTER_BUYER, lines: [{ description: 'Silk', hsn: '5007', qty: 2, rate: 30000, gstRate: 5 }] })).result.invoice;
  assert.deepEqual([inter.id, paise(inter.cgst), paise(inter.sgst), paise(inter.igst), inter.placeOfSupply], ['INV-0003', 0, 0, 300000, '29'], 'a Karnataka buyer is IGST');

  const large = (await books.book('create_invoice', { partyName: 'Chennai Bride', partyState: '33', lines: [{ description: 'Kanjivaram silk', hsn: '5007', qty: 1, rate: 150000, gstRate: 5 }] })).result.invoice;
  assert.deepEqual([paise(large.igst), large.placeOfSupply], [750000, '33'], 'an unregistered buyer in another state is IGST');

  const exported = await books.book('create_invoice', { partyName: 'Atlanta Imports LLC', partyState: '96', exportSale: { currency: 'USD', exchangeRate: 83, withTax: false, countryCode: 'US', lutNumber: 'AD270326000123' }, lines: [{ description: 'Fabric', hsn: '5208', qty: 100, rate: 10, gstRate: 5 }] });
  assert.equal(paise(exported.result.invoice.total), paise(83000), 'USD 1,000 at 83 is ₹83,000');
  assert.equal(paise(exported.result.invoice.igst), 0, 'an export under LUT carries no IGST');
  assert.equal(exported.result.invoice.zeroRated, true);

  const sez = (await books.book('create_invoice', { partyName: 'Gandhinagar SEZ Unit', partyGstin: SEZ_BUYER, supplyType: 'SEZWOP', lines: [{ description: 'Fabric', hsn: '5208', qty: 5, rate: 1000, gstRate: 5 }] })).result.invoice;
  assert.deepEqual([sez.supplyType, sez.zeroRated, paise(sez.igst)], ['SEZWOP', true, 0]);

  const tb = await booksBalance(owner);
  const invoices = (await books.snapshot()).invoices;
  assert.equal(invoices.length, 6);
  assert.equal(-tb['4000'], sum(invoices, (i) => i.taxable), 'sales in the ledger equal the invoices\' taxable value');
  assert.equal(-(tb['2100'] + tb['2101'] + (tb['2102'] || 0)), sum(invoices, (i) => i.cgst + i.sgst + i.igst), 'output GST in the ledger equals the invoices\' tax');
});

test('3. a credit note, a reverse-charge bill, receipts and a payment keep the books tied', async () => {
  const books = as(owner);
  const note = (await books.book('create_credit_note', { invoiceId: 'INV-0001', amount: 1050, reason: 'damaged roll returned' })).result.creditNote;
  assert.deepEqual([note.id, paise(note.taxable), paise(note.cgst), paise(note.sgst)], ['CN-0001', 100000, 2500, 2500]);

  const bill = (await books.book('create_purchase', { partyName: 'Advocate Mehta', reverseCharge: true, lines: [{ description: 'Legal fees', hsn: '9982', qty: 1, rate: 10000, gstRate: 18 }] })).result.invoice;
  assert.equal(bill.reverseCharge.kind, 'domestic');
  assert.equal(paise(bill.total), 1000000, 'the advocate is owed the fee only; the GST is the buyer\'s to pay');
  assert.deepEqual([paise(bill.cgst), paise(bill.sgst)], [90000, 90000]);
  assert.ok(bill.selfInvoiceNo, 'a self-invoice is numbered');

  const supplies = (await books.book('create_purchase', { partyName: 'Kolkata Fabrics', partyState: '19', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 100, rate: 200, gstRate: 5 }] })).result.invoice;
  assert.equal(paise(supplies.igst), 100000, 'a bill from West Bengal carries IGST input credit');

  await books.book('record_receipt', { invoiceId: 'INV-0001', amount: 5000, mode: 'bank' });
  await books.book('record_receipt', { invoiceId: 'INV-0002', mode: 'cash' });
  await books.book('record_payment', { billId: bill.id, amount: 10000, mode: 'bank' });

  const tb = await booksBalance(owner);
  const snap = await books.snapshot();
  assert.equal(snap.invoices.find((i) => i.id === 'INV-0001').status, 'partial');
  assert.equal(snap.invoices.find((i) => i.id === 'INV-0002').status, 'paid');
  assert.equal(snap.purchases.find((p) => p.id === bill.id).status, 'paid');
  assert.equal(tb['1001'], paise(2100), 'cash holds the walk-in receipt');
  assert.equal(tb['1002'], paise(5000 - 10000), 'bank holds the receipt less the payment');
  const receivable = Object.entries(tb).filter(([code]) => code.startsWith('9')).reduce((total, [, value]) => total + value, 0);
  const outstanding = snap.invoices.reduce((total, i) => total + paise(i.total), 0) - paise(1050) - paise(5000) - paise(2100);
  assert.equal(receivable, outstanding, 'customer balances equal invoices less the credit note and receipts');
});

test('4. the e-invoice and the e-way bill come back simulated in mock mode and nothing reads as a real IRN', async () => {
  const books = as(owner);
  const irn = await books.post('einvoice', { invoiceId: 'INV-0001' });
  assert.equal(irn.status, 200, irn.text);
  assert.equal(irn.body.ok, true);
  assert.equal(irn.body.mock, true);
  assert.equal(irn.body.simulated, true);
  assert.match(irn.body.hint, /nothing was sent/i);
  assert.match(irn.body.data.irn, /^[0-9A-F]{64}$/);
  const invoice = (await books.snapshot()).invoices.find((i) => i.id === 'INV-0001');
  assert.equal(invoice.mockIrn, irn.body.data.irn);
  assert.ok(!invoice.irn, 'the simulated IRN is not stored as the invoice\'s IRN');

  const missing = await books.post('ewaybill', { op: 'generate', invoiceId: 'INV-0003' });
  assert.equal(missing.body.error, 'TRANSPORT_REQUIRED', missing.text);
  await books.book('set_transport', { invoiceId: 'INV-0003', vehicleNo: 'MH12AB1234', distanceKm: 840, mode: 'road' });
  const ewb = await books.post('ewaybill', { op: 'generate', invoiceId: 'INV-0003' });
  assert.equal(ewb.status, 200, ewb.text);
  assert.equal(ewb.body.ok, true, ewb.text);
  assert.equal(ewb.body.simulated, true);
  const status = await books.query('eway_bill_status', { invoiceId: 'INV-0003' });
  assert.equal(status.needed, true);
  assert.equal(status.status, 'simulated', 'a simulated e-way bill moves the status on');
  assert.equal(status.ewbNo, '', 'the real e-way bill number stays empty');
  assert.equal(status.mockEwbNo, ewb.body.data.ewbNo);
  const again = await books.post('ewaybill', { op: 'generate', invoiceId: 'INV-0003' });
  assert.equal(again.body.data?.ewbNo, ewb.body.data.ewbNo, 'asking again gives the same simulated number');
  const document = await books.query('invoice_document', { id: 'INV-0001' });
  assert.equal(document.einvoice.status, 'mock');
  assert.ok(document.einvoice.ackDate.slice(0, 10) >= document.date, 'the simulated acknowledgement is not dated before the invoice');
  await booksBalance(owner);
});

test('5. GSTR-1 and GSTR-3B for the month match the invoices, bills and credit note', async () => {
  const books = as(owner);
  const snap = await books.snapshot();
  const sales = snap.invoices;
  const fp = `${period.slice(5)}${period.slice(0, 4)}`;
  const json = await books.query('export_gstr1_json', { fp });
  const b2b = json.b2b.flatMap((entry) => entry.inv.map((inv) => ({ ...inv, ctin: entry.ctin })));
  assert.deepEqual(b2b.map((inv) => inv.inum).sort(), ['INV-0001', 'INV-0003', 'INV-0006']);
  assert.equal(b2b.find((inv) => inv.inum === 'INV-0006').inv_typ, 'SEWOP');
  const txval = (invs) => invs.reduce((total, inv) => total + inv.itms.reduce((t, item) => t + paise(item.itm_det.txval), 0), 0);
  assert.equal(txval(b2b), sum(sales.filter((i) => ['INV-0001', 'INV-0003', 'INV-0006'].includes(i.id)), (i) => i.taxable));
  const b2cl = (json.b2cl || []).flatMap((entry) => entry.inv);
  assert.deepEqual(b2cl.map((inv) => inv.inum), ['INV-0004'], 'an inter-state sale to a consumer above the limit is B2CL');
  assert.equal(sum(json.b2cs || [], (row) => row.txval), paise(2000), 'the walk-in sale is B2CS');
  const exp = (json.exp || []).flatMap((entry) => entry.inv);
  assert.deepEqual(exp.map((inv) => inv.inum), ['INV-0005']);
  const cdnr = (json.cdnr || []).flatMap((entry) => entry.nt);
  assert.deepEqual(cdnr.map((nt) => nt.nt_num), ['CN-0001']);
  assert.equal(txval(cdnr), paise(1000));

  const hsnRows = json.hsn.data || [...(json.hsn.hsn_b2b || []), ...(json.hsn.hsn_b2c || [])];
  const hsnTotal = (pick) => hsnRows.reduce((total, row) => total + paise(pick(row)), 0);
  assert.equal(hsnTotal((row) => row.txval), sum(sales, (i) => i.taxable) - paise(1000), 'table 12 holds every invoice less the credit note');
  assert.equal(hsnTotal((row) => row.iamt), sum(sales, (i) => i.igst));
  assert.equal(hsnTotal((row) => row.camt), sum(sales, (i) => i.cgst) - paise(25));
  assert.equal(hsnTotal((row) => row.samt), sum(sales, (i) => i.sgst) - paise(25));
  const byHsn = (code) => hsnRows.filter((row) => row.hsn_sc === code).reduce((total, row) => total + paise(row.txval), 0);
  assert.equal(byHsn('5208'), paise(10000 + 83000 + 5000 - 1000));
  assert.equal(byHsn('5407'), paise(2000));
  assert.equal(byHsn('5007'), paise(60000 + 150000));
  if (json.hsn.hsn_b2b) {
    const registered = sales.filter((i) => i.partyGstin);
    assert.equal(json.hsn.hsn_b2b.reduce((total, row) => total + paise(row.txval), 0), sum(registered, (i) => i.taxable) - paise(1000), 'the B2B part of table 12 holds the registered buyers');
    assert.equal(json.hsn.hsn_b2c.reduce((total, row) => total + paise(row.txval), 0), sum(sales.filter((i) => !i.partyGstin), (i) => i.taxable), 'the B2C part holds the rest');
  }
  const issued = json.doc_issue.doc_det.flatMap((group) => group.docs.map((row) => ({ ...row, doc_num: group.doc_num })));
  const invoiceSeries = issued.find((row) => row.from === 'INV-0001');
  assert.deepEqual([invoiceSeries.to, invoiceSeries.totnum, invoiceSeries.cancel, invoiceSeries.net_issue], [sales.at(-1).id, sales.length, 0, sales.length], 'table 13 counts every invoice issued');
  const noteSeries = issued.find((row) => row.from === 'CN-0001');
  assert.deepEqual([noteSeries.to, noteSeries.totnum, noteSeries.net_issue], ['CN-0001', 1, 1], 'table 13 counts the credit note');
  assert.notEqual(invoiceSeries.doc_num, noteSeries.doc_num);
  const expTxval = exp.reduce((total, inv) => total + inv.itms.reduce((t, item) => t + paise(item.txval), 0), 0);
  assert.equal(txval(b2b) + txval(b2cl) + sum(json.b2cs, (row) => row.txval) + expTxval, sum(sales, (i) => i.taxable), 'every invoice is in exactly one GSTR-1 table, at its taxable value');

  const summary = await books.query('gst_period_summary', { period });
  assert.equal(summary.salesCount, 6);
  const domestic = sales.filter((i) => !i.zeroRated);
  assert.equal(paise(summary.outputTax.total), sum(domestic, (i) => i.cgst + i.sgst + i.igst) - paise(50), 'output tax is the invoices\' tax less the credit note\'s');

  const saved3b = await books.post('gst-gstr3b', { step: 'save', period });
  assert.equal(saved3b.body.ok, true, saved3b.text);
  assert.equal(saved3b.body.simulated, true);
  const sections = saved3b.body.sections;
  assert.equal(paise(sections.outward.txval), sum(domestic, (i) => i.taxable) - paise(1000), '3.1(a) is the taxable domestic sales less the credit note');
  assert.equal(paise(sections.outward.iamt), sum(domestic, (i) => i.igst));
  assert.equal(paise(sections.outward.camt), sum(domestic, (i) => i.cgst) - paise(25));
  assert.equal(paise(sections.credit.iamt), paise(1000), '4(C) holds the IGST credit of the West Bengal bill');
  assert.equal(paise(sections.credit.camt), paise(900), '4(C) holds the reverse charge CGST credit');
  const draft = gstr3bPortalJson(await api.books(owner.businessId), period);
  assert.equal(draft.hash, saved3b.body.save.draftHash, 'the saved GSTR-3B is the draft built from these books');
  const supplies = draft.body.sup_details;
  assert.equal(paise(supplies.osup_zero.txval), paise(83000 + 5000), '3.1(b) holds the export and the SEZ supply');
  assert.equal(paise(supplies.osup_zero.iamt), 0);
  assert.deepEqual([paise(supplies.isup_rev.txval), paise(supplies.isup_rev.camt), paise(supplies.isup_rev.samt)], [paise(10000), paise(900), paise(900)], '3.1(d) holds the reverse charge bill');
  assert.deepEqual(draft.body.inter_sup.unreg_details.map((row) => [row.pos, paise(row.txval), paise(row.iamt)]), [['33', paise(150000), paise(7500)]], '3.2 holds the inter-state sale to a consumer');
  const isrc = draft.body.itc_elg.itc_avl.find((row) => row.ty === 'ISRC');
  assert.deepEqual([paise(isrc.camt), paise(isrc.samt)], [paise(900), paise(900)], '4(A)(3) holds the reverse charge credit');
  await booksBalance(owner);
});

test('6. the GST review is answered through propose and confirm, and filing in mock mode is labelled simulated and records nothing as filed', async () => {
  const books = as(owner);
  const savedGstr1 = await books.post('gst-gstr1', { step: 'save', period });
  assert.equal(savedGstr1.body.ok, true, savedGstr1.text);
  assert.equal(savedGstr1.body.simulated, true);
  const early = await books.post('gst-gstr1', { step: 'file', period, otp: '482913' });
  assert.equal(early.body.error, 'REVIEW_NOT_APPROVED', early.text);

  let review = await books.query('gst_review', { period });
  for (const step of review.steps) {
    const answer = step.id === 'approve' ? 'approve' : 'correct';
    await books.book('gst_review_answer', { period, step: step.id, answer, draftHash: review.draftHash });
    review = await books.query('gst_review', { period });
  }
  assert.equal(review.approved, true);

  for (const step of ['check', 'submit', 'summary', 'otp']) {
    const out = await books.post('gst-gstr1', { step, period });
    assert.equal(out.body.ok, true, `${step}: ${out.text}`);
    assert.equal(out.body.simulated, true);
  }
  const filed = await books.post('gst-gstr1', { step: 'file', period, otp: '482913' });
  assert.equal(filed.body.ok, true, filed.text);
  assert.equal(filed.body.mock, true);
  assert.equal(filed.body.filing, null, 'a simulated filing is not recorded as a filing');
  assert.match(filed.body.ackNum, /^MOCK-/);

  for (const step of ['liability', 'offset', 'otp']) {
    const out = await books.post('gst-gstr3b', { step, period });
    assert.equal(out.body.ok, true, `${step}: ${out.text}`);
    assert.equal(out.body.simulated, true);
  }
  const filed3b = await books.post('gst-gstr3b', { step: 'file', period, otp: '482913' });
  assert.equal(filed3b.body.ok, true, filed3b.text);
  assert.equal(filed3b.body.mock, true);
  assert.ok(!filed3b.body.filing, 'a simulated GSTR-3B is not recorded as a filing');

  assert.deepEqual(await books.query('list_filings'), [], 'no return is listed as filed');
  const deadlines = await books.query('deadlines');
  const thisMonth = deadlines.deadlines.filter((d) => d.period === period && /^GSTR-(1|3B)$/.test(d.returnType));
  assert.equal(thisMonth.length, 2);
  assert.ok(thisMonth.every((d) => !d.filed && !d.arn), 'the month\'s returns are still due');
  const earlier = deadlines.deadlines.filter((d) => d.clientId === 'SELF' && /^\d{4}-\d{2}$/.test(d.period) && d.period < period && !d.filed);
  assert.ok(earlier.some((d) => d.level === 'before_start'), JSON.stringify(earlier));
  assert.ok(earlier.every((d) => d.level !== 'overdue'), 'months before the books start in MyCA are not overdue');
  const filings = await books.get('gst-filings');
  assert.equal(filings.status, 200, filings.text);
  for (const row of [...filings.body.data.gstr1, ...filings.body.data.gstr3b]) assert.equal(Boolean(row.mock || row.filedMock), true, 'every portal row is marked simulated');
  await booksBalance(owner);
});

test('7. the daily job runs the checks for the business and leaves dated reminders with their source', async () => {
  const [year, month] = indiaMonth().split('-').map(Number);
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(year, month, 1, 3, 30) });
  let daily;
  let again;
  try {
    daily = await call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
    again = await call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  } finally {
    mock.timers.reset();
  }
  assert.equal(daily.status, 200, daily.text);
  assert.equal(daily.body.ran, 1);
  assert.deepEqual(daily.body.failed, []);
  assert.equal(again.body.reminders, 0, 'a second run adds no duplicate reminders');
  const reminders = await as(owner).query('list_reminders', { status: 'all' });
  assert.ok(reminders.reminders.length > 0);
  assert.ok(reminders.reminders.every((r) => r.source), 'every automated reminder carries its source');
  await booksBalance(owner);
});

test('8. an accountant is invited, accepts, reads the books and cannot approve the owner\'s filing review', async () => {
  const invited = await as(owner).post('invitations', { phone: MEMBER_PHONE, role: 'accountant' });
  assert.equal(invited.status, 200, invited.text);
  assert.ok(!invited.text.includes(MEMBER_PHONE), 'the invitation answer shows only a hint of the phone');
  const session = await signInByTestCode(MEMBER_PHONE, 'CA laptop');
  assert.equal((await agree(session.accessToken)).status, 200);
  const me = await call('GET', '/v1/me', { token: session.accessToken });
  const invitation = me.body.invitations.find((i) => i.id === invited.body.invitation.id);
  assert.ok(invitation, me.text);
  const accepted = await call('POST', `/v1/invitations/${invitation.id}/accept`, { token: session.accessToken });
  assert.equal(accepted.status, 200, accepted.text);
  member = { token: session.accessToken, refreshToken: session.refreshToken, businessId: owner.businessId, userId: session.user.id };
  const review = await as(member).query('gst_review', { period });
  const approving = await as(member).post('propose', { name: 'gst_review_answer', args: { period, step: 'approve', answer: 'approve', draftHash: review.draftHash } });
  assert.equal(approving.status, 200, approving.text);
  assert.ok(!approving.body.preview?.token, `only the owner approves the month: ${approving.text}`);
  const theirs = await as(member).snapshot();
  assert.equal(theirs.invoices.length, 6);
  const members = await as(owner).get('members');
  assert.equal(members.status, 200, members.text);
  assert.equal(members.body.members.length, 2);
  const exportRefused = await as(member).get('export');
  assert.equal(exportRefused.status, 403);
});

test('9. plans and the trial are readable, and the Tally and Excel exports carry the same books', async () => {
  const plans = await call('GET', '/v1/plans');
  assert.equal(plans.status, 200, plans.text);
  assert.equal(plans.body.currency, 'INR');
  assert.ok(plans.body.plans.some((p) => p.id === 'pro' && p.monthlyRupees > 0));
  const subscription = await as(owner).get('subscription');
  assert.equal(subscription.status, 200, subscription.text);
  assert.ok(subscription.body.trial.daysLeft > 0, 'a new business is in its trial');
  assert.ok(subscription.body.features.includes('einvoice'));

  const tally = await as(owner).query('export_tally', { period });
  const sales = (await as(owner).snapshot()).invoices;
  for (const invoice of sales) assert.ok(tally.xml.includes(`<VOUCHERNUMBER>${invoice.id}</VOUCHERNUMBER>`), `${invoice.id} is in the Tally file`);
  assert.ok(tally.xml.includes('<VOUCHERNUMBER>CN-0001</VOUCHERNUMBER>'), 'the credit note is in the Tally file');
  assert.match(tally.fileName, new RegExp(`${SELLER_GSTIN}_${period}\\.xml$`));

  const xlsx = await as(owner).query('export_xlsx', { report: 'trial_balance' });
  assert.equal(Buffer.from(xlsx.xlsxBase64, 'base64').subarray(0, 2).toString(), 'PK', 'the Excel file is a real workbook');
  const sheet = await as(owner).query('export_xlsx', { report: 'sales', period });
  assert.equal(Buffer.from(sheet.xlsxBase64, 'base64').subarray(0, 2).toString(), 'PK');
});

test('10. chat answers typical English and Hinglish questions from the books and never claims a filing', async () => {
  const books = as(owner);
  const before = await api.books(owner.businessId);
  const payable = await books.query('gst_payable', { period });
  const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const message of ['is mahine GST kitna banega', 'how much GST do I owe this month?']) {
    const out = await books.post('ask', { message });
    assert.equal(out.status, 200, out.text);
    assert.ok(out.body.reply.includes(`tax on sales ${rupees(payable.output.total)}`), `${message}: ${out.body.reply}`);
    assert.ok(out.body.reply.includes(`To pay in cash: ${rupees(payable.toPay)}`), `${message}: ${out.body.reply}`);
    assert.match(out.body.reply, /Reverse charge tax of 1800 on this month's purchases is paid in cash/, 'the answer says why the cash is more than tax less credit');
    assert.notEqual(out.body.posted, true);
  }
  assert.equal(paise(payable.toPay), paise(payable.output.total) - paise(payable.creditUsed) + paise(payable.reverseCharge.total), 'cash is the tax on sales less the credit used, plus the reverse charge tax');
  const ewb = await books.post('ask', { message: 'e-way bill status INV-0003' });
  assert.doesNotMatch(ewb.body.reply, /Say the distance/, ewb.body.reply);
  assert.match(ewb.body.reply, /^Simulated e-way bill \d{12} from the sandbox; nothing reached the e-way bill portal/, ewb.body.reply);
  const outstanding = (await books.snapshot()).invoices.reduce((total, i) => total + paise(i.total), 0) - paise(1050 + 5000 + 2100);
  for (const message of ['who owes me money', 'kaun paisa dena baaki hai']) {
    const out = await books.post('ask', { message });
    assert.ok(out.body.reply.includes(rupees(outstanding / 100)), `${message}: ${out.body.reply}`);
  }
  const file = await books.post('ask', { message: 'file my GSTR-1' });
  assert.equal(file.status, 200, file.text);
  assert.notEqual(file.body.posted, true);
  assert.doesNotMatch(file.body.reply, /(?<!nothing )\b(?:has been|was|is now|successfully)\s+filed\b/i);
  assert.match(file.body.reply, /nothing was filed/);
  assert.match(file.body.reply, /Taxes and filings/);
  assert.match(file.body.reply, /simulated/);
  const after = await api.books(owner.businessId);
  assert.equal(after.ledger.transfers.length, before.ledger.transfers.length, 'questions post nothing');
  await booksBalance(owner);
});

test('11. nothing the service said during the journey claims a real filing with the government', () => {
  for (const { path, text } of seen) {
    assert.doesNotMatch(text, /"filed":true(?![^{}]*"mock":true)/, `${path} claims a filing without the mock flag`);
    assert.doesNotMatch(text, /\bAA\d{2}\d{10}[A-Z0-9]\b/, `${path} carries something shaped like a real ARN`);
  }
  const portalCalls = seen.filter(({ path }) => /\/(einvoice|ewaybill|gst-gstr1|gst-gstr3b)$/.test(path));
  assert.ok(portalCalls.length > 10);
  for (const { path, text } of portalCalls) assert.match(text, /"simulated":true/, `${path} is labelled simulated`);
});

test('12. deleting the account signs the owner out at once and erases them after the grace period', async () => {
  const deleted = await call('DELETE', '/v1/me', { token: owner.token });
  assert.equal(deleted.status, 200, deleted.text);
  const refused = await call('GET', `/v1/businesses/${owner.businessId}/snapshot`, { token: owner.token });
  assert.equal(refused.status, 401);
  const closing = await as(member).get('snapshot');
  assert.equal(closing.status, 404, 'a business its only owner is deleting closes to its members at once');

  api.clock.advance(31 * DAY);
  const purge = await call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(purge.status, 200, purge.text);
  assert.equal(purge.body.purge.users, 1, purge.text);
  const users = await api.db.query('select count(*)::int as n from users where id = $1', [owner.userId]);
  assert.equal(users.rows[0].n, 0, 'the owner is erased');
  const phones = await api.db.query('select count(*)::int as n from users where phone = $1', [OWNER_PHONE]);
  assert.equal(phones.rows[0].n, 0);
  const business = await api.db.query('select count(*)::int as n from businesses where id = $1', [owner.businessId]);
  assert.equal(business.rows[0].n, 0, 'the business only they owned is purged with them');
  const refreshed = await call('POST', '/v1/auth/refresh', { body: { refreshToken: member.refreshToken } });
  assert.equal(refreshed.status, 200, refreshed.text);
  const accountant = await call('GET', '/v1/me', { token: refreshed.body.accessToken });
  assert.equal(accountant.status, 200, 'the accountant\'s own account is untouched');
});
