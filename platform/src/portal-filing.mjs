import { runSandboxOperation } from './sandbox-adapter.mjs';
import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { regArg, companyAs, forRegistration, scopeKey } from './registrations.mjs';
import { reviewOf } from './gst-review.mjs';
import { recordFiling } from './filings.mjs';
import { filingRows } from './deadline-run.mjs';
import { isReturnPeriod, fpOf } from './return-period.mjs';
import { parseQuarter } from './tds-return.mjs';
import { localToday } from './dates.mjs';
import { normalizeClientId } from './books.mjs';

const ARN = /^[A-Z0-9]{10,20}$/;
const FORMS = { '24Q': 'salary', '26Q': 'other', '27Q': 'other' };

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function savesOf(state) {
  if (!state.portalSaves || typeof state.portalSaves !== 'object') state.portalSaves = {};
  return state.portalSaves;
}

function gstr1Payload(state, period, gstin) {
  const json = invoicesToGstr1Json(companyAs(state, gstin), forRegistration(state, state.invoices || [], gstin), fpOf(period), {
    creditNotes: forRegistration(state, state.creditNotes || [], gstin),
    debitNotes: forRegistration(state, state.debitNotes || [], gstin),
    channels: state.channels,
  });
  if (json.error) return fail(json.error, { hint: json.hint });
  const { hash, held, warnings, ...body } = json;
  return { ok: true, body, hash, held, warnings };
}

export async function saveGstr1ToPortal(state, args = {}, actor) {
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const regd = regArg(state, args.gstin);
  if (!regd.ok) return regd;
  const built = gstr1Payload(state, period, regd.gstin);
  if (!built.ok) return built;
  if (built.held.length) return fail('INVOICES_HELD', { held: built.held.map((row) => row.inum), hint: 'Fix the held invoices (see export_gstr1_json) before saving to the portal.' });
  const invoices = (built.body.b2b || []).reduce((n, row) => n + (row.inv || []).length, 0) + (built.body.b2cl || []).reduce((n, row) => n + (row.inv || []).length, 0) + (built.body.b2cs || []).length;
  const out = await runSandboxOperation({
    operationId: 'gst_save_gstr1',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { period, payload: built.body },
    payloadSummary: { period, gstin: regd.gstin, rows: invoices, draftHash: built.hash },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return { ...out, period, gstin: regd.gstin };
  const record = { period, gstin: regd.gstin, referenceId: out.data?.referenceId || '', draftHash: built.hash, savedOn: localToday(), mock: Boolean(out.mock), warnings: built.warnings };
  savesOf(state)[scopeKey(state, period, regd.gstin)] = record;
  return { ok: true, save: record, rows: invoices, mock: Boolean(out.mock) };
}

export async function fileGstr1OnPortal(state, args = {}, actor) {
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const regd = regArg(state, args.gstin);
  if (!regd.ok) return regd;
  const saved = savesOf(state)[scopeKey(state, period, regd.gstin)];
  if (!saved) return fail('NOT_SAVED', { hint: 'Save the GSTR-1 to the portal first ("save GSTR-1 for 2026-09 to the portal"), then file it.' });
  const built = gstr1Payload(state, period, regd.gstin);
  if (!built.ok) return built;
  if (built.hash !== saved.draftHash) return fail('DRAFT_CHANGED', { hint: 'The invoices changed since the save; save again, then file.' });
  const review = reviewOf(state, period, regd.gstin);
  if (!review.ok) return review;
  if (!review.data.approved) return fail('REVIEW_NOT_APPROVED', { hint: 'Approve the GST review for the month first; filing is the one step that cannot be undone.' });
  const pan = String(args.pan || state.company?.pan || '').trim().toUpperCase();
  if (!pan) return fail('PAN_REQUIRED');
  const otp = String(args.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) return fail('OTP_REQUIRED', { hint: 'Enter the six-digit EVC OTP the portal sent.' });
  const out = await runSandboxOperation({
    operationId: 'gst_file_gstr1_evc',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { period, pan, otp, summary: args.summary || { newSumFlag: true, reference_id: saved.referenceId } },
    payloadSummary: { period, gstin: regd.gstin, draftHash: saved.draftHash },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return { ...out, period, gstin: regd.gstin };
  const ackNum = String(out.data?.ackNum || '').toUpperCase();
  let filing = null;
  if (!out.mock && ARN.test(ackNum)) {
    const recorded = recordFiling(state, { returnType: 'GSTR-1', period, arn: ackNum, filedOn: localToday(), filedBy: 'portal', gstin: regd.gstin }, filingRows(state, localToday()));
    if (recorded.ok) filing = recorded.filing;
  }
  saved.filedAck = ackNum;
  saved.filedOn = localToday();
  return { ok: true, period, gstin: regd.gstin, ackNum, filing, mock: Boolean(out.mock) };
}

export async function generateTdsFvu(state, args = {}, actor) {
  const quarter = parseQuarter(args.quarter);
  if (!quarter) return fail('INVALID_QUARTER', { hint: 'Say the quarter as Q2 2026-27.' });
  const form = String(args.form || '26Q').trim().toUpperCase();
  if (!FORMS[form]) return fail('BAD_FORM', { hint: '24Q for salary, 26Q for other payments, 27Q for non-residents.' });
  const tan = String(args.tan || state.company?.tan || '').trim().toUpperCase();
  if (!tan) return fail('TAN_REQUIRED', { hint: 'Set the deductor TAN first (set_tds_deductor).' });
  const fy = (quarter.label.match(/(\d{4}-\d{2})/) || [])[1] || '';
  const out = await runSandboxOperation({
    operationId: 'tds_fvu_generate',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { taxYear: fy, quarter: quarter.label.split(' ')[0], form, tan, filingType: args.filingType || 'regular' },
    payloadSummary: { quarter: quarter.label, form, tan },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return { ...out, quarter: quarter.label, form };
  const job = out.data?.job || {};
  const record = { quarter: quarter.label, form, tan, jobId: String(job.job_id || job.id || ''), status: String(job.status || 'submitted'), fvu: String(job.fvu || ''), uploadUrl: String(job.url || ''), requestedOn: localToday(), mock: Boolean(out.mock) };
  state.tdsFvuJobs = Array.isArray(state.tdsFvuJobs) ? state.tdsFvuJobs : [];
  state.tdsFvuJobs = state.tdsFvuJobs.filter((item) => !(item.quarter === record.quarter && item.form === record.form));
  state.tdsFvuJobs.push(record);
  return { ok: true, job: record, note: out.data?.note || '', mock: Boolean(out.mock) };
}

export function portalStatus(state) {
  const saves = Object.values(savesOf(state)).sort((a, b) => a.period.localeCompare(b.period) || a.gstin.localeCompare(b.gstin));
  return { ok: true, data: { gstr1: saves, fvu: Array.isArray(state.tdsFvuJobs) ? state.tdsFvuJobs : [] } };
}

export function portalWords(name, result) {
  if (name === 'save_gstr1_portal') return `${result.mock ? 'Simulated: ' : ''}GSTR-1 for ${result.save.period}${result.save.gstin ? ` (${result.save.gstin})` : ''} saved to the portal${result.save.referenceId ? `, reference ${result.save.referenceId}` : ''}: ${result.rows} ${result.rows === 1 ? 'invoice' : 'invoices'}. ${result.mock ? 'Nothing was sent.' : 'Approve the review, then file it with the EVC OTP.'}`;
  if (name === 'file_gstr1_portal') return `${result.mock ? 'Simulated: ' : ''}GSTR-1 for ${result.period} filed${result.ackNum ? `, acknowledgement ${result.ackNum}` : ''}.${result.filing ? ' Recorded as filed.' : result.mock ? ' Nothing was sent and nothing is recorded as filed.' : ' Record the filing with its ARN if it did not record itself.'}`;
  if (name === 'generate_tds_fvu') return `${result.mock ? 'Simulated: ' : ''}FVU job for ${result.job.form} ${result.job.quarter}: ${result.job.status}${result.job.jobId ? ` (${result.job.jobId})` : ''}.${result.job.fvu ? ` File: ${result.job.fvu}.` : ''}${result.note ? ` ${result.note}` : ''}`;
  if (name === 'portal_status') {
    const d = result.data;
    if (!d.gstr1.length && !d.fvu.length) return 'Nothing has been saved to the GST portal or sent for FVU yet.';
    return [...d.gstr1.map((s) => `· GSTR-1 ${s.period} ${s.gstin}: saved ${s.savedOn}${s.filedAck ? `, filed ${s.filedOn} (${s.filedAck})` : ''}${s.mock ? ' (simulated)' : ''}`), ...d.fvu.map((j) => `· FVU ${j.form} ${j.quarter}: ${j.status}${j.mock ? ' (simulated)' : ''}`)].join('\n');
  }
  return '';
}
