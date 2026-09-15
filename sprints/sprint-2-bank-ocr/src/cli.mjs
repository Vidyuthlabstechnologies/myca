// cli.mjs — run bank statement ingestion from the command line.
// Usage:
//   node src/cli.mjs <file> [--as-of YYYY-MM-DD] [--client ref] [--label label]
//   --format csv|text|matrix  (default: auto — csv/text by extension)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ingest } from './index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: node src/cli.js <file> [--as-of YYYY-MM-DD] [--client ref] [--label label] [--format csv|text|matrix]');
  process.exit(1);
}

const fileArg = resolve(__dirname, '..', args[0]);
let asOfDate, clientRef, fileLabel, format;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--as-of') asOfDate = args[++i];
  else if (args[i] === '--client') clientRef = args[++i];
  else if (args[i] === '--label') fileLabel = args[++i];
  else if (args[i] === '--format') format = args[++i];
}
if (!format) format = /\.txt$/i.test(fileArg) ? 'text' : 'csv';

let content;
try {
  content = readFileSync(fileArg, 'utf8');
} catch (e) {
  console.error(`Could not read ${fileArg}: ${e.message}`);
  process.exit(1);
}

const result = ingest(
  { type: format, content },
  { asOfDate, clientRef, fileLabel, fileName: fileArg.split(/[\\/]/).pop() }
);

const r = result.report;
console.log('── Bank Statement Report ────────────────────────');
console.log(`file            : ${fileLabel || r.fileLabel}`);
console.log(`client          : ${clientRef || '—'}`);
console.log(`as-of           : ${r.asOfDate}`);
console.log(`status          : ${r.ok ? 'OK' : 'REJECTED'}`);
console.log(`source rows     : ${r.totalRows}`);
console.log(`ingested rows   : ${r.ingestedRows}`);
console.log(`rejected rows   : ${r.rejectedRows}`);
console.log(`blocking errors : ${r.blockingErrors}`);
console.log(`warnings        : ${r.warnings}`);
console.log(`inflow          : ${r.inflow}`);
console.log(`outflow         : ${r.outflow}`);
console.log(`categorized     : ${r.categorized} of ${r.ingestedRows}`);
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
if (result.rows.length) {
  console.log('── sample classified transactions ───────────────');
  for (const tx of result.rows.slice(0, 8)) {
    console.log(`  ${tx.date || '??' } ${tx.type.padEnd(8)} ${String(tx.narration).slice(0, 40).padEnd(40)} ${tx.amount != null ? tx.amount : ''} -> ${tx.classification.category}${tx.classification.tdsSection ? ` [${tx.classification.tdsSection}]` : ''}`);
  }
}