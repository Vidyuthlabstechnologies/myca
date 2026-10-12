import { createAccounts, createTransfers, listAccounts, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { gstSplit, nextPartyId, partyStateOf } from './chart.mjs';
import { csvRows, htmlEscape } from './text-safe.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { postingDate } from './dates.mjs';
import { invoiceTerms, dueDateOf } from './payment-terms.mjs';
import { planTds, recordTdsEntry, tdsPayableAccountId, wantsTds } from './tds-deduction.mjs';

function padInv(n) {
  return `INV-${String(n).padStart(4, '0')}`;
}

function nextTransferId(state) {
  return BigInt(state.transferSeq = (state.transferSeq || 100000) + 1);
}

function normGstin(gstin) {
  return String(gstin || '').trim().toUpperCase();
}

function stateCodeOf(value) {
  const s = String(value == null ? '' : value).trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : '';
}

// A registered party is its GSTIN: the same name with a new GSTIN is a new party.
// An unregistered party is matched by name among unregistered parties only.
function findParty(list, name, gstin) {
  const g = normGstin(gstin);
  const lower = String(name).toLowerCase();
  return (list || []).find((p) => (g ? normGstin(p.gstin) === g : !p.gstin && p.name.toLowerCase() === lower));
}

function accountName(prefix, list, name, gstin) {
  const clash = (list || []).some((p) => p.name.toLowerCase() === String(name).toLowerCase());
  return clash && gstin ? `${prefix} · ${name} (${gstin})` : `${prefix} · ${name}`;
}

export function ensureParty(state, { name, gstin, stateCode }) {
  let party = findParty(state.parties, name, gstin);
  if (party) return party;
  const g = normGstin(gstin);
  const accountId = nextPartyId(state);
  createAccounts(state.ledger, [{ id: accountId, code: String(accountId), name: accountName('AR', state.parties, name, g), type: 'asset', gstin: g }]);
  party = { name, gstin: g, state: partyStateOf(g) || stateCodeOf(stateCode), accountId: String(accountId) };
  state.parties = state.parties || [];
  state.parties.push(party);
  return party;
}

function idTaken(list, id) {
  return (list || []).some((d) => d.id === id);
}

// Place of supply is decided per invoice: the state given on it, else the
// recipient's GSTIN state, else the supplier's own state. It is never carried
// over from an earlier sale to a same-named party.
function placeOfSupply(input, party, company) {
  return stateCodeOf(input.partyState) || partyStateOf(party.gstin) || company.state;
}

export function lastGstRateFor(state, { name, gstin }, kind = 'sale') {
  const list = kind === 'sale' ? state.invoices : state.purchases;
  const gstinKey = normGstin(gstin);
  const nameKey = String(name || '').trim().toLowerCase();
  const same = (doc) => (gstinKey ? normGstin(doc.partyGstin) === gstinKey : String(doc.partyName || '').trim().toLowerCase() === nameKey);
  const earlier = (list || []).filter((doc) => doc.status !== 'cancelled' && same(doc) && (doc.lines || []).length);
  if (!earlier.length || (!gstinKey && !nameKey)) return null;
  const latest = earlier.reduce((a, b) => (String(b.date) >= String(a.date) ? b : a));
  const rate = latest.lines[latest.lines.length - 1].gstRate;
  return Number.isFinite(Number(rate)) ? { gstRate: Number(rate), from: latest.id, date: latest.date } : null;
}

export function createInvoice(state, input) {
  const company = state.company;
  const date = postingDate(input.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: input.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  if (input.id && idTaken(state.invoices, input.id)) return { ok: false, error: 'DUPLICATE_ID', id: input.id };
  const rawLines = input.lines || [];
  if (!rawLines.length) return { ok: false, error: 'NO_LINES' };
  const unrated = rawLines.findIndex((l) => l.gstRate == null || l.gstRate === '');
  if (unrated >= 0) return { ok: false, error: 'RATE_REQUIRED', line: unrated + 1 };
  const specs = rawLines.map((l) => ({
    qty: Number(l.qty == null || l.qty === '' ? 1 : l.qty),
    rate: Number(l.rate),
    gstRate: Number(l.gstRate),
  }));
  if (specs.some((s) => !Number.isFinite(s.qty) || s.qty <= 0 || !Number.isFinite(s.rate) || s.rate < 0 || !Number.isFinite(s.gstRate))) {
    return { ok: false, error: 'BAD_LINE' };
  }
  const grossTaxable = specs.reduce((sum, s) => sum + Math.round(s.qty * s.rate * 100) / 100, 0);
  if (grossTaxable <= 0) return { ok: false, error: 'ZERO_AMOUNT' };

  const partyName = String(input.partyName ?? '').trim() || 'Walk-in';
  const terms = invoiceTerms(state, { name: partyName, gstin: input.partyGstin, override: input.paymentTermsDays });
  if (terms.error) return { ok: false, error: terms.error };
  const party = ensureParty(state, { name: partyName, gstin: input.partyGstin, stateCode: input.partyState });
  const pos = placeOfSupply(input, party, company);
  const lines = rawLines.map((l, i) => {
    const { qty, rate: rateAmt, gstRate } = specs[i];
    const taxable = Math.round(qty * rateAmt * 100) / 100;
    const split = gstSplit({
      taxable,
      rate: gstRate,
      supplierState: company.state,
      partyState: pos,
    });
    return {
      description: l.description,
      hsn: String(l.hsn ?? '').trim(),
      qty,
      rate: rateAmt,
      gstRate,
      taxable,
      ...split,
      amount: Math.round((taxable + split.tax) * 100) / 100,
    };
  });
  const taxable = lines.reduce((s, l) => s + l.taxable, 0);
  const cgst = lines.reduce((s, l) => s + l.cgst, 0);
  const sgst = lines.reduce((s, l) => s + l.sgst, 0);
  const igst = lines.reduce((s, l) => s + l.igst, 0);
  const total = Math.round((taxable + cgst + sgst + igst) * 100) / 100;
  const assignedSeq = !input.id;
  const seqBefore = state.invoiceSeq || 0;
  if (assignedSeq) {
    do state.invoiceSeq = (state.invoiceSeq || 0) + 1;
    while (idTaken(state.invoices, padInv(state.invoiceSeq)));
  }
  const id = input.id || padInv(state.invoiceSeq);
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [];
  bundle.push({
    id: nextTransferId(state),
    debitAccountId: party.accountId,
    creditAccountId: 4000,
    amount: paise(taxable),
    flags: linked,
    invoiceId: id,
    code: 'SALES',
  });
  if (cgst > 0) {
    bundle.push({
      id: nextTransferId(state),
      debitAccountId: party.accountId,
      creditAccountId: 2100,
      amount: paise(cgst),
      flags: linked,
      invoiceId: id,
      code: 'CGST',
    });
  }
  if (sgst > 0) {
    bundle.push({
      id: nextTransferId(state),
      debitAccountId: party.accountId,
      creditAccountId: 2101,
      amount: paise(sgst),
      flags: linked,
      invoiceId: id,
      code: 'SGST',
    });
  }
  if (igst > 0) {
    bundle.push({
      id: nextTransferId(state),
      debitAccountId: party.accountId,
      creditAccountId: 2102,
      amount: paise(igst),
      flags: linked,
      invoiceId: id,
      code: 'IGST',
    });
  }
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((p) => !p.ok)) {
    if (assignedSeq) state.invoiceSeq = seqBefore;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  const invoice = {
    id,
    date,
    partyName: party.name,
    partyGstin: party.gstin,
    partyState: pos,
    placeOfSupply: pos,
    partyAccountId: party.accountId,
    lines,
    taxable,
    cgst,
    sgst,
    igst,
    total,
    ...(terms.days == null ? {} : { paymentTermsDays: terms.days, dueDate: dueDateOf(date, terms.days) }),
    status: 'posted',
    transferIds: posted.map((p) => p.id),
  };
  state.invoices = state.invoices || [];
  state.invoices.push(invoice);
  return { ok: true, invoice, posted };
}

export function recordReceipt(state, { invoiceId, amount, date, mode } = {}) {
  const inv = (state.invoices || []).find((i) => i.id === invoiceId);
  if (!inv) return { ok: false, error: 'INVOICE_NOT_FOUND' };
  const receiptDate = date == null || date === '' ? inv.date : postingDate(date);
  if (!receiptDate) return { ok: false, error: 'INVALID_DATE', date };
  if (isPeriodLocked(state, receiptDate)) return { ok: false, error: 'PERIOD_LOCKED', date: receiptDate, lockThrough: state.lockThrough };
  const party = (state.parties || []).find((p) => (inv.partyAccountId ? p.accountId === inv.partyAccountId : p.name === inv.partyName && normGstin(p.gstin) === normGstin(inv.partyGstin)));
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND' };
  if (inv.status === 'cancelled') return { ok: false, error: 'INVOICE_CANCELLED', invoiceId };
  const already = (inv.receipts || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const credited = (state.creditNotes || []).filter((note) => note.invoiceId === invoiceId).reduce((s, note) => s + Number(note.total || 0), 0);
  const amt = amount == null || amount === '' ? Math.round((inv.total - already - credited) * 100) / 100 : Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  if (already + credited + amt > inv.total + 0.01) {
    return {
      ok: false,
      error: 'OVERPAYMENT',
      invoiceId,
      due: Math.round((inv.total - already - credited) * 100) / 100,
    };
  }
  const bankOrCash = mode === 'cash' ? 1001 : 1002;
  const posted = createTransfers(state.ledger, [{
    id: nextTransferId(state),
    debitAccountId: bankOrCash,
    creditAccountId: party.accountId,
    amount: paise(amt),
    invoiceId,
    code: 'RECEIPT',
    userData: receiptDate,
  }]);
  if (!posted[0].ok) return { ok: false, error: posted[0].error };
  inv.receipts = inv.receipts || [];
  inv.receipts.push({ amount: amt, date: receiptDate, mode: mode || 'bank' });
  const received = inv.receipts.reduce((s, r) => s + r.amount, 0);
  inv.status = received + credited >= inv.total - 0.01 ? 'paid' : 'partial';
  return { ok: true, invoice: inv, posted };
}

export function ensureVendor(state, { name, gstin, stateCode }) {
  let party = findParty(state.vendors, name, gstin);
  if (party) return party;
  const g = normGstin(gstin);
  const used = (state.vendors || []).map((p) => Number(p.accountId));
  let n = 80001;
  while (used.includes(n)) n += 1;
  createAccounts(state.ledger, [{ id: n, code: String(n), name: accountName('AP', state.vendors, name, g), type: 'liability', gstin: g }]);
  party = { name, gstin: g, state: partyStateOf(g) || stateCodeOf(stateCode), accountId: String(n) };
  state.vendors = state.vendors || [];
  state.vendors.push(party);
  return party;
}

export function createPurchase(state, input) {
  const company = state.company;
  const date = postingDate(input.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: input.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  if (input.id && idTaken(state.purchases, input.id)) return { ok: false, error: 'DUPLICATE_ID', id: input.id };
  const supplierInvoiceNo = String(input.supplierInvoiceNo ?? '').trim();
  if (supplierInvoiceNo.length > 16) return { ok: false, error: 'SUPPLIER_NUMBER_TOO_LONG', supplierInvoiceNo };
  if (supplierInvoiceNo) {
    const key = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const gstinKey = normGstin(input.partyGstin);
    const nameKey = String(input.partyName || '').trim().toLowerCase();
    const repeat = (state.purchases || []).find((bill) => key(bill.supplierInvoiceNo) === key(supplierInvoiceNo)
      && (gstinKey ? normGstin(bill.partyGstin) === gstinKey : String(bill.partyName || '').trim().toLowerCase() === nameKey));
    if (repeat) return { ok: false, error: 'DUPLICATE_SUPPLIER_BILL', supplierInvoiceNo, existing: repeat.id };
  }
  const rawLines = input.lines || [];
  if (!rawLines.length) return { ok: false, error: 'NO_LINES' };
  const unrated = rawLines.findIndex((l) => l.gstRate == null || l.gstRate === '');
  if (unrated >= 0) return { ok: false, error: 'RATE_REQUIRED', line: unrated + 1 };
  const specs = rawLines.map((l) => ({
    qty: Number(l.qty == null || l.qty === '' ? 1 : l.qty),
    rate: Number(l.rate),
    gstRate: Number(l.gstRate),
  }));
  if (specs.some((s) => !Number.isFinite(s.qty) || s.qty <= 0 || !Number.isFinite(s.rate) || s.rate < 0 || !Number.isFinite(s.gstRate))) {
    return { ok: false, error: 'BAD_LINE' };
  }
  const grossTaxable = specs.reduce((sum, s) => sum + Math.round(s.qty * s.rate * 100) / 100, 0);
  if (grossTaxable <= 0) return { ok: false, error: 'ZERO_AMOUNT' };

  const vendorName = String(input.partyName ?? '').trim() || 'Supplier';
  const vendor = ensureVendor(state, { name: vendorName, gstin: input.partyGstin, stateCode: input.partyState });
  const lines = rawLines.map((l, i) => {
    const { qty, rate: rateAmt, gstRate } = specs[i];
    const taxable = Math.round(qty * rateAmt * 100) / 100;
    const split = gstSplit({
      taxable,
      rate: gstRate,
      supplierState: partyStateOf(vendor.gstin) || stateCodeOf(input.partyState) || company.state,
      partyState: company.state,
    });
    return {
      description: l.description,
      hsn: String(l.hsn ?? '').trim(),
      qty,
      rate: rateAmt,
      gstRate,
      taxable,
      ...split,
      amount: Math.round((taxable + split.tax) * 100) / 100,
    };
  });
  const taxable = lines.reduce((s, l) => s + l.taxable, 0);
  const cgst = lines.reduce((s, l) => s + l.cgst, 0);
  const sgst = lines.reduce((s, l) => s + l.sgst, 0);
  const igst = lines.reduce((s, l) => s + l.igst, 0);
  const total = Math.round((taxable + cgst + sgst + igst) * 100) / 100;
  let tds = null;
  if (wantsTds(input)) {
    const planned = planTds(state, input, { date, basis: taxable, payable: total, payee: vendor.name, beforeGst: true });
    if (!planned.ok) return planned;
    tds = planned.tds;
  }
  const assignedSeq = !input.id;
  const billName = (n) => `BILL-${String(n).padStart(4, '0')}`;
  const seqBefore = state.billSeq || 0;
  if (assignedSeq) {
    do state.billSeq = (state.billSeq || 0) + 1;
    while (idTaken(state.purchases, billName(state.billSeq)));
  }
  const id = input.id || billName(state.billSeq);
  const linked = TRANSFER_FLAGS.LINKED;
  const itcEligible = input.itcEligible !== false;
  const bundle = [
    { id: nextTransferId(state), debitAccountId: 5000, creditAccountId: vendor.accountId, amount: paise(taxable), flags: linked, invoiceId: id, code: 'PURCHASE' },
  ];
  if (itcEligible) {
    if (cgst > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 1200, creditAccountId: vendor.accountId, amount: paise(cgst), flags: linked, invoiceId: id, code: 'ITC-CGST' });
    if (sgst > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 1201, creditAccountId: vendor.accountId, amount: paise(sgst), flags: linked, invoiceId: id, code: 'ITC-SGST' });
    if (igst > 0) bundle.push({ id: nextTransferId(state), debitAccountId: 1202, creditAccountId: vendor.accountId, amount: paise(igst), flags: linked, invoiceId: id, code: 'ITC-IGST' });
  } else if (cgst + sgst + igst > 0) {
    // Blocked credit (section 17(5)) is part of the cost, not an input tax asset.
    bundle.push({ id: nextTransferId(state), debitAccountId: 5000, creditAccountId: vendor.accountId, amount: paise(cgst + sgst + igst), flags: linked, invoiceId: id, code: 'GST-BLOCKED' });
  }
  if (tds && tds.tds > 0) bundle.push({ id: nextTransferId(state), debitAccountId: vendor.accountId, creditAccountId: tdsPayableAccountId(), amount: paise(tds.tds), flags: linked, invoiceId: id, code: `TDS-${tds.section}` });
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((p) => !p.ok)) {
    if (assignedSeq) state.billSeq = seqBefore;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  if (tds) recordTdsEntry(state, tds, id);
  const bill = {
    id, ...(supplierInvoiceNo ? { supplierInvoiceNo } : {}), date, partyName: vendor.name, partyGstin: vendor.gstin, partyState: vendor.state,
    partyAccountId: vendor.accountId,
    lines, taxable, cgst, sgst, igst, total, status: 'posted', kind: 'purchase',
    itcEligible,
    ...(tds ? { tds: { section: tds.section, rate: tds.rate, basis: tds.basis, amount: tds.tds, pan: tds.pan } } : {}),
    transferIds: posted.map((p) => p.id),
  };
  state.purchases = state.purchases || [];
  state.purchases.push(bill);
  return { ok: true, invoice: bill, posted };
}

export function billOutstanding(bill) {
  const paid = (bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.round((Number(bill.total || 0) - Number(bill.tds?.amount || 0) - paid) * 100) / 100;
}

export function cashInHand(state) {
  const cash = listAccounts(state.ledger).find((account) => account.code === '1001');
  return cash ? Math.round((cash.debitsPosted - cash.creditsPosted) * 100) / 100 : 0;
}

export function planPayment(state, { billId, amount, date, mode } = {}) {
  const bill = (state.purchases || []).find((item) => item.id === billId);
  if (!bill) return { ok: false, error: 'BILL_NOT_FOUND', billId };
  const paidOn = date == null || date === '' ? null : postingDate(date);
  if (date != null && date !== '' && !paidOn) return { ok: false, error: 'INVALID_DATE', date };
  const when = paidOn || bill.date;
  if (when < bill.date) return { ok: false, error: 'BEFORE_BILL', date: when, billDate: bill.date };
  if (isPeriodLocked(state, when)) return { ok: false, error: 'PERIOD_LOCKED', date: when, lockThrough: state.lockThrough };
  const vendor = (state.vendors || []).find((item) => item.accountId === bill.partyAccountId);
  if (!vendor) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const due = billOutstanding(bill);
  if (due <= 0.005) return { ok: false, error: 'BILL_PAID', billId, total: bill.total };
  const amt = amount == null || amount === '' ? due : Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'BAD_AMOUNT' };
  if (amt > due + 0.005) return { ok: false, error: 'OVERPAYMENT', billId, due };
  const how = mode === 'cash' ? 'cash' : 'bank';
  if (how === 'cash') {
    const inHand = cashInHand(state);
    if (inHand + 0.005 < amt) return { ok: false, error: 'INSUFFICIENT_CASH', inHand, amount: amt };
  }
  return { ok: true, bill, vendor, amount: amt, date: when, mode: how, due, remaining: Math.round((due - amt) * 100) / 100 };
}

export function recordPayment(state, args = {}) {
  const plan = planPayment(state, args);
  if (!plan.ok) return plan;
  const { bill, vendor, amount, date, mode } = plan;
  const posted = createTransfers(state.ledger, [{
    id: nextTransferId(state),
    debitAccountId: vendor.accountId,
    creditAccountId: mode === 'cash' ? 1001 : 1002,
    amount: paise(amount),
    invoiceId: bill.id,
    code: 'PAYMENT',
    userData: date,
  }]);
  if (!posted[0].ok) return { ok: false, error: posted[0].error };
  bill.payments = bill.payments || [];
  bill.payments.push({ amount, date, mode });
  bill.status = billOutstanding(bill) <= 0.005 ? 'paid' : 'partial';
  return { ok: true, bill, payment: { amount, date, mode }, remaining: billOutstanding(bill), posted };
}

export function printInvoice(state, id) {
  const inv = [...(state.invoices || []), ...(state.purchases || [])].find((i) => i.id === id);
  if (!inv) return { ok: false, error: 'NOT_FOUND' };
  const c = state.company;
  const rows = inv.lines.map((l) => `<tr><td>${htmlEscape(l.description)}</td><td>${htmlEscape(l.hsn)}</td><td class="num">${htmlEscape(l.qty)}</td><td class="num">${htmlEscape(l.rate)}</td><td class="num">${htmlEscape(l.taxable)}</td><td class="num">${htmlEscape(l.gstRate)}%</td><td class="num">${htmlEscape(l.amount)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${htmlEscape(inv.id)}</title>
<style>body{font-family:Georgia,serif;padding:32px;color:#1c1917}h1{border-bottom:3px double #b42318}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #e4d8c4;padding:6px;text-align:left}.num{text-align:right}footer{margin-top:24px;border-top:3px double #b42318;padding-top:8px}</style></head>
<body><p>${htmlEscape(c.name)} · ${htmlEscape(c.gstin)}</p><h1>Tax Invoice ${htmlEscape(inv.id)}</h1>
<p>${inv.kind === 'purchase' ? 'Supplier' : 'Bill to'}: ${htmlEscape(inv.partyName)} ${htmlEscape(inv.partyGstin || '')}<br>Date ${htmlEscape(inv.date)}</p>
<table><thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<footer>Taxable ₹${htmlEscape(inv.taxable)} &nbsp; CGST ₹${htmlEscape(inv.cgst)} &nbsp; SGST ₹${htmlEscape(inv.sgst)} &nbsp; IGST ₹${htmlEscape(inv.igst)}<br><strong>Total ₹${htmlEscape(inv.total)}</strong></footer></body></html>`;
  return { ok: true, html, invoice: inv };
}

export function purchasesToInwardCsv(purchases) {
  const rows = [['invoiceNo', 'date', 'supplierGstin', 'supplierName', 'hsn', 'rate', 'taxableValue', 'cgst', 'sgst', 'igst', 'isInputService', 'itcEligible', 'itcAvailability']];
  for (const inv of purchases || []) {
    for (const l of inv.lines) {
      rows.push([
        inv.id, inv.date, inv.partyGstin, inv.partyName, l.hsn, l.gstRate, l.taxable, l.cgst, l.sgst, l.igst,
        'N', inv.itcEligible === false ? 'N' : 'Y', 'Y',
      ]);
    }
  }
  return csvRows(rows);
}

export function invoicesToSalesCsv(invoices) {
  const rows = [['invoiceNo', 'date', 'partyGstin', 'partyName', 'partyState', 'hsn', 'rate', 'taxableValue', 'cgst', 'sgst', 'igst', 'cess', 'isEcommerce']];
  for (const inv of invoices) {
    for (const l of inv.lines) {
      rows.push([
        inv.id,
        inv.date,
        inv.partyGstin,
        inv.partyName,
        inv.partyState || inv.placeOfSupply,
        l.hsn,
        l.gstRate,
        l.taxable,
        l.cgst,
        l.sgst,
        l.igst,
        0,
        'N',
      ]);
    }
  }
  return csvRows(rows);
}
