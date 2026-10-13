import { createHash } from 'node:crypto';
import { periodSummary } from './period-summary.mjs';
import { documentsForPeriod } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { filingFor } from './filings.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fyOf(period) {
  const [y, m] = period.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function monthsOf(fy) {
  const start = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? start : start + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
}

function heads() {
  return { igst: 0, cgst: 0, sgst: 0, total: 0 };
}

function add(target, value) {
  for (const key of ['igst', 'cgst', 'sgst']) target[key] = round2(target[key] + Number(value?.[key] || 0));
  target.total = round2(target.igst + target.cgst + target.sgst);
  return target;
}

export function gstr9Draft(state, args = {}) {
  const fy = String(args.fy || '').trim() || fyOf(localToday().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(fy)) return { ok: false, error: 'BAD_FY', hint: 'Use the financial year as 2026-27.' };
  const months = monthsOf(fy);
  const today = localToday().slice(0, 7);
  const outward = { taxable: 0, tax: heads(), creditNotes: { taxable: 0, tax: heads() }, debitNotes: { taxable: 0, tax: heads() }, b2b: 0, b2c: 0, invoices: 0 };
  const itc = { availed: heads(), reversed: heads(), blocked: heads(), purchases: 0 };
  const twoB = { months: 0, available: heads() };
  const paid = { cash: heads(), credit: 0, interest: 0, lateFee: 0, months: 0 };
  const hsn = new Map();
  const monthRows = [];
  const notes = new Set();
  let unreviewed = false;
  for (const period of months) {
    if (period > today) continue;
    const docs = documentsForPeriod(state, period);
    if (!docs.ok || !docs.period || (docs.invoices.length + docs.purchases.length + docs.creditNotes.length + (docs.debitNotes || []).length + (docs.purchaseNotes || []).length) === 0) {
      monthRows.push({ period, documents: 0, filed: filingFor(state, 'GSTR-3B', period) ? 'filed' : 'nothing' });
      continue;
    }
    const summary = periodSummary(state, period);
    if (!summary.ok) continue;
    const s = summary.data;
    outward.taxable = round2(outward.taxable + s.taxableSales + Number(s.creditNotes?.taxable || 0) - Number(s.debitNotes?.taxable || 0));
    add(outward.tax, { igst: Number(s.outputTax.igst) + Number(s.creditNotes?.igst || 0) - Number(s.debitNotes?.igst || 0), cgst: Number(s.outputTax.cgst) + Number(s.creditNotes?.cgst || 0) - Number(s.debitNotes?.cgst || 0), sgst: Number(s.outputTax.sgst) + Number(s.creditNotes?.sgst || 0) - Number(s.debitNotes?.sgst || 0) });
    outward.creditNotes.taxable = round2(outward.creditNotes.taxable + Number(s.creditNotes?.taxable || 0));
    add(outward.creditNotes.tax, s.creditNotes);
    outward.debitNotes.taxable = round2(outward.debitNotes.taxable + Number(s.debitNotes?.taxable || 0));
    add(outward.debitNotes.tax, s.debitNotes);
    outward.invoices += docs.invoices.length;
    outward.b2b += docs.invoices.filter((inv) => inv.partyGstin).length;
    outward.b2c += docs.invoices.filter((inv) => !inv.partyGstin).length;
    add(itc.availed, { igst: Number(s.inputCredit.igst) + Number(s.purchaseNotes?.igst || 0), cgst: Number(s.inputCredit.cgst) + Number(s.purchaseNotes?.cgst || 0), sgst: Number(s.inputCredit.sgst) + Number(s.purchaseNotes?.sgst || 0) });
    add(itc.reversed, s.purchaseNotes);
    itc.purchases += docs.purchases.length;
    for (const bill of docs.purchases) if (bill.itcEligible === false) add(itc.blocked, bill);
    for (const inv of docs.invoices) {
      if (inv.status === 'cancelled') continue;
      for (const line of inv.lines || []) {
        const key = `${line.hsn || ''}|${line.gstRate}`;
        const row = hsn.get(key) || { hsn: line.hsn || '', ratePercent: Number(line.gstRate || 0), qty: 0, taxable: 0, tax: heads() };
        row.qty = round2(row.qty + Number(line.qty || 0));
        row.taxable = round2(row.taxable + Number(line.taxable || 0));
        add(row.tax, line);
        hsn.set(key, row);
      }
    }
    const stored = state.gstr2b && typeof state.gstr2b === 'object' && Object.hasOwn(state.gstr2b, period) ? state.gstr2b[period] : null;
    if (stored) {
      twoB.months += 1;
      for (const row of stored.rows || []) add(twoB.available, row);
    }
    const payment = state.gstPayments && typeof state.gstPayments === 'object' && Object.hasOwn(state.gstPayments, period) ? state.gstPayments[period] : null;
    if (payment) {
      paid.months += 1;
      add(paid.cash, payment.cash);
      paid.credit = round2(paid.credit + Number(payment.creditUsed || 0));
      paid.interest = round2(paid.interest + Number(payment.interest || 0));
      paid.lateFee = round2(paid.lateFee + Number(payment.lateFee || 0));
      if (payment.unreviewed) unreviewed = true;
    }
    monthRows.push({ period, documents: docs.invoices.length + docs.purchases.length, taxableSales: s.taxableSales, outputTax: s.outputTax.total, inputCredit: s.inputCredit.total, filed: filingFor(state, 'GSTR-3B', period) ? 'filed' : 'not recorded', paid: payment ? 'paid' : 'not recorded' });
  }
  const unpaid = monthRows.filter((row) => row.documents > 0 && row.paid !== 'paid').map((row) => row.period);
  const unfiled = monthRows.filter((row) => row.documents > 0 && row.filed !== 'filed').map((row) => row.period);
  if (unpaid.length) notes.add(`Table 9 (tax paid) only has the months whose GST payment is recorded; missing: ${unpaid.join(', ')}.`);
  if (unfiled.length) notes.add(`GSTR-3B is not recorded as filed for ${unfiled.join(', ')}; record each ARN so the annual return reconciles.`);
  if (twoB.months < monthRows.filter((row) => row.documents > 0).length) notes.add(`GSTR-2B was added for ${twoB.months === 1 ? '1 month' : `${twoB.months} months`}; table 8 compares only those.`);
  notes.add('Table 5 (exempt, nil-rated and non-GST outward supplies), advances (table 4F), and amendments made on the portal are not in these books; your CA adds them.');
  notes.add('Blocked-credit purchases are shown for table 7; ITC on capital goods, imports and reverse charge is not separated.');
  if (unreviewed) notes.add('Set-off, interest and late fee figures come from dated rules your CA has not reviewed yet.');
  const hsnRows = [...hsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.ratePercent - b.ratePercent);
  const draftHash = createHash('sha256').update(JSON.stringify({ fy, outward, itc, paid, hsn: hsnRows })).digest('hex');
  return {
    ok: true,
    data: {
      fy,
      form: 'GSTR-9',
      gstin: state.company?.gstin || '',
      months: monthRows,
      table4: { outwardTaxable: outward.taxable, outwardTax: outward.tax, b2bInvoices: outward.b2b, b2cInvoices: outward.b2c, creditNotes: outward.creditNotes, debitNotes: outward.debitNotes, netTaxable: round2(outward.taxable - outward.creditNotes.taxable + outward.debitNotes.taxable) },
      table6: { itcAvailed: itc.availed, purchases: itc.purchases },
      table7: { reversed: itc.reversed, blocked: itc.blocked },
      table8: { gstr2bMonths: twoB.months, gstr2bAvailable: twoB.available, availed: itc.availed, difference: add(heads(), { igst: twoB.available.igst - itc.availed.igst, cgst: twoB.available.cgst - itc.availed.cgst, sgst: twoB.available.sgst - itc.availed.sgst }) },
      table9: { paidInCash: paid.cash, paidByCredit: paid.credit, interest: paid.interest, lateFee: paid.lateFee, monthsRecorded: paid.months },
      table17: hsnRows,
      filed: filingFor(state, 'GSTR-9', fy),
      draftHash,
      notes: [...notes],
    },
  };
}

export function gstr9Words(d, money) {
  const lines = [`GSTR-9 draft for ${d.fy}:`];
  lines.push(`· Outward supplies: taxable ${money(d.table4.outwardTaxable)} on ${d.table4.b2bInvoices + d.table4.b2cInvoices} invoices (${d.table4.b2bInvoices} B2B), tax ${money(d.table4.outwardTax.total)}${d.table4.creditNotes.taxable > 0 ? `; credit notes ${money(d.table4.creditNotes.taxable)}` : ''}${d.table4.debitNotes.taxable > 0 ? `; debit notes ${money(d.table4.debitNotes.taxable)}` : ''}`);
  lines.push(`· Input credit availed ${money(d.table6.itcAvailed.total)} on ${d.table6.purchases} bills${d.table7.reversed.total > 0 ? `; reversed ${money(d.table7.reversed.total)}` : ''}${d.table7.blocked.total > 0 ? `; blocked ${money(d.table7.blocked.total)}` : ''}`);
  if (d.table8.gstr2bMonths > 0) lines.push(`· GSTR-2B shows ${money(d.table8.gstr2bAvailable.total)} available against ${money(d.table8.availed.total)} availed (difference ${money(d.table8.difference.total)}) over ${d.table8.gstr2bMonths} months`);
  lines.push(`· Tax paid: ${money(d.table9.paidInCash.total)} in cash and ${money(d.table9.paidByCredit)} by credit over ${d.table9.monthsRecorded} recorded months${d.table9.interest + d.table9.lateFee > 0 ? `, plus interest ${money(d.table9.interest)} and late fee ${money(d.table9.lateFee)}` : ''}`);
  lines.push(`· HSN summary: ${d.table17.length} rows`);
  if (d.filed) lines.push(`· Recorded as filed on ${d.filed.filedOn}, ARN ${d.filed.arn}`);
  lines.push(d.notes.join(' '));
  return lines.join('\n');
}
