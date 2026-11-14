#!/usr/bin/env node

import { startUsSandbox, runUsSandboxCheck } from '../cloud/sandbox/us-sandbox.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const given = args.find((arg) => arg.startsWith(`--${name}=`));
  return given ? given.slice(name.length + 3) : fallback;
};
const check = args.includes('--check');
const quiet = check || args.includes('--quiet');

let sandbox;
try {
  sandbox = await startUsSandbox({
    databaseUrl: String(process.env.MYCA_DATABASE_URL || '').trim(),
    port: Number(option('port', process.env.PORT || (check ? 0 : 8080))),
    consolePort: Number(option('console-port', check ? 0 : 8090)),
    host: option('host', '127.0.0.1'),
    route: option('route', 'partner'),
    plus: option('plus', 'card'),
    log: quiet ? () => {} : (entry) => console.log(JSON.stringify(entry)),
  });
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
}

if (check) {
  let code = 0;
  try {
    const out = await runUsSandboxCheck(sandbox);
    for (const step of out.steps) console.log(`PASSED  ${step.name}`);
    console.log(`\nMyCA US sandbox: ${out.steps.length} steps passed (route ${sandbox.route}, Plus by ${sandbox.plus}, tax year ${out.taxYear}).`);
  } catch (err) {
    for (const step of err.steps || []) console.log(`${step.ok ? 'PASSED' : 'FAILED'}  ${step.name}${step.ok ? '' : `  ${step.detail}`}`);
    if (!err.steps) console.log(`FAILED  ${String(err?.message || err)}`);
    code = 1;
  }
  await sandbox.close();
  process.exit(code);
}

console.log(`MyCA US sandbox is running.
  API      ${sandbox.apiUrl}   (flutter run --flavor us --dart-define=MYCA_EDITION=US --dart-define=MYCA_CLOUD_URL=${sandbox.apiUrl})
  Console  ${sandbox.consoleUrl}   (sign-in codes, test checkouts, partner events)
  Route    ${sandbox.route}; Plus by ${sandbox.plus}. Stop with Ctrl+C.`);

const stop = async () => {
  await sandbox.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
