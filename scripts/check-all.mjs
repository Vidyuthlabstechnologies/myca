import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const only = new Set(process.argv.slice(2));
const results = [];

function run(name, cwd, command, args, env = {}) {
  const started = Date.now();
  const out = spawnSync(command, args, {
    cwd: join(root, cwd),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: windows,
    maxBuffer: 64 * 1024 * 1024,
  });
  const ok = out.status === 0;
  const text = `${out.stdout || ''}${out.stderr || ''}`;
  const counted = text.match(/# pass (\d+)/) || text.match(/\+(\d+): All tests passed/);
  results.push({ name, ok, detail: counted ? `${counted[1]} passed` : ok ? 'ok' : 'failed', seconds: Math.round((Date.now() - started) / 1000) });
  if (!ok) process.stdout.write(`\n--- ${name} ---\n${text.split('\n').slice(-40).join('\n')}\n`);
  return ok;
}

function skip(name, why) {
  results.push({ name, ok: null, detail: `skipped: ${why}`, seconds: 0 });
}

function has(command) {
  return spawnSync(windows ? 'where' : 'which', [command], { shell: windows }).status === 0;
}

function reachable(url) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return resolve(false);
    }
    const socket = net.connect({ host: target.hostname, port: Number(target.port || 5432), timeout: 1500 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

const wants = (name) => only.size === 0 || only.has(name);

if (wants('platform')) run('platform', 'platform', 'npm', ['test']);

if (wants('sprints')) {
  for (const dir of readdirSync(join(root, 'sprints')).sort()) {
    if (existsSync(join(root, 'sprints', dir, 'package.json'))) run(`sprints/${dir}`, join('sprints', dir), 'npm', ['test']);
  }
}

if (wants('listing')) run('Play listing limits', '.', 'node', ['scripts/check-listing.mjs']);

if (wants('email-relay')) run('email-relay', 'email-relay', 'npm', ['test']);

if (wants('cloud')) {
  const database = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
  if (!existsSync(join(root, 'cloud', 'node_modules', 'pg'))) skip('cloud', 'setup needed: run "npm ci" in cloud/ first (the pg driver is missing)');
  else if (!(await reachable(database))) skip('cloud', 'no Postgres at MYCA_TEST_DATABASE_URL (see cloud/README.md)');
  else run('cloud', 'cloud', 'npm', ['test'], { MYCA_TEST_DATABASE_URL: database });
}

if (wants('mobile')) {
  if (!has('flutter')) skip('mobile', 'flutter is not installed');
  else if (run('mobile analyze', 'mobile', 'flutter', ['analyze'])) run('mobile tests', 'mobile', 'flutter', ['test']);
}

process.stdout.write('\n');
for (const result of results) {
  const mark = result.ok === null ? 'SKIP' : result.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`${mark}  ${result.name.padEnd(34)} ${result.detail}${result.seconds ? `  (${result.seconds}s)` : ''}\n`);
}
const failed = results.filter((result) => result.ok === false).length;
const skipped = results.filter((result) => result.ok === null).length;
process.stdout.write(`\n${failed ? `${failed} failed` : 'nothing failed'}${skipped ? `, ${skipped} skipped` : ''}\n`);
process.exit(failed ? 1 : 0);
