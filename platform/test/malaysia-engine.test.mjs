import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { MANIFEST } from '../src/countries/malaysia/manifest.mjs';
import { fileURLToPath } from 'node:url';
import { ChannelClient, getChannelClient, setChannelClient } from '../src/channel-client.mjs';
import { clearMyInvoisTokens } from '../src/countries/malaysia/myinvois-client.mjs';
import { createState } from '../src/store.mjs';

const fixturePath = (name) => fileURLToPath(new URL(`./fixtures/malaysia/${name}`, import.meta.url));
const TEST_ENV = {
  MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0',
  MYCA_MYINVOIS_CLIENT_ID: 'client-1', MYCA_MYINVOIS_CLIENT_SECRET: 'secret-1',
  MYCA_MYINVOIS_CERT_PATH: fixturePath('test-signer.crt'), MYCA_MYINVOIS_KEY_PATH: fixturePath('test-signer.key'),
};

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function lhdn(calls) {
  return async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    const reply = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body), headers: { get: () => null } });
    if (url.endsWith('/connect/token')) return reply(200, { access_token: 'jwt', expires_in: 3600 });
    if (url.includes('/documentsubmissions/') && init.method === 'POST') {
      const sent = JSON.parse(init.body).documents[0];
      return reply(202, { submissionUid: 'SUBMISSION0000000000000001', acceptedDocuments: [{ uuid: 'DOCUMENT000000000000000001', invoiceCodeNumber: sent.codeNumber }], rejectedDocuments: [] });
    }
    if (url.includes('/documentsubmissions/SUBMISSION0000000000000001')) return reply(200, { overallStatus: 'Valid', documentSummary: [{ uuid: 'DOCUMENT000000000000000001', internalId: 'INV-1', status: 'Valid', longId: 'LONG1' }] });
    if (url.includes('/documents/state/')) return reply(200, { uuid: 'DOCUMENT000000000000000001', status: 'Cancelled' });
    return reply(404, {});
  };
}

const supplier = {
  name: 'Kedai Contoh Sdn Bhd', tin: 'C20830570210', idType: 'BRN', idValue: '202001234567', msic: '46510', phone: '+60123456789',
  address: { lines: ['Lot 66'], city: 'Kuala Lumpur', state: 'Selangor' },
};
const buyer = { name: 'Pelanggan Bhd', tin: 'C10987654320', idValue: '199901000111', address: { city: 'Shah Alam', state: '10' } };
const lines = [{ description: 'Consulting', classification: '022', quantity: 1, unitPrice: 1000, taxType: '02', taxRateBasisPoints: 800 }];

test('every manifest tool has a run, and every write tool a preview', () => {
  for (const tool of MANIFEST.tools) {
    assert.equal(typeof ENGINE.run[tool.name], 'function', tool.name);
    if (tool.access === 'write') assert.equal(typeof ENGINE.preview[tool.name], 'function', tool.name);
  }
});

test('the e-invoice profile is checked, saved in the country slice with an audit event, and used by later invoices', () => {
  const state = createState();
  const incomplete = ENGINE.run.set_my_einvoice_profile(state, { ...supplier, msic: '' });
  assert.equal(incomplete.error, 'EINVOICE_PROFILE_INCOMPLETE');
  assert.ok(ENGINE.preview.set_my_einvoice_profile(state, { ...supplier, msic: '' }).blockers.length > 0);
  const saved = ENGINE.run.set_my_einvoice_profile(state, supplier);
  assert.equal(saved.ok, true);
  assert.equal(state.countryData.myEinvoiceProfile.supplier.tin, 'C20830570210');
  assert.equal(state.auditEvents.at(-1).action, 'my_einvoice_profile_set');
  assert.equal(state.auditEvents.at(-1).metadata.after.tin, 'C20830570210', 'the Malaysian TIN stays readable in the audit trail');
  const checked = ENGINE.run.my_einvoice_check(state, { number: 'INV-1', buyer, lines });
  assert.equal(checked.ok, true);
  assert.equal(checked.data.totals.payable, 1080);
  assert.match(ENGINE.words.my_einvoice_check(checked), /RM1,080\.00 payable/);
});

test('an e-invoice is signed, sent through the gate to the LHDN sandbox, tracked, and cancelled', async () => {
  const real = getChannelClient();
  const calls = [];
  setChannelClient(new ChannelClient({ fetchFn: lhdn(calls) }));
  clearMyInvoisTokens();
  try {
    const state = createState();
    ENGINE.run.set_my_einvoice_profile(state, supplier);
    const preview = ENGINE.preview.issue_my_einvoice(state, { number: 'INV-1', buyer, lines });
    assert.equal(preview.figures.payable, 1080);
    assert.deepEqual(preview.blockers, []);
    const sent = await withEnv(TEST_ENV, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-1', buyer, lines }));
    assert.equal(sent.ok, true, JSON.stringify(sent));
    assert.equal(sent.data.uuid, 'DOCUMENT000000000000000001');
    assert.ok(calls.every((call) => call.url.startsWith('https://preprod-api.myinvois.hasil.gov.my/')));
    const document = JSON.parse(Buffer.from(JSON.parse(calls[1].body).documents[0].document, 'base64').toString('utf8'));
    assert.ok(document.Invoice[0].UBLExtensions, 'the document went out signed');
    assert.equal(state.countryData.myEinvoices.byNumber['INV-1'].status, 'submitted');
    assert.ok(state.auditEvents.some((event) => event.action === 'my_einvoice_submitted'));
    const again = await withEnv(TEST_ENV, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-1', buyer, lines }));
    assert.equal(again.error, 'EINVOICE_ALREADY_SENT');
    const status = await withEnv(TEST_ENV, () => ENGINE.run.my_einvoice_status(state, { submissionUid: 'SUBMISSION0000000000000001' }));
    assert.equal(status.data.documents[0].link, 'https://preprod.myinvois.hasil.gov.my/DOCUMENT000000000000000001/share/LONG1');
    assert.equal(state.countryData.myEinvoices.byNumber['INV-1'].status, 'valid');
    assert.deepEqual(state.auditEvents.filter((event) => event.action === 'my_einvoice_status_changed').map((event) => [event.metadata.before, event.metadata.after]), [['submitted', 'valid']]);
    await withEnv(TEST_ENV, () => ENGINE.run.my_einvoice_status(state, { submissionUid: 'SUBMISSION0000000000000001' }));
    assert.equal(state.auditEvents.filter((event) => event.action === 'my_einvoice_status_changed').length, 1, 'an unchanged status is not audited again');
    const cancelled = await withEnv(TEST_ENV, () => ENGINE.run.cancel_my_einvoice(state, { uuid: 'DOCUMENT000000000000000001', reason: 'Wrong buyer' }));
    assert.equal(cancelled.ok, true);
    assert.equal(state.countryData.myEinvoices.byNumber['INV-1'].status, 'cancelled');
  } finally {
    setChannelClient(real);
  }
});

test('with calls off nothing leaves; mock mode simulates; a missing certificate stops a real send', async () => {
  const real = getChannelClient();
  const calls = [];
  setChannelClient(new ChannelClient({ fetchFn: lhdn(calls) }));
  try {
    const state = createState();
    ENGINE.run.set_my_einvoice_profile(state, supplier);
    const off = await withEnv({ MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '0', MYCA_MYINVOIS_CLIENT_ID: 'real-client' }, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-2', buyer, lines }));
    assert.equal(off.error, 'LIVE_CALLS_DISABLED');
    const noCert = await withEnv({ ...TEST_ENV, MYCA_MYINVOIS_CERT_PATH: '' }, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-2', buyer, lines }));
    assert.equal(noCert.error, 'SIGNING_CERTIFICATE_MISSING');
    assert.equal(calls.length, 0);
    const mock = await withEnv({ MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '1' }, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-2', buyer, lines }));
    assert.equal(mock.mock, true);
    assert.equal(mock.data.environment, 'mock');
    assert.equal(calls.length, 0);
    assert.equal((await ENGINE.run.issue_my_einvoice(createState(), { number: 'INV-3', buyer, lines })).error, 'EINVOICE_FIELDS_MISSING');
    const mockAgain = await withEnv({ MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '1' }, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-2', buyer, lines }));
    assert.equal(mockAgain.error, 'EINVOICE_ALREADY_SENT');
    clearMyInvoisTokens();
    const real = await withEnv(TEST_ENV, () => ENGINE.run.issue_my_einvoice(state, { number: 'INV-2', buyer, lines }));
    assert.equal(real.ok, true, 'a mock submission does not block the real one');
    assert.equal(state.countryData.myEinvoices.byNumber['INV-2'].environment, 'test');
  } finally {
    setChannelClient(real);
  }
});

test('tax, SST and TIN tools answer from the engines', async () => {
  const tax = ENGINE.run.my_tax_estimate({}, { yearOfAssessment: '2025', income: { employment: 40000 } });
  assert.match(ENGINE.words.my_tax_estimate(tax), /tax is RM80\.00/);
  assert.equal(ENGINE.run.my_sst_rate({}, { category: 'logistics', date: '2026-02-01' }).data.percent, 6);
  assert.equal(ENGINE.run.my_sst_rate({}, { kind: 'sales', rateBasisPoints: 500, date: '2026-02-01' }).data.percent, 5);
  assert.equal(ENGINE.run.my_sst_registration({}, { last12Months: 600000, date: '2026-02-01' }).data.mustRegister, true);
  const sst = ENGINE.run.my_sst_return({}, { period: '2026-01/2026-02', lines: [{ date: '2026-01-05', kind: 'service', value: 1000 }] });
  assert.match(ENGINE.words.my_sst_return(sst), /service tax RM80\.00.*due 2026-03-31/);
  const tin = await withEnv({ MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '1' }, () => ENGINE.run.validate_my_tin(createState(), { tin: 'IG12345678901', idValue: '900101015555' }));
  assert.equal(tin.data.lhdn, 'valid');
  assert.equal(ENGINE.run.validate_my_tin({}, { tin: '1234', idValue: 'x' }).data.format, false);
  const realClient = getChannelClient();
  try {
    for (const [status, expected] of [[200, 'valid'], [404, 'not found'], [500, 'MYINVOIS_REJECTED'], [401, 'MYINVOIS_REJECTED'], [429, 'MYINVOIS_THROTTLED']]) {
      clearMyInvoisTokens();
      setChannelClient(new ChannelClient({ fetchFn: async (url) => (url.endsWith('/connect/token')
        ? { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'jwt', expires_in: 3600 }), headers: { get: () => null } }
        : { ok: status < 300, status, text: async () => '{}', headers: { get: () => null } }) }));
      const out = await withEnv(TEST_ENV, () => ENGINE.run.validate_my_tin(createState(), { tin: 'C20830570210', idValue: '202001234567' }));
      assert.equal(out.ok ? out.data.lhdn : out.error, expected, `HTTP ${status}`);
    }
  } finally {
    setChannelClient(realClient);
  }
});
