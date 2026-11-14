import { companyAs } from './registrations.mjs';
import { filing } from './sprint-load.mjs';
import { invoicesToSalesCsv, purchasesToInwardCsv } from './invoice.mjs';
import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { creditNoteTotals } from './credit-notes.mjs';
import { noteTotals } from './debit-notes.mjs';
import { documentsForPeriod, fpOf, taxByHead } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { reverseChargeTotals } from './reverse-charge.mjs';
import { isSezSupply } from './chart.mjs';

const { filingPrep } = filing;

function noteTaxableSplit(notes, supplierState) {
  const paiseOf = { inter: 0, intra: 0, zero: 0 };
  for (const note of notes || []) {
    const lines = note.lines || [];
    if (!lines.length) {
      paiseOf[Number(note.igst || 0) > 0 ? 'inter' : 'intra'] += Math.round(Number(note.taxable || 0) * 100);
      continue;
    }
    const inter = isSezSupply(note) || String(note.partyState || note.placeOfSupply || supplierState) !== String(supplierState);
    for (const line of lines) {
      const bucket = Number(line.gstRate || 0) === 0 ? 'zero' : inter ? 'inter' : 'intra';
      paiseOf[bucket] += Math.round(Number(line.taxable || 0) * 100);
    }
  }
  return { inter: paiseOf.inter / 100, intra: paiseOf.intra / 100, zero: paiseOf.zero / 100 };
}

function netOfNotes(outward, creditNotes, debitNotes, supplierState) {
  const totals = outward?.totals || {};
  const credit = creditNoteTotals(creditNotes);
  const debit = noteTotals(debitNotes);
  const creditSplit = noteTaxableSplit(creditNotes, supplierState);
  const debitSplit = noteTaxableSplit(debitNotes, supplierState);
  const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
  return {
    ...outward,
    grossTotals: totals,
    grossNilExemptTaxable: outward?.nilExemptTaxable,
    nilExemptTaxable: r2(Number(outward?.nilExemptTaxable || 0) - creditSplit.zero + debitSplit.zero),
    totals: {
      interTaxable: r2(totals.interTaxable - creditSplit.inter + debitSplit.inter),
      interIgst: r2(totals.interIgst - credit.igst + debit.igst),
      intraTaxable: r2(totals.intraTaxable - creditSplit.intra + debitSplit.intra),
      intraCgst: r2(totals.intraCgst - credit.cgst + debit.cgst),
      intraSgst: r2(totals.intraSgst - credit.sgst + debit.sgst),
    },
    creditNotes: credit,
    debitNotes: debit,
  };
}

function lessPurchaseNotes(itc, notes) {
  const available = itc?.available || {};
  const reversed = noteTotals((notes || []).filter((note) => note.itcEligible !== false));
  const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
  return {
    ...itc,
    grossAvailable: available,
    available: { ...available, igst: r2(available.igst - reversed.igst), cgst: r2(available.cgst - reversed.cgst), sgst: r2(available.sgst - reversed.sgst) },
    purchaseNotes: reversed,
  };
}

const HSN_CODE = /^\d{4,8}$/;
const LIABILITY_ONLY_HSN = '0000';

export function invoicesMissingHsn(invoices) {
  return (invoices || []).filter((inv) => (inv.lines || []).some((line) => !HSN_CODE.test(String(line.hsn ?? '').trim()))).map((inv) => inv.id);
}

function withLiabilityHsn(invoices) {
  return (invoices || []).map((inv) => {
    const lines = inv.lines || [];
    if (lines.every((line) => HSN_CODE.test(String(line.hsn ?? '').trim()))) return inv;
    return { ...inv, lines: lines.map((line) => (HSN_CODE.test(String(line.hsn ?? '').trim()) ? line : { ...line, hsn: LIABILITY_ONLY_HSN })) };
  });
}

function withSezSupplies(outward, sezInvoices) {
  if (!sezInvoices.length) return outward;
  const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
  const totals = { interTaxable: 0, interIgst: 0, intraTaxable: 0, intraCgst: 0, intraSgst: 0, ...(outward?.totals || {}) };
  const rows3a = [...(outward?.rows3a || []).map((row) => ({ ...row }))];
  let nilExemptTaxable = Number(outward?.nilExemptTaxable || 0);
  for (const line of sezInvoices.flatMap((inv) => inv.lines || [])) {
    const taxable = Number(line.taxable || 0);
    const rate = Number(line.gstRate || 0);
    if (rate === 0 || taxable === 0) {
      nilExemptTaxable = r2(nilExemptTaxable + taxable);
      continue;
    }
    totals.interTaxable = r2(totals.interTaxable + taxable);
    totals.interIgst = r2(totals.interIgst + Number(line.igst || 0));
    let row = rows3a.find((item) => item.rate === rate && item.interState);
    if (!row) {
      row = { rate, interState: true, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      rows3a.push(row);
    }
    row.taxable = r2(row.taxable + taxable);
    row.igst = r2(row.igst + Number(line.igst || 0));
  }
  rows3a.sort((a, b) => (a.rate !== b.rate ? a.rate - b.rate : a.interState === b.interState ? 0 : a.interState ? 1 : -1));
  return { ...(outward || {}), rows3a, nilExemptTaxable, totals };
}

export function gstr3bFor(state, docs, inwardOverride) {
  const sezInvoices = (docs.invoices || []).filter((inv) => isSezSupply(inv));
  const salesText = invoicesToSalesCsv(withLiabilityHsn((docs.invoices || []).filter((inv) => !isSezSupply(inv))));
  const inwardText = inwardOverride || purchasesToInwardCsv(docs.purchases);
  const supplierState = docs.gstin !== undefined ? companyAs(state, docs.gstin).state : state.company.state;
  const result = filingPrep({ salesText, inwardText, supplierState, fy: state.company.fy });
  const draft = result.gstr3b || {};
  return { ...draft, outward: netOfNotes(withSezSupplies(draft.outward, sezInvoices), docs.creditNotes || [], docs.debitNotes || [], supplierState), itc: lessPurchaseNotes(draft.itc, docs.purchaseNotes || []), period: docs.period, missingHsn: invoicesMissingHsn(docs.invoices) };
}

export function periodSummary(state, period, gstin) {
  const docs = documentsForPeriod(state, period, localToday().slice(0, 7), gstin);
  if (!docs.ok) return { ok: false, error: docs.error, hint: docs.hint, periods: docs.periods };
  const gstr3b = gstr3bFor(state, docs);
  const outward = gstr3b.outward?.totals || {};
  const credit = gstr3b.itc?.available || {};
  const file = docs.invoices.length || docs.creditNotes.length || docs.debitNotes.length ? invoicesToGstr1Json(docs.gstin !== undefined ? companyAs(state, docs.gstin) : state.company, docs.invoices, fpOf(docs.period), { creditNotes: docs.creditNotes, debitNotes: docs.debitNotes, channels: state.channels }) : null;
  return {
    ok: true,
    data: {
      period: docs.period,
      periods: docs.periods,
      gstin: docs.gstin,
      salesCount: docs.invoices.length,
      creditNoteCount: docs.creditNotes.length,
      creditNotes: creditNoteTotals(docs.creditNotes),
      debitNoteCount: docs.debitNotes.length,
      debitNotes: noteTotals(docs.debitNotes),
      purchaseNoteCount: docs.purchaseNotes.length,
      purchaseNotes: noteTotals(docs.purchaseNotes),
      purchaseCount: docs.purchases.length,
      taxableSales: (Math.round(Number(outward.interTaxable || 0) * 100) + Math.round(Number(outward.intraTaxable || 0) * 100)) / 100,
      grossTaxableSales: (Math.round(Number(gstr3b.outward?.grossTotals?.interTaxable || 0) * 100) + Math.round(Number(gstr3b.outward?.grossTotals?.intraTaxable || 0) * 100)) / 100,
      outputTax: taxByHead(outward.interIgst, outward.intraCgst, outward.intraSgst),
      inputCredit: taxByHead(credit.igst, credit.cgst, credit.sgst),
      reverseCharge: reverseChargeTotals(docs.purchases),
      gstr1: file && !file.error
        ? { fp: file.fp, b2b: file.b2b.length, b2cl: file.b2cl.length, b2cs: file.b2cs.length, cdnr: (file.cdnr || []).length, cdnur: (file.cdnur || []).length, held: file.held || [], warnings: file.warnings || [], hash: file.hash, caveat: file.caveat }
        : { fp: fpOf(docs.period), b2b: 0, b2cl: 0, b2cs: 0, cdnr: 0, cdnur: 0, held: [], warnings: [], hash: '', caveat: '', error: file ? file.error : '' },
    },
  };
}
