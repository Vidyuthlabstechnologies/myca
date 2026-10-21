import { createHash } from 'node:crypto';
import { performExternalAction } from './action-gate.mjs';
import { loadChannelConfig } from './channel-connectors.mjs';
import { contractor1099File } from './us-1099.mjs';
import { csvRows } from './text-safe.mjs';
import { localToday } from './dates.mjs';

export const TRACK1099_HOST = 'https://www.track1099.com';
const MAX_JOBS = 200;
const TEMPLATE = ['Reference ID (Optional)', 'Business Name', 'First Name', 'Middle Name', 'Last Name', 'Name Suffix', 'Federal ID type (5=INDIVIDUAL, 6=BUSINESS, 7=UNKNOWN) [Deprecated values: 1=EIN, 2=SSN, 3=ITIN, 4=ATIN]', 'Federal ID No.', 'Business Name Line 2', 'Street Address', 'Street Address Line 2', 'City', 'State (2 letters)', 'Zip', 'Email', "Acc't No. (optional)", 'Office Code (optional)', 'Box 1 Nonemployee compensation', 'Box 2 (blank=false, 1=true) Payer made direct sales of $5,000 or more of consumer products to a buyer (recipient) for resale', 'Box 4 Federal income tax withheld', 'Box 5 State tax withheld', 'Box 6 State', "Box 6 Payer's State no.", 'Box 7 State Income', 'Second TIN Notice (1=true, else blank)', 'Box 5b Local Tax Withheld', 'Box 6b Locality', 'Box 7b Local Income'];
const INDIVIDUAL = new Set(['individual', 'sole-prop', 'sole-proprietor', 'sole proprietor', 'sole_proprietor', 'llc-single', 'single-member-llc']);
const BUSINESS = new Set(['llc', 'partnership', 'c-corp', 's-corp', 'corporation', 'trust', 'estate', 'business']);

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function referenceId(name, year) {
  return `MYCA-${year}-${createHash('sha256').update(String(name).toLowerCase()).digest('hex').slice(0, 8).toUpperCase()}`;
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] || '', middle: '', last: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts.at(-1) };
}

export function parseUsAddress(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const m = /^(.*?),\s*([A-Za-z .'-]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(value);
  if (!m) return { street: value, city: '', state: '', zip: '' };
  return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
}

function vendorOf(state, name) {
  const key = String(name || '').trim().toLowerCase();
  const vendor = (state.vendors || []).find((v) => String(v.name || '').trim().toLowerCase() === key) || null;
  if (vendor && !vendor.address) {
    const party = (state.parties || []).find((p) => String(p.name || '').trim().toLowerCase() === key);
    if (party?.address) return { ...vendor, address: party.address };
  }
  return vendor;
}

export function track1099Csv(state, args = {}) {
  const file = contractor1099File(state, args);
  if (!file.ok) return file;
  const d = file.data;
  const held = [];
  const rows = d.payees.map((payee) => {
    const vendor = vendorOf(state, payee.recipient) || {};
    const type = String(payee.entityType || '').toLowerCase();
    const individual = INDIVIDUAL.has(type);
    const business = BUSINESS.has(type);
    const names = individual ? splitName(vendor.w9?.name || payee.recipient) : { first: '', middle: '', last: '' };
    const address = parseUsAddress(vendor.address || '');
    if (!payee.w9Received) held.push({ recipient: payee.recipient, reason: 'NO_W9' });
    if (!address.zip) held.push({ recipient: payee.recipient, reason: 'NO_ADDRESS' });
    return [
      referenceId(payee.recipient, d.year),
      individual ? '' : (vendor.w9?.name || payee.recipient),
      names.first, names.middle, names.last, '',
      individual ? '5' : business ? '6' : '7',
      '',
      '',
      address.street, '', address.city, address.state, address.zip,
      String(vendor.email || ''),
      '', '',
      Number(payee.nonemployeeCompensation || 0).toFixed(2),
      '', '', '', '', '', '', '', '', '', '',
    ];
  });
  return {
    ok: true,
    data: {
      year: d.year,
      payer: d.payer,
      fileName: `track1099_1099NEC_${d.year}.csv`,
      csv: csvRows([TEMPLATE, ...rows]),
      count: rows.length,
      held,
      notes: [
        'This is Track1099\'s own 1099-NEC CSV template, column for column. MyCA keeps only the last four digits of a TIN, so "Federal ID No." is left blank: fill it from the W-9s in Track1099 before e-filing, or import with the column blank and complete the forms there.',
        ...(held.some((h) => h.reason === 'NO_ADDRESS') ? ['Recipients without a parsed "street, city, ST zip" address have blank address columns; set the party address in MyCA or complete them in Track1099.'] : []),
        ...d.notes,
      ],
    },
  };
}

function jobsOf(state) {
  state.form1099Jobs = Array.isArray(state.form1099Jobs) ? state.form1099Jobs : [];
  return state.form1099Jobs;
}

function configOf() {
  const config = loadChannelConfig('track1099');
  if (!config || !config.apiToken || !config.teamApiId) return { ok: false, error: 'CONNECTOR_NOT_CONFIGURED', channel: 'track1099', hint: 'Save the Track1099 API token and Team API ID first.' };
  return { ok: true, config };
}

function issuerRow(item) {
  const a = item?.attributes || {};
  return { id: String(item?.id || ''), name: String(a.name || ''), tinType: String(a.tin_type || ''), taxYear: String(a.tax_year || ''), city: String(a.city || ''), state: String(a.state || ''), email: String(a.email || '') };
}

export async function track1099Issuers(state, args = {}, actor) {
  const got = configOf();
  if (!got.ok) return got;
  const { config } = got;
  const out = await performExternalAction(state, {
    actionId: 'track1099_read',
    clientId: String(state.activeClientId || 'SELF'),
    params: { op: 'issuers', teamApiId: config.teamApiId },
    actor: actor || { userId: 'owner' },
    metadata: { op: 'issuers' },
    fixture: () => ({ ok: true, mock: true, data: { data: [{ id: 'mock-issuer-1', type: 'issuer', attributes: { name: state.company?.name || 'Mock Payer', tin_type: 'EIN', tax_year: Number(localToday().slice(0, 4)) - 1, city: 'Austin', state: 'TX', email: 'owner@example.com' } }] } }),
  }, async (transports) => transports.channel.track1099({ config, op: 'issuers', params: {} }));
  if (!out.ok) return out;
  return { ok: true, data: { issuers: (out.data?.data || []).map(issuerRow), mock: Boolean(out.mock), note: 'Create or correct the payer (issuer) in the Track1099 web app; MyCA only lists it and imports forms under it.' } };
}

export async function track1099Import(state, args = {}, actor) {
  const got = configOf();
  if (!got.ok) return got;
  const { config } = got;
  const issuerId = String(args.issuerId || '').trim();
  if (!/^[A-Za-z0-9-]{1,80}$/.test(issuerId)) return fail('ISSUER_REQUIRED', { hint: 'Say which Track1099 payer (issuer id) the forms belong to; list them with track1099_issuers.' });
  const file = track1099Csv(state, { year: args.year });
  if (!file.ok) return file;
  if (!file.data.count) return fail('NOTHING_TO_FILE', { year: file.data.year });
  const csvSha256 = createHash('sha256').update(file.data.csv).digest('hex');
  const out = await performExternalAction(state, {
    actionId: 'track1099_import',
    clientId: String(state.activeClientId || 'SELF'),
    params: { year: file.data.year, issuerId, count: file.data.count, csvSha256 },
    actor: actor || { userId: 'owner' },
    approvalId: args.caApprovalId || '',
    metadata: { year: file.data.year, issuerId, count: file.data.count, testMode: String(config.testMode || 'false') },
    payloadSummary: { year: file.data.year, issuerId, forms: file.data.count },
    fixture: () => ({ ok: true, mock: true, data: { data: { id: `mock-job-${file.data.year}`, type: 'import_job', attributes: { original_filename: file.data.fileName, status: 'SUCCESS', forms_imported_count: file.data.count, forms_ok_count: file.data.count, forms_missing_email_count: 0, forms_error_count: 0 } } } }),
  }, async (transports) => transports.channel.track1099({ config, op: 'import', params: { issuerId, csv: file.data.csv, fileName: file.data.fileName } }));
  if (!out.ok) return out;
  const job = out.data?.data || {};
  const a = job.attributes || {};
  const record = { jobId: String(job.id || ''), year: file.data.year, issuerId, forms: file.data.count, status: String(a.status || 'IN_PROGRESS'), imported: Number(a.forms_imported_count || 0), okCount: Number(a.forms_ok_count || 0), missingEmail: Number(a.forms_missing_email_count || 0), errors: Number(a.forms_error_count || 0), fileName: file.data.fileName, csvSha256, on: localToday(), mock: Boolean(out.mock), testMode: String(config.testMode || 'false') === 'true' };
  const jobs = jobsOf(state);
  jobs.push(record);
  if (jobs.length > MAX_JOBS) jobs.splice(0, jobs.length - MAX_JOBS);
  return { ok: true, data: { job: record, held: file.data.held, note: 'Forms are imported, not filed: Track1099 e-files only when you schedule and pay for them there. Check the job, then review the forms in Track1099.' } };
}

export async function track1099Job(state, args = {}, actor) {
  const got = configOf();
  if (!got.ok) return got;
  const { config } = got;
  const jobId = String(args.jobId || '').trim();
  if (!/^[A-Za-z0-9-]{1,80}$/.test(jobId)) return fail('JOB_REQUIRED');
  const known = jobsOf(state).find((j) => j.jobId === jobId);
  const out = await performExternalAction(state, {
    actionId: 'track1099_read',
    clientId: String(state.activeClientId || 'SELF'),
    params: { op: 'job', jobId },
    actor: actor || { userId: 'owner' },
    metadata: { op: 'job', jobId },
    fixture: () => ({ ok: true, mock: true, data: { data: { id: jobId, type: 'import_job', attributes: { status: 'SUCCESS', forms_imported_count: known?.forms || 0, forms_ok_count: known?.forms || 0, forms_missing_email_count: 0, forms_error_count: 0 } } } }),
  }, async (transports) => transports.channel.track1099({ config, op: 'job', params: { jobId } }));
  if (!out.ok) return out;
  const a = out.data?.data?.attributes || {};
  if (known) Object.assign(known, { status: String(a.status || known.status), imported: Number(a.forms_imported_count ?? known.imported), okCount: Number(a.forms_ok_count ?? known.okCount), missingEmail: Number(a.forms_missing_email_count ?? known.missingEmail), errors: Number(a.forms_error_count ?? known.errors), errorMessage: String(a.error_message || '') });
  return { ok: true, data: { jobId, status: String(a.status || ''), imported: Number(a.forms_imported_count || 0), okCount: Number(a.forms_ok_count || 0), missingEmail: Number(a.forms_missing_email_count || 0), errors: Number(a.forms_error_count || 0), errorMessage: String(a.error_message || ''), mock: Boolean(out.mock) } };
}

export function track1099Words(name, result, money) {
  const d = result.data || result;
  if (name === 'track1099_csv') return `${d.count} 1099-NEC ${d.count === 1 ? 'form' : 'forms'} for ${d.year} in Track1099's template (${d.fileName}).${d.held.length ? ` ${d.held.length} need attention: ${d.held.map((h) => `${h.recipient} (${h.reason === 'NO_W9' ? 'no W-9' : 'no address'})`).join(', ')}.` : ''} The TIN column is blank by design; complete it in Track1099 from the W-9s.`;
  if (name === 'track1099_issuers') return d.issuers.length ? `Payers in Track1099:\n${d.issuers.map((i) => `· ${i.name} (${i.id}${i.taxYear ? `, ${i.taxYear}` : ''})`).join('\n')}\nSay "import the ${Number(localToday().slice(0, 4)) - 1} 1099s into Track1099 payer <id>".` : 'No payers in Track1099 yet; add the payer in the Track1099 web app first.';
  if (name === 'track1099_import') return `${d.job.mock ? 'Simulated: ' : ''}${d.job.forms} 1099-NEC forms for ${d.job.year} imported into Track1099 payer ${d.job.issuerId} as job ${d.job.jobId} (${d.job.status}${d.job.errors ? `, ${d.job.errors} with errors` : ''}${d.job.missingEmail ? `, ${d.job.missingEmail} without an email` : ''}). ${d.note}`;
  if (name === 'track1099_job') return `Track1099 job ${d.jobId}: ${d.status}, ${d.imported} imported, ${d.okCount} ok, ${d.missingEmail} without an email, ${d.errors} with errors${d.errorMessage ? ` (${d.errorMessage})` : ''}.`;
  return '';
}
