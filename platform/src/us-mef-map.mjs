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

const SCHEDULE_A_2025 = rows(`
  1 MedicalAndDentalExpensesAmt  2 TaxReturnAGIAmt  3 CalculatedMedicalAllowanceAmt  4 TotalMedicalAndDentalExpnssAmt  salesTax StateAndLocalSalesTaxInd  5a StateAndLocalTaxAmt
  5b RealEstateTaxesAmt  5c PersonalPropertyTaxesAmt  5d TotalStateAndLocalTaxAmt  5e StateAndLocalTaxLimitationAmt  6 OtherTaxesAmt  7 TotalTaxesPaidAmt
  8a RptHomeMortgIntAndPointsAmt  8b Form1098HomeMortgIntNotRptAmt  8c Form1098PointsNotReportedAmt  8e TotalHomeMortgIntAndPointsAmt  9 InvestmentInterestAmt
  10 TotalInterestPaidAmt  11 GiftsByCashOrCheckAmt  12 OtherThanByCashOrCheckAmt  13 CarryoverFromPriorYearAmt  14 TotalCharitableContriAmt
  15 CalcAdjGroIncmMnsTotNetLossAmt  16 OtherMiscellaneousDedAmt  17 TotalItemizedDeductionsAmt
`);

const SCHEDULE_A_2026 = rows(`
  1 MedicalAndDentalExpensesAmt  2 TaxReturnAGIAmt  3 CalculatedMedicalAllowanceAmt  4 TotalMedicalAndDentalExpnssAmt  salesTax StateAndLocalSalesTaxInd  5a StateAndLocalTaxAmt
  5b RealEstateTaxesAmt  5c PersonalPropertyTaxesAmt  5d TotalStateAndLocalTaxAmt  5e StateAndLocalTaxLimitationAmt  6 OtherTaxesAmt  7 TotalTaxesPaidAmt
  8a RptHomeMortgIntAndPointsAmt  8b Form1098HomeMortgIntNotRptAmt  8c Form1098PointsNotReportedAmt  8d MortgageInsurancePremiumsAmt  8e TotalHomeMortgIntAndPointsAmt
  9 InvestmentInterestAmt  10 TotalInterestPaidAmt  11 GiftsByCashOrCheckAmt  12 OtherThanByCashOrCheckAmt  13 CharitableContributionDedAmt  14 CarryoverFromPriorYearAmt
  15 TotalCharitableContriAmt  16 CalcAdjGroIncmMnsTotNetLossAmt  17z OtherMiscellaneousDedAmt  limited ItemizedDeductionsLimitedInd  18 TotalItemizedDeductionsAmt
`);

const FORM_2441 = rows(`
  A EligibilityRequirementMetInd  B StudentOrDisabledInd  providers CareProviderGrp  persons QualifyingPersonGrp  3 TotalQlfdExpensesOrLimitAmt  4 PrimaryEarnedIncomeAmt
  5 SpouseEarnedIncomeAmt  6 SmallerOfExpensesOrIncomeAmt  7 AdjustedGrossIncomeAmt  8 CareExpensesDecimalAmt  9a CalculatedTentativeExpenseAmt  9b CPYECreditAmt
  9c TotalEligCDCCAmt  10 TaxLiabLmtFromCrLmtWrkshtAmt  11 CreditForChildAndDepdCareAmt  12 DependentCareBenefitsAmt  13 CarryoverAmt  14 ForfeitedAmt
  15 AdjustedDepdCareBenefitsAmt  16 QualifiedExpensesAmt  17 SmallerOfAdjOrQualifiedAmt  18 EarnedIncomeAmt  19 SpouseIncomeAmt  20 TentativeExclusionAmt
  21 SpecifiedAmt  q22 Form1040AFiledInd  22 SolePropshpPrtshpAmt  23 PropshpPrtshpLessAdjBnftAmt  24 DeductibleBenefitsAmt  25 ExcludedBenefitsAmt  26 TaxableBenefitsAmt
  27 AllowedCaredForAmt  28 SumOfDedAndExcludedBenefitsAmt  29 NetAllowableAmt  30 TotalQualifiedExpensesAmt  31 SmallerOfTotalQlfyExpensesAmt
`);

const FORM_8863 = rows(`
  1 RefundableAmerOppCreditGroup/TentativeAmerOppCreditAmt  2 RefundableAmerOppCreditGroup/EnterSpecifiedAmountForFSAmt  3 RefundableAmerOppCreditGroup/ModifiedAGIAmt
  4 RefundableAmerOppCreditGroup/SubtractAGIFromAmt  5 RefundableAmerOppCreditGroup/SpecifiedAmtPerFSAmt  6 RefundableAmerOppCreditGroup/CalcTentativeEducationRt
  line7Under24 RefundableAmerOppCreditGroup/RefundableAmerOppCrUnder24Ind  7 RefundableAmerOppCreditGroup/CalcTentativeEducationCrAmt  8 RefundableAmerOppCreditGroup/RefundableAmerOppCreditAmt
  9 NonrefundableEducationCrGroup/TentativeEducCrLessRfdblCrAmt  10 NonrefundableEducationCrGroup/TotalQualifiedExpensesAmt  11 NonrefundableEducationCrGroup/SmllrOfTotExpnssOrSpcfdAmt
  12 NonrefundableEducationCrGroup/TentLifetimeLearningCreditAmt  13 NonrefundableEducationCrGroup/EnterSpecifiedAmountForFSAmt  14 NonrefundableEducationCrGroup/ModifiedAGIAmt
  15 NonrefundableEducationCrGroup/SubtractAGIFromAmt  16 NonrefundableEducationCrGroup/SpecifiedAmtPerFSAmt  17 NonrefundableEducationCrGroup/CalcTentativeEducationRt
  18 NonrefundableEducationCrGroup/CalcTentativeEducationCrAmt  19 NonrefundableEducationCrGroup/NonrefundableEducationCrAmt  students StudentAndEducationalInstnGrp
`);

const SCHEDULE_E = rows(`
  q1099 PaymentRqrFilingForm1099Ind  qFiled RequiredForms1099FiledInd  properties PropertyRealEstAndRoyaltyGroup  23a TotAllPaymentsAllRentalPropAmt  23b TotAllPaymentsAllRyltyPropAmt
  23c TotalMortgageInterestPaidAmt  23d TotalDepreciationAmt  23e TotalAllPropTotalExpensesAmt  24 IncomeAmt  25 LossesAmt  26 TotalIncomeOrLossAmt  41 TotalSuppIncomeOrLossAmt
`);

const FORM_8582 = rows(`
  1a RentalRealtyIncomeAmt  1b RentalRealtyLossAmt  1c PYUnallowedRentalLossAmt  1d NetRentalRealtyAmt  2a OtherActivityIncomeAmt  2b OtherActivityLossAmt
  2c PriorYearUnallowedOtherLossAmt  2d NetOtherActivityAmt  3 TotalPassiveActivityAmt  4 RentalRealtyLossLimitAmt  5 MaximumAllowedIncomeAmt  6 ModifiedAGIAmt
  7 ModifiedAGIDifferenceAmt  8 PercentNetSpecialAllowanceAmt  9 AllowedRentalRealtyLossAmt  10 TotalIncomeAmt  11 TotalLossesAllowedAmt
  partIV ParentWrkshtRentalActGrp  partV ParentWrkshtPassiveGrp  partVI ParentWrkshtAllowanceGrp  partVII ParentWrkshtLossGrp  partVIII ParentWrkshtListActivityGrp
`);

const FORM_4562 = rows(`activity BusinessOrActivityTxt  17 MACRSDedForAstInSrvcBfrPYAmt  19i GeneralDepreciationSystem/GDSResidentialRentalProperty  19j GeneralDepreciationSystem/GDSNonRsdntlRealProp  22 TotalDepreciationAmt`);

const FORM_5329 = rows(`
  1 EarlyDistributionsAmt  2c EarlyDistriExceptionReasonCd  2 EarlyDistriNotSubjectToTaxAmt  3 EarlyDistriSubjectToTaxAmt  4 IRAEarlyDistributionsTaxAmt
  9 IRAExcessContriPriorYearAmt  10 IRAExcessContriCreditAmt  11 IRADistriIncludedInIncomeAmt  12 IRAExcessContriWithdrawnAmt  13 IRAExcessContriAdjustmentAmt
  14 IRAExcessContriPrYrAdjustAmt  15 IRAExcessContriCurrentYearAmt  16 IRAExcessContriTotalAmt  17 IRAExcessContribTaxAmt  18 RothIRAExcessContriPriorYrAmt
  19 RothIRAExcessContriCreditAmt  20 RothIRADistriIncludedInCYAmt  21 RothIRAExcessContriAdjustAmt  22 RothIRAExcessContriPYWthdrwAmt  23 RothIRAExcessContriCYAmt
  24 RothIRAExcessContriTotalAmt  25 RothIRAExcessContribTaxAmt  52a QlfyRetirePlanMinRqrDistriAmt  52b AllOthQlfyPlanMinRqrDistriAmt  53a QlfyRetirePlanActualDistriAmt
  53b AllOthQlfyPlanActualDistriAmt  54a QlfyRetirePlanExcessAccumAmt  54b AllOthQlfyPlanExcessAccumAmt  55 RtmntAnntyExcessContribTaxAmt
`);

const FORM_8606 = rows(`
  1 NondedIRACurrTYNondedContriAmt  2 NondedIRABasisForPYAmt  3 NondedIRATotalIRAValueAmt  4 NondedIRAPostTaxYrContriAmt  5 NondedIRATaxYearNetBasisAmt
  6 NondedIRACurrTYIRAPlusRllvrAmt  7 NondedIRAWthdrwLessRllvrAmt  8 NondedIRATYCombinedIRAValueAmt  9 NondedIRATotRllvrWthdrwVlAmt  10 NondedIRATaxYearBasisRt
  11 NondedIRANontxCnvrtAmt  12 NondedIRANontxWthdrwUncnvrtAmt  13 NondedIRANontxOfWthdrwAmt  14 NondedIRATotalIRABasisAmt  15a NondedIRANotCnvrtLessRllvrAmt
  15b NondedIRAQlfyDisasterDistriAmt  15c NondedIRATaxableAmt  16 TotalIRAConvertedToRothAmt  17 TraditionalIRABasisAmt  18 TaxableIRAConversionAmt
  19 TotNonQlfyDistriFromRothIRAAmt  20 QlfyFirstTimeHmByrExpensesAmt  21 NetQlfyFirstTimeHmByrExpnssAmt  22 ROTHIRAContributionBasisAmt  23 NetBasisInRothIRAContriAmt
  24 BasisInCnvrtQlfyRtrPlanAmt  25a DistriRothIRALessBasisCnvrtAmt  25b RothIRAQlfyDisasterDistriAmt  25c TaxableIRADistributionAmt
`);

const FORM_8959_2025 = rows(`
  5 AdditionalTaxGrp/FilingStatusThresholdCd  1 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalW2MedicareWagesAndTipsAmt  2 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalUnreportedMedicareTipsAmt
  3 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalWagesWithNoWithholdingAmt  4 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalMedicareWagesAndTipsAmt
  6 AdditionalTaxGrp/AdditionalMedicareTaxGrp/WagesTipsSubjToAddlMedcrTaxAmt  7 AdditionalTaxGrp/AdditionalMedicareTaxGrp/AdditionalMedicareTaxAmt
  8 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/TotalSelfEmploymentIncomeAmt  11 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/MedcrWagesTipsBelowThrshldAmt
  12 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/SEIncomeSubjToAddSETaxAmt  13 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/AddlSelfEmploymentTaxAmt
  14 AdditionalTaxGrp/AddnlRailroadRetirementTaxGrp/TotalRailroadRetirementCompAmt  16 AdditionalTaxGrp/AddnlRailroadRetirementTaxGrp/RRTCompSubjToAddRRTTaxAmt
  17 AdditionalTaxGrp/AddnlRailroadRetirementTaxGrp/AddlRailroadRetirementTaxAmt  18 AdditionalTaxGrp/TotalAMRRTTaxAmt  19 TotalW2MedicareTaxWithheldAmt
  21 TotalMedicareTaxAmt  22 AddnlMedicareTaxWithholdingAmt  23 TotalW2AddlRRTTaxAmt  24 AddlMedcrRRTTaxWithholdingAmt
`);

const FORM_8959_2026 = rows(`
  5 AdditionalTaxGrp/FilingStatusThresholdCd  1 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalW2MedicareWagesAndTipsAmt  2 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalUnreportedMedicareTipsAmt
  3 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalWagesWithNoWithholdingAmt  4 AdditionalTaxGrp/AdditionalMedicareTaxGrp/TotalMedicareWagesAndTipsAmt
  6 AdditionalTaxGrp/AdditionalMedicareTaxGrp/WagesTipsSubjToAddlMedcrTaxAmt  7 AdditionalTaxGrp/AdditionalMedicareTaxGrp/AdditionalMedicareTaxAmt
  8 AdditionalTaxGrp/AddnlRailroadRetirementTaxGrp/TotalRailroadRetirementCompAmt  10 AdditionalTaxGrp/AddnlRailroadRetirementTaxGrp/RRTCompSubjToAddRRTTaxAmt
  11 AdditionalTaxGrp/AddnlRailroadRetirementTaxGrp/AddlRailroadRetirementTaxAmt  12 AdditionalTaxGrp/TotalAMRRTTaxAmt
  13 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/TotalSelfEmploymentIncomeAmt  16 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/MedcrWagesTipsBelowThrshldAmt
  17 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/SEIncomeSubjToAddSETaxAmt  18 AdditionalTaxGrp/AddnlSelfEmploymentTaxGrp/AddlSelfEmploymentTaxAmt  19 TotalW2MedicareTaxWithheldAmt
  21 TotalMedicareTaxAmt  22 AddnlMedicareTaxWithholdingAmt  23 TotalW2AddlRRTTaxAmt  24 AddlMedcrRRTTaxWithholdingAmt
`);

const FORM_8960 = rows(`
  1 TaxableInterestAmt  2 OrdinaryDividendsAmt  3 AnnuitesFromNonQlfPlansAmt  4a NetRentalIncomeOrLossAmt  4b AdjNetIncmOrLossNonSect1411Amt  4c RentalREAndAdjNetIncmOrLossAmt
  5a PropertyDisposGainOrLossAmt  5b NonNIITPropDisposGainOrLossAmt  5c AdjFromDisposOfStockAmt  5d GainOrLossFromDisposAmt  6 CFCAndPFICInvstIncmChangesAmt
  7 OtherInvestmentIncomeOrLossAmt  8 TotalIncomeAmt  9a InvestmentInterestAmt  9b StateLocalForeignIncomeTaxAmt  9c MiscInvestmentExpenseAmt  9d InvestmentExpenseAmt
  10 AdditionalModificationAmt  11 TotalDeductionModificationAmt  12 NetInvestmentIncomeAmt  13 ModifiedAGIAmt  14 FilingThresholdAmt  15 MAGILessThresholdAmt
  16 SmllrIncmOrMAGILessThrshldAmt  17 IndivNetInvstIncomeTaxAmt
`);

export const FORM_2441_ROWS = Object.freeze({
  personName: 'CareProviderPersonName',
  personControl: 'CareProviderNameControlTxt',
  businessName: 'CareProviderBusinessName/BusinessNameLine1Txt',
  businessControl: 'CareProviderBusNameControlTxt',
  address: 'USAddress',
  ssn: 'SSN',
  ein: 'EIN',
  householdEmployee: 'HouseholdEmployeeInd',
  paid: 'PaidAmt',
  qualifyingName: 'QualifyingPersonName',
  qualifyingControl: 'QualifyingPersonNameControlTxt',
  qualifyingSsn: 'QualifyingPersonSSN',
  disabled: 'PrsnOverSpcfdAgeAndDisabledInd',
  expenses: 'QualifiedCareExpensesPaidAmt',
});

export const US_ADDRESS_ELEMENTS = Object.freeze({ line1: 'AddressLine1Txt', city: 'CityNm', state: 'StateAbbreviationCd', zip: 'ZIPCd' });

export const FORM_8863_ROWS = Object.freeze({
  studentName: 'StudentName',
  studentControl: 'StudentNameControlTxt',
  studentSsn: 'StudentSSN',
  institution: 'EducationalInstitutionGroup',
  institutionName: 'InstitutionName/BusinessNameLine1Txt',
  address: 'USAddress',
  current1098T: 'CurrentYear1098TReceivedInd',
  prior1098T: 'PriorYear1098TReceivedInd',
  ein: 'EIN',
  questions: Object.freeze({ 23: 'PriorYearCreditClaimedInd', 24: 'AcademicPdEligibleStudentInd', 25: 'PostSecondaryEducationInd', 26: 'DrugFelonyConvictionInd' }),
  lines: Object.freeze({ 27: 'AmerOppQualifiedExpensesAmt', 28: 'AmerOppQlfyExpnssLessAllwblAmt', 29: 'AmerOppAllwblExpnssTimesPctAmt', 30: 'AmerOppCreditNetCalcExpnssAmt', 31: 'LifetimeQualifiedExpensesAmt' }),
});

export const SCHEDULE_E_PROPERTY = Object.freeze({
  address: 'PropertyUSAddress',
  type: 'PropertyDesc',
  otherType: 'OtherPropertyTypeDesc',
  fairRentalDays: 'FairRentalDaysCnt',
  personalUseDays: 'PersonalUseDaysCnt',
  qjv: 'QualifiedJointVentureInd',
  otherExpense: 'OtherExpenseDetail',
  otherDesc: 'Desc',
  otherAmount: 'Amt',
  lines: Object.freeze({
    3: 'RentsReceivedAmt', 4: 'TotalRoyaltiesReceivedAmt', 5: 'AdvertisingAmt', 6: 'AutoAndTravelAmt', 7: 'CleaningAndMaintenanceAmt', 8: 'CommissionsAmt', 9: 'InsuranceAmt',
    10: 'LegalAndOtherProfFeesAmt', 11: 'ManagementFeesAmt', 12: 'MortgageInterestPaidBanksAmt', 13: 'MortgageInterestPaidOtherAmt', 14: 'RepairsAmt', 15: 'SuppliesAmt', 16: 'TaxesAmt',
    17: 'UtilitiesAmt', 18: 'DeprecExpenseOrDepletionAmt', 20: 'TotalExpensesAmt', 21: 'NetRentalIncomeOrLossAmt', 22: 'DedRentalRealEstateLossAmt',
  }),
});

export const FORM_8582_WORKSHEETS = Object.freeze({
  partIV: Object.freeze({ row: 'WrkshtRentalActGrp', name: 'PassiveActivityNm', columns: Object.freeze({ a: 'CurrentYearNetIncomeAmt', b: 'CurrentYearNetLossAmt', c: 'PriorYearRentalUnallowedAmt', d: 'OverallGainAmt', e: 'OverallLossAmt' }), totals: Object.freeze({ a: 'TotalCurrentYearNetIncomeAmt', b: 'TotalCurrentYearNetLossAmt', c: 'TotalPriorYrRentalUnallowedAmt' }) }),
  partV: Object.freeze({ row: 'WrkshtPassiveGrp', name: 'NonParticipateActivityNm', columns: Object.freeze({ a: 'CurrentYearNetIncomeAmt', b: 'CurrentYearNetLossAmt', c: 'PriorYearUnallowedLossesAmt', d: 'OverallGainAmt', e: 'OverallLossAmt' }), totals: Object.freeze({ a: 'TotalOtherCurrentYearIncomeAmt', b: 'TotalOtherCurrentYearLossAmt', c: 'TotalOtherPYUnallowedAmt' }) }),
  partVI: Object.freeze({ row: 'WrkshtAllowanceGrp', name: 'SpecialAllowanceActivityNm', form: 'ReportingFormOrScheduleNm', columns: Object.freeze({ a: 'F8582WrkshtLossesAmt', b: 'LossesPct', c: 'SpecialAllowanceAmt', d: 'NetSpecialAllowanceAmt' }), totals: Object.freeze({ a: 'TotalLossAmt', c: 'TotalSpecialAllowanceAmt', d: 'TotalNetSpecialAllowanceAmt' }) }),
  partVII: Object.freeze({ row: 'WrkshtLossGrp', name: 'UnallowedLossActivityNm', form: 'ReportingFormOrScheduleNm', columns: Object.freeze({ a: 'F8582WrkshtLossesAmt', b: 'LossesPct', c: 'PriorYearUnallowedLossesAmt' }), totals: Object.freeze({ a: 'TotalAllocationLossAmt', c: 'TotalLossAmt' }) }),
  partVIII: Object.freeze({ row: 'WrkshtListActivityGrp', name: 'AllowedLossActivityNm', form: 'ReportingFormOrScheduleNm', columns: Object.freeze({ a: 'F8582WrkshtLossesAmt', b: 'PriorYearUnallowedLossesAmt', c: 'F8582WrkshtAllowedLossesAmt' }), totals: Object.freeze({ a: 'TotalLossAmt', b: 'TotalUnallowedLossAmt', c: 'TotalAllowedLossAmt' }) }),
});

export const FORM_4562_PROPERTY = Object.freeze({ placedInService: 'MonthAndYearPlacedInServiceDt', basis: 'BasisForDepreciationAmt', deduction: 'DepreciationDeductionAmt' });

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
  A: spec({ element: 'IRS1040ScheduleA', builder: 'scheduleA', checkboxes: ['salesTax'], ignore: ['section68Reduction', 'afterSection68', 'limited'], order: SCHEDULE_A_2025 }),
  2441: spec({ element: 'IRS2441', builder: 'form2441', checkboxes: ['A', 'B'], booleans: ['q22'], decimals: ['8'], ignore: ['creditAllowed', 'providers', 'persons'], order: FORM_2441 }),
  8863: spec({ element: 'IRS8863', builder: 'form8863', checkboxes: ['line7Under24'], ratios: ['6', '17'], ignore: ['students', 'phaseOutFraction'], order: FORM_8863 }),
  E: spec({ element: 'IRS1040ScheduleE', builder: 'scheduleE', booleans: ['q1099', 'qFiled'], ignore: ['properties', 'depreciation', 'unallowedLossCarryforward', 'magiForPassiveLoss'], order: SCHEDULE_E }),
  8582: spec({ element: 'IRS8582', builder: 'form8582', ignore: ['partIV', 'partV', 'partVI', 'partVII', 'partVIII', 'magi', 'mfsLivedWithSpouse', 'specialAllowanceExceptionMet'], order: FORM_8582 }),
  4562: spec({ element: 'IRS4562', builder: 'form4562', repeats: true, order: FORM_4562 }),
  5329: spec({ element: 'IRS5329', builder: 'form5329', repeats: true, person: { name: 'PersonNm', ssn: 'SSN' }, codes: ['2c'], order: FORM_5329 }),
  8606: spec({ element: 'IRS8606', repeats: true, person: { name: 'Form8606IRANamelineTxt', ssn: 'NondedIRATxpyrWithIRASSN' }, decimals: ['10'], ignore: ['basisCarryforward'], order: FORM_8606 }),
  8959: spec({ element: 'IRS8959', codes: ['5'], ignore: ['20'], order: FORM_8959_2025 }),
  8960: spec({ element: 'IRS8960', order: FORM_8960 }),
});

const SCHEDULE_DOCUMENTS_2026 = Object.freeze({
  ...SCHEDULE_DOCUMENTS_2025,
  '1-A': spec({ element: 'IRS1040Schedule1A', order: SCHEDULE_1A_2026 }),
  2: spec({ element: 'IRS1040Schedule2', order: SCHEDULE_2_2026 }),
  C: spec({ ...SCHEDULE_DOCUMENTS_2025.C, order: SCHEDULE_C_2026 }),
  EIC: null,
  8995: spec({ ...SCHEDULE_DOCUMENTS_2025[8995], order: FORM_8995_2026 }),
  8962: spec({ ...SCHEDULE_DOCUMENTS_2025[8962], booleans: ['6', '9', '10'], order: FORM_8962_2026 }),
  A: spec({ ...SCHEDULE_DOCUMENTS_2025.A, booleans: ['limited'], ignore: ['section68Reduction', 'afterSection68'], order: SCHEDULE_A_2026 }),
  8959: spec({ ...SCHEDULE_DOCUMENTS_2025[8959], ignore: ['14', '20'], order: FORM_8959_2026 }),
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
