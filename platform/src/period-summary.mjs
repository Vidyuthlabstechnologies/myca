import { companyAs } from './registrations.mjs';
import { filing } from './sprint-load.mjs';
import { invoicesToSalesCsv, purchasesToInwardCsv } from './invoice.mjs';
import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { creditNoteTotals } from './credit-notes.mjs';
import { noteTotals } from './debit-notes.mjs';
import { documentsForPeriod, fpOf, taxByHead } from './return-period.mjs';
import { localToday } from './dates.mjs';

const { filingPrep } = filing;

function netOfNotes(outward, creditNotes, debitNotes) {
  const totals = outward?.totals || {};
  const credit = creditNoteTotals(creditNotes);
  const debit = noteTotals(debitNotes);
  const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
  return {
    ...outward,
    grossTotals: totals,
    totals: {
      interTaxable: r2(totals.interTaxable - credit.igstTaxable + debit.igstTaxable),
      interIgst: r2(totals.interIgst - credit.igst + debit.igst),
      intraTaxable: r2(totals.intraTaxable - credit.intraTaxable + debit.intraTaxable),
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

export function gstr3bFor(state, docs, inwardOverride) {
  const salesText = invoicesToSalesCsv(docs.invoices);
  const inwardText = inwardOverride || purchasesToInwardCsv(docs.purchases);
  const result = filingPrep({ salesText, inwardText, supplierState: docs.gstin !== undefined ? companyAs(state, docs.gstin).state : state.company.state, fy: state.company.fy });
  const draft = result.gstr3b || {};
  return { ...draft, outward: netOfNotes(draft.outward, docs.creditNotes || [], docs.debitNotes || []), itc: lessPurchaseNotes(draft.itc, docs.purchaseNotes || []), period: docs.period };
}

export function periodSummary(state, period, gstin) {
  const docs = documentsForPeriod(state, period, localToday().slice(0, 7), gstin);
  if (!docs.ok) return { ok: false, error: docs.error, hint: docs.hint, periods: docs.periods };
  const gstr3b = gstr3bFor(state, docs);
  const outward = gstr3b.outward?.totals || {};
  const credit = gstr3b.itc?.available || {};
  const file = docs.invoices.length || docs.creditNotes.length || docs.debitNotes.length ? invoicesToGstr1Json(docs.gstin !== undefined ? companyAs(state, docs.gstin) : state.company, docs.invoices, fpOf(docs.period), { creditNotes: docs.creditNotes, debitNotes: docs.debitNotes }) : null;
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
      outputTax: taxByHead(outward.interIgst, outward.intraCgst, outward.intraSgst),
      inputCredit: taxByHead(credit.igst, credit.cgst, credit.sgst),
      gstr1: file && !file.error
        ? { fp: file.fp, b2b: file.b2b.length, b2cl: file.b2cl.length, b2cs: file.b2cs.length, cdnr: (file.cdnr || []).length, cdnur: (file.cdnur || []).length, held: file.held || [], warnings: file.warnings || [], hash: file.hash, caveat: file.caveat }
        : { fp: fpOf(docs.period), b2b: 0, b2cl: 0, b2cs: 0, cdnr: 0, cdnur: 0, held: [], warnings: [], hash: '', caveat: '', error: file ? file.error : '' },
    },
  };
}
