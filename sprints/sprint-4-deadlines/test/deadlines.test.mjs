import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { listDeadlines, deadlineStatus, profileOf, auditRequired, monthsAround } from '../src/deadlines.mjs';
import { parseClients } from '../src/clients.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');

const clientRows = parseClients(fixture('clients.csv')).rows;

const ALL = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
const byClient = (res, id) => res.filter((d) => d.clientId === id);
const find = (res, id, rt, period) => res.find((d) => d.clientId === id && d.returnType === rt && d.period === period);

test('GATE 1: profileOf derives statutory booleans per client from the dated audit thresholds', () => {
  const p = Object.fromEntries(clientRows.map((c) => [c.clientId, profileOf(c)]));
  assert.equal(p['CL-001'].gstMonthly, true);
  assert.equal(p['CL-001'].audit, false, 'business turnover Rs 95 lakh is below Rs 1 crore');
  assert.equal(p['CL-002'].gstMonthly, false);
  assert.equal(p['CL-002'].profession, true);
  assert.equal(p['CL-002'].audit, false, 'profession receipts Rs 40 lakh are below Rs 50 lakh');
  assert.equal(p['CL-003'].audit, true, 'companies are audited');
  assert.equal(p['CL-003'].tp, true);
  assert.equal(p['CL-004'].gstQuarterly, true);
  assert.equal(p['CL-004'].audit, true, 'business turnover Rs 4 crore exceeds Rs 1 crore');
});

test('GATE 1b: a low-cash business is audited only above Rs 10 crore; unknown cash share uses Rs 1 crore', () => {
  const lowCash = profileOf({ clientId: 'X', entity: 'proprietor', turnover: 50000000, cashReceiptsPercent: '3', cashPaymentsPercent: '4' });
  assert.equal(auditRequired(lowCash, '2026-04-01').required, false);
  assert.equal(auditRequired({ ...lowCash, cashPaymentsPercent: 6 }, '2026-04-01').required, true);
  assert.equal(auditRequired({ ...lowCash, cashReceiptsPercent: null }, '2026-04-01').required, true);
});

test('GATE 2: in September the QRMP filer still owes PMT-06 (25th) and an income-tax deductor owes no GSTR-7', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-09'] });
  assert.equal(find(res, 'CL-004', 'PMT-06', '2026-08').dueDate, '2026-09-25');
  assert.equal(byClient(res, 'CL-004').length, 1);
  assert.equal(byClient(res, 'CL-002').length, 0);
  assert.equal(res.some((d) => d.returnType === 'GSTR-7'), false, 'GSTR-7 is for GST TDS deductors under s.51 only');
});

test('GATE 3: September deadlines are exact, with no weekend rollover', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-09'] });
  assert.deepEqual(byClient(res, 'CL-001').map((d) => d.returnType).sort(), ['GSTR-1', 'GSTR-3B', 'TDS_DEPOSIT']);
  assert.equal(find(res, 'CL-001', 'TDS_DEPOSIT', '2026-08').dueDate, '2026-09-07');
  assert.equal(find(res, 'CL-001', 'GSTR-1', '2026-08').dueDate, '2026-09-11');
  assert.equal(find(res, 'CL-001', 'GSTR-3B', '2026-08').dueDate, '2026-09-20', 'Sunday 20 September stays the due date');
  assert.deepEqual(byClient(res, 'CL-003').map((d) => d.returnType).sort(), ['ADVANCE_TAX', 'GSTR-1', 'GSTR-3B', 'PF', 'TDS_DEPOSIT']);
  assert.equal(find(res, 'CL-003', 'PF', '2026-08').dueDate, '2026-09-15');
  assert.equal(find(res, 'CL-003', 'ADVANCE_TAX', 'FY 2026-27 #2').dueDate, '2026-09-15');
});

test('GATE 4: October dues keep their calendar days and QRMP Q2 labels are exact', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2026-10', '2026-11'] });
  assert.equal(find(res, 'CL-001', 'GSTR-1', '2026-09').dueDate, '2026-10-11', 'Sunday 11 October stays the due date');
  assert.equal(find(res, 'CL-001', 'GSTR-3B', '2026-09').dueDate, '2026-10-20');
  assert.equal(find(res, 'CL-004', 'GSTR-1', 'Q2 2026-27').dueDate, '2026-10-13');
  assert.equal(find(res, 'CL-004', 'GSTR-3B', 'Q2 2026-27').dueDate, '2026-10-22', 'Maharashtra is in the 22nd group');
  assert.equal(find(res, 'CL-003', 'PF', '2026-10').dueDate, '2026-11-15', 'Sunday 15 November stays the due date');
});

test('GATE 5: ITR dues for FY 2025-26 follow the Finance Act 2026 categories', () => {
  const res = listDeadlines({ clients: clientRows, months: ALL });
  assert.equal(find(res, 'CL-001', 'ITR', 'FY 2025-26').dueDate, '2026-08-31', 'non-audit business: 31 August');
  assert.equal(find(res, 'CL-002', 'ITR', 'FY 2025-26').dueDate, '2026-08-31', 'non-audit profession: 31 August');
  assert.equal(find(res, 'CL-004', 'ITR', 'FY 2025-26').dueDate, '2026-10-31', 'audit case: 31 October, a Saturday, not moved');
  assert.equal(find(res, 'CL-004', 'ITR', 'FY 2025-26').returnLabel, 'ITR (audit)');
  assert.equal(find(res, 'CL-003', 'ITR', 'FY 2025-26').dueDate, '2026-11-30');
  assert.equal(find(res, 'CL-003', 'ITR', 'FY 2025-26').returnLabel, 'ITR (TP)');
});

test('GATE 6: TDS statements and GSTR-9 slot correctly; GSTR-9 applies above Rs 2 crore whatever the filing frequency', () => {
  const res = listDeadlines({ clients: clientRows, months: ALL });
  assert.equal(find(res, 'CL-001', 'TDS_QUARTERLY', 'Q1 2026-27').dueDate, '2026-07-31');
  assert.equal(find(res, 'CL-001', 'TDS_QUARTERLY', 'Q2 2026-27').dueDate, '2026-10-31', 'Saturday 31 October stays the due date');
  assert.equal(find(res, 'CL-003', 'GSTR-9', 'FY 2025-26').dueDate, '2026-12-31');
  assert.equal(find(res, 'CL-004', 'GSTR-9', 'FY 2025-26').dueDate, '2026-12-31', 'a Rs 4 crore QRMP filer must file GSTR-9');
  assert.equal(find(res, 'CL-001', 'GSTR-9'), undefined, 'Rs 95 lakh turnover is within the Rs 2 crore exemption');
});

test('GATE 6b: the TDS Q4 statement for Jan-Mar is labelled with its own financial year and due 31 May', () => {
  const res = listDeadlines({ clients: clientRows, months: ['2027-05'] });
  assert.equal(find(res, 'CL-001', 'TDS_QUARTERLY', 'Q4 2026-27').dueDate, '2027-05-31');
  assert.equal(find(res, 'CL-001', 'TDS_DEPOSIT', '2027-04').dueDate, '2027-05-07');
});

test('GATE 7: holidays never move a due date', () => {
  const withHoliday = listDeadlines({ clients: clientRows, months: ['2026-10'], holidays: ['2026-10-11', '2026-10-20'] });
  assert.equal(find(withHoliday, 'CL-001', 'GSTR-1', '2026-09').dueDate, '2026-10-11');
  assert.equal(find(withHoliday, 'CL-001', 'GSTR-3B', '2026-09').dueDate, '2026-10-20');
});

test('GATE 8: deadlineStatus adds daysUntil and escalation level at asOf 2026-09-07', () => {
  const enriched = deadlineStatus({ deadlines: listDeadlines({ clients: clientRows, months: ['2026-09'] }), asOfDate: '2026-09-07' });
  const dep = enriched.find((d) => d.clientId === 'CL-001' && d.returnType === 'TDS_DEPOSIT');
  assert.equal(dep.daysUntil, 0);
  assert.equal(dep.level, 'urgent');
  const g1 = enriched.find((d) => d.clientId === 'CL-003' && d.returnType === 'GSTR-1');
  assert.equal(g1.daysUntil, 4);
  assert.equal(g1.level, 'due_soon');
  const g3b = enriched.find((d) => d.clientId === 'CL-003' && d.returnType === 'GSTR-3B');
  assert.equal(g3b.daysUntil, 13);
  assert.equal(g3b.level, 'on_track');
});

test('GATE 9: at asOf 2026-09-22 the August GSTR-3B (due 20 September) is overdue, not upcoming', () => {
  const enriched = deadlineStatus({ deadlines: listDeadlines({ clients: clientRows, months: monthsAround('2026-09-22') }), asOfDate: '2026-09-22' });
  const g3b = enriched.find((d) => d.clientId === 'CL-001' && d.returnType === 'GSTR-3B' && d.period === '2026-08');
  assert.equal(g3b.level, 'overdue');
  assert.equal(g3b.daysUntil, -2);
  assert.deepEqual(monthsAround('2026-09-22'), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
});
