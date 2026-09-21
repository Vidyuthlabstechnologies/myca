import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuleBook, createRuleContext, isVerifiedFor } from '../src/index.mjs';
import { fixtureRecord, versionedFixture } from './fixtures/records.mjs';

const advisorVerified = { by: 'Advisor, ICAI M.No. 000000', role: 'advisor', firmId: null, on: '2026-10-02', verdict: 'verified' };
const advisorDisputed = { ...advisorVerified, verdict: 'disputed', on: '2026-10-05' };
const firmAVerified = { by: 'Partner A', role: 'firm', firmId: 'firm-a', on: '2026-10-03', verdict: 'verified' };
const firmADisputed = { ...firmAVerified, verdict: 'disputed', on: '2026-10-04' };
const firmBDisputed = { by: 'Partner B', role: 'firm', firmId: 'firm-b', on: '2026-10-03', verdict: 'disputed' };

function attested(...attestations) {
  return fixtureRecord({ attestations });
}

test('a record without attestations is verified for nobody', () => {
  const record = attested();
  assert.equal(isVerifiedFor(record, 'firm-a'), false);
  assert.equal(isVerifiedFor(record, null), false);
});

test('an advisor verification counts for every firm', () => {
  const record = attested(advisorVerified);
  assert.equal(isVerifiedFor(record, 'firm-a'), true);
  assert.equal(isVerifiedFor(record, 'firm-b'), true);
  assert.equal(isVerifiedFor(record, null), true);
  assert.equal(isVerifiedFor(record), true);
});

test('a firm verification counts only for that firm', () => {
  const record = attested(firmAVerified);
  assert.equal(isVerifiedFor(record, 'firm-a'), true);
  assert.equal(isVerifiedFor(record, 'firm-b'), false);
  assert.equal(isVerifiedFor(record, 'FIRM-A'), false);
  assert.equal(isVerifiedFor(record, null), false);
  assert.equal(isVerifiedFor(record, ''), false);
});

test('a firm dispute overrides the advisor verification for that firm only', () => {
  const record = attested(advisorVerified, firmADisputed);
  assert.equal(isVerifiedFor(record, 'firm-a'), false);
  assert.equal(isVerifiedFor(record, 'firm-b'), true);
});

test('a firm dispute overrides that firm verification', () => {
  assert.equal(isVerifiedFor(attested(firmAVerified, firmADisputed), 'firm-a'), false);
  assert.equal(isVerifiedFor(attested(firmADisputed, firmAVerified), 'firm-a'), false);
});

test('another firm dispute does not affect this firm', () => {
  assert.equal(isVerifiedFor(attested(advisorVerified, firmBDisputed), 'firm-a'), true);
  assert.equal(isVerifiedFor(attested(firmAVerified, firmBDisputed), 'firm-a'), true);
});

test('an advisor dispute withholds verification from every firm', () => {
  assert.equal(isVerifiedFor(attested(advisorVerified, advisorDisputed), 'firm-a'), false);
  assert.equal(isVerifiedFor(attested(firmAVerified, advisorDisputed), 'firm-a'), false);
});

test('malformed attestations and records never verify', () => {
  const forgedAdvisor = { ...advisorVerified, firmId: 'firm-a' };
  const unknownRole = { ...firmAVerified, role: 'client' };
  const unknownVerdict = { ...advisorVerified, verdict: 'approved' };
  assert.equal(isVerifiedFor(attested(forgedAdvisor), 'firm-a'), false);
  assert.equal(isVerifiedFor(attested(unknownRole), 'firm-a'), false);
  assert.equal(isVerifiedFor(attested(unknownVerdict), 'firm-a'), false);
  assert.equal(isVerifiedFor(attested(null, 'verified'), 'firm-a'), false);
  for (const record of [null, undefined, {}, { attestations: 'verified' }, 'record']) {
    assert.equal(isVerifiedFor(record, 'firm-a'), false);
  }
});

function attestedBook() {
  const records = versionedFixture();
  records[0].attestations = [advisorVerified];
  records[1].attestations = [firmAVerified];
  records[2].attestations = [advisorVerified, firmADisputed];
  return createRuleBook(records);
}

test('a rule context answers exactly like its book', () => {
  const book = attestedBook();
  const context = book.createRuleContext();
  for (const [id, onDate] of [['test.rate', '2026-01-01'], ['test.rate', '2017-06-30'], ['test.nope', '2026-01-01'], ['test.rate', 'bad']]) {
    assert.deepEqual(context.rule(id, onDate), book.rule(id, onDate));
  }
});

test('rulesUsed lists each version used once as id@effectiveFrom in sorted order', () => {
  const context = attestedBook().createRuleContext();
  assert.deepEqual(context.rulesUsed(), []);
  context.rule('test.rate', '2026-01-01');
  context.rule('test.limit', '2025-06-01');
  context.rule('test.rate', '2020-01-01');
  context.rule('test.rate', '2026-02-01');
  assert.deepEqual(context.rulesUsed(), ['test.limit@2025-04-01', 'test.rate@2017-07-01', 'test.rate@2025-10-01']);
});

test('failed lookups are not recorded as used', () => {
  const context = attestedBook().createRuleContext();
  context.rule('test.rate', '2017-06-30');
  context.rule('test.nope', '2026-01-01');
  context.rule('test.rate', '2026-02-30');
  assert.deepEqual(context.rulesUsed(), []);
  assert.deepEqual(context.unverifiedRules('firm-a'), []);
});

test('unverifiedRules lists the used versions not verified for the firm', () => {
  const context = attestedBook().createRuleContext();
  context.rule('test.rate', '2026-01-01');
  context.rule('test.rate', '2020-01-01');
  context.rule('test.limit', '2025-06-01');
  context.rule('test.single-day', '2026-01-15');
  assert.deepEqual(context.unverifiedRules('firm-a'), ['test.limit@2025-04-01', 'test.single-day@2026-01-15']);
  assert.deepEqual(context.unverifiedRules('firm-b'), ['test.rate@2017-07-01', 'test.single-day@2026-01-15']);
  assert.deepEqual(context.unverifiedRules(null), ['test.rate@2017-07-01', 'test.single-day@2026-01-15']);
});

test('contexts are independent and their lists are copies', () => {
  const book = attestedBook();
  const first = book.createRuleContext();
  const second = book.createRuleContext();
  first.rule('test.rate', '2026-01-01');
  assert.deepEqual(second.rulesUsed(), []);
  const listed = first.rulesUsed();
  listed.push('forged@2026-01-01');
  assert.deepEqual(first.rulesUsed(), ['test.rate@2025-10-01']);
});

test('the default createRuleContext reads the registry', () => {
  const context = createRuleContext();
  assert.deepEqual(context.rule('test.never-registered', '2026-04-01'), { ok: false, error: 'RULE_UNKNOWN' });
  assert.deepEqual(context.rulesUsed(), []);
  assert.deepEqual(context.unverifiedRules('firm-a'), []);
});
