import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const fixture = (name) => readFileSync(fileURLToPath(new URL(`../../sprints/sprint-3-gst-recon/test/fixtures/${name}`, import.meta.url)), 'utf8');

function files() {
  return {
    purchaseRegister: fixture('purchaseregister.csv'),
    gstr2b: fixture('gstr2b-b2b.csv'),
    gstr1: fixture('gstr1.csv'),
    gstr3b: fixture('gstr3b.csv'),
  };
}

test('H4: gst_reconcile reports blocked credit in tax, and uses today when no date is given', async () => {
  const out = await runTool(createState(), 'gst_reconcile', files());
  assert.equal(out.ok, true);
  assert.equal(out.data.summary.itcBlocked, 8400);
  assert.equal(out.data.summary.itcEligible, 19800);
  assert.notEqual(out.data.summary.asOfDate, '2026-09-07');
  assert.match(out.data.summary.asOfDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out.data.summary.rule37AChecked, false);
});

test('H4: supplier filing status passed to gst_reconcile drives Rule 37A reversal', async () => {
  const supplierFilings = [{ gstin: '27AABCU9603R1ZN', period: '2025-04', filedOn: null }];
  const out = await runTool(createState(), 'gst_reconcile', { ...files(), asOfDate: '2026-10-01', supplierFilings });
  assert.equal(out.data.summary.rule37AChecked, true);
  const codes = out.data.issues.filter((i) => i.code === 'RULE_37A_REVERSAL').map((i) => i.ref).sort();
  assert.deepEqual(codes, ['INV-1001', 'INV-1002', 'INV-1003']);
});

test('H4: the assistant contract bounds supplier filings and checks their shape', () => {
  assert.equal(validateAssistantToolCall('gst_reconcile', { supplierFilings: [{ gstin: '27AABCU9603R1ZN', period: '2025-04', filedOn: null }] }).ok, true);
  assert.equal(validateAssistantToolCall('gst_reconcile', { supplierFilings: [{ gstin: '27AABCU9603R1ZN', period: 'April' }] }).ok, false);
  const many = Array.from({ length: 5001 }, () => ({ gstin: '27AABCU9603R1ZN', period: '2025-04' }));
  assert.equal(validateAssistantToolCall('gst_reconcile', { supplierFilings: many }).ok, false);
});
