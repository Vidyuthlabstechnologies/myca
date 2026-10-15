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

test('GATE 3: clause checks cite the right clauses, pass vacuously when nothing applies, and amounts with Rs. or Dr/Cr parse', () => {
  const r = auditRun({ ledgerText, asOfDate: '2026-09-15' });
  const byId = Object.fromEntries(r.clauseChecks.map((c) => [c.clauseId, c]));
  assert.equal(byId['3CD-1'].clause, 'Form 3CD clause 34(a); s.194C');
  assert.equal(byId['3CD-1'].pass, false);
  assert.match(byId['3CD-1'].detail, /^Not deducted: FLG-\d{3} \(ledger\.csv row \d+\)$/);
  assert.equal(byId['3CD-2'].pass, true);
  assert.equal(byId['CARO-1'].clause, 'CARO 2020 paragraph 3(i)(a)');
  assert.equal(byId['CARO-2'].clause, 'CARO 2020 paragraph 3(ix)(a)');
  assert.equal(byId['CARO-2'].pass, true);
  assert.ok(r.clauseChecks.every((c) => typeof c.basis === 'string' && c.basis.length > 0));
  assert.match(r.sampling.basis, /full population/);
  assert.match(r.workingPapers.at(-1).procedure, /every rule already ran over the full population/);

  const quiet = auditRun({ ledgerText: 'clientId,date,narration,debit,credit,party,category,tdsSection\nCL-009,2026-08-01,Sales,,"Rs. 1,00,000.00 Cr",Retail Mart,sales,\nCL-009,2026-08-02,Rent,"Rs.20,000 Dr",,Shelter RE,rent,\n', asOfDate: '2026-09-15' });
  assert.deepEqual(quiet.ledger.errors, []);
  assert.deepEqual(quiet.ledger.rows.map((row) => [row.debit, row.credit]), [[NaN, 100000], [20000, NaN]].map(([d, c]) => [Number.isNaN(d) ? NaN : d, Number.isNaN(c) ? NaN : c]));
  const q = Object.fromEntries(quiet.clauseChecks.map((c) => [c.clauseId, c]));
  assert.equal(q['3CD-1'].pass, true);
  assert.equal(q['3CD-2'].pass, true, 'rent within the annual limit passes without TDS');
  assert.equal(q['CARO-1'].pass, true);
  assert.equal(q['CARO-1'].detail, 'No additions in the period');
  assert.equal(q['CARO-2'].pass, true);
  assert.equal(q['CARO-2'].detail, 'No borrowing in the period');
});
