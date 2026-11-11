import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { MANIFEST } from '../src/countries/malaysia/manifest.mjs';

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
  const state = {};
  const incomplete = ENGINE.run.set_my_einvoice_profile(state, { ...supplier, msic: '' });
  assert.equal(incomplete.error, 'EINVOICE_PROFILE_INCOMPLETE');
  assert.ok(ENGINE.preview.set_my_einvoice_profile(state, { ...supplier, msic: '' }).blockers.length > 0);
  const saved = ENGINE.run.set_my_einvoice_profile(state, supplier);
  assert.equal(saved.ok, true);
  assert.equal(state.countryData.myEinvoiceProfile.supplier.tin, 'C20830570210');
  assert.equal(state.auditEvents.at(-1).action, 'my_einvoice_profile_set');
  const checked = ENGINE.run.my_einvoice_check(state, { number: 'INV-1', buyer, lines });
  assert.equal(checked.ok, true);
  assert.equal(checked.data.totals.payable, 1080);
  assert.match(ENGINE.words.my_einvoice_check(checked), /RM1,080\.00 payable/);
});

test('sending to LHDN waits for the gate and says so in the preview', () => {
  const state = {};
  ENGINE.run.set_my_einvoice_profile(state, supplier);
  const preview = ENGINE.preview.issue_my_einvoice(state, { number: 'INV-1', buyer, lines });
  assert.equal(preview.figures.payable, 1080);
  assert.ok(preview.blockers.length === 1);
  assert.equal(ENGINE.run.issue_my_einvoice(state, { number: 'INV-1', buyer, lines }).error, 'GATE_ACTION_PENDING');
  assert.equal(ENGINE.run.issue_my_einvoice({}, { number: 'INV-1', buyer, lines }).error, 'EINVOICE_FIELDS_MISSING');
});

test('tax, SST and TIN tools answer from the engines', () => {
  const tax = ENGINE.run.my_tax_estimate({}, { yearOfAssessment: '2025', income: { employment: 40000 } });
  assert.match(ENGINE.words.my_tax_estimate(tax), /tax is RM80\.00/);
  assert.equal(ENGINE.run.my_sst_rate({}, { category: 'logistics', date: '2026-02-01' }).data.percent, 6);
  assert.equal(ENGINE.run.my_sst_rate({}, { kind: 'sales', rateBasisPoints: 500, date: '2026-02-01' }).data.percent, 5);
  assert.equal(ENGINE.run.my_sst_registration({}, { last12Months: 600000, date: '2026-02-01' }).data.mustRegister, true);
  const sst = ENGINE.run.my_sst_return({}, { period: '2026-01/2026-02', lines: [{ date: '2026-01-05', kind: 'service', value: 1000 }] });
  assert.match(ENGINE.words.my_sst_return(sst), /service tax RM80\.00.*due 2026-03-31/);
  assert.equal(ENGINE.run.validate_my_tin({}, { tin: 'IG12345678901', idValue: '900101015555' }).data.format, true);
  assert.equal(ENGINE.run.validate_my_tin({}, { tin: '1234', idValue: 'x' }).data.format, false);
});
