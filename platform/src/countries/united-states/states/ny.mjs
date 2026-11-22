import { whole, positive, check, lineTable } from '../state-kit.mjs';
import { round4, fraction, times, percentOf, stateTax, cityTax, householdCredit, cityEicRate, schoolRateReduction, prorateMonths, eliminationThreshold, itemizedDeduction } from './ny-tax.mjs';

const NYC_CHOICES = Object.freeze(['full-year', 'part-year', 'no']);
const OWNERS = Object.freeze(['taxpayer', 'spouse']);
const answered = (answers, id) => answers[id] !== undefined && answers[id] !== null && answers[id] !== '';
const amount = (answers, id) => positive(answers[id]);

const QUESTIONS = Object.freeze([
  Object.freeze({ id: 'nycResident', kind: 'choice', options: NYC_CHOICES, text: 'Did you live in New York City (the Bronx, Brooklyn, Manhattan, Queens or Staten Island) this year?', help: 'full-year, part-year (you moved in or out) or no. New York City tax is on the state return for city residents.' }),
  Object.freeze({ id: 'nycMonths', when: { answer: { id: 'nycResident', in: ['part-year'] } }, kind: 'count', text: 'Part-year New York City residents: full months you lived in the city', help: 'Count a period of more than half a month as a full month (Form IT-360.1, line 39).' }),
  Object.freeze({ id: 'nycPeriodIncome', when: { answer: { id: 'nycResident', in: ['part-year'] } }, kind: 'amount', text: 'Part-year New York City residents: New York adjusted gross income received while you lived in the city', help: 'Form IT-360.1, line 20, column B: income from all sources while a city resident, after the New York additions and subtractions.' }),
  Object.freeze({ id: 'yonkersResident', kind: 'choice', options: NYC_CHOICES, text: 'Did you live in the City of Yonkers this year?', help: 'full-year, part-year or no. Yonkers residents pay a surcharge of 16.75% of their net New York State tax.' }),
  Object.freeze({ id: 'yonkersMonths', when: { answer: { id: 'yonkersResident', in: ['part-year'] } }, kind: 'count', text: 'Part-year Yonkers residents: months you lived in Yonkers', help: 'Item D2 on Form IT-201.' }),
  Object.freeze({ id: 'yonkersPeriodIncome', when: { answer: { id: 'yonkersResident', in: ['part-year'] } }, kind: 'amount', text: 'Part-year Yonkers residents: New York adjusted gross income received while you lived in Yonkers', help: 'Form IT-360.1, line 20, column C.' }),
  Object.freeze({ id: 'yonkersNonresidentWages', when: { answer: { id: 'yonkersResident', in: ['no'] } }, kind: 'yesno', text: 'Did you or your spouse work in Yonkers while not living there?', help: 'Wages or self-employment earned in Yonkers by a nonresident are taxed on Form Y-203.' }),
  Object.freeze({ id: 'newYorkMunicipalInterest', kind: 'amount', text: 'Part of your federally tax-exempt interest that came from New York State or its local governments', help: 'Tax-exempt interest from other states\' bonds and funds is added back on line 20; New York bonds are not. Enter 0 if none of it is from New York.' }),
  Object.freeze({ id: 'publicEmployee414h', kind: 'amount', text: 'Public employee 414(h) retirement contributions shown in box 14 of your W-2s', help: 'New York State and local, NYC, SUNY/CUNY optional retirement and MABSTOA members only; not 401(k), 403(b) or 457 contributions.' }),
  Object.freeze({ id: 'governmentPensionTaxpayer', kind: 'amount', text: 'Your taxable pension from New York State, a New York local government or the federal government', help: 'Fully subtracted on line 26. Include NYS and NYC retirement systems, military and federal civil service pensions.' }),
  Object.freeze({ id: 'governmentPensionSpouse', kind: 'amount', text: 'Your spouse\'s taxable pension from New York State, a New York local government or the federal government', help: 'Joint returns only.' }),
  Object.freeze({ id: 'pensionAfter59HalfTaxpayer', kind: 'amount', text: 'If you turned 59½ this year: other pension, annuity and IRA income you received after that date', help: 'Only payments after you reached 59½ can be excluded on line 29.' }),
  Object.freeze({ id: 'pensionAfter59HalfSpouse', kind: 'amount', text: 'If your spouse turned 59½ this year: their other pension, annuity and IRA income received after that date', help: 'Joint returns only.' }),
  Object.freeze({ id: 'ny529Contributions', kind: 'amount', text: 'Contributions you made this year to New York\'s 529 college savings program as account owner', help: 'Subtracted up to $5,000, or $10,000 on a joint return (line 30).' }),
  Object.freeze({ id: 'ny529NonqualifiedAddition', kind: 'amount', text: 'New York 529 nonqualified withdrawal addition (Line 22 worksheet, line 7)', help: 'Only if you took a nonqualified withdrawal from a New York 529 account.' }),
  Object.freeze({ id: 'otherAdditions', kind: 'amount', text: 'Other New York additions (Form IT-225, line 9)', help: 'For example out-of-state 529 contributions you deducted federally do not apply; use the IT-225 instructions.' }),
  Object.freeze({ id: 'otherSubtractions', kind: 'amount', text: 'Other New York subtractions (Form IT-225, line 18)', help: 'For example disability income exclusion or interest on U.S. obligations from a partnership.' }),
  Object.freeze({ id: 'collegeTuition', kind: 'amount', text: 'Qualified undergraduate college tuition you paid (after scholarships and aid), at most $10,000 for each student', help: 'Gives the New York college tuition credit (Form IT-272). Full-year residents only.' }),
  Object.freeze({ id: 'salesUseTax', kind: 'amount', text: 'New York sales or use tax you owe on purchases with no New York sales tax', help: 'Online or out-of-state purchases; the line cannot be left blank. Enter 0 if none.' }),
  Object.freeze({ id: 'spouseFederalAgi', kind: 'amount', text: 'Married filing separately: your spouse\'s federal adjusted gross income', help: 'The household credits for married filing separately use both spouses\' federal AGI.' }),
  Object.freeze({ id: 'mctmtZone1Taxpayer', kind: 'amount', text: 'Your self-employment net earnings allocated to MCTMT Zone 1 (the five NYC counties)', help: 'Metropolitan commuter transportation mobility tax applies when one person\'s earnings in a zone are over $50,000.' }),
  Object.freeze({ id: 'mctmtZone2Taxpayer', kind: 'amount', text: 'Your self-employment net earnings allocated to MCTMT Zone 2 (Dutchess, Nassau, Orange, Putnam, Rockland, Suffolk, Westchester)', help: 'See Form IT-203-A to allocate business done both inside and outside a zone.' }),
  Object.freeze({ id: 'mctmtZone1Spouse', kind: 'amount', text: 'Your spouse\'s self-employment net earnings allocated to MCTMT Zone 1', help: 'Joint returns only; the $50,000 threshold applies to each spouse separately.' }),
  Object.freeze({ id: 'mctmtZone2Spouse', kind: 'amount', text: 'Your spouse\'s self-employment net earnings allocated to MCTMT Zone 2', help: 'Joint returns only.' }),
]);

const NOT_COVERED = Object.freeze([
  'Form IT-225 modifications other than the totals you give (other additions and other subtractions)',
  'Real property tax credit (Form IT-214), child and dependent care credits (Form IT-216) and the noncustodial parent EIC (Form IT-209)',
  'The college tuition itemized deduction (Form IT-272 Part 4 and Form IT-203-B); the credit is computed instead',
  'Yonkers nonresident earnings tax (Form Y-203)',
  'Joint returns where only one spouse lived in New York City or Yonkers, and spouses with different city resident periods',
  'Charitable Gifts Trust Fund contributions, the mortgage interest limits of the pre-2018 Internal Revenue Code and the other IT-196 subtraction and addition adjustments (B to K)',
  'The IT-112-R limit that the resident credit may not reduce New York tax below the tax on income excluding the other state\'s income, credits for tax paid to a Canadian province or to local governments, and the resident credit on a part-year return',
  'New York City unincorporated business tax credit, accumulation distribution credits, lump-sum distribution taxes (Form IT-230) and estimated tax penalty (Form IT-2105.9)',
  'Business, investment and other carryover credits on Forms IT-201-ATT and IT-203-ATT',
]);

function filerOf(ctx, owner) {
  return ctx.filers.find((item) => item.role === owner) || null;
}

function halfDate(dateOfBirth) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOfBirth || ''));
  if (!match) return null;
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + 714;
  const yearPart = Math.floor(total / 12);
  const monthPart = (total % 12) + 1;
  return `${yearPart}-${String(monthPart).padStart(2, '0')}-${match[3]}`;
}

function retirementOf(ctx, owner) {
  return ctx.forms.filter((form) => form.kind === '1099-R' && (form.owner === 'spouse' ? 'spouse' : 'taxpayer') === owner).reduce((total, form) => {
    const fields = form.fields || {};
    const taxable = fields.taxableAmount === undefined || fields.taxableAmount === null || fields.taxableAmount === '' ? fields.grossDistribution : fields.taxableAmount;
    return total + positive(taxable);
  }, 0);
}

function pensionLines(ctx, answers, mods, checks) {
  const owners = ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
  const retirementTotal = positive(ctx.income.iraTaxable) + positive(ctx.income.pensionTaxable);
  const rows = [];
  for (const owner of owners) {
    const filer = filerOf(ctx, owner);
    const retirement = Math.min(retirementOf(ctx, owner), retirementTotal);
    const government = Math.min(amount(answers, owner === 'spouse' ? 'governmentPensionSpouse' : 'governmentPensionTaxpayer'), retirement);
    const other = Math.max(0, retirement - government);
    const reached = halfDate(filer?.dateOfBirth);
    const yearStart = `${ctx.taxYear}-01-01`;
    const yearEnd = `${ctx.taxYear}-12-31`;
    let qualifying = 0;
    if (other && reached && reached < yearStart) qualifying = other;
    else if (other && reached && reached <= yearEnd) {
      const id = owner === 'spouse' ? 'pensionAfter59HalfSpouse' : 'pensionAfter59HalfTaxpayer';
      if (answered(answers, id)) qualifying = Math.min(other, amount(answers, id));
      else {
        const daysAfter = (Date.parse(`${yearEnd}T00:00:00Z`) - Date.parse(`${reached}T00:00:00Z`)) / 86400000;
        qualifying = Math.round((other * Math.max(0, daysAfter)) / ctx.daysInYear);
        checks.push(check('warning', 'NY_PENSION_AFTER_59_HALF', `${owner === 'spouse' ? 'Your spouse' : 'You'} reached 59½ on ${reached}; only pension and IRA income received after that date can be excluded, and MyCA split it by days.`, 'Give the amount received after that date in your New York answers.'));
      }
    }
    rows.push({ owner, retirement, government, other, exclusion: Math.min(mods.pensionExclusion, qualifying) });
  }
  const government = rows.reduce((total, row) => total + row.government, 0);
  const exclusion = rows.reduce((total, row) => total + row.exclusion, 0);
  if (retirementTotal && !ctx.forms.some((form) => form.kind === '1099-R')) checks.push(check('warning', 'NY_PENSION_OWNER', 'Pension or IRA income has no 1099-R to show whose it is, so no pension exclusion was taken.', 'Add the 1099-R forms to the federal return.'));
  return { rows, government, exclusion };
}

function federalLines(ctx) {
  const income = ctx.income;
  const parts = { 1: income.wages, 2: income.taxableInterest, 3: income.ordinaryDividends, 4: income.stateRefundTaxable, 5: 0, 6: income.businessIncome, 7: income.capitalGain, 8: 0, 9: income.iraTaxable, 10: income.pensionTaxable, 11: 0, 13: 0, 14: income.unemployment, 15: income.socialSecurityTaxable };
  const listed = Object.values(parts).reduce((total, value) => total + whole(value), 0);
  parts[16] = whole(income.totalIncome) - listed;
  parts[17] = listed + parts[16];
  parts[18] = whole(income.adjustments);
  parts[19] = parts[17] - parts[18];
  return parts;
}

function modificationLines(ctx, answers, mods, checks) {
  const taxExempt = positive(ctx.income.taxExemptInterest);
  if (taxExempt && !answered(answers, 'newYorkMunicipalInterest')) checks.push(check('warning', 'NY_MUNICIPAL_INTEREST', 'All your federally tax-exempt interest was added back as interest on other states\' bonds. Interest on New York State and New York local bonds is not added.', 'Say how much of it is from New York bonds in your New York answers.'));
  const pension = pensionLines(ctx, answers, mods, checks);
  const college = Math.min(amount(answers, 'ny529Contributions'), ctx.filingStatus === 'mfj' ? mods.college529Limit.joint : mods.college529Limit.other);
  return {
    muni: Math.max(0, taxExempt - Math.min(taxExempt, amount(answers, 'newYorkMunicipalInterest'))),
    plan414h: amount(answers, 'publicEmployee414h'),
    nonqualified529: amount(answers, 'ny529NonqualifiedAddition'),
    otherAdditions: amount(answers, 'otherAdditions'),
    otherSubtractions: amount(answers, 'otherSubtractions'),
    college529: college,
    pension,
  };
}

function deductionFor(ctx, filing, reader, nyAgi, checks) {
  const deductions = reader.read('deductions');
  const itemizedRule = reader.read('itemized');
  const dependentFiler = Boolean(ctx.filers[0]?.canBeClaimedAsDependent);
  const standard = ctx.filingStatus === 'single' && dependentFiler ? deductions.standard.singleDependent : deductions.standard[ctx.filingStatus];
  const itemized = itemizedRule ? itemizedDeduction({ ctx, rule: itemizedRule, filingStatus: ctx.filingStatus, nyAgi }) : null;
  const useItemized = Boolean(itemized && itemized.total > standard);
  if (ctx.filingStatus === 'mfs') checks.push(check('info', 'NY_MFS_DEDUCTION', 'Married filing separately: both spouses must take the New York standard deduction unless both itemize on their New York returns.'));
  if (useItemized && positive(ctx.itemized.mortgageInterest) > 0) checks.push(check('info', 'NY_ITEMIZED_MORTGAGE', 'New York itemized deductions follow the Internal Revenue Code as it stood before 2018; MyCA takes the mortgage interest on your Forms 1098 in full.'));
  return { standard, itemized, useItemized, amount: useItemized ? itemized.total : standard, dependentExemption: deductions.dependentExemption * ctx.dependents.length, dependentFiler, deductions };
}

function mctmtFor(ctx, answers, rule, checks) {
  const owners = ctx.filingStatus === 'mfj' ? OWNERS : ['taxpayer'];
  const pick = (zone) => owners.reduce((total, owner) => {
    const value = amount(answers, `mctmt${zone}${owner === 'spouse' ? 'Spouse' : 'Taxpayer'}`);
    return total + (value > rule.thresholdPerPerson ? value : 0);
  }, 0);
  const anyAnswer = ['mctmtZone1Taxpayer', 'mctmtZone2Taxpayer', 'mctmtZone1Spouse', 'mctmtZone2Spouse'].some((id) => answered(answers, id));
  if (positive(ctx.income.businessIncome) > rule.thresholdPerPerson && !anyAnswer) checks.push(check('warning', 'NY_MCTMT_UNANSWERED', 'You have self-employment income over $50,000. If any of it is from business carried on in the Metropolitan Commuter Transportation District (New York City and Dutchess, Nassau, Orange, Putnam, Rockland, Suffolk and Westchester counties), the MCTMT is due on this return.', 'Give your net earnings allocated to each MCTMT zone, 0 if none.'));
  const zone1 = pick('Zone1');
  const zone2 = pick('Zone2');
  const tax1 = percentOf(zone1, rule.zone1Bp);
  const tax2 = percentOf(zone2, rule.zone2Bp);
  return { zone1, zone2, tax1, tax2, total: tax1 + tax2 };
}

function residentCredit(filing, nyAgi, tax, household, checks) {
  const others = filing.residency === 'nonresident' ? [] : filing.otherStates || [];
  if (!others.length) return { amount: 0, rows: [] };
  const payable = Math.max(0, tax - household);
  const rows = others.map((other) => {
    const share = whole(nyAgi) > 0 ? round4(positive(other.income) / whole(nyAgi)) : 0;
    const line27 = times(payable, share);
    return { state: other.state, 24: positive(other.tax), 25: payable, 26: share, 27: line27, 28: Math.min(positive(other.tax), line27) };
  });
  const total = rows.reduce((sum, row) => sum + row[28], 0);
  checks.push(check('info', 'NY_IT112R', 'Resident credit for tax paid to another state (Form IT-112-R) is limited to the New York tax on the income taxed there. Keep a copy of the other state\'s return.'));
  return { amount: Math.min(total, payable), rows };
}

function eicFor(ctx, nysTax, credit, household, rule) {
  const federalEic = positive(ctx.federal.lines['27']);
  if (!federalEic) return { federalEic: 0, tentative: 0, allowed: 0, worksheetB: null };
  const tentative = percentOf(federalEic, rule.eicBp);
  const line5 = Math.max(0, nysTax - credit);
  const line15 = Math.min(line5, household);
  return { federalEic, tentative, allowed: Math.max(0, tentative - line15), worksheetB: { 1: nysTax, 2: credit, 4: credit, 5: line5 }, line13: line5, line14: household, line15 };
}

function empireStateChildCredit(ctx, rule) {
  const children = ctx.dependents.filter((item) => item.qualifyingChild && item.age !== null && item.age >= 0 && item.age < 17);
  if (!children.length) return null;
  const line1 = children.filter((item) => item.age < 4).length;
  const line3 = children.length - line1;
  const line2 = line1 * rule.escc.underFour;
  const line4 = line3 * rule.escc.fourToSixteen;
  const line5 = line2 + line4;
  const line6 = Math.max(0, Math.floor(whole(ctx.income.agi) / 1000) * 1000);
  const threshold = rule.escc.threshold[ctx.filingStatus];
  const line7 = Math.max(0, line6 - threshold);
  const line8 = percentOf(line7, rule.escc.reductionBp);
  return { 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: Math.max(0, line5 - line8) };
}

function collegeCredit(answers, rule) {
  const paid = amount(answers, 'collegeTuition');
  if (!paid) return null;
  const credit = paid < rule.collegeTuition.smallLimit ? Math.min(paid, rule.collegeTuition.smallCredit) : percentOf(paid, rule.collegeTuition.rateBp);
  return { 3: paid, ...(paid < rule.collegeTuition.smallLimit ? { 4: rule.collegeTuition.smallCredit, 5: credit } : { 6: paid, 7: credit }), credit };
}

function investmentIncome(ctx) {
  const income = ctx.income;
  return positive(income.taxableInterest) + positive(income.taxExemptInterest) + positive(income.ordinaryDividends) + Math.max(0, whole(income.capitalGain));
}

function cityResidency(ctx, filing, answers, checks, resident) {
  const choice = answers.nycResident;
  if (!answered(answers, 'nycResident')) {
    checks.push(check('error', 'NY_NYC_RESIDENCY_UNANSWERED', 'New York needs to know whether you lived in New York City; city residents pay New York City tax on this return.', 'Answer the New York City question (full-year, part-year or no).'));
    return 'no';
  }
  if (!resident && choice === 'full-year') {
    checks.push(check('error', 'NY_NYC_FULL_YEAR_ON_IT203', 'You were not a New York State resident all year, so you cannot have been a New York City resident all year.', 'Answer part-year for New York City and give the months and income of the city period.'));
    return 'part-year';
  }
  return choice;
}

function cityPeriod(ctx, filing, answers, nyAgi, checks, prefix, label) {
  const monthsId = `${prefix}Months`;
  const incomeId = `${prefix}PeriodIncome`;
  const fallbackMonths = filing.residency === 'part-year' ? Math.round((filing.residentDays / ctx.daysInYear) * 12) : 6;
  const months = answered(answers, monthsId) ? Math.min(12, Number(answers[monthsId])) : fallbackMonths;
  if (!answered(answers, monthsId)) checks.push(check('warning', `NY_${prefix.toUpperCase()}_MONTHS`, `MyCA assumed ${months} months as a ${label} resident.`, `Give the number of months you lived in ${label}.`));
  let income = amount(answers, incomeId);
  if (!answered(answers, incomeId)) {
    income = prorateMonths(Math.max(0, nyAgi), months);
    checks.push(check('warning', `NY_${prefix.toUpperCase()}_PERIOD_INCOME`, `Income for your ${label} resident period was split by months (${months} of 12). Form IT-360.1 needs the income you actually received while a ${label} resident.`, `Give your New York adjusted gross income for the ${label} resident period.`));
  }
  return { months, income };
}

function computeCity(ctx, filing, reader, base, checks) {
  const nyc = reader.read('nyc');
  const answers = filing.answers;
  const status = ctx.filingStatus;
  const readTable = () => reader.read('nyc-table');
  const resident = filing.residency === 'full-year';
  const choice = cityResidency(ctx, filing, answers, checks, resident);
  const out = { choice, lines: {}, schedule: null, tax: 0, refundable: [], schoolFixed: 0, schoolRate: 0, eic: 0, elimination: 0, schedules: {} };
  if (choice === 'no' || !nyc) return out;
  const spouseAgi = status === 'mfs' ? amount(answers, 'spouseFederalAgi') : 0;
  const householdAgi = whole(ctx.income.agi) + spouseAgi;
  const fullHousehold = householdCredit({ table: nyc.household, filingStatus: status, federalAgi: householdAgi, dependents: ctx.dependents.length, dependentFiler: base.dependentFiler });
  const schoolIncome = whole(ctx.income.agi) - positive(ctx.income.iraTaxable);
  const schoolCents = nyc.schoolFixedCents[status];
  const schoolAllowed = !base.dependentFiler && schoolIncome <= nyc.schoolFixedIncomeLimit;
  const eicRate = cityEicRate(base.nyAgi, nyc);
  let cityTaxable = 0;
  let cityAfterCredits = 0;
  let periodShare = 1;
  if (choice === 'full-year') {
    const line47 = base.taxable;
    const taxed = cityTax({ taxable: line47, filingStatus: status, schedules: nyc.schedules, readTable });
    const line49 = Math.max(0, taxed.tax - fullHousehold);
    cityTaxable = line47;
    cityAfterCredits = line49;
    out.lines = { 47: line47, '47a': taxed.tax, 48: fullHousehold, 49: line49, 50: 0, 51: 0, 52: line49, 53: 0, 54: line49 };
    out.method = taxed.method;
    out.schoolFixed = schoolAllowed ? Math.round(schoolCents / 100) : 0;
  } else {
    const period = cityPeriod(ctx, filing, answers, base.nyAgi, checks, 'nyc', 'New York City');
    const deductions = base.deduction.deductions;
    const standardFull = status === 'single' && base.dependentFiler ? deductions.standard.singleDependent : deductions.standard[status];
    const line44 = prorateMonths(base.deduction.useItemized ? base.deduction.itemized.total : standardFull, period.months);
    if (base.deduction.useItemized) checks.push(check('warning', 'NY_IT3601_ITEMIZED', 'You itemize: Form IT-360.1 Part 2 needs the itemized deductions paid during your city resident period. MyCA prorated your New York itemized deduction by months.', 'Check Form IT-360.1 Part 2 with your records.'));
    const line42 = prorateMonths(deductions.dependentExemption, period.months) * ctx.dependents.length;
    const line43 = period.income;
    const line45 = Math.max(0, line43 - line44);
    const line47 = Math.max(0, line45 - line42);
    const line48 = cityTax({ taxable: line47, filingStatus: status, schedules: nyc.schedules, readTable, forceSchedule: true }).tax;
    const line49 = prorateMonths(fullHousehold, period.months);
    const line50 = Math.max(0, line48 - line49);
    cityTaxable = line47;
    cityAfterCredits = line50;
    periodShare = Math.min(1, fraction(line43, base.nyAgi));
    out.schedules['IT-360.1'] = lineTable({ 20: base.nyAgi, '20B': line43, 39: period.months, 40: prorateMonths(deductions.dependentExemption, period.months), 41: ctx.dependents.length, 42: line42, 43: line43, 44: line44, 45: line45, 46: line42, 47: line47, 48: line48, 49: line49, 50: line50, 53: line50, 55: line50 });
    out.lines = resident ? { 50: line50, 52: line50, 53: 0, 54: line50 } : { 51: line50, 52: 0, '52a': line50 };
    out.schoolFixed = schoolAllowed ? Math.round((schoolCents * period.months) / 12 / 100) : 0;
    out.months = period.months;
  }
  out.tax = cityAfterCredits;
  out.cityTaxable = cityTaxable;
  out.schoolRate = base.dependentFiler ? 0 : schoolRateReduction(cityTaxable, status, nyc);
  const federalEic = positive(ctx.federal.lines['27']);
  if (federalEic) {
    const fullCityEic = times(federalEic, eicRate.rate);
    out.eic = choice === 'full-year' ? fullCityEic : times(fullCityEic, periodShare);
    out.schedules.cityEic = lineTable({ 'rate-1': base.nyAgi, ...(eicRate.line2 !== undefined ? { 'rate-2': eicRate.line2, 'rate-3': eicRate.line3, 'rate-4': eicRate.line4, 'rate-5': eicRate.line5 } : {}), 'rate-6': eicRate.rate, 'C-1': federalEic, 'C-2': eicRate.rate, 'C-3': fullCityEic, ...(choice === 'full-year' ? {} : { 'C-8': periodShare, 'C-9': out.eic }) });
  }
  const elimination = reader.read('nyc-elimination');
  const threshold = elimination ? eliminationThreshold(elimination, status, ctx.dependents.length) : null;
  if (threshold !== null && cityAfterCredits > 0 && investmentIncome(ctx) <= elimination.investmentIncomeLimit) {
    const line1 = whole(ctx.income.agi);
    const line3 = Math.max(0, line1 - threshold);
    if (line3 <= elimination.phaseOut) {
      const line4 = elimination.phaseOut - line3;
      const line5 = round4(line4 / elimination.phaseOut);
      const line9 = out.eic;
      const line10 = Math.max(0, cityAfterCredits - line9);
      out.elimination = times(line10, line5);
      out.schedules['IT-270'] = lineTable({ 1: line1, 2: threshold, 3: line3, 4: line4, 5: line5, 6: cityAfterCredits, 8: line9, 9: line9, 10: line10, 11: out.elimination });
    }
  }
  return out;
}

function yonkersFor(ctx, filing, answers, checks, resident) {
  if (answers.yonkersNonresidentWages === true) checks.push(check('error', 'NY_Y203_NOT_PREPARED', 'You worked in Yonkers while not living there: the Yonkers nonresident earnings tax is filed on Form Y-203 with this return, which MyCA does not prepare.', 'Have Form Y-203 prepared, or answer no if you had no Yonkers earnings.'));
  if (!answered(answers, 'yonkersResident')) {
    checks.push(check('warning', 'NY_YONKERS_UNANSWERED', 'Form IT-201 item D2 asks every filer whether they lived in Yonkers; MyCA assumed you did not.', 'Answer the Yonkers question.'));
    return 'no';
  }
  if (!resident && answers.yonkersResident === 'full-year') return 'part-year';
  return answers.yonkersResident;
}

function sharedLocal(ctx, filing, answers, reader, checks) {
  const mctmtRule = reader.read('mctmt');
  const mctmt = mctmtRule ? mctmtFor(ctx, answers, mctmtRule, checks) : { zone1: 0, zone2: 0, tax1: 0, tax2: 0, total: 0 };
  if (!answered(answers, 'salesUseTax')) checks.push(check('warning', 'NY_SALES_USE_TAX', 'New York asks for sales or use tax owed on purchases with no New York sales tax; the line cannot be left blank.', 'Answer the sales and use tax question (0 if none).'));
  if (ctx.filingStatus === 'mfs' && !answered(answers, 'spouseFederalAgi')) checks.push(check('warning', 'NY_MFS_SPOUSE_AGI', 'The household credits for married filing separately use both spouses\' federal AGI; MyCA used only yours.', 'Give your spouse\'s federal AGI.'));
  return { mctmt, salesUseTax: amount(answers, 'salesUseTax') };
}

function localWithholding(filing, city, yonkers, checks) {
  const local = positive(filing.payments.localWithheld);
  if (!local) return { nyc: 0, yonkers: 0 };
  if (city !== 'no') return { nyc: local, yonkers: 0 };
  if (yonkers !== 'no') return { nyc: 0, yonkers: local };
  checks.push(check('warning', 'NY_LOCAL_WITHHELD', 'Your W-2s show local tax withheld but you said you did not live in New York City or Yonkers; MyCA counted it as New York City tax withheld.', 'Check box 19 and box 20 of your W-2s.'));
  return { nyc: local, yonkers: 0 };
}

function computeResident(ctx, filing, reader, rates, credits, mods) {
  const answers = filing.answers;
  const checks = [];
  const fed = federalLines(ctx);
  const mod = modificationLines(ctx, answers, mods, checks);
  const line20 = mod.muni;
  const line21 = mod.plan414h;
  const line22 = mod.nonqualified529;
  const line23 = mod.otherAdditions;
  const line24 = fed[19] + line20 + line21 + line22 + line23;
  const line25 = positive(fed[4]);
  const line26 = mod.pension.government;
  const line27 = positive(fed[15]);
  const line28 = positive(ctx.income.usObligationInterest);
  const line29 = mod.pension.exclusion;
  const line30 = mod.college529;
  const line31 = mod.otherSubtractions;
  const line32 = line25 + line26 + line27 + line28 + line29 + line30 + line31;
  const line33 = line24 - line32;
  const deduction = deductionFor(ctx, filing, reader, line33, checks);
  const line34 = deduction.amount;
  const line35 = Math.max(0, line33 - line34);
  const line36 = deduction.dependentExemption;
  const line37 = Math.max(0, line35 - line36);
  const line38 = line37;
  const taxed = stateTax({ taxable: line38, nyAgi: line33, filingStatus: ctx.filingStatus, rates, readTable: () => reader.read('tax-table') });
  const line39 = taxed.tax;
  const household = reader.read('household-credit');
  const spouseAgi = ctx.filingStatus === 'mfs' ? amount(answers, 'spouseFederalAgi') : 0;
  const line40 = household ? householdCredit({ table: household, filingStatus: ctx.filingStatus, federalAgi: fed[19] + spouseAgi, dependents: ctx.dependents.length, dependentFiler: deduction.dependentFiler }) : 0;
  const resident = residentCredit(filing, line33, line39, line40, checks);
  const line41 = resident.amount;
  const line42 = 0;
  const line43 = line40 + line41 + line42;
  const line44 = Math.max(0, line39 - line43);
  const line45 = 0;
  const line46 = line44 + line45;
  const base = { nyAgi: line33, taxable: line38, dependentFiler: deduction.dependentFiler, deduction };
  const city = computeCity(ctx, filing, reader, base, checks);
  const shared = sharedLocal(ctx, filing, answers, reader, checks);
  const eic = eicFor(ctx, line39, line41, line40, credits);
  const escc = empireStateChildCredit(ctx, credits);
  const college = deduction.dependentFiler ? null : collegeCredit(answers, credits);
  const line63 = escc ? escc[9] : 0;
  const line65 = eic.allowed;
  const line68 = college ? college.credit : 0;
  const line69 = city.schoolFixed;
  const line69a = city.schoolRate;
  const line70 = city.eic;
  const line70a = city.elimination;
  const yonkers = yonkersFor(ctx, filing, answers, checks, true);
  let line55 = 0;
  let line57 = 0;
  let yonkersSchedule = null;
  const yonkersRule = reader.read('yonkers');
  const yonkersCredits = line63 + line65 + line68 + line69 + line69a;
  if (yonkers === 'full-year' && yonkersRule && line46 > 0) {
    const m = Math.max(0, line46 - yonkersCredits);
    line55 = percentOf(m, yonkersRule.residentSurchargeBp);
    yonkersSchedule = lineTable({ a: line46, b: line63, e: line65, g: line68, h: line69 + line69a, j: yonkersCredits, l: yonkersCredits, m, n: yonkersRule.residentSurchargeBp / 10000, o: line55 });
  } else if (yonkers === 'part-year' && yonkersRule) {
    const period = cityPeriod(ctx, filing, answers, line33, checks, 'yonkers', 'Yonkers');
    const line65y = Math.max(0, line46 - yonkersCredits);
    const share = fraction(period.income, line33);
    const line74 = times(line65y, share);
    line57 = percentOf(line74, yonkersRule.residentSurchargeBp);
    yonkersSchedule = lineTable({ 56: line46, 57: line63, 59: line65, '61a': line69 + line69a, 62: line68, 64: yonkersCredits, 65: line65y, 73: share, 74: line74, 76: yonkersRule.residentSurchargeBp / 10000, 77: line57 });
  }
  const line56 = 0;
  const line54 = city.lines['54'] || 0;
  const line58 = line54 + shared.mctmt.total + line55 + line56 + line57;
  const line59 = shared.salesUseTax;
  const line60 = 0;
  const line61 = line46 + line58 + line59 + line60;
  const withheldLocal = localWithholding(filing, city.choice, yonkers, checks);
  const line72 = filing.payments.withheld;
  const line73 = withheldLocal.nyc;
  const line74 = withheldLocal.yonkers;
  const line75 = filing.payments.estimated + filing.payments.extension;
  const refundable = line63 + line65 + line68 + line69 + line69a + line70 + line70a;
  const line76 = refundable + line72 + line73 + line74 + line75;
  if (ctx.dependents.some((item) => item.qualifyingChild && item.age !== null && item.age < 17) && !line63) checks.push(check('info', 'NY_ESCC_PHASED_OUT', 'Your Empire State child credit is reduced to zero by the income phase-out.'));
  const lines = lineTable({
    ...fed, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26, 27: line27, 28: line28, 29: line29, 30: line30, 31: line31, 32: line32, 33: line33,
    34: line34, 35: line35, 36: line36, 37: line37, 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 46: line46,
    ...city.lines, '54a': shared.mctmt.zone1, '54b': shared.mctmt.zone2, '54c': shared.mctmt.tax1, '54d': shared.mctmt.tax2, '54e': shared.mctmt.total, 55: line55, 56: line56, 57: line57, 58: line58, 59: line59, 60: line60, 61: line61, 62: line61,
    63: line63, 65: line65, 68: line68, 69: line69, '69a': line69a, 70: line70, '70a': line70a, 72: line72, 73: line73, 74: line74, 75: line75, 76: line76, 77: Math.max(0, line76 - line61), 80: Math.max(0, line61 - line76),
  });
  const schedules = {
    taxComputation: { method: taxed.method, ...(taxed.worksheet ? { worksheet: lineTable(taxed.worksheet) } : {}) },
    ...(deduction.itemized ? { 'IT-196': lineTable(deduction.itemized.lines), ...(deduction.itemized.limitation ? { 'IT-196 line 40 worksheet': deduction.itemized.limitation } : {}) } : {}),
    ...(escc ? { 'IT-213': lineTable(escc) } : {}),
    ...(eic.federalEic ? { 'IT-215': lineTable({ 10: eic.federalEic, 11: credits.eicBp / 10000, 12: eic.tentative, 13: eic.line13, 14: eic.line14, 15: eic.line15, 16: eic.allowed, ...(city.eic ? { 27: city.eic } : {}) }) } : {}),
    ...(resident.rows.length ? { 'IT-112-R': resident.rows } : {}),
    ...(college ? { 'IT-272': lineTable(college) } : {}),
    ...(yonkersSchedule ? { yonkers: yonkersSchedule } : {}),
    ...city.schedules,
    pensionExclusion: mod.pension.rows,
  };
  return {
    form: 'IT-201',
    lines,
    schedules,
    stateIncome: line33,
    taxableIncome: line37,
    taxBeforeCredits: line39,
    nonrefundableCredits: [...(line40 ? [{ code: 'NY_HOUSEHOLD', label: 'New York State household credit', amount: Math.min(line40, line39) }] : []), ...(line41 ? [{ code: 'NY_RESIDENT_CREDIT', label: 'Resident credit for tax paid to another state', amount: line41 }] : [])],
    otherStateCredit: line41,
    otherTaxes: [
      ...(line54 ? [{ code: 'NYC_TAX', label: 'New York City resident tax', amount: line54 }] : []),
      ...(shared.mctmt.total ? [{ code: 'NY_MCTMT', label: 'Metropolitan commuter transportation mobility tax', amount: shared.mctmt.total }] : []),
      ...(line55 + line57 ? [{ code: 'YONKERS_SURCHARGE', label: 'Yonkers resident income tax surcharge', amount: line55 + line57 }] : []),
      ...(line59 ? [{ code: 'NY_USE_TAX', label: 'Sales or use tax', amount: line59 }] : []),
    ],
    totalTax: line61,
    refundableCredits: [
      ...(line63 ? [{ code: 'NY_ESCC', label: 'Empire State child credit', amount: line63 }] : []),
      ...(line65 ? [{ code: 'NY_EIC', label: 'New York State earned income credit', amount: line65 }] : []),
      ...(line68 ? [{ code: 'NY_COLLEGE_TUITION', label: 'College tuition credit', amount: line68 }] : []),
      ...(line69 ? [{ code: 'NYC_SCHOOL_FIXED', label: 'NYC school tax credit (fixed amount)', amount: line69 }] : []),
      ...(line69a ? [{ code: 'NYC_SCHOOL_RATE', label: 'NYC school tax credit (rate reduction amount)', amount: line69a }] : []),
      ...(line70 ? [{ code: 'NYC_EIC', label: 'New York City earned income credit', amount: line70 }] : []),
      ...(line70a ? [{ code: 'NYC_ELIMINATION', label: 'New York City income tax elimination credit', amount: line70a }] : []),
    ],
    localPayments: line73 + line74,
    checks,
    notes: [`New York State tax by the ${taxed.method}.`, ...(city.method ? [`New York City tax by the ${city.method}.`] : [])],
  };
}

function newYorkColumn(ctx, filing, fed, mod) {
  const sourced = filing.sourced;
  const partYear = filing.residency === 'part-year';
  const share = partYear ? filing.share : 0;
  const ny = { 1: whole(sourced.wages), 2: whole(sourced.taxableInterest), 3: whole(sourced.ordinaryDividends), 4: whole(sourced.stateRefundTaxable), 5: 0, 6: whole(sourced.businessIncome), 7: whole(sourced.capitalGain), 8: 0, 9: whole(sourced.iraTaxable), 10: whole(sourced.pensionTaxable), 11: 0, 13: 0, 14: whole(sourced.unemployment), 15: whole(sourced.socialSecurityTaxable), 16: whole(sourced.otherIncome) };
  ny[17] = Object.values(ny).reduce((total, value) => total + value, 0);
  ny[18] = whole(sourced.adjustments);
  ny[19] = ny[17] - ny[18];
  const retirementFed = positive(fed[9]) + positive(fed[10]);
  const retirementNy = positive(ny[9]) + positive(ny[10]);
  const retirementShare = retirementFed ? Math.min(1, retirementNy / retirementFed) : 0;
  const wageShare = positive(fed[1]) ? Math.min(1, positive(ny[1]) / positive(fed[1])) : 0;
  ny[20] = Math.round(mod.muni * share);
  ny[21] = Math.round(mod.plan414h * wageShare);
  ny[22] = Math.round((mod.otherAdditions + mod.nonqualified529) * share);
  ny[23] = ny[19] + ny[20] + ny[21] + ny[22];
  ny[24] = positive(ny[4]);
  ny[25] = Math.round(mod.pension.government * retirementShare);
  ny[26] = positive(ny[15]);
  ny[27] = positive(sourced.usObligationInterest);
  ny[28] = Math.round(mod.pension.exclusion * retirementShare);
  ny[29] = Math.round((mod.otherSubtractions + mod.college529) * share);
  ny[30] = ny[24] + ny[25] + ny[26] + ny[27] + ny[28] + ny[29];
  ny[31] = ny[23] - ny[30];
  return ny;
}

function computeNonresident(ctx, filing, reader, rates, credits, mods) {
  const answers = filing.answers;
  const checks = [];
  const partYear = filing.residency === 'part-year';
  const fed = federalLines(ctx);
  const mod = modificationLines(ctx, answers, mods, checks);
  fed[20] = mod.muni;
  fed[21] = mod.plan414h;
  fed[22] = mod.otherAdditions + mod.nonqualified529;
  fed[23] = fed[19] + fed[20] + fed[21] + fed[22];
  fed[24] = positive(fed[4]);
  fed[25] = mod.pension.government;
  fed[26] = positive(fed[15]);
  fed[27] = positive(ctx.income.usObligationInterest);
  fed[28] = mod.pension.exclusion;
  fed[29] = mod.otherSubtractions + mod.college529;
  fed[30] = fed[24] + fed[25] + fed[26] + fed[27] + fed[28] + fed[29];
  fed[31] = fed[23] - fed[30];
  const ny = newYorkColumn(ctx, filing, fed, mod);
  const line32 = fed[31];
  const deduction = deductionFor(ctx, filing, reader, line32, checks);
  const line33 = deduction.amount;
  const line34 = Math.max(0, line32 - line33);
  const line35 = deduction.dependentExemption;
  const line36 = Math.max(0, line34 - line35);
  const line37 = line36;
  const taxed = stateTax({ taxable: line37, nyAgi: line32, filingStatus: ctx.filingStatus, rates, readTable: () => reader.read('tax-table') });
  const line38 = taxed.tax;
  const household = reader.read('household-credit');
  const spouseAgi = ctx.filingStatus === 'mfs' ? amount(answers, 'spouseFederalAgi') : 0;
  const line39 = household ? householdCredit({ table: household, filingStatus: ctx.filingStatus, federalAgi: fed[19] + spouseAgi, dependents: ctx.dependents.length, dependentFiler: deduction.dependentFiler }) : 0;
  const line40 = Math.max(0, line38 - line39);
  const line41 = 0;
  const line42 = Math.max(0, line40 - line41);
  const eic = eicFor(ctx, line38, 0, line39, credits);
  const line43 = eic.allowed;
  const line44 = Math.max(0, line42 - line43);
  const line45 = fed[31] > 0 && ny[31] > 0 ? round4(ny[31] / fed[31]) : 0;
  const line46 = times(line44, line45);
  const line47 = 0;
  const line48 = Math.max(0, line46 - line47);
  const line49 = 0;
  const line50 = line48 + line49;
  const base = { nyAgi: line32, taxable: line37, dependentFiler: deduction.dependentFiler, deduction };
  const city = partYear ? computeCity(ctx, filing, reader, base, checks) : { choice: 'no', lines: {}, schedules: {}, tax: 0, schoolFixed: 0, schoolRate: 0, eic: 0, elimination: 0 };
  const shared = sharedLocal(ctx, filing, answers, reader, checks);
  let refundableEic = 0;
  let partYearEic = null;
  if (partYear && line43 > line42) {
    const line20 = line43 - line42;
    const line23 = Math.min(Math.max(0, filing.sourcedAgi), whole(fed[19]));
    const line25 = whole(fed[19]) > 0 ? Math.min(1, round4(line23 / whole(fed[19]))) : (line23 > 0 ? 1 : 0);
    refundableEic = times(line20, line25);
    partYearEic = { 18: line43, 19: line42, 20: line20, 22: line20, 23: line23, 24: whole(fed[19]), 25: line25, 26: refundableEic };
  }
  const yonkers = partYear ? yonkersFor(ctx, filing, answers, checks, false) : 'no';
  if (!partYear && answers.yonkersNonresidentWages === true) yonkersFor(ctx, filing, { ...answers, yonkersResident: 'no' }, checks, false);
  let line54 = 0;
  let yonkersSchedule = null;
  const yonkersRule = reader.read('yonkers');
  if (yonkers === 'part-year' && yonkersRule) {
    const period = cityPeriod(ctx, filing, answers, line32, checks, 'yonkers', 'Yonkers');
    const line70 = Math.max(0, line44 - line47) + line49;
    const line71c = refundableEic + city.schoolFixed + city.schoolRate;
    const line72 = Math.max(0, line70 - line71c);
    const share = fraction(period.income, line32);
    const line75 = times(line72, share);
    line54 = percentOf(line75, yonkersRule.residentSurchargeBp);
    yonkersSchedule = lineTable({ 66: line44, 67: line47, 68: Math.max(0, line44 - line47), 69: line49, 70: line70, 71: refundableEic, '71b': city.schoolFixed + city.schoolRate, '71c': line71c, 72: line72, 73: share, 75: line75, 76: yonkersRule.residentSurchargeBp / 10000, 77: line54 });
  }
  const line51 = city.lines['51'] || 0;
  const line52a = city.lines['52a'] || 0;
  const line53 = 0;
  const line55 = line52a + shared.mctmt.total + line53 + line54;
  const line56 = shared.salesUseTax;
  const line57 = 0;
  const line58 = line50 + line55 + line56 + line57;
  const line60 = city.schoolFixed;
  const line60a = city.schoolRate;
  const line60b = city.elimination;
  const line61 = refundableEic + city.eic;
  const withheldLocal = localWithholding(filing, city.choice, yonkers, checks);
  const line62 = filing.payments.withheld;
  const line63 = withheldLocal.nyc;
  const line64 = withheldLocal.yonkers;
  const line65 = filing.payments.estimated + filing.payments.extension;
  const line66 = line60 + line60a + line60b + line61 + line62 + line63 + line64 + line65;
  if (ctx.dependents.some((item) => item.qualifyingChild && item.age !== null && item.age < 17)) checks.push(check('info', 'NY_ESCC_FULL_YEAR_ONLY', 'The Empire State child credit is for full-year New York residents only, so it is not on Form IT-203.'));
  if (partYear && filing.otherStates?.length === 0 && ctx.w2.some((row) => row.state && row.state !== 'NY')) checks.push(check('info', 'NY_PART_YEAR_RESIDENT_CREDIT', 'A part-year resident may claim a resident credit (Form IT-112-R) for tax paid to another state on income received while a New York resident; MyCA does not compute it on Form IT-203.'));
  const columns = {};
  for (let line = 1; line <= 31; line += 1) {
    if (line === 12) continue;
    columns[line] = fed[line];
    columns[`${line}-NY`] = ny[line];
  }
  const lines = lineTable({
    ...columns, 32: line32, 33: line33, 34: line34, 35: line35, 36: line36, 37: line37, 38: line38, 39: line39, 40: line40, 41: line41, 42: line42, 43: line43, 44: line44, 45: line45, 46: line46, 47: line47, 48: line48, 49: line49, 50: line50,
    ...city.lines, '52b': shared.mctmt.zone1, '52c': shared.mctmt.zone2, '52d': shared.mctmt.tax1, '52e': shared.mctmt.tax2, '52f': shared.mctmt.total, 53: line53, 54: line54, 55: line55, 56: line56, 57: line57, 58: line58, 59: line58,
    60: line60, '60a': line60a, '60b': line60b, 61: line61, 62: line62, 63: line63, 64: line64, 65: line65, 66: line66, 67: Math.max(0, line66 - line58), 70: Math.max(0, line58 - line66),
  });
  const schedules = {
    taxComputation: { method: taxed.method, ...(taxed.worksheet ? { worksheet: lineTable(taxed.worksheet) } : {}) },
    ...(deduction.itemized ? { 'IT-196': lineTable(deduction.itemized.lines) } : {}),
    ...(eic.federalEic ? { 'IT-215': lineTable({ 10: eic.federalEic, 11: credits.eicBp / 10000, 12: eic.tentative, 13: eic.line13, 14: eic.line14, 15: eic.line15, 16: eic.allowed, ...(partYearEic || {}), ...(city.eic ? { 27: city.eic } : {}) }) } : {}),
    ...(refundableEic || city.eic ? { 'IT-203-ATT': lineTable({ 10: refundableEic, 11: city.eic, 13: refundableEic + city.eic, 17: line61 }) } : {}),
    ...(yonkersSchedule ? { 'IT-360.1 Part 5': yonkersSchedule } : {}),
    ...city.schedules,
    pensionExclusion: mod.pension.rows,
  };
  return {
    form: 'IT-203',
    lines,
    schedules,
    stateIncome: ny[31],
    taxableIncome: line37,
    taxBeforeCredits: line38,
    nonrefundableCredits: [...(line39 ? [{ code: 'NY_HOUSEHOLD', label: 'New York State household credit', amount: Math.min(line39, line38) }] : []), ...(line43 ? [{ code: 'NY_EIC_BASE', label: 'New York State earned income credit against base tax', amount: Math.min(line43, line42) }] : [])],
    otherStateCredit: 0,
    otherTaxes: [
      ...(line51 ? [{ code: 'NYC_PART_YEAR_TAX', label: 'Part-year New York City resident tax', amount: line52a }] : []),
      ...(shared.mctmt.total ? [{ code: 'NY_MCTMT', label: 'Metropolitan commuter transportation mobility tax', amount: shared.mctmt.total }] : []),
      ...(line54 ? [{ code: 'YONKERS_SURCHARGE', label: 'Part-year Yonkers resident income tax surcharge', amount: line54 }] : []),
      ...(line56 ? [{ code: 'NY_USE_TAX', label: 'Sales or use tax', amount: line56 }] : []),
    ],
    totalTax: line58,
    refundableCredits: [
      ...(line60 ? [{ code: 'NYC_SCHOOL_FIXED', label: 'Part-year NYC school tax credit (fixed amount)', amount: line60 }] : []),
      ...(line60a ? [{ code: 'NYC_SCHOOL_RATE', label: 'NYC school tax credit (rate reduction amount)', amount: line60a }] : []),
      ...(line60b ? [{ code: 'NYC_ELIMINATION', label: 'New York City income tax elimination credit', amount: line60b }] : []),
      ...(refundableEic ? [{ code: 'NY_EIC_PART_YEAR', label: 'Part-year resident refundable New York State EIC', amount: refundableEic }] : []),
      ...(city.eic ? [{ code: 'NYC_EIC', label: 'Part-year resident New York City EIC', amount: city.eic }] : []),
    ],
    localPayments: line63 + line64,
    checks,
    notes: [`New York State tax by the ${taxed.method}, allocated by the income percentage ${line45}.`, ...(partYearEic ? ['The refundable part-year EIC uses your New York-column federal AGI as the resident-period amount (Form IT-215, line 23).'] : [])],
  };
}

function compute(ctx, filing, reader) {
  const rates = reader.read('tax-rates');
  const credits = reader.read('credits');
  const mods = reader.read('modifications');
  const deductions = reader.read('deductions');
  if (!rates || !credits || !mods || !deductions) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no New York figures for ${ctx.taxYear}.` };
  return filing.residency === 'full-year' ? computeResident(ctx, filing, reader, rates, credits, mods) : computeNonresident(ctx, filing, reader, rates, credits, mods);
}

export const STATE = Object.freeze({
  code: 'NY',
  name: 'New York',
  built: true,
  forms: Object.freeze({ resident: 'IT-201', partYear: 'IT-203', nonresident: 'IT-203' }),
  questions: QUESTIONS,
  notCovered: NOT_COVERED,
  compute,
});
