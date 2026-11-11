import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-pinwheel-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '0';
process.env.MYCA_ENABLE_LIVE_CALLS = '0';
process.env.MYCA_ENABLE_CHANNEL_PULLS = '1';

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { setChannelClient, ChannelClient } from '../src/channel-client.mjs';
import { pinwheelTaxFormToUsForm, importPayrollTaxForms, importPayrollTaxFormsPreview } from '../src/us-connectors.mjs';
import { needsConfirmation, previewOf } from '../src/chat-confirm.mjs';

afterEach(() => { setChannelClient(null); process.env.MYCA_MOCK_MODE = '0'; });

const ACCOUNT = 'acct-1234-abcd';
const W2 = { id: 'tf-w2-1', form_type: 'W-2', year: 2026, account_id: ACCOUNT, parsed_data: { box_a: 'XXX-XX-1234', box_b: '12-3456789', box_c: { name: 'Acme Robotics Inc', address: '1 Main St' }, box_1: 8512345, box_2: 1020000, box_3: 8800000, box_4: 545600, box_5: 8800000, box_6: 127600, box_7: 0, box_12: [{ code: 'd', amount: 287655 }], box_13: { retirement_plan: true, statutory_employee: false }, box_15_to_20: [{ box_15_state: 'ca', box_16: 8512345, box_17: 412300 }, { box_15_state: 'NY', box_16: 10000, box_17: 500 }] }, warnings: [{ field: 'box_14', status: 'low_confidence', message: 'Box 14 could not be read' }] };
const NEC = { id: 'tf-nec-1', form_type: '1099-NEC', year: 2026, parsed_data: { payer_name: 'Side Gig LLC', payer_tin: '98-7654321', box_1: 150000, box_4: 0 } };
const PAYSTUB = { id: 'tf-1040-1', form_type: '1040', year: 2026, parsed_data: {} };
const OLD = { id: 'tf-w2-old', form_type: 'W-2', year: 2025, parsed_data: { box_c: { name: 'Old Co' }, box_1: 100 } };

function usBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Luna Bakery LLC', country: 'US', state: 'CA', gstin: '' };
  return state;
}

function pinwheelFake(log) {
  const all = [W2, NEC, PAYSTUB, OLD];
  return async (url, init = {}) => {
    log.push({ url, method: init.method || 'GET', secret: init.headers?.['x-api-secret'], version: init.headers?.['pinwheel-version'], body: init.body ? JSON.parse(init.body) : null });
    const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (init.headers?.['x-api-secret'] !== 'pw-sandbox-secret') return json(401, { error: { code: 'UNAUTHORIZED', message: 'bad secret' } });
    const u = new URL(url);
    if (u.origin !== 'https://sandbox.getpinwheel.com') return json(404, {});
    if (u.pathname === '/v1/link_tokens') return json(200, { data: { token: 'pw-link-token', expires: '2026-11-11T12:00:00Z' } });
    const list = u.pathname.match(/^\/v1\/accounts\/([^/]+)\/tax_forms$/);
    if (list) {
      if (list[1] !== ACCOUNT) return json(404, { error: { code: 'NOT_FOUND', message: 'no account' } });
      const year = Number(u.searchParams.get('from_year'));
      const rows = all.filter((f) => !year || f.year === year).map(({ parsed_data, ...rest }) => rest);
      if (!u.searchParams.get('cursor')) return json(200, { data: rows.slice(0, 2), meta: { next_cursor: 'c2' } });
      return json(200, { data: rows.slice(2), meta: { next_cursor: null } });
    }
    const one = u.pathname.match(/^\/v1\/accounts\/([^/]+)\/tax_forms\/([^/]+)$/);
    if (one) {
      const hit = all.find((f) => f.id === one[2]);
      if (!hit || u.searchParams.get('with_parsed_data') !== 'true') return json(404, {});
      return json(200, { data: hit });
    }
    return json(404, {});
  };
}

function fakeUsReturn() {
  return {
    listUsTaxForms(state, args) {
      return { ok: true, data: { forms: (state.usReturns?.[args.taxYear]?.forms || []).map((f) => ({ id: f.id, documentId: f.documentId || '' })) } };
    },
    addUsTaxForm(state, args) {
      if (!args.payer) return { ok: false, error: 'US_TAX_FORM_INVALID', problems: ['Payer name is required.'] };
      if (!state.usReturns) state.usReturns = {};
      const ret = state.usReturns[args.taxYear] || (state.usReturns[args.taxYear] = { forms: [], nextFormNumber: 1 });
      const form = { id: `usf-${args.taxYear}-${ret.nextFormNumber++}`, kind: args.kind, owner: args.owner, payer: args.payer, payerTin: args.payerTin, fields: args.fields, documentId: args.documentId };
      ret.forms.push(form);
      return { ok: true, data: { id: form.id, kind: form.kind, payer: form.payer, amounts: form.fields } };
    },
  };
}

test('Pinwheel W-2: boxes in cents become dollars in the US return form shape, the first state is carried and the rest flagged', () => {
  const out = pinwheelTaxFormToUsForm(W2);
  assert.equal(out.form.kind, 'W-2');
  assert.equal(out.form.payer, 'Acme Robotics Inc');
  assert.equal(out.form.payerTin, '12-3456789');
  assert.equal(out.form.documentId, 'pinwheel-tf-w2-1');
  assert.deepEqual(out.form.fields, { wages: 85123.45, federalWithheld: 10200, socialSecurityWages: 88000, socialSecurityTax: 5456, medicareWages: 88000, medicareTax: 1276, socialSecurityTips: 0, box12: [{ code: 'D', amount: 2876.55 }], retirementPlan: true, state: 'CA', stateWages: 85123.45, stateWithheld: 4123 });
  assert.ok(out.notes.some((n) => n.includes('Box 14')));
  assert.ok(out.notes.some((n) => n.includes('2 states')));
  const nec = pinwheelTaxFormToUsForm(NEC, 'spouse');
  assert.deepEqual(nec.form, { kind: '1099-NEC', owner: 'spouse', payer: 'Side Gig LLC', payerTin: '98-7654321', source: 'payroll', documentId: 'pinwheel-tf-nec-1', fields: { nonemployeeCompensation: 1500, federalWithheld: 0 } });
  assert.match(pinwheelTaxFormToUsForm(PAYSTUB).skipped, /does not read 1040/);
  assert.match(pinwheelTaxFormToUsForm({ id: 'x', form_type: 'W-2', year: 2026 }).skipped, /no parsed boxes/);
});

test('Pinwheel: the link token and the tax forms come from the sandbox with the secret and version headers, pages are followed, and the account id is remembered', async () => {
  const state = usBooks();
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: pinwheelFake(log) }));
  assert.equal((await runTool(state, 'payroll_tax_forms', { taxYear: 2026 })).error, 'CONNECTOR_NOT_CONFIGURED');
  const saved = await runTool(state, 'set_channel_connector', { channel: 'pinwheel', apiSecret: 'pw-sandbox-secret', environment: 'sandbox' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.data.apiSecret, 'set');
  const link = await runTool(state, 'pinwheel_link_token', {});
  assert.equal(link.ok, true, JSON.stringify(link));
  assert.equal(link.data.linkToken, 'pw-link-token');
  assert.deepEqual(log[0].body.features, ['tax_forms']);
  assert.equal(log[0].version, '2025-07-08');
  assert.equal((await runTool(state, 'payroll_tax_forms', { taxYear: 2026 })).error, 'PAYROLL_NOT_LINKED');
  const forms = await runTool(state, 'payroll_tax_forms', { taxYear: 2026, accountId: ACCOUNT });
  assert.equal(forms.ok, true, JSON.stringify(forms));
  assert.deepEqual(forms.data.forms.map((f) => f.taxFormId), ['tf-w2-1', 'tf-nec-1']);
  assert.equal(forms.data.forms[0].amounts.wages, 85123.45);
  assert.deepEqual(forms.data.skipped.map((f) => f.taxFormId), ['tf-1040-1']);
  assert.ok(log.some((l) => l.url.includes('cursor=c2')));
  assert.ok(log.every((l) => l.secret === 'pw-sandbox-secret'));
  const again = await runTool(state, 'payroll_tax_forms', { taxYear: 2026 });
  assert.equal(again.ok, true, 'the account id was kept');
  assert.equal(JSON.stringify({ a: state.auditEvents, d: state.dryRuns }).includes('pw-sandbox-secret'), false);
  const view = await runTool(state, 'us_connectors', {});
  assert.ok(view.data.connectors.some((c) => c && c.channel === 'pinwheel'));
});

test('Pinwheel import: confirmation is required, chosen forms are added once, a second import skips them, and an unknown id is reported', async () => {
  const state = usBooks();
  setChannelClient(new ChannelClient({ fetchFn: pinwheelFake([]) }));
  await runTool(state, 'set_channel_connector', { channel: 'pinwheel', apiSecret: 'pw-sandbox-secret', environment: 'sandbox', accountId: ACCOUNT });
  assert.equal(needsConfirmation('import_payroll_tax_forms'), true);
  const preview = previewOf(state, 'import_payroll_tax_forms', { taxYear: 2026, taxFormIds: ['tf-w2-1'], extra: 'dropped' });
  assert.deepEqual(preview.blockers, []);
  assert.deepEqual(preview.pinned, { taxYear: 2026, owner: 'taxpayer', taxFormIds: ['tf-w2-1'] });
  assert.ok(importPayrollTaxFormsPreview(state, { taxYear: 2026 }).blockers.length > 0);
  const usReturn = fakeUsReturn();
  const first = await importPayrollTaxForms(state, { taxYear: 2026, taxFormIds: ['tf-w2-1', 'tf-nec-1'] }, null, { usReturn });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(first.data.added.map((a) => a.kind), ['W-2', '1099-NEC']);
  assert.equal(state.usReturns[2026].forms[0].fields.federalWithheld, 10200);
  const second = await importPayrollTaxForms(state, { taxYear: 2026, taxFormIds: ['tf-w2-1', 'tf-missing'] }, null, { usReturn });
  assert.equal(second.ok, false);
  assert.equal(second.error, 'SOME_FORMS_NOT_ADDED');
  assert.deepEqual(second.data.added, []);
  assert.equal(second.data.skipped[0].reason, 'Already on the return.');
  assert.equal(second.data.failed[0].taxFormId, 'tf-missing');
  assert.equal(state.usReturns[2026].forms.length, 2);
});

test('Pinwheel in mock mode: sample figures are shown and nothing is added to the return', async () => {
  process.env.MYCA_MOCK_MODE = '1';
  const state = usBooks();
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: pinwheelFake(log) }));
  await runTool(state, 'set_channel_connector', { channel: 'pinwheel', apiSecret: 'pw-sandbox-secret', environment: 'sandbox', accountId: ACCOUNT });
  const listed = await runTool(state, 'payroll_tax_forms', { taxYear: 2026 });
  assert.equal(listed.ok, true, JSON.stringify(listed));
  assert.equal(listed.data.mock, true);
  const out = await importPayrollTaxForms(state, { taxYear: 2026, taxFormIds: ['mock-w2-1'] }, null, { usReturn: fakeUsReturn() });
  assert.equal(out.data.mock, true);
  assert.equal(out.data.wouldAdd.length, 1);
  assert.deepEqual(Object.keys(state.usReturns || {}), []);
  assert.equal(log.length, 0);
});
