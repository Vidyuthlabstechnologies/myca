import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { filingPrep } from '../src/index.mjs';
import { eInvoiceErrors } from '../src/gstr1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = (f) => resolve(HERE, 'fixtures', f);
const read = (f) => readFileSync(FIX(f), 'utf8');

const cleanSalesCsv = [
  'invoiceNo,date,partyGstin,partyName,partyState,hsn,rate,taxableValue,cgst,sgst,igst,cess,isEcommerce',
  'INV-901,2026-08-02,27AAACC1234A1ZI,Good Co,27,6204,18,10000,900,900,0,0,N',
].join('\n');

const cleanInwardCsv = [
  'invoiceNo,date,supplierGstin,supplierName,hsn,rate,taxableValue,cgst,sgst,igst,isInputService,itcEligible,itcAvailability',
  'INV-902,2026-08-06,27AAACC1234A1ZI,Safe Co,6204,18,5000,450,450,0,N,Y,Y',
].join('\n');

const cleanAisCsv = [
  'assessmentYear,informationType,sectionDescription,incomeType,transactingEntity,amount,tds,periodStart,periodEnd',
  '2027-28,SFT,Interest,interest,Bank X,50000,0,2026-10-01,2027-03-31',
].join('\n');

const clean26asCsv = [
  'fy,deductor,tan,section,period,amount,tds',
  '2026-27,Vertex Ltd,MUM01234A,192,Jul-Sep,3000000,45000',
].join('\n');

const cleanIncomeCsv = [
  'nature,value,note',
  'salary,3000000,',
  'other_interest,50000,',
].join('\n');

const cleanPaymentsCsv = [
  'fy,payee,section,date,amount',
  '2026-27,Small Vendor,194A,2026-08-01,10000',
].join('\n');

test('GATE 1: end-to-end fixture filingPrep wires all modules with exact values', () => {
  const r = filingPrep({
    salesText: read('sales.csv'),
    inwardText: read('inward.csv'),
    aisText: read('ais.csv'),
    tds26Text: read('26as.csv'),
    incomeText: read('income.csv'),
    paymentsText: read('payments.csv'),
  });
  assert.equal(r.gstr1.period, '2026-08');
  assert.equal(r.gstr1.tables.b2b.length, 4);
  assert.equal(r.gstr1.totalTaxable, 1030000);
  assert.equal(r.gstr3b.outward.totals.interTaxable, 760000);
  assert.equal(r.gstr3b.outward.totals.interIgst, 125600);
  assert.equal(r.gstr3b.itc.netItc, 130400);
  assert.equal(r.itr.recommended, 'new');
  assert.equal(r.itr.payable, 901900);
  assert.equal(r.tds.length, 3);
  assert.equal(r.errors.length, 0);
  assert.equal(r.ok, false);
  assert.equal(r.summary.period, '2026-08');
  assert.equal(r.summary.totalTaxable, 1030000);
  assert.equal(r.summary.eInvoiceViolations, 2);
  assert.equal(r.summary.tdsFlags, 3);
});

test('GATE 2: e-invoice validation flags INV-108 with exactly two errors and excludes it', () => {
  const r = filingPrep({
    salesText: read('sales.csv'),
    inwardText: read('inward.csv'),
    aisText: read('ais.csv'),
    tds26Text: read('26as.csv'),
    incomeText: read('income.csv'),
    paymentsText: read('payments.csv'),
  });
  const inv108 = r.gstr1.errors.filter((e) => e.invoiceNo === 'INV-108');
  assert.equal(inv108.length, 2);
  assert.deepEqual(inv108.map((e) => e.code).sort(), ['INVALID_HSN', 'TAX_MISMATCH']);
  assert.ok(!r.gstr1.tables.b2b.some((row) => row.invoiceNo === 'INV-108'));
  assert.ok(!r.gstr1.tables.hsn.some((row) => row.hsn === 'ABC'));
  const direct = eInvoiceErrors([{ invoiceNo: 'X', partyGstin: '12AB', partyState: '29', hsn: '6204', rate: 18, taxableValue: 100, cgst: 10, sgst: 10, igst: 0 }]);
  assert.equal(direct.some((e) => e.code === 'INVALID_GSTIN'), true);
});

test('GATE 3: ITR AIS reconciliation surfaces all income gaps', () => {
  const r = filingPrep({
    salesText: read('sales.csv'),
    inwardText: read('inward.csv'),
    aisText: read('ais.csv'),
    tds26Text: read('26as.csv'),
    incomeText: read('income.csv'),
    paymentsText: read('payments.csv'),
  });
  const rows = r.itr.reconciliations.aisVsReturn;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((x) => x.incomeType), ['capital', 'dividend', 'interest', 'rent'].sort());
  assert.equal(r.itr.reconciliations.unexplainedAis, 390000);
  assert.equal(r.itr.reconciliations.tds26Total, 57500);
  assert.equal(r.itr.ok, false);
});

test('GATE 4: regime compare math is exact', () => {
  const r = filingPrep({
    salesText: read('sales.csv'),
    inwardText: read('inward.csv'),
    aisText: read('ais.csv'),
    tds26Text: read('26as.csv'),
    incomeText: read('income.csv'),
    paymentsText: read('payments.csv'),
  });
  assert.equal(r.itr.gti, 4550000);
  assert.equal(r.itr.taxable.newRegime, 4475000);
  assert.equal(r.itr.taxable.oldRegime, 4325000);
  assert.equal(r.itr.tax.newTotal, 959400);
  assert.equal(r.itr.tax.oldTotal, 1154400);
  assert.equal(r.itr.savings, 195000);
  assert.equal(r.itr.tdsCredit.total, 57500);
});

test('GATE 5: TDS monitor produces the three flags due under the law in force', () => {
  const r = filingPrep({
    salesText: read('sales.csv'),
    inwardText: read('inward.csv'),
    aisText: read('ais.csv'),
    tds26Text: read('26as.csv'),
    incomeText: read('income.csv'),
    paymentsText: read('payments.csv'),
  });
  const flags = r.tds.map((f) => `${f.payee} ${f.section} ${f.kind} ${f.basis} @${f.rate} = ${f.assumedTds}`);
  assert.deepEqual(flags, [
    'Finance Bank 194A aggregate 45000 @0.1 = 4500',
    'Raj Contractors 194C aggregate 110000 @0.02 = 2200',
    'Shelter RE 194I monthly 400000 @0.1 = 40000',
  ]);
});

test('GATE 6: CLI exit codes - clean run 0, fixture run 2, bad args 1', () => {
  const cli = resolve(HERE, '..', 'src', 'cli.mjs');
  const clean = spawnSync(process.execPath, [
    cli,
    `--sales=${FIX('sales.csv')}`, `--inward=${FIX('inward.csv')}`,
    `--ais=${FIX('ais.csv')}`, `--26as=${FIX('26as.csv')}`,
    `--income=${FIX('income.csv')}`, `--payments=${FIX('payments.csv')}`,
  ].concat([]), { encoding: 'utf8' });

  const cleanRun = () => {
    const tmpSales = resolve(HERE, 'fixtures', 'clean-sales.tmp.csv');
    const tmpInward = resolve(HERE, 'fixtures', 'clean-inward.tmp.csv');
    const tmpAis = resolve(HERE, 'fixtures', 'clean-ais.tmp.csv');
    const tmp26as = resolve(HERE, 'fixtures', 'clean-26as.tmp.csv');
    const tmpIncome = resolve(HERE, 'fixtures', 'clean-income.tmp.csv');
    const tmpPayments = resolve(HERE, 'fixtures', 'clean-payments.tmp.csv');
    writeFileSync(tmpSales, cleanSalesCsv);
    writeFileSync(tmpInward, cleanInwardCsv);
    writeFileSync(tmpAis, cleanAisCsv);
    writeFileSync(tmp26as, clean26asCsv);
    writeFileSync(tmpIncome, cleanIncomeCsv);
    writeFileSync(tmpPayments, cleanPaymentsCsv);
    const res = spawnSync(process.execPath, [
      cli,
      `--sales=${tmpSales}`, `--inward=${tmpInward}`,
      `--ais=${tmpAis}`, `--26as=${tmp26as}`,
      `--income=${tmpIncome}`, `--payments=${tmpPayments}`,
    ], { encoding: 'utf8' });
    for (const f of [tmpSales, tmpInward, tmpAis, tmp26as, tmpIncome, tmpPayments]) {
      rmSync(f, { force: true });
    }
    return res;
  };

  const bad = spawnSync(process.execPath, [cli, '--bogus', 'x'], { encoding: 'utf8' });

  assert.equal(clean.status, 2, 'fixture run must signal action required');
  assert.match(clean.stdout, /STATUS: ACTION REQUIRED/);
  assert.equal(cleanRun().status, 0, 'clean trimmed run must exit 0');
  assert.equal(bad.status, 1, 'bad args must exit 1');
  assert.match(bad.stderr, /Unknown argument/);
});