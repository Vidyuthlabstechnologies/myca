import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, printInvoice } from '../src/invoice.mjs';
import { createCreditNote, planCreditNote } from '../src/credit-notes.mjs';
import { createDebitNote, createPurchaseNote } from '../src/debit-notes.mjs';
import { planAmendment, amendInvoice } from '../src/invoice-amendments.mjs';
import { invoiceDocument } from '../src/invoice-document.mjs';
import { invoiceToNicPayload, nicPayloadProblems, nicPartyFor } from '../src/nic-config.mjs';
import { addRecurring, runRecurring } from '../src/recurring.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === String(code));
const BUYER = '27AAACH7409R1Z1';

function books() {
  const state = createState();
  state.company = { ...state.company, address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' };
  return state;
}

function exportSale(state) {
  const out = createInvoice(state, { date: '2026-09-05', partyName: 'Acme Inc', exportSale: { currency: 'USD', exchangeRate: 80, countryCode: 'US' }, lines: [{ description: 'Software', hsn: '998314', qty: 1, rate: 100, gstRate: 18 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.invoice;
}

test('invoice totals are rounded to paise, not left as float sums', () => {
  const state = books();
  const out = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'A', hsn: '5208', qty: 1, rate: 1.1, gstRate: 0 }, { description: 'B', hsn: '5208', qty: 1, rate: 2.2, gstRate: 0 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.invoice.taxable, 3.3);
  assert.equal(out.invoice.total, 3.3);
  assert.doesNotMatch(printInvoice(state, out.invoice.id).html, /3\.30000/);
  const bill = createPurchase(state, { date: '2026-09-05', partyName: 'Mill', partyGstin: BUYER, lines: [{ description: 'A', hsn: '5208', qty: 1, rate: 1.1, gstRate: 0 }, { description: 'B', hsn: '5208', qty: 1, rate: 2.2, gstRate: 0 }] });
  assert.equal(bill.invoice.taxable, 3.3);
});

test('a negative GST rate is refused on a sale and a purchase', () => {
  const state = books();
  const sale = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', lines: [{ description: 'A', qty: 1, rate: 1000, gstRate: -18 }] });
  assert.equal(sale.ok, false);
  assert.equal(sale.error, 'BAD_LINE');
  const bill = createPurchase(state, { date: '2026-09-05', partyName: 'Mill', lines: [{ description: 'A', qty: 1, rate: 1000, gstRate: -18 }] });
  assert.equal(bill.ok, false);
  assert.equal(bill.error, 'BAD_LINE');
});

test('a credit note on a zero-rated export (LUT) carries no IGST and never exceeds the invoice', () => {
  const state = books();
  const invoice = exportSale(state);
  assert.equal(invoice.igst, 0);
  const out = createCreditNote(state, { invoiceId: invoice.id, date: '2026-09-10', reason: 'Returned' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.creditNote.igst, 0);
  assert.equal(out.creditNote.total, invoice.total);
  const part = planCreditNote(state, { invoiceId: invoice.id, date: '2026-09-10', reason: 'x', amount: 1 });
  assert.equal(part.ok, false);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(acc(state, 2102).debitsPosted, 0);
});

test('a debit note on a zero-rated export (LUT) carries no IGST', () => {
  const state = books();
  const invoice = exportSale(state);
  const out = createDebitNote(state, { invoiceId: invoice.id, date: '2026-09-10', reason: 'Price up', amount: 800 });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.debitNote.igst, 0);
  assert.equal(out.debitNote.total, 800);
  assert.equal(acc(state, 2102).creditsPosted, 0);
});

test('an amendment of a zero-rated export (LUT) does not add IGST', () => {
  const state = books();
  const invoice = exportSale(state);
  state.filings = [{ returnType: 'GSTR-1', period: '2026-09', gstin: '' }];
  const planned = planAmendment(state, { invoiceId: invoice.id, date: '2026-10-05', reason: 'Rate', lines: [{ description: 'Software', hsn: '998314', qty: 1, rate: 9000, gstRate: 18 }] });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.equal(planned.plan.after.igst, 0);
  assert.equal(planned.plan.after.total, 9000);
});

test('a supplier debit note on a reverse charge bill owes the supplier only the value, and reverses the RCM tax against the input credit', () => {
  const state = books();
  const bill = createPurchase(state, { date: '2026-09-05', partyName: 'Ravi Transport', reverseCharge: true, partyAddress: 'Hadapsar, Pune 411028', lines: [{ description: 'Freight', hsn: '996511', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.equal(bill.invoice.total, 1000);
  const vendor = bill.invoice.partyAccountId;
  const out = createPurchaseNote(state, { billId: bill.invoice.id, date: '2026-09-10', reason: 'Overcharged', amount: 400 });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.purchaseNote.taxable, 400);
  assert.equal(out.purchaseNote.total, 400);
  assert.equal(out.purchaseNote.cgst, 10);
  assert.equal(acc(state, vendor).debitsPosted, 400);
  assert.equal(acc(state, 2100).debitsPosted, 10);
  assert.equal(acc(state, 1200).creditsPosted, 10);
  assert.equal(out.outstanding, 600);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const full = createPurchaseNote(state, { billId: bill.invoice.id, date: '2026-09-11', reason: 'Rest', amount: 600 });
  assert.equal(full.ok, true, JSON.stringify(full));
  assert.equal(full.outstanding, 0);
});

test('a credit note that reduces GST is refused after 30 November following the end of the invoice year (section 34(2))', () => {
  const state = books();
  const { invoice } = createInvoice(state, { date: '2025-06-10', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  const late = planCreditNote(state, { invoiceId: invoice.id, date: '2026-12-01', reason: 'Late discount', amount: 105 });
  assert.equal(late.ok, false);
  assert.equal(late.error, 'CREDIT_NOTE_TIME_BARRED');
  assert.equal(late.lastDate, '2026-11-30');
  const inTime = planCreditNote(state, { invoiceId: invoice.id, date: '2026-11-30', reason: 'Discount', amount: 105 });
  assert.equal(inTime.ok, true, JSON.stringify(inTime));
  const march = createInvoice(state, { date: '2026-03-31', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] }).invoice;
  assert.equal(planCreditNote(state, { invoiceId: march.id, date: '2026-11-30', reason: 'x', amount: 105 }).ok, true);
  assert.equal(planCreditNote(state, { invoiceId: march.id, date: '2026-12-01', reason: 'x', amount: 105 }).error, 'CREDIT_NOTE_TIME_BARRED');
  const april = createInvoice(state, { date: '2026-04-01', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] }).invoice;
  assert.equal(planCreditNote(state, { invoiceId: april.id, date: '2026-12-01', reason: 'x', amount: 105 }).ok, true);
});

test('an amendment is refused after 30 November following the end of the invoice year (section 37(3))', () => {
  const state = books();
  const { invoice } = createInvoice(state, { date: '2025-06-10', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  state.filings = [{ returnType: 'GSTR-1', period: '2025-06', gstin: '' }];
  const lines = [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1200, gstRate: 5 }];
  const late = planAmendment(state, { invoiceId: invoice.id, date: '2026-12-01', reason: 'Rate', lines });
  assert.equal(late.ok, false);
  assert.equal(late.error, 'AMENDMENT_TIME_BARRED');
  assert.equal(planAmendment(state, { invoiceId: invoice.id, date: '2026-11-30', reason: 'Rate', lines }).ok, true);
});

test('an amendment that raises a paid invoice leaves it part paid, not paid', () => {
  const state = books();
  const { invoice } = createInvoice(state, { date: '2026-08-10', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  invoice.receipts = [{ amount: 1050, date: '2026-08-11', mode: 'bank' }];
  invoice.status = 'paid';
  state.filings = [{ returnType: 'GSTR-1', period: '2026-08', gstin: '' }];
  const out = amendInvoice(state, { invoiceId: invoice.id, date: '2026-10-05', reason: 'Rate', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 2000, gstRate: 5 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.invoice.status, 'partial');
});

test('the invoice document balance and UPI amount include debit notes', () => {
  const state = books();
  const { invoice } = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(createDebitNote(state, { invoiceId: invoice.id, date: '2026-09-10', reason: 'Price up', amount: 210 }).ok, true);
  const doc = invoiceDocument(state, invoice.id);
  assert.equal(doc.data.balance, 1260);
});

test('an export invoice is shown as ready for e-invoicing, not as an unregistered B2C sale', () => {
  const state = books();
  const invoice = exportSale(state);
  const doc = invoiceDocument(state, invoice.id);
  assert.equal(doc.data.einvoice.status, 'ready');
});

test('an e-invoice document number over 16 characters or with other specials is a problem, not silently cut', () => {
  const state = books();
  const party = { address: '12 FC Road, Pune 411004' };
  const base = createInvoice(state, { id: 'INV/2026-27/000123', date: '2026-09-05', partyName: 'Retail Mart', partyGstin: BUYER, partyAddress: party.address, lines: [{ description: 'Cloth', hsn: '520811', qty: 1, rate: 1000, gstRate: 5 }] }).invoice;
  const codes = nicPayloadProblems(state.company, base, nicPartyFor(state, base), '2026-09-30').map((p) => p.code);
  assert.ok(codes.includes('DOC_NUMBER_INVALID'), codes.join());
  const odd = createInvoice(state, { id: 'INV#12', date: '2026-09-05', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '520811', qty: 1, rate: 1000, gstRate: 5 }] }).invoice;
  assert.ok(nicPayloadProblems(state.company, odd, nicPartyFor(state, odd), '2026-09-30').some((p) => p.code === 'DOC_NUMBER_INVALID'));
  const fine = createInvoice(state, { id: 'INV/26-27/0001', date: '2026-09-05', partyName: 'Retail Mart', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '520811', qty: 1, rate: 1000, gstRate: 5 }] }).invoice;
  assert.ok(!nicPayloadProblems(state.company, fine, nicPartyFor(state, fine), '2026-09-30').some((p) => p.code === 'DOC_NUMBER_INVALID'));
  assert.equal(invoiceToNicPayload(state.company, fine, nicPartyFor(state, fine)).DocDtls.No, 'INV/26-27/0001');
});

test('an invoice dated today is not a future document in the hours before 05:30 IST', (t) => {
  const zone = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  t.after(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });
  const state = books();
  const { invoice } = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: BUYER, partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'Cloth', hsn: '520811', qty: 1, rate: 1000, gstRate: 5 }] });
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-04T21:30:00Z') });
  t.after(() => mock.timers.reset());
  const codes = nicPayloadProblems(state.company, invoice, nicPartyFor(state, invoice)).map((p) => p.code);
  assert.ok(!codes.includes('FUTURE_DOCUMENT'), codes.join());
});

test('a repeating invoice keeps the place of supply of an unregistered buyer in another state', () => {
  const state = books();
  const added = addRecurring(state, { kind: 'invoice', every: 'month', startDate: '2026-01-31', partyName: 'Karnataka Shop', partyState: '29', lines: [{ description: 'Rent', hsn: '997212', qty: 1, rate: 10000, gstRate: 18 }] });
  assert.equal(added.ok, true, JSON.stringify(added));
  const run = runRecurring(state, { asOf: '2026-03-31' });
  assert.deepEqual(run.data.made.map((row) => row.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  const made = state.invoices.filter((inv) => inv.partyName === 'Karnataka Shop');
  assert.ok(made.every((inv) => inv.placeOfSupply === '29' && inv.igst === 1800 && inv.cgst === 0), JSON.stringify(made.map((inv) => [inv.placeOfSupply, inv.igst])));
});

test('a repeating reverse charge import keeps its reverse charge', () => {
  const state = books();
  const added = addRecurring(state, { kind: 'bill', every: 'month', startDate: '2026-09-01', partyName: 'Cloud Co', originCountry: 'US', lines: [{ description: 'Hosting', hsn: '998315', qty: 1, rate: 5000, gstRate: 18 }] });
  assert.equal(added.ok, true, JSON.stringify(added));
  runRecurring(state, { asOf: '2026-09-01' });
  const bill = state.purchases.find((item) => item.partyName === 'Cloud Co');
  assert.equal(bill.reverseCharge?.kind, 'import');
  assert.equal(bill.total, 5000);
});
