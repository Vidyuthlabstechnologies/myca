import { shared, chapterViaExtras, viaPatch, assessmentYearOf, interestAndFee } from './itr-return-builder.mjs';
import { houseBlocks } from './it-house-property.mjs';
import { computeCapitalGains } from './capital-gains.mjs';
import { gainSchedules, houseSchedule } from './itr-gain-schedules.mjs';
import { layer } from './itr-util.mjs';
import { incomeTax } from './sprint-load.mjs';

const { skeletonFor, mergeInto, pruneEmpty, personalInfo, bankDetails, taxPayments, ageBandOf, finish, rupees, signed, sum, DATE_RE } = shared;
const PAISE = 100;
const HP_LOSS_LIMIT = 200000;
const SECTION_10_NATURES = new Set(['10(5)', '10(6)', '10(7)', '10(10)', '10(10A)']);
const EMPLOYER_NATURES = new Set(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH', 'NA']);


function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function salaryBlock(args, notes, problems) {
  const input = args.salary || {};
  const employers = Array.isArray(input.employers) && input.employers.length ? input.employers : (input.gross || input.perquisites || input.profitsInLieu ? [input] : []);
  const rows = employers.map((employer, index) => {
    if (!employer.name) problems.push({ path: `salary.employers[${index}].name`, message: 'The employer name is required.' });
    const nature = EMPLOYER_NATURES.has(employer.nature) ? employer.nature : 'OTH';
    return {
      name: String(employer.name || '').slice(0, 125),
      nature,
      tan: employer.tan ? String(employer.tan).toUpperCase() : '',
      address: employer.address || {},
      gross: rupees(employer.gross),
      perquisites: rupees(employer.perquisites),
      profitsInLieu: rupees(employer.profitsInLieu),
    };
  });
  const exempt = Array.isArray(input.exemptAllowances) ? input.exemptAllowances : [];
  for (const item of exempt) if (!SECTION_10_NATURES.has(String(item.nature))) problems.push({ path: 'salary.exemptAllowances', message: `Exempt allowance nature must be one of ${[...SECTION_10_NATURES].join(', ')}.` });
  const exemptTotal = exempt.reduce((total, item) => total + rupees(item.amount), 0);
  const hra = input.hra ? {
    place: input.hra.metro ? '1' : '2',
    received: rupees(input.hra.received),
    rentPaid: rupees(input.hra.rentPaid),
    salaryForHra: rupees(input.hra.salaryForHra),
  } : null;
  let hraExempt = 0;
  if (hra) {
    const share = hra.place === '1' ? 0.5 : 0.4;
    const excessRent = Math.max(0, hra.rentPaid - Math.round(hra.salaryForHra * 0.1));
    hraExempt = Math.min(hra.received, excessRent, Math.round(hra.salaryForHra * share));
    notes.push(`House rent allowance exempt under section 10(13A) worked out at Rs ${hraExempt} as the least of the allowance received, rent paid above 10% of salary, and ${hra.place === '1' ? '50%' : '40%'} of salary.`);
  }
  const gross = rows.reduce((total, row) => total + row.gross + row.perquisites + row.profitsInLieu, 0);
  return { rows, exempt, exemptTotal: exemptTotal + hraExempt, hra, hraExempt, gross, professionalTax: rupees(input.professionalTax), entertainment: rupees(input.entertainmentAllowance) };
}



function otherSourcesBlock(args) {
  const other = args.otherIncome || {};
  const savings = rupees(other.savingsInterest);
  const deposits = rupees(other.depositInterest);
  const refundInterest = rupees(other.taxRefundInterest);
  const otherInterest = rupees(other.otherInterest);
  const familyPension = rupees(other.familyPension);
  const familyPensionDeduction = Math.min(Math.round(familyPension / 3), 25000);
  const dividend = rupees(other.dividend);
  const misc = rupees(other.other);
  const expenses = rupees(other.expenses);
  const gross = savings + deposits + refundInterest + otherInterest + familyPension + dividend + misc;
  const net = Math.max(0, gross - familyPensionDeduction - expenses);
  return { savings, deposits, refundInterest, otherInterest, familyPension, familyPensionDeduction, dividend, misc, expenses, gross, net, dividendByQuarter: other.dividendByQuarter, otherNature: other.otherNature };
}

export function buildItr2(args = {}) {
  const info = assessmentYearOf(args.fy || '2024-25');
  if (!info) return fail('FY_INVALID', { hint: 'Give the financial year as 2024-25.' });
  const notes = [];
  const problems = [];
  const warnings = [];
  const taxpayer = args.taxpayer || {};
  const skeleton = skeletonFor('ITR-2');
  if (!skeleton) return fail('ITR_SCHEMA_MISSING', { form: 'ITR-2' });
  const personal = personalInfo(taxpayer, notes, problems, 'ITR-2');
  if (taxpayer.status === 'F') problems.push({ path: 'taxpayer.status', message: 'ITR-2 is for an individual or HUF.' });

  if (args.foreignAssets === true) problems.push({ path: 'foreignAssets', message: 'Foreign assets and foreign income need Schedule FA and Schedule FSI, which this builder does not produce yet. Use the portal utility for those schedules.' });
  if (rupees(args.businessIncome) > 0 || (args.businesses || []).length || (args.professions || []).length) problems.push({ path: 'businesses', message: 'Business or professional income rules out ITR-2. Use ITR-3 or ITR-4.' });
  if (args.residentialStatus && args.residentialStatus !== 'RES') problems.push({ path: 'residentialStatus', message: 'Only resident individuals are built here. A non-resident or not-ordinarily-resident return needs more schedules.' });

  const salary = salaryBlock(args, notes, problems);
  const other = otherSourcesBlock(args);
  const ageBand = ageBandOf(personal.DOB, info.fyEnd);
  const agri = rupees(args.agriIncome);
  const deductions = args.deductions || {};
  const extras = chapterViaExtras(deductions, { ageBand, savingsInterest: other.savings, depositInterest: other.deposits });

  const cg = computeCapitalGains({ transactions: args.capitalGains?.transactions || [], broughtForward: { stcl: args.broughtForward?.shortTermCapitalLoss, ltcl: args.broughtForward?.longTermCapitalLoss } });
  for (const error of cg.problems) problems.push(error);
  notes.push(...cg.notes);
  for (const row of cg.rows) notes.push(...row.notes.map((text) => `${row.name}: ${text}`));
  for (const item of cg.rows.filter((row) => row.bucket.startsWith('ltcg112A') || row.bucket.startsWith('stcg111A'))) {
    if (!item.name) problems.push({ path: 'capitalGains', message: 'Each listed share or fund sale needs a name.' });
  }

  const regimeWanted = ['old', 'new', 'auto'].includes(args.regime) ? args.regime : 'new';
  const specialPaise = Object.fromEntries(Object.entries(cg.specialIncome).map(([key, value]) => [key, Math.max(0, value) * PAISE]));
  const hpBlocks = (regime) => houseBlocks(args.houseProperties, regime);
  const bfHp = rupees(args.broughtForward?.houseProperty);

  const runFor = (regime) => {
    const rows = hpBlocks(regime);
    const hpTotal = rows.reduce((total, row) => total + row.h.income, 0);
    const professionalTax = regime === 'old' ? salary.professionalTax : 0;
    const netSalary = Math.max(0, salary.gross - salary.exemptTotal);
    const standardEstimate = regime === 'old' ? 50000 : 75000;
    const salaryAfter = Math.max(0, netSalary - Math.min(netSalary, standardEstimate));
    const normalBeforeHp = salaryAfter - professionalTax + other.net + cg.normalRateGain;
    let hpForTax = 0;
    let hpLossSetoff = 0;
    let hpLossCarried = 0;
    if (hpTotal >= 0) hpForTax = hpTotal;
    else if (regime === 'old') {
      const loss = Math.min(-hpTotal, HP_LOSS_LIMIT);
      hpLossSetoff = Math.min(loss, Math.max(0, normalBeforeHp));
      hpLossCarried = -hpTotal - hpLossSetoff;
      hpForTax = -hpLossSetoff;
    } else {
      hpLossCarried = -hpTotal;
    }
    const bfHpSetoff = hpTotal > 0 && regime === 'old' ? Math.min(bfHp, hpTotal) : Math.min(bfHp, Math.max(0, hpTotal));
    hpForTax -= bfHpSetoff;
    const bfHpCarried = bfHp - bfHpSetoff;
    const calc = incomeTax.computeIncomeTaxSpecial({
      fy: info.fy,
      regime,
      ageBand,
      residentIndividual: true,
      salaryPaise: netSalary * PAISE,
      otherIncomePaise: (other.net + hpForTax - professionalTax + cg.normalRateGain) * PAISE,
      claims: {
        otherChapterViaPaise: (extras.totalOld || 0) * PAISE,
        employerNpsPaise: (regime === 'old' ? extras.employerNpsOld || 0 : extras.employerNpsNew || 0) * PAISE,
        section80CPaise: rupees(deductions.c80) * PAISE,
        healthInsuranceSelfAndFamilyPaise: rupees(deductions.d80Self) * PAISE,
        healthInsuranceParentsPaise: rupees(deductions.d80Parents) * PAISE,
        selfAndFamilyIncludesSenior: deductions.selfSenior === true,
        parentsIncludeSenior: deductions.parentsSenior === true,
      },
      special: specialPaise,
    });
    return { regime, rows, hpTotal, hpForTax, hpLossSetoff, hpLossCarried, bfHpSetoff, bfHpCarried, professionalTax, netSalary, calc };
  };

  let chosen = regimeWanted;
  let compared = null;
  let run;
  if (regimeWanted === 'auto') {
    const results = [runFor('new'), runFor('old')];
    const failed = results.find((item) => item.calc.error);
    if (failed) return fail(failed.calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
    run = results[0].calc.taxPayablePaise <= results[1].calc.taxPayablePaise ? results[0] : results[1];
    chosen = run.regime;
    compared = { newTax: results[0].calc.taxPayablePaise / PAISE, oldTax: results[1].calc.taxPayablePaise / PAISE };
  } else {
    run = runFor(chosen);
    if (run.calc.error) return fail(run.calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
  }
  const old = chosen === 'old';
  const calc = run.calc;
  const via = viaPatch({ ...calc, grossTotalIncomePaise: calc.grossNormalIncomePaise }, extras);
  if (!old && (rupees(deductions.c80) || rupees(deductions.d80Self) || rupees(deductions.d80Parents))) warnings.push('Deductions under 80C and 80D are not allowed in the new tax regime, so they were not claimed. Choose the old regime if they should count.');
  if (calc.surchargeWarning) warnings.push(calc.surchargeWarning);
  if (calc.basicExemptionAdjustedPaise > 0) notes.push(`Rs ${calc.basicExemptionAdjustedPaise / PAISE} of special-rate gains was set against the unused basic exemption limit, highest rate first.`);

  const standardDeduction = calc.standardDeductionPaise / PAISE;
  const professionalTaxAllowed = old ? Math.min(run.professionalTax, Math.max(0, run.netSalary - standardDeduction)) : 0;
  const incomeFromSalary = Math.max(0, run.netSalary - standardDeduction - professionalTaxAllowed);
  const specialFinal = cg.specialIncome;
  const specialTotal = Object.values(specialFinal).reduce((a, b) => a + b, 0);
  const grossTotal = incomeFromSalary + Math.max(0, run.hpForTax) + other.net + cg.normalRateGain + specialTotal - Math.max(0, -run.hpForTax);
  const totalIncome = calc.totalIncomePaise / PAISE;
  if (totalIncome > 5000000) problems.push({ path: 'income', message: `Total income ${totalIncome} is above Rs 50 lakh. Schedule AL (assets and liabilities) is required and is not built here yet.` });

  const slabAndSpecial = calc.normalTaxPaise / PAISE + calc.specialTaxPaise / PAISE;
  const rebate = calc.rebatePaise / PAISE;
  const surcharge = calc.surchargePaise / PAISE;
  const taxPayable = calc.taxPayablePaise / PAISE;
  const cess = taxPayable - (slabAndSpecial - rebate + surcharge);
  const relief89 = rupees(args.relief89);
  const netLiability = Math.max(0, taxPayable - relief89);
  const filingDate = DATE_RE.test(String(args.filingDate || '')) ? args.filingDate : `${info.ayStart}-07-31`;
  const dueDate = `${info.ayStart}-07-31`;
  const advance = (Array.isArray(args.taxesPaid?.advanceTax) ? args.taxesPaid.advanceTax : []).map((p) => ({ date: String(p.date || ''), amount: rupees(p.amount) })).filter((p) => DATE_RE.test(p.date) && p.amount > 0);
  const tdsSalary = Array.isArray(args.taxesPaid?.tdsSalary) ? args.taxesPaid.tdsSalary : [];
  const tdsOther = Array.isArray(args.taxesPaid?.tdsOther) ? args.taxesPaid.tdsOther : [];
  const tds = sum(...tdsSalary.map((x) => rupees(x.tds)), ...tdsOther.map((x) => rupees(x.tds)), rupees(args.taxesPaid?.tds));
  const tcs = rupees(args.taxesPaid?.tcs);
  const selfAssessment = rupees(args.taxesPaid?.selfAssessment);
  const challans = Array.isArray(args.taxesPaid?.challans) ? args.taxesPaid.challans : [];
  const advanceTotal = advance.reduce((total, p) => total + p.amount, 0);
  const hasGains = cg.rows.some((row) => row.gain > 0);
  if (hasGains) notes.push('Section 234C relief for capital gains was applied: interest is not charged on instalments that fell due before the gain arose. Confirm the figure with your CA.');
  const interest = interestAndFee({ ayStart: info.ayStart, dueDate, filingDate, taxLiability: netLiability, tdsAndTcs: tds + tcs, advancePayments: advance, presumptive: false, totalIncome, selfAssessment, hasCapitalGainOrLottery: hasGains });
  const interestTotal = interest.us234A + interest.us234B + interest.us234C;
  const totalTaxInterest = netLiability + interestTotal + interest.fee234F;
  const taxesPaid = advanceTotal + tds + tcs + selfAssessment;
  const balance = Math.max(0, totalTaxInterest - taxesPaid);
  const refund = Math.max(0, taxesPaid - totalTaxInterest);
  if (!args.bank?.account) problems.push({ path: 'bank', message: refund > 0 ? 'A refund is due: a bank account in your name, pre-validated on the portal, is needed to receive it.' : 'The return needs at least one bank account in your name, even when no refund is due.' });

  const carry = { shortTermCapitalLoss: cg.carryForward.stcl, longTermCapitalLoss: cg.carryForward.ltcl, houseProperty: run.hpLossCarried + run.bfHpCarried };
  if (run.hpLossCarried > 0 && !old) notes.push(`A house property loss of Rs ${run.hpLossCarried} cannot be set off in the new regime; it is carried forward.`);
  if (run.hpLossCarried > 0 && old) notes.push(`A house property loss of Rs ${run.hpLossCarried} is carried forward (set-off against other heads is limited to Rs 2 lakh and to the income available).`);

  const patch = {};
  const gains = gainSchedules({ form: 'ITR-2', cg, skeleton, args, problems, notes, calc });

  patch.CreationInfo = { SWVersionNo: '1.0', SWCreatedBy: 'SW00000001', JSONCreatedBy: 'SW00000001', JSONCreationDate: filingDate, IntermediaryCity: 'Bengaluru', Digest: '-' };
  patch.Form_ITR2 = { FormName: 'ITR-2', Description: 'For Indls and HUFs not having income from business or profession', AssessmentYear: String(info.ayStart), SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' };
  patch.PartA_GEN1 = {
    PersonalInfo: personal,
    FilingStatus: {
      ReturnFileSec: [11, 12, 13, 14, 16, 17, 18, 19].includes(Number(args.returnSection)) ? Number(args.returnSection) : 11,
      OptOutNewTaxRegime: old ? 'Y' : 'N',
      SeventhProvisio139: 'N',
      ResidentialStatus: 'RES',
      FiiFpiFlag: 'N',
      HeldUnlistedEqShrPrYrFlg: args.unlistedShares === true ? 'Y' : 'N',
      CompDirectorPrvYrFlg: args.director === true ? 'Y' : 'N',
      ItrFilingDueDate: dueDate,
    },
  };

  const salaries = salary.rows.map((row) => {
    const item = skeleton.itemAt(['ScheduleS', 'Salaries']);
    return mergeInto(item, {
      NameOfEmployer: row.name,
      NatureOfEmployment: ['CGOV', 'SGOV', 'PSU', 'PE', 'PESG'].includes(row.nature) ? row.nature : 'PE',
      ...(row.tan ? { TANofEmployer: row.tan } : {}),
      AddressDetail: {
        AddrDetail: String(row.address.line || row.address.flat || taxpayer.address?.flat || 'NA').slice(0, 200),
        CityOrTownOrDistrict: String(row.address.city || taxpayer.address?.city || 'NA').slice(0, 50),
        StateCode: String(row.address.stateCode || taxpayer.address?.stateCode || '99').padStart(2, '0'),
        ...(row.address.pin ? { PinCode: Number(String(row.address.pin).replace(/\D/g, '')) || undefined } : {}),
      },
      Salarys: { GrossSalary: row.gross + row.perquisites + row.profitsInLieu, Salary: row.gross, ValueOfPerquisites: row.perquisites, ProfitsinLieuOfSalary: row.profitsInLieu, IncomeNotified89A: 0, IncomeNotifiedOther89A: 0 },
    });
  });
  patch.ScheduleS = {
    Salaries: salaries,
    TotalGrossSalary: salary.gross,
    AllwncExtentExemptUs10: salary.exemptTotal,
    NetSalary: run.netSalary,
    DeductionUS16: standardDeduction + professionalTaxAllowed + salary.entertainment,
    DeductionUnderSection16ia: standardDeduction,
    EntertainmntalwncUs16ii: salary.entertainment,
    ProfessionalTaxUs16iii: professionalTaxAllowed,
    TotIncUnderHeadSalaries: incomeFromSalary,
  };
  if (salary.exempt.length) patch.ScheduleS.AllwncExemptUs10 = { AllwncExemptUs10Dtls: salary.exempt.map((item) => ({ SalNatureDesc: String(item.nature), SalOthAmount: rupees(item.amount) })) };
  if (salary.hra) patch.ScheduleS.Section10_13A = { Placeofwork: salary.hra.place, ActlHRARecv: salary.hra.received, ActlRentPaid: salary.hra.rentPaid, DtlsSalUsSec171: salary.hra.salaryForHra, ActlRentPaid10Per: Math.round(salary.hra.salaryForHra * 0.1), Sal40Or50Per: Math.round(salary.hra.salaryForHra * (salary.hra.place === '1' ? 0.5 : 0.4)), EligbleExmpAllwncUs10Hra: salary.hraExempt, EligbleExmpAllwncUs13A: salary.hraExempt };
  if (salary.hra) delete patch.ScheduleS.Section10_13A.EligbleExmpAllwncUs10Hra;

  const hpSchedule = houseSchedule({ rows: run.rows, skeleton, taxpayer, total: run.hpTotal });
  if (hpSchedule) patch.ScheduleHP = hpSchedule;

  Object.assign(patch, gains.patch);

  const cyla = { ...gains.cylaRows };
  cyla.TotalCurYr = { TotHPlossCurYr: run.hpLossSetoff + run.hpLossCarried, TotOthSrcLossNoRaceHorse: 0 };
  cyla.TotalLossSetOff = { TotHPlossCurYrSetoff: run.hpLossSetoff, TotOthSrcLossNoRaceHorseSetoff: 0 };
  cyla.LossRemAftSetOff = { BalHPlossCurYrAftSetoff: run.hpLossCarried, BalOthSrcLossNoRaceHorseAftSetoff: 0 };
  patch.ScheduleCYLA = cyla;
  patch.ScheduleBFLA = {
    Salary: { IncBFLA: { IncOfCurYrUndHeadFromCYLA: incomeFromSalary, IncOfCurYrAfterSetOffBFLosses: incomeFromSalary } },
    ...gains.bflaRows,
    TotalBFLossSetOff: { TotBFLossSetoff: gains.bfTotal },
    IncomeOfCurrYrAftCYLABFLA: incomeFromSalary + gains.gainsAfterSetOff - gains.bfTotal,
  };

  const otherDetails = [];
  const dividendQuarters = Array.isArray(other.dividendByQuarter) && other.dividendByQuarter.length === 5 ? other.dividendByQuarter.map(rupees) : [other.dividend, 0, 0, 0, 0];
  if (other.dividend && !(Array.isArray(other.dividendByQuarter) && other.dividendByQuarter.length === 5)) notes.push('Dividend by quarter was not given, so all of it is shown in the first quarter (up to 15 June), which is the cautious choice for 234C. Give dividendByQuarter with five amounts to correct it.');
  const osBlock = {
    GrossIncChrgblTaxAtAppRate: other.gross,
    DividendGross: other.dividend,
    DividendOthThan22e: other.dividend,
    Dividend22e: 0,
    Dividend22f: 0,
    InterestGross: other.savings + other.deposits + other.refundInterest + other.otherInterest,
    IntrstFrmSavingBank: other.savings,
    IntrstFrmTermDeposit: other.deposits,
    IntrstFrmIncmTaxRefund: other.refundInterest,
    NatofPassThrghIncome: 0,
    IntrstFrmOthers: other.otherInterest,
    RentFromMachPlantBldgs: 0,
    FamilyPension: other.familyPension,
    AnyOtherIncome: other.misc,
    IncChargeableSpecialRates: 0,
    Deductions: { Expenses: other.expenses, DeductionUs57iia: other.familyPensionDeduction, Depreciation: 0, TotDeductions: other.expenses + other.familyPensionDeduction },
    BalanceNoRaceHorse: other.net,
  };
  if (other.misc) osBlock.OthersInc = { OthersIncDtls: [{ OthNatOfInc: String(other.otherNature || 'Other income').slice(0, 50), OthAmount: other.misc }] };
  if (other.dividend) osBlock.DividendIncome = undefined;
  patch.ScheduleOS = { IncOthThanOwnRaceHorse: osBlock, TotOthSrcNoRaceHorse: other.net, IncChargeable: other.net };
  if (other.dividend) {
    patch.ScheduleOS.IncFrmLottery = undefined;
    patch.ScheduleOS.DividendQuarters = dividendQuarters;
  }

  const hpIncomeRow = Math.max(0, run.hpForTax);
  const { ShortTerm: stRows, LongTerm: ltRows, TotalCapGains: capTotal } = gains.capGain;
  const totalTI = incomeFromSalary + hpIncomeRow + capTotal + other.net;
  const hpLossUsed = Math.max(0, -run.hpForTax);
  patch['PartB-TI'] = {
    Salaries: incomeFromSalary,
    IncomeFromHP: hpIncomeRow,
    CapGain: gains.capGain,
    IncFromOS: { OtherSrcThanOwnRaceHorse: other.net, IncChargblSplRate: 0, FromOwnRaceHorse: 0, TotIncFromOS: other.net },
    TotalTI: totalTI,
    CurrentYearLoss: hpLossUsed,
    BalanceAfterSetoffLosses: Math.max(0, totalTI - hpLossUsed),
    BroughtFwdLossesSetoff: 0,
    GrossTotalIncome: Math.max(0, totalTI - hpLossUsed),
    IncChargeTaxSplRate111A112: specialTotal,
    DeductionsUnderScheduleVIA: via.total,
    TotalIncome: totalIncome,
    IncChargeableTaxSplRates: specialTotal,
    NetAgricultureIncomeOrOtherIncomeForRate: agri,
    AggregateIncome: totalIncome,
    LossesOfCurrentYearCarriedFwd: carry.shortTermCapitalLoss + carry.longTermCapitalLoss + carry.houseProperty,
    DeemedIncomeUs115JC: 0,
  };
  const grossForSummary = Math.max(0, totalTI - hpLossUsed);

  patch.PartB_TTI = {
    ComputationOfTaxLiability: {
      TaxPayableOnTI: {
        TaxAtNormalRatesOnAggrInc: calc.normalTaxPaise / PAISE,
        TaxAtSpecialRates: calc.specialTaxPaise / PAISE,
        RebateOnAgriInc: 0,
        TaxPayableOnTotInc: slabAndSpecial,
      },
      Rebate87A: rebate,
      TaxPayableOnRebate: slabAndSpecial - rebate,
      TotalSurcharge: surcharge,
      EducationCess: cess,
      GrossTaxLiability: taxPayable,
      GrossTaxPayable: taxPayable,
      CreditUS115JD: 0,
      TaxPayAfterCreditUs115JD: taxPayable,
      NetTaxLiability: netLiability,
      IntrstPay: { IntrstPayUs234A: interest.us234A, IntrstPayUs234B: interest.us234B, IntrstPayUs234C: interest.us234C, LateFilingFee234F: interest.fee234F, TotalIntrstPay: interestTotal + interest.fee234F },
      AggregateTaxInterestLiability: totalTaxInterest,
    },
    TaxPaid: { TaxesPaid: { AdvanceTax: advanceTotal, TDS: tds, TCS: tcs, SelfAssessmentTax: selfAssessment, TotalTaxesPaid: taxesPaid }, BalTaxPayable: balance },
    Refund: { RefundDue: refund, BankAccountDtls: { BankDtlsFlag: args.bank?.account ? 'Y' : 'N', AddtnlBankDetails: bankDetails(args.bank) } },
    AssetOutIndiaFlag: 'NO',
  };
  if (relief89) patch.PartB_TTI.ComputationOfTaxLiability.Relief89 = relief89;

  if (via.total > 0) patch.ScheduleVIA = { UsrDeductUndChapVIA: via.block, DeductUndChapVIA: { Section80D: 0, Section80G: 0, Section80GGA: 0, ...via.block } };
  if (old && rupees(deductions.c80) > 0) patch.Schedule80C = { Schedule80CDtls: [{ Amount: calc.section80CPaise / PAISE, IdentificationNo: 'NA' }], TotalAmt: calc.section80CPaise / PAISE };

  patch.ScheduleTDS1 = {
    TDSonSalary: tdsSalary.filter((x) => x.tan).map((x) => ({ EmployerOrDeductorOrCollectDetl: { TAN: String(x.tan).toUpperCase(), EmployerOrDeductorOrCollecterName: String(x.name || '').slice(0, 125) }, IncChrgSal: rupees(x.income), TotalTDSSal: rupees(x.tds) })),
    TotalTDSonSalaries: sum(...tdsSalary.map((x) => rupees(x.tds))),
  };
  patch.ScheduleTDS2 = {
    TDSOthThanSalaryDtls: tdsOther.filter((x) => x.tan).map((x) => ({
      TDSCreditName: 'S',
      TANOfDeductor: String(x.tan).toUpperCase(),
      TDSSection: String(x.section || '193'),
      TaxDeductCreditDtls: { TaxDeductedOwnHands: rupees(x.tds), TaxDeductedIncome: rupees(x.gross), TaxDeductedTDS: rupees(x.tds), TaxClaimedOwnHands: rupees(x.tds), TaxClaimedIncome: rupees(x.gross), TaxClaimedTDS: rupees(x.tds) },
      GrossAmount: rupees(x.gross),
      HeadOfIncome: ['HP', 'CG', 'OS', 'EI', 'NA'].includes(x.head) ? x.head : 'OS',
      AmtCarriedFwd: 0,
    })),
    TotalTDSonOthThanSals: sum(...tdsOther.map((x) => rupees(x.tds))),
  };
  patch.ScheduleIT = { TaxPayment: taxPayments(challans, notes), TotalTaxPayments: taxPayments(challans, []).reduce((total, item) => total + item.Amt, 0) };
  patch.Verification = {
    Declaration: { AssesseeVerName: String(taxpayer.name || '').slice(0, 125), FatherName: String(taxpayer.fatherName || '').slice(0, 125), AssesseeVerPAN: personal.PAN },
    Capacity: 'S',
    Place: String(taxpayer.address?.city || '').slice(0, 50),
    Date: filingDate,
  };

  const cleaned = JSON.parse(JSON.stringify(patch));
  if (cleaned.ScheduleOS) delete cleaned.ScheduleOS.DividendQuarters;
  layer(skeleton.body, cleaned, [], skeleton.itemAt);
  const body = skeleton.body;
  gains.finishBody(body);
  pruneEmpty(body, [['ScheduleIT', 'TaxPayment'], ['ScheduleTDS1', 'TDSonSalary'], ['ScheduleTDS2', 'TDSOthThanSalaryDtls'], ['ScheduleS', 'Salaries']]);
  if (!salary.rows.length) delete body.ScheduleS;
  if (!other.gross && !other.expenses) delete body.ScheduleOS;
  const itr = { ITR: { ITR2: body } };
  return finish({ form: 'ITR-2', itr, schema: skeleton.schema, info, notes, problems, warnings, summary: {
    regime: chosen,
    comparedRegimes: compared,
    incomeFromSalary,
    incomeFromHouseProperty: run.hpTotal,
    shortTermGains: stRows.TotalShortTerm,
    longTermGains: ltRows.TotalLongTerm,
    exemption112A: cg.exemption112A,
    incomeFromOtherSources: other.net,
    grossTotalIncome: grossForSummary,
    totalIncome,
    taxAtNormalRates: calc.normalTaxPaise / PAISE,
    taxAtSpecialRates: calc.specialTaxPaise / PAISE,
    rebate87A: rebate,
    surcharge,
    cess,
    grossTaxLiability: taxPayable,
    interest234A: interest.us234A,
    interest234B: interest.us234B,
    interest234C: interest.us234C,
    lateFee234F: interest.fee234F,
    taxesPaid,
    balanceTaxPayable: balance,
    refundDue: refund,
    lossesToCarryForward: carry,
    indexationChoice: cg.indexationChoice,
  }, checks: [] });
}
