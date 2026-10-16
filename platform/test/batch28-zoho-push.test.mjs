import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-zoho-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';
import { setChannelClient, ChannelClient } from '../src/channel-client.mjs';
import { zohoInvoicePayload, pickTaxId, zohoStateOf } from '../src/zoho-push.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function withCheck(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}
const BUYER_MH = withCheck('27AAACK1234F1Z');
const BUYER_KA = withCheck('29AAACR5678G1Z');

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const TAXES = [
  { tax_id: 'T-GST18', tax_name: 'GST18', tax_percentage: 18, tax_type: 'tax_group' },
  { tax_id: 'T-IGST18', tax_name: 'IGST18', tax_percentage: 18, tax_type: 'tax', tax_specific_type: 'igst' },
  { tax_id: 'T-GST5', tax_name: 'GST5', tax_percentage: 5, tax_type: 'tax_group' },
];

async function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_MH, lines: [{ description: 'Cotton', hsn: '5205', qty: 2, rate: 1000, gstRate: 18 }], date: '2026-09-05' });
  await runTool(state, 'create_invoice', { partyName: 'Rao Agencies', partyGstin: BUYER_KA, lines: [{ description: 'Yarn', hsn: '5205', qty: 1, rate: 500, gstRate: 5 }], date: '2026-09-09' });
  return state;
}

test('the Zoho payload maps the state, the GST treatment and the tax by rate and direction', () => {
  assert.equal(zohoStateOf('29'), 'KA');
  assert.equal(zohoStateOf('7'), 'DL');
  assert.equal(pickTaxId(TAXES, 18, true), 'T-GST18');
  assert.equal(pickTaxId(TAXES, 18, false), 'T-IGST18');
  assert.equal(pickTaxId(TAXES, 0, true), '');
  const payload = zohoInvoicePayload({ id: 'INV-0001', date: '2026-09-05', partyGstin: BUYER_KA, placeOfSupply: '29', lines: [{ description: 'Cotton', hsn: '5205', qty: 2, rate: 1000, gstRate: 18 }] }, { state: '27' }, { customerId: 'C1', taxes: TAXES });
  assert.equal(payload.place_of_supply, 'KA');
  assert.equal(payload.gst_treatment, 'business_gst');
  assert.deepEqual(payload.line_items, [{ name: 'Cotton', description: 'Cotton', rate: 1000, quantity: 2, hsn_or_sac: '5205', tax_id: 'T-IGST18' }]);
});

test('without credentials the push is refused; a dry run sends nothing; a simulated push marks nothing', async () => {
  const state = await books();
  const missing = await runTool(state, 'push_zoho_invoices', { period: '2026-09' });
  assert.equal(missing.error, 'CONNECTOR_NOT_CONFIGURED');
  const saved = await runTool(state, 'set_channel_connector', { channel: 'zoho', orgId: '60001', dc: 'in', clientId: '1000.ABC', clientSecret: 'shh', refreshToken: '1000.refresh' });
  assert.equal(saved.data.configured, true, JSON.stringify(saved));
  assert.deepEqual(saved.data.pushes, ['invoices']);
  const listed = await chat(state, 'channel connectors');
  assert.match(listed.reply, /Zoho Books: connected \(push invoices\)/, listed.reply);
  const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'push_zoho_invoices', { period: '2026-09' }));
  assert.equal(dry.ok, false, JSON.stringify(dry));
  assert.equal(state.invoices.some((inv) => inv.zohoInvoiceId), false);
  const mock = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'push invoices to zoho for 2026-09'));
  assert.match(mock.reply, /^Simulated: 2 invoices of September 2026 sent to Zoho Books\.\n· INV-0001 → MOCK-ZB-INV-0001/, mock.reply);
  assert.match(mock.reply, /Nothing was sent and nothing is marked as pushed\./);
  assert.equal(state.invoices.some((inv) => inv.zohoInvoiceId), false);
  const nothing = await runTool(state, 'push_zoho_invoices', { period: '2026-08' });
  assert.equal(nothing.data.nothingToPush, true);
});

test('live: with a CA approval the invoices go to a fake Zoho, the customer is found or created, and each invoice keeps its Zoho id so it is not sent twice', async () => {
  const state = await books();
  await runTool(state, 'set_channel_connector', { channel: 'zoho', orgId: '60001', dc: 'in', clientId: '1000.ABC', clientSecret: 'shh', refreshToken: '1000.refresh' });
  const calls = [];
  let nextInvoice = 1;
  const fakeFetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url}`);
    const json = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => '' }, text: async () => JSON.stringify(body) });
    if (url.startsWith('https://accounts.zoho.in/oauth/v2/token')) return json({ access_token: 'ztok' });
    if (!url.includes('organization_id=60001')) return json({ code: 1, message: 'no org' }, 400);
    if (url.includes('/settings/taxes')) return json({ code: 0, taxes: TAXES });
    if (url.includes('/contacts?organization_id') && init.method === 'POST') return json({ code: 0, contact: { contact_id: 'C-NEW' } });
    if (url.includes('/contacts?contact_name=Kiran')) return json({ code: 0, contacts: [{ contact_id: 'C-KIRAN', contact_name: 'Kiran Stores' }] });
    if (url.includes('/contacts?contact_name=')) return json({ code: 0, contacts: [] });
    if (url.includes('/invoices') && init.method === 'POST') { const body = JSON.parse(init.body); return json({ code: 0, invoice: { invoice_id: `ZB-${nextInvoice++}`, invoice_number: body.invoice_number } }); }
    return json({ code: 9, message: 'unexpected' }, 500);
  };
  setChannelClient(new ChannelClient({ fetchFn: fakeFetch }));
  try {
    const unapproved = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'push_zoho_invoices', { period: '2026-09' }));
    assert.equal(unapproved.error, 'APPROVAL_REQUIRED', JSON.stringify(unapproved));
    const params = { period: '2026-09', invoices: ['INV-0001', 'INV-0002'] };
    const req = requestApproval(state, { operationId: 'zoho_push_invoices', clientId: 'SELF', params, actor: { userId: 'owner', role: 'owner' } });
    decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
    const live = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'push_zoho_invoices', { period: '2026-09', caApprovalId: req.approval.approvalId }));
    assert.equal(live.ok, true, JSON.stringify(live));
    assert.deepEqual(live.data.pushed, [{ id: 'INV-0001', zohoInvoiceId: 'ZB-1', customerId: 'C-KIRAN' }, { id: 'INV-0002', zohoInvoiceId: 'ZB-2', customerId: 'C-NEW' }]);
    assert.equal(state.invoices[0].zohoInvoiceId, 'ZB-1');
    assert.equal(state.invoices[1].zohoPushedOn.length, 10);
    assert.ok(calls.some((c) => c.startsWith('POST https://www.zohoapis.in/books/v3/contacts?organization_id=60001')), calls.join('\n'));
    assert.equal(calls.filter((c) => c.includes('/invoices?')).length, 2);
    const again = await runTool(state, 'push_zoho_invoices', { period: '2026-09' });
    assert.equal(again.data.nothingToPush, true, 'pushed invoices are not sent twice');
    assert.ok(state.auditEvents.some((e) => String(e.action || e.type || '').includes('zoho_push_invoices')), 'the push is audited');
  } finally {
    setChannelClient(null);
  }
});
