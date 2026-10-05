import { filing } from './sprint-load.mjs';
import { invoicesToSalesCsv, purchasesToInwardCsv } from './invoice.mjs';
import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { creditNoteTotals } from './credit-notes.mjs';
import { documentsForPeriod, fpOf, taxByHead } from './return-period.mjs';
import { localToday } from './dates.mjs';

const { filingPrep } = filing;

function lessCreditNotes(outward, notes) {
  const totals = outward?.totals || {};
  const credit = creditNoteTotals(notes);
  const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
  return {
    ...outward,
    grossTotals: totals,
    totals: {
      interTaxable: r2(totals.interTaxable - credit.igstTaxable),
      interIgst: r2(totals.interIgst - credit.igst),
      intraTaxable: r2(totals.intraTaxable - credit.intraTaxable),
      intraCgst: r2(totals.intraCgst - credit.cgst),
      intraSgst: r2(totals.intraSgst - credit.sgst),
    },
    creditNotes: credit,
  };
}

export function gstr3bFor(state, docs, inwardOverride) {
  const salesText = invoicesToSalesCsv(docs.invoices);
  const inwardText = inwardOverride || purchasesToInwardCsv(docs.purchases);
  const result = filingPrep({ salesText, inwardText, supplierState: state.company.state, fy: state.company.fy });
  const draft = result.gstr3b || {};
  return { ...draft, outward: lessCreditNotes(draft.outward, docs.creditNotes || []), period: docs.period };
}

export function periodSummary(state, period) {
  const docs = documentsForPeriod(state, period, localToday().slice(0, 7));
  if (!docs.ok) return { ok: false, error: docs.error, hint: docs.hint, periods: docs.periods };
  const gstr3b = gstr3bFor(state, docs);
  const outward = gstr3b.outward?.totals || {};
  const credit = gstr3b.itc?.available || {};
  const file = docs.invoices.length || docs.creditNotes.length ? invoicesToGstr1Json(state.company, docs.invoices, fpOf(docs.period), { creditNotes: docs.creditNotes }) : null;
  return {
    ok: true,
    data: {
      period: docs.period,
      periods: docs.periods,
      salesCount: docs.invoices.length,
      creditNoteCount: docs.creditNotes.length,
      creditNotes: creditNoteTotals(docs.creditNotes),
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
