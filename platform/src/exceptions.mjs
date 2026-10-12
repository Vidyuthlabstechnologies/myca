import { trialBalance, verifyChain } from './ledger.mjs';
import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { inWords } from './words.mjs';
import { appendAuditEvent } from './ca-api.mjs';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const OPEN_STATUSES = new Set(['open', 'in_review']);
const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

function rupees(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function inr(value) {
  return `₹${rupees(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function itcOf(row) {
  return rupees(['cgst', 'sgst', 'igst', 'cess'].reduce((sum, head) => sum + (Number(row?.[head]) || 0), 0));
}

function periodsOf(invoices) {
  const set = new Set();
  for (const inv of invoices || []) {
    const match = /^(\d{4})-(\d{2})/.exec(String(inv.date || ''));
    if (match) set.add(`${match[2]}${match[1]}`);
  }
  return [...set];
}

function ledgerCandidates(book) {
  const out = [];
  const tb = trialBalance(book.ledger);
  if (!tb.balanced) {
    out.push({
      key: 'ledger:books_not_tied',
      source: 'ledger',
      code: 'BOOKS_NOT_TIED',
      severity: 'critical',
      title: 'The trial balance does not tie',
      why: `Debits ${inr(tb.debit)} against credits ${inr(tb.credit)}. Every report built on these books is unreliable until this is explained.`,
      moneyAtRisk: rupees(Math.abs(tb.debit - tb.credit)),
      evidence: {},
    });
  }
  const chain = verifyChain(book.ledger);
  if (!chain.ok) {
    out.push({
      key: 'ledger:chain_broken',
      source: 'ledger',
      code: 'LEDGER_CHAIN_BROKEN',
      severity: 'critical',
      title: 'The ledger checksum chain is broken',
      why: `The append-only chain fails verification${chain.at ? ` at transfer ${chain.at}` : ''}. The books may have been edited outside MyCA.`,
      moneyAtRisk: 0,
      evidence: {},
    });
  }
  return out;
}

function gstr1Candidates(book) {
  const out = [];
  for (const fp of periodsOf(book.invoices)) {
    const json = invoicesToGstr1Json(book.company || {}, book.invoices || [], fp);
    if (json.error) continue;
    for (const held of json.held || []) {
      const invoice = (book.invoices || []).find((i) => i.id === held.inum);
      out.push({
        key: `gstr1:${held.code}:${held.inum}`,
        source: 'gstr1',
        code: held.code,
        severity: 'high',
        title: `${held.inum} cannot be reported in GSTR-1 for ${fp}`,
        why: held.code === 'RATE_NOT_IN_FORCE'
          ? `The invoice charges GST at ${held.rate}%, which was not in force on ${held.idt}. Either the rate or the date is wrong.`
          : `The buyer's GSTIN ${held.gstin} fails validation (${(held.errors || []).join(', ')}), so the invoice cannot go into the B2B table.`,
        moneyAtRisk: rupees(invoice?.total),
        evidence: { invoiceIds: [held.inum], period: fp },
      });
    }
  }
  return out;
}

function deadlineCandidates(rows = []) {
  const out = [];
  for (const row of rows) {
    if (row.filed) continue;
    const overdue = row.level === 'overdue';
    if (!overdue && !(Number(row.daysUntil) >= 0 && Number(row.daysUntil) <= 7)) continue;
    out.push({
      key: `deadline:${row.returnType}:${row.period}`,
      source: 'deadlines',
      code: overdue ? 'RETURN_OVERDUE' : 'RETURN_DUE_SOON',
      severity: overdue ? 'high' : 'medium',
      title: `${row.returnType.startsWith('TDS_') ? row.returnLabel : row.returnType} for ${row.period} ${overdue ? (row.returnType === 'TDS_DEPOSIT' ? 'is not recorded as deposited' : 'has no filing recorded') : `is due on ${row.dueDate}`}`,
      why: overdue
        ? `It was due on ${row.dueDate}, ${Math.abs(Number(row.daysUntil) || 0)} days ago, and MyCA has no filing recorded. If it was filed, record it with its ARN; if not, late filing carries interest and a late fee.`
        : `It is due on ${row.dueDate}, in ${row.daysUntil} days.`,
      moneyAtRisk: 0,
      evidence: { period: row.period, returnType: row.returnType, dueDate: row.dueDate },
    });
  }
  return out;
}

function reconcileCandidates(recon) {
  if (!recon) return [];
  const out = [];
  const push = (item) => out.push(item);

  for (const entry of recon.itcAvailability?.blocked || []) {
    push({
      key: `itc:${entry.code}:${entry.purchase.invoiceNo}`,
      source: 'itc',
      code: entry.code,
      severity: 'high',
      title: `Input credit of ${inr(entry.blockedCredit)} on ${entry.purchase.invoiceNo} cannot be claimed`,
      why: `${entry.reason} (${entry.section}). Supplier ${entry.purchase.supplierName || entry.purchase.gstin}.`,
      ruleIds: [],
      moneyAtRisk: rupees(entry.blockedCredit),
      evidence: { invoiceNo: entry.purchase.invoiceNo, gstin: entry.purchase.gstin },
    });
  }

  for (const entry of recon.rule37?.reverse || []) {
    push({
      key: `rule37:reverse:${entry.purchase.invoiceNo}`,
      source: 'rule37',
      code: 'RULE_37_REVERSAL',
      severity: 'high',
      title: `Reverse ${inr(entry.reversalItc)} of credit on ${entry.purchase.invoiceNo}`,
      why: `${inr(entry.unpaidValue)} was still unpaid 180 days after the invoice (by ${entry.deadline}), so the proportionate credit is reversed in GSTR-3B for ${entry.reverseInReturnFor}.`,
      ruleIds: entry.rulesUsed || [],
      moneyAtRisk: rupees(entry.reversalItc),
      evidence: { invoiceNo: entry.purchase.invoiceNo, deadline: entry.deadline },
    });
  }
  for (const entry of recon.rule37?.unknown || []) {
    push({
      key: `rule37:unknown:${entry.purchase.invoiceNo}`,
      source: 'rule37',
      code: 'PAYMENT_STATUS_UNKNOWN',
      severity: 'medium',
      title: `No payment data for ${entry.purchase.invoiceNo}, past its 180-day date`,
      why: `The purchase register carries no payment for this bill and the 180-day date (${entry.deadline}) has passed. Confirm whether it was paid, or credit must be reversed under Rule 37.`,
      moneyAtRisk: itcOf(entry.purchase),
      evidence: { invoiceNo: entry.purchase.invoiceNo, deadline: entry.deadline },
    });
  }

  for (const entry of recon.rule37A?.reverse || []) {
    push({
      key: `rule37a:reverse:${entry.purchase.invoiceNo}`,
      source: 'rule37a',
      code: 'RULE_37A_REVERSAL',
      severity: 'high',
      title: `Reverse ${inr(entry.reversalItc)} by ${entry.reverseBy}: supplier did not file GSTR-3B`,
      why: `The supplier had not filed GSTR-3B for ${entry.period} by ${entry.supplierBy}, so the credit is reversed under Rule 37A on or before ${entry.reverseBy}.`,
      ruleIds: entry.rulesUsed || [],
      moneyAtRisk: rupees(entry.reversalItc),
      evidence: { invoiceNo: entry.purchase.invoiceNo, gstin: entry.purchase.gstin, period: entry.period },
    });
  }
  for (const entry of recon.rule37A?.atRisk || []) {
    push({
      key: `rule37a:risk:${entry.purchase.invoiceNo}`,
      source: 'rule37a',
      code: 'SUPPLIER_GSTR3B_PENDING',
      severity: 'medium',
      title: `${inr(entry.reversalItc)} at risk: supplier has not filed GSTR-3B for ${entry.period}`,
      why: `If the supplier does not file by ${entry.supplierBy}, this credit must be reversed by ${entry.reverseBy}. Chase the supplier while it is still recoverable.`,
      ruleIds: entry.rulesUsed || [],
      moneyAtRisk: rupees(entry.reversalItc),
      evidence: { invoiceNo: entry.purchase.invoiceNo, gstin: entry.purchase.gstin, period: entry.period },
    });
  }

  for (const row of recon.match?.unmatched?.inBooksNotIn2B || []) {
    push({
      key: `gstr2b:not_in_2b:${row.invoiceNo}`,
      source: 'gstr2b',
      code: 'INVOICE_NOT_IN_2B',
      severity: 'high',
      title: `${row.invoiceNo} is booked but absent from GSTR-2B`,
      why: `${row.supplierName || row.gstin} has not reported this invoice, so its credit of ${inr(itcOf(row))} cannot be claimed yet.`,
      moneyAtRisk: itcOf(row),
      evidence: { invoiceNo: row.invoiceNo, gstin: row.gstin },
    });
  }
  for (const row of recon.match?.unmatched?.creditNotesIn2BNotInBooks || []) {
    push({
      key: `gstr2b:cn_not_booked:${row.invoiceNo}`,
      source: 'gstr2b',
      code: 'CREDIT_NOTE_NOT_BOOKED',
      severity: 'high',
      title: `Credit note ${row.invoiceNo} in GSTR-2B was never booked`,
      why: `It reduces input credit by ${inr(Math.abs(itcOf(row)))}. Until it is booked, the books overstate credit.`,
      moneyAtRisk: rupees(Math.abs(itcOf(row))),
      evidence: { invoiceNo: row.invoiceNo, gstin: row.supplierGstin },
    });
  }
  for (const row of recon.match?.unmatched?.creditNotesInBooksNotIn2B || []) {
    push({
      key: `gstr2b:cn_not_in_2b:${row.invoiceNo}`,
      source: 'gstr2b',
      code: 'CREDIT_NOTE_NOT_IN_2B',
      severity: 'medium',
      title: `Credit note ${row.invoiceNo} is booked but absent from GSTR-2B`,
      why: 'The supplier has not reported the credit note. The reversal still stands in the books.',
      moneyAtRisk: rupees(Math.abs(itcOf(row))),
      evidence: { invoiceNo: row.invoiceNo, gstin: row.gstin },
    });
  }
  for (const matched of [...(recon.match?.matched || []), ...(recon.match?.creditNotes || [])]) {
    if (!matched.amountMismatch) continue;
    const heads = (matched.mismatches || []).map((m) => `${m.head} ${m.books} against ${m.gstr2b}`).join('; ');
    push({
      key: `gstr2b:mismatch:${matched.purchase.invoiceNo}`,
      source: 'gstr2b',
      code: matched.placeOfSupplyMismatch ? 'TAX_TYPE_MISMATCH' : 'AMOUNT_MISMATCH',
      severity: matched.placeOfSupplyMismatch ? 'high' : 'medium',
      title: `${matched.purchase.invoiceNo} differs from GSTR-2B`,
      why: matched.placeOfSupplyMismatch
        ? `The tax type differs (CGST+SGST against IGST), so the place of supply is wrong on one side: ${heads}.`
        : `Books and GSTR-2B disagree: ${heads}.`,
      moneyAtRisk: rupees((matched.mismatches || []).filter((m) => m.head !== 'taxableValue').reduce((s, m) => s + m.diff, 0)),
      evidence: { invoiceNo: matched.purchase.invoiceNo, gstin: matched.purchase.gstin },
    });
  }
  return out;
}

function importCandidates(book) {
  const out = [];
  for (const record of book.imports || []) {
    for (const held of record.heldBack || []) {
      out.push({
        key: `import:${record.source}:${held.reason}:${held.ref}`,
        source: 'import',
        code: String(held.reason || 'HELD_BACK').toUpperCase(),
        severity: 'medium',
        title: `${record.source} row ${held.ref} was not posted`,
        why: `The import held it back: ${held.reason}. Nothing was guessed, so this document is missing from the books until it is fixed and re-imported.`,
        moneyAtRisk: 0,
        evidence: { ref: held.ref, source: record.source, at: record.at },
      });
    }
  }
  return out;
}

export function detectExceptions(book, inputs = {}) {
  return [
    ...ledgerCandidates(book),
    ...gstr1Candidates(book),
    ...deadlineCandidates(inputs.deadlines),
    ...reconcileCandidates(inputs.reconcile),
    ...importCandidates(book),
  ].map((item) => ({ ...item, title: inWords(item.title), why: inWords(item.why) }));
}

function ensureQueue(book) {
  if (!Array.isArray(book.exceptions)) book.exceptions = [];
  if (!Number.isFinite(Number(book.exceptionSeq))) book.exceptionSeq = 0;
  return book.exceptions;
}

export function refreshExceptions(book, inputs = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const at = now.toISOString();
  const clientId = String(options.clientId || 'SELF');
  const queue = ensureQueue(book);
  const candidates = detectExceptions(book, inputs);
  const seen = new Set();
  let added = 0;
  let reopened = 0;

  for (const candidate of candidates) {
    seen.add(candidate.key);
    const existing = queue.find((e) => e.key === candidate.key);
    if (!existing) {
      book.exceptionSeq += 1;
      queue.push({
        id: `EXC-${String(book.exceptionSeq).padStart(6, '0')}`,
        key: candidate.key,
        clientId,
        source: candidate.source,
        code: candidate.code,
        severity: candidate.severity,
        title: candidate.title,
        why: candidate.why,
        ruleIds: candidate.ruleIds || [],
        moneyAtRisk: rupees(candidate.moneyAtRisk),
        evidence: candidate.evidence || {},
        status: 'open',
        owner: '',
        note: '',
        raisedAt: at,
        lastSeenAt: at,
        resolvedAt: null,
        resolution: '',
      });
      added += 1;
      continue;
    }
    existing.title = candidate.title;
    existing.why = candidate.why;
    existing.severity = candidate.severity;
    existing.moneyAtRisk = rupees(candidate.moneyAtRisk);
    existing.evidence = candidate.evidence || {};
    existing.ruleIds = candidate.ruleIds || existing.ruleIds || [];
    existing.lastSeenAt = at;
    if (existing.status === 'resolved' && existing.resolution === 'no_longer_detected') {
      existing.status = 'open';
      existing.resolvedAt = null;
      existing.resolution = '';
      reopened += 1;
    }
  }

  let autoResolved = 0;
  for (const entry of queue) {
    if (seen.has(entry.key)) continue;
    if (entry.status === 'resolved') continue;
    entry.status = 'resolved';
    entry.resolvedAt = at;
    entry.resolution = 'no_longer_detected';
    autoResolved += 1;
  }

  return { at, added, reopened, autoResolved, open: queue.filter((e) => OPEN_STATUSES.has(e.status)).length, total: queue.length };
}

export function listExceptions(book, filter = {}) {
  const queue = ensureQueue(book);
  const status = filter.status || 'open';
  const rows = queue.filter((entry) => {
    if (status === 'all') return true;
    if (status === 'open') return OPEN_STATUSES.has(entry.status);
    return entry.status === status;
  }).filter((entry) => (filter.severity ? entry.severity === filter.severity : true))
    .filter((entry) => (filter.source ? entry.source === filter.source : true));
  return rows.sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || (b.moneyAtRisk - a.moneyAtRisk) || a.id.localeCompare(b.id));
}

export function summarise(rows) {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  let moneyAtRisk = 0;
  for (const row of rows) {
    bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    moneyAtRisk += Number(row.moneyAtRisk) || 0;
  }
  return { count: rows.length, bySeverity, moneyAtRisk: rupees(moneyAtRisk) };
}

const DECISIONS = new Set(['resolve', 'waive', 'assign', 'reopen']);

export function decideException(root, book, { id, decision, note = '', owner = '', actorId = 'ca', clientId = 'SELF' } = {}) {
  if (!DECISIONS.has(decision)) return { ok: false, error: 'UNKNOWN_DECISION' };
  const queue = ensureQueue(book);
  const entry = queue.find((e) => e.id === id);
  if (!entry) return { ok: false, error: 'EXCEPTION_NOT_FOUND' };
  const reason = String(note || '').trim();
  if ((decision === 'waive' || decision === 'resolve') && !reason) return { ok: false, error: 'NOTE_REQUIRED' };
  if (decision === 'assign' && !String(owner || '').trim()) return { ok: false, error: 'OWNER_REQUIRED' };

  const before = { status: entry.status, owner: entry.owner };
  const at = new Date().toISOString();
  if (decision === 'assign') {
    entry.owner = String(owner).trim();
    entry.status = 'in_review';
  } else if (decision === 'reopen') {
    entry.status = 'open';
    entry.resolvedAt = null;
    entry.resolution = '';
  } else {
    entry.status = decision === 'waive' ? 'waived' : 'resolved';
    entry.resolvedAt = at;
    entry.resolution = decision === 'waive' ? 'waived_by_ca' : 'resolved_by_ca';
  }
  if (reason) entry.note = reason;

  appendAuditEvent(root, {
    actorId,
    clientId,
    action: `exceptions.${decision}`,
    metadata: {
      exceptionId: entry.id,
      code: entry.code,
      severity: entry.severity,
      moneyAtRisk: entry.moneyAtRisk,
      from: before.status,
      to: entry.status,
      owner: entry.owner,
      note: entry.note,
    },
  });
  return { ok: true, exception: entry };
}
