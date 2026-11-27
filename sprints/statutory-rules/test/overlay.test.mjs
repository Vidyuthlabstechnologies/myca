import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES, mergeRecords, registryIntegrity, rule, ruleOverlay, setRuleOverlay } from '../src/index.mjs';
import { loadDataRecords } from '../src/data.mjs';

afterEach(() => setRuleOverlay([]));

const version = (id, from, to, value = { v: from }) => ({ id, value, basis: 'period_end', effectiveFrom: from, effectiveTo: to, act: 'CGST', section: 'x', source: 'test', attestations: [] });
const spans = (records, id) => records.filter((record) => record.id === id).map((record) => `${record.effectiveFrom}..${record.effectiveTo}`).sort();

test('a new record takes over from the one in force, with no edit to the old one', () => {
  const merged = mergeRecords([version('a', '2020-01-01', null)], [version('a', '2026-12-01', null)]);
  assert.deepEqual(spans(merged, 'a'), ['2020-01-01..2026-11-30', '2026-12-01..null']);
});

test('a record inside an older one splits it, and a record that covers it replaces it', () => {
  assert.deepEqual(spans(mergeRecords([version('a', '2020-01-01', null)], [version('a', '2023-03-01', '2023-03-31')]), 'a'), ['2020-01-01..2023-02-28', '2023-03-01..2023-03-31', '2023-04-01..null']);
  assert.deepEqual(spans(mergeRecords([version('a', '2020-01-01', '2022-12-31'), version('a', '2023-01-01', null)], [version('a', '2019-01-01', null)]), 'a'), ['2019-01-01..null']);
});

test('a record starting inside an older one and ending before its end keeps the tail of the old one', () => {
  const merged = mergeRecords([version('a', '2020-01-01', '2024-12-31')], [version('a', '2019-06-01', '2021-06-30')]);
  assert.deepEqual(spans(merged, 'a'), ['2019-06-01..2021-06-30', '2021-07-01..2024-12-31']);
});

test('records of other rules are untouched, and the inputs are never changed', () => {
  const base = [version('a', '2020-01-01', null), version('b', '2020-01-01', null)];
  const copy = structuredClone(base);
  const merged = mergeRecords(base, [version('a', '2026-12-01', null)]);
  assert.deepEqual(spans(merged, 'b'), ['2020-01-01..null']);
  assert.deepEqual(base, copy);
});

test('a runtime overlay changes what rule() answers at once, from its date, and leaves earlier dates alone', () => {
  const before = rule('gst.itc.time-limit', '2026-12-15');
  assert.equal(before.value.day, 30);
  const changed = setRuleOverlay([version('gst.itc.time-limit', '2026-12-01', null, { month: 12, day: 31, after: 'end_of_financial_year_of_the_invoice', orAnnualReturnIfEarlier: true })]);
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(rule('gst.itc.time-limit', '2026-12-15').value.day, 31);
  assert.equal(rule('gst.itc.time-limit', '2026-11-30').value.day, 30, 'the day before it starts, the old rule still holds');
  assert.equal(registryIntegrity().ok, true);
  assert.ok(RULES.some((record) => record.id === 'gst.itc.time-limit' && record.effectiveFrom === '2026-12-01'), 'RULES shows the change too');
});

test('a brand new rule can be added without touching any file', () => {
  assert.equal(rule('gst.demo.new-rule', '2027-01-01').ok, false);
  assert.equal(setRuleOverlay([version('gst.demo.new-rule', '2027-01-01', null, { rate: 3 })]).ok, true);
  assert.deepEqual(rule('gst.demo.new-rule', '2027-06-01').value, { rate: 3 });
  assert.equal(rule('gst.demo.new-rule', '2026-12-31').error, 'RULE_NOT_IN_FORCE');
});

test('a change that is malformed is refused whole, and nothing in force changes', () => {
  setRuleOverlay([version('gst.demo.keep', '2027-01-01', null, { kept: true })]);
  const bad = [
    { ...version('gst.demo.keep', '2028-01-01', null), act: '' },
    { ...version('gst.demo.keep2', '2028-01-01', '2027-01-01') },
    { ...version('gst.demo.keep3', '2028-13-45', null) },
    { ...version('gst.demo.keep4', '2028-01-01', null), extra: 1 },
    { ...version('not a valid id!', '2028-01-01', null) },
    { ...version('gst.demo.keep5', '2028-01-01', null), value: undefined },
  ];
  for (const record of bad) {
    const out = setRuleOverlay([record]);
    assert.equal(out.ok, false, JSON.stringify(record));
    assert.ok(out.problems.length > 0);
    assert.deepEqual(rule('gst.demo.keep', '2027-06-01').value, { kept: true }, 'the earlier overlay is still in force');
  }
  assert.equal(registryIntegrity().ok, true);
});

test('two changes to one rule that overlap each other are refused, so it is never unclear which wins', () => {
  const out = setRuleOverlay([version('gst.demo.two', '2027-01-01', null), version('gst.demo.two', '2027-06-01', null)]);
  assert.equal(out.ok, false);
  assert.ok(out.problems.some((problem) => problem.code === 'RULE_OVERLAP'));
  assert.deepEqual(ruleOverlay(), []);
});

test('an overlay can carry its reviewer, and the rule counts as reviewed', () => {
  setRuleOverlay([{ ...version('gst.demo.reviewed', '2027-01-01', null), attestations: [{ by: 'CA Rao', role: 'advisor', firmId: null, on: '2026-11-27', verdict: 'verified' }] }]);
  assert.equal(rule('gst.demo.reviewed', '2027-02-01').record.attestations[0].by, 'CA Rao');
});

test('clearing the overlay returns exactly the built-in rules', () => {
  const before = RULES.length;
  setRuleOverlay([version('gst.demo.extra', '2027-01-01', null)]);
  assert.equal(RULES.length, before + 1);
  setRuleOverlay([]);
  assert.equal(RULES.length, before);
});

test('what is returned by ruleOverlay cannot be used to change the rules', () => {
  setRuleOverlay([version('gst.demo.copy', '2027-01-01', null, { n: 1 })]);
  const given = ruleOverlay();
  given[0].value.n = 99;
  assert.deepEqual(rule('gst.demo.copy', '2027-02-01').value, { n: 1 });
});

test('the data directory is read in order, and a broken file is a loud failure, not a silent skip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rules-'));
  writeFileSync(join(dir, 'b.json'), JSON.stringify([version('b', '2020-01-01', null)]));
  writeFileSync(join(dir, 'a.json'), JSON.stringify([version('a', '2020-01-01', null)]));
  writeFileSync(join(dir, 'notes.txt'), 'ignored');
  assert.deepEqual(loadDataRecords(dir).map((record) => record.id), ['a', 'b']);
  assert.deepEqual(loadDataRecords(join(dir, 'missing')), []);
  writeFileSync(join(dir, 'c.json'), '{ not json');
  assert.throws(() => loadDataRecords(dir), /c\.json is not valid JSON/);
  writeFileSync(join(dir, 'c.json'), '{"id":"x"}');
  assert.throws(() => loadDataRecords(dir), /must hold a list/);
});

test('the shipped GSTR-4 rule comes from a data file and gives the confirmed dates', () => {
  assert.equal(rule('due-date.gst.gstr-4', '2026-03-31').value.day, 30);
  assert.equal(rule('due-date.gst.gstr-4', '2026-03-31').record.act, 'CGST');
});
