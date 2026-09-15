import { RULESET_VERSION } from './core.mjs';
import { parseLedger } from './parseledger.mjs';
import { runRules, countsBySeverity } from './auditrules.mjs';
import { buildWorkingPapers } from './workingpapers.mjs';
import { runClauseChecks } from './clausechecks.mjs';
import { buildEngagement, riskOf } from './risk.mjs';

export { parseLedger, runRules, buildWorkingPapers, runClauseChecks, buildEngagement, riskOf };

export function auditRun({ ledgerText, asOfDate = '2026-09-15' }) {
  const ledger = parseLedger(ledgerText);
  const flags = runRules({ rows: ledger.rows, asOfDate });
  const { workingPapers, sampling } = buildWorkingPapers({ flags, asOfDate, rows: ledger.rows });
  const clauseChecks = runClauseChecks({ rows: ledger.rows, flags, asOfDate });
  const clientIds = [...new Set(ledger.rows.map((r) => r.clientId))].sort();
  const engagement = buildEngagement({ flags, clauseChecks, clientIds });
  const counts = countsBySeverity(flags);
  const riskyClients = engagement.perClient.filter((c) => c.level === 'high' || c.level === 'critical').map((c) => c.clientId);
  return {
    ledger,
    flags,
    workingPapers,
    sampling,
    clauseChecks,
    engagement,
    summary: {
      population: ledger.rows.length,
      flags: flags.length,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      riskyClients,
      sampleSize: sampling.sampleSize,
    },
    rulesetVersion: RULESET_VERSION,
    ok: flags.length === 0,
  };
}
