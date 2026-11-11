import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { countryOf, countryInfo, formatMoney, yearOf, yearWords, toolsForCountry, toolServesCountry, setCurrentCountry, formatMoneyCurrent } from '../src/country.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

test('a business is Indian unless it says otherwise, and the country fixes currency, locale and the year', () => {
  const state = createState();
  assert.equal(countryOf(state), 'IN');
  assert.equal(countryInfo(state).currency, 'INR');
  assert.equal(formatMoney(state, 1234567.5), '₹12,34,567.50');
  assert.equal(yearOf(state, '2026-10-13'), '2026-27');
  assert.equal(yearWords(state, '2026-02-13'), 'FY 2025-26');
  state.company.country = 'US';
  assert.equal(countryInfo(state).currency, 'USD');
  assert.equal(formatMoney(state, 1234567.5), '$1,234,567.50');
  assert.equal(yearOf(state, '2026-10-13'), '2026');
  assert.equal(yearWords(state, '2026-02-13'), '2026');
  assert.equal(countryOf({ company: { country: 'xx' } }), 'IN', 'an unknown code falls back to India');
  setCurrentCountry('US');
  assert.equal(formatMoneyCurrent(10), '$10.00');
  setCurrentCountry('IN');
  assert.equal(formatMoneyCurrent(10), '₹10.00');
});

test('the country is set once, before anything is posted, and a US business needs no GSTIN or state', async () => {
  const state = createState();
  state.company = { name: 'Fresh Books', gstin: '', state: '', pan: '', fy: '' };
  const set = await runTool(state, 'set_company', { country: 'us', name: 'Maple Street Bakery', ein: '12-3456789' });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(state.company.country, 'US');
  assert.equal(state.company.ein, '12-3456789');
  assert.equal((await runTool(state, 'set_company', { country: 'FR' })).error, 'UNKNOWN_COUNTRY');
  assert.equal((await runTool(state, 'set_company', { ein: '12345' })).error, 'INVALID_EIN');
  const again = await runTool(state, 'set_company', { country: 'US', name: 'Maple Street Bakery' });
  assert.equal(again.ok, true, 'saying the same country again is fine');
  const indian = createState();
  createInvoice(indian, { id: 'INV-0001', date: '2026-09-05', partyName: 'Retail Mart', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal((await runTool(indian, 'set_company', { country: 'US' })).error, 'COUNTRY_FIXED', 'not after a posting');
  assert.match(validateAssistantToolCall('set_company', { name: 'Maple Street Bakery', country: 'US' }).error, /cannot call set_company/, 'the assistant never changes the country');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.company.country, 'US');
});

test('a US business sees the shared and US-only tools; Indian tools are refused for it and an Indian business sees everything but the US-only ones', async () => {
  const shared = toolsForCountry(TOOLS, 'US').map((tool) => tool.name);
  assert.ok(shared.includes('list_invoices'));
  assert.ok(shared.includes('cash_forecast'));
  assert.ok(shared.includes('list_employees'));
  for (const indian of ['gst_payable', 'prepare_gstr1', 'tds_summary', 'pf_ecr', 'import_tally', 'govt_generate_irn', 'gst_review', 'tds_return']) {
    assert.equal(shared.includes(indian), false, indian);
    assert.equal(toolServesCountry(indian, 'IN'), true);
  }
  const usOnly = ['import_payroll_summary', 'list_payroll_imports', 'us_connectors', 'plaid_link_sandbox', 'plaid_link_token', 'plaid_exchange', 'track1099_csv', 'track1099_issuers', 'track1099_import', 'track1099_job', 'taxjar_rate', 'gusto_connect_url', 'gusto_callback', 'set_sales_tax_rate', 'list_sales_tax_rates', 'set_contractor', 'contractor_payments', 'set_sales_tax_nexus', 'list_sales_tax_nexus', 'sales_tax_return', 'sales_tax_review', 'sales_tax_review_answer', 'record_sales_tax_payment', 'record_sales_tax_filing', 'sales_tax_overview', 'set_withholding', 'us_payroll_filings', 'schedule_c_summary', 'estimated_tax_dates', 'import_us_invoices', 'contractor_1099_file', 'set_suta_rate', 'list_suta_rates', 'schedule_se', 'schedule_c_document', 'cpa_pack', 'payroll_941_file', 'payroll_w2_file', 'read_us_tax_document', 'us_return_pdf', 'us_taxpayer', 'us_return_status', 'list_us_tax_forms', 'us_interview', 'us_return_review', 'us_form_kinds', 'us_tax_estimate', 'set_us_taxpayer', 'add_us_tax_form', 'remove_us_tax_form', 'answer_us_interview'];
  for (const name of usOnly) {
    assert.ok(shared.includes(name), name);
    assert.equal(toolServesCountry(name, 'IN'), false, name);
  }
  assert.equal(toolsForCountry(TOOLS, 'IN').length, TOOLS.length - usOnly.length);
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '' };
  const refused = await runTool(state, 'gst_payable', {});
  assert.equal(refused.error, 'NOT_FOR_COUNTRY');
  assert.equal(refused.country, 'US');
  const allowed = await runTool(state, 'business_summary', {});
  assert.equal(allowed.ok, true, JSON.stringify(allowed));
  const out = await chat(state, 'who owes me?');
  assert.ok(!/₹/.test(out.reply), out.reply);
});
