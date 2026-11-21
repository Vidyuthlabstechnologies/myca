export const MEF_NAMESPACE = 'http://www.irs.gov/efile';

export const FILING_STATUS_CODES = Object.freeze({ single: '1', mfj: '2', mfs: '3', hoh: '4', qss: '5' });

export const MEF_ELEMENT_SOURCE = Object.freeze({
  2025: 'IRS MeF stylesheets for tax year 2025, irs.gov/pub/irs-schema/py2026r1.zip (Stylesheets/2025), read 2026-11-21',
  2026: 'IRS MeF stylesheets for tax year 2026, irs.gov/pub/irs-schema/py2027r1.zip (Stylesheets/2026), read 2026-11-21',
});

const rows = (text) => Object.freeze(text.trim().split(/\s+/).reduce((out, word, index, words) => (index % 2 ? out : [...out, Object.freeze([word, words[index + 1]])]), []));

const FORM_1040_2025 = rows(`
  1a WagesAmt  1b HouseholdEmployeeWagesAmt  1c TipIncomeAmt  1d MedicaidWaiverPymtNotRptW2Amt  1e TaxableBenefitsAmt  1f TaxableBenefitsForm8839Amt
  1g TotalWagesWithNoWithholdingAmt  1h OtherEarnedIncomeAmt  1i NontxCombatPayElectionAmt  1z WagesSalariesAndTipsAmt  2a TaxExemptInterestAmt  2b TaxableInterestAmt
  3a QualifiedDividendsAmt  3b OrdinaryDividendsAmt  4a IRADistributionsAmt  4b TaxableIRAAmt  5a PensionsAnnuitiesAmt  5b TotalTaxablePensionsAmt
  6a SocSecBnftAmt  6b TaxableSocSecAmt  7a CapitalGainLossAmt  8 TotalAdditionalIncomeAmt  9 TotalIncomeAmt  10 TotalAdjustmentsAmt  11a AdjustedGrossIncomeAmt
  12e TotalItemizedOrStandardDedAmt  13a QualifiedBusinessIncomeDedAmt  13b TotalAdditionalDeductionsAmt  14 TotalDeductionsAmt  15 TaxableIncomeAmt  16 TaxAmt
  17 AdditionalTaxAmt  18 TotalTaxBeforeCrAndOthTaxesAmt  19 CTCODCAmt  20 TotalNonrefundableCreditsAmt  21 TotalCreditsAmt  22 TaxLessCreditsAmt
  23 TotalOtherTaxesAmt  24 TotalTaxAmt  25a FormW2WithheldTaxAmt  25b Form1099WithheldTaxAmt  25c TaxWithheldOtherAmt  25d WithholdingTaxAmt
  26 EstimatedTaxPaymentsAmt  27a EarnedIncomeCreditAmt  28 AdditionalChildTaxCreditAmt  29 RefundableAmerOppCreditAmt  31 TotalOtherPaymentsRfdblCrAmt
  32 RefundableCreditsAmt  33 TotalPaymentsAmt  34 OverpaidAmt  35a RefundAmt  36 AppliedToEsTaxAmt  37 OwedAmt  38 EsPenaltyAmt
`);

const FORM_1040_2026 = rows(`
  1a WagesAmt  1b HouseholdEmployeeWagesAmt  1c TipIncomeAmt  1d MedicaidWaiverPymtNotRptW2Amt  1e TaxableBenefitsAmt  1f TaxableBenefitsForm8839Amt
  1g TotalWagesWithNoWithholdingAmt  1h OtherEarnedIncomeAmt  1i NontxCombatPayElectionAmt  1z WagesSalariesAndTipsAmt  2a TaxExemptInterestAmt  2b TaxableInterestAmt
  3a QualifiedDividendsAmt  3b OrdinaryDividendsAmt  4a IRADistributionsAmt  4b TaxableIRAAmt  5a PensionsAnnuitiesAmt  5b TotalTaxablePensionsAmt
  6a SocSecBnftAmt  6b TaxableSocSecAmt  7a CapitalGainLossAmt  8 TotalAdditionalIncomeAmt  9 TotalIncomeAmt  10 TotalAdjustmentsAmt  11a AdjustedGrossIncomeAmt
  12e TotalItemizedOrStandardDedAmt  12f CharitableContributionAmt  13a TotalAdditionalDeductionsAmt  13b QualifiedBusinessIncomeDedAmt  14 TotalDeductionsAmt
  15 TaxableIncomeAmt  16 TaxAmt  17 AdditionalTaxAmt  18 TotalTaxBeforeCrAndOthTaxesAmt  19 CTCODCAmt  20 TotalNonrefundableCreditsAmt  21 TotalCreditsAmt
  22 TaxLessCreditsAmt  23 TotalAdditionalTaxesAmt  24a TotalTaxAmt  24c TotalTaxAfter1062TaxAmt  25a FormW2WithheldTaxAmt  25b Form1099WithheldTaxAmt
  25c TaxWithheldOtherAmt  25d WithholdingTaxAmt  26 EstimatedTaxPaymentsAmt  27a EarnedIncomeCreditAmt  28 AdditionalChildTaxCreditAmt  29 RefundableAmerOppCreditAmt
  31 TotalOtherPaymentsRfdblCrAmt  32a RefundableCreditsAmt  32c CalcRefundableCrAmt  33 TotalPaymentsAmt  34 OverpaidAmt  35a RefundAmt  36 AppliedToEsTaxAmt
  37 OwedAmt  38 EsPenaltyAmt
`);

const SCHEDULE_1 = rows(`
  1 StateLocalIncomeTaxRefundAmt  2a TotalAlimonyReceivedAmt  3 BusinessIncomeLossAmt  4 OtherGainLossAmt  5 RentalRealEstateIncomeLossAmt  6 NetFarmProfitLossAmt
  7 UnemploymentCompAmt  8f TotHSADistriHDHPAmt  8z OtherIncomeTotalAmt  9 TotalOtherIncomeAmt  10 TotalAdditionalIncomeAmt  11 EducatorExpensesAmt
  13 HealthSavingsAccountDedAmt  15 DeductibleSelfEmploymentTaxAmt  16 SelfEmpldSepSimpleQlfyPlansAmt  17 SelfEmpldHealthInsDedAmt  18 PnltyOnErlyWthdrwOfSavingsAmt
  20 IRADeductionAmt  21 StudentLoanInterestDedAmt  26 TotalAdjustmentsAmt
`);

const SCHEDULE_1A_2025 = rows(`13 QualifiedTipsDeductionAmt  21 QualifiedOvertimeCompDedAmt  30 QualifiedCarLoanInterestDedAmt  37 EnhancedSeniorDeductionAmt  38 TotalAdditionalDeductionsAmt`);

const SCHEDULE_1A_2026 = rows(`15 QualifiedTipsDeductionAmt  27 QualifiedOvertimeCompDedAmt  36 NoTaxCarLoanInterestGrp/QualifiedCarLoanInterestDedAmt  43 EnhancedSeniorDeductionAmt  44 TotalAdditionalDeductionsAmt`);

const SCHEDULE_2_2025 = rows(`
  1a PremiumTaxCreditTaxLiabAmt  1z TotalTaxAdditionsAmt  2 AlternativeMinimumTaxAmt  3 AdditionalTaxAmt  4 SelfEmploymentTaxAmt  8 TaxOnIRAsAmt
  11 TotalAMRRTTaxAmt  12 IndivNetInvstIncomeTaxAmt  17c HSADistriAddnlPercentTaxAmt  17d HDHPCoverageAddnlTaxAmt  18 TotalOtherAdditionalTaxesAmt  21 TotalOtherTaxesAmt
`);

const SCHEDULE_2_2026 = rows(`
  1a PremiumTaxCreditTaxLiabAmt  1z TotalTaxAdditionsAmt  2 AlternativeMinimumTaxAmt  3 AdditionalTaxAmt  4 SelfEmploymentTaxAmt  5 TotAddnlTaxDistributionsAmt
  6 IndivNetInvstIncomeTaxAmt  11 AddlSelfEmploymentTaxAmt  13c HSADistriAddnlPercentTaxAmt  13d HDHPCoverageAddnlTaxAmt  14 TotOthAdditionalIncomeTaxesAmt
  15 SumAdditionalIncomeTaxesAmt  17b TotalAMRRTTaxAmt  17d TotalOtherEmploymentTaxesAmt  18 TotAddnlTaxExContributionsAmt  20 TotAddnlEmplmnOtherTxsAmt
  21 TotalAdditionalTaxesAmt
`);

const SCHEDULE_3 = rows(`
  1 ForeignTaxCreditAmt  2 CreditForChildAndDepdCareAmt  3 EducationCreditAmt  4 RtrSavingsContributionsCrAmt  5a ResidentialCleanEnergyCrAmt  5b EgyEffcntHmImprvCrAmt
  8 TotalNonrefundableCreditsAmt  9 ReconciledPremiumTaxCreditAmt  11 ExcessSocSecAndTier1RRTATaxAmt  15 TotalOtherPaymentsRfdblCrAmt
`);

const SCHEDULE_C_2025 = rows(`
  1 TotalGrossReceiptsAmt  2 ReturnsAndAllowancesAmt  3 NetGrossReceiptsAmt  4 CostOfGoodsSoldAmt  5 GrossProfitAmt  6 OtherIncomeAmt  7 GrossIncomeAmt
  8 AdvertisingAmt  9 CarAndTruckExpensesAmt  10 CommissionsAndFeesAmt  11 ContractLaborAmt  12 DepletionAmt  13 DeprecAndSect179ExpnsDedAmt
  14 EmployeeBenefitProgramAmt  15 InsuranceAmt  16a MortgageInterestPaidBanksAmt  16b MortgageInterestPaidOtherAmt  17 LegalAndProfessionalServiceAmt
  18 OfficeExpensesAmt  19 PensionProfitSharingPlansAmt  20a MachineryAndEquipmentRentAmt  20b OtherBusinessPropertyRentAmt  21 RepairsAndMaintenanceAmt
  22 SuppliesAmt  23 TaxesAndLicensesAmt  24a TravelAmt  24b MealsAndEntertainmentAmt  25 UtilitiesAmt  26 WagesLessEmploymentCreditsAmt
  27a EnergyEffcntCmrclBldgDedAmt  27b TotalOtherExpensesAmt  28 TotalExpensesAmt  29 TentativeProfitOrLossAmt  30 HomeBusinessExpenseAmt  31 NetProfitOrLossAmt
`);

const SCHEDULE_C_2026 = Object.freeze(SCHEDULE_C_2025.flatMap(([line, element]) => (line === '16b' ? [Object.freeze(['16b', 'VehicleLoanInterestAmt']), Object.freeze(['16c', element])] : [Object.freeze([line, element])])));

const SCHEDULE_SE = rows(`
  1a NetFarmProfitLossAmt  1b ConservationReserveProgPymtAmt  2 NetNonFarmProfitLossAmt  3 SETotalNetEarningsOrLossAmt  4a MinimumProfitForSETaxAmt
  4b OptionalMethodAmt  4c CombinedSEAmt  5a W2WagesFromChurchesAmt  5b MinAllowableChurchWagesAmt  6 CombinedSEAndChurchWagesAmt  8a SSTWagesRRTCompAmt
  8b UnreportedTipsAmt  8c WagesSubjectToSSTAmt  8d TotalWagesAndUnreportedTipsAmt  9 AllowableSEAmt  10 TaxBaseAmt  11 SEBaseAmt  12 SelfEmploymentTaxAmt
  13 DeductibleSelfEmploymentTaxAmt
`);

const SCHEDULE_8812 = rows(`
  1 AdjustedGrossIncomeAmt  3 ModifiedAGIAmt  4 QlfyChildUnderAgeSSNCnt  5 QlfyChildUnderAgeSSNLimtAmt  6 OtherDependentCnt  7 OtherDependentCreditAmt
  8 InitialCTCODCAmt  9 FilingStatusThresholdCd  10 ExcessAdjGrossIncomeAmt  11 ModifiedAGIPhaseOutAmt  12 CTCODCAfterAGILimitAmt  13 ACTCTaxLiabiltyLimitAmt
  14 CTCODCAmt  16a ClaimACTCAllFilersGrp/ACTCBeforeLimitAmt  16b ClaimACTCAllFilersGrp/QlfyChildUnderAgeSSNLimtAmt  17 ClaimACTCAllFilersGrp/ACTCAfterLimitAmt
  18a ClaimACTCAllFilersGrp/TotalEarnedIncomeAmt  18b ClaimACTCAllFilersGrp/NontaxableCombatPayAmt  19 ClaimACTCAllFilersGrp/NetTotalEarnedIncomeAmt
  20 ClaimACTCAllFilersGrp/NetEarnedIncomeCalculatedAmt  21 ClaimACTCAllFilersGrp/FromW2Amt  22 ClaimACTCAllFilersGrp/FromTaxReturnAmt
  23 ClaimACTCAllFilersGrp/CalcFromW2AndReturnAmt  24 ClaimACTCAllFilersGrp/CalcAmtFromRetPlusTaxWhldAmt  25 ClaimACTCAllFilersGrp/CalculatedDifferenceAmt
  26 ClaimACTCAllFilersGrp/LargerCalcIncomeOrDiffAmt  27 AdditionalChildTaxCreditAmt
`);

const SCHEDULE_B = rows(`2 TaxableInterestSubtotalAmt  3 ExcludableSavingsBondIntAmt  4 CalculatedTotalTaxableIntAmt  6 TotalOrdinaryDividendsAmt`);

const SCHEDULE_D = rows(`
  box.A TotalSTCGL1099BShowsBasisGrp  box.B TotalSTCGL1099BNotShowBasisGrp  4 STGainOrLossFromFormsAmt  5 NetSTGainOrLossFromSchK1Amt  6 STCapitalLossCarryoverAmt
  7 NetSTCapitalGainOrLossAmt  box.D TotalLTCGL1099BShowsBasisGrp  box.E TotalLTCGL1099BNotShowBasisGrp  11 LTGainOrLossFromFormsAmt  12 NetLTGainOrLossFromSchK1Amt
  13 CapitalGainDistributionsAmt  14 LTCapitalLossCarryoverAmt  15 NetLTCapitalGainOrLossAmt  16 NetSTAndLTCapitalGainOrLossAmt  q17 STAndLTGainInd
  q20 ZeroOrBlankInd  21 AllowableLossAmt  q22 QualifiedDividendsInd
`);

const FORM_8995_2025 = rows(`
  2 TotQlfyBusinessIncomeOrLossAmt  3 PYQlfyBusinessNetLossCfwdAmt  4 TotQualifiedBusinessIncomeAmt  5 QBIComponentAmt  6 QlfyREITDivPTPIncomeLossAmt
  7 PYQlfyREITDivPTPLossCfwdAmt  8 TotQlfyREITDivPTPIncomeAmt  9 REITPTPComponentAmt  10 QBIDedBfrIncomeLimitationAmt  11 TaxableIncomeBeforeQBIDedAmt
  12 NetCapitalGainAmt  13 AdjustedTaxableIncomeAmt  14 IncomeLimitationAmt  15 QualifiedBusinessIncomeDedAmt  16 TotQlfyBusLossCarryforwardAmt
  17 TotQlfyREITDivPTPLossCfwdAmt
`);

const FORM_8995_2026 = Object.freeze([
  ...FORM_8995_2025.filter(([line]) => Number(line) < 15),
  ...rows(`15 QBIDedBeforeMinimumDedAmt  16 MinDedActiveQlfyBusIncomeAmt  17 QualifiedBusinessIncomeDedAmt  18 TotQlfyBusLossCarryforwardAmt  19 TotQlfyREITDivPTPLossCfwdAmt`),
]);

const FORM_8889 = rows(`
  2 HSAContributionAmt  3 HSALimitedAnnualDeductibleAmt  4 TotalArcherMSAContributionAmt  5 HSALimitedDeductibleAllwdAmt  6 HSAFamilyDeductibleAmt
  7 HSAAddnlContributionAmt  8 HSALimitedGrossContributionAmt  9 HSAEmployerContributionAmt  10 HSAQualifiedFundingDistriAmt  11 TotalHSAContributionAmt
  12 HSALimitedContributionAmt  13 TotalHSADeductionAmt  14a TotalHSADistributionAmt  14b HSADistributionRolloverAmt  14c HSANetDistributionAmt
  15 UnreimbQualMedAndDentalExpAmt  16 TaxableHSADistributionAmt  17a HSADistriAddnlPercentTaxExcInd  17b HSADistriAddnlPercentTaxAmt
  18 HDHPCoverageFailPartialYrAmt  19 HDHPCoverageFailFundDistriAmt  20 HDHPCoverageIncomeAmt  21 HDHPCoverageAddnlTaxAmt
`);

const FORM_8880 = rows(`
  a.1 PrimaryRothIRAForCurrentYrAmt  b.1 SpouseRothIRAForCurrentYrAmt  a.2 PrimaryContributionsAmt  b.2 SpouseContributionsAmt
  a.3 AddPrimRothIRAToCYContriAmt  b.3 AddSpRothIRAToCYContriAmt  a.4 PrimTaxableDistributionsAmt  b.4 SpsTaxableDistributionsAmt
  a.5 CalculatePrimDistribFromTotAmt  b.5 CalculateSpsDistribFromTotAmt  a.6 PrimSmallerOfCalculationAmt  b.6 SpsSmallerOfCalculationAmt
  7 TotalCalculatedAmt  9 QlfyRetirementSavDecimalAmt  10 CalculatedAmtByDecimalAmt  11 CalculatedCreditsFromTaxAmt  12 CrQualifiedRetirementSavAmt
`);

const FORM_8962_2025 = rows(`
  A MarriedFilingSeparatelyExcInd  1 TotalExemptionsCnt  2a ModifiedAGIAmt  2b TotalDependentsModifiedAGIAmt  3 HouseholdIncomeAmt
  povertyTable FederalPovertyTableLocCd  4 PovertyLevelAmt  5 FederalPovertyLevelPct  7 ApplicableFigureRt  8a AnnualContributionAmt
  8b MonthlyContriHealthCareCvrAmt  9 SharePolicyMarriedAltCalcInd  10 FullYrCoverage1095AInd  11.a AnnualPTCCalculationGrp/AnnualPremiumAmt
  11.b AnnualPTCCalculationGrp/AnnualPremiumSLCSPAmt  11.c AnnualPTCCalculationGrp/AnnualContributionAmt  11.d AnnualPTCCalculationGrp/AnnualMaxPremiumAssistanceAmt
  11.e AnnualPTCCalculationGrp/AnnualPremiumTaxCreditAllwAmt  11.f AnnualPTCCalculationGrp/AnnualAdvancedPTCAmt  monthly MonthlyPTCCalculationGrp
  24 TotalPremiumTaxCreditAmt  25 TotalAdvancedPTCAmt  26 ReconciledPremiumTaxCreditAmt  27 ExcessAdvncPaymentAmt  28 AdditionalTaxLimitationAmt
  29 PremiumTaxCreditTaxLiabAmt
`);

const FORM_8962_2026 = Object.freeze(FORM_8962_2025.filter(([line]) => !['28', '29'].includes(line)).flatMap((entry) => (entry[0] === '5' ? [entry, Object.freeze(['6', 'FederalPovertyLevelPct401Ind'])] : [entry])));

const spec = (fields) => {
  const { order, ...rest } = fields;
  return Object.freeze({ ...rest, order: Object.freeze((order || []).map(([line]) => line)), lines: Object.freeze(Object.fromEntries(order || [])) });
};

const SCHEDULE_DOCUMENTS_2025 = Object.freeze({
  1: spec({ element: 'IRS1040Schedule1', order: SCHEDULE_1 }),
  '1-A': spec({ element: 'IRS1040Schedule1A', order: SCHEDULE_1A_2025 }),
  2: spec({ element: 'IRS1040Schedule2', order: SCHEDULE_2_2025 }),
  3: spec({ element: 'IRS1040Schedule3', order: SCHEDULE_3 }),
  C: spec({ element: 'IRS1040ScheduleC', repeats: true, text: { activity: 'PrincipalBusinessActivityDesc', activityCode: 'PrincipalBusinessActivityCd', businessName: 'BusinessNameLine1Txt', ein: 'EIN' }, order: SCHEDULE_C_2025 }),
  SE: spec({ element: 'IRS1040ScheduleSE', repeats: true, person: { name: 'PersonNm', ssn: 'SSN' }, omit: ['7'], order: SCHEDULE_SE }),
  8812: spec({ element: 'IRS1040Schedule8812', order: SCHEDULE_8812 }),
  EIC: spec({ element: 'IRS1040ScheduleEIC', builder: 'eic' }),
  B: spec({ element: 'IRS1040ScheduleB', builder: 'scheduleB', ignore: ['interest', 'dividends', 'foreignAccounts', 'foreignTrust'], order: SCHEDULE_B }),
  D: spec({ element: 'IRS1040ScheduleD', builder: 'scheduleD', unsigned: ['6', '14', '21'], ignore: ['1b', '2', '8b', '9', 'carryoverToNextYear', 'qofDisposition'], order: SCHEDULE_D }),
  8949: spec({ element: 'IRS8949', builder: 'form8949' }),
  8995: spec({ element: 'IRS8995', builder: 'form8995', ignore: ['1i', '1ii', '1iii', '1iv', '1v', 'businesses'], order: FORM_8995_2025 }),
  8889: spec({ element: 'IRS8889', repeats: true, person: { name: 'PersonNm', ssn: 'RecipientSSN' }, coverage: { self: 'HDHPSelfOnlyCoverageInd', family: 'HDHPFamilyCoverageInd' }, checkboxes: ['17a'], order: FORM_8889 }),
  8880: spec({ element: 'IRS8880', omit: ['8'], decimals: ['9'], order: FORM_8880 }),
  8962: spec({ element: 'IRS8962', builder: 'form8962', checkboxes: ['A'], booleans: ['9', '10'], decimals: ['7'], codes: ['povertyTable'], ignore: ['method', 'applicable'], order: FORM_8962_2025 }),
});

const SCHEDULE_DOCUMENTS_2026 = Object.freeze({
  ...SCHEDULE_DOCUMENTS_2025,
  '1-A': spec({ element: 'IRS1040Schedule1A', order: SCHEDULE_1A_2026 }),
  2: spec({ element: 'IRS1040Schedule2', order: SCHEDULE_2_2026 }),
  C: spec({ ...SCHEDULE_DOCUMENTS_2025.C, order: SCHEDULE_C_2026 }),
  EIC: null,
  8995: spec({ ...SCHEDULE_DOCUMENTS_2025[8995], order: FORM_8995_2026 }),
  8962: spec({ ...SCHEDULE_DOCUMENTS_2025[8962], booleans: ['6', '9', '10'], order: FORM_8962_2026 }),
});

export const SCHEDULE_D_GROUPS = Object.freeze({ A: 'TotalSTCGL1099BShowsBasisGrp', B: 'TotalSTCGL1099BNotShowBasisGrp', D: 'TotalLTCGL1099BShowsBasisGrp', E: 'TotalLTCGL1099BNotShowBasisGrp' });

export const CAPITAL_TOTALS = Object.freeze({ proceeds: 'TotalProceedsSalesPriceAmt', basis: 'TotalCostOrOtherBasisAmt', adjustment: 'TotAdjustmentsToGainOrLossAmt', gain: 'TotalGainOrLossAmt' });

export const SCHEDULE_B_ELEMENTS = Object.freeze({
  interestGroup: 'Form1040SchBPartIGroup2',
  interestPayer: 'InterestPayerName/BusinessNameLine1Txt',
  interestAmount: 'InterestAmt',
  dividendGroup: 'Form1040SchBPartII',
  dividendPayer: 'DividendPayerNameBusiness/BusinessNameLine1Txt',
  dividendAmount: 'DividendAmt',
  foreignAccounts: 'ForeignAccountsQuestionInd',
  foreignTrust: 'ForeignTrustQuestionInd',
});

export const FORM_8949_ELEMENTS = Object.freeze({
  shortGroup: 'ShortTermCapitalGainAndLossGrp',
  longGroup: 'LongTermCapitalGainAndLossGrp',
  boxIndicator: Object.freeze({ A: 'TransRptOn1099BThatShowBssInd', B: 'TransRptOn1099BNotShowBasisInd', D: 'TransRptOn1099BThatShowBssInd', E: 'TransRptOn1099BNotShowBasisInd' }),
  asset: 'CapitalGainAndLossAssetGrp',
  description: 'PropertyDesc',
  acquired: 'AcquiredDt',
  sold: 'SoldOrDisposedDt',
  proceeds: 'ProceedsSalesPriceAmt',
  basis: 'CostOrOtherBasisAmt',
  code: 'AdjustmentsToGainOrLossCd',
  adjustment: 'AdjustmentsToGainOrLossAmt',
  gain: 'GainOrLossAmt',
});

export const SCHEDULE_EIC_ELEMENTS = Object.freeze({
  child: 'QualifyingChildInformation',
  firstName: 'ChildFirstAndLastName/PersonFirstNm',
  lastName: 'ChildFirstAndLastName/PersonLastNm',
  nameControl: 'QualifyingChildNameControlTxt',
  ssn: 'QualifyingChildSSN',
  birthYear: 'ChildBirthYr',
  student: 'ChildIsAStudentUnder24Ind',
  disabled: 'ChildPermanentlyDisabledInd',
  relationship: 'ChildRelationshipCd',
  months: 'MonthsChildLivedWithYouCnt',
});

export const FORM_8995_ROW = Object.freeze({ group: 'QualifiedBusinessIncomeDedGrp', name: 'TradeOrBusinessName/BusinessNameLine1Txt', ssn: 'SSN', amount: 'QlfyBusinessIncomeOrLossAmt' });

export const FORM_8962_MONTHLY = Object.freeze({ month: 'MonthCd', columns: Object.freeze({ a: 'MonthlyPremiumAmt', b: 'MonthlyPremiumSLCSPAmt', c: 'MonthlyContributionAmt', d: 'MonthlyMaxPremiumAssistanceAmt', e: 'MonthlyPremiumTaxCreditAllwAmt', f: 'MonthlyAdvancedPTCAmt' }) });

export const FORM_8962_POVERTY_TABLE = Object.freeze({ alaska: 'A', hawaii: 'B', contiguous: 'C' });

export const W2_FIELDS = Object.freeze({
  wages: 'WagesAmt',
  fedWithheld: 'WithholdingAmt',
  ssWages: 'SocialSecurityWagesAmt',
  ssWithheld: 'SocialSecurityTaxAmt',
  medicareWages: 'MedicareWagesAndTipsAmt',
  medicareWithheld: 'MedicareTaxWithheldAmt',
});

export const RELATIONSHIP_CODES = Object.freeze(new Set([
  'SON', 'DAUGHTER', 'STEPCHILD', 'FOSTER CHILD', 'GRANDCHILD', 'SISTER', 'HALF SISTER', 'STEPBROTHER', 'NIECE', 'NEPHEW', 'PARENT', 'GRANDPARENT', 'UNCLE', 'OTHER', 'NONE',
]));

const RELATIONSHIP_OF = Object.freeze({
  son: 'SON', daughter: 'DAUGHTER', stepchild: 'STEPCHILD', foster_child: 'FOSTER CHILD', grandchild: 'GRANDCHILD',
  brother: 'SISTER', sister: 'SISTER', sibling: 'SISTER', half_brother: 'HALF SISTER', half_sister: 'HALF SISTER', stepbrother: 'STEPBROTHER', stepsister: 'STEPBROTHER',
  niece: 'NIECE', nephew: 'NEPHEW', niece_nephew: 'NEPHEW', parent: 'PARENT', grandparent: 'GRANDPARENT', aunt: 'UNCLE', uncle: 'UNCLE', in_law: 'OTHER', other: 'OTHER',
});

export function mefRelationshipCode(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (RELATIONSHIP_OF[key]) return RELATIONSHIP_OF[key];
  const upper = String(value || '').trim().toUpperCase().replace(/_/g, ' ');
  return RELATIONSHIP_CODES.has(upper) ? upper : '';
}

const FORM_1040_BY_YEAR = Object.freeze({ 2025: FORM_1040_2025, 2026: FORM_1040_2026 });

const SCHEDULE_DOCUMENTS_BY_YEAR = Object.freeze({ 2025: SCHEDULE_DOCUMENTS_2025, 2026: SCHEDULE_DOCUMENTS_2026 });

const REPEATED_LINES = Object.freeze({
  2025: Object.freeze({ 1040: Object.freeze(['11b']) }),
  2026: Object.freeze({ 1040: Object.freeze(['11b']) }),
});

export const FORM_1040_LINES = Object.freeze(Object.fromEntries(FORM_1040_2025));

export const SCHEDULE_DOCUMENTS = SCHEDULE_DOCUMENTS_2025;

export function form1040MefOrder(taxYear) {
  return (FORM_1040_BY_YEAR[String(taxYear)] || FORM_1040_2025).map(([line]) => line);
}

export function form1040MefLines(taxYear) {
  return Object.freeze(Object.fromEntries(FORM_1040_BY_YEAR[String(taxYear)] || FORM_1040_2025));
}

export function scheduleMefDocuments(taxYear) {
  return SCHEDULE_DOCUMENTS_BY_YEAR[String(taxYear)] || SCHEDULE_DOCUMENTS_2025;
}

export function repeatedLines(taxYear, form) {
  return REPEATED_LINES[String(taxYear)]?.[form] || [];
}
