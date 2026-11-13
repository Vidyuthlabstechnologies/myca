import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { scrubCrashText, cleanCrashReport, createCrashReports } from '../src/crash-reports.mjs';

let api;
let owner;
before(async () => {
  api = await startApi();
  owner = await api.ownerWithBusiness('+919300000001', { name: 'Meera Fabrics', state: '29' });
});
after(async () => { await api.close(); });

const send = (reports, token = owner.token) => api.call('POST', '/v1/crash-reports', { token, body: { reports } });
const rows = async () => (await api.db.query('select * from crash_reports order by error_type')).rows;

const STACK = [
  '#0      _InvoiceScreenState.build (package:myca/screens/invoice_screen.dart:212:18)',
  '#1      StatelessElement.build (package:flutter/src/widgets/framework.dart:5799:49)',
].join('\n');

test('scrubbing removes what identifies a person, a business or an amount, and keeps file and line numbers', () => {
  const dirty = 'Bad state: "Fabric Co" owes ₹42,000.00 to 27AABCT1332L1ZE (PAN AABCT1332L), call +91 9876543210 or asha@example.com; id 3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f; '
    + "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123; 'Retail Mart' total 59000 at https://api.example.in/v1/x?phone=9876543210";
  const clean = scrubCrashText(dirty);
  for (const leak of ['Fabric', '42,000', '27AABCT1332L1ZE', 'AABCT1332L', '9876543210', 'asha@', '3f2b8c1e', 'eyJ', 'Retail', '59000', 'phone=']) {
    assert.equal(clean.includes(leak), false, `${leak} leaked: ${clean}`);
  }
  assert.match(clean, /\[AMOUNT\].*\[GSTIN\].*\[PAN\].*\[PHONE\].*\[EMAIL\].*\[ID\].*\[TOKEN\].*\[NUMBER\] at https:\/\/api\.example\.in\/v1\/x$/);
  assert.equal(scrubCrashText(STACK), STACK);
});

test('a report keeps only known fields, within limits', () => {
  const out = cleanCrashReport({ kind: 'flutter', type: 'StateError', message: 'word '.repeat(200), stack: Array.from({ length: 60 }, (_, i) => `#${i} f (package:myca/a.dart:${i + 1}:1)`).join('\n'), appVersion: '1.0.0+1', userName: 'Asha', businessId: 'b-1' });
  assert.equal(out.ok, true);
  assert.deepEqual(Object.keys(out.report).sort(), ['appVersion', 'count', 'fingerprint', 'kind', 'message', 'stack', 'type']);
  assert.equal(out.report.message.length, 300);
  assert.equal(out.report.stack.split('\n').length, 40);
  for (const bad of [{ kind: 'shell', type: 'X' }, { kind: 'flutter', type: 'rm -rf /;' }, { kind: 'flutter', type: 'X', appVersion: '1 0' }, { kind: 'flutter', type: 'X', count: 0 }, null, []]) {
    assert.equal(cleanCrashReport(bad).ok, false, JSON.stringify(bad));
  }
});

test('reports need a signed-in user', async () => {
  const out = await api.call('POST', '/v1/crash-reports', { body: { reports: [{ kind: 'flutter', type: 'StateError', stack: STACK }] } });
  assert.equal(out.status, 401);
  assert.equal((await rows()).length, 0);
});

test('the same crash is counted, not stored twice; what is stored is scrubbed', async () => {
  const report = { kind: 'flutter', type: 'StateError', message: 'Bad state: no invoice for "Kiran Stores" 9440', stack: STACK, appVersion: '1.0.0+1' };
  const first = await send([report, { ...report, count: 2 }]);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body, { ok: true, accepted: 2, refused: 0 });
  await send([report]);
  const [row] = await rows();
  assert.equal(row.occurrences, 4);
  assert.equal(row.message, 'Bad state: no invoice for "[TEXT]" [NUMBER]');
  assert.equal(row.stack, STACK);
  await send([{ ...report, appVersion: '1.0.1+2' }]);
  assert.equal((await rows()).length, 2, 'a new version is its own row');
});

test('bad reports are refused one by one; too many or too large is refused whole', async () => {
  const mixed = await send([{ kind: 'flutter', type: 'TypeError', stack: STACK }, { kind: 'nope', type: 'X' }]);
  assert.deepEqual(mixed.body, { ok: true, accepted: 1, refused: 1 });
  const many = await send(Array.from({ length: 11 }, () => ({ kind: 'flutter', type: 'X', stack: STACK })));
  assert.equal(many.status, 400);
  assert.equal(many.body.error, 'TOO_MANY_REPORTS');
  const before = (await rows()).length;
  const huge = await send([{ kind: 'flutter', type: 'Huge', stack: 'y '.repeat(36 * 1024) }]).catch(() => ({ status: 413 }));
  assert.equal(huge.status, 413);
  assert.equal((await rows()).length, before);
  assert.equal((await send([])).body.error, 'NO_REPORTS');
});

test('server errors are recorded scrubbed, and reports older than 90 days are deleted', async () => {
  const crashes = createCrashReports({ db: api.db, now: () => api.clock.now });
  const err = new TypeError('Cannot read properties of undefined (reading "gstin") for 27AABCT1332L1ZE');
  await crashes.recordServer(err, 'myca-api-00012');
  const server = (await rows()).find((row) => row.kind === 'server');
  assert.equal(server.error_type, 'TypeError');
  assert.equal(server.app_version, 'myca-api-00012');
  assert.equal(server.message.includes('27AABCT1332L1ZE'), false);
  api.clock.advance(91 * 86400000);
  assert.deepEqual(await crashes.record({ reports: [{ kind: 'async', type: 'FormatException', stack: STACK }] }), { ok: true, accepted: 1, refused: 0 });
  assert.deepEqual((await rows()).map((row) => row.error_type), ['FormatException']);
});

test('control characters that could redraw an operator terminal are dropped from a report', () => {
  const out = cleanCrashReport({ kind: 'flutter', type: 'StateError', message: 'Bad\u001b[2J\u001b]0;owned\u0007 state\u009b31m here now', stack: '#0 f (package:myca/a.dart:1:1)\r\n#1 \u001b[1Ag (package:myca/b.dart:2:2)\u0000', appVersion: '1.0.0+1' });
  assert.equal(out.ok, true);
  assert.equal(out.report.message, 'Bad[2J]0;owned state31m herenow');
  assert.equal(out.report.stack, '#0 f (package:myca/a.dart:1:1)\n#1 [1Ag (package:myca/b.dart:2:2)');
  assert.doesNotMatch(`${out.report.message}${out.report.stack}`, /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/);
});
