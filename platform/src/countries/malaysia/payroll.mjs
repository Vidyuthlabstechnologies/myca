import { rules } from '../../sprint-load.mjs';
import { monthlyPcb, pcbRules, readPcbProfile } from './pcb.mjs';

const toSen = (ringgit) => Math.round(Number(ringgit) * 100);
const toRinggit = (sen) => Math.round(sen) / 100;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function note(record) {
  return { id: record.id, effectiveFrom: record.effectiveFrom, unreviewed: !(record.attestations || []).length };
}

function ruleOn(id, date) {
  const found = rules.rule(id, date);
  return found.ok ? found.record : null;
}

function roundUp(sen, step) {
  return Math.ceil(sen / step) * step;
}

function percent(sen, basisPoints) {
  return (sen * basisPoints) / 10000;
}

export function epfContribution(wageSen, profile, rule) {
  const r = rule.value;
  if (wageSen <= r.noContributionUpToSen) return { employee: 0, employer: 0, basis: 'none' };
  if (profile.citizen === false && profile.date < r.nonCitizen.from) return { employee: 0, employer: 0, basis: 'non-citizen-elective' };
  if (profile.citizen === false) {
    return { employee: roundUp(percent(wageSen, r.nonCitizen.employeeBasisPoints), r.roundUpToSen), employer: roundUp(percent(wageSen, r.nonCitizen.employerBasisPoints), r.roundUpToSen), basis: 'non-citizen' };
  }
  const employerRate = profile.age >= 60 ? r.over60.employerBasisPoints : wageSen <= r.employerCeilingSen ? r.employerUpToCeilingBasisPoints : r.employerAboveCeilingBasisPoints;
  const employeeRate = profile.age >= 60 ? r.over60.employeeBasisPoints : r.employeeBasisPoints;
  const base = wageSen > r.exactAboveSen ? wageSen : roundUp(wageSen, wageSen <= r.employerCeilingSen ? r.smallBandSen : r.largeBandSen);
  return { employee: roundUp(percent(base, employeeRate), r.roundUpToSen), employer: roundUp(percent(base, employerRate), r.roundUpToSen), basis: wageSen > r.exactAboveSen ? 'exact' : 'band', bandTopSen: wageSen > r.exactAboveSen ? null : base };
}

function tableRow(rows, wageSen, ceilingSen) {
  const capped = Math.min(wageSen, ceilingSen);
  return rows.find((row) => capped <= row[0]) || null;
}

export function malaysiaPayroll(args = {}) {
  const month = MONTH.exec(String(args.month || ''));
  if (!month) return fail('BAD_MONTH', { hint: 'Give the payroll month as YYYY-MM.' });
  const date = `${args.month}-01`;
  const epf = ruleOn('my.payroll.epf', date);
  const socso = ruleOn('my.payroll.socso', date);
  const eis = ruleOn('my.payroll.eis', date);
  if (!epf || !socso || !eis) return fail('RULE_NOT_IN_FORCE', { hint: 'MyCA has the contribution tables from October 2024 wages.' });
  const pcbUsed = pcbRules(date);
  const employees = Array.isArray(args.employees) ? args.employees : [];
  if (!employees.length) return fail('BAD_INPUT', { hint: 'Add at least one employee with monthly wages.' });
  const problems = [];
  const rows = employees.map((employee, index) => {
    const wage = Number(employee.wages);
    if (!Number.isFinite(wage) || wage < 0) { problems.push({ employee: index, field: 'wages', why: 'Monthly wages are an amount in ringgit, zero or more.' }); return null; }
    const age = Number(employee.age ?? 30);
    if (!Number.isInteger(age) || age < 14 || age > 100) { problems.push({ employee: index, field: 'age', why: 'Age is a whole number of years.' }); return null; }
    const bonus = employee.bonus === undefined || employee.bonus === null || employee.bonus === '' ? 0 : Number(employee.bonus);
    if (!Number.isFinite(bonus) || bonus < 0) { problems.push({ employee: index, field: 'bonus', why: 'Bonus or other extra pay this month is an amount in ringgit, zero or more.' }); return null; }
    const read = readPcbProfile(employee, toSen);
    if (read.problems.length) { for (const problem of read.problems) problems.push({ employee: index, ...problem }); return null; }
    const wageSen = toSen(wage);
    const bonusSen = toSen(bonus);
    const notes = [];
    if (employee.citizen === false && date < epf.value.nonCitizen.from) notes.push('EPF for non-Malaysian workers is mandatory only from October 2025 wages; before that it is elective, so add it only if the worker registered.');
    const epfProfile = { age, citizen: employee.citizen !== false, date };
    const epfOnWages = epfContribution(wageSen, epfProfile, epf);
    const epfPart = bonusSen > 0 ? epfContribution(wageSen + bonusSen, epfProfile, epf) : epfOnWages;
    let socsoEmployer = 0;
    let socsoEmployee = 0;
    let eisEach = 0;
    if (wageSen > 0 && wageSen <= socso.value.tableStartsAboveSen) {
      notes.push('Wages of RM300 or less are below the encoded SOCSO and EIS rows; read them from the PERKESO table.');
    } else if (wageSen > 0) {
      if (age >= 60) notes.push('At 60 and over only the employer pays SOCSO, under the second category; read it from the PERKESO table. No EIS is due.');
      else if (employee.citizen === false) {
        notes.push('Foreign workers are covered by the SOCSO Employment Injury Scheme only: the employer pays and nothing is taken from the wage; read the employer amount from the PERKESO table. No EIS is due unless PERKESO says otherwise.');
        if (employee.eisCovered === true) eisEach = tableRow(eis.value.rows, wageSen, eis.value.ceilingSen)[1];
      } else {
        const row = tableRow(socso.value.rows, wageSen, socso.value.ceilingSen);
        socsoEmployer = row[1];
        socsoEmployee = row[2];
        const eisRow = tableRow(eis.value.rows, wageSen, eis.value.ceilingSen);
        eisEach = eisRow[1];
      }
    }
    const employeeTotal = epfPart.employee + socsoEmployee + eisEach;
    const employerTotal = epfPart.employer + socsoEmployer + eisEach;
    let pcb = null;
    if (!pcbUsed) notes.push('PCB is not worked out for this month: MyCA has no PCB rules for it.');
    else {
      pcb = monthlyPcb({ month: Number(month[2]), wageSen, epfSen: epfOnWages.employee, bonusSen, bonusEpfSen: epfPart.employee - epfOnWages.employee, profile: read.profile }, pcbUsed);
      if (pcb.assumedSamePaySinceJanuary) notes.push('PCB assumes the same pay and PCB every month since January; give yearToDate for an exact figure.');
      if (!read.profile.resident) notes.push('Non-resident: PCB is the flat non-resident rate on this month\'s pay.');
    }
    const pcbSen = pcb ? pcb.pcbSen : 0;
    return {
      name: String(employee.name || `Employee ${index + 1}`).slice(0, 60),
      wages: toRinggit(wageSen),
      bonus: toRinggit(bonusSen),
      epf: { employee: toRinggit(epfPart.employee), employer: toRinggit(epfPart.employer), basis: epfPart.basis },
      socso: { employee: toRinggit(socsoEmployee), employer: toRinggit(socsoEmployer) },
      eis: { employee: toRinggit(eisEach), employer: toRinggit(eisEach) },
      pcb: pcb ? { amount: toRinggit(pcbSen), normal: toRinggit(pcb.normalSen), onBonus: toRinggit(pcb.bonusPcbSen), zakatOffset: toRinggit(pcb.zakatOffsetSen), category: read.profile.category, children: read.profile.children, method: pcb.method, yearlyChargeableIncome: pcb.chargeableSen === null ? null : toRinggit(pcb.chargeableSen), yearlyTax: pcb.yearlyTaxSen === null ? null : toRinggit(pcb.yearlyTaxSen) } : null,
      employeeDeductions: toRinggit(employeeTotal + pcbSen),
      netBeforePcb: toRinggit(wageSen + bonusSen - employeeTotal),
      netPay: toRinggit(wageSen + bonusSen - employeeTotal - pcbSen),
      employerCost: toRinggit(wageSen + bonusSen + employerTotal),
      notes,
    };
  });
  if (problems.length) return fail('BAD_INPUT', { problems, hint: 'Fix the employees listed.' });
  const sum = (pick) => toRinggit(rows.reduce((total, row) => total + toSen(pick(row)), 0));
  const year = Number(month[1]);
  const next = Number(month[2]) === 12 ? `${year + 1}-01` : `${year}-${String(Number(month[2]) + 1).padStart(2, '0')}`;
  return {
    ok: true,
    data: {
      month: args.month,
      employees: rows,
      totals: { wages: sum((row) => row.wages + row.bonus), pcb: sum((row) => (row.pcb ? row.pcb.amount : 0)), epf: sum((row) => row.epf.employee + row.epf.employer), socso: sum((row) => row.socso.employee + row.socso.employer), eis: sum((row) => row.eis.employee + row.eis.employer), employerCost: sum((row) => row.employerCost) },
      dueBy: `${next}-15`,
      notes: ['Pay EPF through i-Akaun (Employer), SOCSO and EIS through PERKESO ASSIST, and PCB through e-PCB Plus, by the 15th of the next month.', 'PCB follows LHDN\'s computerised method with EPF, the individual, spouse and child reliefs; other reliefs the employee declared on Form TP1 go in deductions. Check a few employees against LHDN\'s e-PCB calculator until the PCB rules are attested.'],
      rulesUsed: [note(epf), note(socso), note(eis), ...(pcbUsed ? [note(pcbUsed.pcb), note(pcbUsed.bands), note(pcbUsed.rebate)] : [])],
    },
  };
}
