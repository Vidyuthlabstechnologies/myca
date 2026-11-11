import { performExternalAction } from './action-gate.mjs';
import { normalizeClientId } from './books.mjs';
import { incomeTax, rules } from './sprint-load.mjs';
import { localToday } from './dates.mjs';
import { periodSummary } from './period-summary.mjs';
import { creditsToDate } from './advance-tax.mjs';
import { findTaxGuidance, loadTaxModule, rupees, taxModuleCatalog } from './tax-modules.mjs';
import { countryOf, countryPack } from './country.mjs';
import { countryKnowledge, searchCountryKnowledge } from './countries/knowledge.mjs';
import { itrGuidanceSections } from './itr-knowledge.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FY_LABEL = /^\d{4}-\d{2}$/;
const AGE_BANDS = new Set(['below-60', '60-to-79', '80-plus']);
const MAX_CONTEXT = 9000;
const ROUNDING_TOLERANCE_PAISE = 1000;
const TURNOVER_TOLERANCE_PAISE = 100000;
const DISCLAIMER = 'Reference only, not tax advice: confirm with your CA before you file.';
const US_DISCLAIMER = 'Reference only, not tax advice: confirm with your CPA or enrolled agent before you file.';
const ADVISERS = { IN: 'CA', US: 'CPA', MY: 'tax agent' };
const adviserFor = (jurisdiction) => ADVISERS[jurisdiction] || 'tax adviser';
const disclaimerFor = (jurisdiction) => (jurisdiction === 'US' ? US_DISCLAIMER : jurisdiction === 'IN' || !jurisdiction ? DISCLAIMER : `Reference only, not tax advice: confirm with your ${adviserFor(jurisdiction)} before you file.`);
const hasTaxModules = (jurisdiction) => jurisdiction === 'IN' || jurisdiction === 'US';
const INTERNAL_NOTES = /^(summary|licen[cs]es|data|payments|ready-made|open questions)\b|technical facts/i;
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function countryGuidanceSections(country, question, { limit = 3 } = {}) {
  const hits = searchCountryKnowledge(country, question, { limit: 12 }).filter((hit) => !INTERNAL_NOTES.test(hit.heading) && hit.matched >= 2);
  const top = hits[0]?.matched || 0;
  return hits
    .filter((hit) => hit.matched >= top / 2)
    .map((hit) => ({
      module: `${country.toLowerCase()}-knowledge`,
      id: slug(hit.heading),
      ref: `${country.toLowerCase()}-knowledge/${slug(hit.heading)}`,
      title: hit.heading,
      source: hit.sources.slice(0, 3).join(', ') || `MyCA's research notes for ${countryPack(country).name}, checked ${hit.checked}`,
      keywords: [],
      text: hit.text,
      rules: [],
      unresolved: [],
      attested: hit.attested,
      score: hit.matched,
      kind: 'country-knowledge',
    }))
    .slice(0, limit);
}

export function countryModuleCatalog(country) {
  const knowledge = countryKnowledge(country);
  if (!knowledge) return [];
  const name = `${country.toLowerCase()}-knowledge`;
  return [{ name, description: `MyCA's sourced research notes for ${countryPack(country).name}, checked ${knowledge.checked}`, domain: 'country-knowledge', jurisdiction: country, version: knowledge.checked, reviewStatus: knowledge.attested ? 'reviewed' : 'not yet signed off', sections: knowledge.sections.filter((section) => !INTERNAL_NOTES.test(section.heading)).map((section) => ({ id: slug(section.heading), title: section.heading })), tools: [] }];
}

const catalogFor = (jurisdiction) => (hasTaxModules(jurisdiction) ? taxModuleCatalog(jurisdiction) : countryModuleCatalog(jurisdiction));
const INCOME_RULES = ['income-tax.new-regime.slabs', 'income-tax.new-regime.rebate', 'income-tax.old-regime.rebate', 'income-tax.new-regime.standard-deduction', 'income-tax.old-regime.standard-deduction', 'income-tax.deduction.80c.cap', 'income-tax.deduction.80d.caps', 'income-tax.surcharge.individual', 'income-tax.cess.health-education'];
const SEVERITY_ORDER = { error: 0, risk: 1, saving: 2, check: 3 };

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

const toPaise = (rupeesValue) => Math.round((Number(rupeesValue) || 0) * 100);
const toRupees = (paise) => Math.round(Number(paise || 0)) / 100;
const given = (value) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));

function fyStartOf(fy) {
  return `${fy.slice(0, 4)}-04-01`;
}

function fyRange(fy) {
  return { from: fyStartOf(fy), to: `${Number(fy.slice(0, 4)) + 1}-03-31`, label: fy, start: Number(fy.slice(0, 4)) };
}

function previousFy(fy) {
  const start = Number(fy.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function fyArg(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return { ok: true, fy: fallback };
  if (!FY_LABEL.test(text)) return fail('FY_INVALID', { hint: 'Use a financial year like 2025-26.' });
  return { ok: true, fy: text };
}

function citation(id, onDate) {
  const found = rules.rule(id, onDate);
  if (!found.ok) return { ruleId: id, error: found.error };
  const record = found.record;
  return { ruleId: id, act: record.act, section: record.section, source: record.source, effectiveFrom: record.effectiveFrom, attested: (record.attestations || []).some((item) => item.verdict === 'verified') };
}

function profileOf(args = {}) {
  const ageBand = AGE_BANDS.has(args.ageBand) ? args.ageBand : 'below-60';
  return {
    ageBand,
    salaryPaise: Math.max(0, toPaise(args.salary)),
    otherIncomePaise: Math.max(0, toPaise(args.otherIncome)),
    businessIncomePaise: given(args.businessIncome) ? Math.max(0, toPaise(args.businessIncome)) : null,
    claims: {
      section80CPaise: Math.max(0, toPaise(args.section80C)),
      healthInsuranceSelfAndFamilyPaise: Math.max(0, toPaise(args.health80DSelf)),
      healthInsuranceParentsPaise: Math.max(0, toPaise(args.health80DParents)),
      selfAndFamilyIncludesSenior: args.selfSenior === true || ageBand !== 'below-60',
      parentsIncludeSenior: args.parentsSenior === true,
    },
  };
}

function computeRegime(fy, regime, profile, businessPaise, extraDeductionPaise = 0) {
  const nonSalary = profile.otherIncomePaise + businessPaise;
  const fromOther = Math.min(nonSalary, extraDeductionPaise);
  return incomeTax.computeIncomeTax({
    fy,
    regime,
    ageBand: profile.ageBand,
    residentIndividual: true,
    salaryPaise: Math.max(0, profile.salaryPaise - (extraDeductionPaise - fromOther)),
    otherIncomePaise: nonSalary - fromOther,
    claims: profile.claims,
  });
}

function figures(computed) {
  return {
    grossTotalIncome: toRupees(computed.grossTotalIncomePaise),
    standardDeduction: toRupees(computed.standardDeductionPaise),
    section80C: toRupees(computed.section80CPaise),
    section80D: toRupees(computed.section80DPaise),
    totalIncome: toRupees(computed.totalIncomePaise),
    slabTax: toRupees(computed.slabTaxPaise),
    rebate: toRupees(computed.rebatePaise),
    surcharge: toRupees(computed.surchargePaise),
    cess: toRupees(computed.cessPaise),
    taxPayable: toRupees(computed.taxPayablePaise),
  };
}

export function presumptiveIncome(fy, { turnover, digitalReceipts, cashReceipts, profession = false } = {}) {
  if (!given(turnover)) return null;
  const onDate = fyStartOf(fy);
  const id = profession ? 'income-tax.presumptive.profession' : 'income-tax.presumptive.business';
  const found = rules.rule(id, onDate);
  if (!found.ok) return { ok: false, error: found.error, ruleId: id };
  const rule = found.value;
  const turnoverPaise = Math.max(0, toPaise(turnover));
  const cashPaise = given(cashReceipts) ? Math.max(0, toPaise(cashReceipts)) : null;
  const cashPercent = cashPaise === null || !turnoverPaise ? null : (cashPaise * 100) / turnoverPaise;
  const low = rule.lowCash;
  const lowCash = cashPercent !== null && cashPercent <= low.cashReceiptsMaxPercent;
  const capPaise = profession ? (lowCash ? low.grossReceiptsCapPaise : rule.grossReceiptsCapPaise) : (lowCash ? low.turnoverCapPaise : rule.turnoverCapPaise);
  const eligible = turnoverPaise <= capPaise;
  let incomePaise;
  let digitalPaise = 0;
  if (profession) incomePaise = Math.round((turnoverPaise * rule.ratePercent) / 100);
  else {
    digitalPaise = Math.min(turnoverPaise, Math.max(0, toPaise(digitalReceipts)));
    incomePaise = Math.round((digitalPaise * rule.digitalReceiptsRatePercent) / 100 + ((turnoverPaise - digitalPaise) * rule.otherReceiptsRatePercent) / 100);
  }
  const notes = [];
  if (cashPercent === null && turnoverPaise > (profession ? rule.grossReceiptsCapPaise : rule.turnoverCapPaise)) notes.push(`Cash receipts were not given, so the lower limit of ${rupees(capPaise)} was used; the higher limit needs cash receipts within ${low.cashReceiptsMaxPercent}% of turnover.`);
  if (!profession && !given(digitalReceipts)) notes.push(`Digital receipts were not given, so all turnover was taken at ${rule.otherReceiptsRatePercent}%; turnover received by bank or UPI by the return due date is taken at ${rule.digitalReceiptsRatePercent}%.`);
  return {
    ok: true,
    section: profession ? '44ADA' : '44AD',
    sectionUnder2025Act: profession ? '58(2) Table Sl. No. 3' : '58(2) Table Sl. No. 1',
    turnover: toRupees(turnoverPaise),
    digitalReceipts: toRupees(digitalPaise),
    cashReceiptsPercent: cashPercent === null ? null : Math.round(cashPercent * 100) / 100,
    cap: toRupees(capPaise),
    eligible,
    income: eligible ? toRupees(incomePaise) : null,
    incomePaise: eligible ? incomePaise : null,
    notes,
    citation: citation(id, onDate),
  };
}

function breakEven(fy, profile, businessPaise, newTaxPaise) {
  const oldAt = (extra) => computeRegime(fy, 'old', profile, businessPaise, extra);
  const base = oldAt(0);
  if (base.error || base.taxPayablePaise <= newTaxPaise) return { needed: 0 };
  const ceiling = profile.salaryPaise + profile.otherIncomePaise + businessPaise;
  if (oldAt(ceiling).taxPayablePaise > newTaxPaise) return { needed: null };
  let low = 0;
  let high = Math.ceil(ceiling / 100);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (oldAt(mid * 100).taxPayablePaise <= newTaxPaise) high = mid;
    else low = mid + 1;
  }
  return { needed: low * 100 };
}

function headroomOf(fy, profile) {
  const onDate = fyStartOf(fy);
  const cap80c = rules.rule('income-tax.deduction.80c.cap', onDate);
  const caps80d = rules.rule('income-tax.deduction.80d.caps', onDate);
  if (!cap80c.ok || !caps80d.ok) return null;
  const groupCap = (senior) => Math.min(senior ? caps80d.value.seniorInsuranceMaxPaise : caps80d.value.insuranceMaxPaise, caps80d.value.groupMaxPaise);
  const c = Math.max(0, cap80c.value.maxPaise - profile.claims.section80CPaise);
  const self = Math.max(0, groupCap(profile.claims.selfAndFamilyIncludesSenior) - profile.claims.healthInsuranceSelfAndFamilyPaise);
  const parents = Math.max(0, groupCap(profile.claims.parentsIncludeSenior) - profile.claims.healthInsuranceParentsPaise);
  return { section80CPaise: c, section80DSelfPaise: self, section80DParentsPaise: parents, totalPaise: c + self + parents };
}

function withFullHeadroom(profile, headroom) {
  return { ...profile, claims: { ...profile.claims, section80CPaise: profile.claims.section80CPaise + headroom.section80CPaise, healthInsuranceSelfAndFamilyPaise: profile.claims.healthInsuranceSelfAndFamilyPaise + headroom.section80DSelfPaise, healthInsuranceParentsPaise: profile.claims.healthInsuranceParentsPaise + headroom.section80DParentsPaise } };
}

function rebateNote(fy, computed) {
  const found = rules.rule('income-tax.new-regime.rebate', fyStartOf(fy));
  if (!found.ok) return '';
  const limit = found.value.maxTotalIncomePaise;
  const over = computed.totalIncomePaise - limit;
  if (computed.rebatePaise > 0 && over > 0) return `Total income is ${rupees(over)} above the new-regime rebate limit of ${rupees(limit)}; marginal relief of ${rupees(computed.rebatePaise)} keeps the tax from exceeding that excess.`;
  if (computed.rebatePaise === 0 && over > 0 && computed.slabTaxPaise > 0 && over <= limit / 10) return `Total income is ${rupees(over)} above the new-regime rebate limit of ${rupees(limit)}; every rupee of deduction the new regime allows (such as employer NPS under 80CCD(2)) brings it nearer the limit.`;
  return '';
}

function businessIncomeFor(fy, args, profile, usePresumptive = true) {
  const presumptive = usePresumptive && given(args.turnover) ? presumptiveIncome(fy, { turnover: args.turnover, digitalReceipts: args.digitalReceipts, cashReceipts: args.cashReceipts, profession: args.profession === true }) : null;
  if (presumptive && !presumptive.ok) return { error: presumptive };
  if (profile.businessIncomePaise !== null) return { businessPaise: profile.businessIncomePaise, presumptive, basis: 'business income as given' };
  if (presumptive?.eligible) return { businessPaise: presumptive.incomePaise, presumptive, basis: `presumptive income under ${presumptive.section}` };
  return { businessPaise: 0, presumptive, basis: '' };
}

function guidanceRefs(ids) {
  return ids.map(([module, id]) => `${module}/${id}`);
}

export function taxPlan(state, args = {}) {
  const today = ISO_DATE.test(String(args.asOf || '')) ? args.asOf : localToday();
  const fyArgResult = fyArg(args.fy, rules.fyOf(today));
  if (!fyArgResult.ok) return fyArgResult;
  const fy = fyArgResult.fy;
  const profile = profileOf(args);
  const business = businessIncomeFor(fy, args, profile);
  if (business.error) return business.error;
  const { businessPaise, presumptive } = business;
  if (!profile.salaryPaise && !profile.otherIncomePaise && !businessPaise) return fail('INCOME_REQUIRED', { hint: 'Give salary, business income, turnover or other income for the year.' });
  const computedNew = computeRegime(fy, 'new', profile, businessPaise);
  const computedOld = computeRegime(fy, 'old', profile, businessPaise);
  if (computedNew.error) return fail(computedNew.error, { ruleId: computedNew.ruleId, fy });
  if (computedOld.error) return fail(computedOld.error, { ruleId: computedOld.ruleId, fy });
  const recommended = computedOld.taxPayablePaise < computedNew.taxPayablePaise ? 'old' : 'new';
  const savingPaise = Math.abs(computedOld.taxPayablePaise - computedNew.taxPayablePaise);
  const hasBusiness = businessPaise > 0;
  const headroom = headroomOf(fy, profile);
  const ideas = [];
  if (recommended === 'new' && headroom) {
    const even = breakEven(fy, profile, businessPaise, computedNew.taxPayablePaise);
    if (even.needed === null) ideas.push({ code: 'OLD_REGIME_NOT_REACHABLE', text: 'No amount of old-regime deductions makes the old regime cheaper on these figures.' });
    else if (even.needed > 0) {
      const reachable = even.needed <= headroom.totalPaise;
      ideas.push({ code: 'OLD_REGIME_BREAK_EVEN', neededDeductions: toRupees(even.needed), headroom: toRupees(headroom.totalPaise), reachable, text: `The old regime would cost the same only with ${rupees(even.needed)} more of old-regime deductions (80C, 80D, home loan interest and the like)${reachable ? `; the unused 80C and 80D limits alone (${rupees(headroom.totalPaise)}) would cover that` : `, more than the ${rupees(headroom.totalPaise)} left under 80C and 80D`}.` });
    }
  }
  if (recommended === 'old' && headroom && headroom.totalPaise > 0) {
    const fuller = computeRegime(fy, 'old', withFullHeadroom(profile, headroom), businessPaise);
    if (!fuller.error && fuller.taxPayablePaise < computedOld.taxPayablePaise) ideas.push({ code: 'OLD_REGIME_HEADROOM', headroom: toRupees(headroom.totalPaise), saving: toRupees(computedOld.taxPayablePaise - fuller.taxPayablePaise), text: `${rupees(headroom.totalPaise)} of 80C and 80D limits is unused; using all of it would lower old-regime tax by ${rupees(computedOld.taxPayablePaise - fuller.taxPayablePaise)}.` });
  }
  const cliff = rebateNote(fy, computedNew);
  if (cliff) ideas.push({ code: 'REBATE_EDGE', text: cliff });
  if (presumptive && presumptive.ok) {
    if (!presumptive.eligible) ideas.push({ code: 'PRESUMPTIVE_NOT_AVAILABLE', text: `Turnover of ${rupees(toPaise(presumptive.turnover))} is above the ${presumptive.section} limit of ${rupees(toPaise(presumptive.cap))}, so presumptive income is not available; tax is on actual profit with books kept.` });
    else if (given(args.actualProfit)) {
      const actualPaise = Math.max(0, toPaise(args.actualProfit));
      if (actualPaise < presumptive.incomePaise) ideas.push({ code: 'PRESUMPTIVE_ABOVE_ACTUAL', text: `Presumptive income ${rupees(presumptive.incomePaise)} is above the actual profit of ${rupees(actualPaise)}. Declaring the actual profit instead needs books and, when total income exceeds the basic exemption, a tax audit; and if presumptive income was declared in any of the last five years, it shuts the scheme for the next five.` });
      else ideas.push({ code: 'PRESUMPTIVE_BELOW_ACTUAL', saving: toRupees(actualPaise - presumptive.incomePaise), text: `Presumptive income ${rupees(presumptive.incomePaise)} is ${rupees(actualPaise - presumptive.incomePaise)} below the actual profit of ${rupees(actualPaise)}, with no books or audit needed for it.` });
    }
    if (!given(args.digitalReceipts) && !args.profession && presumptive.eligible) ideas.push({ code: 'DIGITAL_RECEIPTS', text: 'Turnover received by bank transfer, UPI or account-payee cheque by the return due date is presumed at 6% instead of 8%: say how much was received that way to lower the presumptive income.' });
  }
  const regimeRule = hasBusiness
    ? 'With business or professional income, leaving the new regime needs Form 10-IEA by the return due date, and coming back to it is allowed only once.'
    : 'Without business income, the regime is chosen afresh each year in the return.';
  const onDate = fyStartOf(fy);
  const citations = [...INCOME_RULES, ...(presumptive?.ok ? [presumptive.section === '44ADA' ? 'income-tax.presumptive.profession' : 'income-tax.presumptive.business'] : [])].map((id) => citation(id, onDate));
  return {
    ok: true,
    data: {
      forCA: true,
      fy,
      ageBand: profile.ageBand,
      income: { salary: toRupees(profile.salaryPaise), business: toRupees(businessPaise), businessBasis: business.basis, other: toRupees(profile.otherIncomePaise) },
      presumptive: presumptive && presumptive.ok ? presumptive : null,
      regimes: { new: figures(computedNew), old: figures(computedOld) },
      recommended,
      saving: toRupees(savingPaise),
      regimeRule,
      ideas,
      headroom: headroom ? { section80C: toRupees(headroom.section80CPaise), section80DSelf: toRupees(headroom.section80DSelfPaise), section80DParents: toRupees(headroom.section80DParentsPaise) } : null,
      next: hasBusiness ? 'Run advance_tax to split the tax into instalments from the books.' : '',
      guidance: guidanceRefs([['india-income-tax-individuals', 'regimes'], ['india-income-tax-individuals', 'rebate-87a'], ['india-income-tax-individuals', 'deductions-80c-80d'], ...(presumptive ? [['india-presumptive-income', 'presumptive-business'], ['india-presumptive-income', 'lower-profit']] : [])]),
      citations,
      unattested: citations.filter((item) => !item.attested).map((item) => item.ruleId),
      disclaimer: DISCLAIMER,
    },
  };
}

function finding(code, severity, title, why, { impact = 0, ruleId = '', fy, guide = '' } = {}) {
  return { code, severity, title, why, impact: Math.round(Number(impact || 0) * 100) / 100, source: ruleId ? citation(ruleId, fyStartOf(fy)) : null, guide };
}

function compareClaim(findings, { claimed, computed, code, label, fy, ruleId, guide, higherIs }) {
  if (!given(claimed)) return;
  const claimedPaise = toPaise(claimed);
  const diff = claimedPaise - computed;
  if (Math.abs(diff) <= ROUNDING_TOLERANCE_PAISE) return;
  const higher = diff > 0;
  const severity = higher ? higherIs : (higherIs === 'risk' ? 'saving' : 'risk');
  findings.push(finding(code, severity, `${label} ${higher ? 'is higher' : 'is lower'} than MyCA works out`, `The return shows ${rupees(claimedPaise)}; on the same figures MyCA's dated rules give ${rupees(computed)}, ${rupees(Math.abs(diff))} ${higher ? 'more' : 'less'}.`, { impact: toRupees(Math.abs(diff)), ruleId, fy, guide }));
}

export function booksGstTurnover(state, fy) {
  const range = fyRange(fy);
  let taxablePaise = 0;
  let taxPaise = 0;
  let months = 0;
  for (let index = 0; index < 12; index += 1) {
    const month = ((3 + index) % 12) + 1;
    const year = month >= 4 ? range.start : range.start + 1;
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const summary = periodSummary(state, period);
    if (!summary.ok || summary.data.period !== period || !summary.data.salesCount) continue;
    months += 1;
    taxablePaise += toPaise(summary.data.taxableSales);
    taxPaise += toPaise(summary.data.outputTax.total);
  }
  return { months, taxablePaise, taxPaise };
}

function gstTurnoverFinding(state, fy, args, presumptive) {
  if (!given(args.turnover)) return null;
  const books = booksGstTurnover(state, fy);
  if (!books.months) return null;
  const turnoverPaise = toPaise(args.turnover);
  const nonGstPaise = Math.max(0, toPaise(args.nonGstReceipts));
  const expected = books.taxablePaise + nonGstPaise;
  const diff = turnoverPaise - expected;
  const guide = 'india-presumptive-income/gst-turnover-match';
  const basis = `MyCA's books show ${rupees(books.taxablePaise)} of taxable sales (net of credit and debit notes) with ${rupees(books.taxPaise)} of GST across ${books.months} ${books.months === 1 ? 'month' : 'months'} of ${fy}${nonGstPaise ? `, plus ${rupees(nonGstPaise)} of non-GST receipts as given` : ''}`;
  if (Math.abs(diff) <= TURNOVER_TOLERANCE_PAISE) return finding('GST_TURNOVER_MATCHED', 'check', 'Turnover agrees with the GST figures', `${basis}; the return's turnover of ${rupees(turnoverPaise)} agrees.`, { fy, guide });
  if (books.taxPaise && Math.abs(turnoverPaise - (expected + books.taxPaise)) <= TURNOVER_TOLERANCE_PAISE) {
    const rate = presumptive?.ok ? (presumptive.section === '44ADA' ? 50 : 8) : 0;
    const impact = rate ? toRupees((books.taxPaise * rate) / 100) : 0;
    return finding('GST_INCLUSIVE_TURNOVER', 'saving', 'Turnover includes the GST collected', `${basis}. The return's turnover of ${rupees(turnoverPaise)} equals the figure with GST added. GST collected is not turnover${rate ? `, so presumptive income is overstated by ${rupees(toPaise(impact))}` : ''}.`, { impact, fy, guide });
  }
  if (diff < 0) return finding('TURNOVER_BELOW_GST', 'risk', 'Turnover is below the GST figures', `${basis}. The return's turnover of ${rupees(turnoverPaise)} is ${rupees(-diff)} lower. The Annual Information Statement carries the GST turnover from GSTR-3B, so keep the reason ready (a capital asset sale or a branch transfer in the GST figures, for example) or correct the turnover.`, { impact: toRupees(-diff), fy, guide });
  return finding('TURNOVER_ABOVE_GST', 'check', 'Turnover is above the GST figures', `${basis}. The return's turnover of ${rupees(turnoverPaise)} is ${rupees(diff)} higher. That is right only for exempt or non-GST supplies or sales before registration; give them as non-GST receipts, or tax is being paid on receipts that are not explained.`, { impact: toRupees(diff), fy, guide });
}

export function reviewIncomeTaxReturn(state, args = {}) {
  const today = ISO_DATE.test(String(args.asOf || '')) ? args.asOf : localToday();
  const fyArgResult = fyArg(args.fy, previousFy(rules.fyOf(today)));
  if (!fyArgResult.ok) return fyArgResult;
  const fy = fyArgResult.fy;
  const regime = args.regime === 'old' ? 'old' : args.regime === 'new' ? 'new' : null;
  if (!regime) return fail('REGIME_REQUIRED', { hint: 'Say which regime the return was prepared under: old or new.' });
  const profile = profileOf(args);
  const business = businessIncomeFor(fy, args, profile, args.presumptive === true);
  if (business.error) return business.error;
  const { businessPaise, presumptive } = business;
  if (!profile.salaryPaise && !profile.otherIncomePaise && !businessPaise) return fail('INCOME_REQUIRED', { hint: 'Give the salary, business income, turnover or other income shown in the return.' });
  const other = regime === 'new' ? 'old' : 'new';
  const asFiled = computeRegime(fy, regime, profile, businessPaise);
  const alternative = computeRegime(fy, other, profile, businessPaise);
  if (asFiled.error) return fail(asFiled.error, { ruleId: asFiled.ruleId, fy });
  if (alternative.error) return fail(alternative.error, { ruleId: alternative.ruleId, fy });
  const findings = [];
  const deductionsClaimed = profile.claims.section80CPaise + profile.claims.healthInsuranceSelfAndFamilyPaise + profile.claims.healthInsuranceParentsPaise;

  if (regime === 'new' && (deductionsClaimed > 0 || toPaise(args.claimedDeductions) > 0)) {
    findings.push(finding('DEDUCTIONS_IN_NEW_REGIME', 'error', '80C or 80D claimed under the new regime', `The return claims ${rupees(Math.max(deductionsClaimed, toPaise(args.claimedDeductions)))} of 80C and 80D deductions, which the new regime does not allow. MyCA left them out.`, { impact: toRupees(Math.max(deductionsClaimed, toPaise(args.claimedDeductions))), ruleId: 'income-tax.new-regime.slabs', fy, guide: 'india-income-tax-individuals/deductions-80c-80d' }));
  }
  if (regime === 'old') {
    if (profile.claims.section80CPaise > asFiled.section80CPaise) findings.push(finding('DEDUCTION_80C_OVER_CAP', 'error', '80C claimed above the limit', `The return claims ${rupees(profile.claims.section80CPaise)} under 80C; the limit for ${fy} is ${rupees(asFiled.section80CPaise)}.`, { impact: toRupees(profile.claims.section80CPaise - asFiled.section80CPaise), ruleId: 'income-tax.deduction.80c.cap', fy, guide: 'india-income-tax-individuals/deductions-80c-80d' }));
    const claimed80d = profile.claims.healthInsuranceSelfAndFamilyPaise + profile.claims.healthInsuranceParentsPaise;
    if (claimed80d > asFiled.section80DPaise) findings.push(finding('DEDUCTION_80D_OVER_CAP', 'error', '80D claimed above the limit', `The return claims ${rupees(claimed80d)} under 80D; the limits for ${fy} allow ${rupees(asFiled.section80DPaise)} on these facts.`, { impact: toRupees(claimed80d - asFiled.section80DPaise), ruleId: 'income-tax.deduction.80d.caps', fy, guide: 'india-income-tax-individuals/deductions-80c-80d' }));
  }
  if (profile.salaryPaise > 0) compareClaim(findings, { claimed: args.claimedStandardDeduction, computed: asFiled.standardDeductionPaise, code: 'STANDARD_DEDUCTION', label: 'The standard deduction', fy, ruleId: `income-tax.${regime}-regime.standard-deduction`, guide: 'india-income-tax-individuals/standard-deduction', higherIs: 'risk' });
  compareClaim(findings, { claimed: args.claimedTotalIncome, computed: asFiled.totalIncomePaise, code: 'TOTAL_INCOME', label: 'Total income', fy, ruleId: 'income-tax.rounding.total-income', guide: '', higherIs: 'saving' });
  if (given(args.claimedRebate)) {
    const claimedRebate = toPaise(args.claimedRebate);
    const marginal = asFiled.rebatePaise > 0 && claimedRebate === 0 && regime === 'new';
    if (marginal) findings.push(finding('REBATE_87A_MISSED', 'saving', 'The 87A rebate (or its marginal relief) was not claimed', `On total income of ${rupees(asFiled.totalIncomePaise)} the ${regime} regime allows a rebate of ${rupees(asFiled.rebatePaise)}${asFiled.totalIncomePaise > rules.rule('income-tax.new-regime.rebate', fyStartOf(fy)).value?.maxTotalIncomePaise ? ' through marginal relief, because income is only a little above the limit' : ''}; the return claims none.`, { impact: toRupees(asFiled.rebatePaise), ruleId: `income-tax.${regime}-regime.rebate`, fy, guide: 'india-income-tax-individuals/rebate-87a' }));
    else compareClaim(findings, { claimed: args.claimedRebate, computed: asFiled.rebatePaise, code: 'REBATE_87A', label: 'The 87A rebate', fy, ruleId: `income-tax.${regime}-regime.rebate`, guide: 'india-income-tax-individuals/rebate-87a', higherIs: 'risk' });
  }
  compareClaim(findings, { claimed: args.claimedTaxPayable, computed: asFiled.taxPayablePaise, code: 'TAX_PAYABLE', label: 'Tax payable', fy, ruleId: 'income-tax.rounding.tax-payable', guide: '', higherIs: 'saving' });

  if (alternative.taxPayablePaise < asFiled.taxPayablePaise) {
    const switchNote = businessPaise > 0 ? (other === 'old' ? ' With business income, moving to the old regime needs Form 10-IEA by the return due date.' : ' With business income, coming back to the new regime is allowed only once.') : ' Without business income the regime can be chosen in this return.';
    findings.push(finding('OTHER_REGIME_CHEAPER', 'saving', `The ${other} regime costs less`, `Tax is ${rupees(asFiled.taxPayablePaise)} under the ${regime} regime and ${rupees(alternative.taxPayablePaise)} under the ${other} regime on the same figures.${switchNote}`, { impact: toRupees(asFiled.taxPayablePaise - alternative.taxPayablePaise), ruleId: 'income-tax.new-regime.slabs', fy, guide: 'india-income-tax-individuals/regimes' }));
  }

  if (regime === 'old') {
    const headroom = headroomOf(fy, profile);
    if (headroom && headroom.totalPaise > 0) {
      const fuller = computeRegime(fy, 'old', withFullHeadroom(profile, headroom), businessPaise);
      if (!fuller.error && fuller.taxPayablePaise < asFiled.taxPayablePaise) findings.push(finding('DEDUCTION_HEADROOM', 'check', '80C or 80D limits are not used in full', `${rupees(headroom.totalPaise)} of the 80C and 80D limits is unused. If eligible payments were made in ${fy} and left out, claiming them would lower tax by up to ${rupees(asFiled.taxPayablePaise - fuller.taxPayablePaise)}.`, { impact: toRupees(asFiled.taxPayablePaise - fuller.taxPayablePaise), ruleId: 'income-tax.deduction.80c.cap', fy, guide: 'india-income-tax-individuals/deductions-80c-80d' }));
    }
  }

  const range = fyRange(fy);
  const credits = creditsToDate(state, range, range.to);
  if (given(args.claimedTds)) {
    const claimedTdsPaise = toPaise(args.claimedTds);
    const knownPaise = toPaise(credits.credits);
    if (knownPaise - claimedTdsPaise > ROUNDING_TOLERANCE_PAISE) findings.push(finding('TDS_CREDIT_UNCLAIMED', 'saving', 'TDS credit in the books is not claimed', `The return claims ${rupees(claimedTdsPaise)} of TDS; MyCA has ${rupees(knownPaise)} for ${fy} (${credits.source}). The difference is tax already paid that the return leaves out.`, { impact: toRupees(knownPaise - claimedTdsPaise), fy, guide: 'india-tds-business-payments/customer-tds-credit' }));
    else if (credits.tds26as > 0 && claimedTdsPaise - toPaise(credits.tds26as) > ROUNDING_TOLERANCE_PAISE) findings.push(finding('TDS_CLAIM_ABOVE_26AS', 'risk', 'TDS claimed is more than Form 26AS shows', `The return claims ${rupees(claimedTdsPaise)} of TDS; the imported Form 26AS shows ${rupees(toPaise(credits.tds26as))}. Credit above 26AS is usually denied when the return is processed, turning into a demand.`, { impact: toRupees(claimedTdsPaise - toPaise(credits.tds26as)), fy, guide: 'india-tds-business-payments/customer-tds-credit' }));
  }

  if (presumptive && presumptive.ok) {
    if (!presumptive.eligible) findings.push(finding('PRESUMPTIVE_NOT_AVAILABLE', 'error', `${presumptive.section} is not available at this turnover`, `Turnover of ${rupees(toPaise(presumptive.turnover))} is above the limit of ${rupees(toPaise(presumptive.cap))}, which takes the business out of the scheme; tax is on actual profit with books and a tax audit.`, { impact: 0, ruleId: presumptive.section === '44ADA' ? 'income-tax.presumptive.profession' : 'income-tax.presumptive.business', fy, guide: 'india-presumptive-income/presumptive-business' }));
    else if (profile.businessIncomePaise !== null && profile.businessIncomePaise < presumptive.incomePaise) findings.push(finding('BELOW_PRESUMPTIVE_PROFIT', 'risk', 'Profit declared is below the presumptive rate', `Business income of ${rupees(profile.businessIncomePaise)} is below the ${presumptive.section} figure of ${rupees(presumptive.incomePaise)}. Unless actual profit is shown with books, this needs books and a tax audit when total income exceeds the basic exemption, and may close the scheme for five years.`, { impact: toRupees(presumptive.incomePaise - profile.businessIncomePaise), ruleId: presumptive.section === '44ADA' ? 'income-tax.presumptive.profession' : 'income-tax.presumptive.business', fy, guide: 'india-presumptive-income/lower-profit' }));
  }
  const gst = gstTurnoverFinding(state, fy, args, presumptive);
  if (gst) findings.push(gst);

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact);
  const counts = Object.fromEntries(Object.keys(SEVERITY_ORDER).map((key) => [key, findings.filter((item) => item.severity === key).length]));
  const claimed = Object.fromEntries(['claimedStandardDeduction', 'claimedDeductions', 'claimedTotalIncome', 'claimedRebate', 'claimedTaxPayable', 'claimedTds'].filter((key) => given(args[key])).map((key) => [key, Number(args[key])]));
  const citations = INCOME_RULES.map((id) => citation(id, fyStartOf(fy)));
  return {
    ok: true,
    data: {
      forCA: true,
      fy,
      regime,
      asFiled: figures(asFiled),
      otherRegime: { regime: other, ...figures(alternative) },
      claimed,
      income: { salary: toRupees(profile.salaryPaise), business: toRupees(businessPaise), businessBasis: business.basis, other: toRupees(profile.otherIncomePaise) },
      tdsOnRecord: credits,
      findings,
      counts,
      clean: findings.every((item) => item.severity === 'check'),
      citations,
      unattested: citations.filter((item) => !item.attested).map((item) => item.ruleId),
      disclaimer: DISCLAIMER,
    },
  };
}

function numbersIn(text) {
  return [...String(text || '').matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => match[0].replace(/,/g, '').replace(/\.0+$/, '')).filter((value) => value.length >= 2);
}

export function ungroundedFigures(reply, context) {
  const known = new Set(numbersIn(context));
  return [...new Set(numbersIn(reply).filter((value) => !known.has(value)))];
}

export function taxPrompt(question, sections, onDate, jurisdiction = 'IN') {
  let context = '';
  for (const section of sections) {
    const block = `[${section.ref}] ${section.title}\nSource: ${section.source}\n${section.text}\n\n`;
    if (context.length + block.length > MAX_CONTEXT) break;
    context += block;
  }
  const disclaimer = disclaimerFor(jurisdiction);
  const tools = [...new Set([...sections.flatMap((section) => taxModuleCatalog().find((module) => module.name === section.module)?.tools || []), ...(sections.some((section) => section.module === 'itr-knowledge') ? ['itr_knowledge', 'check_itr_json'] : [])])];
  return {
    context,
    systemPrompt: [
      jurisdiction === 'US' ? `You are MyCA's tax assistant for individuals, small businesses and their CPAs in the United States, for federal income tax. The guidance below is current for ${onDate}.`
        : jurisdiction === 'IN' ? `You are MyCA's tax assistant for small businesses and their CAs in India. The guidance below is current for ${onDate}; items marked [itr-knowledge/...] come from the CBDT's AY 2025-26 ITR schemas, validation rules and MyCA's filing guides.`
          : `You are MyCA's tax assistant for small businesses and their ${adviserFor(jurisdiction)}s in ${countryPack(jurisdiction)?.name || jurisdiction}. The guidance below is MyCA's sourced research for that country only; never answer from another country's tax law.`,
      'Answer only from the guidance supplied, and put the reference in square brackets, such as [module/section], after each statement you take from it.',
      'Never state an amount, rate, date, limit or section number that is not in the guidance, and never calculate a tax figure; for a computation, name the MyCA tool that does it.',
      `MyCA tools for this topic: ${tools.join(', ') || 'none'}.`,
      `If the guidance does not answer the question, say so plainly and say what to ask the ${adviserFor(jurisdiction)}.`,
      `End with: "${disclaimer}"`,
    ].join(' '),
    prompt: `Guidance:\n${context}Question: ${question}`,
  };
}

function excerpt(text, limit = 900) {
  const paragraphs = String(text).split('\n\n');
  let out = paragraphs[0];
  for (const paragraph of paragraphs.slice(1)) {
    if (!out.endsWith(':') && out.length + paragraph.length > limit) break;
    out += `\n\n${paragraph}`;
  }
  return out;
}

function offlineAnswer(sections) {
  return sections.slice(0, 2).map((section) => `${section.title} [${section.ref}]:\n${excerpt(section.text)}`).join('\n\n');
}

export async function askTax(state, args = {}, actor) {
  const question = String(args.question || '').trim();
  if (question.length < 3) return fail('QUESTION_REQUIRED');
  const onDate = ISO_DATE.test(String(args.asOf || '')) ? args.asOf : localToday();
  const jurisdiction = countryOf(state);
  const disclaimer = disclaimerFor(jurisdiction);
  const moduleSections = hasTaxModules(jurisdiction) ? findTaxGuidance(question, { onDate, limit: 3, module: args.module ? String(args.module) : undefined, jurisdiction }) : countryGuidanceSections(jurisdiction, question);
  const itrSections = args.module || jurisdiction !== 'IN' ? [] : itrGuidanceSections(question, { limit: moduleSections.length ? 2 : 3 });
  const sections = [...moduleSections, ...itrSections];
  if (!sections.length) return { ok: true, question, onDate, sections, answered: false, jurisdiction, modules: catalogFor(jurisdiction).map((module) => ({ name: module.name, description: module.description })) };
  const built = taxPrompt(question, sections, onDate, jurisdiction);
  const result = await performExternalAction(state, {
    actionId: 'tax_answer',
    clientId: normalizeClientId(state.activeClientId),
    params: { question, onDate, sections: sections.map((section) => section.ref) },
    actor: actor || { userId: 'owner' },
    metadata: { sections: sections.length },
    payload: { question, sections: sections.length },
    fixture: () => ({ ok: true, mock: true, simulated: true, data: { reply: `${offlineAnswer(sections)}\n\n${disclaimer}`, model: 'mock' } }),
  }, async (transports) => {
    const out = await transports.nim.complete({ prompt: built.prompt, systemPrompt: built.systemPrompt, temperature: 0.1, maxTokens: 900 });
    if (!out.ok) return fail(out.error || 'MODEL_FAILED', { hint: out.hint });
    return { ok: true, data: { reply: String(out.reply || out.text || '').trim(), model: out.model || '' } };
  });
  const base = { ok: true, question, onDate, sections, jurisdiction, unattested: [...new Set(sections.flatMap((section) => (section.kind === 'country-knowledge' && !section.attested ? [section.module] : section.rules.filter((rule) => !rule.attested).map((rule) => rule.id))))] };
  if (!result.ok) return { ...base, answered: false, blocked: result.error, hint: result.hint || '', dryRun: Boolean(result.dryRun), answer: offlineAnswer(sections) };
  const reply = result.data.reply;
  const stray = ungroundedFigures(reply, `${built.context} ${question} ${disclaimer}`);
  if (stray.length) return { ...base, answered: false, blocked: 'MODEL_FIGURE_NOT_GROUNDED', strayFigures: stray, answer: offlineAnswer(sections), model: result.data.model };
  return { ...base, answered: true, answer: reply, model: result.data.model, mock: Boolean(result.mock) };
}

export function taxModules(state, args = {}) {
  const onDate = ISO_DATE.test(String(args.asOf || '')) ? args.asOf : localToday();
  const jurisdiction = countryOf(state);
  if (args.module) {
    if (!hasTaxModules(jurisdiction)) return fail('TAX_MODULE_UNKNOWN', { name: String(args.module), known: catalogFor(jurisdiction).map((module) => module.name) });
    const loaded = loadTaxModule(args.module, onDate);
    if (!loaded.ok) return loaded;
    return { ok: true, data: loaded };
  }
  return { ok: true, data: { onDate, jurisdiction, modules: catalogFor(jurisdiction) } };
}

function refsLine(sections) {
  return sections.map((section) => `· ${section.title} [${section.ref}]: ${section.source}`).join('\n');
}

export function askTaxWords(result) {
  if (!result.sections?.length) return `None of MyCA's tax modules covers that yet. They cover: ${(result.modules || []).map((module) => module.name).join(', ')}. Ask your ${adviserFor(result.jurisdiction || 'IN')}, or rephrase with the return, section or payment you mean.`;
  const unattested = result.unattested?.length ? `\nThe figures come from MyCA's ${hasTaxModules(result.jurisdiction || 'IN') ? 'dated rules' : 'research notes'} and are not yet signed off by a ${adviserFor(result.jurisdiction || 'IN')}.` : '';
  if (!result.answered) {
    const why = result.blocked === 'MODEL_FIGURE_NOT_GROUNDED' ? 'The model\'s answer quoted a figure that is not in MyCA\'s rules, so here is the guidance itself.'
      : result.blocked ? `I could not ask the model (${result.blocked}${result.hint ? `: ${result.hint}` : ''}), so here is the guidance itself.` : '';
    return `${why ? `${why}\n\n` : ''}${result.answer}\n\nFrom:\n${refsLine(result.sections)}${unattested}\n${disclaimerFor(result.jurisdiction)}`;
  }
  return `${result.mock ? 'Simulated: ' : ''}${result.answer}\n\nFrom:\n${refsLine(result.sections)}${unattested}`;
}

export function taxPlanWords(data, money) {
  const lines = [`Tax for FY ${data.fy}, for your CA to confirm:`, `· New regime ${money(data.regimes.new.taxPayable)} on total income ${money(data.regimes.new.totalIncome)}`, `· Old regime ${money(data.regimes.old.taxPayable)} on total income ${money(data.regimes.old.totalIncome)}`];
  lines.push(data.saving > 0 ? `The ${data.recommended} regime is ${money(data.saving)} cheaper. ${data.regimeRule}` : `Both regimes cost the same. ${data.regimeRule}`);
  if (data.presumptive) lines.push(data.presumptive.eligible ? `Presumptive income under ${data.presumptive.section}: ${money(data.presumptive.income)} on turnover ${money(data.presumptive.turnover)}.` : `${data.presumptive.section} is not available: turnover is above ${money(data.presumptive.cap)}.`);
  for (const idea of data.ideas) lines.push(`· ${idea.text}`);
  if (data.next) lines.push(data.next);
  if (data.unattested.length) lines.push('The rates come from MyCA\'s dated rules and are not yet signed off by a CA.');
  lines.push(data.disclaimer);
  return lines.join('\n');
}

export function reviewWords(data, money) {
  const lines = [`Review of the FY ${data.fy} return (${data.regime} regime), for your CA:`, `MyCA works out tax payable of ${money(data.asFiled.taxPayable)} on total income ${money(data.asFiled.totalIncome)}; the ${data.otherRegime.regime} regime would be ${money(data.otherRegime.taxPayable)}.`];
  const shown = data.findings.filter((item) => item.code !== 'GST_TURNOVER_MATCHED');
  if (!shown.length) lines.push('No problems found in the figures given.');
  const label = { error: 'Error', risk: 'Risk', saving: 'Money left on the table', check: 'Check' };
  for (const item of data.findings) lines.push(`· ${label[item.severity]}: ${item.title}. ${item.why}${item.source?.section ? ` (${item.source.act} s.${item.source.section})` : ''}`);
  if (data.unattested.length) lines.push('The rates come from MyCA\'s dated rules and are not yet signed off by a CA.');
  lines.push(data.disclaimer);
  return lines.join('\n');
}

export function taxModulesWords(data) {
  if (data.sections) return `${data.name}: ${data.description}\n${data.sections.map((section) => `· ${section.title} [${section.ref}]`).join('\n')}`;
  return `MyCA's tax modules (figures current for ${data.onDate}):\n${data.modules.map((module) => `· ${module.name}: ${module.sections.length} topics, ${module.reviewStatus || 'reviewed'}`).join('\n')}\nAsk a tax question to use them.`;
}
