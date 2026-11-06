import { appendAuditEvent } from './ca-api.mjs';
import { linesOf, rulesOf, ruleFor, intentOfRule, planMatch, applyMatch, createBankRule, accountFor } from './bank-recon.mjs';

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function byId(a, b) {
  return a.id.localeCompare(b.id);
}

function idsOf(applied) {
  const posted = [...new Set(applied.posted.map((item) => item.id))];
  if (posted.length) return posted;
  return applied.line.match?.id ? [applied.line.match.id] : [];
}

function scopedLines(state, { account, lineIds } = {}) {
  let lines = linesOf(state).filter((line) => line.status === 'unmatched');
  if (account != null && account !== '') {
    const own = accountFor(state, account);
    if (!own) return fail('ACCOUNT_NOT_FOUND', { account });
    lines = lines.filter((line) => line.account === own.id);
  }
  if (Array.isArray(lineIds)) {
    const wanted = new Set(lineIds.map((id) => String(id).trim().toUpperCase()));
    lines = lines.filter((line) => wanted.has(line.id));
  }
  return { ok: true, lines };
}

export function runBankRules(state, { account, dryRun = false, lineIds, ruleIds } = {}) {
  const scope = scopedLines(state, { account, lineIds });
  if (!scope.ok) return scope;
  const only = Array.isArray(ruleIds) ? new Set(ruleIds) : null;
  const made = [];
  const failed = [];
  let left = 0;
  for (const line of scope.lines) {
    const rule = ruleFor(state, line);
    if (!rule || (only && !only.has(rule.id))) {
      left += 1;
      continue;
    }
    const planned = planMatch(state, line, intentOfRule(rule));
    if (!planned.ok) {
      failed.push({ lineId: line.id, ruleId: rule.id, error: planned.error, ...(planned.remainder != null ? { remainder: planned.remainder } : {}) });
      left += 1;
      continue;
    }
    if (dryRun) {
      made.push({ lineId: line.id, ruleId: rule.id, kind: planned.plan.kind, ids: [] });
      continue;
    }
    const applied = applyMatch(state, line, planned.plan, { ruleId: rule.id, note: rule.then?.note || '' });
    if (!applied.ok) {
      failed.push({ lineId: line.id, ruleId: rule.id, error: applied.error });
      left += 1;
      continue;
    }
    rule.hits = Number(rule.hits || 0) + 1;
    const ids = idsOf(applied);
    appendAuditEvent(state, { actorId: state.__actor?.userId || 'automation', action: 'bank_rule_applied', metadata: { lineId: line.id, ruleId: rule.id, kind: planned.plan.kind, ids } });
    made.push({ lineId: line.id, ruleId: rule.id, kind: planned.plan.kind, ids });
  }
  return { ok: true, made, failed, left, dryRun: Boolean(dryRun) };
}

export function addBankRule(state, args = {}) {
  const created = createBankRule(state, args);
  if (!created.ok) return created;
  const applied = args.applyNow === false ? { made: [], failed: [], left: 0 } : runBankRules(state, { ruleIds: [created.rule.id] });
  return { ok: true, rule: created.rule, applied: { made: applied.made, failed: applied.failed, left: applied.left } };
}

export function removeBankRule(state, { id } = {}) {
  const rules = rulesOf(state);
  const key = String(id == null ? '' : id).trim().toUpperCase();
  const at = rules.findIndex((rule) => rule.id === key);
  if (at < 0) return fail('RULE_NOT_FOUND', { id });
  const [rule] = rules.splice(at, 1);
  return { ok: true, rule };
}

export function listBankRules(state) {
  return { ok: true, data: { rules: rulesOf(state).slice().sort(byId) } };
}

function thenWords(then = {}) {
  switch (then.kind) {
    case 'receipt': return `book a receipt from ${then.partyName}`;
    case 'payment': return `book a payment to ${then.partyName}`;
    case 'expense': return `book an expense under ${then.head}`;
    case 'charge': return 'book bank charges';
    case 'interest': return 'book interest income';
    case 'transfer': return `book a transfer with account ${then.otherAccount}`;
    default: return 'ignore the line';
  }
}

export function ruleWords(rule, money = (n) => String(n)) {
  const when = [
    rule.contains ? `the narration has "${rule.contains}"` : '',
    rule.pattern ? `it matches ${rule.pattern}` : '',
    rule.side && rule.side !== 'any' ? `money comes ${rule.side}` : '',
    rule.minAmount != null ? `at least ${money(rule.minAmount)}` : '',
    rule.maxAmount != null ? `at most ${money(rule.maxAmount)}` : '',
  ].filter(Boolean).join(', ');
  const hits = Number(rule.hits || 0);
  return `${rule.id}: when ${when}, ${thenWords(rule.then)}${hits ? ` (used ${hits} ${hits === 1 ? 'time' : 'times'})` : ''}`;
}

function failureWords(failed) {
  return failed.slice(0, 5).map((row) => `${row.lineId} (${row.error}${row.remainder != null ? `, ${row.remainder} left over` : ''})`).join(', ');
}

export function addRuleWords(result, money) {
  const { applied } = result;
  const parts = [`Saved ${ruleWords(result.rule, money)}.`];
  if (applied.made.length) parts.push(`${applied.made.length} open ${applied.made.length === 1 ? 'line' : 'lines'} booked now.`);
  if (applied.failed.length) parts.push(`${applied.failed.length} could not be: ${failureWords(applied.failed)}.`);
  if (!applied.made.length && !applied.failed.length) parts.push('No open line matches it yet; it will apply to the next import.');
  return parts.join(' ');
}

export function rulesWords(data, money) {
  if (!data.rules.length) return 'No bank rules yet. Say "anything from Sharma Traders is a receipt" or "always book SMS CHARGES as bank charges" to make one.';
  return ['Bank rules, applied in this order:', ...data.rules.map((rule) => `· ${ruleWords(rule, money)}`)].join('\n');
}

export function runRulesWords(data) {
  const made = data.made.length;
  const head = data.dryRun ? `${made} open ${made === 1 ? 'line' : 'lines'} would be booked by your rules` : `${made} open ${made === 1 ? 'line' : 'lines'} booked by your rules`;
  const failed = data.failed.length ? `, ${data.failed.length} could not be (${failureWords(data.failed)})` : '';
  return `${head}${failed}, ${data.left} still open.`;
}

export function removeRuleWords(result) {
  return `Removed ${result.rule.id}. Lines it already booked stay as they are.`;
}
