import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { parseQuarter } from './tds-return.mjs';

function inMonths(months) {
  return (doc) => months.includes(String(doc.date || '').slice(0, 7));
}

function fpOf(month) {
  return `${month.slice(5, 7)}${month.slice(0, 4)}`;
}

export function exportGstr1Quarter(state, args = {}) {
  const quarter = parseQuarter(args.quarter);
  if (!quarter) return { ok: false, error: 'INVALID_QUARTER', hint: 'Say the quarter as Q2 2026-27.' };
  const company = state.company || {};
  if (String(company.gstFrequency || 'monthly').toLowerCase() !== 'quarterly') return { ok: false, error: 'NOT_QRMP', hint: 'This business files GSTR-1 monthly; the quarterly file is for QRMP filers. Set the GST frequency to quarterly on the company first.' };
  const pick = inMonths(quarter.months);
  const invoices = (state.invoices || []).filter(pick);
  const creditNotes = (state.creditNotes || []).filter(pick);
  const debitNotes = (state.debitNotes || []).filter(pick);
  const json = invoicesToGstr1Json(company, invoices, fpOf(quarter.months[2]), { creditNotes, debitNotes, allGiven: true, grossTurnover: args.grossTurnover, currentGrossTurnover: args.currentGrossTurnover });
  if (json.error) return { ok: false, error: json.error, hint: json.hint };
  const iff = quarter.months.slice(0, 2).map((month) => ({ month, b2b: invoices.filter((inv) => inv.partyGstin && String(inv.date).startsWith(month)).length }));
  return { ok: true, data: { quarter: quarter.label, months: quarter.months, fp: json.fp, invoices: invoices.length, iffMonths: iff, ...json, fileName: `GSTR1_${company.gstin || 'GSTIN'}_${quarter.label.replace(/\s+/g, '-')}.json`, note: 'One file for the quarter with the last month as the return period, as the QRMP scheme files it; B2B invoices already sent through IFF for the first two months are included again here only if the portal expects the full quarter.' } };
}

export function exportIff(state, args = {}) {
  const month = String(args.period || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-07.' };
  const company = state.company || {};
  if (String(company.gstFrequency || 'monthly').toLowerCase() !== 'quarterly') return { ok: false, error: 'NOT_QRMP', hint: 'The invoice furnishing facility is for QRMP filers only.' };
  const m = Number(month.slice(5, 7));
  if (m % 3 === 0) return { ok: false, error: 'QUARTER_END', hint: 'The last month of a quarter goes in the quarterly GSTR-1, not IFF.' };
  const pick = inMonths([month]);
  const invoices = (state.invoices || []).filter((inv) => pick(inv) && inv.partyGstin);
  const creditNotes = (state.creditNotes || []).filter((note) => pick(note) && note.partyGstin);
  const debitNotes = (state.debitNotes || []).filter((note) => pick(note) && note.partyGstin);
  const json = invoicesToGstr1Json(company, invoices, fpOf(month), { creditNotes, debitNotes, allGiven: true });
  if (json.error) return { ok: false, error: json.error, hint: json.hint };
  const { b2cl, b2cs, cdnur, ...rest } = json;
  return { ok: true, data: { period: month, invoices: invoices.length, ...rest, b2cl: [], b2cs: [], cdnur: [], fileName: `IFF_${company.gstin || 'GSTIN'}_${fpOf(month)}.json`, note: 'The invoice furnishing facility carries only B2B invoices and their notes for the month, so the buyer sees the credit in time; B2C sales wait for the quarterly GSTR-1. Optional, and only until the 13th of the next month.' } };
}
