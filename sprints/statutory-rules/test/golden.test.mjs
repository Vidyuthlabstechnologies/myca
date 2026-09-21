import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runGolden } from '../src/index.mjs';

const fixture = (name) => new URL(`./fixtures/golden/${name}`, import.meta.url);
const sum = (input) => ({ totalPaise: input.aPaise + input.bPaise });

test('every case passing gives ok with counts', async () => {
  const result = await runGolden(fixture('passing.json'), sum);
  assert.deepEqual(result, { ok: true, path: fileURLToPath(fixture('passing.json')), total: 2, passed: 2, failures: [] });
});

test('a string path works as well as a file URL', async () => {
  const path = fileURLToPath(fixture('passing.json'));
  const result = await runGolden(path, sum);
  assert.equal(result.ok, true);
  assert.equal(result.path, path);
});

test('a mismatch is reported with its citation, expected and actual values', async () => {
  const result = await runGolden(fixture('mixed.json'), sum);
  assert.equal(result.ok, false);
  assert.equal(result.total, 2);
  assert.equal(result.passed, 1);
  assert.deepEqual(result.failures, [{
    index: 1,
    name: 'deliberately wrong expectation',
    citation: 'Test fixture, not law',
    error: 'GOLDEN_MISMATCH',
    expected: { totalPaise: 1 },
    actual: { totalPaise: 300 }
  }]);
});

test('comparison is strict: types, extra keys and undefined properties all mismatch', async () => {
  for (const compute of [
    (input) => ({ totalPaise: String(input.aPaise + input.bPaise) }),
    (input) => ({ totalPaise: input.aPaise + input.bPaise, extra: 1 }),
    (input) => ({ totalPaise: input.aPaise + input.bPaise, note: undefined })
  ]) {
    const result = await runGolden(fixture('passing.json'), compute);
    assert.equal(result.ok, false);
    assert.equal(result.passed, 0);
  }
});

test('a { cases } wrapper is accepted', async () => {
  const result = await runGolden(fixture('wrapped.json'), sum);
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
});

test('async compute functions are awaited', async () => {
  const result = await runGolden(fixture('passing.json'), async (input) => sum(input));
  assert.equal(result.ok, true);
});

test('a case without input, expected or a citation is invalid and never computed', async () => {
  const seen = [];
  const result = await runGolden(fixture('invalid-cases.json'), (input) => { seen.push(input); return sum(input); });
  assert.equal(result.ok, false);
  assert.equal(result.total, 5);
  assert.equal(result.passed, 1);
  assert.deepEqual(result.failures.map((failure) => [failure.index, failure.error]), [
    [1, 'GOLDEN_CASE_INVALID'],
    [2, 'GOLDEN_CASE_INVALID'],
    [3, 'GOLDEN_CASE_INVALID'],
    [4, 'GOLDEN_CASE_INVALID']
  ]);
  assert.equal(seen.length, 1);
});

test('a compute that throws is a failure carrying the message, and later cases still run', async () => {
  let calls = 0;
  const result = await runGolden(fixture('passing.json'), (input) => {
    calls += 1;
    if (calls === 1) throw new Error('engine exploded');
    return sum(input);
  });
  assert.equal(result.ok, false);
  assert.equal(result.passed, 1);
  assert.deepEqual(result.failures, [{ index: 0, name: 'two amounts', citation: 'Test fixture, not law', error: 'GOLDEN_COMPUTE_THREW', message: 'engine exploded' }]);
});

test('network access is refused while a golden case computes and restored afterwards', async () => {
  const original = globalThis.fetch;
  const result = await runGolden(fixture('passing.json'), async (input) => {
    await globalThis.fetch('https://example.invalid/');
    return sum(input);
  });
  assert.equal(result.ok, false);
  assert.equal(result.passed, 0);
  assert.deepEqual(result.failures.map((failure) => failure.error), ['GOLDEN_COMPUTE_THREW', 'GOLDEN_COMPUTE_THREW']);
  assert.match(result.failures[0].message, /GOLDEN_NETWORK_FORBIDDEN/);
  assert.equal(globalThis.fetch, original);
});

test('file-level problems are reported as error codes', async () => {
  const missing = fixture('does-not-exist.json');
  assert.deepEqual(await runGolden(missing, sum), { ok: false, error: 'GOLDEN_UNREADABLE', path: fileURLToPath(missing) });
  assert.deepEqual(await runGolden(fixture('not-json.txt'), sum), { ok: false, error: 'GOLDEN_JSON_INVALID', path: fileURLToPath(fixture('not-json.txt')) });
  assert.deepEqual(await runGolden(fixture('wrong-shape.json'), sum), { ok: false, error: 'GOLDEN_SHAPE_INVALID', path: fileURLToPath(fixture('wrong-shape.json')) });
  assert.deepEqual(await runGolden(fixture('empty.json'), sum), { ok: false, error: 'GOLDEN_EMPTY', path: fileURLToPath(fixture('empty.json')) });
  assert.deepEqual(await runGolden(fixture('passing.json'), 'not a function'), { ok: false, error: 'GOLDEN_COMPUTE_INVALID' });
  assert.deepEqual(await runGolden(42, sum), { ok: false, error: 'GOLDEN_UNREADABLE', path: '42' });
});
