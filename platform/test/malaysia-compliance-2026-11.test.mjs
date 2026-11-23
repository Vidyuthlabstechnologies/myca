import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { MANIFEST } from '../src/countries/malaysia/manifest.mjs';
import { ENGINE_SYNC_TOOLS, ENGINE_PROVIDER_TOOLS, manifestProblems } from '../src/countries/manifests.mjs';

const run = ENGINE.run;

test('year of assessment 2026 is estimated with the 2026 relief caps, including the one-year tourism relief; 2027 is not guessed', () => {
  const out = run.my_tax_estimate({}, { yearOfAssessment: 2026, income: { employment: 80000 }, reliefs: { domesticTourism: 1500, lifestyle: 2000 } });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.yearOfAssessment, '2026');
  const tourism = out.data.reliefs.find((line) => line.relief === 'domesticTourism');
  assert.equal(tourism.allowed, 1000, 'capped at RM1,000');
  assert.equal(out.data.totalReliefs, 9000 + 2000 + 1000);
  assert.deepEqual(run.my_tax_estimate({}, { yearOfAssessment: 2025, income: { employment: 1 }, reliefs: { domesticTourism: 500 } }).data.unknownReliefs, ['domesticTourism'], 'the tourism relief is for 2026 only');
  assert.equal(run.my_tax_estimate({}, { yearOfAssessment: 2027, income: { employment: 1 } }).error, 'RULE_NOT_IN_FORCE', 'Budget 2027 proposals are not yet law');
});

test('rental or leasing registers for service tax only above RM1.5 million from 2026, with the exemption notes', () => {
  const before = run.my_sst_registration({}, { kind: 'service', category: 'rental-or-leasing', last12Months: 1200000, date: '2025-12-31' });
  assert.equal(before.data.mustRegister, true);
  const after = run.my_sst_registration({}, { kind: 'service', category: 'rental-or-leasing', last12Months: 1200000, date: '2026-11-23' });
  assert.equal(after.data.mustRegister, false);
  assert.equal(after.data.threshold, 1500000);
  assert.match(after.data.notes.join(' '), /RM1,500,000/);
  assert.match(after.data.notes.join(' '), /30 June 2027/);
  assert.equal(run.my_sst_rate({}, { category: 'rental-or-leasing', date: '2026-11-23' }).data.percent, 6);
  assert.equal(run.my_sst_rate({}, { category: 'general', date: '2026-11-23' }).data.percent, 8);
});

test('a phase 4 business hears about the relaxation to the end of 2027 and the voluntary disclosure programme; an exempt one does not', () => {
  const phase4 = run.my_einvoice_required({}, { annualTurnover: 4000000, date: '2026-11-23' });
  assert.equal(phase4.data.required, true);
  assert.equal(phase4.data.relaxation.until, '2027-12-31');
  assert.equal(phase4.data.relaxation.penaltiesFrom, '2028-01-01');
  assert.match(phase4.data.relaxation.note, /RM10,000/);
  assert.match(phase4.data.voluntaryDisclosure, /PKPS e-Invois/);
  const big = run.my_einvoice_required({}, { annualTurnover: 30000000, date: '2026-11-23' });
  assert.equal(big.data.relaxation, undefined, 'earlier phases are past their relaxation');
  const small = run.my_einvoice_required({}, { annualTurnover: 2500000, date: '2026-11-23' });
  assert.equal(small.data.exempt, true);
  assert.equal(small.data.relaxation, undefined);
  assert.equal(small.data.voluntaryDisclosure, undefined);
});

test('payroll warns when full-time pay is under the RM1,700 minimum wage, not for part-timers or small employers before August 2025', () => {
  const notes = (employee, month = '2026-11') => run.my_payroll({}, { month, employees: [employee] }).data.employees[0].notes.join(' ');
  assert.match(notes({ wages: 1500 }), /minimum wage of RM1,700/);
  assert.doesNotMatch(notes({ wages: 1700 }), /minimum wage/);
  assert.doesNotMatch(notes({ wages: 800, partTime: true }), /minimum wage/);
  assert.doesNotMatch(notes({ wages: 1600, smallEmployer: true }, '2025-05'), /minimum wage/, 'employers under five staff paid RM1,500 until August 2025');
  assert.match(notes({ wages: 1600, smallEmployer: true }, '2025-09'), /minimum wage of RM1,700/);
  const out = run.my_payroll({}, { month: '2026-11', employees: [{ wages: 3000 }] });
  assert.ok(out.data.rulesUsed.some((rule) => rule.id === 'my.payroll.minimum-wage'));
});

test('e-invoice status reads keep what LHDN says and e-invoice writes reach MyInvois at the service\'s provider setting', () => {
  assert.deepEqual(manifestProblems(), []);
  for (const name of ['my_einvoice_status', 'my_einvoice_details', 'my_received_einvoices']) assert.ok(ENGINE_SYNC_TOOLS.includes(name), name);
  for (const name of ['issue_my_einvoice', 'issue_my_consolidated_einvoice', 'issue_my_self_billed_einvoice', 'cancel_my_einvoice', 'reject_my_einvoice']) assert.ok(ENGINE_PROVIDER_TOOLS.includes(name), name);
  for (const name of ['set_my_einvoice_profile', 'simulate_my_received_einvoice']) assert.ok(!ENGINE_PROVIDER_TOOLS.includes(name), name);
  const bad = { ...MANIFEST, tools: MANIFEST.tools.map((tool) => (tool.name === 'my_payroll' ? { ...tool, syncsBook: true, access: 'write' } : tool)) };
  assert.ok(manifestProblems([bad]).some((problem) => /syncsBook/.test(problem)));
});
