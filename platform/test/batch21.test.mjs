import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { companyProfilePatch } from '../src/remote-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', address: '12 Market Road', city: 'Pune', pin: '411001' };
  return state;
}

test('the invoice design is set piece by piece, validated, printed on the desktop invoice and carried in the document for the app', async () => {
  const state = books();
  const plain = await runTool(state, 'invoice_template', {});
  assert.equal(plain.data.isDefault, true);
  assert.equal(plain.data.accent, '#b42318');

  const bankHeld = await chat(state, 'bank details on invoices: HDFC Bank, account 5010 0123 4567 89, IFSC hdfc0001234, UPI Asha@okhdfc');
  assert.match(bankHeld.reply, /Invoices will show account 50100123456789 IFSC HDFC0001234 UPI asha@okhdfc/, bankHeld.reply);
  const bank = await chat(state, 'yes');
  const set = async (text) => { await chat(state, text); return chat(state, 'yes'); };
  assert.match(bank.reply, /Payment: HDFC Bank, A\/c 50100123456789, IFSC HDFC0001234, UPI asha@okhdfc/, bank.reply);
  const noIfsc = await runTool(state, 'set_invoice_template', { bank: { account: '123456789', ifsc: '' } });
  assert.equal(noIfsc.error, 'IFSC_REQUIRED');
  assert.equal((await runTool(state, 'set_invoice_template', { bank: { ifsc: 'HDFC001234' } })).error, 'BAD_IFSC');
  assert.equal((await runTool(state, 'set_invoice_template', { bank: { upi: 'not an id' } })).error, 'BAD_UPI');
  assert.equal((await runTool(state, 'set_invoice_template', { accent: 'red' })).error, 'BAD_COLOUR');
  assert.equal((await runTool(state, 'set_invoice_template', {})).error, 'NOTHING_TO_CHANGE');
  assert.equal(validateAssistantToolCall('set_invoice_template', { bank: { account: '1', extra: 1 } }).ok, false);

  assert.match((await set('terms: Payment within 30 days. Interest at 18% after that.')).reply, /Terms: Payment within 30 days\. Interest at 18% after that\./);
  assert.match((await set('sign invoices as Asha Rao')).reply, /Signed for the business by Asha Rao/);
  assert.match((await set('invoice colour #1d4ed8')).reply, /colour #1d4ed8/);
  assert.match((await set('layout minimal')).reply, /Layout minimal/);
  assert.match((await set('hide HSN')).reply, /HSN column hidden/);
  assert.match((await set('footer: Thank you for your business')).reply, /Footer: Thank you for your business/);
  assert.equal(state.company.invoiceTemplate.bank.account, '50100123456789');

  const inv = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-05' });
  assert.equal(inv.ok, true);
  const printed = await runTool(state, 'print_invoice', { id: inv.invoice.id });
  assert.match(printed.html, /Pay to<\/strong><br>HDFC Bank, A\/c 50100123456789, IFSC HDFC0001234, UPI asha@okhdfc/);
  assert.match(printed.html, /Payment within 30 days\. Interest at 18% after that\./);
  assert.match(printed.html, /Asha Rao<\/section>/);
  assert.match(printed.html, /Thank you for your business/);
  assert.match(printed.html, /color:#1d4ed8/);
  assert.match(printed.html, /1px solid #1d4ed8/);
  assert.doesNotMatch(printed.html, /<th>HSN<\/th>/);
  assert.doesNotMatch(printed.html, /<td>5205<\/td>/);

  const doc = await runTool(state, 'invoice_document', { id: inv.invoice.id });
  assert.equal(doc.data.template.layout, 'minimal');
  assert.equal(doc.data.template.bankWords, 'HDFC Bank, A/c 50100123456789, IFSC HDFC0001234, UPI asha@okhdfc');
  assert.equal(doc.data.template.signatory, 'Asha Rao');
  assert.equal(doc.data.template.showHsn, false);
  assert.equal(doc.data.taxable, 1000);

  const shown = await chat(state, 'show invoice design');
  assert.match(shown.reply, /Layout minimal, colour #1d4ed8, HSN column hidden/);
  assert.equal(companyProfilePatch({ invoiceTemplate: state.company.invoiceTemplate }).invoiceTemplate.bank.ifsc, 'HDFC0001234');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.company.invoiceTemplate.footer, 'Thank you for your business');

  const back = await runTool(state, 'set_invoice_template', { accent: 'default', layout: 'classic', showHsn: true, bank: { account: '', ifsc: '', upi: '', name: '' }, terms: '', footer: '', signatory: '' });
  assert.equal(back.ok, true);
  assert.equal((await runTool(state, 'invoice_template', {})).data.isDefault, true);
  assert.match((await runTool(state, 'print_invoice', { id: inv.invoice.id })).html, /Authorised signatory/);
});
