import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadState, defaultDataPath } from '../src/store.mjs';
import { getBook } from '../src/books.mjs';
import { bookView } from '../src/book-view.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { filing } from '../src/sprint-load.mjs';
import { invoicesToSalesCsv, purchasesToInwardCsv } from '../src/invoice.mjs';
import { putDocument } from '../src/document-store.mjs';

const { filingPrep } = filing;

function parseArgs(argv) {
  const args = { client: 'SELF', period: '', fp: '', filed: '', filed3b: '', dataPath: '', save: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--client' && argv[i + 1]) args.client = argv[++i];
    else if (arg === '--period' && argv[i + 1]) args.period = argv[++i];
    else if (arg === '--fp' && argv[i + 1]) args.fp = argv[++i];
    else if (arg === '--filed' && argv[i + 1]) args.filed = argv[++i];
    else if (arg === '--filed3b' && argv[i + 1]) args.filed3b = argv[++i];
    else if (arg === '--dataPath' && argv[i + 1]) args.dataPath = argv[++i];
    else if (arg === '--save') args.save = true;
  }
  if (!args.fp && args.period) {
    const [y, m] = args.period.split('-');
    if (y && m) args.fp = `${m}${y}`;
  }
  return args;
}

function round2(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

export function diffGstr1(computed, filed) {
  const differences = [];
  if (!filed) return { differences, match: true };

  const compB2b = computed.b2b || [];
  const filedB2b = filed.b2b || [];
  const compInvs = compB2b.flatMap((g) => (g.inv || []).map((i) => ({ ...i, ctin: g.ctin })));
  const filedInvs = filedB2b.flatMap((g) => (g.inv || []).map((i) => ({ ...i, ctin: g.ctin })));

  const filedByNum = new Map(filedInvs.map((i) => [String(i.inum).trim(), i]));
  const compByNum = new Map(compInvs.map((i) => [String(i.inum).trim(), i]));

  for (const [num, cInv] of compByNum) {
    const fInv = filedByNum.get(num);
    if (!fInv) {
      differences.push({
        table: 'b2b',
        ref: num,
        type: 'data_gap',
        message: `Invoice ${num} present in MyCA books but missing in filed GSTR-1.`,
      });
      continue;
    }
    if (Math.abs(round2(cInv.val) - round2(fInv.val)) > 1) {
      differences.push({
        table: 'b2b',
        ref: num,
        type: 'engine_bug',
        message: `Invoice ${num} value mismatch: computed ${cInv.val}, filed ${fInv.val}.`,
      });
    }
  }

  for (const [num] of filedByNum) {
    if (!compByNum.has(num)) {
      differences.push({
        table: 'b2b',
        ref: num,
        type: 'data_gap',
        message: `Invoice ${num} present in filed GSTR-1 but missing in MyCA books.`,
      });
    }
  }

  return {
    differences,
    match: differences.length === 0,
    computedInvoices: compInvs.length,
    filedInvoices: filedInvs.length,
  };
}

export function diffGstr3b(computed, filed) {
  const differences = [];
  if (!filed) return { differences, match: true };

  const compOutward = round2(computed.outwardTaxable || computed.table31?.taxable || 0);
  const filedOutward = round2(filed.outwardTaxable || filed.table31?.taxable || 0);

  if (Math.abs(compOutward - filedOutward) > 1) {
    differences.push({
      table: '3.1',
      field: 'taxable',
      type: 'engine_bug',
      message: `Table 3.1 taxable turnover mismatch: computed ${compOutward}, filed ${filedOutward}.`,
    });
  }

  const compItc = round2(computed.itcEligible || computed.table4?.total || 0);
  const filedItc = round2(filed.itcEligible || filed.table4?.total || 0);

  if (Math.abs(compItc - filedItc) > 1) {
    differences.push({
      table: '4',
      field: 'itc',
      type: 'engine_bug',
      message: `Table 4 ITC mismatch: computed ${compItc}, filed ${filedItc}.`,
    });
  }

  return {
    differences,
    match: differences.length === 0,
  };
}

export async function runShadowHarness(options = {}) {
  const dataPath = options.dataPath || defaultDataPath();
  const state = loadState(dataPath);
  const clientId = String(options.client || 'SELF').toUpperCase();
  const book = clientId === 'SELF' ? state : getBook(state, clientId);
  const view = bookView(state, book);

  const fp = options.fp || '';
  const gstr1Json = invoicesToGstr1Json(view.company || {}, view.invoices || [], fp);

  const salesText = invoicesToSalesCsv(view.invoices || []);
  const inwardText = purchasesToInwardCsv(view.purchases || []);
  const prep = filingPrep({
    salesText,
    inwardText,
    supplierState: view.company.state,
    fy: view.company.fy,
  });

  let filedGstr1 = null;
  if (options.filed && existsSync(options.filed)) {
    filedGstr1 = JSON.parse(readFileSync(options.filed, 'utf8'));
  }

  let filed3b = null;
  if (options.filed3b && existsSync(options.filed3b)) {
    filed3b = JSON.parse(readFileSync(options.filed3b, 'utf8'));
  }

  const gstr1Diff = diffGstr1(gstr1Json, filedGstr1);
  const gstr3bDiff = diffGstr3b(prep.gstr3b, filed3b);

  const allDifferences = [...gstr1Diff.differences, ...gstr3bDiff.differences];
  const summary = {
    clientId,
    fp: fp || 'all',
    generatedAt: new Date().toISOString(),
    match: allDifferences.length === 0,
    gstr1: {
      b2bCount: gstr1Json.b2b?.length || 0,
      b2csCount: gstr1Json.b2cs?.length || 0,
      errors: gstr1Json.errors || [],
      differences: gstr1Diff.differences,
    },
    gstr3b: {
      outward: prep.gstr3b.outwardTaxable,
      itc: prep.gstr3b.itcEligible,
      differences: gstr3bDiff.differences,
    },
    differencesCount: allDifferences.length,
    byType: {
      engine_bug: allDifferences.filter((d) => d.type === 'engine_bug').length,
      data_gap: allDifferences.filter((d) => d.type === 'data_gap').length,
      documented_difference: allDifferences.filter((d) => d.type === 'documented_difference').length,
    },
  };

  if (options.save && state._dataDir) {
    const content = JSON.stringify(summary, null, 2);
    putDocument(state._dataDir, content);
  }

  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const args = parseArgs(process.argv);
  runShadowHarness(args).then((res) => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.byType.engine_bug > 0 ? 1 : 0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
