import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRun } from '../src/index.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const ledgerText = readFileSync(resolve(dir, 'fixtures', 'ledger.csv'), 'utf8');

test('GATE 1: fixture yields 12 flags with documented severities', () => {
  const r = auditRun({ ledgerText, asOfDate: '2026-09-15' });
  assert.equal(r.flags.length, 12);
  assert.equal(r.summary.high, 3);
  assert.equal(r.summary.medium, 5);
  assert.equal(r.summary.low, 4);
  assert.equal(r.summary.population, 24);
  assert.equal(r.summary.sampleSize, 8);
  assert.deepEqual(r.summary.riskyClients, ['CL-001']);
  assert.equal(r.ok, false);
});

test('GATE 2: first high flags and CL-001 risk are exact', () => {
  const r = auditRun({ ledgerText, asOfDate: '2026-09-15' });
  assert.equal(r.flags[0].flagId, 'FLG-001');
  assert.equal(r.flags[0].ruleId, 'AUD-001');
  assert.equal(r.flags[0].source, 'ledger.csv row 2');
  assert.equal(r.engagement.perClient[0].clientId, 'CL-001');
  assert.equal(r.engagement.perClient[0].score, 100);
  assert.equal(r.engagement.perClient[0].level, 'critical');
  assert.equal(r.engagement.perClient[1].score, 30);
  assert.equal(r.engagement.perClient[1].level, 'medium');
  assert.equal(r.clauseChecks.filter((c) => !c.pass).length, 2);
  assert.equal(r.workingPapers.at(-1).wpId, 'WP-SMP');
});
