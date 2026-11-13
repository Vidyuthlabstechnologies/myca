#!/usr/bin/env node
// Checks a set of MyCA server settings before they go anywhere near a deploy.
//
//   node scripts/check-keys.mjs                 # checks this shell's environment
//   node scripts/check-keys.mjs prod.env        # checks a KEY=value file
//   node scripts/check-keys.mjs prod.env --live # also asks "would this be safe if I switched to live now?"
//
// It prints which mode the API would run in, what each integration would reach, and every
// problem that would stop the API from starting. It never prints a key's value.
// Exit code 1 when the API would refuse to start.

import { readFileSync } from 'node:fs';
import { integrationReport, keyProblems } from '../cloud/src/integrations.mjs';

function parseEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim().replace(/^export\s+/, '');
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const env = file ? parseEnvFile(file) : { ...process.env };
const runs = [['as given', env]];
if (args.includes('--live')) runs.push(['after switching to live', { ...env, MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0', MYCA_ENVIRONMENT: env.MYCA_ENVIRONMENT || 'production' }]);

let failed = false;
for (const [label, settings] of runs) {
  const report = integrationReport(settings);
  console.log(`\n== ${label}: provider mode ${report.mode}, countries ${report.countries.join(', ')}`);
  for (const row of report.integrations) console.log(`  ${row.id.padEnd(24)} ${row.status.padEnd(30)} -> ${row.runsAgainst}`);
  const problems = keyProblems(settings);
  if (problems.length) {
    failed = true;
    console.log(`\n  The API would refuse to start (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log('\n  OK: the API would start with these keys.');
  }
}
process.exit(failed ? 1 : 0);
