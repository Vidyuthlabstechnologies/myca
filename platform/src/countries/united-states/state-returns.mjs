import { rules } from '../../sprint-load.mjs';
import { appendAuditEvent } from '../../ca-api.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { buildStateContext, sourcedIncome, sourcedAgi, periodDays, isIsoDate } from './state-context.mjs';
import { stateRuleReader, check, whole, positive, sum } from './state-kit.mjs';
import { STATE_MODULES, stateModule } from './states/index.mjs';
import { efileRoute } from '../../us-filing-partner.mjs';

export const US_STATE_RETURN_YEARS = Object.freeze(['2025', '2026']);
export const RESIDENCIES = Object.freeze(['full-year', 'part-year', 'nonresident']);
const SLICE = 'usStateReturns';
const ALL_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const NO_TAX_NAMES = Object.freeze({ AK: 'Alaska', FL: 'Florida', NV: 'Nevada', NH: 'New Hampshire', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', WY: 'Wyoming', WA: 'Washington' });
const INCOME_FIELDS = Object.freeze(['wages', 'taxableInterest', 'usObligationInterest', 'ordinaryDividends', 'qualifiedDividends', 'capitalGain', 'iraTaxable', 'pensionTaxable', 'socialSecurityTaxable', 'unemployment', 'stateRefundTaxable', 'businessIncome', 'otherIncome', 'adjustments']);

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const nameOf = (code) => stateModule(code)?.name || NO_TAX_NAMES[code] || code;

function yearOf(state, args) {
  const given = String(args.taxYear || '').trim();
  if (given) return given;
  return [...US_STATE_RETURN_YEARS].reverse().find((year) => state.usReturns?.[year]?.filingStatus) || US_STATE_RETURN_YEARS.at(-1);
}

function savedYear(state, taxYear) {
  const all = countrySlice(state, SLICE);
  return all && all[taxYear] ? all[taxYear] : null;
}

function noTaxRule(taxYear) {
  const found = rules.rule('us.state.individual.no-wage-income-tax', `${taxYear}-12-31`);
  return found.ok ? found : null;
}

function reciprocity(taxYear) {
  const found = rules.rule('us.state-return.reciprocity', `${taxYear}-12-31`);
  return found.ok ? found.value.workStateExemptsResidentsOf : {};
}

export function reciprocalWages(taxYear, workState, homeState) {
  const list = reciprocity(taxYear)[workState] || [];
  return list.includes('*') || list.includes(homeState);
}

export function defaultResidency(ctx) {
  const home = ctx.homeState;
  const plan = [];
  if (ALL_STATES.has(home)) plan.push({ state: home, residency: 'full-year', assumed: true });
  for (const row of ctx.w2) if (row.state && row.state !== home && ALL_STATES.has(row.state) && !plan.some((item) => item.state === row.state)) plan.push({ state: row.state, residency: 'nonresident', assumed: true });
  return plan;
}

function cleanIncome(raw, problems, at) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push(`${at}: income is an object of amounts.`);
    return undefined;
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!INCOME_FIELDS.includes(key)) {
      problems.push(`${at}: ${key} is not an income field. Use ${INCOME_FIELDS.join(', ')}.`);
      continue;
    }
    if (value === null || value === '') continue;
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > 1e11) problems.push(`${at}: ${key} must be an amount in dollars.`);
    else out[key] = Math.round(number);
  }
  return out;
}

function cleanAnswers(module, raw, problems, at) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push(`${at}: answers is an object.`);
    return undefined;
  }
  const questions = new Map((module?.questions || []).map((item) => [item.id, item]));
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const question = questions.get(key);
    if (!question) {
      problems.push(`${at}: ${key} is not a ${module?.name || 'state'} question.${questions.size ? ` Ask with us_state_questions.` : ''}`);
      continue;
    }
    if (value === null || value === '') continue;
    if (question.kind === 'amount') {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 1e11) problems.push(`${at}: ${key} must be an amount in dollars.`);
      else out[key] = Math.round(number);
    } else if (question.kind === 'yesno') {
      if (![true, false, 'yes', 'no'].includes(value)) problems.push(`${at}: ${key} is yes or no.`);
      else out[key] = value === true || value === 'yes';
    } else if (question.kind === 'choice') {
      if (!(question.options || []).includes(value)) problems.push(`${at}: ${key} is one of ${(question.options || []).join(', ')}.`);
      else out[key] = value;
    } else if (question.kind === 'count') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0 || number > 99) problems.push(`${at}: ${key} is a whole number.`);
      else out[key] = number;
    } else {
      out[key] = String(value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    }
  }
  return out;
}

export function planUsStateResidency(state, args = {}) {
  const taxYear = yearOf(state, args);
  if (!US_STATE_RETURN_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: US_STATE_RETURN_YEARS });
  if (!Array.isArray(args.states) || !args.states.length) return fail('STATES_REQUIRED', { hint: 'List each state you lived in or earned income in, with full-year, part-year or nonresident.' });
  if (args.states.length > 12) return fail('TOO_MANY_STATES');
  const problems = [];
  const states = [];
  for (const [index, raw] of args.states.entries()) {
    const code = String(raw?.state || '').trim().toUpperCase();
    const at = code || `state ${index + 1}`;
    if (!ALL_STATES.has(code)) {
      problems.push(`${at}: give a two-letter US state or DC.`);
      continue;
    }
    if (states.some((item) => item.state === code)) problems.push(`${code}: listed twice.`);
    const residency = String(raw.residency || '').trim();
    if (!RESIDENCIES.includes(residency)) problems.push(`${code}: residency is full-year, part-year or nonresident.`);
    const entry = { state: code, residency };
    if (residency === 'part-year') {
      const from = raw.from ? String(raw.from) : `${taxYear}-01-01`;
      const to = raw.to ? String(raw.to) : `${taxYear}-12-31`;
      if (!isIsoDate(from) || !isIsoDate(to)) problems.push(`${code}: from and to are dates, YYYY-MM-DD.`);
      else if (from > to) problems.push(`${code}: the move-in date is after the move-out date.`);
      else if (from < `${taxYear}-01-01` || to > `${taxYear}-12-31`) problems.push(`${code}: the dates you lived there must fall in ${taxYear}.`);
      else if (from === `${taxYear}-01-01` && to === `${taxYear}-12-31`) problems.push(`${code}: you lived there all of ${taxYear}, so that is a full-year residency.`);
      entry.from = from;
      entry.to = to;
    }
    const module = stateModule(code);
    const income = cleanIncome(raw.income, problems, code);
    if (income && Object.keys(income).length) entry.income = income;
    const answers = cleanAnswers(module, raw.answers, problems, code);
    if (answers && Object.keys(answers).length) entry.answers = answers;
    for (const key of ['estimatedPayments', 'extensionPayment', 'otherWithheld']) {
      if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
      const number = Number(raw[key]);
      if (!Number.isFinite(number) || number < 0 || number > 1e11) problems.push(`${code}: ${key} must be an amount in dollars.`);
      else entry[key] = Math.round(number);
    }
    states.push(entry);
  }
  const full = states.filter((item) => item.residency === 'full-year');
  if (full.length > 1) problems.push('Only one state can be your home for the whole year.');
  if (full.length && states.some((item) => item.residency === 'part-year')) problems.push('A full-year resident of one state is not a part-year resident of another in the same year; use nonresident for the other state.');
  const parts = states.filter((item) => item.residency === 'part-year' && item.from && item.to).sort((a, b) => a.from.localeCompare(b.from));
  for (let index = 1; index < parts.length; index += 1) if (parts[index].from <= parts[index - 1].to) problems.push(`${parts[index - 1].state} and ${parts[index].state}: the dates you lived in each overlap.`);
  if (problems.length) return fail('STATE_RESIDENCY_INVALID', { problems });
  return { ok: true, taxYear, states };
}

export function setUsStateResidency(state, args = {}) {
  const plan = planUsStateResidency(state, args);
  if (!plan.ok) return plan;
  const slice = openCountrySlice(state, SLICE);
  const before = slice[plan.taxYear]?.states?.map((item) => `${item.state}:${item.residency}`) || [];
  slice[plan.taxYear] = { ...(slice[plan.taxYear] || {}), states: plan.states, updatedAt: new Date().toISOString() };
  appendAuditEvent(state, { action: 'us_state_residency_set', actorId: args.actorId || 'owner', metadata: { taxYear: plan.taxYear, before, after: plan.states.map((item) => `${item.state}:${item.residency}`) } });
  return { ok: true, data: { taxYear: plan.taxYear, states: plan.states } };
}

export function usStateResidencyPreview(state, args = {}) {
  const plan = planUsStateResidency(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.error], summary: 'The state residency cannot be saved yet.', effects: [], figures: {} };
  return {
    blockers: [],
    summary: `Save where you lived in ${plan.taxYear}: ${plan.states.map((item) => `${nameOf(item.state)} (${item.residency === 'part-year' ? `${item.from} to ${item.to}` : item.residency})`).join(', ')}.`,
    effects: ['Your state returns are worked out again from these residencies.'],
    figures: {},
  };
}

function withSavedAnswers(saved, entry) {
  const extra = saved?.answers?.[entry.state];
  return extra && Object.keys(extra).length ? { ...entry, answers: { ...(entry.answers || {}), ...extra } } : entry;
}

function residencyFor(state, ctx) {
  const saved = savedYear(state, ctx.taxYear);
  if (saved && Array.isArray(saved.states) && saved.states.length) return { states: saved.states.map((item) => withSavedAnswers(saved, { ...item })), assumed: false };
  return { states: defaultResidency(ctx).map((item) => withSavedAnswers(saved, item)), assumed: true };
}

export function planUsStateAnswers(state, args = {}) {
  const taxYear = yearOf(state, args);
  if (!US_STATE_RETURN_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: US_STATE_RETURN_YEARS });
  const code = String(args.state || '').trim().toUpperCase();
  const module = stateModule(code);
  if (!module || !module.built) return fail('STATE_HAS_NO_QUESTIONS', { state: code, hint: `${nameOf(code)} has no state return questions in MyCA.` });
  if (!args.answers || typeof args.answers !== 'object' || Array.isArray(args.answers) || !Object.keys(args.answers).length) return fail('ANSWERS_REQUIRED', { hint: 'Give the answers as { questionId: value }; ask with us_state_questions.' });
  const problems = [];
  const cleared = Object.entries(args.answers).filter(([, value]) => value === null || value === '').map(([key]) => key);
  const known = new Set((module.questions || []).map((item) => item.id));
  for (const key of cleared) if (!known.has(key)) problems.push(`${code}: ${key} is not a ${module.name} question.`);
  const given = cleanAnswers(module, Object.fromEntries(Object.entries(args.answers).filter(([key]) => !cleared.includes(key))), problems, code) || {};
  if (problems.length) return fail('STATE_ANSWERS_INVALID', { problems });
  return { ok: true, taxYear, state: code, stateName: module.name, given, cleared };
}

export function setUsStateAnswers(state, args = {}) {
  const plan = planUsStateAnswers(state, args);
  if (!plan.ok) return plan;
  const slice = openCountrySlice(state, SLICE);
  const year = { ...(slice[plan.taxYear] || {}) };
  const answers = { ...(year.answers || {}) };
  const current = { ...(answers[plan.state] || {}), ...plan.given };
  for (const key of plan.cleared) delete current[key];
  answers[plan.state] = current;
  slice[plan.taxYear] = { ...year, answers, updatedAt: new Date().toISOString() };
  appendAuditEvent(state, { action: 'us_state_answers_set', actorId: args.actorId || 'owner', metadata: { taxYear: plan.taxYear, state: plan.state, set: Object.keys(plan.given), cleared: plan.cleared } });
  return { ok: true, data: { taxYear: plan.taxYear, state: plan.state, answers: current } };
}

export function usStateAnswersPreview(state, args = {}) {
  const plan = planUsStateAnswers(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.hint || plan.error], summary: 'These state answers cannot be saved yet.', effects: [], figures: {} };
  const parts = [Object.keys(plan.given).length ? `save ${Object.keys(plan.given).length} answer${Object.keys(plan.given).length === 1 ? '' : 's'}` : '', plan.cleared.length ? `clear ${plan.cleared.length}` : ''].filter(Boolean).join(' and ');
  return { blockers: [], summary: `For your ${plan.taxYear} ${plan.stateName} return, ${parts}.`, effects: [`Your ${plan.stateName} return is worked out again. Where you lived is not changed.`], figures: {} };
}

function filingFor(ctx, entry, module) {
  const residentDays = entry.residency === 'full-year' ? ctx.daysInYear : entry.residency === 'part-year' ? periodDays(ctx.taxYear, entry.from, entry.to) : 0;
  const filing = { state: entry.state, stateName: module.name, residency: entry.residency, from: entry.from || '', to: entry.to || '', residentDays, income: entry.income || {}, answers: entry.answers || {} };
  const split = sourcedIncome(ctx, filing);
  const withheld = sum(ctx.w2.filter((row) => row.state === entry.state), (row) => row.stateWithheld);
  const localWithheld = sum(ctx.w2.filter((row) => row.state === entry.state), (row) => row.localWithheld);
  return { ...filing, sourced: split.sourced, sourcedAgi: sourcedAgi(split.sourced), share: split.share, checks: split.checks, payments: { withheld: withheld + positive(entry.otherWithheld), localWithheld, estimated: positive(entry.estimatedPayments), extension: positive(entry.extensionPayment) } };
}

function labelsFor(module, filing, result) {
  const source = typeof module.labels === 'function' ? module.labels(filing.taxYear, filing.residency, result.form) : module.labels;
  const lines = result.lines || {};
  if (!source) return {};
  return Object.fromEntries(Object.keys(lines).filter((key) => typeof source[key] === 'string').map((key) => [key, source[key]]));
}

function settle(result, filing, reader, module) {
  const totalTax = positive(result.totalTax);
  const refundable = sum(result.refundableCredits || [], (item) => item.amount);
  const paid = filing.payments.withheld + filing.payments.estimated + filing.payments.extension + positive(result.localPayments);
  const balance = paid + refundable - totalTax;
  const report = reader.report();
  const checks = [...filing.checks, ...(result.checks || [])];
  if (report.missingRules.length) checks.push(check('error', 'STATE_RULE_MISSING', `MyCA has no ${module.name} figures for ${filing.taxYear} for: ${report.missingRules.join(', ')}.`, 'This return cannot be filed until those figures are added.'));
  return {
    state: filing.state,
    stateName: module.name,
    status: 'computed',
    residency: filing.residency,
    from: filing.from || undefined,
    to: filing.to || undefined,
    form: result.form,
    lines: result.lines || {},
    labels: labelsFor(module, filing, result),
    schedules: result.schedules || {},
    stateIncome: whole(result.stateIncome ?? filing.sourcedAgi),
    sourcedIncome: filing.sourced,
    taxableIncome: whole(result.taxableIncome),
    taxBeforeCredits: whole(result.taxBeforeCredits),
    nonrefundableCredits: result.nonrefundableCredits || [],
    otherStateCredit: whole(result.otherStateCredit),
    otherTaxes: result.otherTaxes || [],
    totalTax,
    refundableCredits: result.refundableCredits || [],
    payments: { ...filing.payments, local: positive(result.localPayments) },
    refund: Math.max(0, balance),
    owed: Math.max(0, -balance),
    due: module.due ? module.due(filing.taxYear) : `${Number(filing.taxYear) + 1}-04-15`,
    checks,
    notCovered: [...(module.notCovered || []), ...(result.notCovered || [])],
    notes: result.notes || [],
    ...report,
  };
}

function computeOne(ctx, entry, otherStates = [], { homeState = '', homeReturn = null } = {}) {
  const module = stateModule(entry.state);
  const filing = { ...filingFor(ctx, entry, module), taxYear: ctx.taxYear, otherStates, homeState, homeReturn };
  const reader = stateRuleReader(entry.state, ctx.taxYear);
  let result;
  try {
    result = module.compute(ctx, filing, reader);
  } catch (error) {
    return { state: entry.state, stateName: module.name, status: 'error', residency: entry.residency, error: 'STATE_COMPUTE_FAILED', why: `${module.name} could not be worked out: ${String(error?.message || error).slice(0, 160)}`, ...reader.report() };
  }
  if (!result || result.ok === false) return { state: entry.state, stateName: module.name, status: 'blocked', residency: entry.residency, error: result?.error || 'STATE_COMPUTE_FAILED', why: result?.why || '', checks: result?.checks || [], ...reader.report() };
  return settle(result, filing, reader, module);
}

function placeholder(ctx, entry) {
  const code = entry.state;
  const noTax = noTaxRule(ctx.taxYear);
  if (noTax && noTax.value.states.includes(code)) return { state: code, stateName: nameOf(code), status: 'no-income-tax', residency: entry.residency, returnNeeded: false, why: `${nameOf(code)} levies no individual income tax, so there is no state income tax return.` };
  if (noTax && noTax.value.capitalGainsOnly.includes(code)) {
    const gains = Math.max(0, ctx.income.capitalGain);
    return { state: code, stateName: nameOf(code), status: 'capital-gains-only', residency: entry.residency, returnNeeded: gains > 250000 ? null : false, why: `${nameOf(code)} taxes only long-term capital gains above a large yearly threshold, not wages. ${gains > 250000 ? 'Your gains may be above it; MyCA does not prepare that return.' : 'Your gains are below it, so no return is needed.'}` };
  }
  return { state: code, stateName: nameOf(code), status: 'not-built', residency: entry.residency, returnNeeded: true, why: `MyCA does not prepare the ${nameOf(code)} return yet.` };
}

export function usStateReturns(state, args = {}) {
  const taxYear = yearOf(state, args);
  if (!US_STATE_RETURN_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: US_STATE_RETURN_YEARS });
  const built = buildStateContext(state, taxYear);
  if (!built.ok) return built;
  const ctx = built.ctx;
  const plan = residencyFor(state, ctx);
  if (!plan.states.length) return fail('STATE_RESIDENCY_REQUIRED', { taxYear, hint: 'Add your home address to the federal return, or say which states you lived in.' });
  const home = plan.states.find((item) => item.residency === 'full-year')?.state || '';
  const out = [];
  const sourceStates = plan.states.filter((item) => item.residency !== 'full-year');
  const residents = plan.states.filter((item) => item.residency === 'full-year');
  const paidElsewhere = [];
  for (const entry of sourceStates) {
    const module = stateModule(entry.state);
    if (entry.residency === 'nonresident' && home && reciprocalWages(taxYear, entry.state, home)) {
      const rows = ctx.w2.filter((row) => row.state === entry.state);
      const withheld = sum(rows, (row) => row.stateWithheld);
      const onlyWages = !Object.entries(entry.income || {}).some(([key, value]) => key !== 'wages' && value);
      if (onlyWages) {
        out.push({ state: entry.state, stateName: nameOf(entry.state), status: 'reciprocal', residency: 'nonresident', returnNeeded: withheld > 0, withheld, why: `${nameOf(entry.state)} does not tax the wages of ${nameOf(home)} residents under their reciprocal agreement. ${withheld > 0 ? `Your W-2 shows $${withheld.toLocaleString('en-US')} withheld for ${nameOf(entry.state)}, so file its nonresident return to get it back, and give your employer the ${nameOf(entry.state)} exemption certificate.` : 'No return is needed there.'}` });
        continue;
      }
    }
    if (!module || !module.built) {
      out.push(placeholder(ctx, entry));
      continue;
    }
    const result = computeOne(ctx, entry, [], { homeState: home });
    out.push(result);
    if (result.status === 'computed') paidElsewhere.push({ state: entry.state, residency: entry.residency, tax: result.totalTax, income: result.stateIncome, sourced: result.sourcedIncome });
  }
  for (const entry of residents) {
    const module = stateModule(entry.state);
    if (!module || !module.built) {
      out.unshift(placeholder(ctx, entry));
      continue;
    }
    const homeResult = computeOne(ctx, entry, paidElsewhere.filter((item) => item.residency === 'nonresident'));
    out.unshift(homeResult);
    if (homeResult.status !== 'computed') continue;
    const homeReturn = { state: entry.state, tax: Math.max(0, homeResult.totalTax - sum(homeResult.otherTaxes, (item) => item.amount)), income: homeResult.stateIncome };
    for (const [index, item] of out.entries()) {
      const source = sourceStates.find((candidate) => candidate.state === item.state);
      if (!source || source.residency !== 'nonresident' || item.status !== 'computed' || !stateModule(item.state)?.creditsHomeStateTax) continue;
      out[index] = computeOne(ctx, source, [], { homeState: home, homeReturn });
    }
  }
  const computed = out.filter((item) => item.status === 'computed');
  return {
    ok: true,
    data: {
      taxYear,
      filingStatus: ctx.filingStatus,
      federalAgi: ctx.income.agi,
      residencyAssumed: plan.assumed,
      residency: plan.states,
      returns: out,
      totals: { tax: sum(computed, (item) => item.totalTax), refund: sum(computed, (item) => item.refund), owed: sum(computed, (item) => item.owed) },
      notBuilt: out.filter((item) => item.status === 'not-built').map((item) => item.state),
    },
  };
}

export function usStateReturnFor(state, args = {}) {
  const all = usStateReturns(state, args);
  if (!all.ok) return all;
  const code = String(args.state || '').trim().toUpperCase();
  if (!code) return all;
  const found = all.data.returns.find((item) => item.state === code);
  if (!found) return fail('STATE_NOT_ON_RETURN', { state: code, taxYear: all.data.taxYear, hint: `${nameOf(code)} is not among the states on your ${all.data.taxYear} return. Add it with set_us_state_residency.` });
  return { ok: true, data: { ...all.data, returns: [found] } };
}

const FACTS = Object.freeze({
  spouse: (ctx) => ctx.filers.length > 1,
  dependents: (ctx) => ctx.dependents.length > 0,
  selfEmployment: (ctx) => whole(ctx.income.businessIncome) !== 0,
  senior: (ctx) => ctx.filers.some((item) => item.age !== null && item.age >= 60),
  retirementIncome: (ctx) => whole(ctx.income.iraTaxable) + whole(ctx.income.pensionTaxable) > 0,
  socialSecurity: (ctx) => whole(ctx.income.socialSecurityBenefits) > 0,
  capitalGains: (ctx) => whole(ctx.income.capitalGain) !== 0,
  interest: (ctx) => whole(ctx.income.taxableInterest) + whole(ctx.income.taxExemptInterest) > 0,
  taxExemptInterest: (ctx) => whole(ctx.income.taxExemptInterest) > 0,
  itemizesFederal: (ctx) => Boolean(ctx.itemized.federalItemized),
});

export const QUESTION_FACTS = Object.freeze(Object.keys(FACTS));

export function questionApplies(question, ctx, entry, answers = {}) {
  const when = question.when;
  if (!when || !ctx) return true;
  if (when.residency && !when.residency.includes(entry.residency)) return false;
  if (when.filingStatus && !when.filingStatus.includes(ctx.filingStatus)) return false;
  if (when.has && !when.has.every((fact) => FACTS[fact] && FACTS[fact](ctx))) return false;
  if (when.answer) {
    const value = answers[when.answer.id];
    if (when.answer.in ? !when.answer.in.includes(value) : value === undefined || value === null || value === '') return false;
  }
  return true;
}

export function usStateQuestions(state, args = {}) {
  const taxYear = yearOf(state, args);
  const code = String(args.state || '').trim().toUpperCase();
  const built = buildStateContext(state, taxYear);
  const ctx = built.ok ? built.ctx : null;
  const plan = ctx ? residencyFor(state, ctx).states : [];
  const codes = code ? [code] : plan.map((item) => item.state);
  const saved = savedYear(state, taxYear);
  const list = codes.map((item) => {
    const module = stateModule(item);
    const entry = plan.find((row) => row.state === item) || withSavedAnswers(saved, { state: item, residency: 'full-year' });
    const answers = entry.answers || {};
    const all = module?.questions || [];
    const asked = all.filter((question) => questionApplies(question, ctx, entry, answers));
    return { state: item, stateName: nameOf(item), built: Boolean(module?.built), residency: entry.residency, skipped: all.length - asked.length, questions: asked.map((question) => ({ id: question.id, text: question.text, help: question.help || '', kind: question.kind, options: question.options, answer: answers[question.id] ?? null })) };
  });
  return { ok: true, data: { taxYear, states: list } };
}

export function usStateCoverage() {
  const builtStates = STATE_MODULES.filter((item) => item.built);
  return {
    ok: true,
    data: {
      years: US_STATE_RETURN_YEARS,
      built: builtStates.map((item) => ({ state: item.code, name: item.name, forms: item.forms, residencies: item.residencies || RESIDENCIES, notCovered: item.notCovered || [] })),
      notBuilt: STATE_MODULES.filter((item) => !item.built).map((item) => item.code),
      noIncomeTax: Object.keys(NO_TAX_NAMES),
    },
  };
}

export function usStateFilingPackage(state, args = {}) {
  const all = usStateReturnFor(state, args);
  if (!all.ok) return all;
  const route = efileRoute() === 'partner' ? 'partner' : 'irs-mef';
  const packages = all.data.returns.filter((item) => item.status === 'computed').map((item) => {
    const blockers = (item.checks || []).filter((entry) => entry.level === 'error').map((entry) => entry.code);
    if (route === 'irs-mef') blockers.push('STATE_MEF_NOT_BUILT');
    if (item.provisional) blockers.push('STATE_FIGURES_PROVISIONAL');
    if (item.unreviewed) blockers.push('STATE_RULES_NOT_ATTESTED');
    return {
      state: item.state,
      taxYear: all.data.taxYear,
      form: item.form,
      residency: item.residency,
      period: item.residency === 'part-year' ? { from: item.from, to: item.to } : null,
      lines: item.lines,
      schedules: item.schedules,
      amounts: { totalTax: item.totalTax, refund: item.refund, owed: item.owed, withheld: item.payments.withheld, estimated: item.payments.estimated },
      due: item.due,
      route,
      piggyback: true,
      ready: blockers.length === 0,
      blockers,
      rulesUsed: item.rulesUsed,
    };
  });
  const missing = all.data.returns.filter((item) => item.status === 'not-built' || item.status === 'blocked' || item.status === 'error').map((item) => item.state);
  return { ok: true, data: { taxYear: all.data.taxYear, packages, missing, ready: packages.length > 0 && packages.every((item) => item.ready) && missing.length === 0, route, ...(route === 'irs-mef' ? { routeNote: 'The federal return goes straight to the IRS, and MyCA does not send state returns with it yet. File the state returns with the e-file partner or on the state\'s own site.' } : {}), contract: 'us-state-filing-v1' } };
}

const usd = (value) => `$${whole(value).toLocaleString('en-US')}`;

export function usStateReturnsWords(data) {
  const lines = data.returns.map((item) => {
    if (item.status === 'computed') return `${item.stateName} Form ${item.form} (${item.residency}): tax ${usd(item.totalTax)}, ${item.refund > 0 ? `refund ${usd(item.refund)}` : item.owed > 0 ? `${usd(item.owed)} to pay by ${item.due}` : 'nothing to pay or get back'}.${item.provisional ? ' Some figures are provisional until the state publishes this year\'s form.' : ''}`;
    if (item.status === 'reciprocal' || item.status === 'no-income-tax' || item.status === 'capital-gains-only' || item.status === 'not-built') return `${item.stateName}: ${item.why}`;
    return `${item.stateName}: ${item.why || 'could not be worked out.'}`;
  });
  const errors = data.returns.flatMap((item) => (item.checks || []).filter((entry) => entry.level === 'error').map((entry) => `${item.stateName}: ${entry.message}`));
  return [`State returns for ${data.taxYear}${data.residencyAssumed ? ' (from your home address and W-2 states; tell me if you moved)' : ''}:`, ...lines, ...(errors.length ? ['Before filing:', ...errors] : []), ...(data.returns.some((item) => item.unreviewed) ? ['The state figures come from dated rules a US CPA has not reviewed yet.'] : [])].join('\n');
}
