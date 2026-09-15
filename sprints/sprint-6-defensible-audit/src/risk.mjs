import { SEVERITY_ORDER } from './core.mjs';
import { countsBySeverity, flaggedAmountByClient } from './auditrules.mjs';

const LEVEL_ORDER = ['critical', 'high', 'medium', 'low'];

export function riskOf({ flags }) {
  const amounts = flaggedAmountByClient(flags);
  const clients = [...new Set(flags.map((f) => f.clientId))].sort();
  return clients.map((clientId) => {
    const mine = flags.filter((f) => f.clientId === clientId);
    const { high, medium, low } = countsBySeverity(mine);
    const flaggedAmount = amounts[clientId] || 0;
    const score = Math.min(100, high * 20 + medium * 10 + low * 5 + Math.min(15, Math.floor(flaggedAmount / 100000)));
    const level = score >= 80 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
    return { clientId, high, medium, low, flaggedAmount, score, level };
  });
}

export function buildEngagement({ flags, clientIds = [] }) {
  const perClient = riskOf({ flags });
  const byClient = Object.fromEntries(perClient.map((c) => [c.clientId, c]));
  const counts = countsBySeverity(flags);
  const queue = flags.map((f) => {
    const level = byClient[f.clientId]?.level || 'low';
    return {
      clientId: f.clientId,
      flagId: f.flagId,
      ruleId: f.ruleId,
      severity: f.severity,
      amount: f.amount,
      level,
      message: `${f.severity.toUpperCase()} — ${f.clientId}: ${f.rule} on ${f.narration} (₹${f.amount}), ${f.source}. ${f.why}`,
    };
  }).sort((a, b) => {
    const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (s) return s;
    const l = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
    if (l) return l;
    return b.amount - a.amount;
  });
  const ids = clientIds.length ? clientIds : perClient.map((c) => c.clientId);
  return {
    perClient,
    queue,
    totals: {
      clients: ids.length,
      rows: 24,
      flags: flags.length,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
    },
    ok: flags.length === 0,
  };
}
