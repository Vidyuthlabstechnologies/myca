import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complianceRun } from '../src/index.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');

const FIX = {
  clientsText: fixture('clients.csv'),
  docsText: fixture('docs.csv'),
  holidaysText: fixture('holidays.csv'),
};
const AS_OF = '2026-09-07';
const ALL = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];

test('GATE 1: full-window compliance run is exact at asOf 2026-09-07', () => {
  const run = complianceRun(FIX, { months: ALL, asOfDate: AS_OF });
  assert.equal(run.errors.length, 0);
  assert.equal(run.holidays.length, 3);
  assert.equal(run.deadlines.length, 62);
  assert.deepEqual(run.board.totals, {
    clients: 4, deadlines: 62, overdue: 21, urgent: 2, dueSoon: 2, onTrack: 37,
    completenessAvg: 0.6667, chaseMessages: 3,
  });
  assert.equal(run.ok, false);
});

test('GATE 2: per-client dashboard table is exact for the full window', () => {
  const run = complianceRun(FIX, { months: ALL, asOfDate: AS_OF });
  const byId = Object.fromEntries(run.board.perClient.map((p) => [p.clientId, p]));
  assert.equal(byId['CL-001'].status, 'overdue');
  assert.deepEqual(byId['CL-001'].nextDeadline, { returnType: 'TDS_DEPOSIT', period: '2026-08', dueDate: '2026-09-07', daysUntil: 0 });
  assert.equal(byId['CL-001'].completeness, 0.3333);
  assert.equal(byId['CL-001'].chaseCount, 2);
  assert.equal(byId['CL-002'].status, 'overdue');
  assert.equal(byId['CL-002'].nextDeadline, null);
  assert.equal(byId['CL-002'].completeness, null);
  assert.equal(byId['CL-002'].chaseCount, 0);
  assert.equal(byId['CL-003'].status, 'overdue');
  assert.deepEqual(byId['CL-003'].nextDeadline, { returnType: 'TDS_DEPOSIT', period: '2026-08', dueDate: '2026-09-07', daysUntil: 0 });
  assert.equal(byId['CL-003'].completeness, 0.6667);
  assert.equal(byId['CL-003'].chaseCount, 1);
  assert.equal(byId['CL-004'].status, 'overdue');
  assert.deepEqual(byId['CL-004'].nextDeadline, { returnType: 'PMT-06', period: '2026-08', dueDate: '2026-09-25', daysUntil: 18 });
  assert.equal(byId['CL-004'].completeness, 1);
  assert.equal(byId['CL-004'].chaseCount, 0);
  assert.ok(run.board.alerts.some((a) => a.severity === 'error'));
});

test('GATE 3: Sep window dashboard: TDS deposits due today are urgent, GSTR-1 on the 11th is due soon', () => {
  const run = complianceRun(FIX, { months: ['2026-09'], asOfDate: AS_OF });
  assert.equal(run.deadlines.length, 9);
  assert.equal(run.board.totals.overdue, 0);
  assert.equal(run.board.totals.urgent, 2);
  assert.equal(run.board.totals.dueSoon, 2);
  assert.equal(run.board.totals.onTrack, 5);
  assert.equal(run.ok, false);
  const byId = Object.fromEntries(run.board.perClient.map((p) => [p.clientId, p]));
  assert.equal(byId['CL-001'].status, 'urgent');
  assert.equal(byId['CL-001'].nextDeadline.dueDate, '2026-09-07');
  assert.equal(byId['CL-002'].status, 'on_track');
  assert.equal(byId['CL-002'].nextDeadline, null);
  assert.equal(byId['CL-004'].status, 'on_track');
  const chaseByClient = {};
  for (const c of run.chase) chaseByClient[c.clientId] = (chaseByClient[c.clientId] || 0) + 1;
  assert.equal(chaseByClient['CL-001'], 6);
  assert.equal(chaseByClient['CL-003'], 7);
  assert.equal(chaseByClient['CL-004'] ?? 0, 0);
  const reminder = run.chase.find((c) => c.level === 'due_soon');
  assert.ok(reminder && reminder.message.includes('Reminder'));
});

test('GATE 4: October dues keep their calendar days and QRMP Q2 labels are exact', () => {
  const run = complianceRun(FIX, { months: ['2026-10'], asOfDate: AS_OF });
  const due = (id, rt, period) => run.deadlines.find((d) => d.clientId === id && d.returnType === rt && d.period === period);
  assert.equal(due('CL-001', 'GSTR-1', '2026-09').dueDate, '2026-10-11');
  assert.equal(due('CL-001', 'GSTR-7', '2026-09'), undefined);
  assert.equal(due('CL-001', 'GSTR-3B', '2026-09').dueDate, '2026-10-20');
  assert.equal(due('CL-004', 'GSTR-1', 'Q2 2026-27').dueDate, '2026-10-13');
  assert.equal(due('CL-004', 'GSTR-3B', 'Q2 2026-27').dueDate, '2026-10-22');
  assert.equal(due('CL-003', 'TDS_QUARTERLY', 'Q2 2026-27').dueDate, '2026-10-31');
  assert.equal(due('CL-004', 'ITR', 'FY 2025-26').dueDate, '2026-10-31');
  assert.equal(run.deadlines.length, 12);
});

test('GATE 5: chase messages carry client name, docType, returnType and level', () => {
  const run = complianceRun(FIX, { months: ALL, asOfDate: AS_OF });
  assert.equal(run.chase.length, 132);
  for (const c of run.chase) {
    assert.ok(c.clientName.length > 0);
    assert.ok(c.docType.length > 0);
    assert.ok(c.returnType.length > 0);
    assert.ok(['overdue', 'urgent', 'due_soon', 'on_track'].includes(c.level));
    assert.ok(c.message.includes(c.docType));
  }
  const action = run.chase.find((c) => c.level === 'overdue');
  assert.ok(action && action.message.startsWith('ACTION REQUIRED'));
  assert.ok(run.chase.some((c) => c.level === 'on_track'));
});

test('GATE 6: weekend dues never move, with or without holidays, and validation errors surface', () => {
  const noHolidays = complianceRun({ clientsText: FIX.clientsText, docsText: FIX.docsText, holidaysText: '' }, { months: ['2026-10'], asOfDate: AS_OF });
  assert.equal(noHolidays.holidays.length, 0);
  assert.equal(noHolidays.deadlines.find((d) => d.clientId === 'CL-001' && d.returnType === 'GSTR-1' && d.period === '2026-09').dueDate, '2026-10-11');
  const bad = complianceRun({ clientsText: 'clientId,name,entity,turnover\nCL-9,x,individual,1\nCL-9,y,individual,1\n', docsText: 'clientId,period,returnType,docType,status,receivedDate,source\n' }, { months: ['2026-09'], asOfDate: AS_OF });
  assert.ok(bad.errors.some((e) => e.code === 'DUPLICATE_CLIENT_ID'));
});