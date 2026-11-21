import { whole, positive, ratio, check, lineTable, byStatus, yesNo } from '../state-kit.mjs';

const OWNERS = ['taxpayer', 'spouse'];

function scheduleTax(amount, bands) {
  const cents = Math.round(Math.max(0, Number(amount) || 0) * 100);
  let total = 0;
  bands.forEach((band, index) => {
    const upTo = index + 1 < bands.length ? bands[index + 1].overCents : Infinity;
    total += Math.max(0, Math.min(cents, upTo) - band.overCents) * band.rateBp;
  });
  return Math.floor((total + 500000) / 1000000);
}

function tableTax(amount, table, bands) {
  const rows = [...table.rows].reverse();
  const segment = rows.find((row) => amount >= row.fromDollars) || table.rows[0];
  const low = segment.fromDollars + Math.floor((amount - segment.fromDollars) / segment.width) * segment.width;
  return scheduleTax(low + segment.width / 2, bands);
}

const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? positive(form.fields?.grossDistribution) : positive(form.fields?.taxableAmount));

function split(total, spouseShare) {
  const spouse = Math.round(whole(total) * spouseShare);
  return { taxpayer: whole(total) - spouse, spouse };
}

function personIncome(ctx, spouseShare) {
  const joint = ctx.filingStatus === 'mfj';
  const income = ctx.income;
  const own = { taxpayer: { wages: 0, retirement: 0, ss: 0 }, spouse: { wages: 0, retirement: 0, ss: 0 } };
  if (!joint) return { taxpayer: { wages: income.wages, retirement: income.iraTaxable + income.pensionTaxable, ss: income.socialSecurityTaxable, total: income.agi }, spouse: { wages: 0, retirement: 0, ss: 0, total: 0 } };
  for (const row of ctx.w2) own[row.owner].wages += row.wages;
  let retirementForms = 0;
  let ssForms = 0;
  for (const form of ctx.forms) {
    if (form.kind === '1099-R') {
      own[ownerOf(form)].retirement += taxableOf(form);
      retirementForms += taxableOf(form);
    }
    if (form.kind === 'SSA-1099') {
      own[ownerOf(form)].ss += positive(form.fields?.netBenefits);
      ssForms += positive(form.fields?.netBenefits);
    }
  }
  const retirementTotal = income.iraTaxable + income.pensionTaxable;
  const spouseRetirement = retirementForms ? Math.round((retirementTotal * own.spouse.retirement) / retirementForms) : 0;
  const spouseSs = ssForms ? Math.round((income.socialSecurityTaxable * own.spouse.ss) / ssForms) : 0;
  const spouseWages = Math.min(own.spouse.wages, income.wages);
  const rest = income.agi - income.wages - retirementTotal - income.socialSecurityTaxable;
  const restSplit = split(rest, spouseShare);
  const spouse = { wages: spouseWages, retirement: spouseRetirement, ss: spouseSs };
  const taxpayer = { wages: income.wages - spouseWages, retirement: retirementTotal - spouseRetirement, ss: income.socialSecurityTaxable - spouseSs };
  taxpayer.total = taxpayer.wages + taxpayer.retirement + taxpayer.ss + restSplit.taxpayer;
  spouse.total = spouse.wages + spouse.retirement + spouse.ss + restSplit.spouse;
  return { taxpayer, spouse };
}

function scheduleM(ctx, filing, deductions, checks) {
  const answers = filing.answers;
  const income = ctx.income;
  const joint = ctx.filingStatus === 'mfj';
  const spouseShare = joint ? Math.min(100, positive(answers.spouseJointIncomePercent ?? 50)) / 100 : 0;
  if (joint && answers.spouseJointIncomePercent === undefined && income.agi - income.wages - income.iraTaxable - income.pensionTaxable - income.socialSecurityTaxable !== 0) checks.push(check('info', 'WV_JOINT_INCOME_SPLIT', 'Schedule M has a column for each spouse. Interest, dividends, gains and other jointly held income are split 50/50 between you; the senior citizen modification on line 47 depends on this split.', 'Give the spouse\'s ownership percentage of jointly held income if it is not 50%.'));
  const people = personIncome(ctx, spouseShare);
  const usInterest = split(income.usObligationInterest, spouseShare);
  const refund = split(filing.residency === 'nonresident' ? 0 : income.stateRefundTaxable, spouseShare);
  const ssBasis = byStatus(deductions.socialSecurity.agiLimit, ctx.filingStatus) >= income.agi ? deductions.socialSecurity.atOrBelowBasisPoints : deductions.socialSecurity.aboveBasisPoints;
  const columns = {};
  const pick = (role, id) => positive(answers[role === 'spouse' ? `spouse${id[0].toUpperCase()}${id.slice(1)}` : id]);
  for (const role of OWNERS) {
    if (role === 'spouse' && !joint) continue;
    const person = people[role];
    const l30 = pick(role, 'federalLawEnforcementRetirement');
    const l31 = pick(role, 'wvPoliceFireRetirement');
    const l32 = pick(role, 'militaryRetirement');
    const l33 = Math.min(deductions.publicRetirementLimit, pick(role, 'publicRetirement'));
    const retirementClaimed = l30 + l31 + l32 + l33;
    if (retirementClaimed > person.retirement) checks.push(check('warning', 'WV_RETIREMENT_OVER_1099R', `The retirement modifications entered for ${role === 'spouse' ? 'your spouse' : 'you'} on Schedule M lines 30 to 33 are more than the taxable pensions on that person's 1099-R forms.`, 'Check the retirement amounts; only taxable retirement income included in federal AGI can be subtracted.'));
    const l34 = Math.round((person.ss * ssBasis) / 10000);
    const l29 = usInterest[role];
    const l38 = refund[role];
    const l39 = role === 'taxpayer' ? positive(answers.collegeSavingsContributions) : 0;
    const l40 = pick(role, 'railroadRetirement');
    const filer = ctx.filers.find((item) => item.role === role);
    const disabled = yesNo(answers[role === 'spouse' ? 'spouseDisabled' : 'disabled']);
    const senior = filer && ((filer.age !== null && filer.age >= deductions.seniorAge) || disabled);
    const boxC = senior ? Math.min(deductions.seniorModification, Math.max(0, person.total - l38 - l39 - l40)) : 0;
    const boxD = l29 + l30 + l31 + l32 + l33 + l34;
    const l47 = senior ? Math.max(0, boxC - boxD) : 0;
    const l49 = l29 + l30 + l31 + l32 + l33 + l34 + l38 + l39 + l40 + l47;
    columns[role === 'spouse' ? 'B' : 'A'] = lineTable({ 29: l29, 30: l30, 31: l31, 32: l32, 33: l33, 34: l34, 38: l38, 39: l39, 40: l40, ...(senior ? { '47c': boxC, '47d': boxD } : {}), 47: l47, 49: l49 });
  }
  const l50 = whole(columns.A?.['49']) + whole(columns.B?.['49']);
  const l52 = Math.max(0, income.taxExemptInterest - positive(answers.wvMunicipalInterest));
  if (income.taxExemptInterest > 0 && answers.wvMunicipalInterest === undefined) checks.push(check('warning', 'WV_MUNICIPAL_INTEREST', 'Tax-exempt interest from bonds of other states is added back on Schedule M line 52; West Virginia bond interest is not. All of your tax-exempt interest is added back until you say how much is from West Virginia bonds.', 'Answer the West Virginia bond interest question (0 if none).'));
  const l59 = l52;
  return { columns, l50, l52, l59 };
}

function familyCredit(ctx, credits, magi, size, tax) {
  const table = ctx.filingStatus === 'mfs' ? credits.familyCredit.mfs : credits.familyCredit.joint;
  if (size < 1) return { percent: 0, credit: 0 };
  const full = table.fullUpTo[Math.min(size, table.fullUpTo.length) - 1];
  const steps = magi <= full ? 0 : Math.ceil((magi - full) / table.bandWidth);
  const percent = Math.max(0, 100 - (steps * credits.familyCredit.stepBasisPoints) / 100);
  return { percent, credit: Math.round((tax * percent) / 100) };
}

function compute(ctx, filing, reader) {
  const rule = reader.read('income-tax');
  const table = reader.read('tax-table');
  const deductions = reader.read('deductions');
  const credits = reader.read('credits');
  if (!rule || !table || !deductions || !credits) return { ok: false, error: 'STATE_RULE_MISSING', why: `MyCA has no West Virginia figures for ${ctx.taxYear}.` };
  const answers = filing.answers;
  const income = ctx.income;
  const status = ctx.filingStatus;
  const resident = filing.residency === 'full-year';
  const partYear = filing.residency === 'part-year';
  const checks = [];
  const notes = [];
  const bands = status === 'mfs' ? rule.rateSchedule.mfs : rule.rateSchedule.other;

  const m = scheduleM(ctx, filing, deductions, checks);
  const line1 = income.agi;
  const line2 = m.l59;
  const line3 = m.l50;
  const line4 = line1 + line2 - line3;
  const earned = income.wages + Math.max(0, income.businessIncome);
  const lowLimit = byStatus(deductions.lowIncomeAgiLimit, status);
  const line5 = line1 <= lowLimit ? Math.max(0, Math.min(line1, earned, byStatus(deductions.lowIncomeExclusion, status))) : 0;
  const boxA = ctx.filers.some((item) => item.role === 'taxpayer' && !item.canBeClaimedAsDependent) ? 1 : 0;
  const spouseFiler = ctx.filers.find((item) => item.role === 'spouse');
  const boxB = status === 'mfj' && spouseFiler && !spouseFiler.canBeClaimedAsDependent ? 1 : 0;
  const boxC = boxA ? ctx.dependents.length : 0;
  const boxD = yesNo(answers.survivingSpouseExemption) ? 1 : 0;
  const boxE = boxA + boxB + boxC + boxD;
  const line6 = boxE ? boxE * deductions.exemption : deductions.zeroExemptionAllowance;
  const line7 = Math.max(0, line4 - line5 - line6);

  let line8;
  let method;
  let scheduleA = null;
  let stateIncome = line4;
  if (resident) {
    if (status !== 'mfs' && line7 < rule.tableBelow) {
      line8 = tableTax(line7, table, bands);
      method = 'Tax Table';
    } else {
      line8 = scheduleTax(line7, bands);
      method = status === 'mfs' ? 'Rate Schedule II' : 'Rate Schedule I';
    }
  } else {
    const sourced = filing.sourced;
    const column = (source, isNonresidentColumn) => {
      const value = (key) => whole(source[key]);
      const out = { 1: value('wages'), 2: value('taxableInterest'), 3: value('ordinaryDividends'), 4: isNonresidentColumn ? 0 : value('iraTaxable') + value('pensionTaxable'), 5: isNonresidentColumn ? 0 : value('socialSecurityTaxable'), 6: isNonresidentColumn ? 0 : value('stateRefundTaxable'), 7: 0, 8: value('businessIncome'), 9: value('capitalGain'), 10: 0, 11: 0, 12: value('unemployment'), 13: value('otherIncome') };
      out[14] = Object.values(out).reduce((total, amount) => total + amount, 0);
      out[22] = value('adjustments');
      out[23] = out[14] - out[22];
      return out;
    };
    const colA = column(income, false);
    const items = income.adjustmentItems;
    Object.assign(colA, { 15: items.educator, 16: items.ira, 17: items.seTaxDeduction, 18: items.seRetirement, 19: items.seHealth, 20: items.earlyWithdrawal });
    colA[21] = colA[22] - colA[15] - colA[16] - colA[17] - colA[18] - colA[19] - colA[20];
    const colB = partYear ? column(sourced, false) : null;
    const colC = partYear ? null : column(sourced, true);
    const l24 = whole(colB?.[23]) + whole(colC?.[23]);
    const l25 = partYear ? Math.round(line2 * filing.share) : 0;
    const l26 = l24 + l25;
    const p1 = scheduleTax(line7, bands);
    const fraction = line1 > 0 ? ratio(l26, line1, { places: 4, floor: 0, cap: Number.MAX_SAFE_INTEGER }) : l26 > 0 ? 1 : 0;
    if (line1 <= 0 && l26 > 0) checks.push(check('warning', 'WV_SCHEDULE_A_NO_FEDERAL_AGI', 'Your federal AGI is zero or less while you have West Virginia income, so Schedule A, Part I cannot divide by federal AGI. MyCA used 100%.', 'Have your CPA check the nonresident tax calculation.'));
    if (fraction > 1) checks.push(check('info', 'WV_SCHEDULE_A_OVER_100', 'Your West Virginia income is more than your federal AGI, so the Schedule A ratio is above 1; the form does not limit it.'));
    const p4 = Math.round(p1 * fraction);
    line8 = p4;
    method = 'Nonresident/Part-year resident calculation schedule';
    if (l25) checks.push(check('warning', 'WV_PART_YEAR_ADDITIONS_PRORATED', 'Schedule M additions were split by the days you lived in West Virginia for Schedule A line 25.', 'Give the additions received while a resident if they differ.'));
    scheduleA = { A: lineTable(colA), ...(colB ? { B: lineTable(colB) } : {}), ...(colC ? { C: lineTable(colC) } : {}), lines: lineTable({ 24: l24, 25: l25, 26: l26 }), partI: lineTable({ 1: p1, 2: l26, 3: line1, 4: fraction, tax: p4 }) };
    stateIncome = l26;
  }

  const amt = whole(ctx.federal.schedules?.[2]?.['2']);
  const familySize = boxA + boxB + boxC;
  const ftcMagi = line1 + line2 + Math.max(0, income.taxExemptInterest - m.l52);
  let family = { percent: 0, credit: 0 };
  if (amt > 0) checks.push(check('info', 'WV_FAMILY_CREDIT_AMT', 'You pay federal alternative minimum tax, so the West Virginia Family Tax Credit is not allowed.'));
  else family = familyCredit(ctx, credits, ftcMagi, familySize, line8);
  const recap2 = family.credit;
  const federalCare = whole(ctx.federal.schedules?.[3]?.['2']);
  const recap18 = Math.round((federalCare * credits.childCareBasisPoints) / 10000);
  const otherRecap = recap2 + recap18;

  let recap1 = 0;
  const scheduleE = [];
  if (resident && filing.otherStates.length) {
    let room = Math.max(0, line8 - otherRecap);
    for (const other of filing.otherStates) {
      const e1 = positive(other.tax);
      const e2 = line8;
      const e3 = Math.max(0, Math.min(positive(other.income), Math.max(0, line4)));
      const e4 = line4;
      const e5 = e4 > 0 ? Math.round((e2 * e3) / e4) : 0;
      const e6 = Math.max(0, line7 - e3);
      const e7 = scheduleTax(e6, bands);
      const e8 = Math.max(0, e2 - e7);
      const e9 = room;
      const e10 = Math.max(0, Math.min(e1, e2, e5, e8, e9));
      room -= e10;
      recap1 += e10;
      scheduleE.push({ state: other.state, lines: lineTable({ 1: e1, 2: e2, 3: e3, 4: e4, 5: e5, 6: e6, 7: e7, 8: e8, 9: e9, 10: e10 }) });
    }
    checks.push(check('info', 'WV_SCHEDULE_E', 'Keep a copy of the other state\'s return; West Virginia may ask for it to support Schedule E. No credit is allowed for wages taxed by Kentucky, Maryland, Ohio, Pennsylvania or Virginia under the reciprocal agreements.'));
  }
  const recap27 = recap1 + recap2 + recap18;
  const line9 = recap27;
  const line10 = Math.max(0, line8 - line9);
  const line13 = positive(answers.useTax);
  if (answers.useTax === undefined) checks.push(check('info', 'WV_USE_TAX', 'West Virginia asks for use tax on out-of-state purchases on line 13, or a check in the box that none is due.', 'Answer the use tax question (0 if none).'));
  const line14 = line10 + line13;

  const line18 = filing.residency === 'nonresident' ? 0 : positive(answers.seniorCitizenTaxCredit);
  let heptc = null;
  if (filing.residency !== 'nonresident' && positive(answers.homesteadPropertyTax) > 0) {
    const size = Math.max(1, whole(answers.householdSize) || ctx.filers.length + ctx.dependents.length);
    const limits = credits.homesteadExcess.agiLimit;
    const limit = size <= limits.length ? limits[size - 1] : limits[limits.length - 1] + (size - limits.length) * credits.homesteadExcess.perAdditionalPerson;
    const h1 = positive(answers.homesteadPropertyTax);
    const h2 = line18;
    const h3 = Math.max(0, h1 - h2);
    const h4 = line1;
    const h4a = line2;
    const h4b = income.taxExemptInterest;
    const h4c = positive(answers.workersCompensation);
    const h4d = Math.max(0, income.socialSecurityBenefits - income.socialSecurityTaxable);
    const h4e = positive(answers.otherHouseholdIncome);
    const h5 = h4a + h4b + h4c + h4d + h4e;
    const h6 = h4 + h5;
    const h7 = Math.round((h6 * credits.homesteadExcess.incomeBasisPoints) / 10000);
    const eligible = line1 <= limit;
    const h9 = eligible && h3 > h7 ? Math.min(credits.homesteadExcess.maximum, h3 - h7) : 0;
    if (!eligible) checks.push(check('info', 'WV_HEPTC_INCOME', `Your federal AGI is above the Homestead Excess Property Tax Credit limit of $${limit.toLocaleString('en-US')} for a household of ${size}.`));
    heptc = lineTable({ limit, 1: h1, 2: h2, 3: h3, 4: h4, '4a': h4a, '4b': h4b, '4c': h4c, '4d': h4d, '4e': h4e, 5: h5, 6: h6, 7: h7, 9: h9 });
  }
  const line19 = heptc ? heptc['9'] : 0;

  if (filing.residency !== 'full-year' && ctx.filers.length > 1) checks.push(check('info', 'WV_JOINT_PART_YEAR', 'A joint West Virginia return may not be filed if one spouse changed residence during the year while the other did not.'));
  if (ctx.filingStatus === 'mfj' && filing.residency === 'nonresident') notes.push('If you live in Kentucky, Maryland, Ohio, Pennsylvania or Virginia and your only West Virginia income was wages, file as a special nonresident on Schedule A, Part II instead to get back the tax withheld.');
  notes.push(resident ? `Line 8 uses the ${method}.` : 'Line 8 is the Rate Schedule tax on line 7 multiplied by the Schedule A ratio of West Virginia income to federal AGI, rounded to four decimal places.');
  if (recap2) notes.push(`The Family Tax Credit is ${family.percent}% of the line 8 tax for a family of ${familySize} with modified federal AGI of $${ftcMagi.toLocaleString('en-US')}.`);

  const lines = lineTable({ '6a': boxA, '6b': boxB, '6c': boxC, '6d': boxD, '6e': boxE, 1: line1, 2: line2, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 13: line13, 14: line14, 15: filing.payments.withheld, 16: filing.payments.estimated + filing.payments.extension, 18: line18, 19: line19 });
  return {
    form: resident ? 'IT-140' : 'IT-140 with Schedule A',
    lines,
    schedules: {
      M: { ...m.columns, 50: m.l50, 52: m.l52, 59: m.l59 },
      ...(scheduleA ? { A: scheduleA } : {}),
      ...(scheduleE.length ? { E: scheduleE } : {}),
      RECAP: lineTable({ 1: recap1, 2: recap2, 18: recap18, 27: recap27 }),
      ...(recap2 || familySize ? { 'FTC-1': lineTable({ 1: line1, 2: line2, 3: Math.max(0, income.taxExemptInterest - m.l52), 4: ftcMagi, 5: familySize, 6: family.percent, 7: line8, 8: recap2 }) } : {}),
      ...(heptc ? { 'HEPTC-1': heptc } : {}),
    },
    stateIncome,
    taxableIncome: line7,
    taxBeforeCredits: line8,
    nonrefundableCredits: [...(recap1 ? [{ code: 'WV_SCHEDULE_E', label: 'Credit for income tax paid to another state', amount: recap1 }] : []), ...(recap2 ? [{ code: 'WV_FAMILY_TAX_CREDIT', label: 'Family Tax Credit', amount: recap2 }] : []), ...(recap18 ? [{ code: 'WV_CHILD_CARE', label: 'Child and Dependent Care Expenses Credit', amount: recap18 }] : [])],
    otherStateCredit: recap1,
    otherTaxes: line13 ? [{ code: 'WV_USE_TAX', label: 'West Virginia use tax', amount: line13 }] : [],
    totalTax: line14,
    refundableCredits: [...(line18 ? [{ code: 'WV_SCTC', label: 'Senior Citizen Tax Credit', amount: line18 }] : []), ...(line19 ? [{ code: 'WV_HEPTC', label: 'Homestead Excess Property Tax Credit', amount: line19 }] : [])],
    checks,
    notes,
  };
}

const amount = (id, text, help) => Object.freeze({ id, kind: 'amount', text, help });

export const STATE = Object.freeze({
  code: 'WV',
  name: 'West Virginia',
  built: true,
  forms: Object.freeze({ resident: 'IT-140', partYear: 'IT-140 with Schedule A', nonresident: 'IT-140 with Schedule A' }),
  questions: Object.freeze([
    amount('wvMunicipalInterest', 'Tax-exempt interest from West Virginia state or local bonds (including West Virginia bond fund dividends)', 'Tax-exempt interest from other states\' bonds is added back on Schedule M line 52; West Virginia bond interest is not. Enter 0 if none.'),
    amount('publicRetirement', 'Your taxable retirement from the WV Teachers\' or Public Employees\' Retirement System or a federal retirement system (not law enforcement or military)', 'Schedule M line 33; up to $2,000 is subtracted.'),
    amount('spousePublicRetirement', 'Your spouse\'s taxable retirement from the WV Teachers\' or Public Employees\' Retirement System or a federal retirement system', 'Schedule M line 33, column B; up to $2,000.'),
    amount('militaryRetirement', 'Your taxable military retirement pay (regular forces, Reserves or National Guard)', 'Schedule M line 32; fully subtracted.'),
    amount('spouseMilitaryRetirement', 'Your spouse\'s taxable military retirement pay', 'Schedule M line 32, column B.'),
    amount('wvPoliceFireRetirement', 'Your taxable retirement from a West Virginia state or local police, deputy sheriffs\' or firemen\'s retirement system', 'Schedule M line 31; fully subtracted.'),
    amount('spouseWvPoliceFireRetirement', 'Your spouse\'s taxable retirement from a West Virginia police, deputy sheriffs\' or firemen\'s retirement system', 'Schedule M line 31, column B.'),
    amount('federalLawEnforcementRetirement', 'Your taxable retirement as a retired federal law enforcement officer or firefighter', 'Schedule M line 30; fully subtracted.'),
    amount('spouseFederalLawEnforcementRetirement', 'Your spouse\'s taxable retirement as a retired federal law enforcement officer or firefighter', 'Schedule M line 30, column B.'),
    amount('railroadRetirement', 'Your U.S. Railroad Retirement Board benefits included in federal AGI (not the Social Security equivalent part)', 'Schedule M line 40.'),
    amount('spouseRailroadRetirement', 'Your spouse\'s U.S. Railroad Retirement Board benefits included in federal AGI', 'Schedule M line 40, column B.'),
    amount('collegeSavingsContributions', 'Contributions to the West Virginia SMART529 or Prepaid Tuition plan in the year', 'Schedule M line 39; keep the annual statement.'),
    Object.freeze({ id: 'disabled', kind: 'yesno', text: 'Were you certified by a physician as permanently and totally disabled in the year?', help: 'Allows the $8,000 senior or disability modification on Schedule M line 47 before age 65 (Schedule H).' }),
    Object.freeze({ id: 'spouseDisabled', kind: 'yesno', text: 'Was your spouse certified as permanently and totally disabled in the year?', help: 'Schedule M line 47, column B.' }),
    Object.freeze({ id: 'spouseJointIncomePercent', kind: 'count', text: 'Your spouse\'s percentage ownership of jointly held interest, dividends, gains and other income', help: 'Schedule M splits joint income between the two columns; 50 if owned equally.' }),
    Object.freeze({ id: 'survivingSpouseExemption', kind: 'yesno', text: 'Did your spouse die in one of the two years before this one, and you have not remarried?', help: 'Gives the additional surviving spouse exemption in box (d).' }),
    amount('useTax', 'West Virginia use tax owed on out-of-state or online purchases with no West Virginia sales tax', 'Schedule UT; enter 0 if none.'),
    amount('seniorCitizenTaxCredit', 'Senior Citizen Tax Credit from the SCTC-A form the Tax Division mailed you', 'Form IT-140 line 18; refundable.'),
    amount('homesteadPropertyTax', 'West Virginia property tax paid in the year on your owner-occupied home (after discount, before interest)', 'For the Homestead Excess Property Tax Credit, Schedule HEPTC-1. Not allowed with the Disabled Veterans credit.'),
    Object.freeze({ id: 'householdSize', kind: 'count', text: 'Number of people living in your home', help: 'Schedule HEPTC-1 income guidelines.' }),
    amount('workersCompensation', 'Workers\' compensation and other earnings replacement benefits received', 'Schedule HEPTC-1 line 4c.'),
    amount('otherHouseholdIncome', 'Income of others in your household who file their own return', 'Schedule HEPTC-1 line 4e.'),
  ]),
  notCovered: Object.freeze([
    'Schedule M lines 35 to 37 and 41 to 46 and 48 (S corporation bank assets, active duty and separation military pay, long-term care insurance, IRC 1341 repayments, ABLE and Jumpstart accounts, PBGC, gambling losses, surviving spouse deduction) and additions on lines 51 and 53 to 58',
    'Special nonresident filing on Schedule A, Part II for residents of reciprocal states who also have other West Virginia income',
    'Tax Credit Recap credits other than the credit for tax paid to another state, the Family Tax Credit and the child and dependent care credit (business, investment, film, rehabilitation and similar credits)',
    'Part-year residents\' credit for tax paid to another state on income earned there while a West Virginia resident',
    'Non-family adoption credit, Build WV, motor vehicle, disabled veteran and small business property tax credits (lines 17, 20 and 21)',
    'Married couples filing a joint federal return who choose separate West Virginia returns',
    'Underpayment penalty (Form IT-210) and the donations on line 26',
  ]),
  compute,
});
