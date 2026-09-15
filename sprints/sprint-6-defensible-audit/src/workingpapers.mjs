import { fmtINR } from './core.mjs';

export function systematicSample(rows) {
  const population = rows.length;
  const sampled = rows.filter(r => r.dataRowNumber % 3 === 1);
  return {
    method: 'systematic-interval-3',
    population,
    sampleSize: sampled.length,
    rows: sampled.map(r => `ledger.csv row ${r.dataRowNumber}`)
  };
}

export function buildWorkingPapers({ flags, asOfDate = '2026-09-15', rows = [] }) {
  const sampling = systematicSample(rows);
  const workingPapers = flags.map((f, i) => {
    const wpNum = String(i + 1).padStart(3, '0');
    return {
      wpId: `WP-${wpNum}`,
      clientId: f.clientId,
      ruleId: f.ruleId,
      procedure: `Run ${f.ruleId} (${f.rule}) over full population`,
      evidence: `${f.source} — ${f.narration} (${fmtINR(f.amount)})`,
      finding: f.why,
      conclusion: 'Exception - follow up',
      preparer: 'audit-engine',
      date: asOfDate
    };
  });
  workingPapers.push({
    wpId: 'WP-SMP',
    clientId: '',
    ruleId: '',
    procedure: `Systematic audit sample, interval 3, population ${rows.length}`,
    evidence: '',
    finding: '',
    conclusion: 'Nothing noted',
    preparer: 'audit-engine',
    date: asOfDate
  });
  return { workingPapers, sampling };
}
