import { computeForm1040, SUPPORTED_YEARS } from './us-1040.mjs';
import { engineInput, usReturnRecord } from './us-return.mjs';
import { openTin, sealTin } from './us-identity.mjs';
import { appendAuditEvent } from './ca-api.mjs';

const MAX_AMOUNT = 1e11;
const FIGURES = Object.freeze({
  agi: { answer: 'priorYearAgi', label: 'Last year\'s adjusted gross income (Form 1040 line 11)' },
  totalTax: { answer: 'priorYearTax', label: 'Last year\'s total tax (Form 1040 line 24)' },
  overpaymentApplied: { answer: 'priorYearOverpaymentApplied', label: 'Refund applied to this year (Form 1040 line 36)' },
  shortTermLossCarryover: { answer: 'shortTermLossCarryover', label: 'Short-term capital loss carryover' },
  longTermLossCarryover: { answer: 'longTermLossCarryover', label: 'Long-term capital loss carryover' },
});

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function reseal(person, fromScope, toScope) {
  if (!person) return null;
  const copy = { ...person };
  if (person.tin && fromScope !== toScope) {
    const raw = openTin(person.tin.sealed, { scope: fromScope });
    copy.tin = sealTin(raw, { scope: toScope });
  }
  return copy;
}

function typedFigures(figures, problems) {
  const out = {};
  if (figures === undefined || figures === null) return out;
  if (typeof figures !== 'object' || Array.isArray(figures)) {
    problems.push('Figures are amounts from last year\'s Form 1040.');
    return out;
  }
  if (Object.keys(figures).some((key) => !Object.hasOwn(FIGURES, key))) problems.push(`Figures can be ${Object.keys(FIGURES).join(', ')}.`);
  for (const [name, spec] of Object.entries(FIGURES)) {
    const raw = Object.hasOwn(figures, name) ? figures[name] : undefined;
    if (raw === '' || raw === null || raw === undefined) continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) {
      problems.push(`${spec.label} is an amount of zero or more.`);
      continue;
    }
    out[name] = Math.round(number * 100) / 100;
  }
  return out;
}

export function planUsPriorYearImport(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim();
  if (!SUPPORTED_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const priorYear = String(Number(taxYear) - 1);
  const problems = [];
  const typed = typedFigures(args.figures, problems);
  if (problems.length) return fail('US_PRIOR_YEAR_INVALID', { problems });
  const prior = SUPPORTED_YEARS.includes(priorYear) ? usReturnRecord(state, priorYear) : null;
  const target = usReturnRecord(state, taxYear);
  const figures = {};
  const expectedForms = [];
  const notes = [];
  let source = 'figures';
  if (prior && prior.filingStatus) {
    const result = computeForm1040(engineInput(state, prior), priorYear);
    if (result.ok) {
      source = 'myca';
      const d = result.data;
      figures.agi = d.summary.agi;
      figures.totalTax = d.summary.totalTax;
      const applied = Number(d.lines['36'] || 0);
      if (applied > 0) figures.overpaymentApplied = applied;
      const carry = d.capitalLossCarryover || { shortTerm: 0, longTerm: 0 };
      if (carry.shortTerm > 0) figures.shortTermLossCarryover = carry.shortTerm;
      if (carry.longTerm > 0) figures.longTermLossCarryover = carry.longTerm;
      if (d.summary.itemized) notes.push(`You itemized in ${priorYear}: a state tax refund received in ${taxYear} can be taxable.`);
      const seen = new Set();
      for (const form of prior.forms || []) {
        const key = `${form.kind}|${form.payer || ''}|${form.owner || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        expectedForms.push({ kind: form.kind, payer: form.payer || '', owner: form.owner || 'taxpayer' });
      }
    }
  }
  Object.assign(figures, typed);
  if (source === 'figures' && !Object.keys(figures).length) return fail('US_PRIOR_YEAR_NOTHING', { hint: `There is no ${priorYear} return in MyCA. Give the figures from last year's Form 1040: ${Object.keys(FIGURES).join(', ')}.` });
  const answers = {};
  const kept = [];
  for (const [key, value] of Object.entries(figures)) {
    const id = FIGURES[key].answer;
    if (target && Object.hasOwn(target.answers || {}, id) && args.overwrite !== true && target.answers[id] !== value) {
      kept.push(id);
      continue;
    }
    answers[id] = value;
  }
  const copyProfile = source === 'myca' && args.copyProfile !== false && !(target && target.filingStatus);
  return { ok: true, taxYear, priorYear, source, answers, kept, copyProfile, expectedForms, notes, prior };
}

export function importUsPriorYear(state, args = {}) {
  const plan = planUsPriorYearImport(state, args);
  if (!plan.ok) return plan;
  const prior = plan.prior;
  const ret = usReturnRecord(state, plan.taxYear, { create: true, scopeId: plan.copyProfile ? prior.scopeId : '' });
  if (plan.copyProfile) {
    try {
      const scope = (who) => [`${prior.scopeId}:${who}`, `${ret.scopeId}:${who}`];
      const taxpayer = reseal(prior.taxpayer, ...scope('taxpayer'));
      const spouse = reseal(prior.spouse, ...scope('spouse'));
      const dependents = (prior.dependents || []).map((item) => reseal(item, ...scope(`dependent-${item.id}`)));
      Object.assign(ret, { filingStatus: prior.filingStatus, taxpayer, spouse, dependents, address: prior.address ? { ...prior.address } : null, nextDependentNumber: prior.nextDependentNumber || dependents.length + 1 });
    } catch (err) {
      return fail(err?.code || 'TIN_UNREADABLE', { hint: 'The saved SSNs could not be read, so the profile was not copied. Enter it again.' });
    }
  }
  Object.assign(ret.answers, plan.answers);
  ret.updatedAt = new Date().toISOString();
  appendAuditEvent(state, { actorId: state.__actor?.userId || 'owner', action: 'us_prior_year_imported', metadata: { taxYear: plan.taxYear, priorYear: plan.priorYear, source: plan.source, answers: Object.keys(plan.answers), profileCopied: plan.copyProfile } });
  return {
    ok: true,
    data: {
      taxYear: plan.taxYear,
      priorYear: plan.priorYear,
      source: plan.source,
      profileCopied: plan.copyProfile,
      answers: plan.answers,
      keptYourAnswers: plan.kept,
      expectedForms: plan.expectedForms,
      notes: [...plan.notes, ...(plan.copyProfile ? ['Check the filing status, address and each dependent\'s age: they were copied from last year.'] : [])],
    },
  };
}

export function usPriorYearPreview(state, args) {
  const plan = planUsPriorYearImport(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.hint || plan.error], summary: '', effects: [], figures: {} };
  const dollars = (value) => `$${Number(value).toLocaleString('en-US')}`;
  const effects = Object.values(FIGURES).filter((spec) => Object.hasOwn(plan.answers, spec.answer)).map((spec) => `${spec.label}: ${dollars(plan.answers[spec.answer])}`);
  if (plan.copyProfile) effects.push('Filing status, names, sealed SSNs, dependents and address are copied from last year.');
  if (plan.kept.length) effects.push('Answers you already gave are kept.');
  if (plan.expectedForms.length) effects.push(`${plan.expectedForms.length} tax form${plan.expectedForms.length === 1 ? '' : 's'} to expect again from last year's payers.`);
  return { blockers: [], summary: `Bring ${plan.priorYear} into the ${plan.taxYear} return${plan.source === 'myca' ? ' from your MyCA return' : ' from the figures given'}.`, effects, figures: { taxYear: plan.taxYear, priorYear: plan.priorYear, source: plan.source } };
}

export function usPriorYearWords(data) {
  const parts = [`Brought ${data.priorYear} into your ${data.taxYear} return`];
  if (data.profileCopied) parts.push('copied your profile and dependents');
  const count = Object.keys(data.answers).length;
  if (count) parts.push(`filled ${count} answer${count === 1 ? '' : 's'}`);
  const tail = data.expectedForms.length ? ` Expect ${data.expectedForms.length} form${data.expectedForms.length === 1 ? '' : 's'} again: ${data.expectedForms.slice(0, 5).map((form) => `${form.kind}${form.payer ? ` from ${form.payer}` : ''}`).join(', ')}.` : '';
  return `${parts.join(', ')}.${tail}${data.notes.length ? ` ${data.notes.join(' ')}` : ''}`;
}
