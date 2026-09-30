import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRules } from '../src/index.mjs';
import { fixtureRecord, versionedFixture } from './fixtures/records.mjs';

function codes(result) {
  return result.problems.map((problem) => problem.code);
}

test('a well-formed versioned set with consecutive and open-ended versions is valid', () => {
  const result = validateRules(versionedFixture());
  assert.deepEqual(result, { ok: true, problems: [] });
});

test('an empty set is valid and a non-array is not', () => {
  assert.deepEqual(validateRules([]), { ok: true, problems: [] });
  for (const bad of [null, undefined, {}, 'rules']) {
    const result = validateRules(bad);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), ['RULES_NOT_ARRAY']);
  }
});

test('non-object entries are rejected', () => {
  for (const bad of [null, 5, 'x', []]) {
    const result = validateRules([bad]);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), ['RECORD_NOT_OBJECT']);
    assert.equal(result.problems[0].index, 0);
  }
});

test('each required field is enforced with its own code', () => {
  const cases = [
    [{ id: undefined }, 'RECORD_ID_INVALID'],
    [{ id: '' }, 'RECORD_ID_INVALID'],
    [{ id: 'has space' }, 'RECORD_ID_INVALID'],
    [{ id: 'has@at' }, 'RECORD_ID_INVALID'],
    [{ id: '.leading' }, 'RECORD_ID_INVALID'],
    [{ value: undefined }, 'RECORD_VALUE_INVALID'],
    [{ effectiveFrom: undefined }, 'RECORD_EFFECTIVE_FROM_INVALID'],
    [{ effectiveFrom: '2024-02-30' }, 'RECORD_EFFECTIVE_FROM_INVALID'],
    [{ effectiveTo: undefined }, 'RECORD_EFFECTIVE_TO_INVALID'],
    [{ effectiveTo: '2025-13-01' }, 'RECORD_EFFECTIVE_TO_INVALID'],
    [{ effectiveTo: '' }, 'RECORD_EFFECTIVE_TO_INVALID'],
    [{ effectiveFrom: '2025-04-01', effectiveTo: '2025-03-31' }, 'RECORD_RANGE_INVERTED'],
    [{ act: '' }, 'RECORD_ACT_INVALID'],
    [{ act: undefined }, 'RECORD_ACT_INVALID'],
    [{ section: undefined }, 'RECORD_SECTION_INVALID'],
    [{ section: 7 }, 'RECORD_SECTION_INVALID'],
    [{ source: '' }, 'RECORD_SOURCE_INVALID'],
    [{ source: '   ' }, 'RECORD_SOURCE_INVALID'],
    [{ source: undefined }, 'RECORD_SOURCE_INVALID'],
    [{ basis: '' }, 'RECORD_BASIS_INVALID'],
    [{ basis: 3 }, 'RECORD_BASIS_INVALID'],
    [{ attestations: undefined }, 'RECORD_ATTESTATIONS_INVALID'],
    [{ attestations: {} }, 'RECORD_ATTESTATIONS_INVALID']
  ];
  for (const [override, code] of cases) {
    const record = fixtureRecord(override);
    for (const key of Object.keys(override)) if (override[key] === undefined) delete record[key];
    const result = validateRules([record]);
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.ok(codes(result).includes(code), `${JSON.stringify(override)} -> ${JSON.stringify(codes(result))}`);
  }
});

test('an empty section is allowed while the Act mapping is unconfirmed', () => {
  assert.equal(validateRules([fixtureRecord({ section: '' })]).ok, true);
});

test('unknown fields are rejected so a misspelt date field cannot silently open-end a rule', () => {
  const record = fixtureRecord({ effectiveTill: '2025-03-31' });
  const result = validateRules([record]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [{ code: 'RECORD_UNKNOWN_FIELD', index: 0, id: 'test.threshold', field: 'effectiveTill' }]);
});

test('values must be plain data', () => {
  class Slab { constructor() { this.rate = 5; } }
  for (const bad of [() => 1, Number.NaN, Number.POSITIVE_INFINITY, new Date(0), new Map(), new Slab(), [1, undefined], { a: Symbol('x') }, { a: 10n }]) {
    const result = validateRules([fixtureRecord({ value: bad })]);
    assert.equal(result.ok, false, String(bad));
    assert.deepEqual(codes(result), ['RECORD_VALUE_INVALID']);
  }
  for (const good of [0, -1, 'text', false, null, [], {}, [{ upToPaise: 40000000, ratePercent: 0 }, { upToPaise: null, ratePercent: 30 }], Object.create(null)]) {
    assert.equal(validateRules([fixtureRecord({ value: good })]).ok, true, JSON.stringify(good));
  }
});

test('attestations must name who, which role, which firm, when and what verdict', () => {
  const advisor = { by: 'Advisor, ICAI M.No. 000000', role: 'advisor', firmId: null, on: '2026-10-02', verdict: 'verified' };
  const firm = { by: 'Partner', role: 'firm', firmId: 'firm-a', on: '2026-10-03', verdict: 'disputed' };
  assert.equal(validateRules([fixtureRecord({ attestations: [advisor, firm] })]).ok, true);
  const bad = [
    { ...advisor, by: '' },
    { ...advisor, role: 'client' },
    { ...advisor, firmId: 'firm-a' },
    { ...firm, firmId: null },
    { ...firm, firmId: '' },
    { ...advisor, on: '2026-02-30' },
    { ...advisor, verdict: 'approved' },
    { ...advisor, note: 'extra' },
    null,
    'verified'
  ];
  for (const attestation of bad) {
    const result = validateRules([fixtureRecord({ attestations: [attestation] })]);
    assert.equal(result.ok, false, JSON.stringify(attestation));
    assert.deepEqual(codes(result), ['ATTESTATION_INVALID'], JSON.stringify(attestation));
    assert.equal(result.problems[0].attestation, 0);
  }
});

test('two versions of an id may not overlap, including on a shared boundary day', () => {
  const result = validateRules([
    fixtureRecord({ effectiveFrom: '2024-04-01', effectiveTo: '2024-08-01' }),
    fixtureRecord({ effectiveFrom: '2024-08-01', effectiveTo: null })
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [{ code: 'RULE_OVERLAP', id: 'test.threshold', effectiveFrom: '2024-08-01', previousEffectiveFrom: '2024-04-01', previousEffectiveTo: '2024-08-01' }]);
});

test('an open-ended version followed by a later version is an overlap', () => {
  const result = validateRules([
    fixtureRecord({ effectiveFrom: '2025-04-01', effectiveTo: null }),
    fixtureRecord({ effectiveFrom: '2024-04-01', effectiveTo: null })
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['RULE_OVERLAP']);
  assert.equal(result.problems[0].previousEffectiveFrom, '2024-04-01');
});

test('a gap between consecutive versions of an id is rejected', () => {
  const result = validateRules([
    fixtureRecord({ effectiveFrom: '2024-04-01', effectiveTo: '2024-07-30' }),
    fixtureRecord({ effectiveFrom: '2024-08-01', effectiveTo: null })
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [{ code: 'RULE_GAP', id: 'test.threshold', effectiveFrom: '2024-08-01', previousEffectiveTo: '2024-07-30' }]);
});

test('versions meeting across a month, year and leap-day boundary have no gap', () => {
  const result = validateRules([
    fixtureRecord({ effectiveFrom: '2023-04-01', effectiveTo: '2024-02-29' }),
    fixtureRecord({ effectiveFrom: '2024-03-01', effectiveTo: '2024-12-31' }),
    fixtureRecord({ effectiveFrom: '2025-01-01', effectiveTo: null })
  ]);
  assert.deepEqual(result, { ok: true, problems: [] });
});

test('two versions of an id with the same effectiveFrom are duplicates', () => {
  const result = validateRules([
    fixtureRecord({ value: 1 }),
    fixtureRecord({ value: 2 })
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [{ code: 'RULE_DUPLICATE_VERSION', id: 'test.threshold', effectiveFrom: '2024-04-01' }]);
});

test('validation does not mutate or reorder the caller records', () => {
  const records = versionedFixture();
  const before = JSON.stringify(records);
  validateRules(records);
  assert.equal(JSON.stringify(records), before);
});

test('an overlap with an earlier long-running version is caught even when the adjacent version ends in time', () => {
  const result = validateRules([
    fixtureRecord({ effectiveFrom: '2020-04-01', effectiveTo: '2030-03-31' }),
    fixtureRecord({ effectiveFrom: '2021-04-01', effectiveTo: '2022-03-31' }),
    fixtureRecord({ effectiveFrom: '2022-04-01', effectiveTo: null })
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['RULE_OVERLAP', 'RULE_OVERLAP']);
  assert.deepEqual(result.problems.map((problem) => problem.previousEffectiveTo), ['2030-03-31', '2030-03-31']);
});
