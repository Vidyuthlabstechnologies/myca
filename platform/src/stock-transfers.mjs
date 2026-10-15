import { createInvoice, createPurchase } from './invoice.mjs';
import { createTransfers, paise } from './ledger.mjs';
import { postingDate } from './dates.mjs';
import { regArg } from './registrations.mjs';
import { recordStock } from './sku-margins.mjs';
import { ewayBillStatus } from './eway-bill.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function locationOf(registration) {
  return registration.kind === 'principal' ? 'principal' : String(registration.label || registration.gstin).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

export function planStockTransfer(state, args = {}) {
  const sku = String(args.sku || '').trim().toUpperCase().slice(0, 64);
  if (!sku) return fail('SKU_REQUIRED');
  const qty = Number(args.qty);
  if (!Number.isFinite(qty) || qty <= 0) return fail('BAD_QTY');
  const from = regArg(state, args.fromGstin);
  if (!from.ok) return { ...from, which: 'from' };
  const to = regArg(state, args.toGstin);
  if (!to.ok) return { ...to, which: 'to' };
  if (from.gstin === to.gstin) return fail('SAME_REGISTRATION', { hint: 'A transfer moves stock between two registrations of the business; within one registration, record the stock at the new location instead.' });
  if (to.registration.effectiveTo) return fail('REGISTRATION_RETIRED', { gstin: to.gstin });
  const date = postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  const master = state.skus && state.skus[sku] ? state.skus[sku] : null;
  const unitValue = args.unitValue == null || args.unitValue === '' ? (master && master.cost != null ? Number(master.cost) : null) : round2(args.unitValue);
  if (unitValue == null) return fail('COST_REQUIRED', { sku, hint: 'Set the SKU cost ("cost of SKU-A is 450") or give unitValue; transfers between registrations go at cost unless you state a value.' });
  if (!(unitValue >= 0)) return fail('BAD_AMOUNT');
  const gstRate = args.gstRate == null || args.gstRate === '' ? (master && master.gstRate != null ? Number(master.gstRate) : null) : Number(args.gstRate);
  if (gstRate == null || !Number.isFinite(gstRate)) return fail('RATE_REQUIRED', { sku, hint: 'Give the GST rate of the goods, or set it on the SKU ("cost of SKU-A is 450 at 12%").' });
  const hsn = String(args.hsn || master?.hsn || '').trim();
  const company = state.company || {};
  const taxable = round2(qty * unitValue);
  return {
    ok: true,
    plan: {
      sku, qty, date, unitValue, gstRate, hsn, taxable, atCost: args.unitValue == null || args.unitValue === '',
      from: from.registration, to: to.registration,
      invoice: { partyName: `${company.name || 'Own'} (${to.registration.label})`, partyGstin: to.gstin, partyState: to.registration.state, date, lines: [{ description: `Stock transfer of ${sku}${master?.name ? ` ${master.name}` : ''}`, hsn, qty, rate: unitValue, gstRate }], registrationGstin: from.registration.kind === 'principal' ? '' : from.gstin },
      purchase: { partyName: `${company.name || 'Own'} (${from.registration.label})`, partyGstin: from.gstin, partyState: from.registration.state, date, lines: [{ description: `Stock transfer of ${sku}${master?.name ? ` ${master.name}` : ''}`, hsn, qty, rate: unitValue, gstRate }], registrationGstin: to.registration.kind === 'principal' ? '' : to.gstin },
      fromLocation: locationOf(from.registration),
      toLocation: locationOf(to.registration),
    },
  };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 0) + 1;
  return state.transferSeq;
}

export function recordStockTransfer(state, args = {}) {
  const planned = planStockTransfer(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const seqBefore = { transfer: state.transferSeq, invoice: state.invoiceSeq, bill: state.billSeq };
  const sale = createInvoice(state, plan.invoice);
  if (!sale.ok) return sale;
  const bill = createPurchase(state, { ...plan.purchase, supplierInvoiceNo: sale.invoice.id });
  if (!bill.ok) return { ...bill, note: `The transfer invoice ${sale.invoice.id} was raised but the receiving bill failed; cancel the invoice.` };
  const invoice = sale.invoice;
  const purchase = bill.bill || bill.purchase || (state.purchases || []).at(-1);
  const amount = round2(invoice.total);
  const party = (state.parties || []).find((p) => p.accountId === invoice.partyAccountId);
  const vendor = (state.vendors || []).find((v) => v.accountId === purchase.partyAccountId);
  if (party && vendor && amount > 0) {
    const posted = createTransfers(state.ledger, [{ id: nextTransferId(state), debitAccountId: vendor.accountId, creditAccountId: party.accountId, amount: paise(amount), invoiceId: invoice.id, code: 'STOCK_TRANSFER_CONTRA', userData: plan.date }]);
    if (posted[0]?.ok) {
      invoice.receipts = [...(invoice.receipts || []), { amount, date: plan.date, mode: 'contra', transfer: purchase.id }];
      invoice.status = 'paid';
      purchase.payments = [...(purchase.payments || []), { amount, date: plan.date, mode: 'contra', transfer: invoice.id }];
      purchase.status = 'paid';
    }
  }
  invoice.transfer = { sku: plan.sku, qty: plan.qty, toGstin: plan.to.gstin, billId: purchase.id, atCost: plan.atCost };
  purchase.transfer = { sku: plan.sku, qty: plan.qty, fromGstin: plan.from.gstin, invoiceId: invoice.id, atCost: plan.atCost };
  recordStock(state, { sku: plan.sku, qty: -plan.qty, location: plan.fromLocation, date: plan.date, ref: invoice.id, note: `Transferred to ${plan.to.label}` });
  recordStock(state, { sku: plan.sku, qty: plan.qty, location: plan.toLocation, date: plan.date, ref: purchase.id, note: `Received from ${plan.from.label}` });
  const eway = ewayBillStatus(state, invoice);
  return { ok: true, invoice, purchase, taxable: plan.taxable, tax: round2(invoice.total - invoice.taxable), ewayBill: { needed: Boolean(eway.needed), why: eway.why || '' }, from: plan.from, to: plan.to, atCost: plan.atCost, seqBefore };
}

export function stockTransferWords(result, money) {
  return `Moved ${result.invoice.transfer.qty} of ${result.invoice.transfer.sku} from ${result.from.label} (${result.from.gstin}) to ${result.to.label} (${result.to.gstin}) ${result.atCost ? 'at cost' : 'at the stated value'}: transfer invoice ${result.invoice.id} for ${money(result.taxable)} plus IGST ${money(result.tax)} under the sending registration, received as bill ${result.purchase.id} with the credit under the receiving one; settled between the two by contra.${result.ewayBill.needed ? ` An e-way bill is needed: ${result.ewayBill.why}` : ''}`;
}
