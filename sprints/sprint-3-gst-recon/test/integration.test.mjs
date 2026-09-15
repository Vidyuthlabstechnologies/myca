import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { reconcile, toHumanText } from '../src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (f) => readFileSync(resolve(__dirname, 'fixtures', f), 'utf8');

const gig = () =>
  reconcile(
    {
      purchaseRegisterText: fixture('purchaseregister.csv'),
      gstr2bText: fixture('gstr2b-b2b.csv'),
      gstr1Text: fixture('gstr1.csv'),
      gstr3bText: fixture('gstr3b.csv'),
    },
    { clientGstin: '27AAACH7409R1Z3', asOfDate: '2025-04-30' }
  );

test('GATE 1: end-to-end reconcile surfaces every exception in the action queue', () => {
  const res = gig();
  assert.equal(res.ok, false, 'fixture set has known gaps + a GSTR-1/3B mismatch');
  assert.equal(res.client.gstin, '27AAACH7409R1Z3');
  assert.equal(res.client.stateName, 'Maharashtra');
  assert.equal(res.client.valid, true);

  const codes = res.issues.map((i) => i.code);
  assert.ok(codes.includes('INVOICE_NOT_IN_2B'), 'INV-1003 booked but missing from 2B');
  assert.ok(codes.includes('IN_2B_NOT_BOOKED'), 'FR-201 in 2B but not booked');
  assert.ok(codes.includes('RULE_37A_BLOCKED'), '37A blocking surfaced');
  assert.ok(codes.includes('GSTR1_3B_MISMATCH'), 'outward mismatch surfaced');

  const blocked = res.issues.filter((i) => i.code === 'RULE_37A_BLOCKED');
  assert.equal(blocked.length, 2);
  assert.ok(blocked.some((i) => i.ref === 'INV-1003'));
});

test('GATE 2: summary arithmetic ties out (available - blocked = eligible)', () => {
  const res = gig();
  assert.equal(res.summary.itcAvailable, 29160);
  assert.equal(res.summary.itcBlocked, 78400);
  assert.ok(res.summary.itcEligible < res.summary.itcAvailable, 'blocked credit reduces eligibility');
  assert.equal(res.summary.matchedInvoices, 4);
  assert.equal(res.summary.invoicesInBooksNotIn2B, 1);
  assert.equal(res.summary.invoicesIn2BNotInBooks, 1);
  assert.equal(res.summary.gstr1MismatchBuckets, 1);
});

test('GATE 3: outward buckets and IMS sections carry through to the report', () => {
  const res = gig();
  const inter = res.gstr13.buckets.find((b) => b.key === '18% inter');
  const intra = res.gstr13.buckets.find((b) => b.key === '18% intra');
  assert.equal(inter.ok, true);
  assert.equal(inter.gstr1Taxable, 70000);
  assert.equal(inter.gstr3bTaxable, 70000);
  assert.equal(intra.ok, false);
  assert.equal(intra.diff, -5000);
  assert.equal(res.ims.sections.B2B.count, 5);
  assert.equal(res.ims.sections.CDNR.count, 1);
});

test('GATE 4: unresolved supplier GSTIN or parser errors fail the reconcile', () => {
  const res = reconcile(
    {
      purchaseRegisterText: fixture('purchaseregister.csv'),
      gstr2bText: fixture('gstr2b-b2b.csv'),
      gstr1Text: fixture('gstr1.csv'),
      gstr3bText: fixture('gstr3b.csv'),
    },
    { clientGstin: '27AABCU9603R1ZA', asOfDate: '2025-04-30' }
  );
  assert.equal(res.ok, false);
  assert.equal(res.client.valid, false);
});

test('GATE 5: plain-language report is generated and stable', () => {
  const res = gig();
  const lines = toHumanText(res);
  assert.ok(lines.length > 10);
  assert.ok(lines.some((l) => l.includes('Maharashtra')));
  assert.ok(lines.some((l) => l.startsWith('Status: REQUIRES ACTION')));
  assert.ok(lines.some((l) => /INVOICE_NOT_IN_2B|absent from GSTR-2B/.test(l)));
  assert.ok(lines.some((l) => l.includes('Eligible input credit')));
});