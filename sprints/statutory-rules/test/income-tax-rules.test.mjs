import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES as INCOME_TAX_RULES } from '../src/rules/income-tax.mjs';
import { createRuleContext, fyEnd, fyStart, rule, runGolden, validateRules } from '../src/index.mjs';

globalThis.fetch = () => {
  throw new Error('network is not allowed in statutory-rules');
};

const GOLDEN = new URL('../golden/income-tax.json', import.meta.url);
const FINANCIAL_YEARS = ['2024-25', '2025-26', '2026-27'];
const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

const SLAB_IDS = [
  'income-tax.new-regime.slabs',
  'income-tax.old-regime.slabs.below-60',
  'income-tax.old-regime.slabs.60-to-79',
  'income-tax.old-regime.slabs.80-plus'
];

const RULE_IDS = [
  ...SLAB_IDS,
  'income-tax.new-regime.rebate',
  'income-tax.old-regime.rebate',
  'income-tax.new-regime.standard-deduction',
  'income-tax.old-regime.standard-deduction',
  'income-tax.surcharge.individual',
  'income-tax.new-regime.surcharge-cap',
  'income-tax.cess.health-education',
  'income-tax.deduction.80c.cap',
  'income-tax.deduction.80d.caps',
  'income-tax.rounding.total-income',
  'income-tax.rounding.tax-payable'
].sort();

const ACT_BY_FY = { '2024-25': 'IT-1961', '2025-26': 'IT-1961', '2026-27': 'IT-2025' };

const SECTIONS = {
  'IT-1961': {
    'income-tax.new-regime.slabs': '115BAC(1A)',
    'income-tax.new-regime.rebate': '87A',
    'income-tax.old-regime.rebate': '87A',
    'income-tax.new-regime.standard-deduction': '16(ia)',
    'income-tax.old-regime.standard-deduction': '16(ia)',
    'income-tax.deduction.80c.cap': '80C',
    'income-tax.deduction.80d.caps': '80D',
    'income-tax.rounding.total-income': '288A',
    'income-tax.rounding.tax-payable': '288B'
  },
  'IT-2025': {
    'income-tax.new-regime.slabs': '202(1)',
    'income-tax.new-regime.rebate': '156(2)',
    'income-tax.old-regime.rebate': '156(1)',
    'income-tax.new-regime.standard-deduction': '19(1) Table Sl. No. 2',
    'income-tax.old-regime.standard-deduction': '19(1) Table Sl. No. 2',
    'income-tax.deduction.80c.cap': '123',
    'income-tax.deduction.80d.caps': '126',
    'income-tax.rounding.total-income': '516',
    'income-tax.rounding.tax-payable': '516'
  }
};

function slabs(...rows) {
  return rows.map(([fromRupees, toRupees, ratePercent]) => ({
    fromPaise: fromRupees * RUPEE,
    toPaise: toRupees === null ? null : toRupees * RUPEE,
    ratePercent
  }));
}

const NEW_REGIME_SLABS_FY_2024_25 = slabs([0, 300000, 0], [300000, 700000, 5], [700000, 1000000, 10], [1000000, 1200000, 15], [1200000, 1500000, 20], [1500000, null, 30]);
const NEW_REGIME_SLABS_FROM_FY_2025_26 = slabs([0, 400000, 0], [400000, 800000, 5], [800000, 1200000, 10], [1200000, 1600000, 15], [1600000, 2000000, 20], [2000000, 2400000, 25], [2400000, null, 30]);
const OLD_REGIME_SLABS = {
  'income-tax.old-regime.slabs.below-60': slabs([0, 250000, 0], [250000, 500000, 5], [500000, 1000000, 20], [1000000, null, 30]),
  'income-tax.old-regime.slabs.60-to-79': slabs([0, 300000, 0], [300000, 500000, 5], [500000, 1000000, 20], [1000000, null, 30]),
  'income-tax.old-regime.slabs.80-plus': slabs([0, 500000, 0], [500000, 1000000, 20], [1000000, null, 30])
};

function valueOn(id, fy) {
  const result = rule(id, fyStart(fy));
  assert.equal(result.ok, true, `${id} in FY ${fy}: ${JSON.stringify(result)}`);
  return result.value;
}

function recordOn(id, fy) {
  const result = rule(id, fyStart(fy));
  assert.equal(result.ok, true, `${id} in FY ${fy}: ${JSON.stringify(result)}`);
  return result.record;
}

test('income-tax records pass integrity, carry a source and stay unattested until the advisor signs', () => {
  assert.ok(INCOME_TAX_RULES.length > 0);
  assert.deepEqual(validateRules(INCOME_TAX_RULES).problems, []);
  assert.deepEqual([...new Set(INCOME_TAX_RULES.map((record) => record.id))].sort(), RULE_IDS);
  for (const record of INCOME_TAX_RULES) {
    const label = `${record.id}@${record.effectiveFrom}`;
    assert.deepEqual(record.attestations, [], label);
    assert.ok(record.source.trim().length > 20, label);
    assert.ok(['IT-1961', 'IT-2025'].includes(record.act), label);
    assert.equal(typeof record.basis, 'string', label);
  }
});

test('each rule has exactly one version per financial year FY 2024-25 to FY 2026-27 and is not in force outside them', () => {
  for (const id of RULE_IDS) {
    const versions = INCOME_TAX_RULES.filter((record) => record.id === id);
    assert.deepEqual(versions.map((record) => [record.effectiveFrom, record.effectiveTo]).sort(), FINANCIAL_YEARS.map((fy) => [fyStart(fy), fyEnd(fy)]), id);
    for (const fy of FINANCIAL_YEARS) {
      assert.equal(recordOn(id, fy), rule(id, fyEnd(fy)).record, `${id} FY ${fy}`);
    }
    assert.deepEqual(rule(id, '2024-03-31'), { ok: false, error: 'RULE_NOT_IN_FORCE', id, onDate: '2024-03-31' });
    assert.deepEqual(rule(id, fyStart('2027-28')), { ok: false, error: 'RULE_NOT_IN_FORCE', id, onDate: '2027-04-01' });
  }
});

test('FY 2026-27 rules cite the Income-tax Act 2025 and earlier years the Income-tax Act 1961, with confirmed sections only', () => {
  for (const id of RULE_IDS) {
    for (const fy of FINANCIAL_YEARS) {
      const record = recordOn(id, fy);
      assert.equal(record.act, ACT_BY_FY[fy], `${id} FY ${fy}`);
      assert.equal(record.section, SECTIONS[record.act][id] ?? '', `${id} FY ${fy}`);
    }
  }
});

test('slab tables are contiguous from zero, strictly increasing, open at the top and never lower the rate', () => {
  for (const id of SLAB_IDS) {
    for (const fy of FINANCIAL_YEARS) {
      const table = valueOn(id, fy);
      const label = `${id} FY ${fy}`;
      assert.ok(Array.isArray(table) && table.length >= 2, label);
      assert.equal(table[0].fromPaise, 0, label);
      assert.equal(table[0].ratePercent, 0, label);
      assert.equal(table.at(-1).toPaise, null, label);
      table.forEach((slab, index) => {
        assert.deepEqual(Object.keys(slab).sort(), ['fromPaise', 'ratePercent', 'toPaise'], label);
        assert.ok(Number.isSafeInteger(slab.fromPaise) && slab.fromPaise % RUPEE === 0, label);
        assert.ok(Number.isInteger(slab.ratePercent) && slab.ratePercent >= 0 && slab.ratePercent <= 100, label);
        if (index < table.length - 1) {
          assert.ok(Number.isSafeInteger(slab.toPaise) && slab.toPaise > slab.fromPaise, label);
          assert.equal(table[index + 1].fromPaise, slab.toPaise, label);
          assert.ok(table[index + 1].ratePercent > slab.ratePercent, label);
        }
      });
    }
  }
});

test('new-regime slabs: 0/5/10/15/20/30 in FY 2024-25, then 0/5/10/15/20/25/30 on 4 lakh steps', () => {
  assert.deepEqual(valueOn('income-tax.new-regime.slabs', '2024-25'), NEW_REGIME_SLABS_FY_2024_25);
  assert.deepEqual(valueOn('income-tax.new-regime.slabs', '2025-26'), NEW_REGIME_SLABS_FROM_FY_2025_26);
  assert.deepEqual(valueOn('income-tax.new-regime.slabs', '2026-27'), NEW_REGIME_SLABS_FROM_FY_2025_26);
});

test('old-regime slabs by age band are unchanged across the three years', () => {
  for (const fy of FINANCIAL_YEARS) {
    for (const [id, table] of Object.entries(OLD_REGIME_SLABS)) assert.deepEqual(valueOn(id, fy), table, `${id} FY ${fy}`);
  }
});

test('rebate: new regime 25,000 to 7 lakh in FY 2024-25 then 60,000 to 12 lakh, both with marginal relief; old regime 12,500 to 5 lakh without', () => {
  assert.deepEqual(valueOn('income-tax.new-regime.rebate', '2024-25'), { maxTotalIncomePaise: 7 * LAKH, maxRebatePaise: 25000 * RUPEE, marginalRelief: true });
  for (const fy of ['2025-26', '2026-27']) {
    assert.deepEqual(valueOn('income-tax.new-regime.rebate', fy), { maxTotalIncomePaise: 12 * LAKH, maxRebatePaise: 60000 * RUPEE, marginalRelief: true });
  }
  for (const fy of FINANCIAL_YEARS) {
    assert.deepEqual(valueOn('income-tax.old-regime.rebate', fy), { maxTotalIncomePaise: 5 * LAKH, maxRebatePaise: 12500 * RUPEE, marginalRelief: false });
  }
});

test('standard deduction from salary: 75,000 in the new regime and 50,000 in the old regime', () => {
  for (const fy of FINANCIAL_YEARS) {
    assert.deepEqual(valueOn('income-tax.new-regime.standard-deduction', fy), { maxPaise: 75000 * RUPEE });
    assert.deepEqual(valueOn('income-tax.old-regime.standard-deduction', fy), { maxPaise: 50000 * RUPEE });
  }
});

test('surcharge tiers 10/15/25/37 above 50 lakh, 1, 2 and 5 crore with marginal relief; new regime capped at 25; cess 4', () => {
  for (const fy of FINANCIAL_YEARS) {
    assert.deepEqual(valueOn('income-tax.surcharge.individual', fy), {
      tiers: [
        { aboveTotalIncomePaise: 50 * LAKH, ratePercent: 10 },
        { aboveTotalIncomePaise: CRORE, ratePercent: 15 },
        { aboveTotalIncomePaise: 2 * CRORE, ratePercent: 25 },
        { aboveTotalIncomePaise: 5 * CRORE, ratePercent: 37 }
      ],
      marginalRelief: true
    });
    assert.deepEqual(valueOn('income-tax.new-regime.surcharge-cap', fy), { maxRatePercent: 25 });
    assert.deepEqual(valueOn('income-tax.cess.health-education', fy), { ratePercent: 4 });
  }
});

test('80C aggregate cap 1,50,000; 80D caps 25,000 per group, 50,000 for a senior citizen, 5,000 preventive check-up within', () => {
  for (const fy of FINANCIAL_YEARS) {
    assert.deepEqual(valueOn('income-tax.deduction.80c.cap', fy), { maxPaise: 150000 * RUPEE });
    assert.deepEqual(valueOn('income-tax.deduction.80d.caps', fy), {
      groups: ['self-and-family', 'parents'],
      insuranceMaxPaise: 25000 * RUPEE,
      seniorInsuranceMaxPaise: 50000 * RUPEE,
      seniorMedicalExpenditureMaxPaise: 50000 * RUPEE,
      groupMaxPaise: 50000 * RUPEE,
      preventiveHealthCheckupMaxPaise: 5000 * RUPEE
    });
  }
});

test('total income and tax payable are rounded to the nearest ten rupees after ignoring paise, five and above going up', () => {
  for (const fy of FINANCIAL_YEARS) {
    for (const id of ['income-tax.rounding.total-income', 'income-tax.rounding.tax-payable']) {
      assert.deepEqual(valueOn(id, fy), { ignorePaise: true, multiplePaise: 10 * RUPEE, roundUpFromLastRupeeDigit: 5 });
    }
  }
});

function percentOf(paise, ratePercent) {
  return Math.floor((paise * ratePercent + 50) / 100);
}

function roundToTenRupees(paise, rounding) {
  const rupees = rounding.ignorePaise ? Math.floor(paise / RUPEE) : Math.round(paise / RUPEE);
  const step = rounding.multiplePaise / RUPEE;
  const lastDigit = rupees % step;
  const rounded = lastDigit >= rounding.roundUpFromLastRupeeDigit ? rupees - lastDigit + step : rupees - lastDigit;
  return rounded * RUPEE;
}

function slabTax(totalIncomePaise, table) {
  let numerator = 0;
  for (const slab of table) {
    const top = slab.toPaise === null ? totalIncomePaise : Math.min(totalIncomePaise, slab.toPaise);
    if (top > slab.fromPaise) numerator += (top - slab.fromPaise) * slab.ratePercent;
  }
  return Math.floor((numerator + 50) / 100);
}

function computeFromRules(input) {
  const context = createRuleContext();
  const onDate = fyStart(input.fy);
  const need = (id) => {
    const result = context.rule(id, onDate);
    if (!result.ok) throw new Error(`${result.error} ${id} ${onDate}`);
    return result.value;
  };
  const regime = input.regime === 'new' ? 'new-regime' : 'old-regime';
  const standardDeduction = Math.min(input.salaryPaise, need(`income-tax.${regime}.standard-deduction`).maxPaise);
  const grossTotalIncome = input.salaryPaise - standardDeduction + input.otherIncomePaise;
  let section80C = 0;
  let section80D = 0;
  if (input.regime === 'old') {
    section80C = Math.min(input.claims.section80CPaise, need('income-tax.deduction.80c.cap').maxPaise);
    const caps = need('income-tax.deduction.80d.caps');
    const groupCap = (senior) => (senior ? caps.seniorInsuranceMaxPaise : caps.insuranceMaxPaise);
    section80D = Math.min(input.claims.healthInsuranceSelfAndFamilyPaise, groupCap(input.claims.selfAndFamilyIncludesSenior))
      + Math.min(input.claims.healthInsuranceParentsPaise, groupCap(input.claims.parentsIncludeSenior));
    const allowed = Math.min(section80C + section80D, grossTotalIncome);
    section80D = Math.max(0, allowed - section80C);
    section80C = Math.min(section80C, allowed);
  }
  const totalIncome = roundToTenRupees(grossTotalIncome - section80C - section80D, need('income-tax.rounding.total-income'));
  const table = need(input.regime === 'new' ? 'income-tax.new-regime.slabs' : `income-tax.old-regime.slabs.${input.ageBand}`);
  const slabTaxPaise = slabTax(totalIncome, table);
  const rebateRule = need(`income-tax.${regime}.rebate`);
  let rebate = 0;
  if (input.residentIndividual && totalIncome <= rebateRule.maxTotalIncomePaise) {
    rebate = Math.min(slabTaxPaise, rebateRule.maxRebatePaise);
  } else if (input.residentIndividual && rebateRule.marginalRelief && slabTaxPaise > totalIncome - rebateRule.maxTotalIncomePaise) {
    rebate = slabTaxPaise - (totalIncome - rebateRule.maxTotalIncomePaise);
  }
  const taxAfterRebate = slabTaxPaise - rebate;
  const surchargeRule = need('income-tax.surcharge.individual');
  const cap = input.regime === 'new' ? need('income-tax.new-regime.surcharge-cap').maxRatePercent : 100;
  const tierIndex = surchargeRule.tiers.findLastIndex((tier) => totalIncome > tier.aboveTotalIncomePaise);
  let surcharge = 0;
  let surchargeMarginalRelief = 0;
  if (tierIndex >= 0) {
    const tier = surchargeRule.tiers[tierIndex];
    const rawSurcharge = percentOf(taxAfterRebate, Math.min(tier.ratePercent, cap));
    surcharge = rawSurcharge;
    if (surchargeRule.marginalRelief) {
      const lowerRate = tierIndex === 0 ? 0 : Math.min(surchargeRule.tiers[tierIndex - 1].ratePercent, cap);
      const taxAtThreshold = slabTax(tier.aboveTotalIncomePaise, table);
      const ceiling = taxAtThreshold + percentOf(taxAtThreshold, lowerRate) + (totalIncome - tier.aboveTotalIncomePaise);
      surcharge = Math.max(0, Math.min(rawSurcharge, ceiling - taxAfterRebate));
      surchargeMarginalRelief = rawSurcharge - surcharge;
    }
  }
  const cess = percentOf(taxAfterRebate + surcharge, need('income-tax.cess.health-education').ratePercent);
  const taxPayable = roundToTenRupees(taxAfterRebate + surcharge + cess, need('income-tax.rounding.tax-payable'));
  return {
    grossTotalIncomePaise: grossTotalIncome,
    standardDeductionPaise: standardDeduction,
    section80CPaise: section80C,
    section80DPaise: section80D,
    totalIncomePaise: totalIncome,
    slabTaxPaise,
    rebatePaise: rebate,
    surchargePaise: surcharge,
    surchargeMarginalReliefPaise: surchargeMarginalRelief,
    cessPaise: cess,
    taxPayablePaise: taxPayable
  };
}

function goldenCases() {
  const document = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  return Array.isArray(document) ? document : document.cases;
}

test('golden cases cover the requested salaried incomes in the new regime and old-regime comparisons for FY 2025-26 and FY 2026-27', () => {
  const cases = goldenCases();
  const requested = [7 * LAKH, 12 * LAKH, 1210000 * RUPEE, 1275000 * RUPEE, 13 * LAKH, 25 * LAKH, 50 * LAKH + RUPEE, 60 * LAKH, 120 * LAKH];
  for (const fy of ['2025-26', '2026-27']) {
    const salaries = (regime) => cases.filter((entry) => entry.input.fy === fy && entry.input.regime === regime && entry.input.otherIncomePaise === 0).map((entry) => entry.input.salaryPaise);
    for (const salary of requested) assert.ok(salaries('new').includes(salary), `new regime FY ${fy} salary ${salary}`);
    for (const salary of [7 * LAKH, 12 * LAKH, 13 * LAKH, 25 * LAKH, 60 * LAKH]) assert.ok(salaries('old').includes(salary), `old regime FY ${fy} salary ${salary}`);
  }
  assert.ok(cases.some((entry) => entry.input.fy === '2024-25'));
  for (const entry of cases) {
    assert.equal(typeof entry.name, 'string');
    assert.ok(typeof entry.arithmetic === 'string' && entry.arithmetic.length > 20, entry.name);
    assert.ok(typeof entry.citation === 'string' && entry.citation.length > 20, entry.name);
  }
});

test('headline golden figures from the audit: 12 lakh salary pays 0, 13 lakh pays 26,000, 60 lakh pays 15,52,980 in FY 2025-26', () => {
  const byName = new Map(goldenCases().map((entry) => [entry.name, entry.expected.taxPayablePaise]));
  assert.equal(byName.get('FY 2025-26 new regime salary 12,00,000'), 0);
  assert.equal(byName.get('FY 2025-26 new regime salary 12,75,000'), 0);
  assert.equal(byName.get('FY 2025-26 new regime salary 13,00,000'), 26000 * RUPEE);
  assert.equal(byName.get('FY 2025-26 new regime salary 60,00,000'), 1552980 * RUPEE);
});

test('every golden case matches a computation driven only by the dated income-tax rules', async () => {
  const result = await runGolden(GOLDEN, computeFromRules);
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.ok(result.total >= 60);
});

test('a computation reports the rule versions it used, all unverified until attested', () => {
  const context = createRuleContext();
  for (const id of RULE_IDS) context.rule(id, fyStart('2026-27'));
  assert.deepEqual(context.rulesUsed(), RULE_IDS.map((id) => `${id}@2026-04-01`));
  assert.deepEqual(context.unverifiedRules('firm-a'), context.rulesUsed());
});
