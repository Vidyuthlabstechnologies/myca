import { SEVERITY_ORDER } from './core.mjs';

const TDS_CAT = { contract: '194C', fees: '194J', interest: '194A', rent: '194I', repairs: '194C' };
const TDS_CFG = {
  '194C': { single: 30000, annual: 100000 },
  '194J': { single: 30000 },
  '194I': { annual: 240000 },
  '194A': { single: 40000 },
};
const PARTY_EXEMPT = new Set(['salary', 'bank_charges']);

export const RULES = [
  { id: 'AUD-001', label: 'DUPLICATE_TRANSACTION', severity: 'high' },
  { id: 'AUD-002', label: 'ROUND_TRIP_TRANSFER', severity: 'medium' },
  { id: 'AUD-003', label: 'TDS_NOT_DEDUCTED', severity: 'medium' },
  { id: 'AUD-004', label: 'UNCLASSIFIED_EXPENSE', severity: 'medium' },
  { id: 'AUD-005', label: 'FUTURE_DATED_ENTRY', severity: 'high' },
  { id: 'AUD-006', label: 'MISSING_PARTY', severity: 'low' },
  { id: 'AUD-007', label: 'CAPEX_CLASSIFICATION', severity: 'medium' },
  { id: 'AUD-008', label: 'ZERO_AMOUNT_ENTRY', severity: 'low' },
];

function daysBetween(a, b) {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.round(ms / 86400000);
}

function flag(id, row, rule, extra = {}) {
  return {
    flagId: id,
    clientId: row.clientId,
    ruleId: rule.id,
    rule: rule.label,
    severity: rule.severity,
    date: row.date,
    narration: row.narration,
    amount: row.amount,
    party: row.party,
    why: extra.why,
    source: `ledger.csv row ${row.dataRowNumber}`,
  };
}

export function runRules({ rows, asOfDate = '2026-09-15' }) {
  const byRule = RULES.reduce((m, r) => { m[r.id] = r; return m; }, {});
  const out = [];

  const groups = new Map();
  for (const row of rows) {
    const key = [row.clientId, row.date, row.party, row.category, row.amount].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const g of groups.values()) {
    for (let i = 1; i < g.length; i++) {
      const later = g[i];
      const earlier = g[0];
      out.push(flag('', later, byRule['AUD-001'], {
        why: `Duplicate of ledger.csv row ${earlier.dataRowNumber} (${earlier.narration}).`,
      }));
    }
  }

  const transfers = rows.filter((r) => r.category === 'transfer');
  const used = new Set();
  for (let i = 0; i < transfers.length; i++) {
    const a = transfers[i];
    if (used.has(a.dataRowNumber)) continue;
    for (let j = i + 1; j < transfers.length; j++) {
      const b = transfers[j];
      if (b.clientId !== a.clientId || used.has(b.dataRowNumber)) continue;
      if (a.amount !== b.amount) continue;
      const aDr = Number.isFinite(a.debit) && a.debit > 0;
      const bDr = Number.isFinite(b.debit) && b.debit > 0;
      const aCr = Number.isFinite(a.credit) && a.credit > 0;
      const bCr = Number.isFinite(b.credit) && b.credit > 0;
      if (!((aDr && bCr) || (aCr && bDr))) continue;
      const gap = Math.abs(daysBetween(a.date, b.date));
      if (gap > 14) continue;
      const earlier = a.dataRowNumber <= b.dataRowNumber ? a : b;
      const later = earlier === a ? b : a;
      used.add(a.dataRowNumber);
      used.add(b.dataRowNumber);
      out.push(flag('', earlier, byRule['AUD-002'], {
        why: `Round-trip transfer with ledger.csv row ${later.dataRowNumber} within ${gap} days.`,
      }));
      break;
    }
  }

  const uncoveredByParty = new Map();
  const allByParty = new Map();
  for (const row of rows) {
    const section = TDS_CAT[row.category];
    if (!section) continue;
    const pay = Number.isFinite(row.debit) && row.debit > 0;
    if (!pay) continue;
    const key = `${row.clientId}|${row.party}|${section}`;
    if (!allByParty.has(key)) allByParty.set(key, 0);
    allByParty.set(key, allByParty.get(key) + row.amount);
    if (!row.tdsSection) {
      if (!uncoveredByParty.has(key)) uncoveredByParty.set(key, 0);
      uncoveredByParty.set(key, uncoveredByParty.get(key) + row.amount);
    }
  }
  for (const row of rows) {
    const section = TDS_CAT[row.category];
    if (!section || row.tdsSection) continue;
    if (!(Number.isFinite(row.debit) && row.debit > 0)) continue;
    const cfg = TDS_CFG[section];
    const key = `${row.clientId}|${row.party}|${section}`;
    const cumUnc = uncoveredByParty.get(key) || 0;
    const cumAll = allByParty.get(key) || 0;
    const singleHit = cfg.single != null && row.amount > cfg.single;
    const annualHit = cfg.annual != null && cumAll > cfg.annual;
    if (!singleHit && !annualHit) continue;
    out.push(flag('', row, byRule['AUD-003'], {
      why: `TDS ${section} not deducted; amount ₹${row.amount} vs single ${cfg.single ?? 'n/a'}, uncovered cumulative ₹${cumUnc}, party cumulative ₹${cumAll} vs annual ${cfg.annual ?? 'n/a'}.`,
    }));
  }

  for (const row of rows) {
    if (row.category === 'unclassified') {
      out.push(flag('', row, byRule['AUD-004'], { why: 'Expense category is unclassified.' }));
    }
    if (row.date > asOfDate) {
      out.push(flag('', row, byRule['AUD-005'], { why: `Transaction date ${row.date} is after as-of ${asOfDate}.` }));
    }
    const debitPos = Number.isFinite(row.debit) && row.debit > 0;
    if (debitPos && !row.party && !PARTY_EXEMPT.has(row.category)) {
      out.push(flag('', row, byRule['AUD-006'], { why: 'Debit entry has no party (not salary/bank_charges).' }));
    }
    if (row.category === 'repairs' && row.amount > 100000) {
      out.push(flag('', row, byRule['AUD-007'], { why: `Repairs ₹${row.amount} exceeds ₹100000 capex threshold.` }));
    }
    if (row.amount === 0) {
      out.push(flag('', row, byRule['AUD-008'], { why: 'Zero amount ledger entry.' }));
    }
  }

  out.sort((a, b) => {
    const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (s) return s;
    if (a.clientId !== b.clientId) return a.clientId < b.clientId ? -1 : 1;
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
    const an = Number(a.source.replace(/\D/g, ''));
    const bn = Number(b.source.replace(/\D/g, ''));
    return an - bn;
  });
  return out.map((f, i) => ({ ...f, flagId: `FLG-${String(i + 1).padStart(3, '0')}` }));
}

export function flaggedAmountByClient(flags) {
  const m = {};
  for (const f of flags) {
    const include = f.severity === 'medium' || f.severity === 'low';
    if (!include) continue;
    m[f.clientId] = (m[f.clientId] || 0) + f.amount;
  }
  return m;
}

export function countsBySeverity(flags) {
  const c = { high: 0, medium: 0, low: 0 };
  for (const f of flags) {
    if (f.severity in c) c[f.severity] += 1;
  }
  return c;
}
