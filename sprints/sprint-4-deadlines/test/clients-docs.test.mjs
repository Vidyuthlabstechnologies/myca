import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClients, validateClients } from '../src/clients.mjs';
import { parseDocs, requiredDocs, collectionStatus, chasePlan } from '../src/docs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');

const clientsCsv = fixture('clients.csv');
const docsCsv = fixture('docs.csv');

test('GATE 1: parseClients returns 4 rows from clean fixture', () => {
  const { rows, errors } = parseClients(clientsCsv);
  assert.equal(rows.length, 4);
  assert.equal(errors.length, 0);
});

test('GATE 2: parseClients returns NO_HEADER_ROW for empty input', () => {
  const { rows, errors } = parseClients('');
  assert.equal(rows.length, 0);
  assert.ok(errors.some(e => e.code === 'NO_HEADER_ROW'));
});

test('GATE 3: parseClients returns NO_HEADER_ROW for garbage input', () => {
  const { rows, errors } = parseClients('asdfghjkl');
  assert.equal(rows.length, 0);
  assert.ok(errors.some(e => e.code === 'MISSING_COLUMN'));
});

test('GATE 4: parseClients returns MISSING_COLUMN when clientId absent', () => {
  const { rows, errors } = parseClients('name,tier\nAlice,PREMIUM');
  assert.equal(rows.length, 0);
  assert.ok(errors.some(e => e.code === 'MISSING_COLUMN'));
});

test('GATE 5: parseClients parses turnover as number and booleans as strings', () => {
  const { rows } = parseClients(clientsCsv);
  assert.equal(typeof rows[0].turnover, 'number');
  assert.equal(rows[0].turnover, 9500000);
  assert.equal(typeof rows[0].gst, 'string');
  assert.equal(rows[0].gst, 'TRUE');
});

test('GATE 6: validateClients passes clean data', () => {
  const { rows } = parseClients(clientsCsv);
  const { ok, errors } = validateClients(rows);
  assert.equal(ok, true);
  assert.equal(errors.length, 0);
});

test('GATE 7: validateClients detects duplicate clientId', () => {
  const { rows } = parseClients(clientsCsv);
  const dup = [...rows, { ...rows[0] }];
  const { ok, errors } = validateClients(dup);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.code === 'DUPLICATE_CLIENT_ID'));
});

test('GATE 8: validateClients detects negative turnover', () => {
  const { ok, errors } = validateClients([{ clientId: 'X', turnover: -100 }]);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.code === 'NEGATIVE_TURNOVER'));
});

test('GATE 9: parseDocs returns 9 rows from clean fixture', () => {
  const { rows, errors } = parseDocs(docsCsv);
  assert.equal(rows.length, 9);
  assert.equal(errors.length, 0);
});

test('GATE 10: parseDocs returns NO_HEADER_ROW for empty input', () => {
  const { rows, errors } = parseDocs('');
  assert.equal(rows.length, 0);
  assert.ok(errors.some(e => e.code === 'NO_HEADER_ROW'));
});

test('GATE 11: requiredDocs returns correct lengths', () => {
  assert.equal(requiredDocs('GSTR-3B').length, 3);
  assert.equal(requiredDocs('ITR').length, 4);
  assert.equal(requiredDocs('GSTR-1').length, 4);
  assert.equal(requiredDocs('GSTR-7').length, 2);
  assert.equal(requiredDocs('TDS_QUARTERLY').length, 3);
  assert.equal(requiredDocs('PF').length, 1);
  assert.equal(requiredDocs('ADVANCE_TAX').length, 1);
  assert.equal(requiredDocs('GSTR-9').length, 2);
  assert.equal(requiredDocs('UNKNOWN').length, 0);
});

test('GATE 12: collectionStatus CL-003 GSTR-3B 2026-08', () => {
  const { rows } = parseDocs(docsCsv);
  const map = collectionStatus({ docs: rows });
  const key = 'CL-003|GSTR-3B|2026-08';
  const entry = map.get(key);
  assert.ok(entry);
  assert.deepEqual(entry.required, ['gstr2b', 'purchase_register', 'sales_register']);
  assert.deepEqual(entry.received, ['gstr2b', 'purchase_register']);
  assert.deepEqual(entry.missing, ['sales_register']);
  assert.ok(Math.abs(entry.completeness - 2 / 3) < 0.001);
});

test('GATE 13: collectionStatus CL-004 GSTR-3B Q2 2026-27', () => {
  const { rows } = parseDocs(docsCsv);
  const map = collectionStatus({ docs: rows });
  const key = 'CL-004|GSTR-3B|Q2 2026-27';
  const entry = map.get(key);
  assert.ok(entry);
  assert.equal(entry.completeness, 1);
  assert.deepEqual(entry.missing, []);
});

test('GATE 14: collectionStatus CL-001 GSTR-3B 2026-08', () => {
  const { rows } = parseDocs(docsCsv);
  const map = collectionStatus({ docs: rows });
  const key = 'CL-001|GSTR-3B|2026-08';
  const entry = map.get(key);
  assert.ok(entry);
  assert.ok(Math.abs(entry.completeness - 1 / 3) < 0.001);
  assert.deepEqual(entry.missing, ['purchase_register', 'sales_register']);
});

test('GATE 15: chasePlan CL-001 GSTR-3B 2026-08 on_track with dueInfo 14', () => {
  const clients = parseClients(clientsCsv).rows;
  const docs = parseDocs(docsCsv).rows;
  const scope = [{ clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08' }];
  const dueInfo = { 'CL-001|GSTR-3B|2026-08': { dueDate: '2026-09-21', daysUntil: 14 } };
  const plan = chasePlan({ clients, scope, docs, dueInfo });
  assert.equal(plan.length, 2);
  assert.ok(plan.every(e => e.level === 'on_track'));
  assert.ok(plan.every(e => e.clientName === 'Sunrise Industries'));
  assert.ok(plan.some(e => e.docType === 'purchase_register'));
  assert.ok(plan.some(e => e.docType === 'sales_register'));
  assert.ok(plan.every(e => e.message.includes('Sunrise Industries')));
  assert.ok(plan.every(e => e.message.includes('On track')));
});

test('GATE 16: chasePlan CL-003 GSTR-3B 2026-08 on_track with dueInfo 14', () => {
  const clients = parseClients(clientsCsv).rows;
  const docs = parseDocs(docsCsv).rows;
  const scope = [{ clientId: 'CL-003', returnType: 'GSTR-3B', period: '2026-08' }];
  const dueInfo = { 'CL-003|GSTR-3B|2026-08': { dueDate: '2026-09-21', daysUntil: 14 } };
  const plan = chasePlan({ clients, scope, docs, dueInfo });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].docType, 'sales_register');
  assert.equal(plan[0].level, 'on_track');
  assert.ok(plan[0].message.includes('On track'));
  assert.ok(plan[0].message.includes('Greenfields Pvt Ltd'));
});

test('GATE 17: chasePlan CL-001 GSTR-7 2026-08 with daysUntil 3 is due_soon', () => {
  const clients = parseClients(clientsCsv).rows;
  const scope = [{ clientId: 'CL-001', returnType: 'GSTR-7', period: '2026-08' }];
  const dueInfo = { 'CL-001|GSTR-7|2026-08': { dueDate: '2026-09-10', daysUntil: 3 } };
  const plan = chasePlan({ clients, scope, docs: [], dueInfo });
  assert.ok(plan.length > 0);
  assert.ok(plan.every(e => e.level === 'due_soon'));
  assert.ok(plan.every(e => e.message.includes('Reminder')));
});

test('GATE 18: chasePlan with daysUntil -1 is overdue', () => {
  const clients = parseClients(clientsCsv).rows;
  const scope = [{ clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08' }];
  const dueInfo = { 'CL-001|GSTR-3B|2026-08': { dueDate: '2026-09-01', daysUntil: -1 } };
  const plan = chasePlan({ clients, scope, docs: [], dueInfo });
  assert.ok(plan.length > 0);
  assert.ok(plan.every(e => e.level === 'overdue'));
  assert.ok(plan.every(e => e.message.includes('ACTION REQUIRED')));
});

test('GATE 19: chasePlan with daysUntil 0 is urgent', () => {
  const clients = parseClients(clientsCsv).rows;
  const scope = [{ clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08' }];
  const dueInfo = { 'CL-001|GSTR-3B|2026-08': { dueDate: '2026-09-07', daysUntil: 0 } };
  const plan = chasePlan({ clients, scope, docs: [], dueInfo });
  assert.ok(plan.length > 0);
  assert.ok(plan.every(e => e.level === 'urgent'));
  assert.ok(plan.every(e => e.message.includes('URGENT')));
});

test('GATE 20: chasePlan deduplicates scope', () => {
  const clients = parseClients(clientsCsv).rows;
  const scope = [
    { clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08' },
    { clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08' },
  ];
  const plan = chasePlan({ clients, scope, docs: [], dueInfo: {} });
  assert.equal(plan.length, 3);
});

test('GATE 21: chasePlan uses fallback date when no dueInfo', () => {
  const clients = parseClients(clientsCsv).rows;
  const scope = [{ clientId: 'CL-001', returnType: 'GSTR-3B', period: '2026-08' }];
  const plan = chasePlan({ clients, scope, docs: [], dueInfo: {} });
  assert.ok(plan.every(e => e.message.includes('2026-09-07')));
  assert.ok(plan.every(e => e.level === 'due_soon'));
});

test('clients: quoted cells keep commas and a neutralised formula prefix is undone', async () => {
  const { parseClients } = await import('../src/clients.mjs');
  const text = 'clientId,name,entity,turnover\nCL-1,"Sharma, Rao & Co",firm,1000\nCL-2,"\'=Plus ""Quoted"" Ltd",company,5\n';
  const { rows, errors } = parseClients(text);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].name, 'Sharma, Rao & Co');
  assert.equal(rows[0].entity, 'firm');
  assert.equal(rows[0].turnover, 1000);
  assert.equal(rows[1].name, '=Plus "Quoted" Ltd');
});
