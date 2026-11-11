import { rules } from '../../sprint-load.mjs';
import { progressiveTax, flatTax } from '../kit/index.mjs';

const SEN_PER_RINGGIT = 100;
const PER_CHILD = new Set(['childUnder18', 'childHigherEducation', 'disabledChild']);
const toSen = (ringgit) => Math.round(Number(ringgit || 0) * SEN_PER_RINGGIT);
const badBands = (ruleId) => fail('BAD_BANDS', { ruleId, hint: 'The rule record is not a valid band table; fix the statutory rule.' });
const toRinggit = (sen) => Math.round(sen) / SEN_PER_RINGGIT;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function ruleFor(id, yearOfAssessment) {
  const found = rules.rule(id, `${yearOfAssessment}-12-31`);
  return found.ok ? found.record : null;
}

export function bandTaxSen(chargeableSen, bands) {
  const out = progressiveTax(chargeableSen, bands.map((band) => ({ over: band.fromSen, rateBp: band.basisPoints })));
  return out.ok ? out.tax : null;
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function reliefLines(claims, caps, { spouseHasIncome }) {
  const lines = [];
  const unknown = [];
  lines.push({ relief: 'individual', claimedSen: caps.individual.capSen, allowedSen: caps.individual.capSen });
  for (const [name, raw] of Object.entries(claims || {})) {
    if (name === 'individual') continue;
    const cap = caps[name];
    if (!cap) { unknown.push(name); continue; }
    if ((name === 'spouse' || name === 'disabledSpouse') && spouseHasIncome) {
      lines.push({ relief: name, claimedSen: 0, allowedSen: 0, why: 'Spouse relief needs a spouse with no income or a joint assessment.' });
      continue;
    }
    if (PER_CHILD.has(name)) {
      const children = Math.floor(nonNegative(raw));
      lines.push({ relief: name, children, claimedSen: children * cap.perChildSen, allowedSen: children * cap.perChildSen });
      continue;
    }
    const claimed = toSen(nonNegative(raw));
    lines.push({ relief: name, claimedSen: claimed, allowedSen: Math.min(claimed, cap.capSen), capSen: cap.capSen });
  }
  return { lines, unknown };
}

export function malaysiaIncomeTax(args = {}) {
  const yearOfAssessment = String(args.yearOfAssessment || '').trim();
  if (!/^\d{4}$/.test(yearOfAssessment)) return fail('BAD_YEAR_OF_ASSESSMENT', { hint: 'Give the year of assessment, the calendar year whose income is taxed, e.g. 2025.' });
  const resident = args.resident !== false;
  const incomes = args.income && typeof args.income === 'object' ? args.income : {};
  const grossSen = Object.values(incomes).reduce((sum, value) => sum + toSen(nonNegative(value)), 0);
  const zakatSen = toSen(nonNegative(args.zakat));
  const pcbPaidSen = toSen(nonNegative(args.monthlyTaxDeductionsPaid));
  const used = [];
  if (!resident) {
    const flat = ruleFor('my.income-tax.non-resident-rate', yearOfAssessment);
    if (!flat) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.income-tax.non-resident-rate', yearOfAssessment });
    used.push(flat);
    const chargeableSen = grossSen;
    const flatOut = flatTax(chargeableSen, flat.value.basisPoints);
    if (!flatOut.ok) return badBands(flat.id);
    const taxSen = flatOut.tax;
    return finish({ yearOfAssessment, resident, grossSen, reliefs: [], unknownReliefs: [], chargeableSen, bandTaxSen: taxSen, rebateSen: 0, zakatSen, pcbPaidSen, used });
  }
  const bands = ruleFor('my.income-tax.resident-bands', yearOfAssessment);
  const rebate = ruleFor('my.income-tax.rebate', yearOfAssessment);
  const caps = ruleFor('my.income-tax.reliefs', yearOfAssessment);
  for (const [id, found] of [['my.income-tax.resident-bands', bands], ['my.income-tax.rebate', rebate], ['my.income-tax.reliefs', caps]]) {
    if (!found) return fail('RULE_NOT_IN_FORCE', { ruleId: id, yearOfAssessment, hint: 'MyCA has no attested figures for that year of assessment yet.' });
  }
  used.push(bands, rebate, caps);
  const { lines, unknown } = reliefLines(args.reliefs, caps.value, { spouseHasIncome: args.spouseHasIncome !== false });
  const reliefSen = lines.reduce((sum, line) => sum + line.allowedSen, 0);
  const chargeableSen = Math.max(0, grossSen - reliefSen);
  const taxBeforeRebateSen = bandTaxSen(chargeableSen, bands.value.bands);
  if (taxBeforeRebateSen === null) return badBands(bands.id);
  let rebateSen = 0;
  if (chargeableSen <= rebate.value.chargeableIncomeAtMostSen) {
    rebateSen += rebate.value.selfSen;
    if (args.spouseHasIncome === false && lines.some((line) => line.relief === 'spouse' && line.allowedSen > 0)) rebateSen += rebate.value.spouseSen;
  }
  return finish({ yearOfAssessment, resident, grossSen, reliefs: lines, unknownReliefs: unknown, chargeableSen, bandTaxSen: taxBeforeRebateSen, rebateSen, zakatSen, pcbPaidSen, used });
}

function finish({ yearOfAssessment, resident, grossSen, reliefs, unknownReliefs, chargeableSen, bandTaxSen: bandSen, rebateSen, zakatSen, pcbPaidSen, used }) {
  const afterRebateSen = Math.max(0, bandSen - rebateSen);
  const zakatAllowedSen = Math.min(zakatSen, afterRebateSen);
  const taxPayableSen = afterRebateSen - zakatAllowedSen;
  const balanceSen = taxPayableSen - pcbPaidSen;
  return {
    ok: true,
    data: {
      yearOfAssessment,
      resident,
      form: resident ? 'Form BE (no business income) or Form B (with business income), filed in MyTax e-Filing' : 'Form M, filed in MyTax e-Filing',
      totalIncome: toRinggit(grossSen),
      reliefs: reliefs.map((line) => ({ ...line, claimed: toRinggit(line.claimedSen), allowed: toRinggit(line.allowedSen) })),
      unknownReliefs,
      totalReliefs: toRinggit(reliefs.reduce((sum, line) => sum + line.allowedSen, 0)),
      chargeableIncome: toRinggit(chargeableSen),
      taxOnChargeableIncome: toRinggit(bandSen),
      rebate: toRinggit(rebateSen),
      zakat: toRinggit(Math.min(zakatSen, Math.max(0, bandSen - rebateSen))),
      taxPayable: toRinggit(taxPayableSen),
      monthlyTaxDeductionsPaid: toRinggit(pcbPaidSen),
      balance: toRinggit(balanceSen),
      outcome: balanceSen > 0 ? 'to pay' : balanceSen < 0 ? 'refund due' : 'nothing due',
      rules: used.map((record) => ({ id: record.id, effectiveFrom: record.effectiveFrom, source: record.source })),
      unreviewed: used.some((record) => !(record.attestations || []).length),
      filing: 'LHDN has no third-party filing API for individual returns. MyCA prepares the figures; the taxpayer signs in to MyTax (mytax.hasil.gov.my) and files e-BE, e-B or e-M.',
    },
  };
}
