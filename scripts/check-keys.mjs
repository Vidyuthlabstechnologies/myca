#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { integrationReport, keyProblems } from '../cloud/src/integrations.mjs';
import { goLiveReadiness } from '../cloud/src/go-live.mjs';

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
  if (settings.MYCA_PROVIDER_ENV === 'live' && label !== 'as given') {
    const readiness = goLiveReadiness(settings);
    if (readiness.gaps.length) {
      failed = true;
      console.log(`\n  Not ready to go live: ${readiness.gaps.length} ${readiness.gaps.length === 1 ? 'thing' : 'things'} to fix, and the API would refuse to start until they are:`);
      for (const item of readiness.gaps) console.log(`  x ${item.what}\n      Fix: ${item.fix}`);
    } else {
      console.log('\n  OK: every requirement for live mode is in place.');
    }
    for (const warning of readiness.warnings) console.log(`  ! ${warning}`);
    continue;
  }
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
