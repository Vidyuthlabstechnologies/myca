import { parseTaxYear, ruleSet, positivePence, wholePoundsPence, toPounds, share, poundsFloor, PENCE } from './rules.mjs';

const RULE_IDS = Object.freeze({
  allowances: 'gb.income-tax.allowances',
  bands: 'gb.income-tax.bands.rest-of-uk',
  scottish: 'gb.income-tax.bands.scotland',
  savings: 'gb.income-tax.savings',
  dividends: 'gb.income-tax.dividends',
  finance: 'gb.income-tax.property-finance-costs',
  hicbc: 'gb.income-tax.hicbc',
  class4: 'gb.ni.class-4',
  class2: 'gb.ni.class-2',
  loans: 'gb.student-loan.plans',
  cgt: 'gb.cgt.rates',
  poa: 'gb.sa.payments-on-account',
});

export const STUDENT_LOAN_PLANS = Object.freeze(['plan1', 'plan2', 'plan4', 'plan5', 'postgraduate']);
export const RESIDENCES = Object.freeze(['england', 'wales', 'northern-ireland', 'scotland']);
const BASIC_RATE_BP = 2000;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function tradingProfit(business = {}) {
  const turnover = wholePoundsPence(business.turnover) + wholePoundsPence(business.otherIncome);
  const expenses = wholePoundsPence(business.expenses);
  const allowance = Number.isFinite(business.allowancePence) ? business.allowancePence : 100000;
  const notes = [];
  if (business.useTradingAllowance && turnover <= allowance) {
    notes.push('Turnover is within the £1,000 trading allowance, so it is not taxed and need not be reported.');
    return { profitPence: 0, lossPence: 0, method: 'trading-allowance-full', notes };
  }
  const deduction = business.useTradingAllowance ? allowance : expenses;
  if (business.useTradingAllowance) notes.push('The £1,000 trading allowance is deducted instead of actual expenses.');
  const net = turnover - deduction + wholePoundsPence(business.adjustments);
  return net >= 0 ? { profitPence: net, lossPence: 0, method: business.useTradingAllowance ? 'trading-allowance' : 'expenses', notes } : { profitPence: 0, lossPence: -net, method: 'expenses', notes: [...notes, 'The business made a loss; MyCA does not yet set a loss against other income, so it is carried forward.'] };
}

export function propertyProfit(property = {}, allowancePence = 100000) {
  const income = wholePoundsPence(property.income);
  const expenses = wholePoundsPence(property.expenses);
  const finance = wholePoundsPence(property.financeCosts);
  if (property.usePropertyAllowance && income <= allowancePence) return { profitPence: 0, lossPence: 0, financeCostsPence: 0, method: 'property-allowance-full' };
  const deduction = property.usePropertyAllowance ? allowancePence : expenses;
  const net = income - deduction;
  return net >= 0 ? { profitPence: net, lossPence: 0, financeCostsPence: property.usePropertyAllowance ? 0 : finance, method: property.usePropertyAllowance ? 'property-allowance' : 'expenses' } : { profitPence: 0, lossPence: -net, financeCostsPence: finance, method: 'expenses' };
}

function sliceAcross(start, amount, bands, label) {
  const rows = [];
  let at = start;
  let left = amount;
  for (let index = 0; index < bands.length && left > 0; index += 1) {
    const band = bands[index];
    const top = index + 1 < bands.length ? bands[index + 1].fromPence : Infinity;
    if (at >= top) continue;
    const take = Math.min(left, top - Math.max(at, band.fromPence));
    if (take <= 0) continue;
    rows.push({ income: label, band: band.name, rateBp: band.basisPoints, amountPence: take, taxPence: share(take, band.basisPoints) });
    at += take;
    left -= take;
  }
  return { rows, end: at };
}

function zeroRow(label, band, amount) {
  return { income: label, band, rateBp: 0, amountPence: amount, taxPence: 0 };
}

function extend(bands, extraPence, fromIndex) {
  return bands.map((band, index) => (index >= fromIndex && band.fromPence > 0 ? { ...band, fromPence: band.fromPence + extraPence } : band));
}

function rateKey(name) {
  if (name === 'additional' || name === 'top') return 'additional';
  if (name === 'higher' || name === 'advanced') return 'higher';
  return 'basic';
}

function personalAllowance(allowances, adjustedNetPence, options) {
  let pa = allowances.personalAllowancePence;
  const over = adjustedNetPence - allowances.taperThresholdPence;
  if (over > 0) pa = Math.max(0, pa - Math.floor(over / allowances.taperDivisor / PENCE) * PENCE);
  if (options.marriageAllowance === 'transfer' && pa > 0) pa = Math.max(0, pa - allowances.marriageAllowancePence);
  if (options.blind) pa += allowances.blindPersonsAllowancePence || 0;
  return pa;
}

function studentLoan(plans, loanRules, earnedPence, unearnedPence) {
  const held = [...new Set((Array.isArray(plans) ? plans : []).map(String))];
  const unknown = held.filter((plan) => !STUDENT_LOAN_PLANS.includes(plan));
  if (unknown.length) return { error: 'UNKNOWN_STUDENT_LOAN_PLAN', unknown };
  const income = earnedPence + (unearnedPence > loanRules.unearnedIncomeLimitPence ? unearnedPence : 0);
  const rows = [];
  const notYet = held.filter((plan) => !loanRules.plans[plan]);
  const undergraduate = held.filter((plan) => plan !== 'postgraduate' && loanRules.plans[plan]).map((plan) => ({ plan, ...loanRules.plans[plan] })).sort((a, b) => a.thresholdPence - b.thresholdPence);
  if (undergraduate.length) {
    const lowest = undergraduate[0];
    const due = poundsFloor(share(Math.max(0, income - lowest.thresholdPence), lowest.basisPoints));
    rows.push({ plan: undergraduate.map((entry) => entry.plan).join('+'), thresholdPence: lowest.thresholdPence, rateBp: lowest.basisPoints, duePence: due });
  }
  if (held.includes('postgraduate')) {
    const pg = loanRules.plans.postgraduate;
    rows.push({ plan: 'postgraduate', thresholdPence: pg.thresholdPence, rateBp: pg.basisPoints, duePence: poundsFloor(share(Math.max(0, income - pg.thresholdPence), pg.basisPoints)) });
  }
  return { incomePence: income, rows, notYet, duePence: rows.reduce((sum, row) => sum + row.duePence, 0) };
}

function capitalGains(gains, cgt, basicBandLeftPence) {
  const residential = wholePoundsPence(gains.residential);
  const other = wholePoundsPence(gains.other);
  const badr = wholePoundsPence(gains.businessAssetDisposal);
  let losses = wholePoundsPence(gains.losses) + wholePoundsPence(gains.lossesBroughtForward);
  const net = { residential, other, badr };
  for (const key of ['residential', 'other', 'badr']) {
    const used = Math.min(losses, net[key]);
    net[key] -= used;
    losses -= used;
  }
  let exempt = cgt.annualExemptAmountPence;
  for (const key of ['residential', 'other', 'badr']) {
    const used = Math.min(exempt, net[key]);
    net[key] -= used;
    exempt -= used;
  }
  const rows = [];
  let band = Math.max(0, basicBandLeftPence);
  if (net.badr) {
    rows.push({ gain: 'business-asset-disposal', amountPence: net.badr, rateBp: cgt.businessAssetDisposalBasisPoints, taxPence: share(net.badr, cgt.businessAssetDisposalBasisPoints) });
    band = Math.max(0, band - net.badr);
  }
  for (const [key, rates] of [['residential', cgt.residentialBasisPoints], ['other', cgt.basisPoints]]) {
    const amount = net[key];
    if (!amount) continue;
    const lower = Math.min(amount, band);
    band -= lower;
    if (lower) rows.push({ gain: key, amountPence: lower, rateBp: rates.basic, taxPence: share(lower, rates.basic) });
    if (amount - lower) rows.push({ gain: key, amountPence: amount - lower, rateBp: rates.higher, taxPence: share(amount - lower, rates.higher) });
  }
  return { rows, taxPence: rows.reduce((sum, row) => sum + row.taxPence, 0), lossesCarriedForwardPence: losses, annualExemptUsedPence: cgt.annualExemptAmountPence - exempt };
}

function poundsOut(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => (key.endsWith('Pence') ? [key.replace(/Pence$/, ''), toPounds(value)] : key === 'rateBp' ? ['ratePercent', value / 100] : [key, value]))));
}

export function gbSelfAssessment(args = {}) {
  const year = parseTaxYear(args.taxYear);
  if (!year) return fail('BAD_TAX_YEAR', { hint: 'Give the tax year as 2026-27 (6 April 2026 to 5 April 2027).' });
  const residence = String(args.residence || 'england');
  if (!RESIDENCES.includes(residence)) return fail('BAD_RESIDENCE', { residences: RESIDENCES });
  const { values: rule, used, missing } = ruleSet(RULE_IDS, year.to);
  if (missing.length) return fail('RULES_MISSING_FOR_YEAR', { taxYear: year.label, missing, hint: 'MyCA has no dated rule for this tax year yet.' });
  const income = obj(args.income);
  const paid = obj(args.taxPaid);
  const notes = [];

  const trade = tradingProfit({ ...obj(income.selfEmployment), allowancePence: rule.allowances.tradingAllowancePence });
  const property = propertyProfit(obj(income.property), rule.allowances.propertyAllowancePence);
  notes.push(...trade.notes);
  const employment = wholePoundsPence(income.employment);
  const pensions = wholePoundsPence(income.pensions);
  const other = wholePoundsPence(income.other);
  const savings = wholePoundsPence(income.savingsInterest);
  const dividends = wholePoundsPence(income.dividends);
  const nonSavings = employment + trade.profitPence + property.profitPence + pensions + other;
  const total = nonSavings + savings + dividends;

  const grossPension = Math.round(positivePence(args.pensionContributionsNet) * 10000 / (10000 - BASIC_RATE_BP));
  const grossGiftAid = Math.round(positivePence(args.giftAidNet) * 10000 / (10000 - BASIC_RATE_BP));
  const bandExtension = poundsFloor(grossPension + grossGiftAid);
  const adjustedNet = Math.max(0, total - bandExtension);

  const options = { marriageAllowance: args.marriageAllowance, blind: args.blind === true };
  if (options.marriageAllowance && !['transfer', 'receive'].includes(options.marriageAllowance)) return fail('BAD_MARRIAGE_ALLOWANCE', { hint: 'transfer or receive' });
  const pa = personalAllowance(rule.allowances, adjustedNet, options);
  if (pa < rule.allowances.personalAllowancePence && adjustedNet > rule.allowances.taperThresholdPence) notes.push('The personal allowance falls by £1 for every £2 of adjusted net income over £100,000.');

  let allowanceLeft = pa;
  const take = (amount) => { const used = Math.min(allowanceLeft, amount); allowanceLeft -= used; return amount - used; };
  const taxableNonSavings = take(nonSavings);
  const taxableSavings = take(savings);
  const taxableDividends = take(dividends);
  const taxableTotal = taxableNonSavings + taxableSavings + taxableDividends;

  const ukBands = extend(rule.bands, bandExtension, 1);
  const nsBands = residence === 'scotland' ? extend(rule.scottish, bandExtension, 2) : ukBands;
  const rows = [];
  const ns = sliceAcross(0, taxableNonSavings, nsBands, 'non-savings');
  rows.push(...ns.rows);

  let at = taxableNonSavings;
  const startingBand = Math.max(0, rule.savings.startingRateBandPence - taxableNonSavings);
  const startingUsed = Math.min(startingBand, taxableSavings);
  if (startingUsed) { rows.push(zeroRow('savings', 'starting-rate', startingUsed)); at += startingUsed; }
  const top = (name) => ukBands.find((band) => band.name === name)?.fromPence ?? Infinity;
  const tier = taxableTotal > top('additional') ? 'additional' : taxableTotal > top('higher') ? 'higher' : 'basic';
  const psa = Math.min(rule.savings.personalSavingsAllowancePence[tier], taxableSavings - startingUsed);
  if (psa) { rows.push(zeroRow('savings', 'personal-savings-allowance', psa)); at += psa; }
  const savingsBands = ukBands.map((band) => ({ ...band, basisPoints: rule.savings.basisPoints[rateKey(band.name)] }));
  const sv = sliceAcross(at, taxableSavings - startingUsed - psa, savingsBands, 'savings');
  rows.push(...sv.rows);
  at = sv.end > at ? sv.end : at;

  const divAllowance = Math.min(rule.dividends.allowancePence, taxableDividends);
  if (divAllowance) { rows.push(zeroRow('dividends', 'dividend-allowance', divAllowance)); at += divAllowance; }
  const dividendBands = ukBands.map((band) => ({ ...band, basisPoints: rule.dividends.basisPoints[rateKey(band.name)] }));
  const dv = sliceAcross(at, taxableDividends - divAllowance, dividendBands, 'dividends');
  rows.push(...dv.rows);

  const grossTax = rows.reduce((sum, row) => sum + row.taxPence, 0);
  const reductions = [];
  let incomeTax = grossTax;
  if (property.financeCostsPence) {
    const relievable = Math.min(property.financeCostsPence, property.profitPence, Math.max(0, total - pa));
    const reduction = Math.min(incomeTax, share(relievable, rule.finance.reliefBasisPoints));
    if (property.financeCostsPence > relievable) notes.push('Some finance costs could not be relieved this year and carry forward.');
    reductions.push({ reason: 'residential-finance-costs', amountPence: reduction });
    incomeTax -= reduction;
  }
  if (options.marriageAllowance === 'receive') {
    if (tier !== 'basic' || (residence === 'scotland' && taxableNonSavings > (nsBands.find((band) => band.name === 'higher')?.fromPence ?? Infinity))) notes.push('Marriage allowance needs the receiving partner to pay tax at no more than the basic (or Scottish intermediate) rate; it was not applied.');
    else {
      const reduction = Math.min(incomeTax, share(rule.allowances.marriageAllowancePence, BASIC_RATE_BP));
      reductions.push({ reason: 'marriage-allowance', amountPence: reduction });
      incomeTax -= reduction;
    }
  }

  let hicbc = 0;
  const childBenefit = positivePence(args.childBenefit);
  if (childBenefit && adjustedNet > rule.hicbc.thresholdPence) {
    const percent = Math.min(100, Math.floor((adjustedNet - rule.hicbc.thresholdPence) / rule.hicbc.stepPence));
    hicbc = poundsFloor(Math.floor(childBenefit * percent / 100));
    notes.push(`High Income Child Benefit Charge: ${percent}% of the Child Benefit received.`);
  }

  const c4 = rule.class4;
  const exemptFromClass4 = args.overStatePensionAge === true;
  const profits = trade.profitPence;
  const class4Rows = exemptFromClass4 ? [] : [
    { band: 'main', rateBp: c4.mainBasisPoints, amountPence: Math.max(0, Math.min(profits, c4.upperProfitsLimitPence) - c4.lowerProfitsLimitPence) },
    { band: 'additional', rateBp: c4.additionalBasisPoints, amountPence: Math.max(0, profits - c4.upperProfitsLimitPence) },
  ].map((row) => ({ ...row, niPence: share(row.amountPence, row.rateBp) }));
  const class4 = class4Rows.reduce((sum, row) => sum + row.niPence, 0);
  if (exemptFromClass4 && profits) notes.push('No Class 4 National Insurance over State Pension age at the start of the tax year.');
  const class2Wanted = args.class2Voluntary === true;
  const class2 = class2Wanted && profits < rule.class2.smallProfitsThresholdPence && !exemptFromClass4 ? rule.class2.weeklyPence * rule.class2.weeks : 0;
  if (profits >= rule.class2.smallProfitsThresholdPence && profits) notes.push('Profits are over the small profits threshold, so Class 2 is treated as paid and the year counts for State Pension.');

  const loans = studentLoan(args.studentLoans, rule.loans, employment + trade.profitPence + pensions + other, property.profitPence + savings + dividends);
  if (loans.error) return fail(loans.error, { unknown: loans.unknown, plans: STUDENT_LOAN_PLANS });
  if (loans.notYet.length) notes.push(`No repayments are due on ${loans.notYet.join(', ')} in ${year.label}.`);
  const loanPaye = positivePence(args.studentLoanDeducted);
  const loanDue = Math.max(0, loans.duePence - loanPaye);

  const basicBandLeft = Math.max(0, top('higher') - taxableTotal);
  const gains = obj(args.gains);
  const cgt = capitalGains(gains, rule.cgt, basicBandLeft);

  const atSource = positivePence(paid.paye) + positivePence(paid.cis) + positivePence(paid.savingsTax) + positivePence(paid.other);
  const incomeTaxAndHicbc = incomeTax + hicbc;
  const liabilityForPoa = incomeTaxAndHicbc + class4;
  const relevant = Math.max(0, liabilityForPoa - atSource);
  const poaRule = rule.poa;
  let paymentsOnAccount = 0;
  let poaReason = '';
  if (relevant < poaRule.minimumBalancePence) poaReason = 'The tax not deducted at source is under £1,000, so no payments on account are due for next year.';
  else if (liabilityForPoa && share(liabilityForPoa, poaRule.atSourceShareBasisPoints) <= atSource) poaReason = 'More than 80% of the tax was deducted at source, so no payments on account are due for next year.';
  else paymentsOnAccount = share(relevant, poaRule.shareBasisPoints);
  const poaMade = positivePence(args.paymentsOnAccountMade);
  const totalDue = incomeTaxAndHicbc + class4 + class2 + loanDue + cgt.taxPence;
  const balancing = totalDue - atSource - poaMade;
  const next = year.start + 2;

  return {
    ok: true,
    data: {
      taxYear: year.label,
      residence,
      income: { employment: toPounds(employment), selfEmploymentProfit: toPounds(trade.profitPence), selfEmploymentLoss: toPounds(trade.lossPence), propertyProfit: toPounds(property.profitPence), propertyLoss: toPounds(property.lossPence), pensions: toPounds(pensions), other: toPounds(other), savingsInterest: toPounds(savings), dividends: toPounds(dividends), total: toPounds(total), adjustedNetIncome: toPounds(adjustedNet) },
      allowances: { personalAllowance: toPounds(pa), bandExtension: toPounds(bandExtension) },
      taxable: { nonSavings: toPounds(taxableNonSavings), savings: toPounds(taxableSavings), dividends: toPounds(taxableDividends), total: toPounds(taxableTotal) },
      incomeTaxBands: poundsOut(rows),
      reductions: poundsOut(reductions),
      incomeTax: toPounds(incomeTax),
      highIncomeChildBenefitCharge: toPounds(hicbc),
      class4: { rows: poundsOut(class4Rows), total: toPounds(class4) },
      class2Voluntary: toPounds(class2),
      studentLoan: { income: toPounds(loans.incomePence), rows: poundsOut(loans.rows), deductedThroughPaye: toPounds(loanPaye), due: toPounds(loanDue) },
      capitalGains: { rows: poundsOut(cgt.rows), tax: toPounds(cgt.taxPence), annualExemptUsed: toPounds(cgt.annualExemptUsedPence), lossesCarriedForward: toPounds(cgt.lossesCarriedForwardPence) },
      totalLiability: toPounds(totalDue),
      deductedAtSource: toPounds(atSource),
      paymentsOnAccountMade: toPounds(poaMade),
      balancingPayment: toPounds(balancing),
      refundDue: balancing < 0,
      nextYear: {
        paymentOnAccountEach: toPounds(paymentsOnAccount),
        dueDates: paymentsOnAccount ? [`${next}-01-31`, `${next}-07-31`] : [],
        why: poaReason,
      },
      dueBy: `${next}-01-31`,
      firstPaymentDue: toPounds(Math.max(0, balancing) + paymentsOnAccount),
      notes,
      rulesUsed: used,
      unreviewed: used.some((entry) => entry.unreviewed),
    },
  };
}
