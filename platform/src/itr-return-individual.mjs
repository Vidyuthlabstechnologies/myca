import { shared, chapterViaExtras, viaPatch, assessmentYearOf, interestAndFee } from './itr-return-builder.mjs';

const { skeletonFor, mergeInto, pruneEmpty, personalInfo, bankDetails, taxPayments, pickRegime, ageBandOf, finish, rupees, sum, DATE_RE } = shared;
const PAISE = 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function houseProperty(input = {}, regime) {
  const type = ['S', 'L', 'D'].includes(input.type) ? input.type : '';
  if (!type) return { type: '', gross: 0, taxPaid: 0, annualValue: 0, standardDeduction: 0, interest: 0, arrears: 0, income: 0, loss: 0 };
  const gross = rupees(input.rentReceived);
  const taxPaid = rupees(input.municipalTax);
  const interestRaw = rupees(input.interest);
  const arrears = rupees(input.arrearsRent);
  if (type === 'S') {
    const interest = regime === 'old' ? Math.min(interestRaw, 200000) : 0;
    return { type, gross: 0, taxPaid: 0, annualValue: 0, standardDeduction: 0, interest, arrears: 0, income: -interest, loss: interest };
  }
  const annualValue = Math.max(0, gross - taxPaid);
  const standardDeduction = Math.round(annualValue * 0.3);
  const arrearsNet = arrears - Math.round(arrears * 0.3);
  const raw = annualValue - standardDeduction - interestRaw + arrearsNet;
  return { type, gross, taxPaid, annualValue, standardDeduction, interest: interestRaw, arrears, income: raw, loss: Math.max(0, -raw) };
}

const SECTION_10_NATURES = new Set(['10(5)', '10(6)', '10(7)', '10(10)', '10(10A)']);

export function buildItr1(args = {}) {
  const info = assessmentYearOf(args.fy || '2024-25');
  if (!info) return fail('FY_INVALID', { hint: 'Give the financial year as 2024-25.' });
  const notes = [];
  const problems = [];
  const warnings = [];
  const taxpayer = args.taxpayer || {};
  const skeleton = skeletonFor('ITR-1');
  if (!skeleton) return fail('ITR_SCHEMA_MISSING', { form: 'ITR-1' });
  const personal = personalInfo(taxpayer, notes, problems, 'ITR-1');
  delete personal.Status;
  personal.EmployerCategory = ['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH', 'NA'].includes(taxpayer.employerCategory) ? taxpayer.employerCategory : 'OTH';
  if (taxpayer.status === 'H' || taxpayer.status === 'F') problems.push({ path: 'taxpayer.status', message: 'ITR-1 is for an individual.' });

  if (args.foreignAssets === true) problems.push({ path: 'foreignAssets', message: 'A person with foreign assets or income cannot use ITR-1. Use ITR-2.' });
  if (args.director === true || args.unlistedShares === true) problems.push({ path: 'director', message: 'A company director or a holder of unlisted equity shares cannot use ITR-1. Use ITR-2.' });
  if (rupees(args.agriIncome) > 5000) problems.push({ path: 'agriIncome', message: 'Agricultural income above Rs 5,000 rules out ITR-1. Use ITR-2.' });
  if (rupees(args.businessIncome) > 0 || (args.businesses || []).length || (args.professions || []).length) problems.push({ path: 'businesses', message: 'Business or professional income rules out ITR-1. Use ITR-3 or ITR-4.' });
  if (args.capitalGains && Object.values(args.capitalGains).some((value) => Number(value) !== 0)) problems.push({ path: 'capitalGains', message: 'ITR-1 allows only long-term gains under 112A up to Rs 1.25 lakh. Other capital gains need ITR-2.' });
  if (rupees(args.broughtForwardLoss) > 0) problems.push({ path: 'broughtForwardLoss', message: 'A loss brought forward from an earlier year rules out ITR-1. Use ITR-2.' });

  const salary = args.salary || {};
  const ageBand = ageBandOf(personal.DOB, info.fyEnd);
  const salaryGross = rupees(salary.gross) + rupees(salary.perquisites) + rupees(salary.profitsInLieu);
  const exempt = Array.isArray(salary.exemptAllowances) ? salary.exemptAllowances : [];
  for (const item of exempt) if (!SECTION_10_NATURES.has(String(item.nature))) problems.push({ path: 'salary.exemptAllowances', message: `Exempt allowance nature must be one of ${[...SECTION_10_NATURES].join(', ')}.` });
  const exemptTotal = exempt.reduce((total, item) => total + rupees(item.amount), 0);
  const netSalary = Math.max(0, salaryGross - exemptTotal);
  const professionalTax = rupees(salary.professionalTax);

  const other = args.otherIncome || {};
  const savings = rupees(other.savingsInterest);
  const deposits = rupees(other.depositInterest);
  const taxRefundInterest = rupees(other.taxRefundInterest);
  const familyPensionGross = rupees(other.familyPension);
  const familyPensionDeduction = Math.min(Math.round(familyPensionGross / 3), 25000);
  const dividend = rupees(other.dividend);
  const miscOther = rupees(other.other);
  const otherSourcesBeforeDeduction = savings + deposits + taxRefundInterest + familyPensionGross + dividend + miscOther;
  const otherSources = otherSourcesBeforeDeduction - familyPensionDeduction;

  const regimeWanted = ['old', 'new', 'auto'].includes(args.regime) ? args.regime : 'new';
  const probe = regimeWanted === 'auto' ? 'old' : regimeWanted;
  const hp = houseProperty(args.houseProperty, probe);
  const deductions = args.deductions || {};
  const extras = chapterViaExtras(deductions, { ageBand, savingsInterest: savings, depositInterest: deposits });

  const gain112a = args.ltcg112A ? Math.max(0, rupees(args.ltcg112A.saleValue) - rupees(args.ltcg112A.cost)) : 0;
  if (gain112a > 125000) problems.push({ path: 'ltcg112A', message: `Long-term gain under 112A of Rs ${gain112a} is above Rs 1.25 lakh. ITR-1 cannot be used; use ITR-2.` });

  const runFor = (regime) => {
    const h = houseProperty(args.houseProperty, regime);
    const hpIncome = regime === 'new' ? Math.max(0, h.income) : Math.max(h.income, -200000);
    return { h, hpIncome };
  };
  const pt = (regime) => (regime === 'old' ? professionalTax : 0);
  let chosen = regimeWanted;
  let compared = null;
  let calc;
  if (regimeWanted === 'auto') {
    const results = ['new', 'old'].map((regime) => {
      const r = runFor(regime);
      const chosenTax = pickRegime({ regime }, { fy: info.fy, salary: netSalary, otherIncome: otherSources + r.hpIncome - pt(regime), businessIncome: 0, deductions, ageBand, extras });
      return { regime, calc: chosenTax.calc, r };
    });
    if (results.some((x) => x.calc.error)) return fail(results.find((x) => x.calc.error).calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
    const best = results[0].calc.taxPayablePaise <= results[1].calc.taxPayablePaise ? results[0] : results[1];
    chosen = best.regime;
    calc = best.calc;
    compared = { newTax: results[0].calc.taxPayablePaise / PAISE, oldTax: results[1].calc.taxPayablePaise / PAISE };
  } else {
    const r = runFor(chosen);
    calc = pickRegime({ regime: chosen }, { fy: info.fy, salary: netSalary, otherIncome: otherSources + r.hpIncome - pt(chosen), businessIncome: 0, deductions, ageBand, extras }).calc;
    if (calc.error) return fail(calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
  }
  const old = chosen === 'old';
  const { h, hpIncome } = runFor(chosen);
  if (chosen === 'new' && h.income < 0) problems.push({ path: 'houseProperty', message: `The house property shows a loss of Rs ${-h.income}. In the new regime it cannot be set off or carried forward in ITR-1; use ITR-2 or choose the old regime.` });
  if (old && h.income < -200000) notes.push('The house property loss is limited to Rs 2 lakh against other income.');

  const standardDeduction = calc.standardDeductionPaise / PAISE;
  const professionalTaxAllowed = old ? Math.min(professionalTax, Math.max(0, netSalary - standardDeduction)) : 0;
  const incomeFromSalary = Math.max(0, netSalary - standardDeduction - professionalTaxAllowed);
  const grossTotal = calc.grossTotalIncomePaise / PAISE;
  const totalIncome = calc.totalIncomePaise / PAISE;
  if (totalIncome > 5000000) problems.push({ path: 'income', message: `Total income ${totalIncome} is above Rs 50 lakh; ITR-1 cannot be used. Use ITR-2.` });
  if (!old && (rupees(deductions.c80) || rupees(deductions.d80Self) || rupees(deductions.d80Parents))) warnings.push('Deductions under 80C and 80D are not allowed in the new tax regime, so they were not claimed. Choose the old regime if they should count.');
  const slabTax = calc.slabTaxPaise / PAISE;
  const rebate = calc.rebatePaise / PAISE;
  const taxPayable = calc.taxPayablePaise / PAISE;
  const cess = taxPayable - (slabTax - rebate);
  const via = viaPatch(calc, extras);

  const filingDate = DATE_RE.test(String(args.filingDate || '')) ? args.filingDate : `${info.ayStart}-07-31`;
  const dueDate = `${info.ayStart}-07-31`;
  const advance = (Array.isArray(args.taxesPaid?.advanceTax) ? args.taxesPaid.advanceTax : []).map((p) => ({ date: String(p.date || ''), amount: rupees(p.amount) })).filter((p) => DATE_RE.test(p.date) && p.amount > 0);
  const tdsSalary = Array.isArray(args.taxesPaid?.tdsSalary) ? args.taxesPaid.tdsSalary : [];
  const tdsOther = Array.isArray(args.taxesPaid?.tdsOther) ? args.taxesPaid.tdsOther : [];
  const tds = sum(...tdsSalary.map((x) => rupees(x.tds)), ...tdsOther.map((x) => rupees(x.tds)), rupees(args.taxesPaid?.tds));
  const tcs = rupees(args.taxesPaid?.tcs);
  const selfAssessment = rupees(args.taxesPaid?.selfAssessment);
  const relief89 = rupees(args.relief89);
  const challans = Array.isArray(args.taxesPaid?.challans) ? args.taxesPaid.challans : [];
  const advanceTotal = advance.reduce((total, p) => total + p.amount, 0);
  const netLiability = Math.max(0, taxPayable - relief89);
  const interest = interestAndFee({ ayStart: info.ayStart, dueDate, filingDate, taxLiability: netLiability, tdsAndTcs: tds + tcs, advancePayments: advance, presumptive: false, totalIncome, selfAssessment });
  const interestTotal = interest.us234A + interest.us234B + interest.us234C;
  const totalTaxInterest = netLiability + interestTotal + interest.fee234F;
  const taxesPaid = advanceTotal + tds + tcs + selfAssessment;
  const balance = Math.max(0, totalTaxInterest - taxesPaid);
  const refund = Math.max(0, taxesPaid - totalTaxInterest);
  if (!args.bank?.account) problems.push({ path: 'bank', message: refund > 0 ? 'A refund is due: a bank account in your name, pre-validated on the portal, is needed to receive it.' : 'The return needs at least one bank account in your name, even when no refund is due.' });

  const otherLines = [];
  if (savings) otherLines.push({ OthSrcNatureDesc: 'SAV', OthSrcOthAmount: savings });
  if (deposits) otherLines.push({ OthSrcNatureDesc: 'IFD', OthSrcOthAmount: deposits });
  if (taxRefundInterest) otherLines.push({ OthSrcNatureDesc: 'TAX', OthSrcOthAmount: taxRefundInterest });
  if (familyPensionGross) otherLines.push({ OthSrcNatureDesc: 'FAP', OthSrcOthAmount: familyPensionGross });
  if (dividend) {
    const q = Array.isArray(other.dividendByQuarter) && other.dividendByQuarter.length === 5 ? other.dividendByQuarter.map(rupees) : [dividend, 0, 0, 0, 0];
    if (!(Array.isArray(other.dividendByQuarter) && other.dividendByQuarter.length === 5)) notes.push('Dividend by quarter was not given, so all of it is shown in the first quarter (up to 15 June), which is the cautious choice for 234C. Give dividendByQuarter with five amounts to correct it.');
    otherLines.push({ OthSrcNatureDesc: 'DIV', OthSrcOthAmount: dividend, DividendInc: { DateRange: { Upto15Of6: q[0], Upto15Of9: q[1], Up16Of9To15Of12: q[2], Up16Of12To15Of3: q[3], Up16Of3To31Of3: q[4] } } });
  }
  if (miscOther) otherLines.push({ OthSrcNatureDesc: 'OTH', OthSrcOthNatOfInc: String(other.otherNature || 'Other income').slice(0, 125), OthSrcOthAmount: miscOther });

  const patch = {
    CreationInfo: { SWVersionNo: '1.0', SWCreatedBy: 'SW00000001', JSONCreatedBy: 'SW00000001', JSONCreationDate: filingDate, IntermediaryCity: 'Bengaluru', Digest: '-' },
    Form_ITR1: { FormName: 'ITR-1', Description: 'For Indls having Income from Salaries, one house property, other sources', AssessmentYear: String(info.ayStart), SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
    PersonalInfo: personal,
    FilingStatus: {
      ReturnFileSec: [11, 12, 13, 14, 16, 17, 18, 20].includes(Number(args.returnSection)) ? Number(args.returnSection) : 11,
      OptOutNewTaxRegime: old ? 'Y' : 'N',
      ItrFilingDueDate: dueDate,
    },
    ITR1_IncomeDeductions: {
      GrossSalary: salaryGross,
      Salary: rupees(salary.gross),
      PerquisitesValue: rupees(salary.perquisites),
      ProfitsInSalary: rupees(salary.profitsInLieu),
      IncomeNotified89A: 0,
      AllwncExemptUs10: { AllwncExemptUs10Dtls: exempt.map((item) => ({ SalNatureDesc: String(item.nature), SalOthAmount: rupees(item.amount) })), TotalAllwncExemptUs10: exemptTotal },
      NetSalary: netSalary,
      DeductionUs16: standardDeduction + professionalTaxAllowed,
      ProfessionalTaxUs16iii: professionalTaxAllowed,
      IncomeFromSal: incomeFromSalary,
      TypeOfHP: h.type,
      GrossRentReceived: h.gross,
      TaxPaidlocalAuth: h.taxPaid,
      AnnualValue: h.annualValue,
      StandardDeduction: h.standardDeduction,
      InterestPayable: h.interest,
      ArrearsUnrealizedRentRcvd: h.arrears,
      TotalIncomeOfHP: Math.max(hpIncome, -200000),
      IncomeOthSrc: otherSources,
      OthersInc: { OthersIncDtlsOthSrc: otherLines },
      DeductionUs57iia: familyPensionDeduction,
      GrossTotIncome: grossTotal,
      GrossTotIncomeIncLTCG112A: grossTotal + gain112a,
      UsrDeductUndChapVIA: via.total === 0 ? {} : via.block,
      DeductUndChapVIA: via.total === 0 ? {} : via.block,
      TotalIncome: totalIncome,
    },
    ITR1_TaxComputation: {
      TotalTaxPayable: slabTax,
      Rebate87A: rebate,
      TaxPayableOnRebate: slabTax - rebate,
      EducationCess: cess,
      GrossTaxLiability: taxPayable,
      Section89: relief89,
      NetTaxLiability: netLiability,
      TotalIntrstPay: interestTotal + interest.fee234F,
      IntrstPay: { IntrstPayUs234A: interest.us234A, IntrstPayUs234B: interest.us234B, IntrstPayUs234C: interest.us234C, LateFilingFee234F: interest.fee234F },
      TotTaxPlusIntrstPay: totalTaxInterest,
    },
    TaxPaid: { TaxesPaid: { AdvanceTax: advanceTotal, TDS: tds, TCS: tcs, SelfAssessmentTax: selfAssessment, TotalTaxesPaid: taxesPaid }, BalTaxPayable: balance },
    Refund: { RefundDue: refund, BankAccountDtls: { AddtnlBankDetails: bankDetails(args.bank) } },
    TDSonSalaries: {
      TDSonSalary: tdsSalary.filter((x) => x.tan).map((x) => ({ EmployerOrDeductorOrCollectDetl: { TAN: String(x.tan).toUpperCase(), EmployerOrDeductorOrCollecterName: String(x.name || '').slice(0, 125) }, IncChrgSal: rupees(x.income), TotalTDSSal: rupees(x.tds) })),
      TotalTDSonSalaries: sum(...tdsSalary.map((x) => rupees(x.tds))),
    },
    TDSonOthThanSals: {
      TDSonOthThanSalDtls: tdsOther.filter((x) => x.tan).map((x) => ({ TANOfDeductor: String(x.tan).toUpperCase(), TDSSection: String(x.section || '193'), TDSClaimed: rupees(x.tds), GrossAmount: rupees(x.gross), HeadOfIncome: ['BP', 'HP', 'OS', 'EI', 'NA'].includes(x.head) ? x.head : 'OS', TDSCreditCarriedFwd: 0 })),
      TotalTDSonOthThanSals: sum(...tdsOther.map((x) => rupees(x.tds))),
    },
    ScheduleIT: { TaxPayment: taxPayments(challans, notes), TotalTaxPayments: taxPayments(challans, []).reduce((total, item) => total + item.Amt, 0) },
    Verification: {
      Declaration: { AssesseeVerName: String(taxpayer.name || '').slice(0, 127), FatherName: String(taxpayer.fatherName || '').slice(0, 125), AssesseeVerPAN: personal.PAN },
      Capacity: 'S',
      Place: String(taxpayer.address?.city || '').slice(0, 50),
    },
  };
  if (old && rupees(deductions.c80) > 0) {
    patch.Schedule80C = { Schedule80CDtls: [{ Amount: calc.section80CPaise / PAISE, IdentificationNo: 'NA' }], TotalAmt: calc.section80CPaise / PAISE };
  }
  if (old && calc.section80DPaise > 0) {
    patch.Schedule80D = { Sec80DSelfFamSrCtznHealth: { SeniorCitizenFlag: deductions.selfSenior === true ? 'Y' : rupees(deductions.d80Self) ? 'N' : 'S', ParentsSeniorCitizenFlag: deductions.parentsSenior === true ? 'Y' : rupees(deductions.d80Parents) ? 'N' : 'P', EligibleAmountOfDedn: calc.section80DPaise / PAISE } };
  }
  if (gain112a || args.ltcg112A) {
    patch.LTCG112A = { TotSaleCnsdrn: rupees(args.ltcg112A?.saleValue), TotCstAcqisn: rupees(args.ltcg112A?.cost), LongCap112A: gain112a };
  }
  mergeInto(skeleton.body, patch);
  pruneEmpty(skeleton.body, [['ScheduleIT', 'TaxPayment'], ['TDSonSalaries', 'TDSonSalary'], ['TDSonOthThanSals', 'TDSonOthThanSalDtls']]);
  if (!otherLines.length) delete skeleton.body.ITR1_IncomeDeductions.OthersInc;
  if (!exempt.length) delete skeleton.body.ITR1_IncomeDeductions.AllwncExemptUs10.AllwncExemptUs10Dtls;
  const itr = { ITR: { ITR1: skeleton.body } };
  return finish({ form: 'ITR-1', itr, schema: skeleton.schema, info, notes, problems, warnings, summary: {
    regime: chosen,
    comparedRegimes: compared,
    incomeFromSalary,
    incomeFromHouseProperty: Math.max(hpIncome, -200000),
    incomeFromOtherSources: otherSources,
    grossTotalIncome: grossTotal,
    totalIncome,
    taxOnTotalIncome: slabTax,
    rebate87A: rebate,
    cess,
    grossTaxLiability: taxPayable,
    interest234A: interest.us234A,
    interest234B: interest.us234B,
    interest234C: interest.us234C,
    lateFee234F: interest.fee234F,
    taxesPaid,
    balanceTaxPayable: balance,
    refundDue: refund,
  }, checks: [] });
}
