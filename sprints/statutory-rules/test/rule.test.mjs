import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuleBook, rule } from '../src/index.mjs';
import { fixtureRecord, versionedFixture } from './fixtures/records.mjs';

const book = createRuleBook(versionedFixture());

test('a version in force on the date is returned with its value and record', () => {
  const result = book.rule('test.rate', '2026-09-21');
  assert.equal(result.ok, true);
  assert.equal(result.value, 5);
  assert.equal(result.record.id, 'test.rate');
  assert.equal(result.record.effectiveFrom, '2025-10-01');
  assert.equal(result.record.effectiveTo, null);
  assert.equal(result.record.basis, 'taxable_value');
  assert.equal(result.value, result.record.value);
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'record', 'value']);
});

test('effectiveFrom is inclusive', () => {
  assert.equal(book.rule('test.rate', '2025-10-01').value, 5);
  assert.equal(book.rule('test.rate', '2017-07-01').value, 12);
});

test('effectiveTo is inclusive', () => {
  assert.equal(book.rule('test.rate', '2025-09-30').value, 12);
  assert.equal(book.rule('test.limit', '2026-03-31').value.amountPaise, 25000000);
});

test('an open-ended version stays in force indefinitely', () => {
  assert.equal(book.rule('test.rate', '2099-12-31').value, 5);
});

test('a date before the first version is not in force', () => {
  assert.deepEqual(book.rule('test.rate', '2017-06-30'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: 'test.rate', onDate: '2017-06-30' });
});

test('a date after a closed last version is not in force and never falls back to the latest version', () => {
  assert.deepEqual(book.rule('test.limit', '2026-04-01'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: 'test.limit', onDate: '2026-04-01' });
  assert.deepEqual(book.rule('test.limit', '2025-03-31'), { ok: false, error: 'RULE_NOT_IN_FORCE', id: 'test.limit', onDate: '2025-03-31' });
});

test('a single-day version applies on that day only', () => {
  assert.equal(book.rule('test.single-day', '2026-01-15').value, true);
  assert.equal(book.rule('test.single-day', '2026-01-14').error, 'RULE_NOT_IN_FORCE');
  assert.equal(book.rule('test.single-day', '2026-01-16').error, 'RULE_NOT_IN_FORCE');
});

test('an unknown id is RULE_UNKNOWN, including prototype names and non-strings', () => {
  for (const id of ['test.nope', 'constructor', 'toString', '__proto__', '', null, undefined, 5, {}]) {
    assert.deepEqual(book.rule(id, '2026-01-15'), { ok: false, error: 'RULE_UNKNOWN' }, String(id));
  }
});

test('a date that is not a real ISO calendar date is RULE_DATE_INVALID, never a guess', () => {
  for (const onDate of ['2025-02-29', '2025-10-1', '2025-10-01T00:00:00Z', '', null, undefined, 20251001, new Date(0)]) {
    assert.deepEqual(book.rule('test.rate', onDate), { ok: false, error: 'RULE_DATE_INVALID', id: 'test.rate', onDate }, String(onDate));
  }
});

test('returned records and values are frozen copies isolated from the caller records', () => {
  const records = versionedFixture();
  const isolated = createRuleBook(records);
  records[2].value.amountPaise = 1;
  records[0].value = 99;
  const limit = isolated.rule('test.limit', '2025-06-01');
  assert.equal(limit.value.amountPaise, 25000000);
  assert.equal(isolated.rule('test.rate', '2026-01-01').value, 5);
  assert.ok(Object.isFrozen(limit.record));
  assert.ok(Object.isFrozen(limit.value));
  assert.ok(Object.isFrozen(limit.record.attestations));
  assert.throws(() => { limit.value.amountPaise = 2; }, TypeError);
});

test('an id whose versions fail integrity fails closed while other ids keep working', () => {
  const broken = createRuleBook([
    fixtureRecord({ effectiveFrom: '2024-04-01', effectiveTo: '2024-08-01' }),
    fixtureRecord({ effectiveFrom: '2024-08-01', effectiveTo: null }),
    fixtureRecord({ id: 'test.missing-source', source: '' }),
    fixtureRecord({ id: 'test.other', value: 7 })
  ]);
  assert.equal(broken.integrity.ok, false);
  assert.deepEqual(broken.rule('test.threshold', '2024-05-01'), { ok: false, error: 'RULE_REGISTRY_INVALID', id: 'test.threshold' });
  assert.deepEqual(broken.rule('test.missing-source', '2024-05-01'), { ok: false, error: 'RULE_REGISTRY_INVALID', id: 'test.missing-source' });
  assert.equal(broken.rule('test.other', '2024-05-01').value, 7);
  assert.deepEqual(broken.records.map((record) => record.id), ['test.other']);
});

test('a record that cannot be attributed to an id fails the whole book closed', () => {
  for (const records of [[fixtureRecord({ id: 'test.other' }), fixtureRecord({ id: '' })], [fixtureRecord({ id: 'test.other' }), null], 'not-an-array']) {
    const broken = createRuleBook(records);
    assert.equal(broken.integrity.ok, false);
    assert.deepEqual(broken.rule('test.other', '2024-05-01'), { ok: false, error: 'RULE_REGISTRY_INVALID', id: 'test.other' });
    assert.deepEqual(broken.records, []);
  }
});

test('a book built from values that cannot be cloned still returns errors instead of throwing', () => {
  const broken = createRuleBook([fixtureRecord({ value: () => 1 }), fixtureRecord({ id: 'test.other', value: 2 })]);
  assert.equal(broken.rule('test.threshold', '2024-05-01').error, 'RULE_REGISTRY_INVALID');
  assert.equal(broken.rule('test.other', '2024-05-01').value, 2);
});

test('the default rule() reads the registry and reports ids nobody registered as unknown', () => {
  assert.deepEqual(rule('test.never-registered', '2026-04-01'), { ok: false, error: 'RULE_UNKNOWN' });
});
