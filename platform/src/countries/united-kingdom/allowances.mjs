import { parseTaxYear, taxYearOn, gbRule, toPence, toPounds, share, isIsoDate } from './rules.mjs';

const VEHICLE_KINDS = Object.freeze(['car', 'van', 'motorcycle']);

function nonNegative(value) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ruleNote(record) {
  return { id: record.id, effectiveFrom: record.effectiveFrom, unreviewed: !(record.attestations || []).length };
}

function homeRate(bands, hours) {
  const band = [...bands].reverse().find((entry) => hours >= entry.fromHours);
  return band ? band.monthlyPence : 0;
}

function monthlyHours(args, problems) {
  if (Array.isArray(args.homeHours)) {
    if (args.homeHours.length > 12) problems.push({ field: 'homeHours', why: 'Give at most twelve months of hours.' });
    return args.homeHours.slice(0, 12).map((value, index) => {
      const hours = nonNegative(value);
      if (hours === null) problems.push({ field: `homeHours[${index}]`, why: 'Hours are a number, zero or more.' });
      return hours || 0;
    });
  }
  if (args.homeHoursPerMonth === undefined) return [];
  const hours = nonNegative(args.homeHoursPerMonth);
  const months = nonNegative(args.homeMonths ?? 12);
  if (hours === null || months === null || months > 12 || !Number.isInteger(months)) {
    problems.push({ field: 'homeHoursPerMonth', why: 'Give the hours worked at home in a typical month and how many months (up to 12).' });
    return [];
  }
  return Array.from({ length: months }, () => hours);
}

export function simplifiedExpenses(args = {}) {
  const year = parseTaxYear(args.taxYear);
  if (!year) return { ok: false, error: 'BAD_TAX_YEAR', hint: 'Give the tax year as 2026-27.' };
  const rule = gbRule('gb.income-tax.simplified-expenses', year.from);
  const allowances = gbRule('gb.income-tax.allowances', year.from);
  if (!rule || !allowances) return { ok: false, error: 'RULE_NOT_IN_FORCE', taxYear: year.label };
  const r = rule.value;
  const problems = [];
  const vehicles = (Array.isArray(args.vehicles) ? args.vehicles : []).map((vehicle, index) => {
    const kind = VEHICLE_KINDS.includes(vehicle.kind) ? vehicle.kind : null;
    const miles = nonNegative(vehicle.businessMiles);
    if (!kind) problems.push({ field: `vehicles[${index}].kind`, why: 'A vehicle is a car, van or motorcycle.' });
    if (miles === null || !Number.isInteger(miles)) problems.push({ field: `vehicles[${index}].businessMiles`, why: 'Business miles are a whole number, zero or more.' });
    return { name: vehicle.name || kind || 'vehicle', kind, miles: miles || 0, actualCostsPence: toPence(nonNegative(vehicle.actualCosts) || 0) };
  });
  const hours = monthlyHours(args, problems);
  const premises = args.livingAtPremises || null;
  const people = premises ? nonNegative(premises.people) : 0;
  const premisesMonths = premises ? nonNegative(premises.months ?? 12) : 0;
  if (premises && (!Number.isInteger(people) || people < 1 || !Number.isInteger(premisesMonths) || premisesMonths > 12)) problems.push({ field: 'livingAtPremises', why: 'Say how many people live at the business premises (1 or more) and for how many months (up to 12).' });
  const other = nonNegative(args.otherExpenses);
  const turnover = nonNegative(args.turnover);
  if (other === null) problems.push({ field: 'otherExpenses', why: 'Other expenses are an amount in pounds, zero or more.' });
  if (turnover === null) problems.push({ field: 'turnover', why: 'Turnover is an amount in pounds, zero or more.' });
  if (problems.length) return { ok: false, error: 'BAD_INPUT', problems, hint: 'Fix the fields listed.' };

  const notes = [];
  const carMiles = vehicles.filter((vehicle) => vehicle.kind !== 'motorcycle').reduce((sum, vehicle) => sum + vehicle.miles, 0);
  let firstBandLeft = r.carOrVanFirstMiles;
  const vehicleRows = vehicles.map((vehicle) => {
    let pence = 0;
    if (vehicle.kind === 'motorcycle') pence = vehicle.miles * r.motorcyclePence;
    else {
      const first = Math.min(vehicle.miles, firstBandLeft);
      firstBandLeft -= first;
      pence = first * r.carOrVanFirstPence + (vehicle.miles - first) * r.carOrVanAfterPence;
    }
    const better = vehicle.actualCostsPence > 0 ? (pence >= vehicle.actualCostsPence ? 'flat-rate' : 'actual-costs') : 'flat-rate';
    return { name: vehicle.name, kind: vehicle.kind, businessMiles: vehicle.miles, flatRate: toPounds(pence), actualCosts: toPounds(vehicle.actualCostsPence), better };
  });
  if (carMiles > r.carOrVanFirstMiles) notes.push('Business miles in cars and vans past the first 10,000 are at 25p; MyCA counts the 10,000 across all of them, the safer reading.');
  if (vehicleRows.some((row) => row.better === 'actual-costs')) notes.push('For a vehicle whose actual costs are higher, claim the actual business share instead; once the flat rate is used for a vehicle it must be kept for that vehicle.');
  const mileagePence = vehicleRows.reduce((sum, row) => sum + (row.better === 'flat-rate' ? toPence(row.flatRate) : toPence(row.actualCosts)), 0);
  const homeRows = hours.map((value, index) => ({ month: index + 1, hours: value, amount: toPounds(homeRate(r.useOfHome, value)) }));
  const homePence = hours.reduce((sum, value) => sum + homeRate(r.useOfHome, value), 0);
  if (hours.some((value) => value > 0 && value < r.useOfHome[0].fromHours)) notes.push('Months with fewer than 25 hours worked at home get no flat rate.');
  const premisesPence = premises ? r.livingAtPremisesMonthlyPence[Math.min(people, r.livingAtPremisesMonthlyPence.length) - 1] * premisesMonths : 0;
  if (premises) notes.push('The private use amount is taken off the actual premises costs already in your expenses; it is not a further deduction.');
  const otherPence = toPence(other);
  const expensesPence = Math.max(0, otherPence + mileagePence + homePence - premisesPence);
  const result = {
    taxYear: year.label,
    vehicles: vehicleRows,
    mileage: toPounds(mileagePence),
    useOfHome: { months: homeRows, total: toPounds(homePence) },
    privateUseOfPremises: toPounds(premisesPence),
    otherExpenses: toPounds(otherPence),
    totalExpenses: toPounds(expensesPence),
    notes,
    rulesUsed: [ruleNote(rule), ruleNote(allowances)],
  };
  if (args.turnover !== undefined) {
    const turnoverPence = toPence(turnover);
    const allowancePence = allowances.value.tradingAllowancePence;
    const withExpenses = turnoverPence - expensesPence;
    const withAllowance = Math.max(0, turnoverPence - allowancePence);
    const pick = turnoverPence <= allowancePence ? 'trading-allowance-full' : withAllowance < withExpenses ? 'trading-allowance' : 'expenses';
    result.comparison = { turnover: toPounds(turnoverPence), profitWithExpenses: toPounds(withExpenses), profitWithTradingAllowance: toPounds(withAllowance), better: pick, saving: toPounds(Math.max(0, Math.abs(withExpenses - withAllowance))) };
    if (pick === 'trading-allowance-full') notes.push('Turnover is within the £1,000 trading allowance, so it is not taxed and need not be reported.');
    else if (pick === 'trading-allowance') notes.push('The £1,000 trading allowance beats your expenses; claim it instead (pass useTradingAllowance to the tax estimate).');
  }
  return { ok: true, data: result };
}

function statusOf(value) {
  return ['registered', 'unregistered', 'gross'].includes(value) ? value : 'registered';
}

export function cisDeductions(args = {}) {
  const year = args.taxYear ? parseTaxYear(args.taxYear) : null;
  if (args.taxYear && !year) return { ok: false, error: 'BAD_TAX_YEAR', hint: 'Give the tax year as 2026-27.' };
  const statements = Array.isArray(args.statements) ? args.statements : [];
  if (!statements.length) return { ok: false, error: 'BAD_INPUT', hint: 'Add the monthly CIS payment and deduction statements from each contractor.' };
  const problems = [];
  const rows = [];
  statements.forEach((statement, index) => {
    const date = String(statement.paymentDate || '');
    if (!isIsoDate(date)) { problems.push({ field: `statements[${index}].paymentDate`, why: 'Give the payment date as YYYY-MM-DD.' }); return; }
    const gross = nonNegative(statement.gross);
    const materials = nonNegative(statement.materials);
    const deducted = nonNegative(statement.deducted);
    if (gross === null || materials === null || deducted === null) { problems.push({ field: `statements[${index}]`, why: 'Gross, materials and deducted are amounts in pounds, zero or more.' }); return; }
    if (materials > gross) { problems.push({ field: `statements[${index}].materials`, why: 'Materials cannot be more than the gross payment.' }); return; }
    const rule = gbRule('gb.income-tax.cis', date);
    if (!rule) { problems.push({ field: `statements[${index}].paymentDate`, why: 'MyCA has no CIS rates for that date.' }); return; }
    const status = statusOf(statement.status);
    const basisPoints = rule.value[`${status}BasisPoints`];
    const basePence = toPence(gross) - toPence(materials);
    const expectedPence = share(basePence, basisPoints);
    const deductedPence = toPence(deducted);
    const taxYear = taxYearOn(date);
    rows.push({ contractor: String(statement.contractor || 'Contractor'), paymentDate: date, taxYear: taxYear.label, gross: toPounds(toPence(gross)), materials: toPounds(toPence(materials)), deducted: toPounds(deductedPence), status, expected: toPounds(expectedPence), differs: Math.abs(expectedPence - deductedPence) > 100, rule: ruleNote(rule) });
  });
  if (problems.length) return { ok: false, error: 'BAD_INPUT', problems, hint: 'Fix the statements listed.' };
  const inYear = year ? rows.filter((row) => row.taxYear === year.label) : rows;
  const byContractor = new Map();
  for (const row of inYear) {
    const entry = byContractor.get(row.contractor) || { contractor: row.contractor, statements: 0, gross: 0, materials: 0, deducted: 0 };
    entry.statements += 1;
    entry.gross += toPence(row.gross);
    entry.materials += toPence(row.materials);
    entry.deducted += toPence(row.deducted);
    byContractor.set(row.contractor, entry);
  }
  const contractors = [...byContractor.values()].map((entry) => ({ ...entry, gross: toPounds(entry.gross), materials: toPounds(entry.materials), deducted: toPounds(entry.deducted) }));
  const totalDeducted = inYear.reduce((sum, row) => sum + toPence(row.deducted), 0);
  const totalGross = inYear.reduce((sum, row) => sum + toPence(row.gross), 0);
  const mismatches = inYear.filter((row) => row.differs);
  const notes = [];
  if (mismatches.length) notes.push(`${mismatches.length} statement${mismatches.length === 1 ? ' shows' : 's show'} a deduction that is not the CIS rate on the payment less materials; ask the contractor to correct it.`);
  if (inYear.some((row) => row.status === 'unregistered')) notes.push('Deductions at 30% mean the contractor could not verify you; register for CIS with HMRC to pay 20% instead.');
  notes.push('Report the gross payments as turnover and claim the deductions as tax already paid (taxPaid.cis in the tax estimate).');
  return {
    ok: true,
    data: {
      taxYear: year ? year.label : null,
      statements: inYear.sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : 1)),
      contractors,
      totalGross: toPounds(totalGross),
      totalDeducted: toPounds(totalDeducted),
      mismatches: mismatches.length,
      notes,
    },
  };
}
