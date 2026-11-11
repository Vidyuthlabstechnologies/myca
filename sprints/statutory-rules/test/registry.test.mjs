import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { RULE_MODULES, registeredRecords } from '../src/registry.mjs';
import { RULES, registryIntegrity, rule, validateRules, isIsoDate } from '../src/index.mjs';

const rulesDirectory = new URL('../src/rules/', import.meta.url);
const EXPECTED_MODULES = ['audit-thresholds', 'due-dates', 'gst', 'holidays', 'income-tax', 'msme', 'payroll', 'presumptive', 'tds', 'us-federal', 'us-individual', 'us-sales-tax'];

test('every rule module file is wired into the registry and exports a RULES array', async () => {
  const files = readdirSync(rulesDirectory).filter((file) => file.endsWith('.mjs')).map((file) => file.slice(0, -'.mjs'.length)).sort();
  assert.deepEqual(files, EXPECTED_MODULES);
  assert.deepEqual(Object.keys(RULE_MODULES).sort(), EXPECTED_MODULES);
  for (const name of files) {
    const module = await import(new URL(`${name}.mjs`, rulesDirectory));
    assert.ok(Array.isArray(module.RULES), `${name}.mjs must export a RULES array`);
    assert.equal(RULE_MODULES[name], module.RULES, `${name}.mjs RULES must be the registered array`);
  }
});

test('the registered records pass integrity: shape, unique versions, no overlaps, no gaps', () => {
  const records = registeredRecords();
  assert.ok(Array.isArray(records));
  const result = validateRules(records);
  assert.deepEqual(result.problems, [], JSON.stringify(result.problems, null, 2));
  assert.deepEqual(registryIntegrity(), { ok: true, problems: [] });
  assert.equal(RULES.length, records.length);
});

test('every registered record has an id, value, act, source and a valid inclusive date range', () => {
  for (const record of registeredRecords()) {
    const label = JSON.stringify({ id: record.id, effectiveFrom: record.effectiveFrom });
    assert.equal(typeof record.id, 'string', label);
    assert.ok(Object.hasOwn(record, 'value'), label);
    assert.ok(typeof record.act === 'string' && record.act.trim() !== '', label);
    assert.ok(typeof record.source === 'string' && record.source.trim() !== '', label);
    assert.ok(isIsoDate(record.effectiveFrom), label);
    assert.ok(record.effectiveTo === null || (isIsoDate(record.effectiveTo) && record.effectiveTo >= record.effectiveFrom), label);
    assert.ok(Array.isArray(record.attestations), label);
  }
});

test('each id@effectiveFrom version is unique across all modules', () => {
  const keys = registeredRecords().map((record) => `${record.id}@${record.effectiveFrom}`);
  assert.deepEqual(keys.filter((key, index) => keys.indexOf(key) !== index), []);
});

test('every registered version is what rule() returns on its first and last day', () => {
  for (const record of registeredRecords()) {
    const first = rule(record.id, record.effectiveFrom);
    assert.equal(first.ok, true, `${record.id}@${record.effectiveFrom}`);
    assert.equal(first.record.effectiveFrom, record.effectiveFrom);
    if (record.effectiveTo !== null) {
      const last = rule(record.id, record.effectiveTo);
      assert.equal(last.ok, true, `${record.id} on ${record.effectiveTo}`);
      assert.equal(last.record.effectiveFrom, record.effectiveFrom);
    }
  }
});
