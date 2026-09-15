import { validateGstin, STATE_CODES } from './gstin.mjs';
import { parseGstr2B } from './gstr2b.mjs';
import { parsePurchaseRegister } from './purchaseregister.mjs';
import { match2B } from './match2b.mjs';
import { parseGSTR1 } from './gstr1.mjs';
import { parseGSTR3B } from './gstr3b.mjs';
import { matchGSTR13 } from './matchgstr13.mjs';
import { flagRule37A } from './rule37a.mjs';
import { imsSnapshot, sectionLabel } from './ims.mjs';

export { validateGstin, STATE_CODES, parseGstr2B, parsePurchaseRegister, match2B, parseGSTR1, parseGSTR3B, matchGSTR13, flagRule37A, imsSnapshot, sectionLabel };

function rs(sum) {
  return Math.round(sum * 100) / 100;
}

function money(v) {
  return Number.isFinite(v) ? v : 0;
}

function buildIssues(match, r37a, g13) {
  const issues = [];
  for (const entry of match.unmatched.inBooksNotIn2B) {
    issues.push({ severity: 'error', code: 'INVOICE_NOT_IN_2B', ref: entry.invoiceNo, message: `${entry.invoiceNo} from ${entry.supplierName} (${entry.gstin}) is in the purchase register but absent from GSTR-2B.` });
  }
  for (const entry of match.unmatched.in2BNotInBooks) {
    issues.push({ severity: 'warning', code: 'IN_2B_NOT_BOOKED', ref: entry.invoiceNo || '', message: `Invoice ${entry.invoiceNo} appears in GSTR-2B (${sectionLabel(entry.section)}) but was never booked.` });
  }
  for (const m of match.matched.filter((x) => x.amountMismatch)) {
    issues.push({ severity: 'warning', code: 'AMOUNT_MISMATCH', ref: m.purchase.invoiceNo, message: `Book value ${money(m.purchase.taxableValue)} differs from GSTR-2B ${money(m.invoice.taxableValue)} for ${m.purchase.invoiceNo}.` });
  }
  for (const b of r37a.blocked) {
    issues.push({ severity: 'error', code: 'RULE_37A_BLOCKED', ref: b.purchase.invoiceNo, message: `${b.purchase.invoiceNo} input credit of ${money(b.blockedCredit)} is not available (37A). ${b.reason}.` });
  }
  for (const u of r37a.unclaimed) {
    issues.push({ severity: 'warning', code: 'UNCLAIMED_ITC', ref: u.invoiceNo || '', message: `Input credit of ${money(u.totalValue)} for ${u.invoiceNo} was reported but never claimed.` });
  }
  for (const bucket of g13.mismatches) {
    issues.push({ severity: 'error', code: 'GSTR1_3B_MISMATCH', ref: bucket.key, message: `Outward ${bucket.key} differs by ${Math.abs(rs(bucket.diff))}: GSTR-1 ${money(bucket.gstr1Taxable)} vs GSTR-3B ${money(bucket.gstr3bTaxable)}.` });
  }
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

export function reconcile({ purchaseRegisterText, gstr2bText, gstr1Text, gstr3bText }, { clientGstin, asOfDate = '2025-04-30' } = {}) {
  const pr = parsePurchaseRegister(purchaseRegisterText);
  const g2b = parseGstr2B(gstr2bText);
  const g1 = parseGSTR1(gstr1Text);
  const g3b = parseGSTR3B(gstr3bText);
  const parserErrors = [...pr.errors, ...g2b.errors, ...g1.errors, ...g3b.errors];

  const match = match2B({ purchaseRegister: pr.rows, gstr2b: g2b.rows });
  const r37a = flagRule37A({ purchaseRegister: pr.rows, gstr2b: g2b.rows });
  const g13 = matchGSTR13({ gstr1: g1.rows, gstr3b: g3b.rows });
  const ims = imsSnapshot(g2b.rows);

  const client = clientGstin ? validateGstin(clientGstin) : { ok: true, stateName: null };
  const gstinInvalid = clientGstin && !client.ok;

  const ok = parserErrors.length === 0 && !gstinInvalid && match.unmatched.inBooksNotIn2B.length === 0 && g13.mismatches.length === 0;

  const issues = buildIssues(match, r37a, g13);

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
    itcAvailable: rs(ims.total.inputCredit),
    itcBlocked: money(r37a.summary.totalBlockedCredit),
    itcUnclaimed: money(r37a.summary.totalUnclaimedCredit),
    gstr1MismatchBuckets: g13.stats.mismatchCount,
  };

  const inputCreditEligible = rs(ims.total.inputCredit - money(r37a.summary.totalBlockedCredit));
  summary.itcEligible = inputCreditEligible;

  return {
    ok,
    client: clientGstin ? { gstin: client.gstin, stateName: client.stateName, valid: client.ok } : null,
    match,
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
  lines.push(`  Input credit blocked (37A)  : ${result.summary.itcBlocked}`);
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