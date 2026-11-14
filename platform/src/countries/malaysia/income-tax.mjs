import { rules } from '../../sprint-load.mjs';
import { progressiveTax, flatTax } from '../kit/index.mjs';

const SEN_PER_RINGGIT = 100;
const MAX_SEN = 1e15;
const MAX_CHILDREN = 30;
const toSen = (ringgit) => Math.round(Number(ringgit) * SEN_PER_RINGGIT);
const badBands = (ruleId) => fail('BAD_BANDS', { ruleId, hint: 'The rule record is not a valid band table; fix the statutory rule.' });
const toRinggit = (sen) => Math.round(sen) / SEN_PER_RINGGIT;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

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

function amountProblem(field, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean' || (typeof raw === 'string' && !/^\s*-?\d+(?:\.\d+)?\s*$/.test(raw))) return { field, why: 'a number of ringgit' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { field, why: 'a number of ringgit' };
  if (value < 0) return { field, why: 'zero or more; a negative amount is never allowed' };
  if (value * SEN_PER_RINGGIT > MAX_SEN) return { field, why: 'too large to be a real amount' };
  return null;
}

function amountSen(raw) {
  return raw === undefined || raw === null || raw === '' ? 0 : toSen(raw);
}

function inputProblems(args) {
  const problems = [];
  if (args.income !== undefined && !isPlainObject(args.income)) problems.push({ field: 'income', why: 'an object of income amounts by kind, for example { employment: 60000 }' });
  if (args.reliefs !== undefined && args.reliefs !== null && !isPlainObject(args.reliefs)) problems.push({ field: 'reliefs', why: 'an object of relief claims by name' });
  for (const [name, raw] of Object.entries(isPlainObject(args.income) ? args.income : {})) {
    const problem = amountProblem(`income.${name}`, raw);
    if (problem) problems.push(problem);
  }
  for (const [name, raw] of Object.entries(isPlainObject(args.reliefs) ? args.reliefs : {})) {
    const problem = amountProblem(`reliefs.${name}`, raw);
    if (problem) problems.push(problem);
  }
  for (const field of ['zakat', 'monthlyTaxDeductionsPaid']) {
    const problem = amountProblem(field, args[field]);
    if (problem) problems.push(problem);
  }
  if (args.resident !== undefined && typeof args.resident !== 'boolean') problems.push({ field: 'resident', why: 'true or false' });
  if (args.spouseHasIncome !== undefined && typeof args.spouseHasIncome !== 'boolean') problems.push({ field: 'spouseHasIncome', why: 'true or false' });
  return problems;
}

function reliefLines(claims, caps, { spouseHasIncome }) {
  const lines = [];
  const unknown = [];
  const problems = [];
  lines.push({ relief: 'individual', claimedSen: caps.individual.capSen, allowedSen: caps.individual.capSen, capSen: caps.individual.capSen, why: 'Given to every resident individual.' });
  for (const [name, raw] of Object.entries(claims || {})) {
    if (name === 'individual') continue;
    const cap = Object.hasOwn(caps, name) ? caps[name] : null;
    if (!cap) { unknown.push(name); continue; }
    if ((name === 'spouse' || name === 'disabledSpouse') && spouseHasIncome) {
      lines.push({ relief: name, claimedSen: amountSen(raw), allowedSen: 0, capSen: cap.capSen, why: 'Spouse relief needs a spouse with no income or a joint assessment.' });
      continue;
    }
    if (cap.perChildSen !== undefined) {
      const count = Number(raw ?? 0);
      if (!Number.isInteger(count) || count > MAX_CHILDREN) { problems.push({ field: `reliefs.${name}`, why: `the number of children, a whole number from 0 to ${MAX_CHILDREN}` }); continue; }
      lines.push({ relief: name, children: count, claimedSen: count * cap.perChildSen, allowedSen: count * cap.perChildSen, perChildSen: cap.perChildSen });
      continue;
    }
    const claimed = amountSen(raw);
    lines.push({ relief: name, claimedSen: claimed, allowedSen: Math.min(claimed, cap.capSen), capSen: cap.capSen, ...(cap.within ? { within: cap.within } : {}) });
  }
  const groups = new Map();
  for (const line of lines) {
    const parent = line.within || (lines.some((other) => other.within === line.relief) ? line.relief : '');
    if (!parent) continue;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(line);
  }
  for (const [parent, members] of groups) {
    const capSen = caps[parent].capSen;
    let room = capSen;
    for (const line of members) {
      const take = Math.min(line.allowedSen, room);
      if (take < line.allowedSen) line.why = `${parent} reliefs together are capped at RM${(capSen / 100).toLocaleString('en-MY')}.`;
      line.allowedSen = take;
      room -= take;
    }
  }
  return { lines, unknown, problems };
}

export function malaysiaIncomeTax(args = {}) {
  if (!isPlainObject(args)) return fail('BAD_ARGUMENTS');
  const yearOfAssessment = String(args.yearOfAssessment ?? '').trim();
  if (!/^\d{4}$/.test(yearOfAssessment)) return fail('BAD_YEAR_OF_ASSESSMENT', { hint: 'Give the year of assessment, the calendar year whose income is taxed, e.g. 2025.' });
  if (args.income === undefined || args.income === null) return fail('INCOME_REQUIRED', { hint: 'Give income as an object, for example { employment: 60000 }; give {} for no income.' });
  const problems = inputProblems(args);
  if (problems.length) return fail('BAD_AMOUNTS', { problems });
  const resident = args.resident !== false;
  const grossSen = Object.values(args.income).reduce((sum, value) => sum + amountSen(value), 0);
  if (grossSen > MAX_SEN) return fail('BAD_AMOUNTS', { problems: [{ field: 'income', why: 'too large to be a real amount' }] });
  const zakatSen = amountSen(args.zakat);
  const pcbPaidSen = amountSen(args.monthlyTaxDeductionsPaid);
  const used = [];
  if (!resident) {
    const flat = ruleFor('my.income-tax.non-resident-rate', yearOfAssessment);
    if (!flat) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.income-tax.non-resident-rate', yearOfAssessment, hint: 'MyCA has no figures for that year of assessment yet.' });
    used.push(flat);
    const refused = Object.keys(isPlainObject(args.reliefs) ? args.reliefs : {}).filter((name) => amountSen(args.reliefs[name]) > 0);
    if (zakatSen > 0) refused.push('zakat');
    const flatOut = flatTax(grossSen, flat.value.basisPoints);
    if (!flatOut.ok) return badBands(flat.id);
    return finish({ yearOfAssessment, resident, grossSen, reliefs: [], unknownReliefs: [], refusedReliefs: refused, chargeableSen: grossSen, bandTaxSen: flatOut.tax, rebateSen: 0, zakatSen: 0, pcbPaidSen, used });
  }
  const bands = ruleFor('my.income-tax.resident-bands', yearOfAssessment);
  const rebate = ruleFor('my.income-tax.rebate', yearOfAssessment);
  const caps = ruleFor('my.income-tax.reliefs', yearOfAssessment);
  for (const [id, found] of [['my.income-tax.resident-bands', bands], ['my.income-tax.rebate', rebate], ['my.income-tax.reliefs', caps]]) {
    if (!found) return fail('RULE_NOT_IN_FORCE', { ruleId: id, yearOfAssessment, hint: 'MyCA has no figures for that year of assessment yet.' });
  }
  used.push(bands, rebate, caps);
  const { lines, unknown, problems: reliefProblems } = reliefLines(args.reliefs, caps.value, { spouseHasIncome: args.spouseHasIncome !== false });
  if (reliefProblems.length) return fail('BAD_AMOUNTS', { problems: reliefProblems });
  const reliefSen = lines.reduce((sum, line) => sum + line.allowedSen, 0);
  const chargeableSen = Math.max(0, grossSen - reliefSen);
  const taxBeforeRebateSen = bandTaxSen(chargeableSen, bands.value.bands);
  if (taxBeforeRebateSen === null) return badBands(bands.id);
  let rebateSen = 0;
  if (chargeableSen <= rebate.value.chargeableIncomeAtMostSen) {
    rebateSen += rebate.value.selfSen;
    if (args.spouseHasIncome === false && lines.some((line) => line.relief === 'spouse' && line.allowedSen > 0)) rebateSen += rebate.value.spouseSen;
  }
  return finish({ yearOfAssessment, resident, grossSen, reliefs: lines, unknownReliefs: unknown, refusedReliefs: [], chargeableSen, bandTaxSen: taxBeforeRebateSen, rebateSen, zakatSen, pcbPaidSen, used });
}

function finish({ yearOfAssessment, resident, grossSen, reliefs, unknownReliefs, refusedReliefs, chargeableSen, bandTaxSen: bandSen, rebateSen, zakatSen, pcbPaidSen, used }) {
  const rebateAllowedSen = Math.min(rebateSen, bandSen);
  const afterRebateSen = bandSen - rebateAllowedSen;
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
      refusedReliefs,
      ...(refusedReliefs.length ? { reliefsWhy: 'A non-resident individual gets no personal reliefs, no RM400 rebate and no zakat rebate (section 6A rebates are for residents); tax is a flat rate on chargeable income.' } : {}),
      totalReliefs: toRinggit(reliefs.reduce((sum, line) => sum + line.allowedSen, 0)),
      chargeableIncome: toRinggit(chargeableSen),
      taxOnChargeableIncome: toRinggit(bandSen),
      rebate: toRinggit(rebateAllowedSen),
      rebateEntitled: toRinggit(rebateSen),
      zakat: toRinggit(zakatAllowedSen),
      zakatNotUsed: toRinggit(zakatSen - zakatAllowedSen),
      taxPayable: toRinggit(taxPayableSen),
      monthlyTaxDeductionsPaid: toRinggit(pcbPaidSen),
      balance: toRinggit(balanceSen),
      outcome: balanceSen > 0 ? 'to pay' : balanceSen < 0 ? 'refund due' : 'nothing due',
      rules: used.map((record) => ({ id: record.id, effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo, source: record.source, attested: (record.attestations || []).length > 0 })),
      unreviewed: used.some((record) => !(record.attestations || []).length),
      filing: 'LHDN has no third-party filing API for individual returns. MyCA prepares the figures; the taxpayer signs in to MyTax (mytax.hasil.gov.my) and files e-BE, e-B or e-M.',
    },
  };
}
