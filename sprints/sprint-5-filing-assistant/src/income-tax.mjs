import { rule } from '../../statutory-rules/src/index.mjs';

const AGE_BANDS = new Set(['below-60', '60-to-79', '80-plus']);

function fyStartOf(fy) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(fy || ''));
  return match ? `${match[1]}-04-01` : null;
}

function need(id, onDate) {
  const found = rule(id, onDate);
  if (!found.ok) throw Object.assign(new Error(found.error), { code: found.error, ruleId: id });
  return found.value;
}

function roundToTen(paise, spec) {
  const rupees = Math.floor(Math.max(0, paise) / 100);
  const step = spec.multiplePaise / 100;
  const remainder = rupees % step;
  const base = rupees - remainder;
  return (remainder >= spec.roundUpFromLastRupeeDigit ? base + step : base) * 100;
}

function slabTax(incomePaise, slabs) {
  let tax = 0;
  for (const slab of slabs) {
    const upper = slab.toPaise == null ? Infinity : slab.toPaise;
    const portion = Math.min(incomePaise, upper) - slab.fromPaise;
    if (portion > 0) tax += (portion * slab.ratePercent) / 100;
  }
  return Math.round(tax);
}

function surchargeRateAt(incomePaise, tiers, capPercent) {
  let rate = 0;
  let threshold = 0;
  for (const tier of tiers) {
    if (incomePaise > tier.aboveTotalIncomePaise) {
      rate = tier.ratePercent;
      threshold = tier.aboveTotalIncomePaise;
    }
  }
  return { rate: capPercent == null ? rate : Math.min(rate, capPercent), threshold };
}

function capped(claim, max) {
  return Math.max(0, Math.min(Number(claim) || 0, max));
}

export function computeIncomeTax(input = {}) {
  const onDate = fyStartOf(input.fy);
  if (!onDate) return { error: 'FY_INVALID' };
  const regime = input.regime === 'old' ? 'old' : input.regime === 'new' ? 'new' : null;
  if (!regime) return { error: 'REGIME_INVALID' };
  const ageBand = AGE_BANDS.has(input.ageBand) ? input.ageBand : 'below-60';
  try {
    const salary = Math.max(0, Number(input.salaryPaise) || 0);
    const other = Number(input.otherIncomePaise) || 0;
    const claims = input.claims || {};
    const standardDeductionPaise = Math.min(salary, need(`income-tax.${regime}-regime.standard-deduction`, onDate).maxPaise);
    const grossTotalIncomePaise = Math.max(0, salary - standardDeductionPaise + other);
    let section80CPaise = 0;
    let section80DPaise = 0;
    if (regime === 'old') {
      section80CPaise = capped(claims.section80CPaise, need('income-tax.deduction.80c.cap', onDate).maxPaise);
      const caps80d = need('income-tax.deduction.80d.caps', onDate);
      const groupCap = (senior) => Math.min(senior ? caps80d.seniorInsuranceMaxPaise : caps80d.insuranceMaxPaise, caps80d.groupMaxPaise);
      section80DPaise = capped(claims.healthInsuranceSelfAndFamilyPaise, groupCap(claims.selfAndFamilyIncludesSenior === true))
        + capped(claims.healthInsuranceParentsPaise, groupCap(claims.parentsIncludeSenior === true));
    }
    // Other Chapter VI-A deductions are capped by the caller (80CCD(1B), 80E, 80G, 80TTA and the like) and count in the old regime only.
    // The employer's NPS contribution under 80CCD(2) counts in both regimes.
    const otherViaPaise = regime === 'old' ? Math.max(0, Number(claims.otherChapterViaPaise) || 0) : 0;
    const employerNpsPaise = Math.max(0, Number(claims.employerNpsPaise) || 0);
    const deductions = Math.min(section80CPaise + section80DPaise + otherViaPaise + employerNpsPaise, grossTotalIncomePaise);
    const totalIncomePaise = roundToTen(grossTotalIncomePaise - deductions, need('income-tax.rounding.total-income', onDate));
    const slabs = need(regime === 'new' ? 'income-tax.new-regime.slabs' : `income-tax.old-regime.slabs.${ageBand}`, onDate);
    const slabTaxPaise = slabTax(totalIncomePaise, slabs);

    const rebateRule = need(`income-tax.${regime}-regime.rebate`, onDate);
    let rebatePaise = 0;
    if (input.residentIndividual !== false) {
      if (totalIncomePaise <= rebateRule.maxTotalIncomePaise) {
        rebatePaise = Math.min(slabTaxPaise, rebateRule.maxRebatePaise);
      } else if (rebateRule.marginalRelief) {
        const excess = totalIncomePaise - rebateRule.maxTotalIncomePaise;
        rebatePaise = Math.max(0, slabTaxPaise - excess);
      }
    }
    const taxAfterRebate = slabTaxPaise - rebatePaise;

    const surchargeRule = need('income-tax.surcharge.individual', onDate);
    const cap = regime === 'new' ? need('income-tax.new-regime.surcharge-cap', onDate).maxRatePercent : null;
    const { rate, threshold } = surchargeRateAt(totalIncomePaise, surchargeRule.tiers, cap);
    const grossSurcharge = Math.round((taxAfterRebate * rate) / 100);
    let surchargeMarginalReliefPaise = 0;
    if (grossSurcharge > 0 && surchargeRule.marginalRelief) {
      const below = surchargeRateAt(threshold, surchargeRule.tiers, cap).rate;
      const taxAtThreshold = slabTax(threshold, slabs);
      const ceiling = taxAtThreshold + Math.round((taxAtThreshold * below) / 100) + (totalIncomePaise - threshold);
      surchargeMarginalReliefPaise = Math.min(grossSurcharge, Math.max(0, taxAfterRebate + grossSurcharge - ceiling));
    }
    const surchargePaise = grossSurcharge - surchargeMarginalReliefPaise;
    const beforeCess = taxAfterRebate + surchargePaise;
    const cessPaise = Math.round((beforeCess * need('income-tax.cess.health-education', onDate).ratePercent) / 100);
    const taxPayablePaise = roundToTen(beforeCess + cessPaise, need('income-tax.rounding.tax-payable', onDate));
    return {
      grossTotalIncomePaise,
      standardDeductionPaise,
      section80CPaise,
      section80DPaise,
      ...(otherViaPaise || employerNpsPaise ? { otherChapterViaPaise: otherViaPaise, employerNpsPaise } : {}),
      totalIncomePaise,
      slabTaxPaise,
      rebatePaise,
      surchargePaise,
      surchargeMarginalReliefPaise,
      cessPaise,
      taxPayablePaise,
    };
  } catch (err) {
    return { error: err.code || 'INCOME_TAX_FAILED', ruleId: err.ruleId };
  }
}

// Income tax for a resident individual or HUF who also has income taxed at special rates
// (111A, 112A, and long-term gains on other assets). Same rules and rounding as computeIncomeTax.
// special: { stcg111A_BE, stcg111A_AE, ltcg112A_BE, ltcg112A_AE, ltcgOther_BE, ltcgOther_AE } in paise, after loss set-off and exemptions.
// Rates are fixed by the Finance (No. 2) Act, 2024 for transfers before and on or after 23 July 2024.
// Surcharge marginal relief is not computed here: the result says so when the surcharge applies.
export const SPECIAL_RATE_PERCENT = { stcg111A_BE: 15, stcg111A_AE: 20, ltcg112A_BE: 10, ltcg112A_AE: 12.5, ltcgOther_BE: 20, ltcgOther_AE: 12.5 };
const SURCHARGE_CAP_SPECIAL = 15;

export function computeIncomeTaxSpecial(input = {}) {
  const onDate = fyStartOf(input.fy);
  if (!onDate) return { error: 'FY_INVALID' };
  const regime = input.regime === 'old' ? 'old' : input.regime === 'new' ? 'new' : null;
  if (!regime) return { error: 'REGIME_INVALID' };
  const ageBand = AGE_BANDS.has(input.ageBand) ? input.ageBand : 'below-60';
  try {
    const salary = Math.max(0, Number(input.salaryPaise) || 0);
    const other = Number(input.otherIncomePaise) || 0;
    const claims = input.claims || {};
    const standardDeductionPaise = Math.min(salary, need(`income-tax.${regime}-regime.standard-deduction`, onDate).maxPaise);
    const grossNormal = Math.max(0, salary - standardDeductionPaise + other);
    let section80CPaise = 0;
    let section80DPaise = 0;
    if (regime === 'old') {
      section80CPaise = capped(claims.section80CPaise, need('income-tax.deduction.80c.cap', onDate).maxPaise);
      const caps80d = need('income-tax.deduction.80d.caps', onDate);
      const groupCap = (senior) => Math.min(senior ? caps80d.seniorInsuranceMaxPaise : caps80d.insuranceMaxPaise, caps80d.groupMaxPaise);
      section80DPaise = capped(claims.healthInsuranceSelfAndFamilyPaise, groupCap(claims.selfAndFamilyIncludesSenior === true))
        + capped(claims.healthInsuranceParentsPaise, groupCap(claims.parentsIncludeSenior === true));
    }
    const otherViaPaise = regime === 'old' ? Math.max(0, Number(claims.otherChapterViaPaise) || 0) : 0;
    const employerNpsPaise = Math.max(0, Number(claims.employerNpsPaise) || 0);
    const deductionsPaise = Math.min(section80CPaise + section80DPaise + otherViaPaise + employerNpsPaise, grossNormal);
    const special = {};
    let specialTotal = 0;
    for (const key of Object.keys(SPECIAL_RATE_PERCENT)) {
      special[key] = Math.max(0, Number(input.special?.[key]) || 0);
      specialTotal += special[key];
    }
    const normalBefore = Math.max(0, grossNormal - deductionsPaise);
    const totalIncomePaise = roundToTen(normalBefore + specialTotal, need('income-tax.rounding.total-income', onDate));
    const normalIncomePaise = Math.max(0, totalIncomePaise - specialTotal);
    const slabs = need(regime === 'new' ? 'income-tax.new-regime.slabs' : `income-tax.old-regime.slabs.${ageBand}`, onDate);
    // The unused basic exemption reduces the special-rate income, highest rate first (resident individual).
    const exemptionLimit = slabs.find((slab) => slab.ratePercent === 0)?.toPaise || 0;
    let shortfall = Math.max(0, exemptionLimit - normalIncomePaise);
    const adjusted = { ...special };
    let exemptionLeft = Math.max(0, Number(input.exemption112APaise) || 0);
    for (const key of ['ltcg112A_AE', 'ltcg112A_BE']) {
      const take = Math.min(exemptionLeft, adjusted[key]);
      adjusted[key] -= take;
      exemptionLeft -= take;
    }
    const exemption112AAppliedPaise = Math.max(0, Number(input.exemption112APaise) || 0) - exemptionLeft;
    for (const key of Object.keys(SPECIAL_RATE_PERCENT).sort((a, b) => SPECIAL_RATE_PERCENT[b] - SPECIAL_RATE_PERCENT[a])) {
      const take = Math.min(shortfall, adjusted[key]);
      adjusted[key] -= take;
      shortfall -= take;
    }
    const normalTaxPaise = slabTax(normalIncomePaise, slabs);
    const specialTaxByKey = {};
    let specialTaxPaise = 0;
    for (const [key, percent] of Object.entries(SPECIAL_RATE_PERCENT)) {
      specialTaxByKey[key] = Math.round((adjusted[key] * percent) / 100);
      specialTaxPaise += specialTaxByKey[key];
    }
    const rebateRule = need(`income-tax.${regime}-regime.rebate`, onDate);
    let rebatePaise = 0;
    if (input.residentIndividual !== false) {
      // From FY 2025-26 the rebate does not reach tax on special-rate gains (Finance Act, 2025); before that it applies to the whole tax.
      const fyStartYear = Number(String(input.fy).slice(0, 4));
      const rebateBase = fyStartYear >= 2025 && regime === 'new' ? normalTaxPaise : normalTaxPaise + specialTaxPaise;
      if (totalIncomePaise <= rebateRule.maxTotalIncomePaise) rebatePaise = Math.min(rebateBase, rebateRule.maxRebatePaise);
      else if (rebateRule.marginalRelief) rebatePaise = Math.max(0, Math.min(rebateBase, rebateBase - (totalIncomePaise - rebateRule.maxTotalIncomePaise)));
    }
    const taxAfterRebate = normalTaxPaise + specialTaxPaise - rebatePaise;
    const surchargeRule = need('income-tax.surcharge.individual', onDate);
    const cap = regime === 'new' ? need('income-tax.new-regime.surcharge-cap', onDate).maxRatePercent : null;
    const { rate } = surchargeRateAt(totalIncomePaise, surchargeRule.tiers, cap);
    const specialRate = Math.min(rate, SURCHARGE_CAP_SPECIAL);
    const normalAfterRebate = Math.max(0, normalTaxPaise - rebatePaise);
    const specialAfterRebate = taxAfterRebate - normalAfterRebate;
    const surchargePaise = Math.round((normalAfterRebate * rate) / 100) + Math.round((specialAfterRebate * specialRate) / 100);
    const beforeCess = taxAfterRebate + surchargePaise;
    const cessPaise = Math.round((beforeCess * need('income-tax.cess.health-education', onDate).ratePercent) / 100);
    const taxPayablePaise = roundToTen(beforeCess + cessPaise, need('income-tax.rounding.tax-payable', onDate));
    return {
      grossNormalIncomePaise: grossNormal,
      standardDeductionPaise,
      section80CPaise,
      section80DPaise,
      ...(otherViaPaise || employerNpsPaise ? { otherChapterViaPaise: otherViaPaise, employerNpsPaise } : {}),
      deductionsPaise,
      normalIncomePaise,
      specialIncomePaise: specialTotal,
      totalIncomePaise,
      normalTaxPaise,
      specialTaxPaise,
      specialTaxByKey,
      exemption112AAppliedPaise,
      basicExemptionAdjustedPaise: specialTotal - exemption112AAppliedPaise - Object.values(adjusted).reduce((a, b) => a + b, 0),
      rebatePaise,
      surchargePaise,
      surchargeMarginalReliefComputed: false,
      surchargeWarning: surchargePaise > 0 ? 'Surcharge marginal relief is not computed for returns with special-rate income. Check this figure in the portal utility.' : '',
      cessPaise,
      taxPayablePaise,
    };
  } catch (err) {
    return { error: err.code || 'INCOME_TAX_FAILED', ruleId: err.ruleId };
  }
}
