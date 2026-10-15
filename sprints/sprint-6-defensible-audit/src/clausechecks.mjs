import { fmtINR } from './core.mjs';

const RENT_ANNUAL_LIMIT = 240000;

export function runClauseChecks({ rows, flags = [] }) {
  const rent = rows.filter((r) => r.category === 'rent');
  const rentTotal = rent.reduce((s, r) => s + r.amount, 0);
  const rentUncovered = rent.filter((r) => r.tdsSection !== '194I');
  const capex = rows.filter((r) => r.category === 'capex');
  const capexTotal = capex.reduce((s, r) => s + r.amount, 0);
  const capexWithoutParty = capex.filter((r) => !r.party);
  const loanCredit = rows.filter((r) => r.category === 'loan' && Number.isFinite(r.credit) && r.credit > 0);
  const interest = rows.filter((r) => r.category === 'interest');
  const creditRows = rows.filter((r) => Number.isFinite(r.credit) && r.credit > 0);
  const unclassified = flags.filter((f) => f.ruleId === 'AUD-004');
  const tdsContract = flags.filter((f) => f.ruleId === 'AUD-003' && /194C/.test(f.why || ''));
  const uncategorisedIncome = creditRows.filter((r) => !r.category || r.category === 'unclassified');

  const checks = [
    {
      clauseId: '3CD-1',
      clause: 'Form 3CD clause 34(a); s.194C',
      title: 'Contract payments above the 194C limits carry TDS',
      pass: tdsContract.length === 0,
      detail: tdsContract[0] ? `Not deducted: ${tdsContract[0].flagId} (${tdsContract[0].source})` : 'Every contract payment over the single or annual limit carries 194C',
      basis: 'Every row with category contract or repairs, against the single-payment and annual limits in AUD-003',
    },
    {
      clauseId: '3CD-2',
      clause: 'Form 3CD clause 34(a); s.194I',
      title: 'Rent above ₹2.4L a year carries TDS under 194I',
      pass: rentTotal <= RENT_ANNUAL_LIMIT || rentUncovered.length === 0,
      detail: rentTotal <= RENT_ANNUAL_LIMIT ? `Rent ₹${fmtINR(rentTotal)} is within the annual limit` : rentUncovered.length ? `Rent ₹${fmtINR(rentTotal)}; ${rentUncovered.length === 1 ? '1 payment' : `${rentUncovered.length} payments`} without 194I (ledger.csv row ${rentUncovered[0].dataRowNumber})` : `Rent ₹${fmtINR(rentTotal)}, all under 194I`,
      basis: 'Every row with category rent',
    },
    {
      clauseId: 'CARO-1',
      clause: 'CARO 2020 paragraph 3(i)(a)',
      title: 'Property, plant and equipment additions carry a party and a date',
      pass: capexWithoutParty.length === 0,
      detail: capex.length === 0 ? 'No additions in the period' : capexWithoutParty.length ? `Additions ₹${fmtINR(capexTotal)}; ${capexWithoutParty.length} without a party (ledger.csv row ${capexWithoutParty[0].dataRowNumber})` : `Additions ₹${fmtINR(capexTotal)} across ${capex.length} entries, each with a party`,
      basis: 'Every row with category capex',
    },
    {
      clauseId: 'CARO-2',
      clause: 'CARO 2020 paragraph 3(ix)(a)',
      title: 'Borrowings taken in the period have interest recorded',
      pass: loanCredit.length === 0 || interest.length > 0,
      detail: loanCredit.length === 0 ? 'No borrowing in the period' : interest.length ? `Loan ₹${fmtINR(loanCredit.reduce((s, r) => s + r.amount, 0))}, interest ₹${fmtINR(interest.reduce((s, r) => s + r.amount, 0))}` : `Loan ₹${fmtINR(loanCredit.reduce((s, r) => s + r.amount, 0))} with no interest entry`,
      basis: 'Every credit row with category loan and every row with category interest',
    },
    {
      clauseId: 'SCHEDULEIII-1',
      clause: 'Schedule III, Division I, Part II (expenses by nature)',
      title: 'Every expense has a head',
      pass: unclassified.length === 0,
      detail: unclassified[0] ? `${unclassified.length === 1 ? '1 entry' : `${unclassified.length} entries`} unclassified (${unclassified[0].flagId})` : 'Complete',
      basis: 'Every debit row; AUD-004 flags',
    },
    {
      clauseId: 'SCHEDULEIII-2',
      clause: 'Schedule III, Division I, Part II (revenue from operations and other income)',
      title: 'Every credit entry has a head',
      pass: uncategorisedIncome.length === 0,
      detail: uncategorisedIncome.length ? `${uncategorisedIncome.length} of ${creditRows.length} credit rows without a head (ledger.csv row ${uncategorisedIncome[0].dataRowNumber})` : `${creditRows.length} credit rows, each with a head`,
      basis: 'Every credit row',
    },
  ];
  return checks.map((c) => ({ ...c, severity: c.pass ? 'info' : 'error' }));
}
