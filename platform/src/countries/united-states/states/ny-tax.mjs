import { whole, positive } from '../state-kit.mjs';

export const round4 = (value) => Math.round(Number(value) * 10000) / 10000;
export const fraction = (part, total) => (whole(total) > 0 ? round4(whole(part) / whole(total)) : 0);
export const times = (amount, factor) => Math.round(whole(amount) * Number(factor));
export const percentOf = (amount, basisPoints) => Math.round((whole(amount) * basisPoints) / 10000);

export function scheduleKey(filingStatus) {
  if (filingStatus === 'mfj' || filingStatus === 'qss') return 'mfj';
  if (filingStatus === 'hoh') return 'hoh';
  return 'single';
}

const millionths = (rateBp) => Math.round(Number(rateBp) * 100);

function bandFor(amountCents, bands) {
  let found = bands[0];
  for (const band of bands) if (amountCents >= band.overCents) found = band;
  return found;
}

function taxAtCents(amountCents, bands) {
  const band = bandFor(amountCents, bands);
  const scaled = band.baseCents * 1000000 + (amountCents - band.overCents) * millionths(band.rateBp);
  return Math.floor((scaled + 50000000) / 100000000);
}

export function scheduleTax(amount, bands) {
  const taxable = positive(amount);
  if (!taxable) return 0;
  return taxAtCents(taxable * 100, bands);
}

export function tableRow(amount, table) {
  const taxable = positive(amount);
  const first = table.firstRows.find(([low, high]) => taxable >= low && taxable < high);
  if (first) return first;
  const low = Math.floor(taxable / table.rowWidth) * table.rowWidth;
  return [low, low + table.rowWidth];
}

export function tableTax(amount, table, bands, key) {
  const [low, high] = tableRow(amount, table);
  const rowBands = bands.map((band) => {
    const override = ((table.bases && table.bases[key]) || []).find((item) => item.overCents === band.overCents);
    return override ? { ...band, baseCents: override.baseCents } : band;
  });
  return taxAtCents((low + high) * 50, rowBands);
}

export function recaptureTax({ taxable, nyAgi, key, bands, recapture }) {
  const income = positive(taxable);
  if (nyAgi > recapture.topAgi) return { tax: percentOf(income, recapture.topRateBp), worksheet: { 1: income, 2: percentOf(income, recapture.topRateBp) } };
  const flat = recapture.flat[key];
  if (income <= flat.upToTaxable) {
    const line3 = percentOf(income, flat.rateBp);
    if (nyAgi >= recapture.startAgi + recapture.phaseIn) return { tax: line3, worksheet: { 1: nyAgi, 2: income, 3: line3, 9: line3 } };
    const line4 = scheduleTax(income, bands);
    const line5 = line3 - line4;
    const line6 = nyAgi - recapture.startAgi;
    const line7 = round4(line6 / recapture.phaseIn);
    const line8 = times(line5, line7);
    return { tax: line4 + line8, worksheet: { 1: nyAgi, 2: income, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: line8, 9: line4 + line8 } };
  }
  const tiers = recapture.tiers[key];
  let tier = tiers[0];
  for (const item of tiers) if (income > item.overTaxable) tier = item;
  const line3 = scheduleTax(income, bands);
  const line6 = Math.max(0, nyAgi - tier.applicableOver);
  const line7 = Math.min(line6, recapture.phaseIn);
  const line8 = round4(line7 / recapture.phaseIn);
  const line9 = times(tier.incrementalBenefit, line8);
  const tax = line3 + tier.recaptureBase + line9;
  return { tax, worksheet: { 1: nyAgi, 2: income, 3: line3, 4: tier.recaptureBase, 5: tier.incrementalBenefit, 6: line6, 7: line7, 8: line8, 9: line9, 10: tax } };
}

export function stateTax({ taxable, nyAgi, filingStatus, rates, readTable }) {
  const key = scheduleKey(filingStatus);
  const bands = rates.schedules[key];
  const income = positive(taxable);
  if (nyAgi > rates.recapture.startAgi) {
    const result = recaptureTax({ taxable: income, nyAgi, key, bands, recapture: rates.recapture });
    return { ...result, method: 'tax computation worksheet' };
  }
  if (income < 65000) {
    const table = readTable();
    if (table && income < table.belowTaxable) return { tax: income ? tableTax(income, table, bands, key) : 0, method: 'tax table' };
  }
  return { tax: scheduleTax(income, bands), method: 'rate schedule' };
}

export function cityTax({ taxable, filingStatus, schedules, readTable, forceSchedule = false }) {
  const key = scheduleKey(filingStatus);
  const bands = schedules[key];
  const income = positive(taxable);
  if (!income) return { tax: 0, method: 'none' };
  if (!forceSchedule && income < 65000) {
    const table = readTable();
    if (table && income < table.belowTaxable) return { tax: tableTax(income, table, bands, key), method: 'tax table' };
  }
  return { tax: scheduleTax(income, bands), method: 'rate schedule' };
}

function byCount(row, count) {
  if (count <= 7) return row.byCount[count - 1];
  return row.byCount[6] + row.eachOver7 * (count - 7);
}

export function householdCredit({ table, filingStatus, federalAgi, dependents, dependentFiler }) {
  if (dependentFiler) return 0;
  if (filingStatus === 'single') return table.single.find((row) => federalAgi <= row.upTo)?.credit || 0;
  const count = dependents + (filingStatus === 'mfj' || filingStatus === 'mfs' ? 2 : 1);
  const rows = filingStatus === 'mfs' ? table.mfs : table.family;
  const row = rows.find((item) => federalAgi <= item.upTo);
  if (!row) return 0;
  return row.perPerson ? row.perPerson * count : byCount(row, count);
}

export function cityEicRate(nyAgi, nyc) {
  const row = nyc.eic.find((item) => nyAgi >= item.from && (item.under === null || nyAgi < item.under)) || nyc.eic[0];
  if (row.slopeFrom === undefined) return { rate: row.rate };
  const line3 = nyAgi - row.slopeFrom;
  const line4 = round4(line3 * nyc.eicSlopePerDollar);
  return { rate: round4(row.rate - line4), line2: row.slopeFrom, line3, line4, line5: row.rate };
}

export function schoolRateReduction(cityTaxable, filingStatus, nyc) {
  const rule = nyc.schoolRateReduction;
  const income = positive(cityTaxable);
  if (income > rule.incomeLimit) return 0;
  const breakpoint = rule.breakpoint[filingStatus];
  if (income <= breakpoint) return Math.round((income * rule.lowRateMillionths) / 1000000);
  return rule.baseAtBreakpoint[filingStatus] + Math.round(((income - breakpoint) * rule.highRateMillionths) / 1000000);
}

export function prorateMonths(amount, months) {
  return Math.round((whole(amount) * Math.max(0, Math.min(12, months))) / 12);
}

export function eliminationThreshold(rule, filingStatus, dependents) {
  const list = filingStatus === 'mfj' || filingStatus === 'qss' ? rule.thresholds.joint : rule.thresholds.other;
  if (dependents < 1) return null;
  return list[Math.min(dependents, list.length) - 1];
}

export function itemizedDeduction({ ctx, rule, filingStatus, nyAgi }) {
  const parts = ctx.itemized;
  const federalAgi = ctx.income.agi;
  const line1 = positive(parts.medicalPaid);
  const line3 = percentOf(Math.max(0, federalAgi), rule.medicalFloorBp);
  const line4 = Math.max(0, line1 - line3);
  const line5 = parts.generalSalesTax > 0 ? positive(parts.generalSalesTax) : positive(parts.stateIncomeTaxes);
  const line6 = positive(parts.realEstateTaxes);
  const line7 = positive(parts.personalPropertyTaxes);
  const line9 = line5 + line6 + line7;
  const line10 = positive(parts.mortgageInterest);
  const line15 = line10;
  const line16 = positive(parts.charityCash);
  const line17 = positive(parts.charityNonCash);
  const line19 = line16 + line17;
  const line39 = positive(parts.otherItemized);
  const total = line4 + line9 + line15 + line19 + line39;
  const threshold = rule.limitation.federalAgiOver[filingStatus];
  let line40 = total;
  let limitation = null;
  let line41 = line5;
  if (federalAgi > threshold && line4 < total) {
    const ws3 = total - line4;
    const ws4 = percentOf(ws3, rule.limitation.maxReductionBp);
    const ws7 = federalAgi - threshold;
    const ws8 = percentOf(ws7, rule.limitation.rateBp);
    const ws9 = Math.min(ws4, ws8);
    line40 = total - ws9;
    const share = fraction(ws9, ws3);
    line41 = line5 - times(line5, share);
    limitation = { 1: total, 2: line4, 3: ws3, 4: ws4, 5: federalAgi, 6: threshold, 7: ws7, 8: ws8, 9: ws9, 10: line40, worksheet2: { 1: ws9, 2: ws3, 3: share, 4: line5, 6: line5, 7: times(line5, share), 8: line41, 11: line41 } };
  }
  const line42 = Math.max(0, line40 - line41);
  const line44 = 0;
  const line45 = line42 + line44;
  const adjustment = rule.adjustment;
  let line46 = 0;
  if (nyAgi > adjustment.start && nyAgi <= adjustment.worksheet4Over) {
    const over = nyAgi - adjustment.worksheet3Over[filingStatus];
    if (over > 0) line46 = times(percentOf(line45, adjustment.rateBp), round4(Math.min(over, adjustment.phaseIn) / adjustment.phaseIn));
  } else if (nyAgi > adjustment.worksheet4Over && nyAgi <= adjustment.halfAbove) {
    const share = round4(Math.min(nyAgi - adjustment.worksheet4Over, adjustment.phaseIn) / adjustment.phaseIn);
    const quarter = percentOf(line45, adjustment.rateBp);
    line46 = quarter + times(quarter, share);
  } else if (nyAgi > adjustment.halfAbove && nyAgi <= adjustment.charityOnlyAbove) line46 = percentOf(line45, 5000);
  let line47 = line45;
  if (nyAgi > adjustment.charityQuarterAbove) line47 = percentOf(line19, adjustment.charityQuarterBp);
  else if (nyAgi > adjustment.charityOnlyAbove) line47 = percentOf(line19, adjustment.charityHalfBp);
  else if (nyAgi > adjustment.start) line47 = line45 - line46;
  const line49 = Math.max(0, line47);
  return { lines: { 1: line1, 2: federalAgi, 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 9: line9, 10: line10, 15: line15, 16: line16, 17: line17, 19: line19, 39: line39, 40: line40, 41: line41, 42: line42, 44: line44, 45: line45, 46: line46, 47: line47, 49: line49 }, limitation, total: line49 };
}
