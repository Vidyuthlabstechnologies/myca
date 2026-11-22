import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeForm1040 } from '../src/us-1040.mjs';
import { buildMefSubmission, makeSubmissionId } from '../src/us-mef-xml.mjs';
import { form1040MefLines, scheduleMefDocuments, mefRelationshipCode, RELATIONSHIP_CODES, SCHEDULE_B_ELEMENTS, SCHEDULE_D_GROUPS, CAPITAL_TOTALS, FORM_8949_ELEMENTS, SCHEDULE_EIC_ELEMENTS, FORM_8995_ROW, FORM_8962_MONTHLY, FORM_2441_ROWS, FORM_8863_ROWS, SCHEDULE_E_PROPERTY, FORM_8582_WORKSHEETS, FORM_4562_PROPERTY, US_ADDRESS_ELEMENTS } from '../src/us-mef-map.mjs';
import { computedForm1040, computedForm1040ForFiling } from '../src/us-return.mjs';
import { partnerPrefill } from '../src/us-filing-partner.mjs';
import { signUsReturn } from '../src/us-efile.mjs';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

const STYLESHEET_ELEMENTS = JSON.parse(readFileSync(new URL('./fixtures/us-mef/stylesheet-elements.json', import.meta.url), 'utf8'));
const adult = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1988-04-02', ssn: '400011234' };
const ADDRESS = { line1: '12 Elm St', city: 'Austin', state: 'TX', zip: '78701' };
const w2 = (wages, withheld = 0) => ({ kind: 'W-2', owner: 'taxpayer', payer: 'Acme Inc', payerTin: '123456789', fields: { wages, federalWithheld: withheld, socialSecurityWages: wages, socialSecurityTax: Math.round(wages * 0.062), medicareWages: wages, medicareTax: Math.round(wages * 0.0145) } });
const OPTIONS = { efin: '123456', softwareId: '12345678', submissionId: makeSubmissionId('123456', '2026-02-10', 1), timestamp: '2026-02-10T15:00:00+00:00', signature: { taxpayer: { pin: '12345', priorYearAgi: 0 }, spouse: { pin: '54321', priorYearAgi: 0 }, date: '2026-02-10' } };

function shaped(input, taxYear) {
  const out = computeForm1040(input, taxYear);
  assert.equal(out.ok, true, JSON.stringify(out));
  const data = out.data;
  return {
    taxYear: data.taxYear,
    filingStatus: data.filingStatus,
    taxpayer: { ...input.taxpayer, dob: input.taxpayer.dateOfBirth },
    spouse: input.spouse ? { ...input.spouse, dob: input.spouse.dateOfBirth } : null,
    address: ADDRESS,
    dependents: (input.dependents || []).map((item, index) => ({ ...item, dob: item.dateOfBirth, ctcEligible: data.dependents[index].ctcEligible, odcEligible: data.dependents[index].odcEligible, eitcChild: data.dependents[index].eitcChild })),
    lines: data.lines,
    schedules: data.schedules,
    answers: input.answers || {},
    w2s: [],
  };
}

const build = (computed) => buildMefSubmission(computed, OPTIONS);
const docOf = (xml, element) => {
  const start = xml.indexOf(`<${element} documentId=`);
  return start < 0 ? '' : xml.slice(start, xml.indexOf(`</${element}>`, start) + element.length + 3);
};
const codes = (built) => (built.problems || []).map((item) => item.code);

const kids = [
  { firstName: 'Mia', lastName: 'Diaz', ssn: '400022345', relationship: 'foster_child', dateOfBirth: '2015-03-01', months: 12 },
  { firstName: 'Leo', lastName: 'Diaz', ssn: '400033456', relationship: 'son', dateOfBirth: '2018-09-12', months: 12 },
];

const flat = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(flat));

test('every MeF element MyCA writes appears in the IRS stylesheet for that tax year', () => {
  const missing = [];
  const check = (year, doc, path) => {
    const known = new Set(STYLESHEET_ELEMENTS[year][doc] || []);
    for (const part of String(path).split('/')) if (!known.has(part)) missing.push(`${year} ${doc} ${path}`);
  };
  const builderElements = {
    IRS1040ScheduleB: Object.values(SCHEDULE_B_ELEMENTS),
    IRS1040ScheduleD: [...Object.values(SCHEDULE_D_GROUPS), ...Object.values(CAPITAL_TOTALS), 'DisposeInvestmentQOFInd', 'STAndLTGainInd', 'ZeroOrBlankInd', 'QualifiedDividendsInd'],
    IRS8949: [FORM_8949_ELEMENTS.shortGroup, FORM_8949_ELEMENTS.longGroup, FORM_8949_ELEMENTS.asset, FORM_8949_ELEMENTS.description, FORM_8949_ELEMENTS.acquired, FORM_8949_ELEMENTS.sold, FORM_8949_ELEMENTS.proceeds, FORM_8949_ELEMENTS.basis, FORM_8949_ELEMENTS.code, FORM_8949_ELEMENTS.adjustment, FORM_8949_ELEMENTS.gain, ...Object.values(FORM_8949_ELEMENTS.boxIndicator), ...Object.values(CAPITAL_TOTALS)],
    IRS1040ScheduleEIC: Object.values(SCHEDULE_EIC_ELEMENTS),
    IRS8995: Object.values(FORM_8995_ROW),
    IRS8962: [FORM_8962_MONTHLY.month, ...Object.values(FORM_8962_MONTHLY.columns)],
    IRS2441: ['CareProviderGrp', 'QualifyingPersonGrp', 'Form1040AFiledInd', 'PersonFirstNm', 'PersonLastNm', ...flat(FORM_2441_ROWS), ...flat(US_ADDRESS_ELEMENTS)],
    IRS8863: ['StudentAndEducationalInstnGrp', 'PersonFirstNm', 'PersonLastNm', ...flat(FORM_8863_ROWS), ...flat(US_ADDRESS_ELEMENTS)],
    IRS1040ScheduleE: ['PropertyRealEstAndRoyaltyGroup', ...flat(SCHEDULE_E_PROPERTY), ...flat(US_ADDRESS_ELEMENTS)],
    IRS8582: flat(FORM_8582_WORKSHEETS),
    IRS4562: ['GeneralDepreciationSystem', ...flat(FORM_4562_PROPERTY)],
  };
  for (const year of ['2025', '2026']) {
    for (const element of Object.values(form1040MefLines(year))) check(year, 'IRS1040', element);
    for (const spec of Object.values(scheduleMefDocuments(year))) {
      if (!spec) continue;
      assert.ok(STYLESHEET_ELEMENTS[year][spec.element], `${year} ${spec.element} stylesheet`);
      for (const [line, element] of Object.entries(spec.lines)) if (!/^(box\.|q\d)/.test(line)) check(year, spec.element, element);
      for (const element of Object.values(spec.text || {})) check(year, spec.element, element);
      for (const element of Object.values(spec.person || {})) check(year, spec.element, element);
      for (const element of Object.values(spec.coverage || {})) check(year, spec.element, element);
      for (const element of builderElements[spec.element] || []) check(year, spec.element, element);
    }
  }
  assert.deepEqual(missing, []);
});

test('dependent relationships map to IRS DependentRelationshipCd values, so a foster child no longer stops the return', () => {
  assert.equal(mefRelationshipCode('foster_child'), 'FOSTER CHILD');
  assert.equal(mefRelationshipCode('half_brother'), 'HALF SISTER');
  assert.equal(mefRelationshipCode('stepsister'), 'STEPBROTHER');
  assert.equal(mefRelationshipCode('niece_nephew'), 'NEPHEW');
  assert.equal(mefRelationshipCode('niece'), 'NIECE');
  assert.equal(mefRelationshipCode('sibling'), 'SISTER');
  assert.equal(mefRelationshipCode('aunt'), 'UNCLE');
  assert.equal(mefRelationshipCode('in_law'), 'OTHER');
  assert.equal(mefRelationshipCode('Foster Child'), 'FOSTER CHILD');
  assert.equal(mefRelationshipCode('cousin'), '');
  for (const value of ['son', 'daughter', 'stepchild', 'foster_child', 'brother', 'sister', 'half_brother', 'half_sister', 'stepbrother', 'stepsister', 'grandchild', 'niece', 'nephew', 'sibling', 'niece_nephew', 'parent', 'grandparent', 'aunt', 'uncle', 'in_law', 'other']) assert.ok(RELATIONSHIP_CODES.has(mefRelationshipCode(value)), value);
});

test('head of household with a foster child and a son (2025): Schedule 8812 and Schedule EIC are built instead of refused', () => {
  const c = shaped({ filingStatus: 'hoh', taxpayer: adult, dependents: kids, forms: [w2(30000, 1200)] }, '2025');
  const built = build(c);
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  assert.ok(built.xml.includes('<DependentRelationshipCd>FOSTER CHILD</DependentRelationshipCd>'));
  const s8812 = docOf(built.xml, 'IRS1040Schedule8812');
  for (const piece of ['<AdjustedGrossIncomeAmt>30000</AdjustedGrossIncomeAmt>', '<QlfyChildUnderAgeSSNCnt>2</QlfyChildUnderAgeSSNCnt>', '<QlfyChildUnderAgeSSNLimtAmt>4400</QlfyChildUnderAgeSSNLimtAmt>', '<FilingStatusThresholdCd>200000</FilingStatusThresholdCd>', '<ACTCTaxLiabiltyLimitAmt>638</ACTCTaxLiabiltyLimitAmt>', '<CTCODCAmt>638</CTCODCAmt>', '<ClaimACTCAllFilersGrp><ACTCBeforeLimitAmt>3762</ACTCBeforeLimitAmt><QlfyChildUnderAgeSSNLimtAmt>3400</QlfyChildUnderAgeSSNLimtAmt><ACTCAfterLimitAmt>3400</ACTCAfterLimitAmt><TotalEarnedIncomeAmt>30000</TotalEarnedIncomeAmt><NetTotalEarnedIncomeAmt>27500</NetTotalEarnedIncomeAmt><NetEarnedIncomeCalculatedAmt>4125</NetEarnedIncomeCalculatedAmt></ClaimACTCAllFilersGrp><AdditionalChildTaxCreditAmt>3400</AdditionalChildTaxCreditAmt>']) assert.ok(s8812.includes(piece), piece);
  const eic = docOf(built.xml, 'IRS1040ScheduleEIC');
  assert.equal(eic.split('<QualifyingChildInformation>').length - 1, 2);
  assert.ok(eic.includes('<QualifyingChildInformation><ChildFirstAndLastName><PersonFirstNm>Mia</PersonFirstNm><PersonLastNm>Diaz</PersonLastNm></ChildFirstAndLastName><QualifyingChildNameControlTxt>DIAZ</QualifyingChildNameControlTxt><QualifyingChildSSN>400022345</QualifyingChildSSN><ChildBirthYr>2015</ChildBirthYr><ChildRelationshipCd>FOSTER CHILD</ChildRelationshipCd><MonthsChildLivedWithYouCnt>12</MonthsChildLivedWithYouCnt></QualifyingChildInformation>'));
  assert.ok(eic.includes('<ChildRelationshipCd>SON</ChildRelationshipCd>'));
  assert.ok(!eic.includes('ChildIsAStudentUnder24Ind'));
  assert.ok(built.xml.indexOf('<IRS1040Schedule8812') > built.xml.indexOf('</IRS1040>'));
});

test('a 20-year-old full-time student on Schedule EIC answers line 4a, and a non-student answers 4b', () => {
  const older = [{ firstName: 'Ava', lastName: 'Diaz', ssn: '400044567', relationship: 'daughter', dateOfBirth: '2005-05-05', months: 12, student: true }];
  const c = shaped({ filingStatus: 'hoh', taxpayer: adult, dependents: older, forms: [w2(25000, 0)] }, '2025');
  const built = build(c);
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  assert.ok(docOf(built.xml, 'IRS1040ScheduleEIC').includes('<ChildBirthYr>2005</ChildBirthYr><ChildIsAStudentUnder24Ind>true</ChildIsAStudentUnder24Ind><ChildRelationshipCd>DAUGHTER</ChildRelationshipCd>'));
  const disabled = build({ ...c, dependents: c.dependents.map((dep) => ({ ...dep, student: false, disabled: true })) });
  assert.ok(docOf(disabled.xml, 'IRS1040ScheduleEIC').includes('<ChildIsAStudentUnder24Ind>false</ChildIsAStudentUnder24Ind><ChildPermanentlyDisabledInd>true</ChildPermanentlyDisabledInd>'));
});

test('2026: Schedule 8812 is built from the 2026 stylesheet, Schedule EIC stays refused because the IRS 2026 EIC stylesheet holds Schedule 8812', () => {
  const c = shaped({ filingStatus: 'hoh', taxpayer: adult, dependents: kids, forms: [w2(30000, 1200)] }, '2026');
  const built = build(c);
  assert.deepEqual(codes(built), ['UNSUPPORTED_SCHEDULE']);
  assert.match(built.problems[0].message, /Schedule EIC/);
  const withoutEic = build({ ...c, schedules: { ...c.schedules, EIC: { qualifyingChildren: 2, credit: 0 } } });
  assert.equal(withoutEic.ok, true, JSON.stringify(withoutEic.problems));
  assert.ok(docOf(withoutEic.xml, 'IRS1040Schedule8812').includes('<QlfyChildUnderAgeSSNCnt>2</QlfyChildUnderAgeSSNCnt>'));
});

const investor = (answers) => ({
  filingStatus: 'single',
  taxpayer: adult,
  forms: [
    w2(60000, 6000),
    { kind: '1099-INT', payer: 'First Bank, N.A.', fields: { interest: 2000 } },
    { kind: '1099-DIV', payer: 'Vanguard', fields: { ordinaryDividends: 1800, qualifiedDividends: 1200, capitalGainDistributions: 300 } },
    { kind: '1099-B', payer: 'Broker', fields: { transactions: [
      { description: '10 sh XYZ', dateAcquired: '2025-01-10', dateSold: '2025-06-01', proceeds: 5000, costBasis: 4000, term: 'short', basisReportedToIrs: true },
      { description: '5 sh ABC', dateAcquired: '2020-01-10', dateSold: '2025-07-01', proceeds: 3000, costBasis: 3500, washSaleLossDisallowed: 100, term: 'long', basisReportedToIrs: false },
    ] } },
  ],
  answers,
});

test('Schedule B lists each payer and answers Part III; Schedule D and Form 8949 carry the box totals and each sale', () => {
  const c = shaped(investor({ foreignAccounts: false, foreignTrust: false, qofDisposition: false }), '2025');
  const built = build(c);
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  assert.equal(docOf(built.xml, 'IRS1040ScheduleB'), '<IRS1040ScheduleB documentId="IRS1040ScheduleB"><Form1040SchBPartIGroup2><InterestPayerName><BusinessNameLine1Txt>First Bank N A</BusinessNameLine1Txt></InterestPayerName><InterestAmt>2000</InterestAmt></Form1040SchBPartIGroup2><TaxableInterestSubtotalAmt>2000</TaxableInterestSubtotalAmt><CalculatedTotalTaxableIntAmt>2000</CalculatedTotalTaxableIntAmt><Form1040SchBPartII><DividendPayerNameBusiness><BusinessNameLine1Txt>Vanguard</BusinessNameLine1Txt></DividendPayerNameBusiness><DividendAmt>1800</DividendAmt></Form1040SchBPartII><TotalOrdinaryDividendsAmt>1800</TotalOrdinaryDividendsAmt><ForeignAccountsQuestionInd>false</ForeignAccountsQuestionInd><ForeignTrustQuestionInd>false</ForeignTrustQuestionInd></IRS1040ScheduleB>');
  const shortGain = 5000 - 4000;
  const longGain = 3000 - 3500 + 100;
  const line15 = longGain + 300;
  const line16 = shortGain + line15;
  const d = docOf(built.xml, 'IRS1040ScheduleD');
  assert.ok(d.startsWith('<IRS1040ScheduleD documentId="IRS1040ScheduleD"><DisposeInvestmentQOFInd>false</DisposeInvestmentQOFInd><TotalSTCGL1099BShowsBasisGrp><TotalProceedsSalesPriceAmt>5000</TotalProceedsSalesPriceAmt><TotalCostOrOtherBasisAmt>4000</TotalCostOrOtherBasisAmt><TotalGainOrLossAmt>1000</TotalGainOrLossAmt></TotalSTCGL1099BShowsBasisGrp>'), d);
  for (const piece of [`<NetSTCapitalGainOrLossAmt>${shortGain}</NetSTCapitalGainOrLossAmt>`, `<TotalLTCGL1099BNotShowBasisGrp><TotalProceedsSalesPriceAmt>3000</TotalProceedsSalesPriceAmt><TotalCostOrOtherBasisAmt>3500</TotalCostOrOtherBasisAmt><TotAdjustmentsToGainOrLossAmt>100</TotAdjustmentsToGainOrLossAmt><TotalGainOrLossAmt>${longGain}</TotalGainOrLossAmt></TotalLTCGL1099BNotShowBasisGrp>`, '<CapitalGainDistributionsAmt>300</CapitalGainDistributionsAmt>', `<NetLTCapitalGainOrLossAmt>${line15}</NetLTCapitalGainOrLossAmt><NetSTAndLTCapitalGainOrLossAmt>${line16}</NetSTAndLTCapitalGainOrLossAmt><STAndLTGainInd>false</STAndLTGainInd><QualifiedDividendsInd>true</QualifiedDividendsInd>`]) assert.ok(d.includes(piece), piece);
  const f8949 = docOf(built.xml, 'IRS8949');
  assert.ok(f8949.includes('<ShortTermCapitalGainAndLossGrp><TransRptOn1099BThatShowBssInd>X</TransRptOn1099BThatShowBssInd><CapitalGainAndLossAssetGrp><PropertyDesc>10 sh XYZ</PropertyDesc><AcquiredDt>2025-01-10</AcquiredDt><SoldOrDisposedDt>2025-06-01</SoldOrDisposedDt><ProceedsSalesPriceAmt>5000</ProceedsSalesPriceAmt><CostOrOtherBasisAmt>4000</CostOrOtherBasisAmt><GainOrLossAmt>1000</GainOrLossAmt></CapitalGainAndLossAssetGrp><TotalProceedsSalesPriceAmt>5000</TotalProceedsSalesPriceAmt>'));
  assert.ok(f8949.includes(`<LongTermCapitalGainAndLossGrp><TransRptOn1099BNotShowBasisInd>X</TransRptOn1099BNotShowBasisInd><CapitalGainAndLossAssetGrp><PropertyDesc>5 sh ABC</PropertyDesc><AcquiredDt>2020-01-10</AcquiredDt><SoldOrDisposedDt>2025-07-01</SoldOrDisposedDt><ProceedsSalesPriceAmt>3000</ProceedsSalesPriceAmt><CostOrOtherBasisAmt>3500</CostOrOtherBasisAmt><AdjustmentsToGainOrLossCd>W</AdjustmentsToGainOrLossCd><AdjustmentsToGainOrLossAmt>100</AdjustmentsToGainOrLossAmt><GainOrLossAmt>${longGain}</GainOrLossAmt></CapitalGainAndLossAssetGrp>`));
  assert.equal(build(shaped(investor({ foreignAccounts: false, foreignTrust: false, qofDisposition: false }), '2026')).ok, true);
});

test('Schedule D loss: carryovers go in as positive amounts and line 21 is the capped loss', () => {
  const input = { filingStatus: 'single', taxpayer: adult, forms: [w2(60000, 6000), { kind: '1099-B', payer: 'Broker', fields: { description: '100 sh LOSS', dateAcquired: '2025-02-01', dateSold: '2025-08-01', proceeds: 1000, costBasis: 9000, term: 'short', basisReportedToIrs: true } }], answers: { qofDisposition: false, longTermLossCarryover: 500 } };
  const built = build(shaped(input, '2025'));
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  const d = docOf(built.xml, 'IRS1040ScheduleD');
  const line7 = 1000 - 9000;
  const line16 = line7 - 500;
  assert.ok(d.includes(`<NetSTCapitalGainOrLossAmt>${line7}</NetSTCapitalGainOrLossAmt>`));
  assert.ok(d.includes('<LTCapitalLossCarryoverAmt>500</LTCapitalLossCarryoverAmt><NetLTCapitalGainOrLossAmt>-500</NetLTCapitalGainOrLossAmt>'));
  assert.ok(d.includes(`<NetSTAndLTCapitalGainOrLossAmt>${line16}</NetSTAndLTCapitalGainOrLossAmt><AllowableLossAmt>3000</AllowableLossAmt><QualifiedDividendsInd>false</QualifiedDividendsInd>`));
});

test('Schedule B Part III and the Schedule D opportunity fund question must be answered; a foreign account or a QOF sale is refused', () => {
  const unanswered = build(shaped(investor({}), '2025'));
  assert.deepEqual(codes(unanswered).sort(), ['SCHEDULE_B_PART_III_UNANSWERED', 'SCHEDULE_D_QOF_UNANSWERED']);
  assert.ok(unanswered.problems.every((item) => item.step === 'interview'));
  const foreign = build(shaped(investor({ foreignAccounts: true, foreignTrust: false, qofDisposition: true }), '2025'));
  assert.deepEqual(codes(foreign).sort(), ['FORM_8997_NOT_COVERED', 'SCHEDULE_B_FOREIGN_ACCOUNTS_NOT_COVERED']);
  const c = shaped(investor({ foreignAccounts: false, foreignTrust: false, qofDisposition: false }), '2025');
  const noDate = build({ ...c, schedules: { ...c.schedules, 8949: c.schedules[8949].map((row) => ({ ...row, dateAcquired: '' })) } });
  assert.deepEqual([...new Set(codes(noDate))], ['FORM_8949_DATE_ACQUIRED_MISSING']);
});

test('self-employment: Schedule C, SE and Form 8995 are built, with the owner SSN on SE and on 8995 line 1 (2025 and 2026)', () => {
  const input = { filingStatus: 'single', taxpayer: adult, forms: [{ kind: '1099-NEC', payer: 'Client', fields: { nonemployeeCompensation: 40000 } }], answers: { qbiMaterialParticipation: true } };
  const built = build(shaped(input, '2025'));
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  const f8995 = docOf(built.xml, 'IRS8995');
  assert.ok(f8995.startsWith('<IRS8995 documentId="IRS8995"><QualifiedBusinessIncomeDedGrp><TradeOrBusinessName><BusinessNameLine1Txt>Contract work (1099-NEC)</BusinessNameLine1Txt></TradeOrBusinessName><SSN>400011234</SSN><QlfyBusinessIncomeOrLossAmt>37174</QlfyBusinessIncomeOrLossAmt></QualifiedBusinessIncomeDedGrp><TotQlfyBusinessIncomeOrLossAmt>37174</TotQlfyBusinessIncomeOrLossAmt>'), f8995);
  assert.ok(f8995.includes(`<QBIComponentAmt>${Math.round(37174 * 0.2)}</QBIComponentAmt>`));
  assert.ok(f8995.includes('<IncomeLimitationAmt>4285</IncomeLimitationAmt><QualifiedBusinessIncomeDedAmt>4285</QualifiedBusinessIncomeDedAmt></IRS8995>'));
  assert.ok(docOf(built.xml, 'IRS1040ScheduleSE').includes('<PersonNm>Ana Diaz</PersonNm><SSN>400011234</SSN><NetNonFarmProfitLossAmt>40000</NetNonFarmProfitLossAmt><MinimumProfitForSETaxAmt>36940</MinimumProfitForSETaxAmt>'));
  assert.ok(!docOf(built.xml, 'IRS1040ScheduleSE').includes('176100</MaximumSocSecWagesAmt>'));
  assert.ok(docOf(built.xml, 'IRS1040ScheduleC').includes('<GrossIncomeAmt>40000</GrossIncomeAmt>'));
  const next = build(shaped(input, '2026'));
  assert.equal(next.ok, true, JSON.stringify(next.problems));
  assert.ok(docOf(next.xml, 'IRS8995').includes('<QBIDedBeforeMinimumDedAmt>4215</QBIDedBeforeMinimumDedAmt><MinDedActiveQlfyBusIncomeAmt>400</MinDedActiveQlfyBusIncomeAmt><QualifiedBusinessIncomeDedAmt>4215</QualifiedBusinessIncomeDedAmt>'));
});

const handmade = (taxYear, schedules, extra = {}) => ({
  taxYear,
  filingStatus: extra.filingStatus || 'single',
  taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400011234' },
  spouse: extra.spouse || null,
  address: ADDRESS,
  dependents: [],
  lines: { '1a': 50000, '1z': 50000, '9': 50000, '11a': 50000, ...(extra.lines || {}) },
  schedules,
  w2s: [],
});

test('Schedule 1-A totals and Schedule 2 line 8 (2025) and lines 5 and 18 (2026) have MeF elements now', () => {
  const y2025 = build(handmade(2025, { '1-A': { 13: 4000, 21: 3000, 30: 2000, 37: 6000, 38: 15000 }, 2: { 8: 700, 18: 700, 21: 700 } }));
  assert.equal(y2025.ok, true, JSON.stringify(y2025.problems));
  assert.ok(docOf(y2025.xml, 'IRS1040Schedule1A').includes('<QualifiedTipsDeductionAmt>4000</QualifiedTipsDeductionAmt><QualifiedOvertimeCompDedAmt>3000</QualifiedOvertimeCompDedAmt><QualifiedCarLoanInterestDedAmt>2000</QualifiedCarLoanInterestDedAmt><EnhancedSeniorDeductionAmt>6000</EnhancedSeniorDeductionAmt><TotalAdditionalDeductionsAmt>15000</TotalAdditionalDeductionsAmt>'));
  assert.ok(docOf(y2025.xml, 'IRS1040Schedule2').includes('<TaxOnIRAsAmt>700</TaxOnIRAsAmt><TotalOtherAdditionalTaxesAmt>700</TotalOtherAdditionalTaxesAmt><TotalOtherTaxesAmt>700</TotalOtherTaxesAmt>'));
  const y2026 = build(handmade(2026, { '1-A': { 15: 4000, 36: 2000, 44: 6000 }, 2: { 5: 300, 14: 300, 15: 300, 18: 60, 20: 60, 21: 360 } }, { lines: { '12f': 1000, '24a': 360, '24c': 360 } }));
  assert.equal(y2026.ok, true, JSON.stringify(y2026.problems));
  assert.ok(docOf(y2026.xml, 'IRS1040Schedule1A').includes('<QualifiedTipsDeductionAmt>4000</QualifiedTipsDeductionAmt><NoTaxCarLoanInterestGrp><QualifiedCarLoanInterestDedAmt>2000</QualifiedCarLoanInterestDedAmt></NoTaxCarLoanInterestGrp><TotalAdditionalDeductionsAmt>6000</TotalAdditionalDeductionsAmt>'));
  assert.ok(docOf(y2026.xml, 'IRS1040Schedule2').includes('<TotAddnlTaxDistributionsAmt>300</TotAddnlTaxDistributionsAmt><TotOthAdditionalIncomeTaxesAmt>300</TotOthAdditionalIncomeTaxesAmt><SumAdditionalIncomeTaxesAmt>300</SumAdditionalIncomeTaxesAmt><TotAddnlTaxExContributionsAmt>60</TotAddnlTaxExContributionsAmt><TotAddnlEmplmnOtherTxsAmt>60</TotAddnlEmplmnOtherTxsAmt><TotalAdditionalTaxesAmt>360</TotalAdditionalTaxesAmt>'));
  assert.ok(docOf(y2026.xml, 'IRS1040').includes('<CharitableContributionAmt>1000</CharitableContributionAmt>'));
  assert.ok(docOf(y2026.xml, 'IRS1040').includes('<TotalTaxAmt>360</TotalTaxAmt><TotalTaxAfter1062TaxAmt>360</TotalTaxAfter1062TaxAmt>'));
});

test('Form 1040 amounts follow the form order, not JavaScript key order', () => {
  const built = build(handmade(2025, {}));
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  const xml = docOf(built.xml, 'IRS1040');
  assert.ok(xml.indexOf('<WagesAmt>') < xml.indexOf('<WagesSalariesAndTipsAmt>'));
  assert.ok(xml.indexOf('<WagesSalariesAndTipsAmt>') < xml.indexOf('<TotalIncomeAmt>'));
  assert.ok(xml.indexOf('<TotalIncomeAmt>') < xml.indexOf('<AdjustedGrossIncomeAmt>'));
});

test('Form 8889 per owner, Form 8880 with both columns and Form 8962 annual and monthly are built', () => {
  const f8889 = { owner: 'spouse', lines: { 1: 'family', 2: 5000, 3: 8550, 5: 8550, 6: 8550, 8: 8550, 9: 1000, 11: 1000, 12: 7550, 13: 5000, '14a': 2000, '14c': 2000, 15: 2000, 16: 0, '17a': false, '17b': 0, 18: 0, 19: 0, 20: 0, 21: 0 } };
  const f8880 = { a: { 1: 2000, 2: 0, 3: 2000, 4: 0, 5: 2000, 6: 2000 }, b: { 1: 0, 2: 1000, 3: 1000, 4: 0, 5: 1000, 6: 1000 }, 7: 3000, 8: 45000, 9: 0.5, 10: 1500, 11: 2400, 12: 1500 };
  const annual = { A: false, 1: 2, '2a': 40000, '2b': 0, 3: 40000, 4: 21150, povertyTable: 'contiguous', 5: 189, 7: 0.0332, '8a': 1328, '8b': 111, 9: 'no', 10: 'yes', 11: { a: 6000, b: 7200, c: 1328, d: 5872, e: 5872, f: 5000 }, 24: 5872, 25: 5000, 26: 872, method: 'annual', applicable: true };
  const spouse = { firstName: 'Ravi', lastName: 'Diaz', ssn: '400025678' };
  const built = build(handmade(2025, { 8889: [f8889], 8880: f8880, 8962: annual }, { filingStatus: 'mfj', spouse }));
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  assert.ok(docOf(built.xml, 'IRS8889').startsWith('<IRS8889 documentId="IRS8889-1"><PersonNm>Ravi Diaz</PersonNm><RecipientSSN>400025678</RecipientSSN><HDHPFamilyCoverageInd>X</HDHPFamilyCoverageInd><HSAContributionAmt>5000</HSAContributionAmt>'));
  assert.ok(docOf(built.xml, 'IRS8889').includes('<TotalHSADeductionAmt>5000</TotalHSADeductionAmt><TotalHSADistributionAmt>2000</TotalHSADistributionAmt><HSANetDistributionAmt>2000</HSANetDistributionAmt><UnreimbQualMedAndDentalExpAmt>2000</UnreimbQualMedAndDentalExpAmt></IRS8889>'));
  assert.equal(docOf(built.xml, 'IRS8880'), '<IRS8880 documentId="IRS8880"><PrimaryRothIRAForCurrentYrAmt>2000</PrimaryRothIRAForCurrentYrAmt><SpouseContributionsAmt>1000</SpouseContributionsAmt><AddPrimRothIRAToCYContriAmt>2000</AddPrimRothIRAToCYContriAmt><AddSpRothIRAToCYContriAmt>1000</AddSpRothIRAToCYContriAmt><CalculatePrimDistribFromTotAmt>2000</CalculatePrimDistribFromTotAmt><CalculateSpsDistribFromTotAmt>1000</CalculateSpsDistribFromTotAmt><PrimSmallerOfCalculationAmt>2000</PrimSmallerOfCalculationAmt><SpsSmallerOfCalculationAmt>1000</SpsSmallerOfCalculationAmt><TotalCalculatedAmt>3000</TotalCalculatedAmt><QlfyRetirementSavDecimalAmt>0.5</QlfyRetirementSavDecimalAmt><CalculatedAmtByDecimalAmt>1500</CalculatedAmtByDecimalAmt><CalculatedCreditsFromTaxAmt>2400</CalculatedCreditsFromTaxAmt><CrQualifiedRetirementSavAmt>1500</CrQualifiedRetirementSavAmt></IRS8880>');
  assert.equal(docOf(built.xml, 'IRS8962'), '<IRS8962 documentId="IRS8962"><TotalExemptionsCnt>2</TotalExemptionsCnt><ModifiedAGIAmt>40000</ModifiedAGIAmt><HouseholdIncomeAmt>40000</HouseholdIncomeAmt><FederalPovertyTableLocCd>C</FederalPovertyTableLocCd><PovertyLevelAmt>21150</PovertyLevelAmt><FederalPovertyLevelPct>189</FederalPovertyLevelPct><ApplicableFigureRt>0.0332</ApplicableFigureRt><AnnualContributionAmt>1328</AnnualContributionAmt><MonthlyContriHealthCareCvrAmt>111</MonthlyContriHealthCareCvrAmt><SharePolicyMarriedAltCalcInd>false</SharePolicyMarriedAltCalcInd><FullYrCoverage1095AInd>true</FullYrCoverage1095AInd><AnnualPTCCalculationGrp><AnnualPremiumAmt>6000</AnnualPremiumAmt><AnnualPremiumSLCSPAmt>7200</AnnualPremiumSLCSPAmt><AnnualContributionAmt>1328</AnnualContributionAmt><AnnualMaxPremiumAssistanceAmt>5872</AnnualMaxPremiumAssistanceAmt><AnnualPremiumTaxCreditAllwAmt>5872</AnnualPremiumTaxCreditAllwAmt><AnnualAdvancedPTCAmt>5000</AnnualAdvancedPTCAmt></AnnualPTCCalculationGrp><TotalPremiumTaxCreditAmt>5872</TotalPremiumTaxCreditAmt><TotalAdvancedPTCAmt>5000</TotalAdvancedPTCAmt><ReconciledPremiumTaxCreditAmt>872</ReconciledPremiumTaxCreditAmt></IRS8962>');
  const monthly = { A: false, 1: 1, '2a': 30000, 3: 30000, 4: 15650, povertyTable: 'alaska', 5: 192, 6: 'no', 7: 0.04, '8a': 1200, '8b': 100, 9: 'no', 10: 'no', 12: { month: 'January', a: 500, b: 600, c: 100, d: 500, e: 500, f: 450 }, 13: { month: 'February', a: 500, b: 600, c: 100, d: 500, e: 500, f: 450 }, 24: 1000, 25: 900, 26: 100, method: 'monthly', applicable: true };
  const next = build(handmade(2026, { 8962: monthly }));
  assert.equal(next.ok, true, JSON.stringify(next.problems));
  assert.ok(docOf(next.xml, 'IRS8962').includes('<FederalPovertyTableLocCd>A</FederalPovertyTableLocCd><PovertyLevelAmt>15650</PovertyLevelAmt><FederalPovertyLevelPct>192</FederalPovertyLevelPct><FederalPovertyLevelPct401Ind>false</FederalPovertyLevelPct401Ind>'));
  assert.ok(docOf(next.xml, 'IRS8962').includes('<FullYrCoverage1095AInd>false</FullYrCoverage1095AInd><MonthlyPTCCalculationGrp><MonthCd>JANUARY</MonthCd><MonthlyPremiumAmt>500</MonthlyPremiumAmt><MonthlyPremiumSLCSPAmt>600</MonthlyPremiumSLCSPAmt><MonthlyContributionAmt>100</MonthlyContributionAmt><MonthlyMaxPremiumAssistanceAmt>500</MonthlyMaxPremiumAssistanceAmt><MonthlyPremiumTaxCreditAllwAmt>500</MonthlyPremiumTaxCreditAllwAmt><MonthlyAdvancedPTCAmt>450</MonthlyAdvancedPTCAmt></MonthlyPTCCalculationGrp><MonthlyPTCCalculationGrp><MonthCd>FEBRUARY</MonthCd>'));
  const repaid = build(handmade(2025, { 8962: { ...annual, 26: undefined, 25: 7000, 27: 1128, 28: 1050, 29: 1050 } }));
  assert.ok(docOf(repaid.xml, 'IRS8962').includes('<ExcessAdvncPaymentAmt>1128</ExcessAdvncPaymentAmt><AdditionalTaxLimitationAmt>1050</AdditionalTaxLimitationAmt><PremiumTaxCreditTaxLiabAmt>1050</PremiumTaxCreditTaxLiabAmt>'));
  assert.deepEqual(codes(build(handmade(2026, { 8962: { ...monthly, 28: 500 } }))), ['UNMAPPED_LINE']);
});

test('signing a return with Schedules B, D, 8812 and EIC, Form 8949 and a foster child goes through the real engine without a refusal', async () => {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'hoh', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-01-1234', dateOfBirth: '1988-04-02', occupation: 'Nurse' }, dependents: kids.map(({ ssn, ...kid }) => ({ ...kid, ssn: `${ssn.slice(0, 3)}-${ssn.slice(3, 5)}-${ssn.slice(5)}` })), address: ADDRESS });
  assert.equal(set.ok, true, JSON.stringify(set));
  for (const form of [w2(30000, 1200), { kind: '1099-INT', payer: 'First Bank', fields: { interest: 1600 } }, { kind: '1099-B', payer: 'Broker', fields: { description: '10 sh XYZ', dateAcquired: '2024-01-10', dateSold: '2025-06-01', proceeds: 2000, costBasis: 1500, term: 'long', basisReportedToIrs: true } }]) {
    const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: form.kind, payer: form.payer, ...(form.payerTin ? { payerTin: form.payerTin } : {}), fields: form.fields });
    assert.equal(added.ok, true, JSON.stringify(added));
  }
  const interview = await runTool(state, 'us_interview', { taxYear: '2025' });
  const ids = interview.data.questions.map((question) => question.id);
  for (const id of ['foreignAccounts', 'foreignTrust', 'qofDisposition']) assert.ok(ids.includes(id), id);
  const refused = await signUsReturn(state, { taxYear: 2025, taxpayerPin: '12345', priorYear: { taxpayer: { agi: 28000 } }, consent8879: true, refund: { method: 'direct_deposit', routing: '021000021', account: '000123456789', accountType: 'checking' } });
  assert.equal(refused.error, 'RETURN_NOT_READY');
  assert.deepEqual(refused.problems.map((item) => item.code).sort(), ['SCHEDULE_B_PART_III_UNANSWERED', 'SCHEDULE_D_QOF_UNANSWERED']);
  for (const id of ['foreignAccounts', 'foreignTrust', 'qofDisposition']) assert.equal((await runTool(state, 'answer_us_interview', { taxYear: '2025', id, answer: false })).ok, true);
  const signed = await signUsReturn(state, { taxYear: 2025, taxpayerPin: '12345', priorYear: { taxpayer: { agi: 28000 } }, consent8879: true, refund: { method: 'direct_deposit', routing: '021000021', account: '000123456789', accountType: 'checking' } });
  assert.equal(signed.ok, true, JSON.stringify(signed));
});

test('forms whose MeF data MyCA does not hold yet are still refused by name', () => {
  const built = build(handmade(2025, { 5695: { 1: 100 } }));
  assert.deepEqual(codes(built), ['UNSUPPORTED_SCHEDULE']);
  assert.match(built.problems[0].message, /Schedule 5695 /);
  assert.deepEqual(codes(build(handmade(2026, { 5695: { 1: 100 } }))), ['UNSUPPORTED_SCHEDULE']);
});

const elementNames = (xml) => [...xml.matchAll(/<([A-Za-z0-9]+)[ >]/g)].map((match) => match[1]);
const unknownElements = (year, element, xml) => {
  const known = new Set(STYLESHEET_ELEMENTS[year][element] || []);
  return [...new Set(elementNames(xml).slice(1))].filter((name) => !known.has(name));
};
const inOrder = (xml, names) => names.every((name, index) => index === 0 || xml.indexOf(`<${names[index - 1]}>`) < xml.indexOf(`<${name}>`));
const builtFor = (input, year, elements) => {
  const built = build(shaped(input, year));
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  return Object.fromEntries(elements.map((element) => {
    const xml = docOf(built.xml, element);
    assert.ok(xml, `${year} ${element}`);
    assert.deepEqual(unknownElements(String(year), element, xml), [], `${year} ${element}`);
    return [element, xml];
  }));
};
const spouse = { firstName: 'Ravi', lastName: 'Diaz', dateOfBirth: '1987-01-05', ssn: '400025678' };
const mia = { firstName: 'Mia', lastName: 'Diaz', ssn: '400022345', relationship: 'daughter', dateOfBirth: '2019-03-01', months: 12 };
const careProvider = (payer, fields, payerTin) => ({ kind: '2441-PROVIDER', owner: 'taxpayer', payer, ...(payerTin ? { payerTin } : {}), fields: { qualifyingPerson: 'Mia', providerCity: 'Austin', providerState: 'TX', ...fields } });
const careReturn = (providers) => ({ taxpayer: adult, filingStatus: 'mfj', spouse, dependents: [mia], forms: [w2(60000, 5000), { ...w2(30000, 2000), owner: 'spouse' }, ...providers] });
const daycare = careProvider('Little Oaks Daycare', { amountPaid: 5000, providerAddress: '5 Oak St', providerZip: '78702' }, '12-3456789');
const sitter = careProvider('Jo Smith', { amountPaid: 1000, providerSsn: '400055555', providerAddress: '7 Elm St', providerZip: '78703' });
const tuition = (fields) => ({ kind: '1098-T', payer: 'State College', payerTin: '12-3456780', fields: { studentName: 'Ana', tuitionPaid: 4000, atLeastHalfTime: true, schoolAddress: '1 College Ave', schoolCity: 'Austin', schoolState: 'TX', schoolZip: '78705', priorYear1098T: true, ...fields } });
const rental = (year, fields = {}) => ({ id: 'r1', kind: 'Rental property', owner: 'taxpayer', payer: '1 Main St, Austin, TX 78701', fields: { propertyType: 1, fairRentalDays: 365, activeParticipation: true, rents: 10000, mortgageInterest: 12000, taxes: 2000, costBasis: 300000, landValue: 50000, placedInService: `${year}-03-10`, recoveryClass: 'residential', ...fields } });

test('Schedule A is built from the engine, with the 2026 charity floor and itemized limit indicator', () => {
  const modest = { taxpayer: adult, filingStatus: 'single', forms: [w2(150000, 20000), { kind: '1098', payer: 'Bank', fields: { mortgageInterest: 15000, propertyTax: 6000 } }], answers: { charityCash: 3000, medicalExpenses: 20000 } };
  const y2025 = builtFor(modest, '2025', ['IRS1040ScheduleA']).IRS1040ScheduleA;
  assert.equal(y2025, '<IRS1040ScheduleA documentId="IRS1040ScheduleA"><MedicalAndDentalExpensesAmt>20000</MedicalAndDentalExpensesAmt><TaxReturnAGIAmt>150000</TaxReturnAGIAmt><CalculatedMedicalAllowanceAmt>11250</CalculatedMedicalAllowanceAmt><TotalMedicalAndDentalExpnssAmt>8750</TotalMedicalAndDentalExpnssAmt><RealEstateTaxesAmt>6000</RealEstateTaxesAmt><TotalStateAndLocalTaxAmt>6000</TotalStateAndLocalTaxAmt><StateAndLocalTaxLimitationAmt>6000</StateAndLocalTaxLimitationAmt><TotalTaxesPaidAmt>6000</TotalTaxesPaidAmt><RptHomeMortgIntAndPointsAmt>15000</RptHomeMortgIntAndPointsAmt><TotalHomeMortgIntAndPointsAmt>15000</TotalHomeMortgIntAndPointsAmt><TotalInterestPaidAmt>15000</TotalInterestPaidAmt><GiftsByCashOrCheckAmt>3000</GiftsByCashOrCheckAmt><TotalCharitableContriAmt>3000</TotalCharitableContriAmt><TotalItemizedDeductionsAmt>32750</TotalItemizedDeductionsAmt></IRS1040ScheduleA>');
  const y2026 = builtFor(modest, '2026', ['IRS1040ScheduleA']).IRS1040ScheduleA;
  assert.ok(y2026.includes('<GiftsByCashOrCheckAmt>3000</GiftsByCashOrCheckAmt><CharitableContributionDedAmt>2250</CharitableContributionDedAmt><TotalCharitableContriAmt>2250</TotalCharitableContriAmt><ItemizedDeductionsLimitedInd>false</ItemizedDeductionsLimitedInd><TotalItemizedDeductionsAmt>32000</TotalItemizedDeductionsAmt>'));
  const high = { taxpayer: adult, filingStatus: 'single', forms: [w2(700000, 150000), { kind: '1098', payer: 'Bank', fields: { mortgageInterest: 30000, propertyTax: 6000 } }], answers: { charityCash: 20000 } };
  assert.ok(builtFor(high, '2026', ['IRS1040ScheduleA']).IRS1040ScheduleA.includes('<ItemizedDeductionsLimitedInd>true</ItemizedDeductionsLimitedInd><TotalItemizedDeductionsAmt>49662</TotalItemizedDeductionsAmt>'));
});

test('Form 2441 lists a business provider by EIN and an individual by SSN, with the child linked to the dependent', () => {
  for (const [year, rate, credit] of [['2025', '0.2', 600], ['2026', '0.35', 1050]]) {
    const xml = builtFor(careReturn([daycare, sitter]), year, ['IRS2441']).IRS2441;
    assert.ok(xml.startsWith('<IRS2441 documentId="IRS2441"><CareProviderGrp><CareProviderBusinessName><BusinessNameLine1Txt>Little Oaks Daycare</BusinessNameLine1Txt></CareProviderBusinessName><CareProviderBusNameControlTxt>LITT</CareProviderBusNameControlTxt><USAddress><AddressLine1Txt>5 Oak St</AddressLine1Txt><CityNm>Austin</CityNm><StateAbbreviationCd>TX</StateAbbreviationCd><ZIPCd>78702</ZIPCd></USAddress><EIN>123456789</EIN><HouseholdEmployeeInd>false</HouseholdEmployeeInd><PaidAmt>5000</PaidAmt></CareProviderGrp>'), year);
    assert.ok(xml.includes('<CareProviderGrp><CareProviderPersonName><PersonFirstNm>Jo</PersonFirstNm><PersonLastNm>Smith</PersonLastNm></CareProviderPersonName><CareProviderNameControlTxt>SMIT</CareProviderNameControlTxt><USAddress><AddressLine1Txt>7 Elm St</AddressLine1Txt><CityNm>Austin</CityNm><StateAbbreviationCd>TX</StateAbbreviationCd><ZIPCd>78703</ZIPCd></USAddress><SSN>400055555</SSN><HouseholdEmployeeInd>false</HouseholdEmployeeInd><PaidAmt>1000</PaidAmt></CareProviderGrp>'), year);
    assert.ok(xml.includes('<QualifyingPersonGrp><QualifyingPersonName><PersonFirstNm>Mia</PersonFirstNm><PersonLastNm>Diaz</PersonLastNm></QualifyingPersonName><QualifyingPersonNameControlTxt>DIAZ</QualifyingPersonNameControlTxt><QualifyingPersonSSN>400022345</QualifyingPersonSSN><QualifiedCareExpensesPaidAmt>6000</QualifiedCareExpensesPaidAmt></QualifyingPersonGrp><TotalQlfdExpensesOrLimitAmt>3000</TotalQlfdExpensesOrLimitAmt><PrimaryEarnedIncomeAmt>60000</PrimaryEarnedIncomeAmt><SpouseEarnedIncomeAmt>30000</SpouseEarnedIncomeAmt>'), year);
    assert.ok(xml.includes(`<CareExpensesDecimalAmt>${rate}</CareExpensesDecimalAmt><CalculatedTentativeExpenseAmt>${credit}</CalculatedTentativeExpenseAmt>`), year);
    assert.ok(xml.endsWith(`<CreditForChildAndDepdCareAmt>${credit}</CreditForChildAndDepdCareAmt></IRS2441>`), year);
  }
});

test('Form 2441 is refused at signing only when the provider address, TIN or person cared for is missing', () => {
  const bare = careProvider('Jo Smith', { amountPaid: 1000, qualifyingPerson: undefined });
  const built = build(shaped(careReturn([bare]), '2025'));
  assert.deepEqual(codes(built).sort(), ['CARE_PROVIDER_ADDRESS_MISSING', 'CARE_PROVIDER_TIN_MISSING']);
  assert.ok(built.problems.every((item) => item.step === 'forms' && item.fix));
  const leo = { ...mia, firstName: 'Leo', ssn: '400033456', relationship: 'son', dateOfBirth: '2020-09-12' };
  const twoKids = build(shaped({ ...careReturn([{ ...daycare, fields: { ...daycare.fields, qualifyingPerson: undefined } }]), dependents: [mia, leo] }, '2025'));
  assert.deepEqual(codes(twoKids), ['CARE_PERSON_NOT_NAMED']);
});

test('Form 8863 Part III carries the student, the school from the 1098-T and the answers, in 2025 and 2026', () => {
  for (const year of ['2025', '2026']) {
    const xml = builtFor({ taxpayer: adult, filingStatus: 'single', forms: [w2(60000, 5000), tuition({})] }, year, ['IRS8863']).IRS8863;
    assert.ok(xml.startsWith('<IRS8863 documentId="IRS8863"><RefundableAmerOppCreditGroup><TentativeAmerOppCreditAmt>2500</TentativeAmerOppCreditAmt><EnterSpecifiedAmountForFSAmt>90000</EnterSpecifiedAmountForFSAmt><ModifiedAGIAmt>60000</ModifiedAGIAmt><SubtractAGIFromAmt>30000</SubtractAGIFromAmt><SpecifiedAmtPerFSAmt>10000</SpecifiedAmtPerFSAmt><CalcTentativeEducationRt>1.000</CalcTentativeEducationRt><CalcTentativeEducationCrAmt>2500</CalcTentativeEducationCrAmt><RefundableAmerOppCreditAmt>1000</RefundableAmerOppCreditAmt></RefundableAmerOppCreditGroup>'), year);
    assert.ok(xml.includes('<StudentAndEducationalInstnGrp><StudentName><PersonFirstNm>Ana</PersonFirstNm><PersonLastNm>Diaz</PersonLastNm></StudentName><StudentNameControlTxt>DIAZ</StudentNameControlTxt><StudentSSN>400011234</StudentSSN><EducationalInstitutionGroup><InstitutionName><BusinessNameLine1Txt>State College</BusinessNameLine1Txt></InstitutionName><USAddress><AddressLine1Txt>1 College Ave</AddressLine1Txt><CityNm>Austin</CityNm><StateAbbreviationCd>TX</StateAbbreviationCd><ZIPCd>78705</ZIPCd></USAddress><CurrentYear1098TReceivedInd>true</CurrentYear1098TReceivedInd><PriorYear1098TReceivedInd>true</PriorYear1098TReceivedInd><EIN>123456780</EIN></EducationalInstitutionGroup><PriorYearCreditClaimedInd>false</PriorYearCreditClaimedInd><AcademicPdEligibleStudentInd>true</AcademicPdEligibleStudentInd><PostSecondaryEducationInd>false</PostSecondaryEducationInd><DrugFelonyConvictionInd>false</DrugFelonyConvictionInd><AmerOppQualifiedExpensesAmt>4000</AmerOppQualifiedExpensesAmt>'), year);
  }
  const grad = builtFor({ taxpayer: adult, filingStatus: 'single', forms: [w2(60000, 5000), tuition({ graduate: true, tuitionPaid: 12000, priorYear1098T: false })] }, '2025', ['IRS8863']).IRS8863;
  assert.ok(grad.includes('<PriorYear1098TReceivedInd>false</PriorYear1098TReceivedInd>'));
  assert.ok(grad.includes('<LifetimeQualifiedExpensesAmt>12000</LifetimeQualifiedExpensesAmt>'));
  const missing = build(shaped({ taxpayer: adult, filingStatus: 'single', forms: [w2(60000, 5000), { ...tuition({ studentName: 'Zed', schoolZip: undefined, priorYear1098T: undefined }), payerTin: '' }] }, '2025'));
  assert.deepEqual(codes(missing).sort(), ['EDUCATION_PRIOR_1098T_UNANSWERED', 'EDUCATION_SCHOOL_ADDRESS_MISSING', 'EDUCATION_SCHOOL_EIN_MISSING', 'EDUCATION_STUDENT_UNKNOWN']);
});

test('Schedule E, Form 8582 and Form 4562 are built for a rental with a disallowed loss (2025 and 2026)', () => {
  for (const year of ['2025', '2026']) {
    const docs = builtFor({ taxpayer: adult, filingStatus: 'single', forms: [w2(160000, 30000), rental(year)], answers: { rentalPayments1099: false } }, year, ['IRS1040ScheduleE', 'IRS8582', 'IRS4562']);
    assert.equal(docs.IRS1040ScheduleE, '<IRS1040ScheduleE documentId="IRS1040ScheduleE"><PaymentRqrFilingForm1099Ind>false</PaymentRqrFilingForm1099Ind><PropertyRealEstAndRoyaltyGroup><PropertyUSAddress><AddressLine1Txt>1 Main St</AddressLine1Txt><CityNm>Austin</CityNm><StateAbbreviationCd>TX</StateAbbreviationCd><ZIPCd>78701</ZIPCd></PropertyUSAddress><PropertyDesc>1</PropertyDesc><FairRentalDaysCnt>365</FairRentalDaysCnt><PersonalUseDaysCnt>0</PersonalUseDaysCnt><RentsReceivedAmt>10000</RentsReceivedAmt><MortgageInterestPaidBanksAmt>12000</MortgageInterestPaidBanksAmt><TaxesAmt>2000</TaxesAmt><DeprecExpenseOrDepletionAmt>7198</DeprecExpenseOrDepletionAmt><TotalExpensesAmt>21198</TotalExpensesAmt><NetRentalIncomeOrLossAmt>-11198</NetRentalIncomeOrLossAmt></PropertyRealEstAndRoyaltyGroup><TotAllPaymentsAllRentalPropAmt>10000</TotAllPaymentsAllRentalPropAmt><TotalMortgageInterestPaidAmt>12000</TotalMortgageInterestPaidAmt><TotalDepreciationAmt>7198</TotalDepreciationAmt><TotalAllPropTotalExpensesAmt>21198</TotalAllPropTotalExpensesAmt></IRS1040ScheduleE>', year);
    assert.ok(docs.IRS8582.startsWith('<IRS8582 documentId="IRS8582"><RentalRealtyLossAmt>-11198</RentalRealtyLossAmt><NetRentalRealtyAmt>-11198</NetRentalRealtyAmt><TotalPassiveActivityAmt>-11198</TotalPassiveActivityAmt><RentalRealtyLossLimitAmt>11198</RentalRealtyLossLimitAmt><MaximumAllowedIncomeAmt>150000</MaximumAllowedIncomeAmt><ModifiedAGIAmt>160000</ModifiedAGIAmt><ParentWrkshtRentalActGrp><WrkshtRentalActGrp><PassiveActivityNm>1 Main St Austin TX 78701</PassiveActivityNm>'), year);
    assert.ok(inOrder(docs.IRS8582, ['ParentWrkshtRentalActGrp', 'ParentWrkshtLossGrp', 'ParentWrkshtListActivityGrp']), year);
    assert.ok(docs.IRS8582.includes('<TotalLossAmt>11198</TotalLossAmt><TotalUnallowedLossAmt>11198</TotalUnallowedLossAmt></ParentWrkshtListActivityGrp></IRS8582>'), year);
    assert.equal(docs.IRS4562, `<IRS4562 documentId="IRS4562-1"><BusinessOrActivityTxt>1 Main St Austin TX 78701</BusinessOrActivityTxt><GeneralDepreciationSystem><GDSResidentialRentalProperty><MonthAndYearPlacedInServiceDt>${year}-03</MonthAndYearPlacedInServiceDt><BasisForDepreciationAmt>250000</BasisForDepreciationAmt><DepreciationDeductionAmt>7198</DepreciationDeductionAmt></GDSResidentialRentalProperty></GeneralDepreciationSystem><TotalDepreciationAmt>7198</TotalDepreciationAmt></IRS4562>`, year);
  }
  const paid = build(shaped({ taxpayer: adult, filingStatus: 'single', forms: [w2(160000, 30000), rental('2025')], answers: { rentalPayments1099: true, rentalFiled1099: true } }, '2025'));
  assert.ok(docOf(paid.xml, 'IRS1040ScheduleE').includes('<PaymentRqrFilingForm1099Ind>true</PaymentRqrFilingForm1099Ind><RequiredForms1099FiledInd>true</RequiredForms1099FiledInd>'));
  const unanswered = build(shaped({ taxpayer: adult, filingStatus: 'single', forms: [w2(160000, 30000), { ...rental('2025'), payer: 'The beach house' }] }, '2025'));
  assert.deepEqual(codes(unanswered).sort(), ['SCHEDULE_E_1099_UNANSWERED', 'SCHEDULE_E_ADDRESS_INVALID']);
});

test('Form 8959 and Form 8960 follow the 2025 and 2026 line layouts', () => {
  const input = { taxpayer: adult, filingStatus: 'single', forms: [w2(300000, 60000), { kind: '1099-INT', payer: 'Bank', fields: { interest: 20000 } }], answers: { foreignAccounts: false, foreignTrust: false } };
  for (const year of ['2025', '2026']) {
    const docs = builtFor(input, year, ['IRS8959', 'IRS8960']);
    assert.equal(docs.IRS8959, '<IRS8959 documentId="IRS8959"><AdditionalTaxGrp><FilingStatusThresholdCd>200000</FilingStatusThresholdCd><AdditionalMedicareTaxGrp><TotalW2MedicareWagesAndTipsAmt>300000</TotalW2MedicareWagesAndTipsAmt><TotalMedicareWagesAndTipsAmt>300000</TotalMedicareWagesAndTipsAmt><WagesTipsSubjToAddlMedcrTaxAmt>100000</WagesTipsSubjToAddlMedcrTaxAmt><AdditionalMedicareTaxAmt>900</AdditionalMedicareTaxAmt></AdditionalMedicareTaxGrp><TotalAMRRTTaxAmt>900</TotalAMRRTTaxAmt></AdditionalTaxGrp><TotalW2MedicareTaxWithheldAmt>4350</TotalW2MedicareTaxWithheldAmt><TotalMedicareTaxAmt>4350</TotalMedicareTaxAmt></IRS8959>', year);
    assert.equal(docs.IRS8960, '<IRS8960 documentId="IRS8960"><TaxableInterestAmt>20000</TaxableInterestAmt><TotalIncomeAmt>20000</TotalIncomeAmt><NetInvestmentIncomeAmt>20000</NetInvestmentIncomeAmt><ModifiedAGIAmt>320000</ModifiedAGIAmt><FilingThresholdAmt>200000</FilingThresholdAmt><MAGILessThresholdAmt>120000</MAGILessThresholdAmt><SmllrIncmOrMAGILessThrshldAmt>20000</SmllrIncmOrMAGILessThrshldAmt><IndivNetInvstIncomeTaxAmt>760</IndivNetInvstIncomeTaxAmt></IRS8960>', year);
  }
});

test('Form 5329 with an exception code and Form 8606 with the basis ratio are built per owner', () => {
  const input = { taxpayer: adult, filingStatus: 'single', forms: [w2(50000, 5000), { kind: '1099-R', owner: 'taxpayer', payer: 'Vanguard', fields: { grossDistribution: 7000, taxableAmount: 7000, iraSepSimple: true, distributionCode: '1', exceptionCode: '12', exceptionAmount: 2000 } }, { kind: '5498', owner: 'taxpayer', payer: 'Vanguard', fields: { accountType: 'traditional', fairMarketValue: 63000 } }], answers: { iraNondeductibleContributions: 7000 } };
  for (const year of ['2025', '2026']) {
    const docs = builtFor(input, year, ['IRS5329', 'IRS8606']);
    assert.equal(docs.IRS5329, '<IRS5329 documentId="IRS5329-1"><PersonNm>Ana Diaz</PersonNm><SSN>400011234</SSN><EarlyDistributionsAmt>6300</EarlyDistributionsAmt><EarlyDistriExceptionReasonCd>12</EarlyDistriExceptionReasonCd><EarlyDistriNotSubjectToTaxAmt>2000</EarlyDistriNotSubjectToTaxAmt><EarlyDistriSubjectToTaxAmt>4300</EarlyDistriSubjectToTaxAmt><IRAEarlyDistributionsTaxAmt>430</IRAEarlyDistributionsTaxAmt></IRS5329>', year);
    assert.ok(docs.IRS8606.startsWith('<IRS8606 documentId="IRS8606-1"><Form8606IRANamelineTxt>Ana Diaz</Form8606IRANamelineTxt><NondedIRATxpyrWithIRASSN>400011234</NondedIRATxpyrWithIRASSN><NondedIRACurrTYNondedContriAmt>7000</NondedIRACurrTYNondedContriAmt>'), year);
    assert.ok(docs.IRS8606.includes('<NondedIRATotRllvrWthdrwVlAmt>70000</NondedIRATotRllvrWthdrwVlAmt><NondedIRATaxYearBasisRt>0.1</NondedIRATaxYearBasisRt><NondedIRANontxWthdrwUncnvrtAmt>700</NondedIRANontxWthdrwUncnvrtAmt>'), year);
    assert.ok(docs.IRS8606.endsWith('<NondedIRATaxableAmt>6300</NondedIRATaxableAmt></IRS8606>'), year);
  }
});

test('signing a joint return with a sitter paid by SSN, a 1098-T and a rental goes through once the Schedule E 1099 question is answered', async () => {
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  const set = await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'mfj', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-01-1234', dateOfBirth: '1988-04-02', occupation: 'Nurse' }, spouse: { firstName: 'Ravi', lastName: 'Diaz', ssn: '400-02-5678', dateOfBirth: '1987-01-05', occupation: 'Teacher' }, dependents: [{ ...mia, ssn: '400-02-2345' }], address: ADDRESS });
  assert.equal(set.ok, true, JSON.stringify(set));
  const forms = [
    w2(90000, 9000),
    { ...w2(60000, 5000), owner: 'spouse', payer: 'School District' },
    careProvider('Jo Smith', { amountPaid: 4000, providerSsn: '400-05-5555', providerAddress: '7 Elm St', providerZip: '78703' }),
    { ...tuition({ studentName: 'Ravi', tuitionPaid: 3000, graduate: true, priorYear1098T: false }), owner: 'spouse' },
    rental('2025', { rents: 18000, mortgageInterest: 6000 }),
  ];
  for (const form of forms) {
    const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: form.kind, owner: form.owner, payer: form.payer, ...(form.payerTin ? { payerTin: form.payerTin } : {}), fields: form.fields });
    assert.equal(added.ok, true, JSON.stringify(added));
  }
  assert.equal(await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '2441-PROVIDER', payer: 'Bad', fields: { amountPaid: 1, providerSsn: '000-00-0000', providerZip: '787' } }).then((out) => out.error), 'US_TAX_FORM_INVALID');
  const stored = state.usReturns['2025'].forms.find((form) => form.kind === '2441-PROVIDER');
  assert.equal(stored.fields.providerSsn, '***-**-5555');
  assert.ok(stored.fields.providerSsnSealed && !JSON.stringify(stored).includes('400055555'));
  const listed = await runTool(state, 'list_us_tax_forms', { taxYear: '2025' });
  assert.ok(!JSON.stringify(listed).includes('providerSsnSealed'));
  const ids = (await runTool(state, 'us_interview', { taxYear: '2025' })).data.questions.map((question) => question.id);
  assert.ok(ids.includes('rentalPayments1099') && !ids.includes('rentalFiled1099'));
  const signArgs = { taxYear: 2025, taxpayerPin: '12345', spousePin: '54321', priorYear: { taxpayer: { agi: 28000 }, spouse: { agi: 20000 } }, consent8879: true, refund: { method: 'direct_deposit', routing: '021000021', account: '000123456789', accountType: 'checking' } };
  const refused = await signUsReturn(state, signArgs);
  assert.equal(refused.error, 'RETURN_NOT_READY');
  assert.deepEqual(refused.problems.map((item) => [item.code, item.step]), [['SCHEDULE_E_1099_UNANSWERED', 'interview']]);
  assert.equal((await runTool(state, 'answer_us_interview', { taxYear: '2025', id: 'rentalPayments1099', answer: false })).ok, true);
  const signed = await signUsReturn(state, signArgs);
  assert.equal(signed.ok, true, JSON.stringify(signed));
  const filing = computedForm1040ForFiling(state, { taxYear: '2025' });
  const built = build(filing.data);
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  for (const element of ['IRS2441', 'IRS8863', 'IRS1040ScheduleE', 'IRS4562']) assert.ok(docOf(built.xml, element), element);
  assert.ok(docOf(built.xml, 'IRS2441').includes('<SSN>400055555</SSN>'));
  assert.ok(docOf(built.xml, 'IRS8863').includes('<StudentSSN>400025678</StudentSSN>'));
  assert.equal(computedForm1040(state, { taxYear: '2025' }).data.forms.find((form) => form.kind === '2441-PROVIDER').fields.providerSsn, '***-**-5555');
  const sitterPrefill = (options) => partnerPrefill(filing.data, options).other_forms.find((form) => form.kind === '2441-PROVIDER').fields;
  assert.equal(sitterPrefill().providerSsn, undefined);
  assert.ok(!JSON.stringify(partnerPrefill(filing.data)).includes('providerSsnSealed'));
  assert.equal(sitterPrefill({ sendTins: true }).providerSsn, '400055555');
  assert.equal(sitterPrefill().providerZip, '78703');
});
