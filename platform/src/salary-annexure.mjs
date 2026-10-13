import { incomeTax } from './sprint-load.mjs';
import { csvRows } from './text-safe.mjs';
import { localToday } from './dates.mjs';
import { salaryPrivate } from './employees.mjs';

const { computeIncomeTax } = incomeTax;
const toRupees = (paise) => Math.round(paise) / 100;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fyOf(period) {
  const [y, m] = period.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function currentFy() {
  return fyOf(localToday().slice(0, 7));
}

export function salaryAnnexureII(state, args = {}) {
  if (salaryPrivate(state)) return { ok: false, error: 'SALARIES_PRIVATE' };
  const fy = String(args.fy || '').trim() || currentFy();
  if (!/^\d{4}-\d{2}$/.test(fy)) return { ok: false, error: 'BAD_FY', hint: 'Use the financial year as 2026-27.' };
  const runs = Object.values(state.payrollRuns || {}).filter((run) => run.country !== 'US' && run.status === 'approved' && fyOf(run.period) === fy).sort((a, b) => a.period.localeCompare(b.period));
  const byEmployee = new Map();
  for (const run of runs) {
    for (const row of run.rows) {
      const w = byEmployee.get(row.employeeId) || { employeeId: row.employeeId, name: row.name, months: [], grossPaise: 0, pfEmployeePaise: 0, ptPaise: 0, tdsPaise: 0, regime: row.tdsBasis?.regime || 'new', noPan: Boolean(row.tdsBasis?.noPan) };
      w.months.push(run.period);
      w.grossPaise += row.grossPaise;
      w.pfEmployeePaise += row.pfEmployeePaise || 0;
      w.ptPaise += row.ptPaise || 0;
      w.tdsPaise += row.tdsPaise || 0;
      w.regime = row.tdsBasis?.regime || w.regime;
      byEmployee.set(row.employeeId, w);
    }
  }
  const notes = new Set();
  const rows = [];
  for (const w of byEmployee.values()) {
    const employee = (state.employees || []).find((item) => item.id === w.employeeId) || {};
    const claims = w.regime === 'old' ? { section80CPaise: w.pfEmployeePaise } : {};
    const salaryForTax = w.regime === 'old' ? Math.max(0, w.grossPaise - w.ptPaise) : w.grossPaise;
    const tax = computeIncomeTax({ fy, regime: w.regime, salaryPaise: salaryForTax, residentIndividual: true, claims });
    if (tax.error) return { ok: false, error: tax.error, ruleId: tax.ruleId };
    const taxPaise = tax.taxPayablePaise;
    const row = {
      employeeId: w.employeeId,
      name: w.name,
      pan: employee.pan || '',
      regime: w.regime,
      monthsPaid: w.months.length,
      grossSalary: toRupees(w.grossPaise),
      professionalTax: toRupees(w.ptPaise),
      standardDeduction: toRupees(tax.standardDeductionPaise || 0),
      providentFund80C: w.regime === 'old' ? toRupees(w.pfEmployeePaise) : 0,
      totalIncome: toRupees(tax.totalIncomePaise || 0),
      taxOnTotalIncome: toRupees(taxPaise),
      tdsDeducted: toRupees(w.tdsPaise),
      shortfall: round2(Math.max(0, toRupees(taxPaise) - toRupees(w.tdsPaise))),
      excess: round2(Math.max(0, toRupees(w.tdsPaise) - toRupees(taxPaise))),
      noPan: w.noPan,
    };
    if (!row.pan) notes.add(`${w.name}: no PAN recorded; the statement needs one or the higher no-PAN rate applies.`);
    if (w.months.length < 12) notes.add(`${w.name}: ${w.months.length === 1 ? '1 month' : `${w.months.length} months`} of ${fy} were run in MyCA; months paid elsewhere are not in these figures.`);
    rows.push(row);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const sum = (key) => round2(rows.reduce((total, row) => total + row[key], 0));
  const tan = String(state.company?.tan || '');
  notes.add('Exemptions under section 10 (HRA, LTA), other 80C investments and 80D premiums are not in these books; the employee\'s declaration adds them before the final Annexure II.');
  notes.add('Shortfall or excess is the year\'s tax against the TDS deducted so far; it settles in the last months of the year or the employee\'s return.');
  return {
    ok: true,
    data: {
      fy,
      form: '24Q Annexure II',
      employees: rows.length,
      rows,
      totals: { grossSalary: sum('grossSalary'), professionalTax: sum('professionalTax'), taxOnTotalIncome: sum('taxOnTotalIncome'), tdsDeducted: sum('tdsDeducted'), shortfall: sum('shortfall'), excess: sum('excess') },
      months: runs.map((run) => run.period),
      unreviewed: runs.some((run) => run.unreviewed),
      notes: [...notes, ...(runs.some((run) => run.unreviewed) ? ['The slabs and limits come from MyCA\'s dated rules, which your CA has not reviewed yet.'] : [])],
      fileName: `24Q_AnnexureII_${tan || 'books'}_${fy}.csv`,
      csv: csvRows([
        ['employee_id', 'name', 'pan', 'regime', 'months_paid', 'gross_salary', 'professional_tax_16iii', 'standard_deduction_16ia', 'provident_fund_80c', 'total_income', 'tax_on_total_income', 'tds_deducted', 'shortfall', 'excess'],
        ...rows.map((row) => [row.employeeId, row.name, row.pan, row.regime, row.monthsPaid, row.grossSalary, row.professionalTax, row.standardDeduction, row.providentFund80C, row.totalIncome, row.taxOnTotalIncome, row.tdsDeducted, row.shortfall, row.excess]),
      ]),
    },
  };
}

export function annexureWords(data, money) {
  if (!data.rows.length) return `No salary month of ${data.fy} is approved in MyCA yet, so Annexure II has no rows.`;
  const lines = [`24Q Annexure II for ${data.fy} (${data.employees === 1 ? '1 employee' : `${data.employees} employees`}, ${data.months.length === 1 ? '1 month' : `${data.months.length} months`} run):`];
  for (const row of data.rows) lines.push(`· ${row.name}${row.pan ? ` (${row.pan})` : ' (no PAN)'}, ${row.regime} regime: salary ${money(row.grossSalary)}, tax ${money(row.taxOnTotalIncome)}, TDS ${money(row.tdsDeducted)}${row.shortfall > 0 ? `, short ${money(row.shortfall)}` : row.excess > 0 ? `, excess ${money(row.excess)}` : ''}`);
  lines.push(`Totals: tax ${money(data.totals.taxOnTotalIncome)}, TDS ${money(data.totals.tdsDeducted)}. Saved as ${data.fileName} from the payroll screen.`);
  if (data.notes.length) lines.push(data.notes.join(' '));
  return lines.join('\n');
}
