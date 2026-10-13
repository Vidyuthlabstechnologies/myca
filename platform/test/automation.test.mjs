import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createFileBooksStore } from '../src/store-ports.mjs';
import { openSession } from '../src/session.mjs';
import { listBackups, rotateBackups, latestGoodBackup, backupDirOf } from '../src/backup-rotation.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

const tempDir = () => mkdtempSync(join(tmpdir(), 'myca-auto-'));

test('the daily checks add one reminder per filing falling due, never twice, verify the chain and the rules, and skip a second run the same day', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-09-01' });
  await runTool(state, 'add_employee', { name: 'Ravi Kumar', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 20000 }], ptState: '27', sex: 'male' });
  const first = await runTool(state, 'run_automation', { asOf: '2026-10-05' });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.data.skipped, false);
  const run = first.data.run;
  assert.equal(run.chain.ok, true);
  assert.ok(run.rules.records > 100);
  const texts = run.reminders.map((item) => item.text);
  assert.ok(texts.some((text) => /GSTR-1/.test(text) && /2026-09/.test(text)), JSON.stringify(texts));
  assert.ok(texts.some((text) => /Approve the payroll for 2026-09/.test(text)), JSON.stringify(texts));
  const reminders = state.reminders.filter((item) => item.source);
  assert.equal(reminders.length, run.reminders.length);
  assert.ok(reminders.every((item) => item.createdBy === 'automation'));
  const again = await runTool(state, 'run_automation', { asOf: '2026-10-05' });
  assert.equal(again.data.skipped, true);
  const forced = await runTool(state, 'run_automation', { asOf: '2026-10-05', force: true });
  assert.equal(forced.data.run.reminders.length, 0, 'nothing is reminded twice');
  assert.equal(state.reminders.filter((item) => item.source).length, reminders.length);
  const status = await runTool(state, 'automation_status', {});
  assert.equal(status.data.lastRun, '2026-10-05');
  assert.equal(status.data.runs, 2);
  const reply = await chat(state, 'did the daily checks run?');
  assert.match(reply.reply, /Daily checks last ran on 5 October 2026/);
  assert.match(reply.reply, /ledger chain intact/);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.automation.lastRun, '2026-10-05');
  assert.equal(isRemoteQuery('automation_status'), true);
  assert.equal(isRemoteQuery('run_automation'), false);
});

test('a broken ledger chain becomes a warning rather than a crash', async () => {
  const state = createState();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Supply', hsn: '9983', qty: 1, rate: 1000, gstRate: 18 }], date: '2026-09-01' });
  state.ledger.transfers[0].amount = state.ledger.transfers[0].amount + 1n;
  const out = await runTool(state, 'run_automation', { asOf: '2026-10-05' });
  assert.equal(out.data.run.chain.ok, false);
  assert.ok(out.data.run.warnings.some((text) => /ledger chain is broken/.test(text)), JSON.stringify(out.data.run.warnings));
});

test('every save keeps one verified copy per day, prunes beyond fourteen, and a corrupt state.json is recovered from the newest good copy', () => {
  const dir = tempDir();
  const path = join(dir, 'state.json');
  const store = createFileBooksStore(path);
  const loaded = store.load();
  assert.equal(loaded.recovered, null);
  const saved = store.save(loaded.state, loaded.version);
  assert.equal(saved.ok, true);
  const backups = listBackups(path);
  assert.equal(backups.length, 1);
  assert.equal(backups[0].verified, true);
  assert.equal(existsSync(`${backups[0].path}.sha256`), true);
  const text = readFileSync(path, 'utf8');
  for (let day = 1; day <= 20; day += 1) rotateBackups(path, text, { today: `2026-01-${String(day).padStart(2, '0')}` });
  const kept = listBackups(path);
  assert.equal(kept.length, 14);
  assert.equal(kept[0].day, '2026-01-08');
  writeFileSync(`${kept[13].path}`, '{ this is not the state', 'utf8');
  const good = latestGoodBackup(path);
  assert.equal(good.day, '2026-01-20', 'the tampered newest copy fails its checksum and is skipped');
  writeFileSync(path, '{"ledger": tru', 'utf8');
  const recovering = createFileBooksStore(path);
  const back = recovering.load();
  assert.equal(back.recovered.from, '2026-01-20');
  assert.ok(readdirSync(dir).some((name) => name.startsWith('state.json.corrupt-')), 'the corrupt file is kept beside the books');
  assert.ok(Array.isArray(back.state.invoices));
  assert.equal(recovering.health().recovered.from, '2026-01-20');
  rmSync(dir, { recursive: true, force: true });
});

test('a session opened on a file keeps backups beside the books and reports them', () => {
  const dir = tempDir();
  const path = join(dir, 'state.json');
  const session = openSession(path);
  assert.equal(existsSync(backupDirOf(path)), true);
  const health = session.stores.books.health();
  assert.equal(health.backups.count, 1);
  assert.equal(health.backups.verified, 1);
  assert.equal(health.lastBackup.written, true);
  rmSync(dir, { recursive: true, force: true });
});

test('the local server answers /api/health with the chain, backups and daily-check state, and runs the checks on startup', () => {
  const home = tempDir();
  const server = new URL('../src/server.mjs', import.meta.url).href;
  const script = [
    "import http from 'node:http';",
    `const { startServer, apiClientToken, healthReport } = await import(${JSON.stringify(server)});`,
    'const started = await startServer(0);',
    'await new Promise((done) => setTimeout(done, 1500));',
    'const res = await new Promise((done) => {',
    '  const req = http.request({ host: "127.0.0.1", port: started.port, path: "/api/health", method: "GET", headers: { host: `127.0.0.1:${started.port}`, "x-myca-client": apiClientToken() } }, (r) => {',
    '    let body = ""; r.setEncoding("utf8"); r.on("data", (c) => { body += c; }); r.on("end", () => done({ status: r.statusCode, body }));',
    '  });',
    '  req.end();',
    '});',
    'console.log("RESULT" + JSON.stringify({ status: res.status, body: JSON.parse(res.body), report: healthReport() }));',
    'process.exit(0);',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, APPDATA: home, HOME: home, MYCA_MOCK_MODE: '0', MYCA_ENABLE_LIVE_CALLS: '0' },
    encoding: 'utf8',
    timeout: 60000,
  });
  rmSync(home, { recursive: true, force: true });
  assert.equal(child.status, 0, child.stderr);
  const line = child.stdout.split('\n').find((l) => l.startsWith('RESULT'));
  assert.ok(line, child.stdout);
  const { status, body } = JSON.parse(line.slice('RESULT'.length));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.chain.ok, true);
  assert.equal(body.books.open, true);
  assert.ok(body.backups.count >= 1);
  assert.match(body.automation.lastRun, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(body.lastTick.reason, 'startup');
  assert.equal(body.lastTick.ok, true);
});
