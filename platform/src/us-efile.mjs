import { encryptSecret, decryptSecret } from './credential-vault.mjs';
import { performExternalAction } from './action-gate.mjs';
import { productionCallsEnabled } from './runtime-config.mjs';
import { normalizeClientId } from './books.mjs';
import { appendAuditEvent, stateDigest } from './ca-api.mjs';
import { buildMefSubmission, makeSubmissionId, returnDigest, routingNumberValid } from './us-mef-xml.mjs';
import { simulateAcknowledgement } from './us-mef-sim.mjs';
import { irsMefSettings, irsMefMissing } from './us-mef-settings.mjs';
import { transmissionZip } from './us-mef-zip.mjs';
import { efileRoute, partnerMode, partnerSetup, startPartnerFiling } from './us-filing-partner.mjs';

const PIN = /^\d{5}$/;
const IP_PIN = /^\d{6}$/;
const ACCOUNT = /^[A-Za-z0-9-]{1,17}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SANDBOX_EFIN = '000000';
const SANDBOX_SOFTWARE_ID = '00000000';
const STEPS = new Set(['profile', 'forms', 'interview', 'review', 'sign']);

export const CONSENT_8879_TEXT = 'Under penalties of perjury, I declare that I have examined a copy of my electronic individual income tax return and accompanying schedules and statements for the tax year, and to the best of my knowledge and belief, it is true, correct, and complete. I consent to allow my intermediate service provider, transmitter, or electronic return originator to send my return to the IRS and to receive from the IRS an acknowledgement of receipt or reason for rejection of the transmission, the reason for any delay in processing the return or refund, and the date of any refund. I am signing this return by entering a self-selected five-digit PIN.';

export const REJECTION_GUIDE = Object.freeze({
  'IND-031-04': { fix: "Your prior-year AGI doesn't match IRS records. Use the AGI from last year's original return (line 11), enter 0 if you used a non-filer tool last year, or use last year's self-select PIN instead.", step: 'sign' },
  'IND-032-04': { fix: "Your spouse's prior-year AGI doesn't match IRS records. Use the AGI from last year's original return, or 0 if your spouse did not file.", step: 'sign' },
  'IND-181-01': { fix: 'The IRS has issued you an Identity Protection PIN. Enter the six-digit IP PIN from your CP01A letter or your IRS online account.', step: 'sign' },
  'IND-182-01': { fix: "The Identity Protection PIN doesn't match. Get your current IP PIN from your IRS online account; a new one is issued every year.", step: 'sign' },
  'R0000-500-01': { fix: 'Your name or SSN does not match Social Security records. Enter your last name and SSN exactly as on your Social Security card.', step: 'profile' },
  'R0000-503-02': { fix: "Your spouse's name or SSN does not match Social Security records. Enter them exactly as on the Social Security card.", step: 'profile' },
  'R0000-504-02': { fix: "A dependent's name or SSN does not match Social Security records. Check the spelling and SSN on their card.", step: 'interview' },
  'IND-507-01': { fix: 'Someone else already claimed this dependent this year. If you are entitled to claim them, you will need to file on paper; MyCA can print the return for you.', step: 'interview' },
  'R0000-902-01': { fix: 'A return for this SSN was already accepted this year. If you need to change it, file an amended return (Form 1040-X) instead.', step: 'review' },
});

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function bookOf(state) {
  if (!state.usEfile || typeof state.usEfile !== 'object') state.usEfile = { returns: {}, submissionSeq: 0 };
  if (!state.usEfile.returns || typeof state.usEfile.returns !== 'object') state.usEfile.returns = {};
  return state.usEfile;
}

function peekBook(state) {
  const book = state.usEfile;
  return book && typeof book === 'object' && book.returns && typeof book.returns === 'object' ? book : { returns: {}, submissionSeq: 0 };
}

function yearOf(args) {
  const year = Number(args?.taxYear);
  return Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : null;
}

export function efileMode() {
  if (efileRoute() === 'partner') return partnerMode();
  return productionCallsEnabled() && irsMefMissing().length === 0 ? 'live' : 'sandbox';
}

async function engineReturn(state, taxYear) {
  let engine;
  try {
    engine = await import('./us-return.mjs');
  } catch {
    return fail('US_RETURN_ENGINE_MISSING', { hint: 'The Form 1040 engine is not installed in this build.' });
  }
  const loader = engine.computedForm1040ForFiling || engine.computedForm1040;
  if (typeof loader !== 'function') return fail('US_RETURN_ENGINE_MISSING');
  return loader(state, { taxYear });
}

async function computedReturn(state, taxYear, options) {
  const out = typeof options?.computedReturn === 'function' ? await options.computedReturn(state, taxYear) : await engineReturn(state, taxYear);
  if (!out || out.ok === false) return fail(out?.error || 'RETURN_NOT_COMPUTED', { hint: out?.hint || 'Finish the interview so the return can be computed.' });
  const data = out.data || out;
  if (Number(data.taxYear) !== taxYear) return fail('RETURN_YEAR_MISMATCH', { taxYear });
  return { ok: true, data };
}

function mask(account) {
  const text = String(account || '');
  return text ? `****${text.slice(-4)}` : '';
}

function priorYearOf(args, who) {
  const nested = args.priorYear?.[who] || {};
  const agi = nested.agi ?? args[`${who}PriorYearAgi`] ?? (who === 'taxpayer' ? args.priorYearAgi : undefined);
  const pin = nested.pin ?? args[`${who}PriorYearPin`] ?? (who === 'taxpayer' ? args.priorYearPin : undefined);
  return { agi, pin };
}

function ipPinOf(args, who) {
  const value = args.identityProtectionPin;
  if (value && typeof value === 'object') return value[who];
  return who === 'taxpayer' ? value : args.spouseIdentityProtectionPin;
}

function signer(args, who, problems) {
  const pin = String(args[`${who}Pin`] ?? '');
  if (!PIN.test(pin) || pin === '00000') problems.push({ code: 'SIGNATURE_PIN_INVALID', message: `The ${who} signature PIN must be five digits and not 00000.`, fix: 'Choose any five digits as your signature PIN.', step: 'sign' });
  const prior = priorYearOf(args, who);
  const priorPin = prior.pin == null || prior.pin === '' ? '' : String(prior.pin);
  const priorAgi = prior.agi == null || prior.agi === '' ? null : Number(prior.agi);
  if (priorPin && !PIN.test(priorPin)) problems.push({ code: 'PRIOR_YEAR_PIN_INVALID', message: `The ${who}'s prior-year PIN must be five digits.`, fix: "Enter last year's five-digit self-select PIN, or use last year's AGI instead.", step: 'sign' });
  if (!priorPin && !(Number.isInteger(priorAgi) && priorAgi >= 0)) problems.push({ code: 'PRIOR_YEAR_VERIFICATION_MISSING', message: `The ${who}'s prior-year AGI or prior-year PIN is needed.`, fix: "Enter last year's AGI in whole dollars (0 if you didn't file last year).", step: 'sign' });
  const ipPin = ipPinOf(args, who);
  if (ipPin != null && ipPin !== '' && !IP_PIN.test(String(ipPin))) problems.push({ code: 'IP_PIN_INVALID', message: `The ${who}'s Identity Protection PIN must be six digits.`, fix: 'Copy the six-digit IP PIN from the IRS letter or your IRS online account.', step: 'sign' });
  return { pin, priorYearPin: priorPin || undefined, priorYearAgi: priorPin ? undefined : priorAgi, ipPin: ipPin ? String(ipPin) : undefined };
}

function bankProblems(bank, what, problems) {
  if (!routingNumberValid(bank.routing)) problems.push({ code: 'ROUTING_INVALID', message: `The ${what} routing number isn't a valid US routing number.`, fix: 'Check the nine-digit routing number.', step: 'sign' });
  if (!ACCOUNT.test(String(bank.account || ''))) problems.push({ code: 'ACCOUNT_INVALID', message: `The ${what} account number must be 1 to 17 letters or digits.`, fix: 'Re-enter the account number.', step: 'sign' });
  if (!['checking', 'savings'].includes(bank.accountType)) problems.push({ code: 'ACCOUNT_TYPE_INVALID', message: `Say whether the ${what} account is checking or savings.`, fix: 'Choose checking or savings.', step: 'sign' });
}

function moneyPlan(args, lines, problems) {
  const refundDue = Number(lines?.['35a'] || 0);
  const owed = Number(lines?.['37'] || 0);
  let refund = null;
  let payment = null;
  if (refundDue > 0) {
    const r = args.refund || {};
    if (r.method === 'direct_deposit') {
      bankProblems(r, 'refund', problems);
      refund = { method: 'direct_deposit', routing: String(r.routing || ''), account: String(r.account || ''), accountType: r.accountType };
    } else if (r.method === 'check') refund = { method: 'check' };
    else problems.push({ code: 'REFUND_METHOD_MISSING', message: 'Choose how to get your refund.', fix: 'Pick direct deposit or a paper check.', step: 'sign' });
  }
  if (owed > 0) {
    const p = args.payment || {};
    if (p.method === 'direct_debit') {
      bankProblems(p, 'payment', problems);
      if (!DATE.test(String(p.date || ''))) problems.push({ code: 'PAYMENT_DATE_MISSING', message: 'Pick the date the IRS should debit your account.', fix: 'Choose a date on or before the filing deadline.', step: 'sign' });
      if (!/^\d{10}$/.test(String(p.phone || ''))) problems.push({ code: 'PAYMENT_PHONE_MISSING', message: 'The IRS needs a ten-digit daytime phone number for a direct debit.', fix: 'Enter your daytime phone number.', step: 'sign' });
      payment = { method: 'direct_debit', routing: String(p.routing || ''), account: String(p.account || ''), accountType: p.accountType, date: String(p.date || ''), phone: String(p.phone || ''), amount: owed };
    } else if (p.method === 'later') payment = { method: 'later' };
    else problems.push({ code: 'PAYMENT_METHOD_MISSING', message: 'Choose how to pay the tax you owe.', fix: 'Pick a direct debit from your bank, or pay later with IRS Direct Pay.', step: 'sign' });
  }
  return { refund, payment, refundDue, owed };
}

function returnProblemsOnly(computed, signature, payment, device) {
  const trial = buildMefSubmission({ ...computed }, { efin: SANDBOX_EFIN, softwareId: SANDBOX_SOFTWARE_ID, submissionId: `${SANDBOX_EFIN}2026001aaaaaaa`, timestamp: 'T', signature, payment, device });
  return trial.ok ? [] : trial.problems;
}

function seal(secret) {
  return encryptSecret(JSON.stringify(secret));
}

function unseal(record) {
  try {
    return JSON.parse(decryptSecret(record) || 'null');
  } catch {
    return null;
  }
}

function summary8879(taxYear, computed, record) {
  const lines = computed.lines || {};
  return {
    taxYear,
    form: '8879',
    filingStatus: computed.filingStatus,
    adjustedGrossIncome: Number(lines['11'] || 0),
    totalTax: Number(lines['24'] || 0),
    federalWithheld: Number(lines['25d'] || 0),
    refund: Number(lines['35a'] || 0),
    amountOwed: Number(lines['37'] || 0),
    refundMethod: record.refundMethod,
    paymentMethod: record.paymentMethod,
    account: record.maskedAccount,
    signedAt: record.signedAt,
    signers: record.signers,
    consent: CONSENT_8879_TEXT,
  };
}

function audit(state, action, beforeHash, metadata) {
  appendAuditEvent(state, { actorId: metadata.actorId || 'owner', clientId: normalizeClientId(state.activeClientId), action, beforeHash, afterHash: stateDigest(state), metadata });
}

export async function signUsReturn(state, args = {}, actor, options = {}) {
  const taxYear = yearOf(args);
  if (!taxYear) return fail('TAX_YEAR_INVALID', { hint: 'Pass taxYear, for example 2025.' });
  if (args.consent8879 !== true) return fail('CONSENT_REQUIRED', { hint: 'Read and accept the Form 8879 declaration before signing.', consent: CONSENT_8879_TEXT });
  const current = peekBook(state).returns[String(taxYear)];
  const latest = current?.submissions?.at(-1);
  if (latest && latest.status !== 'rejected') return fail(latest.status === 'accepted' ? 'ALREADY_ACCEPTED' : 'ALREADY_SUBMITTED', { submissionId: latest.submissionId });
  const loaded = await computedReturn(state, taxYear, options);
  if (!loaded.ok) return loaded;
  const computed = loaded.data;
  const problems = [];
  const signature = { taxpayer: signer(args, 'taxpayer', problems), date: options.today || new Date().toISOString().slice(0, 10) };
  if (computed.filingStatus === 'mfj') signature.spouse = signer(args, 'spouse', problems);
  const { refund, payment } = moneyPlan(args, computed.lines, problems);
  if (problems.length) return fail('SIGNATURE_INVALID', { problems });
  const withRefund = { ...computed, refund };
  const device = args.device && typeof args.device === 'object' ? { ipAddress: String(args.device.ipAddress || ''), deviceId: String(args.device.deviceId || ''), deviceType: args.device.deviceType, at: String(args.device.at || '') } : null;
  const returnProblems = returnProblemsOnly(withRefund, signature, payment, device);
  if (returnProblems.length) return fail('RETURN_NOT_READY', { problems: returnProblems });
  const beforeHash = stateDigest(state);
  const bank = refund?.account || payment?.account || '';
  const record = {
    taxYear,
    signedAt: options.now || new Date().toISOString(),
    returnHash: returnDigest(computed),
    filingStatus: computed.filingStatus,
    signers: computed.filingStatus === 'mfj' ? ['taxpayer', 'spouse'] : ['taxpayer'],
    refundMethod: refund?.method || null,
    paymentMethod: payment?.method || null,
    maskedAccount: mask(bank),
    sealed: seal({ signature, refund, payment, device }),
  };
  const book = bookOf(state);
  const entry = book.returns[String(taxYear)] || { taxYear, submissions: [] };
  entry.signature = record;
  book.returns[String(taxYear)] = entry;
  audit(state, 'us_efile.sign', beforeHash, { actorId: actor?.userId, taxYear, returnHash: record.returnHash, refundMethod: record.refundMethod, paymentMethod: record.paymentMethod });
  return { ok: true, signed: summary8879(taxYear, computed, record), mode: efileMode() };
}

function irsTimestamp(iso) {
  return `${iso.slice(0, 19)}+00:00`;
}

export async function fileUsReturn(state, args = {}, actor, options = {}) {
  const taxYear = yearOf(args);
  if (!taxYear) return fail('TAX_YEAR_INVALID');
  if (efileRoute() === 'partner') return filePartner(state, taxYear, args, actor, options);
  const entry = peekBook(state).returns[String(taxYear)];
  if (!entry?.signature) return fail('NOT_SIGNED', { hint: 'Sign the return (Form 8879) first.', step: 'sign' });
  const latest = entry.submissions?.at(-1);
  if (latest && latest.status === 'accepted') return fail('ALREADY_ACCEPTED', { submissionId: latest.submissionId });
  if (latest && latest.status === 'submitted') return fail('ALREADY_SUBMITTED', { submissionId: latest.submissionId, hint: 'Wait for the IRS acknowledgement.' });
  const loaded = await computedReturn(state, taxYear, options);
  if (!loaded.ok) return loaded;
  const computed = loaded.data;
  if (returnDigest(computed) !== entry.signature.returnHash) return fail('RETURN_CHANGED_SINCE_SIGNING', { hint: 'The return changed after you signed it. Review it and sign again.', step: 'sign' });
  const secret = unseal(entry.signature.sealed);
  if (!secret) return fail('SIGNATURE_UNREADABLE', { hint: 'Sign the return again on this device.', step: 'sign' });
  const settings = irsMefSettings();
  const configured = irsMefMissing(settings).length === 0;
  const mode = efileMode();
  const efin = configured ? settings.efin : SANDBOX_EFIN;
  const softwareId = configured ? settings.softwareId : SANDBOX_SOFTWARE_ID;
  const nowIso = options.now || new Date().toISOString();
  const book = bookOf(state);
  const sequence = Number(book.submissionSeq || 0) + 1;
  const submissionId = makeSubmissionId(efin, nowIso.slice(0, 10), sequence);
  const built = buildMefSubmission({ ...computed, refund: secret.refund }, { efin, softwareId, submissionId, timestamp: irsTimestamp(nowIso), signature: secret.signature, payment: secret.payment, device: secret.device });
  if (!built.ok) return fail('RETURN_NOT_READY', { problems: built.problems });
  const beforeHash = stateDigest(state);
  let transport = 'simulator';
  let ack = null;
  if (configured) {
    transport = 'mef';
    const zip = transmissionZip([built]);
    const sent = await performExternalAction(state, {
      actionId: 'irs_mef_send',
      actor,
      approvalId: args.caApprovalId || '',
      approvalSubject: { operationId: 'irs_mef_send', taxYear, returnHash: entry.signature.returnHash },
      params: { submissionId, taxYear, xmlSha256: built.xmlSha256 },
      clientId: normalizeClientId(state.activeClientId),
      metadata: { submissionId, taxYear },
    }, (transports) => transports.irs.sendSubmissions({ zip, submissionIds: [submissionId] }));
    if (!sent.ok) return { ...sent, mode, submissionId };
  } else {
    const acceptedSsns = new Set(options.acceptedSsns || []);
    ack = simulateAcknowledgement(built, { acceptedSsns, receivedAt: nowIso });
  }
  book.submissionSeq = sequence;
  const submission = { submissionId, taxYear, mode, transport, submittedAt: nowIso, xmlSha256: built.xmlSha256, returnHash: entry.signature.returnHash, documentCount: built.documentCount, status: 'submitted', ack: null };
  if (ack) applyAck(submission, ack);
  const stored = book.returns[String(taxYear)];
  stored.submissions = [...(stored.submissions || []), submission];
  audit(state, 'us_efile.submit', beforeHash, { actorId: actor?.userId, taxYear, submissionId, mode, transport, xmlSha256: built.xmlSha256 });
  return { ok: true, submissionId, status: 'submitted', mode };
}

// 2027 season: the embedded partner signs Form 8879 with the filer and transmits, so no MyCA
// signature is needed first. The cloud passes partnerScope (the business id) so the partner's
// webhook can find the return again.
async function filePartner(state, taxYear, args, actor, options) {
  const loaded = await computedReturn(state, taxYear, options);
  if (!loaded.ok) return loaded;
  const contact = args.contact && typeof args.contact === 'object' ? { email: String(args.contact.email || '').slice(0, 200), phone: String(args.contact.phone || '').replace(/\D/g, '').slice(0, 15) } : {};
  return startPartnerFiling(state, { taxYear, computed: loaded.data, scope: args.partnerScope, contact, shareTins: args.shareTins === true }, actor, options);
}

function applyAck(submission, ack) {
  const accepted = /^accepted$/i.test(String(ack.status || ''));
  const rejected = /^rejected$/i.test(String(ack.status || ''));
  if (!accepted && !rejected) return false;
  submission.status = accepted ? 'accepted' : 'rejected';
  submission.ack = {
    status: submission.status,
    statusDate: String(ack.statusDate || ''),
    acknowledgedAt: String(ack.acknowledgedAt || ack.statusDate || ''),
    errors: (ack.errors || []).map((e) => ({ ruleNumber: String(e.ruleNumber || ''), severity: String(e.severity || ''), message: String(e.message || '').slice(0, 500), xpath: String(e.xpath || '').slice(0, 300) })),
  };
  return true;
}

export function rejectionsOf(errors = []) {
  return errors.map((e) => {
    const guide = REJECTION_GUIDE[e.ruleNumber];
    const step = guide?.step && STEPS.has(guide.step) ? guide.step : 'review';
    return { code: e.ruleNumber, message: e.message, fix: guide?.fix || 'Review this part of your return, correct it, sign again and resubmit. You have 10 days from the rejection to resubmit and keep your original filing date.', step };
  });
}

export function usEfileStatus(state, args = {}) {
  const taxYear = yearOf(args);
  if (!taxYear) return fail('TAX_YEAR_INVALID');
  const entry = peekBook(state).returns[String(taxYear)];
  const latest = entry?.submissions?.at(-1) || null;
  const route = efileRoute();
  const partner = entry?.partner ? { provider: entry.partner.provider, startedAt: entry.partner.startedAt } : null;
  const base = { taxYear, route, partner, mode: latest?.mode || entry?.partner?.mode || efileMode(), submissionId: latest?.submissionId || null, acceptedAt: null, rejections: [] };
  if (route === 'partner' && entry?.partner && (!latest || latest.status === 'rejected') && entry.partner.status === 'in_progress') return { ok: true, ...base, status: 'in_progress', attempts: entry.submissions?.length || 0, rejections: latest ? rejectionsOf(latest.ack?.errors) : [] };
  if (!entry || (!entry.signature && !latest)) return { ok: true, ...base, status: 'not_filed' };
  if (!latest) return { ok: true, ...base, status: 'signed', signedAt: entry.signature.signedAt };
  const status = latest.status;
  return {
    ok: true,
    ...base,
    status,
    submittedAt: latest.submittedAt,
    acceptedAt: status === 'accepted' ? latest.ack?.acknowledgedAt || latest.ack?.statusDate || null : null,
    rejections: status === 'rejected' ? rejectionsOf(latest.ack?.errors) : [],
    attempts: entry.submissions.length,
  };
}

export async function fetchUsEfileAcks(state, args = {}, actor) {
  const book = peekBook(state);
  const pending = Object.values(book.returns).flatMap((entry) => (entry.submissions || []).filter((s) => s.status === 'submitted' && s.transport === 'mef'));
  if (!pending.length) return { ok: true, checked: 0, updated: [] };
  const ids = pending.map((s) => s.submissionId);
  const got = await performExternalAction(state, {
    actionId: 'irs_mef_acks',
    actor,
    params: { submissionIds: ids },
    clientId: normalizeClientId(state.activeClientId),
  }, (transports) => transports.irs.getAcks({ submissionIds: ids }));
  if (!got.ok) return got;
  const beforeHash = stateDigest(state);
  const updated = [];
  for (const ack of got.data?.acks || []) {
    const submission = pending.find((s) => s.submissionId === ack.submissionId);
    if (submission && applyAck(submission, ack)) updated.push({ submissionId: submission.submissionId, status: submission.status });
  }
  if (updated.length) audit(state, 'us_efile.acks', beforeHash, { actorId: actor?.userId, updated });
  return { ok: true, checked: ids.length, updated };
}

export function usEfileSetup() {
  const settings = irsMefSettings();
  return { ok: true, mode: efileMode(), route: efileRoute(), configured: irsMefMissing(settings).length === 0, missing: irsMefMissing(settings), host: settings.baseUrl, partner: partnerSetup() };
}

export const SEALED_PENDING_TOOLS = Object.freeze(new Set(['sign_us_return']));

export function sealPendingArgs(name, args = {}) {
  if (!SEALED_PENDING_TOOLS.has(name)) return args;
  return { taxYear: args.taxYear, sealedArgs: seal(args) };
}

export function openPendingArgs(name, args = {}) {
  if (!SEALED_PENDING_TOOLS.has(name) || typeof args.sealedArgs !== 'object' || !args.sealedArgs) return args;
  return unseal(args.sealedArgs) || args;
}

export function signPreview(state, args = {}) {
  const taxYear = yearOf(args);
  const blockers = [];
  if (!taxYear) blockers.push('Say which tax year to sign.');
  if (args.consent8879 !== true) blockers.push('Read and accept the Form 8879 declaration first.');
  const latest = taxYear ? peekBook(state).returns[String(taxYear)]?.submissions?.at(-1) : null;
  if (latest && latest.status !== 'rejected') blockers.push(latest.status === 'accepted' ? `The ${taxYear} return was already accepted by the IRS.` : `The ${taxYear} return is already submitted and waiting for the IRS.`);
  const account = args.refund?.account || args.payment?.account;
  return {
    blockers,
    summary: `Sign your ${taxYear || ''} federal return (Form 8879) with your self-select PIN.`,
    effects: [
      args.refund?.method === 'direct_deposit' ? `Refund by direct deposit to account ${mask(account)}.` : args.refund?.method === 'check' ? 'Refund by paper check.' : '',
      args.payment?.method === 'direct_debit' ? `Tax owed debited from account ${mask(account)} on ${args.payment.date}.` : args.payment?.method === 'later' ? 'You will pay what you owe separately, by the due date.' : '',
      'Nothing is sent to the IRS until you file.',
    ].filter(Boolean),
    figures: { taxYear },
    pinned: sealPendingArgs('sign_us_return', args),
  };
}

export function filePreview(state, args = {}) {
  const taxYear = yearOf(args);
  const entry = taxYear ? peekBook(state).returns[String(taxYear)] : null;
  const latest = entry?.submissions?.at(-1);
  const blockers = [];
  const route = efileRoute();
  if (!taxYear) blockers.push('Say which tax year to file.');
  else if (!entry?.signature && route !== 'partner') blockers.push(`Sign the ${taxYear} return first.`);
  if (latest?.status === 'accepted') blockers.push(`The ${taxYear} return was already accepted by the IRS.`);
  if (latest?.status === 'submitted') blockers.push(`The ${taxYear} return is already submitted; wait for the IRS acknowledgement.`);
  const mode = efileMode();
  if (route === 'partner') {
    const label = partnerSetup().label || 'our IRS-authorised e-file partner';
    return {
      blockers,
      summary: `Continue to e-file your ${taxYear} federal return with ${label}.`,
      effects: [
        'Your name, address, dependents and tax forms are passed on so you do not type them again.',
        partnerSetup().sendsTins ? 'Your SSN is passed on too, sealed in transit.' : 'You enter your SSN once more on the filing screen.',
        `You review and sign Form 8879 there; ${label} sends the return to the IRS and MyCA shows the IRS answer.`,
        mode === 'live' ? '' : 'Sandbox mode: nothing reaches the IRS.',
      ].filter(Boolean),
      figures: { taxYear, mode, route },
    };
  }
  return {
    blockers,
    summary: mode === 'live' ? `E-file your ${taxYear} federal return with the IRS.` : `Send your ${taxYear} federal return to the e-file sandbox. Nothing reaches the IRS.`,
    effects: [mode === 'live' ? 'Once the IRS accepts it, it cannot be withdrawn; changes need Form 1040-X.' : 'Sandbox mode: the return is checked the way the IRS would check it, but it is not filed.', entry?.signature?.maskedAccount ? `Bank account ${entry.signature.maskedAccount}.` : ''].filter(Boolean),
    figures: { taxYear, mode },
  };
}
