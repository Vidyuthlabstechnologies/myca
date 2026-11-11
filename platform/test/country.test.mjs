import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { engineToolOwner } from '../src/countries/manifests.mjs';
import { countryOf, countryInfo, formatMoney, yearOf, yearWords, toolsForCountry, toolServesCountry, setCurrentCountry, formatMoneyCurrent } from '../src/country.mjs';
import { countryPack } from '../src/countries/index.mjs';
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
  const usOnly = countryPack('US').tools.filter((name) => TOOLS.some((tool) => tool.name === name));
  assert.ok(usOnly.length >= 38);
  for (const name of usOnly) {
    assert.ok(shared.includes(name), name);
    assert.equal(toolServesCountry(name, 'IN'), false, name);
  }
  const otherCountries = TOOLS.filter((tool) => !usOnly.includes(tool.name) && !toolServesCountry(tool.name, 'IN')).map((tool) => tool.name);
  assert.ok(otherCountries.every((name) => !['IN', 'US', '*'].includes(engineToolOwner(name))), otherCountries.join(', '));
  assert.equal(toolsForCountry(TOOLS, 'IN').length, TOOLS.length - usOnly.length - otherCountries.length);
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
