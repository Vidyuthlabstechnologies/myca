import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { listDeadlines, deadlineStatus, profileOf } from '../src/deadlines.mjs';
import { parseClients } from '../src/clients.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');

const clientRows = parseClients(fixture('clients.csv')).rows;
const holidays = fixture('holidays.csv').trim().split(/\r?\n/).slice(1).map((l) => l.trim());

const ALL = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
const byClient = (res, id) => res.filter((d) => d.clientId === id);
const find = (res, id, rt, period) => res.find((d) => d.clientId === id && d.returnType === rt && d.period === period);

test('GATE 1: profileOf derives statutory booleans per client', () => {
  const p = Object.fromEntries(clientRows.map((c) => [c.clientId, profileOf(c)]));
  assert.equal(p['CL-001'].gstMonthly, true);
  assert.equal(p['CL-001'].gstQuarterly, false);
  assert.equal(p['CL-001'].audit, false);
  assert.equal(p['CL-001'].tp, false);
  assert.equal(p['CL-002'].gstMonthly, false);
  assert.equal(p['CL-002'].audit, false);
  assert.equal(p['CL-003'].gstMonthly, true);
  assert.equal(p['CL-003'].audit, true);
  assert.equal(p['CL-003'].tp, true);
  assert.equal(p['CL-004'].gstMonthly, false);
  assert.equal(p['CL-004'].gstQuarterly, true);
  assert.equal(p['CL-004'].audit, true);
});

test('GATE 2: quarterly filer CL-004 has no deadlines in Sep (quiet month)', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-09'], holidays });
  assert.equal(byClient(res, 'CL-004').length, 0);
  assert.equal(byClient(res, 'CL-002').length, 0);
});

test('GATE 3: Sep window deadlines are exact', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-09'], holidays });
  const cl001 = byClient(res, 'CL-001').map((d) => d.returnType).sort();
  assert.deepEqual(cl001, ['GSTR-1', 'GSTR-3B', 'GSTR-7']);
  assert.equal(find(res, 'CL-001', 'GSTR-7', '2026-08').dueDate, '2026-09-10');
  assert.equal(find(res, 'CL-001', 'GSTR-1', '2026-08').dueDate, '2026-09-11');
  assert.equal(find(res, 'CL-001', 'GSTR-3B', '2026-08').dueDate, '2026-09-21');

  const cl003 = byClient(res, 'CL-003').map((d) => d.returnType).sort();
  assert.deepEqual(cl003, ['ADVANCE_TAX', 'GSTR-1', 'GSTR-3B', 'GSTR-7', 'PF']);
  assert.equal(find(res, 'CL-003', 'PF', '2026-08').dueDate, '2026-09-15');
  assert.equal(find(res, 'CL-003', 'ADVANCE_TAX', 'FY 2026-27').dueDate, '2026-09-15');
  assert.equal(find(res, 'CL-003', 'GSTR-3B', '2026-08').dueDate, '2026-09-21');
});

test('GATE 4: weekend-adjusted dues and QRMP dues are exact', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-10', '2026-11'], holidays });
  assert.equal(find(res, 'CL-001', 'GSTR-1', '2026-09').dueDate, '2026-10-12');
  assert.equal(find(res, 'CL-001', 'GSTR-7', '2026-09').dueDate, '2026-10-12');
  assert.equal(find(res, 'CL-001', 'GSTR-3B', '2026-09').dueDate, '2026-10-20');
  assert.equal(find(res, 'CL-004', 'GSTR-1', 'Q2 2026-27').dueDate, '2026-10-13');
  assert.equal(find(res, 'CL-004', 'GSTR-3B', 'Q2 2026-27').dueDate, '2026-10-22');
  assert.equal(find(res, 'CL-003', 'PF', '2026-10').dueDate, '2026-11-16');
});

test('GATE 5: ITR dues vary by audit and TP status', () => {
  const res = listDeadlines({ clients: clientRows, months: ALL, holidays });
  assert.equal(find(res, 'CL-001', 'ITR', 'FY 2025-26').dueDate, '2026-07-31');
  assert.equal(find(res, 'CL-001', 'ITR', 'FY 2025-26').returnLabel, 'ITR (no audit)');
  assert.equal(find(res, 'CL-002', 'ITR', 'FY 2025-26').dueDate, '2026-07-31');
  assert.equal(find(res, 'CL-004', 'ITR', 'FY 2025-26').dueDate, '2026-11-02');
  assert.equal(find(res, 'CL-004', 'ITR', 'FY 2025-26').returnLabel, 'ITR (audit)');
  assert.equal(find(res, 'CL-003', 'ITR', 'FY 2025-26').dueDate, '2026-11-30');
  assert.equal(find(res, 'CL-003', 'ITR', 'FY 2025-26').returnLabel, 'ITR (TP)');
});

test('GATE 6: quarterly returns (TDS + annual GSTR-9) slot correctly', () => {
  const res = listDeadlines({ clients: clientRows, months: ALL, holidays });
  assert.equal(find(res, 'CL-001', 'TDS_QUARTERLY', 'Q1 2026-27').dueDate, '2026-07-31');
  assert.equal(find(res, 'CL-001', 'TDS_QUARTERLY', 'Q2 2026-27').dueDate, '2026-11-02');
  assert.equal(find(res, 'CL-003', 'TDS_QUARTERLY', 'Q1 2026-27').dueDate, '2026-07-31');
  assert.equal(find(res, 'CL-001', 'GSTR-9', 'FY 2025-26').dueDate, '2026-12-31');
  assert.equal(find(res, 'CL-003', 'GSTR-9', 'FY 2025-26').dueDate, '2026-12-31');
  assert.equal(find(res, 'CL-004', 'GSTR-9'), undefined, 'QRMP filers are exempt from GSTR-9');
});

test('GATE 7: escaping trigger — holiday shifts the due date to the next working day', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-10'], holidays: ['2026-10-12'] });
  assert.equal(find(res, 'CL-001', 'GSTR-1', '2026-09').dueDate, '2026-10-13');
  assert.equal(find(res, 'CL-001', 'GSTR-7', '2026-09').dueDate, '2026-10-13');
});

test('GATE 8: deadlineStatus adds daysUntil and escalation level at asOf 2026-09-07', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-09'], holidays });
  const enriched = deadlineStatus({ deadlines: res, asOfDate: '2026-09-07' });
  const g7 = enriched.find((d) => d.clientId === 'CL-001' && d.returnType === 'GSTR-7');
  assert.equal(g7.daysUntil, 3);
  assert.equal(g7.level, 'due_soon');
  const g1 = enriched.find((d) => d.clientId === 'CL-003' && d.returnType === 'GSTR-1');
  assert.equal(g1.daysUntil, 4);
  assert.equal(g1.level, 'due_soon');
  const g3b = enriched.find((d) => d.clientId === 'CL-003' && d.returnType === 'GSTR-3B');
  assert.equal(g3b.daysUntil, 14);
  assert.equal(g3b.level, 'on_track');
  const pf = enriched.find((d) => d.clientId === 'CL-003' && d.returnType === 'PF');
  assert.equal(pf.daysUntil, 8);
  assert.equal(pf.level, 'on_track');
});

test('GATE 9: Sep window levels are exact; all-window overdue anchors hold at asOf 2026-09-07', () => {
  const sep = deadlineStatus({ deadlines: listDeadlines({ clients: clientRows, months: ['2026-09'], holidays }), asOfDate: '2026-09-07' });
  const sc = { overdue: 0, urgent: 0, due_soon: 0, on_track: 0 };
  for (const d of sep) sc[d.level] += 1;
  assert.equal(sep.length, 8);
  assert.deepEqual(sc, { overdue: 0, urgent: 0, due_soon: 4, on_track: 4 });

  const all = deadlineStatus({ deadlines: listDeadlines({ clients: clientRows, months: ALL, holidays }), asOfDate: '2026-09-07' });
  const counts = { overdue: 0, urgent: 0, due_soon: 0, on_track: 0 };
  for (const d of all) counts[d.level] += 1;
  assert.equal(counts.urgent, 0);
  assert.ok(counts.due_soon >= 4, 'Sep GSTR-7 + GSTR-1 for CL-001 and CL-003');
  const overdue = all.filter((d) => d.level === 'overdue');
  const key = (d) => `${d.clientId}|${d.returnType}|${d.period}`;
  assert.ok(overdue.some((d) => key(d) === 'CL-001|ITR|FY 2025-26'));
  assert.ok(overdue.some((d) => key(d) === 'CL-002|ITR|FY 2025-26'));
  assert.ok(overdue.some((d) => key(d) === 'CL-001|TDS_QUARTERLY|Q1 2026-27'));
  assert.ok(overdue.some((d) => key(d) === 'CL-003|TDS_QUARTERLY|Q1 2026-27'));
  assert.ok(overdue.length >= 4);
});