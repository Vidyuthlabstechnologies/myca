const num = (value) => (value === undefined || value === null || value === '' ? 0 : Number(value) || 0);
const list = (value) => (Array.isArray(value) ? value : []);
const sumOf = (items, pick) => list(items).reduce((total, item) => total + num(pick(item)), 0);

const salaryRules = [
  { id: 'S-GROSS-ROW', cbdt: 'A-22', text: 'Gross salary of each employer is salary plus perquisites plus profits in lieu of salary.', test: (b) => list(b.ScheduleS?.Salaries).every((row) => num(row.Salarys?.GrossSalary) === num(row.Salarys?.Salary) + num(row.Salarys?.ValueOfPerquisites) + num(row.Salarys?.ProfitsinLieuOfSalary) + num(row.Salarys?.IncomeNotified89A) + num(row.Salarys?.IncomeNotifiedOther89A) + num(row.Salarys?.IncomeNotifiedPrYr89A)) },
  { id: 'S-TOTAL-GROSS', cbdt: 'A-23', text: 'Total gross salary is the sum of the gross salary of every employer.', test: (b) => !b.ScheduleS || num(b.ScheduleS.TotalGrossSalary) === sumOf(b.ScheduleS.Salaries, (row) => row.Salarys?.GrossSalary) },
  { id: 'S-EXEMPT-TOTAL', cbdt: 'A-24', text: 'Allowances exempt under section 10 equal the sum of the listed allowances.', test: (b) => !b.ScheduleS || !b.ScheduleS.AllwncExemptUs10 && !b.Section10_13A ? true : num(b.ScheduleS.AllwncExtentExemptUs10) === sumOf(b.ScheduleS.AllwncExemptUs10?.AllwncExemptUs10Dtls, (row) => row.SalOthAmount) + num(b.ScheduleS.Section10_13A?.EligbleExmpAllwncUs13A) },
  { id: 'S-NET', cbdt: 'A-25', text: 'Net salary is total gross salary less exempt allowances and relief under 89A.', test: (b) => !b.ScheduleS || num(b.ScheduleS.NetSalary) === num(b.ScheduleS.TotalGrossSalary) - num(b.ScheduleS.AllwncExtentExemptUs10) - num(b.ScheduleS.Increliefus89A) },
  { id: 'S-DEDUCTION-16', cbdt: 'A-26', text: 'Deductions under section 16 are the sum of standard deduction, entertainment allowance and professional tax.', test: (b) => !b.ScheduleS || num(b.ScheduleS.DeductionUS16) === num(b.ScheduleS.DeductionUnderSection16ia) + num(b.ScheduleS.EntertainmntalwncUs16ii) + num(b.ScheduleS.ProfessionalTaxUs16iii) },
  { id: 'S-INCOME', cbdt: 'A-27', text: 'Income under salaries is net salary less deductions under section 16.', test: (b) => !b.ScheduleS || num(b.ScheduleS.TotIncUnderHeadSalaries) === Math.max(0, num(b.ScheduleS.NetSalary) - num(b.ScheduleS.DeductionUS16)) },
  { id: 'S-PROFESSIONAL-TAX', cbdt: 'A-37', text: 'Professional tax under 16(iii) is allowed up to Rs 5,000.', test: (b) => !b.ScheduleS || num(b.ScheduleS.ProfessionalTaxUs16iii) <= 5000 },
  { id: 'S-STANDARD-DEDUCTION', cbdt: 'A-40', text: 'Standard deduction cannot exceed Rs 75,000 (Rs 50,000 under the old regime) or the net salary.', test: (b, regime) => !b.ScheduleS || num(b.ScheduleS.DeductionUnderSection16ia) <= Math.min(num(b.ScheduleS.NetSalary), regime === 'old' ? 50000 : 75000) },
];

const houseRules = [
  { id: 'HP-STANDARD-DEDUCTION', cbdt: 'A-67', text: 'The standard deduction on house property is 30% of the annual value.', test: (b) => list(b.ScheduleHP?.PropertyDetails).every((row) => !row.Rentdetails || row.ifLetOut === 'S' || num(row.Rentdetails.ThirtyPercentOfBalance) === Math.round(num(row.Rentdetails.AnnualOfPropOwned) * 0.3)) },
  { id: 'HP-SELF-OCCUPIED-INTEREST', cbdt: 'A-72', text: 'Interest on a self-occupied property is limited to Rs 2 lakh.', test: (b) => list(b.ScheduleHP?.PropertyDetails).every((row) => row.ifLetOut !== 'S' || num(row.Rentdetails?.IntOnBorwCap) <= 200000) },
  { id: 'HP-LET-OUT-RENT', cbdt: 'A-74', text: 'A let-out property needs rent greater than zero.', test: (b) => list(b.ScheduleHP?.PropertyDetails).every((row) => row.ifLetOut === 'S' || num(row.Rentdetails?.AnnualLetableValue) > 0) },
  { id: 'HP-ANNUAL-VALUE', cbdt: 'A-75', text: 'The annual value is rent less unrealised rent and tax.', test: (b) => list(b.ScheduleHP?.PropertyDetails).every((row) => !row.Rentdetails || row.ifLetOut === 'S' || num(row.Rentdetails.BalanceALV) === Math.max(0, num(row.Rentdetails.AnnualLetableValue) - num(row.Rentdetails.TotalUnrealizedAndTax))) },
  { id: 'HP-INCOME', cbdt: 'A-78', text: 'Income from a property is annual value less deductions plus arrears.', test: (b) => list(b.ScheduleHP?.PropertyDetails).every((row) => {
    const r = row.Rentdetails;
    if (!r) return true;
    const arrears = num(r.ArrearsUnrealizedRentRcvd);
    return num(r.IncomeOfHP) === num(r.BalanceALV) - num(r.TotalDeduct) + arrears - Math.round(arrears * 0.3);
  }) },
  { id: 'HP-TOTAL', cbdt: 'A-73', text: 'Income chargeable under house property is the sum of all properties and pass-through income.', test: (b) => !b.ScheduleHP || num(b.ScheduleHP.TotalIncomeChargeableUnHP) === sumOf(b.ScheduleHP.PropertyDetails, (row) => row.Rentdetails?.IncomeOfHP) + num(b.ScheduleHP.PassThroghIncome) },
  { id: 'HP-NEW-REGIME-INTEREST', cbdt: 'A-81', text: 'Interest on a self-occupied property is not allowed in the new regime.', test: (b, regime) => regime !== 'new' || list(b.ScheduleHP?.PropertyDetails).every((row) => row.ifLetOut !== 'S' || num(row.Rentdetails?.IntOnBorwCap) === 0) },
];

const sched112Rules = [
  { id: '112A-SALE', cbdt: 'A-84', text: 'Total sale value is units multiplied by the price per unit.', test: (b) => list(b.Schedule112A?.Schedule112ADtls).every((row) => !row.NumSharesUnits || Math.abs(num(row.NumSharesUnits) * num(row.SalePricePerShareUnit) - num(row.TotSaleValue)) <= 1) },
  { id: '112A-COST', cbdt: 'A-85', text: 'Cost of acquisition without indexation is the higher of the cost and the grandfathered value.', test: (b) => list(b.Schedule112A?.Schedule112ADtls).every((row) => num(row.CostAcqWithoutIndx) === Math.max(num(row.AcquisitionCost), num(row.LTCGBeforelowerB1B2 ?? row.LTCGBeforelower6and11))) },
  { id: '112A-GRANDFATHER', cbdt: 'A-86', text: 'For assets bought before 1 February 2018 the grandfathered value is the lower of the sale value and the value on 31 January 2018.', test: (b) => list(b.Schedule112A?.Schedule112ADtls).every((row) => row.ShareOnOrBefore !== 'BE' || num(row.LTCGBeforelowerB1B2 ?? row.LTCGBeforelower6and11) === Math.min(num(row.TotSaleValue), num(row.TotFairMktValueCapAst))) },
  { id: '112A-DEDUCTIONS', cbdt: 'A-88', text: 'Total deductions are the cost of acquisition without indexation plus transfer expenses.', test: (b) => list(b.Schedule112A?.Schedule112ADtls).every((row) => num(row.TotalDeductions) === num(row.CostAcqWithoutIndx) + num(row.ExpExclCnctTransfer)) },
  { id: '112A-BALANCE', cbdt: 'A-89', text: 'The balance is the sale value less total deductions.', test: (b) => list(b.Schedule112A?.Schedule112ADtls).every((row) => num(row.Balance) === num(row.TotSaleValue) - num(row.TotalDeductions)) },
  { id: '112A-TOTAL', cbdt: 'A-90', text: 'The schedule total equals the sum of the rows.', test: (b) => !b.Schedule112A || (num(b.Schedule112A.SaleValue112A) === sumOf(b.Schedule112A.Schedule112ADtls, (row) => row.TotSaleValue) && num(b.Schedule112A.Balance112A) === sumOf(b.Schedule112A.Schedule112ADtls, (row) => row.Balance) && num(b.Schedule112A.TotalBalance112A) === num(b.Schedule112A.Balance112ABE) + num(b.Schedule112A.Balance112AAE)) },
];

const gainRules = [
  { id: 'CG-STCG-TOTAL', cbdt: 'A-98', text: 'Total short-term gain equals the sum of its parts.', test: (b) => {
    const st = b.ScheduleCGFor23?.ShortTermCapGainFor23;
    if (!st) return true;
    const parts = sumOf(st.EquityMFonSTT, (row) => row.TotalCapGainonassets) + num(st.SaleOnOtherAssets?.CapgainonAssets) + sumOf(st.SaleofLandBuild?.SaleofLandBuildDtls, (row) => row.STCGonImmvblPrprty ?? row.CapgainonAssets) + num(st.TotalAmtDeemedStcg);
    return num(st.TotalSTCG) === parts;
  } },
  { id: 'CG-LTCG-TOTAL', cbdt: 'A-99', text: 'Total long-term gain equals the sum of its parts.', test: (b) => {
    const lt = b.ScheduleCGFor23?.LongTermCapGain23;
    if (!lt) return true;
    const property = sumOf(lt.SaleofLandBuild?.SaleofLandBuildDtls, (row) => row.LTCGonImmvblPrprty ?? row.CapgainonAssets) + num(0);
    const propertyBE = sumOf(lt.SaleofLandBuild?.SaleofLandBuildDtls, (row) => row.LTCGonImmvblPrprtyBE);
    const parts = property + propertyBE + num(lt.SaleOfEquityShareUs112A?.CapgainonAssets) + num(lt.SaleofAssetNADtls?.TotalCapgainonAssets) + num(lt.TotalAmtDeemedLtcg);
    return num(lt.TotalLTCG) === parts;
  } },
  { id: 'CG-FORM-TOTAL', cbdt: 'A-100', text: 'Capital gains chargeable are the short-term plus long-term gains after current-year set-off.', test: (b) => {
    const cg = b.ScheduleCGFor23;
    if (!cg) return true;
    const net = num(cg.ShortTermCapGainFor23?.TotalSTCG) + num(cg.LongTermCapGain23?.TotalLTCG);
    return net < 0 ? num(cg.SumOfCGIncm) === 0 : num(cg.SumOfCGIncm) <= net + 0.5 && num(cg.SumOfCGIncm) >= 0;
  } },
  { id: 'CG-112A-MATCH', cbdt: '', text: 'The long-term gain on equity in Schedule CG equals the Schedule 112A balance.', test: (b) => !b.Schedule112A || num(b.ScheduleCGFor23?.LongTermCapGain23?.SaleOfEquityShareUs112A?.CapgainonAssets) === num(b.Schedule112A.TotalBalance112A) },
  { id: 'CG-PARTB-TI', cbdt: '', text: 'The capital gains in Part B-TI equal the sum of the rows.', test: (b) => {
    const cap = b['PartB-TI']?.CapGain;
    if (!cap) return true;
    const st = cap.ShortTerm;
    const lt = cap.LongTerm;
    return num(st.TotalShortTerm) === num(st.ShortTerm15Per) + num(st.ShortTerm20Per) + num(st.ShortTerm30Per) + num(st.ShortTermAppRate) + num(st.ShortTermSplRateDTAA)
      && num(lt.TotalLongTerm) === num(lt.LongTerm10Per) + num(lt['LongTerm12_5Per']) + num(lt.LongTerm20Per) + num(lt.LongTermSplRateDTAA)
      && num(cap.TotalCapGains) === num(st.TotalShortTerm) + num(lt.TotalLongTerm) + num(cap.CapGains30Per115BBH);
  } },
  { id: 'SI-TOTAL', cbdt: '', text: 'Schedule SI income and tax equal the sum of the rows.', test: (b) => !b.ScheduleSI || (num(b.ScheduleSI.TotSplRateInc) === sumOf(b.ScheduleSI.SplCodeRateTax, (row) => row.SplRateInc) && num(b.ScheduleSI.TotSplRateIncTax) === sumOf(b.ScheduleSI.SplCodeRateTax, (row) => row.SplRateIncTax)) },
];

const partBRules = [
  { id: 'TI-TOTAL', cbdt: '', text: 'Total income heads add up to the total in Part B-TI.', test: (b) => {
    const ti = b['PartB-TI'];
    if (!ti) return true;
    const business = num(ti.ProfBusGain?.TotProfBusGain);
    return num(ti.TotalTI) === num(ti.Salaries) + num(ti.IncomeFromHP) + business + num(ti.CapGain?.TotalCapGains) + num(ti.IncFromOS?.TotIncFromOS);
  } },
  { id: 'TI-GROSS-TOTAL', cbdt: '', text: 'Gross total income is total income less current-year and brought-forward losses.', test: (b) => {
    const ti = b['PartB-TI'];
    return !ti || num(ti.GrossTotalIncome) === Math.max(0, num(ti.TotalTI) - num(ti.CurrentYearLoss) - num(ti.BroughtFwdLossesSetoff));
  } },
  { id: 'TTI-ROLLUP', cbdt: '', text: 'Tax rebate, surcharge, cess and interest roll up correctly.', test: (b) => {
    const tax = b.PartB_TTI?.ComputationOfTaxLiability;
    if (!tax || !tax.TaxPayableOnTI) return true;
    const t = tax.TaxPayableOnTI;
    const payable = num(t.TaxAtNormalRatesOnAggrInc) + num(t.TaxAtSpecialRates);
    const rebate = num(t.Rebate87A ?? tax.Rebate87A);
    const afterRebate = num(t.TaxPayableOnRebate ?? tax.TaxPayableOnRebate);
    const surcharge = num(t.TotalSurcharge ?? tax.TotalSurcharge);
    const cess = num(t.EducationCess ?? tax.EducationCess);
    const gross = num(t.GrossTaxLiability ?? tax.GrossTaxLiability);
    return num(t.TaxPayableOnTotInc) === payable && afterRebate === payable - rebate && Math.abs(gross - (afterRebate + surcharge + cess)) <= 10;
  } },
  { id: 'TTI-INTEREST', cbdt: '', text: 'Interest and fee add up and the aggregate liability is tax plus interest.', test: (b) => {
    const tax = b.PartB_TTI?.ComputationOfTaxLiability;
    if (!tax?.IntrstPay) return true;
    const i = tax.IntrstPay;
    return num(i.TotalIntrstPay) === num(i.IntrstPayUs234A) + num(i.IntrstPayUs234B) + num(i.IntrstPayUs234C) + num(i.LateFilingFee234F) && num(tax.AggregateTaxInterestLiability) === num(tax.NetTaxLiability) + num(i.TotalIntrstPay);
  } },
  { id: 'TTI-REFUND-BALANCE', cbdt: '', text: 'Refund or balance payable matches taxes paid against the liability.', test: (b) => {
    const tti = b.PartB_TTI;
    if (!tti?.TaxPaid || !tti.ComputationOfTaxLiability) return true;
    const paid = num(tti.TaxPaid.TaxesPaid?.TotalTaxesPaid);
    const owed = num(tti.ComputationOfTaxLiability.AggregateTaxInterestLiability);
    return num(tti.Refund?.RefundDue) === Math.max(0, paid - owed) && num(tti.TaxPaid.BalTaxPayable) === Math.max(0, owed - paid);
  } },
  { id: 'TAXES-PAID', cbdt: '', text: 'Total taxes paid is the sum of advance tax, TDS, TCS and self-assessment tax.', test: (b) => {
    const p = b.PartB_TTI?.TaxPaid?.TaxesPaid || b.TaxPaid?.TaxesPaid;
    return !p || num(p.TotalTaxesPaid) === num(p.AdvanceTax) + num(p.TDS) + num(p.TCS) + num(p.SelfAssessmentTax);
  } },
];

const itr1Rules = [
  { id: 'ITR1-GROSS-TOTAL', cbdt: '', text: 'Gross total income is salary, house property and other sources.', test: (b) => {
    const i = b.ITR1_IncomeDeductions;
    return !i || num(i.GrossTotIncome) === num(i.IncomeFromSal) + num(i.TotalIncomeOfHP) + num(i.IncomeOthSrc);
  } },
  { id: 'ITR1-TAX-ROLLUP', cbdt: '', text: 'Tax, rebate, cess and interest roll up.', test: (b) => {
    const t = b.ITR1_TaxComputation;
    return !t || (num(t.TaxPayableOnRebate) === num(t.TotalTaxPayable) - num(t.Rebate87A) && num(t.TotTaxPlusIntrstPay) === num(t.NetTaxLiability) + num(t.TotalIntrstPay));
  } },
  { id: 'ITR1-TAXES-PAID', cbdt: '', text: 'Taxes paid add up and refund or balance matches.', test: (b) => {
    const p = b.TaxPaid?.TaxesPaid;
    const t = b.ITR1_TaxComputation;
    if (!p || !t) return true;
    const paid = num(p.TotalTaxesPaid);
    return paid === num(p.AdvanceTax) + num(p.TDS) + num(p.TCS) + num(p.SelfAssessmentTax) && num(b.Refund?.RefundDue) === Math.max(0, paid - num(t.TotTaxPlusIntrstPay)) && num(b.TaxPaid.BalTaxPayable) === Math.max(0, num(t.TotTaxPlusIntrstPay) - paid);
  } },
];

const RULES = {
  'ITR-1': itr1Rules,
  'ITR-2': [...salaryRules, ...houseRules, ...sched112Rules, ...gainRules, ...partBRules],
  'ITR-3': [...houseRules, ...sched112Rules, ...gainRules, ...partBRules],
  'ITR-4': [],
};

export function runItrRules(form, body, { regime } = {}) {
  const rules = RULES[form] || [];
  const failures = [];
  for (const rule of rules) {
    let ok = true;
    try {
      ok = rule.test(body, regime) !== false;
    } catch {
      ok = false;
    }
    if (!ok) failures.push({ id: `${form}-${rule.id}`, cbdt: form === 'ITR-2' && rule.cbdt ? `${form}-${rule.cbdt}` : '', message: rule.text });
  }
  return { ran: rules.length, failures };
}

export function itrRuleCount(form) {
  return (RULES[form] || []).length;
}
