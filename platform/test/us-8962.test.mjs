import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForm1040, US_FORMS_SUPPORTED, US_FORMS_COMING, FORM_KINDS } from '../src/us-1040.mjs';
import { applicableFigureBasisPoints, percentOfPovertyLine, povertyLineFor } from '../src/us-form-8962.mjs';
import { addUsTaxForm, planUsTaxForm, setUsTaxpayer, usInterview, usReturnReview, answerUsInterview } from '../src/us-return.mjs';
import { rules } from '../src/sprint-load.mjs';
import { createState } from '../src/store.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/assistant-contract.mjs';

const w2 = (wages, withheld = 0) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', fields: { wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 6.2) / 100, medicareWages: wages, medicareTax: Math.round(wages * 1.45) / 100 } });
const months = (from, a, b, c) => Object.fromEntries(Array.from({ length: 13 - from }, (_, index) => from + index).flatMap((month) => [[`enrollmentPremium${month}`, a], [`slcspPremium${month}`, b], [`advancePayment${month}`, c]]));
const statement = (fields) => ({ kind: '1095-A', owner: 'taxpayer', payer: 'HealthCare.gov', fields });
const adult = (first, dob = '1985-03-10') => ({ firstName: first, lastName: 'Rivera', dateOfBirth: dob });
const child = (first, dob) => ({ firstName: first, lastName: 'Rivera', relationship: 'son', dateOfBirth: dob, months: 12 });
const run = (taxYear, filingStatus, forms, more = {}) => computeForm1040({ filingStatus, taxpayer: adult('Sam'), address: { line1: '1 Main St', city: 'Denver', state: 'CO', zip: '80202' }, forms, ...more }, taxYear);
const rule = (id, year) => rules.rule(id, `${year}-12-31`).value;

test('the applicable figure reproduces the 2025 and 2026 Table 2 rows by interpolating within the band and rounding to four decimals', () => {
  const y2025 = rule('us.federal.individual.ptc-applicable-figure', 2025).bands;
  const y2026 = rule('us.federal.individual.ptc-applicable-figure', 2026).bands;
  assert.deepEqual([90, 150, 151, 200, 201, 251, 301, 353, 399, 400, 401].map((p) => applicableFigureBasisPoints(p, y2025)), [0, 0, 4, 200, 204, 404, 603, 733, 848, 850, 850]);
  assert.deepEqual([90, 132, 133, 134, 150, 182, 200, 202, 250, 291, 299, 300, 400].map((p) => applicableFigureBasisPoints(p, y2026)), [210, 210, 314, 320, 419, 573, 660, 667, 844, 969, 993, 996, 996]);
  assert.equal(percentOfPovertyLine(27959, 15060), 185);
  assert.equal(percentOfPovertyLine(60241, 15060), 401);
  assert.equal(percentOfPovertyLine(60240, 15060), 400);
  assert.equal(povertyLineFor(rule('us.federal.individual.ptc-poverty-line', 2025).contiguous, 11), 68860);
  assert.equal(povertyLineFor(rule('us.federal.individual.ptc-poverty-line', 2025).alaska, 11), 86110);
  assert.equal(povertyLineFor(rule('us.federal.individual.ptc-poverty-line', 2026).hawaii, 11), 81290);
  assert.equal(rule('us.federal.individual.ptc-repayment-limit', 2026).capped, false);
  assert.equal(rules.rule('us.federal.individual.ptc-repayment-limit', '2027-12-31').value.capped, false);
});

test('2025 single at 200% of the poverty line: wages 30,000 plus 120 tax-exempt interest is 30,120 = 200% of 15,060; 8a 602; annual PTC 5,400 - 602 = 4,798; net PTC 4,798 - 4,560 = 238 on Schedule 3 line 9', () => {
  const interest = { kind: '1099-INT', owner: 'taxpayer', payer: 'Bank', fields: { interest: 0, taxExemptInterest: 120 } };
  const out = run('2025', 'single', [w2(30000, 2000), interest, statement(months(1, 500, 450, 380))]);
  assert.equal(out.ok, true);
  const f = out.data.schedules['8962'];
  assert.equal(f['1'], 1);
  assert.equal(f['2a'], 30120);
  assert.equal(f['3'], 30120);
  assert.equal(f['4'], 15060);
  assert.equal(f.povertyTable, 'contiguous');
  assert.equal(f['5'], 200);
  assert.equal(f['6'], undefined);
  assert.equal(f['7'], 0.02);
  assert.equal(f['8a'], 602);
  assert.equal(f['8b'], 50);
  assert.equal(f['10'], 'yes');
  assert.equal(f.method, 'annual');
  assert.deepEqual(f['11'], { a: 6000, b: 5400, c: 602, d: 4798, e: 4798, f: 4560 });
  assert.equal(f['24'], 4798);
  assert.equal(f['25'], 4560);
  assert.equal(f['26'], 238);
  assert.equal(f['27'], undefined);
  assert.equal(out.data.schedules['3']['9'], 238);
  assert.equal(out.data.schedules['3']['15'], 238);
  assert.equal(out.data.lines['31'], 238);
  assert.equal(out.data.lines['17'], 0);
  assert.equal(out.data.schedules['2'], undefined);
  assert.deepEqual(out.data.unsupported, []);
  assert.ok(out.data.rulesUsed.some((item) => item.startsWith('us.federal.individual.ptc-applicable-figure@2025')));
});

test('family of four at 300%: 2025 excess APTC 15,600 - 11,184 = 4,416 is capped at 3,250; 2026 at 291% (figure 0.0969) repays the whole 7,870', () => {
  const family = { spouse: adult('Alex', '1986-05-01'), dependents: [child('Ben', '2015-02-02'), child('Cy', '2018-08-08')] };
  const forms = [w2(93600, 8000), statement(months(1, 1500, 1400, 1300))];
  const y2025 = run('2025', 'mfj', forms, family);
  const f = y2025.data.schedules['8962'];
  assert.equal(f['1'], 4);
  assert.equal(f['4'], 31200);
  assert.equal(f['5'], 300);
  assert.equal(f['7'], 0.06);
  assert.equal(f['8a'], 5616);
  assert.deepEqual(f['11'], { a: 18000, b: 16800, c: 5616, d: 11184, e: 11184, f: 15600 });
  assert.equal(f['26'], undefined);
  assert.equal(f['27'], 4416);
  assert.equal(f['28'], 3250);
  assert.equal(f['29'], 3250);
  assert.equal(y2025.data.schedules['2']['1a'], 3250);
  assert.equal(y2025.data.schedules['2']['3'], 3250);
  assert.equal(y2025.data.lines['17'], 3250);
  assert.equal(y2025.data.lines['18'], y2025.data.lines['16'] + 3250);
  assert.equal(y2025.data.lines['31'], 0);

  const y2026 = run('2026', 'mfj', forms, family);
  const g = y2026.data.schedules['8962'];
  assert.equal(g['4'], 32150);
  assert.equal(g['5'], 291);
  assert.equal(g['6'], 'no');
  assert.equal(g['7'], 0.0969);
  assert.equal(g['8a'], 9070);
  assert.deepEqual(g['11'], { a: 18000, b: 16800, c: 9070, d: 7730, e: 7730, f: 15600 });
  assert.equal(g['27'], 7870);
  assert.equal(g['28'], undefined);
  assert.equal(g['29'], undefined);
  assert.equal(y2026.data.schedules['2']['1a'], 7870);
  assert.equal(y2026.data.lines['17'], 7870);
});

test('above 400%: 2026 allows no credit and repays all 3,600 of APTC; 2025 uses 0.0850 and repays the uncapped 2,950', () => {
  const forms = [w2(70000, 9000), statement(months(1, 500, 550, 300))];
  const y2026 = run('2026', 'single', forms);
  const f = y2026.data.schedules['8962'];
  assert.equal(f['5'], 401);
  assert.equal(f['6'], 'yes');
  assert.equal(f['7'], undefined);
  assert.equal(f['8a'], undefined);
  assert.deepEqual(f['11'], { f: 3600 });
  assert.equal(f['24'], 0);
  assert.equal(f['25'], 3600);
  assert.equal(f['27'], 3600);
  assert.equal(y2026.data.schedules['2']['1a'], 3600);
  assert.ok(y2026.data.checks.some((item) => item.code === 'PTC_ABOVE_400_PERCENT'));

  const y2025 = run('2025', 'single', forms);
  const g = y2025.data.schedules['8962'];
  assert.equal(g['5'], 401);
  assert.equal(g['7'], 0.085);
  assert.equal(g['8a'], 5950);
  assert.deepEqual(g['11'], { a: 6000, b: 6600, c: 5950, d: 650, e: 650, f: 3600 });
  assert.equal(g['27'], 2950);
  assert.equal(g['28'], undefined);
  assert.equal(g['29'], 2950);
  assert.equal(y2025.data.schedules['2']['1a'], 2950);
});

test('coverage from July uses the monthly lines: 37,650 is 250% (0.0400), 8a 1,506, 8b 126; each month 500 - 126 = 374, six months 2,244 less APTC 1,800 = 444', () => {
  const out = run('2025', 'single', [w2(37650, 3000), statement(months(7, 450, 500, 300))]);
  const f = out.data.schedules['8962'];
  assert.equal(f['5'], 250);
  assert.equal(f['8a'], 1506);
  assert.equal(f['8b'], 126);
  assert.equal(f['10'], 'no');
  assert.equal(f.method, 'monthly');
  assert.equal(f['11'], undefined);
  for (const lineNo of ['12', '13', '14', '15', '16', '17']) assert.equal(f[lineNo], undefined);
  assert.deepEqual(f['18'], { month: 'July', a: 450, b: 500, c: 126, d: 374, e: 374, f: 300 });
  assert.deepEqual(f['23'], { month: 'December', a: 450, b: 500, c: 126, d: 374, e: 374, f: 300 });
  assert.equal(f['24'], 2244);
  assert.equal(f['25'], 1800);
  assert.equal(f['26'], 444);
  assert.equal(out.data.schedules['3']['9'], 444);
});

test('a change in the SLCSP premium mid-year also forces the monthly lines, and two policies in a month are added', () => {
  const first = statement({ ...months(1, 300, 600, 200), slcspPremium12: 650 });
  const second = statement(months(1, 100, 600, 50));
  const out = run('2025', 'single', [w2(37650, 3000), first, second]);
  const f = out.data.schedules['8962'];
  assert.equal(f.method, 'monthly');
  assert.deepEqual(f['12'], { month: 'January', a: 400, b: 600, c: 126, d: 474, e: 400, f: 250 });
  assert.deepEqual(f['23'], { month: 'December', a: 400, b: 650, c: 126, d: 524, e: 400, f: 250 });
  assert.equal(f['24'], 4800);
  assert.ok(out.data.checks.some((item) => item.code === 'FORM_1095A_SLCSP_DIFFERS'));
});

test('Alaska uses its own poverty line: 37,620 is 200% of 18,810, 8a 752, net PTC 4,648 - 4,500 = 148; Hawaii uses 17,310', () => {
  const forms = [w2(37620, 3000), statement(months(1, 500, 450, 375))];
  const alaska = run('2025', 'single', forms, { address: { line1: '1 Main St', city: 'Juneau', state: 'AK', zip: '99801' } });
  const f = alaska.data.schedules['8962'];
  assert.equal(f.povertyTable, 'alaska');
  assert.equal(f['4'], 18810);
  assert.equal(f['5'], 200);
  assert.equal(f['8a'], 752);
  assert.deepEqual(f['11'], { a: 6000, b: 5400, c: 752, d: 4648, e: 4648, f: 4500 });
  assert.equal(f['26'], 148);
  const hawaii = run('2025', 'single', forms, { address: { line1: '1 Main St', city: 'Hilo', state: 'HI', zip: '96720' } }).data.schedules['8962'];
  assert.equal(hawaii.povertyTable, 'hawaii');
  assert.equal(hawaii['4'], 17310);
  assert.equal(hawaii['5'], 217);
  const contiguous = run('2025', 'single', forms).data.schedules['8962'];
  assert.equal(contiguous['5'], 249);
  assert.equal(contiguous['7'], 0.0396);
});

test('married filing separately cannot take the credit: all 2,400 of APTC is excess, capped at 1,950 at 265%; with the abuse exception the credit is computed', () => {
  const forms = [w2(40000, 4000), statement(months(1, 500, 450, 200))];
  const out = run('2025', 'mfs', forms, { spouse: adult('Pat') });
  const f = out.data.schedules['8962'];
  assert.equal(f.A, false);
  assert.equal(f['5'], 265);
  assert.equal(f['7'], undefined);
  assert.deepEqual(f['11'], { f: 2400 });
  assert.equal(f['24'], 0);
  assert.equal(f['27'], 2400);
  assert.equal(f['28'], 1950);
  assert.equal(f['29'], 1950);
  assert.equal(out.data.schedules['2']['1a'], 1950);
  assert.ok(out.data.checks.some((item) => item.code === 'PTC_MFS_NOT_ALLOWED'));

  const excepted = run('2025', 'mfs', forms, { spouse: adult('Pat'), answers: { marketplaceAbuseException: true } }).data.schedules['8962'];
  assert.equal(excepted.A, true);
  assert.equal(excepted['7'], 0.046);
  assert.equal(excepted['8a'], 1840);
  assert.deepEqual(excepted['11'], { a: 6000, b: 5400, c: 1840, d: 3560, e: 3560, f: 2400 });
  assert.equal(excepted['26'], 1160);

  const y2026 = run('2026', 'mfs', forms, { spouse: adult('Pat') }).data.schedules['8962'];
  assert.equal(y2026['27'], 2400);
  assert.equal(y2026['29'], undefined);
});

test('below 100% of the poverty line: 12,000 is 79%; 2025 repays APTC capped at 375 unless the enrollment estimate exception applies (figure 0, net PTC 600); 2026 repays all 4,800 or with the exception uses 0.0210', () => {
  const forms = [w2(12000, 0), statement(months(1, 500, 450, 400))];
  const plain = run('2025', 'single', forms);
  const f = plain.data.schedules['8962'];
  assert.equal(f['5'], 79);
  assert.equal(f['24'], 0);
  assert.equal(f['27'], 4800);
  assert.equal(f['28'], 375);
  assert.equal(f['29'], 375);
  assert.equal(plain.data.schedules['2']['1a'], 375);
  assert.ok(plain.data.checks.some((item) => item.code === 'PTC_BELOW_POVERTY_LINE'));

  const estimated = run('2025', 'single', forms, { answers: { marketplaceEnrollmentEstimate: true } }).data.schedules['8962'];
  assert.equal(estimated['7'], 0);
  assert.deepEqual(estimated['11'], { a: 6000, b: 5400, c: 0, d: 5400, e: 5400, f: 4800 });
  assert.equal(estimated['26'], 600);

  const lawful = run('2025', 'single', forms, { answers: { marketplaceLawfullyPresent: true } }).data.schedules['8962'];
  assert.equal(lawful['26'], 600);

  const y2026 = run('2026', 'single', forms).data.schedules['8962'];
  assert.equal(y2026['5'], 76);
  assert.equal(y2026['6'], 'yes');
  assert.equal(y2026['27'], 4800);
  assert.equal(y2026['29'], undefined);
  assert.equal(run('2026', 'single', forms, { answers: { marketplaceLawfullyPresent: true } }).data.schedules['8962']['27'], 4800);

  const y2026estimated = run('2026', 'single', forms, { answers: { marketplaceEnrollmentEstimate: true } }).data.schedules['8962'];
  assert.equal(y2026estimated['6'], 'no');
  assert.equal(y2026estimated['7'], 0.021);
  assert.equal(y2026estimated['8a'], 252);
  assert.deepEqual(y2026estimated['11'], { a: 6000, b: 5400, c: 252, d: 5148, e: 5148, f: 4800 });
  assert.equal(y2026estimated['26'], 348);
});

test('modified AGI adds the untaxed part of Social Security and excluded foreign income, and dependents who must file add their own', () => {
  const ssa = { kind: 'SSA-1099', owner: 'taxpayer', payer: 'SSA', fields: { netBenefits: 10000 } };
  const out = run('2025', 'single', [w2(20000, 0), ssa, statement(months(1, 500, 450, 300))], { dependents: [child('Ben', '2010-01-01')], answers: { marketplaceForeignExcluded: 1000, marketplaceDependentsMagi: 4000 } });
  const f = out.data.schedules['8962'];
  assert.equal(out.data.lines['6b'], 0);
  assert.equal(f['1'], 2);
  assert.equal(f['2a'], 20000 + 10000 + 1000);
  assert.equal(f['2b'], 4000);
  assert.equal(f['3'], 35000);
});

test('annual totals alone use line 11 with a warning; a dependent, a shared policy, the marriage election and a missing 1095-A are each handled honestly', () => {
  const totals = run('2025', 'single', [w2(30120, 2000), statement({ enrollmentPremiumAnnual: 6000, slcspPremiumAnnual: 5400, advancePaymentAnnual: 4560 })]);
  assert.deepEqual(totals.data.schedules['8962']['11'], { a: 6000, b: 5400, c: 602, d: 4798, e: 4798, f: 4560 });
  assert.ok(totals.data.checks.some((item) => item.code === 'FORM_1095A_ANNUAL_ONLY' && item.level === 'warning'));

  const mixed = run('2025', 'single', [w2(30120, 2000), statement({ enrollmentPremiumAnnual: 6000 }), statement(months(1, 500, 450, 380))]);
  assert.equal(mixed.data.schedules['8962'], undefined);
  assert.ok(mixed.data.checks.some((item) => item.code === 'FORM_1095A_MONTHLY_NEEDED' && item.level === 'error'));

  const dependent = computeForm1040({ filingStatus: 'single', taxpayer: { ...adult('Kim', '2004-01-01'), canBeClaimedAsDependent: true }, forms: [w2(9000, 0), statement(months(1, 300, 300, 250))] }, '2025');
  assert.equal(dependent.data.schedules['8962'], undefined);
  assert.equal(dependent.data.lines['17'], 0);
  assert.ok(dependent.data.checks.some((item) => item.code === 'PTC_CLAIMED_AS_DEPENDENT'));

  const shared = run('2025', 'single', [w2(30120, 2000), statement(months(1, 500, 450, 380))], { answers: { marketplacePolicyShared: true } });
  assert.equal(shared.data.schedules['8962'], undefined);
  assert.deepEqual(shared.data.unsupported, [{ form: '8962', reason: 'Marketplace health coverage (premium tax credit)', code: 'FORM_8962_ALLOCATION_NOT_COVERED', required: true }]);
  assert.equal(shared.data.checks.find((item) => item.code === 'FORM_8962_ALLOCATION_NOT_COVERED').level, 'error');

  const married = run('2025', 'mfj', [w2(93600, 8000), statement(months(1, 1500, 1400, 1300))], { spouse: adult('Alex'), dependents: [child('Ben', '2015-02-02'), child('Cy', '2018-08-08')], answers: { marketplaceMarriageAlternative: true } });
  assert.equal(married.data.schedules['8962']['29'], 3250);
  assert.deepEqual(married.data.unsupported.map((item) => [item.code, item.required]), [['FORM_8962_MARRIAGE_ALTERNATIVE_NOT_COVERED', false]]);

  const missing = run('2025', 'single', [w2(30000, 2000)], { answers: { marketplaceCoverage: true } });
  assert.equal(missing.data.checks.find((item) => item.code === 'FORM_1095A_MISSING').level, 'error');
  assert.equal(run('2025', 'single', [w2(30000, 2000)], { answers: { marketplaceCoverage: false } }).data.checks.some((item) => item.code === 'FORM_1095A_MISSING'), false);
});

test('Form 8962 is supported, 1095-A is a form kind the tools accept and validate, and the interview asks the 8962 questions only when needed', () => {
  assert.ok(US_FORMS_SUPPORTED.includes('8962'));
  assert.ok(!US_FORMS_COMING.includes('8962'));
  assert.ok(FORM_KINDS.includes('1095-A'));
  assert.ok(TOOL_ARG_SCHEMAS.add_us_tax_form.properties.kind.enum.includes('1095-A'));
  const state = createState();
  assert.equal(planUsTaxForm(state, { taxYear: '2025', kind: '1095-A', payer: 'HealthCare.gov', fields: {} }).ok, false);
  assert.match(planUsTaxForm(state, { taxYear: '2025', kind: '1095-A', payer: 'HealthCare.gov', fields: { advancePayment3: 100 } }).problems.join(' '), /March: an advance payment needs/);
  assert.match(planUsTaxForm(state, { taxYear: '2025', kind: '1095-A', payer: 'HealthCare.gov', fields: { ...months(1, 500, 450, 380), enrollmentPremiumAnnual: 5000 } }).problems.join(' '), /Line 33 column A/);
  assert.equal(setUsTaxpayer(state, { taxYear: '2025', filingStatus: 'mfs', taxpayer: adult('Sam'), spouse: adult('Pat'), address: { line1: '1 Main St', city: 'Denver', state: 'CO', zip: '80202' } }).ok, true);
  const before = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  assert.ok(before.includes('marketplaceCoverage'));
  assert.ok(!before.includes('marketplacePolicyShared'));
  const added = addUsTaxForm(state, { taxYear: '2025', kind: '1095-A', payer: 'HealthCare.gov', fields: { policyNumber: 'P-1', ...months(1, 500, 450, 200) } });
  assert.equal(added.ok, true);
  assert.equal(added.data.amounts.policyNumber, 'P-1');
  assert.equal(added.data.amounts.enrollmentPremium12, 500);
  addUsTaxForm(state, { taxYear: '2025', kind: 'W-2', payer: 'Acme Inc', fields: { wages: 40000, federalWithheld: 4000 } });
  const after = usInterview(state, { taxYear: '2025' }).data.questions.map((item) => item.id);
  for (const id of ['marketplacePolicyShared', 'marketplaceForeignExcluded', 'marketplaceEnrollmentEstimate', 'marketplaceLawfullyPresent', 'marketplaceAbuseException', 'marketplaceMarriageAlternative']) assert.ok(after.includes(id), id);
  assert.ok(!after.includes('marketplaceDependentsMagi'));
  const review = usReturnReview(state, { taxYear: '2025' }).data;
  assert.ok(review.schedules.includes('8962'));
  assert.equal(review.lines.find((row) => row.form === 'Schedule 2' && row.line === '1a').amount, 1950);
  assert.equal(review.checks.find((item) => item.code === 'PTC_MFS_NOT_ALLOWED').step, 'interview');
  assert.equal(answerUsInterview(state, { taxYear: '2025', id: 'marketplaceAbuseException', answer: 'yes' }).ok, true);
  const relieved = usReturnReview(state, { taxYear: '2025' }).data;
  assert.equal(relieved.lines.find((row) => row.form === 'Schedule 3' && row.line === '9').amount, 1160);
});
