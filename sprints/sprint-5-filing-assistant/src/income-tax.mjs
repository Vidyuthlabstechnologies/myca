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
    const deductions = Math.min(section80CPaise + section80DPaise, grossTotalIncomePaise);
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
