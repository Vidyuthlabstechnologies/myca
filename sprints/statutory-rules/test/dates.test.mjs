import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fyOf, fyStart, fyEnd, isIsoDate } from '../src/index.mjs';

test('fyOf maps April to March onto the Indian financial year label', () => {
  assert.equal(fyOf('2026-04-01'), '2026-27');
  assert.equal(fyOf('2026-09-21'), '2026-27');
  assert.equal(fyOf('2027-03-31'), '2026-27');
  assert.equal(fyOf('2026-03-31'), '2025-26');
  assert.equal(fyOf('2026-01-01'), '2025-26');
});

test('fyOf pads the closing year and wraps the century', () => {
  assert.equal(fyOf('2009-04-01'), '2009-10');
  assert.equal(fyOf('2099-12-31'), '2099-00');
  assert.equal(fyOf('2100-02-28'), '2099-00');
});

test('fyOf returns null for anything that is not a real ISO calendar date', () => {
  for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-4-1', '26-04-01', '2026-04-01T00:00:00Z', '', null, undefined, 20260401, new Date(0)]) {
    assert.equal(fyOf(bad), null, String(bad));
  }
  assert.equal(fyOf('2024-02-29'), '2023-24');
});

test('fyStart and fyEnd give the inclusive bounds of a financial year', () => {
  assert.equal(fyStart('2026-27'), '2026-04-01');
  assert.equal(fyEnd('2026-27'), '2027-03-31');
  assert.equal(fyStart('2099-00'), '2099-04-01');
  assert.equal(fyEnd('2099-00'), '2100-03-31');
  assert.equal(fyOf(fyStart('2025-26')), '2025-26');
  assert.equal(fyOf(fyEnd('2025-26')), '2025-26');
});

test('fyStart and fyEnd reject malformed or non-consecutive labels', () => {
  for (const bad of ['2026-28', '2026-2027', '2026/27', '2026-7', '26-27', ' 2026-27', '', null, undefined, 2026]) {
    assert.equal(fyStart(bad), null, String(bad));
    assert.equal(fyEnd(bad), null, String(bad));
  }
});

test('isIsoDate accepts only real YYYY-MM-DD calendar dates', () => {
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2000-02-29'), true);
  assert.equal(isIsoDate('1900-02-29'), false);
  assert.equal(isIsoDate('2026-04-31'), false);
  assert.equal(isIsoDate('2026-12-31'), true);
  assert.equal(isIsoDate('0000-01-01'), false);
  assert.equal(isIsoDate('2026-1-01'), false);
});
