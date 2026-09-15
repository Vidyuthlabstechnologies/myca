#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filingPrep } from './index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '..', 'test', 'fixtures');

const FLAG_DEFS = [
  { flag: '--sales', key: 'salesText', file: 'sales.csv' },
  { flag: '--inward', key: 'inwardText', file: 'inward.csv' },
  { flag: '--ais', key: 'aisText', file: 'ais.csv' },
  { flag: '--26as', key: 'tds26Text', file: '26as.csv' },
  { flag: '--income', key: 'incomeText', file: 'income.csv' },
  { flag: '--payments', key: 'paymentsText', file: 'payments.csv' },
];

function usage() {
  return [
    'Usage: node src/cli.mjs [options]',
    '',
    'Filing assistant prep: GSTR-1/3B (with e-invoice validation), ITR (AIS/26AS + regime compare), TDS thresholds.',
    '',
    'Options (each CSV path defaults to test/fixtures/<file>):',
    '  --sales=<path>      outward sales CSV',
    '  --inward=<path>     purchase register CSV',
    '  --ais=<path>        AIS CSV',
    '  --26as=<path>       26AS (Form 26AS TDS) CSV',
    '  --income=<path>     ITR income CSV',
    '  --payments=<path>   vendor payments CSV for TDS monitoring',
    '  --fy=<fy>           financial year (default 2026-27)',
    '  --as-of=<date>      as-of date (accepted; not used in scoring)',
    '  --state=<code>      supplier GSTIN state code (default 27)',
    '  --help              show this help and exit',
    '',
    'Exit codes: 0 clean, 2 action required (e-invoice violations / AIS gaps / TDS flags / parse errors), 1 bad arguments.',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { fy: '2026-27', supplierState: '27' };
  const positional = [];
  for (const a of argv) {
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--fy' || a === '--as-of' || a === '--state') {
      positional.push(a);
    } else if (a.startsWith('--fy=')) {
      opts.fy = a.slice(5);
    } else if (a.startsWith('--as-of=')) {
      opts.asOf = a.slice(8);
    } else if (a.startsWith('--state=')) {
      opts.supplierState = a.slice(8);
    } else if (FLAG_DEFS.some((d) => a === d.flag)) {
      positional.push(a);
    } else if (FLAG_DEFS.some((d) => a.startsWith(d.flag + '='))) {
      const def = FLAG_DEFS.find((d) => a.startsWith(d.flag + '='));
      opts[def.key] = a.slice(def.flag.length + 1);
    } else {
      positional.push(a);
    }
  }
  for (let i = 0; i < positional.length; i++) {
    const a = positional[i];
    const flagDef = FLAG_DEFS.find((d) => d.flag === a);
    if (!flagDef) {
      return { error: `Unknown argument: ${a}` };
    }
    const value = positional[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { error: `Missing value for ${a}` };
    }
    opts[flagDef.key] = value;
    i++;
  }
  for (const def of FLAG_DEFS) {
    if (opts[def.key] === undefined) {
      opts[def.key] = resolve(FIXTURES, def.file);
    }
  }
  return { opts };
}

function load(text, source) {
  try {
    return readFileSync(text, 'utf8');
  } catch {
    console.error(`cli: cannot read ${source} from ${text}`);
    return null;
  }
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

function main(argv) {
  const { opts, error } = parseArgs(argv);
  if (error) {
    console.error(`cli: ${error}`);
    console.error(usage());
    process.exit(1);
  }
  if (opts.help) {
    console.log(usage());
    process.exit(0);
  }

  for (const def of FLAG_DEFS) {
    const path = opts[def.key];
    const text = load(path, def.flag);
    if (text === null) process.exit(1);
    opts[def.key + '__text'] = text;
  }

  const result = filingPrep({
    salesText: opts.salesText__text,
    inwardText: opts.inwardText__text,
    aisText: opts.aisText__text,
    tds26Text: opts.tds26Text__text,
    incomeText: opts.incomeText__text,
    paymentsText: opts.paymentsText__text,
    fy: opts.fy,
    supplierState: opts.supplierState,
  });

  const { gstr1, gstr3b, itr, tds, errors } = result;
  const s = result.summary;

  console.log(`Filing prep report  FY ${opts.fy}  supplier state ${opts.supplierState}`);
  console.log('='.repeat(56));
  console.log(`GSTR-1 period        : ${s.period}`);
  console.log(`  B2B invoices       : ${gstr1.tables.b2b.length}  (taxable ${fmt(gstr1.tables.b2b.reduce((a, r) => a + r.taxable, 0))})`);
  console.log(`  B2CL rows          : ${gstr1.tables.b2cl.length}  (taxable ${fmt(gstr1.tables.b2cl.reduce((a, r) => a + r.taxable, 0))})`);
  console.log(`  B2CS rows          : ${gstr1.tables.b2cs.length}`);
  console.log(`  Nil/exempt         : ${fmt(gstr1.tables.nilExempt.reduce((a, r) => a + r.taxable, 0))}`);
  console.log(`  Total taxable      : ${fmt(s.totalTaxable)}`);
  console.log(`  E-invoice issues   : ${s.eInvoiceViolations}`);
  for (const e of gstr1.errors) {
    console.log(`    - ${e.invoiceNo} ${e.code}: ${e.message}`);
  }
  console.log(`GSTR-3B outward inter: taxable ${fmt(gstr3b.outward.totals.interTaxable)} IGST ${fmt(gstr3b.outward.totals.interIgst)}`);
  console.log(`GSTR-3B outward intra: taxable ${fmt(gstr3b.outward.totals.intraTaxable)} CGST ${fmt(gstr3b.outward.totals.intraCgst)} SGST ${fmt(gstr3b.outward.totals.intraSgst)}`);
  console.log(`GSTR-3B ITC          : available ${fmt(gstr3b.itc.netItc)}  blocked ${fmt(gstr3b.itc.ineligible.cgst + gstr3b.itc.ineligible.sgst + gstr3b.itc.ineligible.igst)}  import svc ${fmt(gstr3b.itc.importServicesIgst)}`);
  console.log(`ITR ${itr.recommended.toUpperCase()} regime tax: ${fmt(itr.tax[`${itr.recommended}Total`])}  (savings vs other: ${fmt(itr.savings)})`);
  console.log(`ITR TDS credit       : ${fmt(itr.tdsCredit.total)}  payable: ${fmt(itr.payable)}`);
  console.log(`ITR AIS gaps         : ${itr.reconciliations.aisVsReturn.length}  (unexplained ${fmt(itr.reconciliations.unexplainedAis)})`);
  console.log(`TDS monitor flags    : ${tds.length}`);
  for (const f of tds) {
    console.log(`    - ${f.payee} ${f.section}: ${f.kind}, basis ${fmt(f.basis)} @ ${(f.rate * 100).toFixed(0)}% => TDS ~${fmt(f.assumedTds)}`);
  }
  if (errors.length) {
    console.log(`Parse errors         : ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      console.log(`    - [${e.source}] ${e.code} row ${e.row}${e.field ? ' ' + e.field : ''}: ${e.message}`);
    }
  }
  console.log('='.repeat(56));
  console.log(result.ok ? 'STATUS: OK - all returns ready to file' : 'STATUS: ACTION REQUIRED - see issues above');
  process.exit(result.ok ? 0 : 2);
}

main(process.argv.slice(2));