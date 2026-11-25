import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItrReturn } from '../src/itr-return.mjs';
import { runItrRules, itrRuleCount } from '../src/itr-rules.mjs';
import { checkItrJson } from '../src/itr-json-check.mjs';

const TAXPAYER = { name: 'Asha Rao', pan: 'ABCPR1234F', dob: '1985-05-04', mobile: '9876543210', email: 'asha@example.com', fatherName: 'K Rao', address: { flat: '12', locality: 'MG Road', city: 'Bengaluru', stateCode: '29', pin: '560001' } };
const BANK = { account: '1234567890', ifsc: 'HDFC0001234', name: 'HDFC Bank' };
const ARGS = {
  form: 'ITR-2', fy: '2024-25', regime: 'new', taxpayer: TAXPAYER, bank: BANK,
  salary: { employers: [{ name: 'Acme', nature: 'PE', tan: 'BLRA12345B', gross: 1800000 }] },
  houseProperties: [{ type: 'L', rentReceived: 240000, municipalTax: 12000, interest: 150000 }],
  capitalGains: { transactions: [
    { name: 'INFY', kind: 'listed-equity', isin: 'INE009A01021', units: 100, buyDate: '2017-01-10', sellDate: '2024-09-10', saleValue: 400000, cost: 100000, fmv31Jan2018: 250000 },
    { name: 'HDFC', kind: 'listed-equity', isin: 'INE040A01034', buyDate: '2024-01-10', sellDate: '2024-08-10', saleValue: 300000, cost: 200000 },
  ] },
};

const built = () => buildItrReturn({}, ARGS).data;

test('the builder output passes every encoded portal rule', () => {
  const data = built();
  assert.equal(data.problems.length, 0, JSON.stringify(data.problems));
  assert.ok(data.ruleChecks.ran >= 25);
  assert.equal(data.ruleChecks.failed, 0);
});

test('grandfathered cost follows the 112A columns', () => {
  const row = built().json.ITR.ITR2.Schedule112A.Schedule112ADtls[0];
  assert.equal(row.ShareOnOrBefore, 'BE');
  assert.equal(row.AcquisitionCost, 100000);
  assert.equal(row.TotFairMktValueCapAst, 250000);
  assert.equal(row.LTCGBeforelowerB1B2, 250000);
  assert.equal(row.CostAcqWithoutIndx, 250000);
  assert.equal(row.Balance, 150000);
  assert.equal(row.NumSharesUnits * row.SalePricePerShareUnit, row.TotSaleValue);
});

test('tampered figures are caught', () => {
  const body = structuredClone(built().json.ITR.ITR2);
  body.ScheduleS.NetSalary += 1;
  body.Schedule112A.Schedule112ADtls[0].Balance += 5;
  body['PartB-TI'].TotalTI += 7;
  body.PartB_TTI.ComputationOfTaxLiability.TaxPayableOnTI.TaxPayableOnTotInc += 3;
  const failed = runItrRules('ITR-2', body, { regime: 'new' }).failures.map((item) => item.id);
  assert.ok(failed.includes('ITR-2-S-NET'));
  assert.ok(failed.includes('ITR-2-112A-BALANCE'));
  assert.ok(failed.includes('ITR-2-TI-TOTAL'));
  assert.ok(failed.includes('ITR-2-TTI-ROLLUP'));
});

test('check_itr_json reports a failed portal rule on an uploaded JSON', () => {
  const json = structuredClone(built().json);
  json.ITR.ITR2.ScheduleS.TotalGrossSalary += 100;
  const result = checkItrJson({}, { json: JSON.stringify(json) });
  assert.equal(result.data.schemaValid, true);
  assert.equal(result.data.valid, false);
  assert.ok(result.data.ruleChecks.failed.some((item) => item.cbdt === 'ITR-2-A-23'));
});

test('rule counts per form', () => {
  assert.ok(itrRuleCount('ITR-2') > itrRuleCount('ITR-3'));
  assert.ok(itrRuleCount('ITR-1') >= 3);
});
