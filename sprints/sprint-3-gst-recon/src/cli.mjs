import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcile, toHumanText } from './index.mjs';

const usage = `Usage: node src/cli.mjs --purchase <PR.csv> --gstr2b <2B.csv> [--gstr1 <1.csv>] [--gstr3b <3B.csv>] [--client <GSTIN>] [--as-of YYYY-MM-DD]`;

const required = { '--purchase': 'purchaseRegisterText', '--gstr2b': 'gstr2bText' };
const optional = { '--gstr1': 'gstr1Text', '--gstr3b': 'gstr3bText' };

function readArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    opts[argv[i]] = argv[i + 1];
  }
  return opts;
}

const args = readArgs(process.argv.slice(2));
const missing = Object.keys(required).filter((flag) => !args[flag]);
if (missing.length) {
  console.error(usage);
  console.error(`Missing required flags: ${missing.join(', ')}`);
  process.exit(1);
}

const input = {};
for (const [flag, key] of Object.entries(required)) input[key] = readFileSync(resolve(args[flag]), 'utf8');
for (const [flag, key] of Object.entries(optional)) if (args[flag]) input[key] = readFileSync(resolve(args[flag]), 'utf8');

const result = reconcile(input, { clientGstin: args['--client'] || null, asOfDate: args['--as-of'] || undefined });

for (const line of toHumanText(result)) console.log(line);

if (result.parserErrors.length) {
  console.log('── parser diagnostics ───────────────────────────');
  for (const e of result.parserErrors.slice(0, 10)) console.log(`  [${e.code}] row ${e.row}${e.field ? ` (${e.field})` : ''}: ${e.message}`);
}
process.exit(result.ok ? 0 : 2);