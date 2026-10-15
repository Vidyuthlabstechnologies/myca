import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('a 0% line carries its supply type; GSTR-9 table 5 and the GSTR-1 nil table are split from it; unmarked lines are named', async () => {
  const state = books();
  const nil = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'Fresh milk', hsn: '0401', qty: 10, rate: 50, gstRate: 0, supply: 'nil' }], date: '2026-07-10' });
  assert.equal(nil.ok, true, JSON.stringify(nil));
  assert.equal(nil.invoice.lines[0].supply, 'nil');
  const exempt = await runTool(state, 'create_invoice', { partyName: 'Walk-in', lines: [{ description: 'Seeds', hsn: '1209', qty: 2, rate: 300, gstRate: 0, supply: 'exempt' }], date: '2026-07-12' });
  assert.equal(exempt.ok, true);
  const unmarked = await runTool(state, 'create_invoice', { partyName: 'Walk-in', lines: [{ description: 'Petrol', hsn: '2710', qty: 1, rate: 1000, gstRate: 0 }], date: '2026-07-15' });
  assert.equal(unmarked.ok, true);
  assert.equal(unmarked.invoice.lines[0].supply, undefined);
  const bad = await runTool(state, 'create_invoice', { partyName: 'Walk-in', lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 0, supply: 'free' }], date: '2026-07-15' });
  assert.equal(bad.error, 'BAD_SUPPLY_TYPE');
  const rated = await runTool(state, 'create_invoice', { partyName: 'Walk-in', lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 18, supply: 'exempt' }], date: '2026-07-15' });
  assert.equal(rated.error, 'SUPPLY_TYPE_NEEDS_ZERO_RATE');
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 0, supply: 'non-gst' }] }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 0, supply: 'zero' }] }).ok, false);

  const nine = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(nine.ok, true, JSON.stringify(nine).slice(0, 300));
  assert.equal(nine.data.table5.nilRated, 500);
  assert.equal(nine.data.table5.exempt, 600);
  assert.equal(nine.data.table5.nonGst, 0);
  assert.equal(nine.data.table5.unsplit, 1000);
  assert.equal(nine.data.table5.unsplitLines, 1);
  assert.equal(nine.data.table5.nilRatedOrExempt, 2100);
  assert.ok(nine.data.notes.some((n) => /1 line at 0% GST \(1000\) carr(y|ies) no supply type/.test(n)), JSON.stringify(nine.data.notes));

  const json = await runTool(state, 'export_gstr1_json', { period: '2026-07' });
  assert.equal(json.ok, true, JSON.stringify(json).slice(0, 300));
  const out = json.data?.json || json.data || json;
  const nilSection = out.nil || out.data?.nil;
  assert.ok(nilSection, JSON.stringify(Object.keys(out)));
  const rows = Object.fromEntries(nilSection.inv.map((r) => [r.sply_ty, r]));
  assert.equal(rows.INTRAB2B.nil_amt, 500);
  assert.equal(rows.INTRAB2C.expt_amt, 600);
  assert.equal(rows.INTRAB2C.ngsup_amt, 0);
  const warnings = out.warnings || out.data?.warnings || [];
  assert.ok(warnings.some((w) => /1 line at 0% GST carr(y|ies) no supply type/.test(w)), JSON.stringify(warnings));
});
