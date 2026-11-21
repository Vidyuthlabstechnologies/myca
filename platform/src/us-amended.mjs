import { computeForm1040, FILING_STATUSES, SUPPORTED_YEARS } from './us-1040.mjs';
import { engineInput, usReturnRecord, computedForm1040ForFiling } from './us-return.mjs';
import { ORIGINAL_FIGURES, figuresOf1040, form1040X } from './us-1040x.mjs';
import { returnDigest } from './us-mef-xml.mjs';
import { appendAuditEvent } from './ca-api.mjs';
import { localToday } from './dates.mjs';

const MAX_AMOUNT = 1e11;
const MAX_EXPLANATION = 4000;
const SETTINGS = Object.freeze(['explanation', 'originalFiledOn', 'lastPaymentOn', 'paidWithReturn', 'applyToNextYear', 'originalPaper']);

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const blank = (value) => value === undefined || value === null || value === '';

function acceptedFiling(state, taxYear) {
  const entry = state.usEfile?.returns?.[String(taxYear)];
  const submissions = Array.isArray(entry?.submissions) ? entry.submissions : [];
  const accepted = [...submissions].reverse().find((item) => item.status === 'accepted');
  return accepted ? { entry, submission: accepted } : null;
}

function peopleOf(ret, data) {
  return (ret.dependents || []).map((item, index) => ({ firstName: item.firstName, lastName: item.lastName, relationship: item.relationship, months: item.months, bornOrDiedInYear: item.bornOrDiedInYear, ctcEligible: data?.dependents?.[index]?.ctcEligible || false, odcEligible: data?.dependents?.[index]?.odcEligible || false }));
}

function typedOriginal(args, problems) {
  const out = {};
  const figures = args.original;
  if (figures !== undefined && figures !== null) {
    if (typeof figures !== 'object' || Array.isArray(figures)) problems.push('The original figures are amounts from the Form 1040 as filed.');
    else {
      for (const key of Object.keys(figures)) if (!Object.hasOwn(ORIGINAL_FIGURES, key)) problems.push(`Original figures can be ${Object.keys(ORIGINAL_FIGURES).join(', ')}.`);
      for (const [key, spec] of Object.entries(ORIGINAL_FIGURES)) {
        if (!Object.hasOwn(figures, key) || blank(figures[key])) continue;
        const number = Number(figures[key]);
        if (!Number.isFinite(number) || Math.abs(number) > MAX_AMOUNT || (number < 0 && !spec.negative)) problems.push(`${spec.label} is an amount${spec.negative ? '' : ' of zero or more'}.`);
        else out[key] = Math.round(number);
      }
    }
  }
  if (!blank(args.originalFilingStatus)) {
    if (!FILING_STATUSES.includes(String(args.originalFilingStatus))) problems.push(`The original filing status is one of ${FILING_STATUSES.join(', ')}.`);
    else out.filingStatus = String(args.originalFilingStatus);
  }
  if (args.originalDependents !== undefined && args.originalDependents !== null) {
    const d = args.originalDependents;
    const count = (value) => (blank(value) ? 0 : Number(value));
    const children = count(d?.children);
    const other = count(d?.other);
    if (typeof d !== 'object' || ![children, other].every((value) => Number.isInteger(value) && value >= 0 && value <= 20)) problems.push('The original dependents are counts of children and other dependents, 0 to 20.');
    else out.dependents = { children, other };
  }
  return out;
}

function typedSettings(args, problems) {
  const out = {};
  if (!blank(args.explanation)) {
    const text = String(args.explanation).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
    if (text.length > MAX_EXPLANATION) problems.push(`The explanation is at most ${MAX_EXPLANATION} characters.`);
    else out.explanation = text;
  }
  for (const key of ['originalFiledOn', 'lastPaymentOn']) {
    if (blank(args[key])) continue;
    if (!isDate(args[key])) problems.push(`${key === 'originalFiledOn' ? 'The original filing date' : 'The last payment date'} must be YYYY-MM-DD.`);
    else out[key] = String(args[key]);
  }
  for (const key of ['paidWithReturn', 'applyToNextYear']) {
    if (blank(args[key])) continue;
    const number = Number(args[key]);
    if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) problems.push(`${key === 'paidWithReturn' ? 'The amount paid with the original return' : 'The amount applied to next year'} is an amount of zero or more.`);
    else out[key] = Math.round(number);
  }
  if (args.originalPaper !== undefined && args.originalPaper !== null) out.originalPaper = args.originalPaper === true;
  return out;
}

function originalFromFiling(state, taxYear, ret, found) {
  const { entry, submission } = found;
  const stored = submission.figures || (submission.transport === 'partner' ? entry.partner?.figures : null);
  if (stored) return { ok: true, figures: { ...stored }, verified: submission.transport !== 'partner' };
  const filing = computedForm1040ForFiling(state, { taxYear });
  if (!filing.ok) return fail(filing.error || 'RETURN_NOT_COMPUTED');
  const hash = submission.returnHash || entry.signature?.returnHash;
  if (hash && returnDigest(filing.data) !== hash) return fail('ORIGINAL_CHANGED_SINCE_FILING', { hint: `The ${taxYear} return in MyCA was changed after it was filed, so its figures are no longer the original. Give the original figures from the return as filed (original), then make the changes.` });
  return { ok: true, figures: figuresOf1040(filing.data, peopleOf(ret, filing.data)), verified: Boolean(hash) };
}

export function planUsAmendedStart(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim();
  if (!SUPPORTED_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = usReturnRecord(state, taxYear);
  if (!ret || !ret.filingStatus) return fail('US_RETURN_NOT_STARTED', { hint: `Start the ${taxYear} return first: the corrected Form 1040 is made from it.` });
  if (ret.amendment && args.restart !== true) return fail('AMENDMENT_ALREADY_STARTED', { hint: 'An amended return is already started; change it with set_us_amended_return, or pass restart to start over.' });
  const problems = [];
  const typed = typedOriginal(args, problems);
  const settings = typedSettings(args, problems);
  if (problems.length) return fail('US_AMENDMENT_INVALID', { problems });
  const found = acceptedFiling(state, taxYear);
  const entered = Object.keys(typed).some((key) => Object.hasOwn(ORIGINAL_FIGURES, key));
  let original;
  let source;
  let verified = false;
  if (found && !entered) {
    const snap = originalFromFiling(state, taxYear, ret, found);
    if (!snap.ok) return snap;
    original = { ...snap.figures, ...(typed.filingStatus ? { filingStatus: typed.filingStatus } : {}), ...(typed.dependents ? { dependents: typed.dependents } : {}) };
    source = 'myca';
    verified = snap.verified;
    if (!settings.originalFiledOn && found.submission.submittedAt) settings.originalFiledOn = String(found.submission.submittedAt).slice(0, 10);
  } else {
    const missing = ['agi', 'deduction', 'tax'].filter((key) => !Object.hasOwn(typed, key));
    if (!typed.filingStatus) missing.push('originalFilingStatus');
    if (missing.length) return fail('ORIGINAL_FIGURES_REQUIRED', { missing, hint: `No accepted ${taxYear} return is on file in MyCA. Give the figures from the Form 1040 as filed: ${Object.keys(ORIGINAL_FIGURES).join(', ')}, the original filing status and dependents.` });
    original = { dependents: { children: 0, other: 0 }, ...typed };
    source = 'entered';
  }
  return { ok: true, taxYear, ret, amendment: { source, verified, original, ...settings } };
}

export function startUsAmendedReturn(state, args = {}) {
  const plan = planUsAmendedStart(state, args);
  if (!plan.ok) return plan;
  plan.ret.amendment = { ...plan.amendment, startedAt: new Date().toISOString() };
  plan.ret.updatedAt = new Date().toISOString();
  appendAuditEvent(state, { actorId: state.__actor?.userId || 'owner', action: 'us_amended_return_started', metadata: { taxYear: plan.taxYear, source: plan.amendment.source, verified: plan.amendment.verified, restart: args.restart === true } });
  return usAmendedReturn(state, { taxYear: plan.taxYear });
}

export function planUsAmendedSet(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim();
  if (!SUPPORTED_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = usReturnRecord(state, taxYear);
  if (!ret?.amendment) return fail('AMENDMENT_NOT_STARTED', { hint: `Start the ${taxYear} amended return first with start_us_amended_return.` });
  const problems = [];
  const typed = typedOriginal(args, problems);
  const settings = typedSettings(args, problems);
  if (problems.length) return fail('US_AMENDMENT_INVALID', { problems });
  const figuresChanged = Object.keys(typed).some((key) => Object.hasOwn(ORIGINAL_FIGURES, key));
  if (figuresChanged && ret.amendment.source === 'myca' && ret.amendment.verified) return fail('ORIGINAL_FROM_FILED_RETURN', { hint: 'The original figures come from the return MyCA filed and cannot be typed over. Restart with the original figures if the IRS adjusted the return.' });
  if (!Object.keys(typed).length && !Object.keys(settings).length && !SETTINGS.some((key) => args[key] === null)) return fail('NOTHING_TO_CHANGE', { hint: `Give any of ${[...SETTINGS, 'original', 'originalFilingStatus', 'originalDependents'].join(', ')}.` });
  const cleared = SETTINGS.filter((key) => args[key] === null);
  return { ok: true, taxYear, ret, typed, settings, cleared };
}

export function setUsAmendedReturn(state, args = {}) {
  const plan = planUsAmendedSet(state, args);
  if (!plan.ok) return plan;
  const amendment = plan.ret.amendment;
  amendment.original = { ...amendment.original, ...plan.typed };
  Object.assign(amendment, plan.settings);
  for (const key of plan.cleared) delete amendment[key];
  plan.ret.updatedAt = new Date().toISOString();
  appendAuditEvent(state, { actorId: state.__actor?.userId || 'owner', action: 'us_amended_return_set', metadata: { taxYear: plan.taxYear, changed: [...Object.keys(plan.typed), ...Object.keys(plan.settings), ...plan.cleared] } });
  return usAmendedReturn(state, { taxYear: plan.taxYear });
}

export function amendedFor(state, ret, today = localToday()) {
  const result = computeForm1040(engineInput(state, ret), ret.taxYear);
  if (!result.ok) return result;
  const people = peopleOf(ret, result.data);
  const out = form1040X({ taxYear: ret.taxYear, amendment: ret.amendment, amended: figuresOf1040(result.data, people), amendedDependents: people, today });
  if (!out.ok) return out;
  const returnErrors = result.data.checks.filter((item) => item.level === 'error');
  return { ok: true, data: { ...out.data, corrected1040: { lines: result.data.lines, schedules: Object.keys(result.data.schedules), summary: result.data.summary, errors: returnErrors.length }, verifiedOriginal: Boolean(ret.amendment.verified), startedAt: ret.amendment.startedAt || '' } };
}

export function usAmendedReturn(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim();
  if (!SUPPORTED_YEARS.includes(taxYear)) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = usReturnRecord(state, taxYear);
  if (!ret?.amendment) return { ok: true, data: { taxYear, started: false, acceptedInMyca: Boolean(acceptedFiling(state, taxYear)), hint: 'Start an amended return with start_us_amended_return. If the return was filed outside MyCA, give the original figures.' } };
  const out = amendedFor(state, ret, isDate(args.today) ? args.today : localToday());
  if (!out.ok) return out;
  return { ok: true, data: { started: true, ...out.data } };
}

const usd = (value) => `$${Number(value).toLocaleString('en-US')}`;

export function usAmendedStartPreview(state, args) {
  const plan = planUsAmendedStart(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.hint || plan.error], summary: '', effects: [], figures: {} };
  const o = plan.amendment.original;
  return { blockers: [], summary: `Start a Form 1040-X for ${plan.taxYear} from ${plan.amendment.source === 'myca' ? 'the return MyCA filed' : 'the original figures given'}.`, effects: [`Column A: AGI ${usd(o.agi || 0)}, total tax ${usd(o.totalTax ?? 0)}, ${o.refund ? `refund ${usd(o.refund)}` : `owed ${usd(o.amountOwed || 0)}`}.`, 'Change the return as usual; the corrected amounts become column C.', ...(plan.amendment.originalFiledOn ? [`Original filed on ${plan.amendment.originalFiledOn}.`] : ['Add the date the original was filed.'])], figures: { taxYear: plan.taxYear, source: plan.amendment.source } };
}

export function usAmendedSetPreview(state, args) {
  const plan = planUsAmendedSet(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.hint || plan.error], summary: '', effects: [], figures: {} };
  const effects = [];
  if (plan.settings.explanation) effects.push(`Part II: ${plan.settings.explanation.slice(0, 200)}`);
  if (plan.settings.originalFiledOn) effects.push(`Original filed on ${plan.settings.originalFiledOn}.`);
  if (plan.settings.lastPaymentOn) effects.push(`Tax last paid on ${plan.settings.lastPaymentOn}.`);
  if (plan.settings.paidWithReturn !== undefined) effects.push(`Line 16 paid with or after the original: ${usd(plan.settings.paidWithReturn)}.`);
  if (plan.settings.applyToNextYear !== undefined) effects.push(`Line 23 applied to next year: ${usd(plan.settings.applyToNextYear)}.`);
  for (const [key, value] of Object.entries(plan.typed)) if (Object.hasOwn(ORIGINAL_FIGURES, key)) effects.push(`Original ${ORIGINAL_FIGURES[key].label}: ${usd(value)}.`);
  if (plan.cleared.length) effects.push(`Cleared: ${plan.cleared.join(', ')}.`);
  return { blockers: [], summary: `Update the ${plan.taxYear} Form 1040-X.`, effects, figures: { taxYear: plan.taxYear } };
}

export function usAmendedWords(data, money = usd) {
  if (!data.started) return `No amended return for ${data.taxYear} yet.${data.acceptedInMyca ? ' The return MyCA filed can be the original.' : ''}`;
  const errors = data.checks.filter((item) => item.level === 'error');
  const net = data.lines['11'].B;
  return [`${data.taxYear} Form 1040-X: total tax ${money(data.lines['11'].A)} on the original, ${money(data.lines['11'].C)} corrected (${net >= 0 ? 'up' : 'down'} ${money(Math.abs(net))}).`, data.owed > 0 ? `You owe ${money(data.owed)} more.` : data.refund > 0 ? `Refund of ${money(data.refund)} more.` : data.appliedToNextYear > 0 ? `${money(data.appliedToNextYear)} applied to next year.` : 'No change to the refund or balance.', ...errors.map((item) => `To fix: ${item.message}`)].join(' ');
}
