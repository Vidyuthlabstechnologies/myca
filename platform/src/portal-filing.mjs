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

function savedFor(state, args) {
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const regd = regArg(state, args.gstin);
  if (!regd.ok) return regd;
  const saved = savesOf(state)[scopeKey(state, period, regd.gstin)];
  if (!saved) return fail('NOT_SAVED', { hint: 'Save the GSTR-1 to the portal first, then check, submit and file it.' });
  return { ok: true, period, gstin: regd.gstin, saved };
}

function unchanged(state, found) {
  const built = gstr1Payload(state, found.period, found.gstin);
  if (!built.ok) return built;
  if (built.hash !== found.saved.draftHash) return fail('DRAFT_CHANGED', { hint: 'The invoices changed since the save; save again, then file.' });
  return { ok: true };
}

const PROCESSING = { P: 'processed', PE: 'processed_with_errors', ER: 'error', IP: 'in_progress', REC: 'received' };

export async function checkGstr1OnPortal(state, args = {}, actor) {
  const found = savedFor(state, args);
  if (!found.ok) return found;
  if (!found.saved.referenceId) return fail('NO_REFERENCE', { hint: 'The save has no portal reference; save it again.' });
  const out = await runSandboxOperation({
    operationId: 'gst_gstr1_processing',
    actorId: actor?.userId || 'owner',
    actor,
    params: { period: found.period, referenceId: found.saved.referenceId },
    payloadSummary: { period: found.period, gstin: found.gstin },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin };
  const status = PROCESSING[out.data?.status] || (out.data?.status ? 'unknown' : 'in_progress');
  found.saved.processing = status;
  found.saved.processingErrors = out.data?.errorReport || null;
  found.saved.checkedOn = localToday();
  return { ok: true, period: found.period, gstin: found.gstin, processing: status, errorReport: out.data?.errorReport || null, mock: Boolean(out.mock) };
}

export async function submitGstr1OnPortal(state, args = {}, actor) {
  const found = savedFor(state, args);
  if (!found.ok) return found;
  if (found.saved.filedAck) return fail('ALREADY_FILED', { ackNum: found.saved.filedAck });
  const same = unchanged(state, found);
  if (!same.ok) return same;
  if (found.saved.processing === 'processed_with_errors' || found.saved.processing === 'error') return fail('SAVE_HAS_ERRORS', { errorReport: found.saved.processingErrors, hint: 'The portal refused some invoices; fix them, save again, then submit.' });
  const out = await runSandboxOperation({
    operationId: 'gst_gstr1_proceed',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { period: found.period },
    payloadSummary: { period: found.period, gstin: found.gstin, draftHash: found.saved.draftHash },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin };
  found.saved.submittedOn = localToday();
  found.saved.submitReference = String(out.data?.referenceId || '');
  return { ok: true, period: found.period, gstin: found.gstin, submittedOn: found.saved.submittedOn, mock: Boolean(out.mock) };
}

async function readGstr1Summary(state, period, gstin, actor, args = {}) {
  const out = await runSandboxOperation({
    operationId: 'gst_gstr1_summary',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { period },
    payloadSummary: { period, gstin },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return out;
  return { ok: true, summary: out.data.summary, mock: Boolean(out.mock) };
}

function summaryTotals(summary) {
  const rows = (summary?.sec_sum || []).filter((row) => Number(row.ttl_rec || 0) > 0 || Number(row.ttl_val || 0) !== 0);
  return rows.map((row) => ({ section: String(row.sec_nm || ''), records: Number(row.ttl_rec || 0), value: Number(row.ttl_val || 0), tax: Number(row.ttl_tax || 0), igst: Number(row.ttl_igst || 0), cgst: Number(row.ttl_cgst || 0), sgst: Number(row.ttl_sgst || 0), cess: Number(row.ttl_cess || 0) }));
}

export async function gstr1PortalSummary(state, args = {}, actor) {
  const found = savedFor(state, args);
  if (!found.ok) return found;
  if (!found.saved.submittedOn) return fail('NOT_SUBMITTED', { hint: 'Submit the GSTR-1 first; the portal builds the summary after that.' });
  const read = await readGstr1Summary(state, found.period, found.gstin, actor, args);
  if (!read.ok) return { ...read, period: found.period, gstin: found.gstin };
  return { ok: true, period: found.period, gstin: found.gstin, sections: summaryTotals(read.summary), mock: read.mock };
}

export async function requestGstr1Evc(state, args = {}, actor) {
  const found = savedFor(state, args);
  if (!found.ok) return found;
  if (!found.saved.submittedOn) return fail('NOT_SUBMITTED', { hint: 'Submit the GSTR-1 first, then ask for the EVC OTP.' });
  const pan = String(args.pan || state.company?.pan || '').trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return fail('PAN_REQUIRED', { hint: 'Add the PAN of the authorised signatory to the company details.' });
  const out = await runSandboxOperation({
    operationId: 'gst_evc_otp',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { pan },
    payloadSummary: { period: found.period, gstin: found.gstin },
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  if (!out.ok) return { ...out, period: found.period, gstin: found.gstin };
  return { ok: true, period: found.period, gstin: found.gstin, sent: true, mock: Boolean(out.mock) };
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
  if (!saved.submittedOn) {
    const submitted = await submitGstr1OnPortal(state, { ...args, period, gstin: regd.gstin }, actor);
    if (!submitted.ok) return submitted;
  }
  let summary = args.summary;
  if (!summary) {
    const read = await readGstr1Summary(state, period, regd.gstin, actor, args);
    if (!read.ok) return { ...read, period, gstin: regd.gstin };
    summary = read.summary;
  }
  const out = await runSandboxOperation({
    operationId: 'gst_file_gstr1_evc',
    actorId: actor?.userId || 'owner',
    actor,
    caApprovalId: args.caApprovalId || '',
    params: { period, pan, otp, summary },
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
