import { whole, positive, rateOf, ratio, check, lineTable, sum, homeStateCreditCheck } from '../state-kit.mjs';

export const IN_COUNTY_NAMES = Object.freeze(['Adams', 'Allen', 'Bartholomew', 'Benton', 'Blackford', 'Boone', 'Brown', 'Carroll', 'Cass', 'Clark', 'Clay', 'Clinton', 'Crawford', 'Daviess', 'Dearborn', 'Decatur', 'DeKalb', 'Delaware', 'Dubois', 'Elkhart', 'Fayette', 'Floyd', 'Fountain', 'Franklin', 'Fulton', 'Gibson', 'Grant', 'Greene', 'Hamilton', 'Hancock', 'Harrison', 'Hendricks', 'Henry', 'Howard', 'Huntington', 'Jackson', 'Jasper', 'Jay', 'Jefferson', 'Jennings', 'Johnson', 'Knox', 'Kosciusko', 'LaGrange', 'Lake', 'LaPorte', 'Lawrence', 'Madison', 'Marion', 'Marshall', 'Martin', 'Miami', 'Monroe', 'Montgomery', 'Morgan', 'Newton', 'Noble', 'Ohio', 'Orange', 'Owen', 'Parke', 'Perry', 'Pike', 'Porter', 'Posey', 'Pulaski', 'Putnam', 'Randolph', 'Ripley', 'Rush', 'St. Joseph', 'Scott', 'Shelby', 'Spencer', 'Starke', 'Steuben', 'Sullivan', 'Switzerland', 'Tippecanoe', 'Tipton', 'Union', 'Vanderburgh', 'Vermillion', 'Vigo', 'Wabash', 'Warren', 'Warrick', 'Washington', 'Wayne', 'Wells', 'White', 'Whitley']);
const OUTSIDE = 'Not in Indiana';
const COUNTY_OPTIONS = Object.freeze([...IN_COUNTY_NAMES, OUTSIDE]);

const byMfs = (table, status) => (status === 'mfs' ? table.mfs : table.other);
const has = (answers, key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== '';

function unemploymentDeduction(ctx, unemployment, deductions) {
  if (unemployment <= 0) return { line1: 0, deduction: 0 };
  const status = ctx.filingStatus;
  const base = status === 'mfj' ? deductions.unemploymentBase.mfj : status === 'mfs' ? (ctx.answers.livedWithSpouse === false ? deductions.unemploymentBase.mfsLivedApart : deductions.unemploymentBase.mfsLivedTogether) : deductions.unemploymentBase.other;
  const line4 = Math.max(0, ctx.income.agi - base);
  const line5 = Math.floor(line4 / 2);
  const line6 = Math.min(unemployment, line5);
  return { line1: unemployment, deduction: unemployment - line6 };
}

function exemptionsFor(ctx, answers, rule, line1Income) {
  const status = ctx.filingStatus;
  const line1 = status === 'mfj' ? 2 * rule.personal : rule.personal;
  const dependentFilers = ctx.filers.some((item) => item.canBeClaimedAsDependent);
  const deps = dependentFilers ? [] : ctx.dependents.filter((item) => !item.bornAfterYear);
  const line2 = deps.length * rule.dependent;
  const children = deps.filter((item) => ['son', 'daughter', 'stepchild', 'foster_child'].includes(item.relationship) && item.age !== null && (item.age < 19 || (item.age < 24 && item.student)));
  const firstYear = Math.min(children.length, positive(answers.firstYearAdditionalChildren));
  const line3 = children.length * rule.additionalDependentChild + firstYear * rule.firstYearAdditionalDependentChild;
  const senior = ctx.filers.filter((item) => item.age !== null && item.age >= 65);
  const blind = ctx.filers.filter((item) => item.blind);
  const line4 = (senior.length + blind.length) * rule.ageOrBlind;
  const limit = status === 'mfs' ? rule.lowIncomeSeniorLimit.mfs : rule.lowIncomeSeniorLimit.other;
  const line5 = line1Income < limit ? senior.length * rule.lowIncomeSenior : 0;
  const line6 = Math.min(positive(answers.adoptedChildren), children.length) * rule.adoptedChild;
  const line7 = line1 + line2 + line3 + line4 + line5 + line6;
  const own = (role) => {
    const filer = ctx.filers.find((item) => item.role === role);
    if (!filer) return 0;
    const old = filer.age !== null && filer.age >= 65;
    return rule.personal + (old ? rule.ageOrBlind : 0) + (filer.blind ? rule.ageOrBlind : 0) + (old && line5 ? rule.lowIncomeSenior : 0);
  };
  return { lines: { 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7 }, total: line7, children: children.length, own };
}

function elderlyCredit(ctx, rule, income, residentDays) {
  const seniors = ctx.filers.filter((item) => item.age !== null && item.age >= 65).length;
  if (!seniors || ctx.filingStatus === 'mfs' || income >= rule.elderlyIncomeLimit || residentDays < rule.elderlyMinimumResidentDays) return 0;
  const table = ctx.filingStatus === 'mfj' && seniors === 2 ? rule.elderlyBothOver65 : rule.elderlyOneOver65;
  const row = table.find((item) => income < item.under);
  return row ? row.credit : 0;
}

function countyRate(rates, name) {
  if (!name || name === OUTSIDE) return 0;
  return Number(rates[name] || 0);
}

const countyTax = (amount, ppm) => Math.max(0, Math.round((whole(amount) * ppm) / 1000000));

function scheduleTwo(ctx, filing, answers, deductions, sourced, resident) {
  const status = ctx.filingStatus;
  const line1 = Math.min(positive(answers.rentPaid), byMfs(deductions.renterMaximum, status));
  const line2 = Math.min(positive(answers.propertyTaxPaid), byMfs(deductions.propertyTaxMaximum, status));
  const line3 = resident ? whole(ctx.income.stateRefundTaxable) : whole(sourced.stateRefundTaxable);
  const line4 = resident ? whole(ctx.income.usObligationInterest) : whole(sourced.usObligationInterest);
  const line5 = resident ? whole(ctx.income.socialSecurityTaxable) : whole(sourced.socialSecurityTaxable);
  const line6 = 0;
  const line7 = positive(answers.activeMilitaryPay);
  const line8 = Math.min(positive(answers.privateSchoolChildren), ctx.dependents.length) * deductions.privateSchoolPerChild;
  const line9 = 0;
  const unemployment = unemploymentDeduction(ctx, resident ? whole(ctx.income.unemployment) : whole(sourced.unemployment), deductions);
  const line10 = unemployment.deduction;
  const scheduleOneA = ctx.federal.schedules?.['1-A'] || {};
  const other = [];
  for (const key of deductions.federalScheduleOneADeductions || []) {
    const amount = whole(scheduleOneA[key]);
    if (amount > 0) other.push({ code: key === '13' ? 'tips' : key === '21' ? 'overtime' : 'car loan interest', amount: resident ? amount : Math.round(amount * filing.share) });
  }
  if (positive(answers.militaryRetirement)) other.push({ code: '632', amount: positive(answers.militaryRetirement) });
  if (positive(answers.nationalGuardPay)) other.push({ code: '621', amount: positive(answers.nationalGuardPay) });
  const line11 = sum(other, (item) => item.amount);
  const line12 = line1 + line2 + line3 + line4 + line5 + line6 + line7 + line8 + line9 + line10 + line11;
  const lines = { 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 12: line12 };
  other.forEach((item, index) => { lines[`11${String.fromCharCode(97 + index)}`] = item.amount; });
  lines[11] = line11;
  return { lines, total: line12 };
}

function otherStateCredit(filing, credits, line8) {
  let total = 0;
  for (const other of filing.otherStates) {
    if (credits.reverseCreditStates.includes(other.state)) continue;
    total += Math.min(positive(other.tax), rateOf(other.income, filing.rateBasisPoints), line8);
  }
  if (!filing.otherStates.length && positive(filing.answers.otherStateTax)) total = Math.min(positive(filing.answers.otherStateTax), rateOf(positive(filing.answers.otherStateIncome), filing.rateBasisPoints));
  return Math.min(total, line8);
}

function compute(ctx, filing, reader) {
  const tax = reader.read('income-tax');
  const exemptionRule = reader.read('exemptions');
  const deductions = reader.read('deductions');
  const credits = reader.read('credits');
  const county = reader.read('county-tax');
  if (!tax || !exemptionRule || !deductions || !credits || !county) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no Indiana figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const resident = filing.residency === 'full-year';
  const checks = [];
  const notes = [];
  const sourced = filing.sourced;
  const muniInterest = has(answers, 'outOfStateMuniInterest') ? positive(answers.outOfStateMuniInterest) : whole(income.taxExemptInterest);
  if (!has(answers, 'outOfStateMuniInterest') && income.taxExemptInterest > 0 && filing.residency !== 'nonresident') checks.push(check('warning', 'IN_MUNI_INTEREST_ASSUMED', 'All of your federally tax-exempt interest is added back as interest on bonds of other states bought after 2011; Indiana bonds and bonds bought before 2012 are not added back.', 'Answer how much tax-exempt interest came from non-Indiana bonds bought after 2011.'));
  let line1;
  let line21D = 1;
  let scheduleA = null;
  if (resident) line1 = income.agi;
  else {
    const line21A = income.totalIncome;
    const line21B = filing.sourcedAgi + whole(sourced.adjustments);
    line21D = line21B <= 0 ? 0 : line21A <= 0 ? 1 : ratio(line21B, line21A, { places: 3 });
    line1 = filing.sourcedAgi;
    scheduleA = lineTable({ '21A': line21A, '21B': line21B, '21D': line21D, '35A': income.adjustments, '35B': whole(sourced.adjustments), '36A': income.agi, '36B': line1 });
  }
  const scheduleOne = { 3: filing.residency === 'nonresident' ? 0 : muniInterest };
  scheduleOne[7] = scheduleOne[3];
  const line2 = scheduleOne[7];
  const line3 = line1 + line2;
  const two = scheduleTwo(ctx, filing, answers, deductions, sourced, resident);
  const line4 = two.total;
  const line5 = line3 - line4;
  const exemptions = exemptionsFor(ctx, answers, exemptionRule, income.agi);
  const line6 = resident ? exemptions.total : Math.round(exemptions.total * line21D);
  const line7 = line5 - line6;
  const line8 = Math.max(0, rateOf(Math.max(0, line7), tax.rateBasisPoints));
  const rates = county.ratePpmByCounty;
  const homeCounty = answers.county || '';
  const spouseCounty = answers.spouseCounty || homeCounty;
  const workCounty = answers.workCounty || '';
  const livedInIndianaJan1 = resident || (filing.residency === 'part-year' && filing.from === `${ctx.taxYear}-01-01`);
  let ct = null;
  let line9 = 0;
  if (livedInIndianaJan1) {
    if (!homeCounty) checks.push(check('error', 'IN_COUNTY_REQUIRED', 'Indiana county tax depends on the county you lived in on January 1; without it the county tax is left out and the return would be wrong.', 'Answer the county you lived in on January 1.'));
    const rateA = countyRate(rates, homeCounty);
    const split = ctx.filingStatus === 'mfj' && spouseCounty !== homeCounty;
    let line1A = line7;
    let line1B = 0;
    if (split) {
      const spouseWages = sum(ctx.w2.filter((row) => row.owner === 'spouse'), (row) => row.wages);
      const ownWages = sum(ctx.w2.filter((row) => row.owner !== 'spouse'), (row) => row.wages);
      const shared = line5 - spouseWages - ownWages;
      const spouseBefore = spouseWages + Math.round(shared / 2);
      const ownBefore = line5 - spouseBefore;
      const ownExemptions = resident ? exemptions.own('taxpayer') : Math.round(exemptions.own('taxpayer') * line21D);
      const spouseExemptions = resident ? exemptions.own('spouse') : Math.round(exemptions.own('spouse') * line21D);
      const dependentsPart = line6 - ownExemptions - spouseExemptions;
      const rateB = countyRate(rates, spouseCounty);
      line1A = ownBefore - ownExemptions - (rateA >= rateB ? dependentsPart : 0);
      line1B = spouseBefore - spouseExemptions - (rateA >= rateB ? 0 : dependentsPart);
      checks.push(check('warning', 'IN_COUNTY_SPLIT', 'You and your spouse lived in different counties on January 1, so line 7 is split between you on Schedule CT-40: W-2 wages by whose W-2 it is, other income and deductions half each, and the dependent exemptions to the spouse with the higher county rate.', 'Check the split on Schedule CT-40 against each spouse\'s own income.'));
    }
    const line3A = countyTax(line1A, rateA);
    const line3B = split ? countyTax(line1B, countyRate(rates, spouseCounty)) : 0;
    line9 = line3A + line3B;
    ct = lineTable({ '1A': line1A, '1B': line1B, '2A': rateA / 1000000, '2B': split ? countyRate(rates, spouseCounty) / 1000000 : 0, '3A': line3A, '3B': line3B, 4: line9, 7: line9 });
  } else if (workCounty && workCounty !== OUTSIDE) {
    const rate = countyRate(rates, workCounty);
    const wages = whole(sourced.wages);
    const section2Line5 = Math.max(0, wages - line6);
    line9 = countyTax(section2Line5, rate);
    ct = lineTable({ 'S2-1A': wages, 'S2-2A': 0, 'S2-3A': wages, 'S2-4A': line6, 'S2-5A': section2Line5, 'S2-6A': rate / 1000000, 'S2-7A': line9, 'S2-8': line9 });
    checks.push(check('info', 'IN_NONRESIDENT_COUNTY', `County tax on Schedule CT-40PNR Section 2 is figured on your Indiana wages at the ${workCounty} County rate, where you worked on January 1.`, 'If only part of those wages came from that January 1 job, give your principal employment income instead.'));
  } else if (!workCounty && whole(sourced.wages) > 0) checks.push(check('warning', 'IN_WORK_COUNTY', 'Indiana taxes nonresidents who worked in an Indiana county on January 1 at that county\'s rate; MyCA has no work county, so no county tax is included.', 'Answer the county where you worked on January 1, or Not in Indiana.'));
  const line10 = positive(answers.useTax);
  const line11 = line8 + line9 + line10;
  const federalEic = whole(ctx.federal.lines['27']);
  const eicBox = rateOf(federalEic, credits.eicBasisPoints);
  const eic = resident ? eicBox : Math.round(eicBox * line21D);
  const elderly = elderlyCredit(ctx, credits, income.agi, filing.residentDays);
  const withheld = filing.payments.withheld;
  const countyWithheld = filing.payments.localWithheld;
  const estimated = filing.payments.estimated + filing.payments.extension;
  const schedule5 = lineTable({ 1: withheld, 2: countyWithheld, 3: 0, 4: estimated, 5: elderly, 6: eic, 7: 0, 13: withheld + countyWithheld + estimated + elderly + eic });
  const otherCredit = filing.residency === 'nonresident' ? 0 : otherStateCredit({ ...filing, rateBasisPoints: tax.rateBasisPoints }, credits, line8);
  if (otherCredit) checks.push(check('info', 'IN_OTHER_STATE_CREDIT', 'Credit for taxes paid to other states (Schedule 6 line 5) is the smallest of the other state\'s tax, the Indiana rate times the income taxed there, and the state tax on line 8. Enclose the other state\'s return.'));
  checks.push(...homeStateCreditCheck(filing, credits.reverseCreditStates.filter((code) => code !== 'DC')));
  if (filing.otherStates.some((other) => credits.reverseCreditStates.includes(other.state))) checks.push(check('info', 'IN_REVERSE_CREDIT', 'Arizona, Oregon and Washington D.C. give the credit on their own nonresident return, so Indiana gives none for tax paid there.'));
  const schedule6 = lineTable({ 1: 0, 5: otherCredit, 8: otherCredit });
  const line12 = schedule5[13];
  const line13 = otherCredit;
  const line14 = line12 + line13;
  const line15 = line11;
  const balance = line14 - line15;
  const lines = lineTable({ 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11, 12: line12, 13: line13, 14: line14, 15: line15, 16: Math.max(0, balance), 18: Math.max(0, balance), 21: Math.max(0, balance), 23: Math.max(0, -balance), 26: Math.max(0, -balance) });
  if (!has(answers, 'useTax')) checks.push(check('warning', 'IN_USE_TAX', 'Indiana asks for use tax on purchases with no Indiana sales tax (Schedule 4 line 1, 7% of the price).', 'Answer the use tax question (0 if none).'));
  if (ctx.filers.some((item) => item.canBeClaimedAsDependent) && ctx.dependents.length) checks.push(check('info', 'IN_DEPENDENT_FILER', 'Someone can claim you as a dependent, so no dependents are claimed on Schedule 3.'));
  if (ctx.taxYear === '2025' && (ctx.federal.schedules?.['1-A'] || null)) notes.push('Indiana follows the Internal Revenue Code as of January 1, 2023, so the 2025 federal tips, overtime, car loan interest and senior deductions (Schedule 1-A) are not Indiana deductions; they are below federal AGI and do not change line 1.');
  notes.push('County tax uses the county you lived in on January 1 (Schedule CT-40). Line 12 includes Indiana state and county tax withheld and estimated payments, as on the form.');
  return {
    form: resident ? 'IT-40' : 'IT-40PNR',
    lines,
    schedules: {
      1: lineTable(scheduleOne),
      [resident ? 2 : 'C']: lineTable(two.lines),
      [resident ? 3 : 'D']: lineTable({ ...exemptions.lines, ...(resident ? {} : { 8: line21D, 9: line6 }) }),
      [resident ? 5 : 'F']: schedule5,
      [resident ? 6 : 'G']: schedule6,
      ...(scheduleA ? { A: scheduleA } : {}),
      ...(ct ? { [resident ? 'CT-40' : 'CT-40PNR']: ct } : {}),
      ...(eic ? { 'IN-EIC': lineTable({ federalEic, A: eicBox, ...(resident ? {} : { proration: line21D }), 3: eic }) } : {}),
    },
    stateIncome: line7,
    taxableIncome: Math.max(0, line7),
    taxBeforeCredits: line8 + line9,
    nonrefundableCredits: otherCredit ? [{ code: 'IN_OTHER_STATE', label: 'Credit for taxes paid to other states', amount: otherCredit }] : [],
    otherStateCredit: otherCredit,
    otherTaxes: [...(line9 ? [{ code: 'IN_COUNTY_TAX', label: 'County income tax (Schedule CT-40)', amount: line9 }] : []), ...(line10 ? [{ code: 'IN_USE_TAX', label: 'Use tax', amount: line10 }] : [])],
    totalTax: Math.max(0, line11 - line13),
    refundableCredits: [...(eic ? [{ code: 'IN_EIC', label: 'Indiana earned income credit', amount: eic }] : []), ...(elderly ? [{ code: 'IN_ELDERLY', label: 'Unified tax credit for the elderly', amount: elderly }] : [])],
    localPayments: countyWithheld,
    checks,
    notes,
  };
}

const COMMON_LABELS = Object.freeze({
  3: 'Income plus Indiana add-backs',
  5: 'Income after Indiana deductions',
  7: 'Indiana adjusted gross income',
  8: 'State adjusted gross income tax',
  11: 'Indiana taxes',
  14: 'Indiana credits',
  15: 'Indiana taxes',
  16: 'Credits more than taxes',
  18: 'Overpayment',
  21: 'Your refund',
  23: 'Taxes more than credits',
  26: 'Amount you owe',
});

const RESIDENT_LABELS = Object.freeze({
  ...COMMON_LABELS,
  1: 'Federal adjusted gross income',
  2: 'Indiana add-backs (Schedule 1)',
  4: 'Indiana deductions (Schedule 2)',
  6: 'Exemptions (Schedule 3)',
  9: 'County tax (Schedule CT-40)',
  10: 'Other taxes (Schedule 4)',
  12: 'Credits (Schedule 5)',
  13: 'Offset credits (Schedule 6)',
});

const NONRESIDENT_LABELS = Object.freeze({
  ...COMMON_LABELS,
  1: 'Indiana income from Schedule A',
  2: 'Indiana add-backs (Schedule B)',
  4: 'Indiana deductions (Schedule C)',
  6: 'Exemptions (Schedule D)',
  9: 'County tax (Schedule CT-40PNR)',
  10: 'Other taxes (Schedule E)',
  12: 'Credits (Schedule F)',
  13: 'Offset credits (Schedule G)',
});

const labels = (taxYear, residency) => (residency === 'full-year' ? RESIDENT_LABELS : NONRESIDENT_LABELS);

export const STATE = Object.freeze({
  code: 'IN',
  name: 'Indiana',
  built: true,
  forms: Object.freeze({ resident: 'IT-40', partYear: 'IT-40PNR', nonresident: 'IT-40PNR' }),
  questions: Object.freeze([
    Object.freeze({ id: 'county', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'choice', options: COUNTY_OPTIONS, text: 'Indiana county where you lived on January 1', help: 'Sets your county income tax rate on Schedule CT-40. A move after January 1 does not change it until next year.' }),
    Object.freeze({ id: 'spouseCounty', when: Object.freeze({ residency: ['full-year', 'part-year'], filingStatus: ['mfj'] }), kind: 'choice', options: COUNTY_OPTIONS, text: 'Indiana county where your spouse lived on January 1, if different from yours', help: 'Only for a joint return when you lived in different counties on January 1.' }),
    Object.freeze({ id: 'workCounty', when: Object.freeze({ residency: ['part-year', 'nonresident'] }), kind: 'choice', options: COUNTY_OPTIONS, text: 'Indiana county where you worked on January 1, if you did not live in Indiana on January 1', help: 'A nonresident who worked in an Indiana county on January 1 pays that county\'s tax on Schedule CT-40PNR.' }),
    Object.freeze({ id: 'rentPaid', kind: 'amount', text: 'Rent you paid on your main home in Indiana', help: 'Renter\'s deduction on Schedule 2 line 1, up to $3,000 ($1,500 married filing separately). Only rent on a place subject to Indiana property tax.' }),
    Object.freeze({ id: 'propertyTaxPaid', kind: 'amount', text: 'Indiana property tax you paid on your main home', help: 'Homeowner\'s residential property tax deduction on Schedule 2 line 2, up to $2,500 ($1,250 married filing separately). Leave out any part deducted on Schedule C, E or F.' }),
    Object.freeze({ id: 'outOfStateMuniInterest', when: Object.freeze({ residency: ['full-year', 'part-year'], has: ['taxExemptInterest'] }), kind: 'amount', text: 'Tax-exempt interest from bonds of other states bought after 2011', help: 'Added back on Schedule 1 line 3. Indiana bonds and bonds bought before 2012 are not added back. Left blank, all federally tax-exempt interest is added back.' }),
    Object.freeze({ id: 'privateSchoolChildren', when: Object.freeze({ has: ['dependents'] }), kind: 'count', text: 'Number of dependent children at an Indiana private school or homeschool you paid education costs for', help: '$1,000 each on Schedule 2 line 8.' }),
    Object.freeze({ id: 'firstYearAdditionalChildren', when: Object.freeze({ has: ['dependents'] }), kind: 'count', text: 'Number of dependent children claimed for the additional child exemption for the first time this year', help: 'Each gets $3,000 instead of $1,500 for that one year (Schedule IN-DEP box F).' }),
    Object.freeze({ id: 'adoptedChildren', when: Object.freeze({ has: ['dependents'] }), kind: 'count', text: 'Number of adopted dependent children who qualify for the additional adopted child exemption', help: '$3,000 each on Schedule 3 line 6 (Schedule IN-DEP-A).' }),
    Object.freeze({ id: 'activeMilitaryPay', kind: 'amount', text: 'Active duty military pay included in federal AGI', help: 'Schedule 2 line 7.' }),
    Object.freeze({ id: 'nationalGuardPay', kind: 'amount', text: 'National Guard or reserve component military pay included in federal AGI', help: 'Deduction code 621.' }),
    Object.freeze({ id: 'militaryRetirement', when: Object.freeze({ has: ['retirementIncome'] }), kind: 'amount', text: 'Military retirement or survivor\'s benefits included in federal AGI', help: 'Deduction code 632.' }),
    Object.freeze({ id: 'useTax', kind: 'amount', text: 'Indiana use tax owed on purchases with no Indiana sales tax', help: 'Schedule 4 line 1: 7% of the price. Enter 0 if none.' }),
    Object.freeze({ id: 'otherStateTax', when: Object.freeze({ residency: ['full-year', 'part-year'] }), kind: 'amount', text: 'Income tax you paid to another state whose return MyCA does not prepare', help: 'The tax on that state\'s return, not the amount withheld. Used only when no other state return is worked out here.' }),
    Object.freeze({ id: 'otherStateIncome', when: Object.freeze({ residency: ['full-year', 'part-year'], answer: { id: 'otherStateTax' } }), kind: 'amount', text: 'Income taxed by that other state and also by Indiana', help: 'For the Schedule 6 line 5 credit.' }),
  ]),
  labels,
  notCovered: Object.freeze([
    'Schedule 1 add-backs other than out-of-state bond interest (tax add-back, net operating loss, bonus depreciation, Section 179 and other coded add-backs)',
    'Schedule 2 coded deductions other than military retirement, National Guard pay and, for 2026, the federal tips, overtime and car loan interest deductions; the Indiana net operating loss and railroad retirement benefits',
    'Schedule 5 credits other than withholding, estimated payments, the earned income credit and the unified tax credit for the elderly (Lake County credit, pass through entity tax credit, adoption credit and business credits)',
    'Schedule 6 offset credits other than the credit for taxes paid to other states (local taxes paid outside Indiana, college credit, Indiana 529 credit and the Schedule IN-OCC credits)',
    'Household employment tax, recapture of credits and Schedule IT-2210 underpayment penalty',
    'IT-40PNR Schedule IT-40PNRA apportioned business income and the nonresident military worksheet',
    'Form IT-40RNR for residents of reciprocal states with only Indiana wages (shown as reciprocal instead)',
    'The unified tax credit for the elderly on a married filing separately return',
  ]),
  compute,
});
