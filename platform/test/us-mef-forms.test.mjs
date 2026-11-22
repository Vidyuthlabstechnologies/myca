import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeForm1040 } from '../src/us-1040.mjs';
import { buildMefSubmission, makeSubmissionId } from '../src/us-mef-xml.mjs';
import { form1040MefLines, scheduleMefDocuments, mefRelationshipCode, RELATIONSHIP_CODES, SCHEDULE_B_ELEMENTS, SCHEDULE_D_GROUPS, CAPITAL_TOTALS, FORM_8949_ELEMENTS, SCHEDULE_EIC_ELEMENTS, FORM_8995_ROW, FORM_8962_MONTHLY } from '../src/us-mef-map.mjs';
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

test('forms whose MeF data MyCA does not hold yet are still refused by name', () => {
  for (const key of ['A', '2441', '8863', '5695', '5329', '8606', 'E', '8582', '4562', '8959', '8960']) {
    const built = build(handmade(2025, { [key]: { 1: 100 } }));
    assert.deepEqual(codes(built), ['UNSUPPORTED_SCHEDULE'], key);
    assert.match(built.problems[0].message, new RegExp(`Schedule ${key} `));
  }
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
