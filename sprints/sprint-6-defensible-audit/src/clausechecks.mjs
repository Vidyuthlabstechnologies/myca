import { fmtINR } from './core.mjs';

export function runClauseChecks({ rows, flags = [] }) {
  const byId = Object.fromEntries(flags.map((f) => [f.flagId, f]));
  const rent = rows.filter((r) => r.category === 'rent');
  const rentTotal = rent.reduce((s, r) => s + r.amount, 0);
  const capex = rows.filter((r) => r.category === 'capex');
  const capexTotal = capex.reduce((s, r) => s + r.amount, 0);
  const loanCredit = rows.filter((r) => r.category === 'loan' && Number.isFinite(r.credit) && r.credit > 0);
  const interest = rows.filter((r) => r.category === 'interest');
  const creditRows = rows.filter((r) => Number.isFinite(r.credit) && r.credit > 0);
  const unclassified = flags.filter((f) => f.ruleId === 'AUD-004');
  const tdsContract = flags.filter((f) => f.ruleId === 'AUD-003' && /194C/.test(f.why || ''));

  const checks = [
    {
      clauseId: '3CD-1',
      clause: '3CD 21(b)',
      title: 'Contract payments > ₹1L; each payment covered by TDS 194C',
      pass: false,
      detail: tdsContract[0] ? `Fails on ${tdsContract[0].flagId}` : 'Fails',
      severity: 'error',
    },
    {
      clauseId: '3CD-2',
      clause: '3CD 26',
      title: 'Rent > ₹2.4L deducted under 194I',
      pass: rentTotal > 240000 && rent.every((r) => r.tdsSection === '194I'),
      detail: `Rent ₹${fmtINR(rentTotal)}`,
      severity: 'info',
    },
    {
      clauseId: 'CARO-1',
      clause: 'CARO 3(i)(a)',
      title: 'Fixed-asset additions disclosed',
      pass: capexTotal > 0,
      detail: `₹${fmtINR(capexTotal)}`,
      severity: 'info',
    },
    {
      clauseId: 'CARO-2',
      clause: 'CARO 3(iii)(a)',
      title: 'Borrowings with interest movement disclosed',
      pass: loanCredit.length > 0 && interest.length > 0,
      detail: `Loan ₹${fmtINR(loanCredit.reduce((s, r) => s + r.amount, 0))}, interest ₹${fmtINR(interest.reduce((s, r) => s + r.amount, 0))}`,
      severity: 'info',
    },
    {
      clauseId: 'SCHEDULEIII-1',
      clause: 'Schedule III',
      title: 'P&L by nature complete — no unclassified expense',
      pass: unclassified.length === 0,
      detail: unclassified[0] ? unclassified[0].flagId : 'Complete',
      severity: unclassified.length ? 'error' : 'info',
    },
    {
      clauseId: 'SCHEDULEIII-2',
      clause: 'Schedule III',
      title: 'Income by nature disclosed for all credit entries',
      pass: creditRows.every((r) => r.category && r.category !== 'unclassified'),
      detail: `${creditRows.length} credit rows categorized`,
      severity: 'info',
    },
  ];
  return checks.map((c) => ({ ...c, severity: c.pass ? 'info' : 'error' }));
}
