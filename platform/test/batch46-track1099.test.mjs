import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-track1099-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '0';
process.env.MYCA_ENABLE_LIVE_CALLS = '0';
process.env.MYCA_ENABLE_CHANNEL_PULLS = '1';

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { setChannelClient, ChannelClient } from '../src/channel-client.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';
import { parseUsAddress } from '../src/track1099.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';

afterEach(() => { setChannelClient(null); process.env.MYCA_MOCK_MODE = '0'; process.env.MYCA_ENABLE_LIVE_CALLS = '0'; });

async function usBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Luna Bakery LLC', country: 'US', state: 'TX', gstin: '', ein: '12-3456789', address: '500 Congress Ave, Austin, TX 78701' };
  state._documents = createMemoryDocumentStore();
  const bill = await runTool(state, 'create_purchase', { partyName: 'Joe Plumbing', lines: [{ description: 'Repairs', qty: 1, rate: 2500 }], date: '2025-03-04' });
  await runTool(state, 'record_payment', { billId: bill.invoice.id, amount: 2500, date: '2025-03-05' });
  await runTool(state, 'set_contractor', { partyName: 'Joe Plumbing', entityType: 'sole-proprietor', tinLast4: '1234', w9Received: true, address: '123 Jump St, Wallace, ID 83873', email: 'Joe@Plumbing.example' });
  const bill2 = await runTool(state, 'create_purchase', { partyName: 'Good Foundation Consulting, LLC', lines: [{ description: 'Advice', qty: 1, rate: 1200 }], date: '2025-06-01' });
  await runTool(state, 'record_payment', { billId: bill2.invoice.id, amount: 1200, date: '2025-06-02' });
  await runTool(state, 'set_contractor', { partyName: 'Good Foundation Consulting, LLC', entityType: 'llc', tinLast4: '3606', w9Received: false });
  return state;
}

test('the Track1099 CSV follows its template column for column: individuals split into names with type 5, businesses type 6, addresses parsed, the TIN left blank, and the gaps named', async () => {
  const state = await usBooks();
  const out = await runTool(state, 'track1099_csv', { year: '2025' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const lines = out.data.csv.split(/\r?\n/).filter(Boolean);
  assert.equal(lines[0].split(',').length >= 28, true);
  assert.match(lines[0], /^Reference ID \(Optional\),Business Name,First Name,Middle Name,Last Name,Name Suffix,"Federal ID type/);
  assert.match(lines[0], /Box 7b Local Income$/);
  const joe = lines.find((l) => l.includes('Joe'));
  assert.ok(joe, out.data.csv);
  const cells = joe.split(',');
  assert.match(cells[0], /^MYCA-2025-[0-9A-F]{8}$/);
  assert.equal(cells[1], '', 'an individual has no business name');
  assert.equal(cells[2], 'Joe');
  assert.equal(cells[4], 'Plumbing');
  assert.equal(cells[6], '5');
  assert.equal(cells[7], '', 'MyCA never holds the full TIN');
  assert.equal(cells[9], '123 Jump St');
  assert.equal(cells[11], 'Wallace');
  assert.equal(cells[12], 'ID');
  assert.equal(cells[13], '83873');
  assert.equal(cells[14], 'joe@plumbing.example');
  assert.equal(cells[17], '2500.00');
  const llc = lines.find((l) => l.includes('Good Foundation'));
  assert.match(llc, /^MYCA-2025-[0-9A-F]{8},"Good Foundation Consulting, LLC",,,,,6,/);
  assert.deepEqual(out.data.held, [{ recipient: 'Good Foundation Consulting, LLC', reason: 'NO_W9' }, { recipient: 'Good Foundation Consulting, LLC', reason: 'NO_ADDRESS' }]);
  assert.equal(out.data.count, 2);
  assert.deepEqual(parseUsAddress('7165 SW Bel Aire Dr, Beaverton, OR 97008-5938'), { street: '7165 SW Bel Aire Dr', city: 'Beaverton', state: 'OR', zip: '97008-5938' });
  assert.deepEqual(parseUsAddress('just a line'), { street: 'just a line', city: '', state: '', zip: '' });
  const words = await chat(state, 'track1099 csv for 2025').catch(() => null);
  assert.ok(words === null || typeof words.reply === 'string');
});

test('with the token and Team API ID saved, payers list through the API, the import needs the live switch and a CA approval, uploads the CSV as csv_file and keeps the job, and the job status refreshes it', async () => {
  const state = await usBooks();
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', auth: init.headers?.authorization || '', body: init.body });
    const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (init.headers?.authorization !== 'Bearer t1099-token-abc') return json(401, { errors: [{ title: 'Unauthorized' }] });
    if (url === 'https://www.track1099.com/api/v1/team-77/issuers') return json(200, { data: [{ id: 'iss-1', type: 'issuer', attributes: { name: 'Luna Bakery LLC', tin_type: 'EIN', tax_year: 2025, city: 'Austin', state: 'TX', email: 'owner@luna.example' } }], links: { self: '', current: '' } });
    if (url === 'https://www.track1099.com/api/v1/team-77/issuers/iss-1/import-forms') return json(201, { data: { id: 'job-9', type: 'import_job', attributes: { original_filename: 'track1099_1099NEC_2025.csv', status: 'IN_PROGRESS', forms_imported_count: 0 } } });
    if (url === 'https://www.track1099.com/api/v1/team-77/jobs/job-9') return json(200, { data: { id: 'job-9', type: 'import_job', attributes: { status: 'SUCCESS', forms_imported_count: 2, forms_ok_count: 1, forms_missing_email_count: 1, forms_error_count: 0 } } });
    return json(404, { errors: [{ title: 'no route' }] });
  };
  setChannelClient(new ChannelClient({ fetchFn: fake }));
  assert.equal((await runTool(state, 'track1099_issuers', {})).error, 'CONNECTOR_NOT_CONFIGURED');
  await runTool(state, 'set_channel_connector', { channel: 'track1099', apiToken: 't1099-token-abc', teamApiId: 'team-77', testMode: 'true' });
  const issuers = await runTool(state, 'track1099_issuers', {});
  assert.equal(issuers.ok, true, JSON.stringify(issuers));
  assert.deepEqual(issuers.data.issuers, [{ id: 'iss-1', name: 'Luna Bakery LLC', tinType: 'EIN', taxYear: '2025', city: 'Austin', state: 'TX', email: 'owner@luna.example' }]);

  const dry = await runTool(state, 'track1099_import', { year: '2025', issuerId: 'iss-1' });
  assert.equal(dry.error, 'LIVE_CALLS_DISABLED', 'an import is a write: the live switch is needed');
  process.env.MYCA_ENABLE_LIVE_CALLS = '1';
  const noApproval = await runTool(state, 'track1099_import', { year: '2025', issuerId: 'iss-1' });
  assert.equal(noApproval.error, 'APPROVAL_REQUIRED');
  const csv = await runTool(state, 'track1099_csv', { year: '2025' });
  const { createHash } = await import('node:crypto');
  const params = { year: '2025', issuerId: 'iss-1', count: 2, csvSha256: createHash('sha256').update(csv.data.csv).digest('hex') };
  const req = requestApproval(state, { operationId: 'track1099_import', clientId: 'SELF', params, actor: { userId: 'ca', role: 'staff' } });
  decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
  const imported = await runTool(state, 'track1099_import', { year: '2025', issuerId: 'iss-1', caApprovalId: req.approval.approvalId, actorId: 'ca' });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.equal(imported.data.job.jobId, 'job-9');
  assert.equal(imported.data.job.forms, 2);
  assert.equal(imported.data.job.status, 'IN_PROGRESS');
  assert.equal(state.form1099Jobs.length, 1);
  const upload = calls.find((c) => c.url.endsWith('/import-forms'));
  assert.equal(upload.method, 'POST');
  assert.ok(upload.body instanceof FormData, 'multipart upload');
  const file = upload.body.get('csv_file');
  assert.equal(file.name, 'track1099_1099NEC_2025.csv');
  assert.match(await file.text(), /^Reference ID \(Optional\),Business Name/);

  const job = await runTool(state, 'track1099_job', { jobId: 'job-9' });
  assert.equal(job.ok, true, JSON.stringify(job));
  assert.equal(job.data.status, 'SUCCESS');
  assert.equal(job.data.missingEmail, 1);
  assert.equal(state.form1099Jobs[0].status, 'SUCCESS');
  assert.equal(state.form1099Jobs[0].okCount, 1);

  process.env.MYCA_MOCK_MODE = '1';
  const mocked = await runTool(state, 'track1099_issuers', {});
  assert.equal(mocked.data.mock, true);
  assert.equal(mocked.data.issuers[0].name, 'Luna Bakery LLC');
});
