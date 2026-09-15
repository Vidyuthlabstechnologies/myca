// cli.mjs — run ingestion on a CSV file from the command line
// Usage:
//   node src/cli.js <file.csv> [--as-of YYYY-MM-DD] [--client <ref>] [--label <label>]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ingest } from './index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log('Usage: node src/cli.js <file.csv> [--as-of YYYY-MM-DD] [--client ref] [--label label]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const fileArg = resolve(__dirname, '..', args[0]);
let asOfDate;
let clientRef;
let fileLabel;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--as-of') asOfDate = args[++i];
  else if (args[i] === '--client') clientRef = args[++i];
  else if (args[i] === '--label') fileLabel = args[++i];
}

let content;
try {
  content = readFileSync(fileArg, 'utf8');
} catch (e) {
  console.error(`Could not read ${fileArg}: ${e.message}`);
  process.exit(1);
}

const result = ingest({ type: 'csv', content }, { asOfDate, clientRef, fileLabel, fileName: fileArg.split(/[\\/]/).pop() });

const r = result.report;
console.log('── Ingestion Report ─────────────────────────────');
console.log(`file            : ${fileLabel || r.fileLabel}`);
console.log(`client          : ${clientRef || '—'}`);
console.log(`as-of           : ${r.asOfDate}`);
console.log(`status          : ${r.ok ? 'OK' : 'REJECTED'}`);
console.log(`source rows     : ${r.totalRows}`);
console.log(`ingested rows   : ${r.ingestedRows}`);
console.log(`rejected rows   : ${r.rejectedRows}`);
console.log(`blocking errors : ${r.blockingErrors}`);
console.log(`warnings        : ${r.warnings}`);
console.log(`duration        : ${r.durationMs} ms`);
if (r.warningBreakdown && Object.keys(r.warningBreakdown).length) {
  console.log('── warning breakdown ───────────────────────────');
  for (const [code, count] of Object.entries(r.warningBreakdown)) {
    console.log(`${code.padEnd(28)} ${count}`);
  }
}
if (r.blockingErrors > 0) {
  console.log('── blocking errors ─────────────────────────────');
  for (const e of result.errors) console.log(`  [row ${e.row}] ${e.message}`);
}