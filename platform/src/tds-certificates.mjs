import { csvRows } from './text-safe.mjs';
import { allocateDeposits, quartersWithDeductions, parseQuarter, tdsReturnDraft } from './tds-return.mjs';
import { salaryAnnexureII } from './salary-annexure.mjs';
import { salaryPrivate } from './employees.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function deducteeKeyOf(row) {
  return row.pan || `NOPAN:${String(row.payee || '').toUpperCase()}`;
}

function deductor(state) {
  const company = state.company || {};
  return { name: company.name || '', tan: company.tan || '', pan: company.pan || '', address: company.address || '', gstin: company.gstin || '' };
}

function challansFor(state, form, label) {
  const covered = allocateDeposits(state);
  const rows = [];
  for (const { deposit, byQuarter } of covered.values()) {
    const amount = byQuarter.get(`${form}|${label}`) || 0;
    if (amount > 0) rows.push({ id: deposit.id, date: deposit.date, challan: deposit.challan, covers: amount / 100 });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function form16A(state, args = {}) {
  if (!state.company?.tdsDeductor) return fail('NOT_A_DEDUCTOR');
  const drafted = tdsReturnDraft(state, args.quarter, { form: 'other' });
  if (!drafted.ok) return drafted;
  const draft = drafted.data;
  const quarter = parseQuarter(draft.quarter);
  const entries = (state.tdsEntries || []).filter((entry) => entry.section !== '192' && quarter.months.includes(entry.date.slice(0, 7)));
  const challans = challansFor(state, 'other', draft.quarter);
  const certificates = draft.deductees.map((row, index) => {
    const own = entries.filter((entry) => deducteeKeyOf(entry) === deducteeKeyOf(row) && entry.section === row.section);
    return {
      serial: index + 1,
      certificateNo: `16A/${draft.quarter.replace(/\s+/g, '-')}/${String(index + 1).padStart(3, '0')}`,
      deductee: { name: row.payee, pan: row.pan, noPan: row.noPan },
      section: row.section,
      quarter: draft.quarter,
      payments: own.map((entry) => ({ date: entry.date, amount: entry.basis, tds: entry.tds, rate: entry.rate, source: entry.source || '' })),
      amountPaid: row.basis,
      tdsDeducted: row.tds,
      challans,
      notes: [
        ...(row.noPan ? ['No PAN: the certificate cannot be issued from TRACES until the PAN is given; TDS was deducted at the higher rate.'] : []),
        ...(draft.shortfall > 0 ? [`${draft.quarter} is not fully deposited yet; the certificate can only be issued after the challans are paid and the statement is filed.`] : []),
      ],
    };
  });
  return {
    ok: true,
    data: {
      form: '16A',
      quarter: draft.quarter,
      quarters: draft.quarters,
      deductor: deductor(state),
      certificates,
      deducted: draft.deducted,
      deposited: draft.deposited,
      filed: draft.filed,
      unreviewed: draft.unreviewed,
      notes: [
        'These are drafts from your books for checking and for the deductee\'s own records. The certificate with the TDS-CPC watermark is generated on TRACES after the quarterly statement is processed; MyCA files nothing.',
        'Challans are the quarter\'s deposits as a whole; TRACES apportions them deductee by deductee from the statement.',
        ...(draft.unreviewed ? ['The rates come from MyCA\'s dated rules, which your CA has not reviewed yet.'] : []),
      ],
      fileName: `Form16A_${state.company.tan || 'TAN'}_${draft.quarter.replace(/\s+/g, '-')}.csv`,
      csv: csvRows([
        ['certificate_no', 'deductee', 'pan', 'section', 'quarter', 'payment_date', 'amount_paid', 'rate', 'tds'],
        ...certificates.flatMap((c) => (c.payments.length ? c.payments.map((p) => [c.certificateNo, c.deductee.name, c.deductee.pan, c.section, c.quarter, p.date, p.amount, p.rate, p.tds]) : [[c.certificateNo, c.deductee.name, c.deductee.pan, c.section, c.quarter, '', c.amountPaid, '', c.tdsDeducted]])),
      ]),
    },
  };
}

export function form16(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  if (!state.company?.tdsDeductor) return fail('NOT_A_DEDUCTOR');
  const annexure = salaryAnnexureII(state, { fy: args.fy });
  if (!annexure.ok) return annexure;
  const a = annexure.data;
  const quarters = quartersWithDeductions(state, 'salary').filter((q) => q.fy === a.fy || String(q.label).endsWith(a.fy));
  const byQuarter = quarters.map((q) => {
    const entries = (state.tdsEntries || []).filter((entry) => entry.section === '192' && q.months.includes(entry.date.slice(0, 7)));
    return { quarter: q.label, months: q.months, tds: round2(entries.reduce((sum, entry) => sum + entry.tds, 0)), challans: challansFor(state, 'salary', q.label), entries };
  });
  const certificates = a.rows.map((row, index) => ({
    serial: index + 1,
    certificateNo: `16/${a.fy}/${row.employeeId}`,
    employee: { id: row.employeeId, name: row.name, pan: row.pan, regime: row.regime },
    partA: byQuarter.map((q) => ({ quarter: q.quarter, amountPaid: round2(q.entries.filter((entry) => entry.payee === row.name).reduce((sum, entry) => sum + entry.basis, 0)), tdsDeducted: round2(q.entries.filter((entry) => entry.payee === row.name).reduce((sum, entry) => sum + entry.tds, 0)), challans: q.challans })),
    partB: {
      grossSalary: row.grossSalary,
      standardDeduction16ia: row.standardDeduction,
      professionalTax16iii: row.professionalTax,
      deductions80C: row.providentFund80C,
      totalIncome: row.totalIncome,
      taxOnTotalIncome: row.taxOnTotalIncome,
      tdsDeducted: row.tdsDeducted,
      shortfall: row.shortfall,
      excess: row.excess,
    },
    notes: [
      ...(row.pan ? [] : ['No PAN recorded; Form 16 cannot be issued from TRACES without it.']),
      ...(row.monthsPaid < 12 ? [`${row.monthsPaid === 1 ? '1 month' : `${row.monthsPaid} months`} of ${a.fy} were run in MyCA.`] : []),
    ],
  }));
  return {
    ok: true,
    data: {
      form: '16',
      fy: a.fy,
      deductor: deductor(state),
      certificates,
      quarters: byQuarter.map((q) => ({ quarter: q.quarter, tds: q.tds, challans: q.challans })),
      unreviewed: a.unreviewed,
      notes: [
        'Part A (tax deducted and deposited) comes from TRACES after the Form 24Q statements are processed; these figures are the books\' own for checking.',
        'Part B is from the approved payroll months. Exemptions under section 10 and the employee\'s declarations (other 80C, 80D, house property, other income) are added from the employee\'s declaration before issue.',
        ...a.notes.filter((note) => !note.startsWith('Exemptions')),
      ],
      fileName: `Form16_${state.company.tan || 'TAN'}_${a.fy}.csv`,
      csv: csvRows([
        ['certificate_no', 'employee_id', 'employee', 'pan', 'regime', 'gross_salary', 'standard_deduction_16ia', 'professional_tax_16iii', 'deductions_80c', 'total_income', 'tax_on_total_income', 'tds_deducted', 'shortfall', 'excess'],
        ...certificates.map((c) => [c.certificateNo, c.employee.id, c.employee.name, c.employee.pan, c.employee.regime, c.partB.grossSalary, c.partB.standardDeduction16ia, c.partB.professionalTax16iii, c.partB.deductions80C, c.partB.totalIncome, c.partB.taxOnTotalIncome, c.partB.tdsDeducted, c.partB.shortfall, c.partB.excess]),
      ]),
    },
  };
}

export function tdsCertificates(state, args = {}) {
  return args.form === 'salary' || args.form === '16' ? form16(state, args) : form16A(state, args);
}

export function certificateWords(data, money) {
  if (data.form === '16A') {
    const lines = [`Form 16A drafts for ${data.quarter}: ${data.certificates.length === 1 ? '1 deductee' : `${data.certificates.length} deductees`}, TDS ${money(data.deducted)} deducted, ${money(data.deposited)} deposited.`];
    for (const c of data.certificates) lines.push(`· ${c.deductee.name}${c.deductee.pan ? ` (${c.deductee.pan})` : ' (no PAN)'}, ${c.section}: paid ${money(c.amountPaid)}, TDS ${money(c.tdsDeducted)}`);
    lines.push(`Saved as ${data.fileName} from the Taxes screen. ${data.notes[0]}`);
    return lines.join('\n');
  }
  const lines = [`Form 16 drafts for ${data.fy}: ${data.certificates.length === 1 ? '1 employee' : `${data.certificates.length} employees`}.`];
  for (const c of data.certificates) lines.push(`· ${c.employee.name}${c.employee.pan ? ` (${c.employee.pan})` : ' (no PAN)'}: salary ${money(c.partB.grossSalary)}, tax ${money(c.partB.taxOnTotalIncome)}, TDS ${money(c.partB.tdsDeducted)}`);
  lines.push(`Saved as ${data.fileName} from the payroll screen. ${data.notes[1]}`);
  return lines.join('\n');
}
