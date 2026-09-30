import { validateGstin, STATE_CODES } from './gstin.mjs';
import { parseGstr2B } from './gstr2b.mjs';
import { parsePurchaseRegister } from './purchaseregister.mjs';
import { match2B } from './match2b.mjs';
import { parseGSTR1 } from './gstr1.mjs';
import { parseGSTR3B } from './gstr3b.mjs';
import { matchGSTR13 } from './matchgstr13.mjs';
import { checkItcAvailability, flagRule37, flagRule37A, itcOf } from './itc-checks.mjs';
import { imsSnapshot, sectionLabel } from './ims.mjs';

export { validateGstin, STATE_CODES, parseGstr2B, parsePurchaseRegister, match2B, parseGSTR1, parseGSTR3B, matchGSTR13, checkItcAvailability, flagRule37, flagRule37A, itcOf, imsSnapshot, sectionLabel };

function rs(sum) {
  return Math.round(sum * 100) / 100;
}

function money(v) {
  return Number.isFinite(v) ? v : 0;
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const HEAD_LABEL = { taxableValue: 'taxable value', cgst: 'CGST', sgst: 'SGST', igst: 'IGST', cess: 'cess' };

function buildIssues(match, itc, r37, r37a, g13) {
  const issues = [];
  for (const entry of match.unmatched.inBooksNotIn2B) {
    issues.push({ severity: 'error', code: 'INVOICE_NOT_IN_2B', ref: entry.invoiceNo, message: `${entry.invoiceNo} from ${entry.supplierName} (${entry.gstin}) is in the purchase register but absent from GSTR-2B.` });
  }
  for (const entry of match.unmatched.in2BNotInBooks) {
    issues.push({ severity: 'warning', code: 'IN_2B_NOT_BOOKED', ref: entry.invoiceNo || '', message: `Invoice ${entry.invoiceNo} appears in GSTR-2B (${sectionLabel(entry.section)}) but was never booked.` });
  }
  for (const entry of match.unmatched.creditNotesInBooksNotIn2B) {
    issues.push({ severity: 'error', code: 'CREDIT_NOTE_NOT_IN_2B', ref: entry.invoiceNo, message: `Credit note ${entry.invoiceNo} from ${entry.supplierName} is in the books but absent from GSTR-2B; the credit it reduces must still be reversed.` });
  }
  for (const entry of match.unmatched.creditNotesIn2BNotInBooks) {
    issues.push({ severity: 'error', code: 'CREDIT_NOTE_NOT_BOOKED', ref: entry.invoiceNo || '', message: `Credit note ${entry.invoiceNo} in GSTR-2B reduces input credit by ${Math.abs(itcOf(entry))} but was never booked.` });
  }
  for (const m of [...match.matched, ...match.creditNotes].filter((x) => x.amountMismatch)) {
    const heads = m.mismatches.map((d) => `${HEAD_LABEL[d.head]} ${d.books} vs ${d.gstr2b}`).join('; ');
    const pos = m.placeOfSupplyMismatch ? ' The tax type differs (CGST+SGST against IGST), so the place of supply is wrong on one side.' : '';
    issues.push({ severity: 'warning', code: m.placeOfSupplyMismatch ? 'TAX_TYPE_MISMATCH' : 'AMOUNT_MISMATCH', ref: m.purchase.invoiceNo, message: `${m.purchase.invoiceNo} books differ from GSTR-2B: ${heads}.${pos}` });
  }
  for (const b of itc.blocked) {
    issues.push({ severity: 'error', code: b.code === 'NOT_IN_2B' ? 'ITC_NOT_IN_2B' : 'ITC_NOT_AVAILABLE', ref: b.purchase.invoiceNo, message: `${b.purchase.invoiceNo} input credit of ${money(b.blockedCredit)} cannot be claimed (${b.section}). ${b.reason}.` });
  }
  for (const u of itc.unclaimed) {
    issues.push({ severity: 'warning', code: 'UNCLAIMED_ITC', ref: u.invoice.invoiceNo || '', message: `Input credit of ${money(u.unclaimedCredit)} for ${u.invoice.invoiceNo} was reported but never claimed.` });
  }
  for (const r of r37.reverse || []) {
    issues.push({ severity: 'error', code: 'RULE_37_REVERSAL', ref: r.purchase.invoiceNo, message: `${r.purchase.invoiceNo}: ${money(r.unpaidValue)} not paid within 180 days (by ${r.deadline}); reverse ${money(r.reversalItc)} of credit in GSTR-3B for ${r.reverseInReturnFor} (Rule 37).` });
  }
  for (const r of r37a.reverse || []) {
    issues.push({ severity: 'error', code: 'RULE_37A_REVERSAL', ref: r.purchase.invoiceNo, message: `${r.purchase.invoiceNo}: supplier did not file GSTR-3B for ${r.period} by ${r.supplierBy}; reverse ${money(r.reversalItc)} of credit by ${r.reverseBy} (Rule 37A).` });
  }
  for (const r of r37a.atRisk || []) {
    issues.push({ severity: 'warning', code: 'RULE_37A_AT_RISK', ref: r.purchase.invoiceNo, message: `${r.purchase.invoiceNo}: supplier GSTR-3B for ${r.period} not yet filed; credit of ${money(r.reversalItc)} must be reversed by ${r.reverseBy} if it is not filed by ${r.supplierBy} (Rule 37A).` });
  }
  for (const bucket of g13.mismatches) {
    issues.push({ severity: 'error', code: 'GSTR1_3B_MISMATCH', ref: bucket.key, message: `Outward ${bucket.key} differs by ${Math.abs(rs(bucket.diff))}: GSTR-1 ${money(bucket.gstr1Taxable)} vs GSTR-3B ${money(bucket.gstr3bTaxable)}.` });
  }
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

export function reconcile({ purchaseRegisterText, gstr2bText, gstr1Text, gstr3bText }, { clientGstin, asOfDate = localToday(), supplierFilings } = {}) {
  const pr = parsePurchaseRegister(purchaseRegisterText);
  const g2b = parseGstr2B(gstr2bText);
  const g1 = parseGSTR1(gstr1Text);
  const g3b = parseGSTR3B(gstr3bText);
  const parserErrors = [...pr.errors, ...g2b.errors, ...g1.errors, ...g3b.errors];

  const match = match2B({ purchaseRegister: pr.rows, gstr2b: g2b.rows });
  const itc = checkItcAvailability({ purchaseRegister: pr.rows, gstr2b: g2b.rows });
  const r37 = flagRule37({ purchaseRegister: pr.rows, asOfDate });
  const r37a = flagRule37A({ purchaseRegister: pr.rows, supplierFilings, asOfDate });
  const g13 = matchGSTR13({ gstr1: g1.rows, gstr3b: g3b.rows });
  const ims = imsSnapshot(g2b.rows);

  const client = clientGstin ? validateGstin(clientGstin) : { ok: true, stateName: null };
  const gstinInvalid = clientGstin && !client.ok;

  const reversals = (r37.reverse || []).length + (r37a.reverse || []).length;
  const ok = parserErrors.length === 0 && !gstinInvalid && match.ok && itc.blocked.length === 0
    && match.unmatched.creditNotesIn2BNotInBooks.length === 0 && reversals === 0 && g13.mismatches.length === 0;

  const issues = buildIssues(match, itc, r37, r37a, g13);

  const summary = {
    clientGstin: clientGstin || null,
    clientState: clientGstin ? client.stateName : null,
    asOfDate,
    ok,
    purchaseInvoices: match.stats.purchaseInvoices,
    b2bInvoices: match.stats.b2bInvoices,
    matchedInvoices: match.stats.matchedCount,
    amountMismatches: match.stats.amountMismatchCount,
    invoicesInBooksNotIn2B: match.unmatched.inBooksNotIn2B.length,
    invoicesIn2BNotInBooks: match.unmatched.in2BNotInBooks.length,
    creditNotes: match.creditNotes.length,
    creditNotesInBooksNotIn2B: match.unmatched.creditNotesInBooksNotIn2B.length,
    creditNotesIn2BNotInBooks: match.unmatched.creditNotesIn2BNotInBooks.length,
    itcAvailable: rs(ims.total.inputCredit),
    itcBlocked: money(itc.summary.totalBlockedCredit),
    itcUnclaimed: money(itc.summary.totalUnclaimedCredit),
    rule37Reversal: money(r37.summary?.totalReversalItc),
    rule37PaymentUnknown: r37.summary?.unknownCount || 0,
    rule37AChecked: r37a.checked === true,
    rule37AReversal: money(r37a.summary?.totalReversalItc),
    gstr1MismatchBuckets: g13.stats.mismatchCount,
  };

  // Section 16(2)(aa) eligible credit, less the Rule 37 and 37A reversals.
  summary.itcEligible = rs(itc.summary.eligibleItc - summary.rule37Reversal - summary.rule37AReversal);

  return {
    ok,
    client: clientGstin ? { gstin: client.gstin, stateName: client.stateName, valid: client.ok } : null,
    match,
    itcAvailability: itc,
    rule37: r37,
    rule37A: r37a,
    gstr13: g13,
    ims,
    parserErrors,
    issues,
    summary,
  };
}

export function toHumanText(result) {
  const lines = [];
  const c = result.client ? `${result.client.gstin} (${result.client.stateName})` : '—';
  lines.push(`GST reconciliation for ${c} as of ${result.summary.asOfDate}`);
  lines.push(`Status: ${result.ok ? 'OK' : 'REQUIRES ACTION'}`);
  lines.push('Purchase-side:');
  lines.push(`  Purchase register invoices: ${result.summary.purchaseInvoices}`);
  lines.push(`  GSTR-2B b2b invoices       : ${result.summary.b2bInvoices}`);
  lines.push(`  Matched                     : ${result.summary.matchedInvoices}`);
  lines.push(`  Credit notes matched        : ${result.summary.creditNotes}`);
  lines.push(`  In books but not in 2B      : ${result.summary.invoicesInBooksNotIn2B}`);
  lines.push(`  In 2B but not booked        : ${result.summary.invoicesIn2BNotInBooks}`);
  lines.push(`  Input credit available      : ${result.summary.itcAvailable}`);
  lines.push(`  Input credit blocked (2B)   : ${result.summary.itcBlocked}  [s.16(2)(aa)]`);
  lines.push(`  Rule 37 reversal (180 days) : ${result.summary.rule37Reversal}${result.summary.rule37PaymentUnknown ? `  (${result.summary.rule37PaymentUnknown} invoice(s) with no payment data)` : ''}`);
  lines.push(`  Rule 37A reversal           : ${result.summary.rule37AChecked ? result.summary.rule37AReversal : 'not checked: supplier GSTR-3B filing status not provided'}`);
  lines.push(`  Input credit unclaimed      : ${result.summary.itcUnclaimed}`);
  lines.push(`  Eligible input credit       : ${result.summary.itcEligible}`);
  lines.push('Outward-side:');
  for (const bucket of result.gstr13.buckets) {
    const flag = bucket.ok ? 'match' : 'MISMATCH';
    lines.push(`  ${bucket.key}: GSTR-1 ${bucket.gstr1Taxable} vs GSTR-3B ${bucket.gstr3bTaxable} (${flag}, diff ${bucket.diff})`);
  }
  for (const section of Object.keys(result.ims.sections)) {
    const s = result.ims.sections[section];
    lines.push(`  GSTR-2B ${sectionLabel(section)}: ${s.count} document(s), taxable ${s.taxable}`);
  }
  if (result.issues.length) {
    lines.push(`Action queue (${result.issues.length}):`);
    for (const issue of result.issues) {
      lines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }
  return lines;
}