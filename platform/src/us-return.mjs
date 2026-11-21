import { randomBytes } from 'node:crypto';
import { computeForm1040, FILING_STATUSES, SUPPORTED_YEARS, US_INPUT_KINDS } from './us-1040.mjs';
import { RENTAL_ENTRY_KIND } from './us-form-schedule-e.mjs';
import { scheduleCSummary } from './us-owner-tax.mjs';
import { sealTin, openTin, maskTin, tinShapeError, isSealedTin } from './us-identity.mjs';
import { localToday } from './dates.mjs';
import { appendAuditEvent } from './ca-api.mjs';
import { figuresOf1040, form1040X } from './us-1040x.mjs';

function audit(state, action, metadata) {
  appendAuditEvent(state, { actorId: state.__actor?.userId || 'owner', action, metadata });
}

export const US_RETURN_YEARS = SUPPORTED_YEARS;
const STEPS = Object.freeze([['profile', 'About you'], ['forms', 'Tax forms'], ['interview', 'Deductions and credits'], ['review', 'Review'], ['sign', 'Sign and file']]);
const RELATIONSHIPS = Object.freeze(['son', 'daughter', 'stepchild', 'foster_child', 'brother', 'sister', 'half_brother', 'half_sister', 'stepbrother', 'stepsister', 'grandchild', 'niece', 'nephew', 'sibling', 'niece_nephew', 'parent', 'grandparent', 'aunt', 'uncle', 'in_law', 'other']);
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP'.split(' '));
const MAX_AMOUNT = 1e11;

const money = (key, label, box, extra = {}) => ({ key, label, box, type: 'money', required: false, ...extra });
const PAYER = [{ key: 'payer', label: 'Payer name', box: '', type: 'text', required: true }, { key: 'payerTin', label: 'Payer TIN (EIN)', box: '', type: 'ein', required: false }];
const WITHHELD = (box) => money('federalWithheld', 'Federal income tax withheld', box);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MARKETPLACE_MONTHS = MONTH_NAMES.flatMap((name, index) => [money(`enrollmentPremium${index + 1}`, `${name}: monthly enrollment premium`, `${21 + index}A`), money(`slcspPremium${index + 1}`, `${name}: second lowest cost silver plan (SLCSP) premium`, `${21 + index}B`), money(`advancePayment${index + 1}`, `${name}: advance payment of the premium tax credit`, `${21 + index}C`)]);

export const FORM_SPECS = Object.freeze({
  'W-2': { title: 'Wage and Tax Statement', description: 'Wages from an employer.', fields: [{ key: 'payer', label: 'Employer name', box: 'c', type: 'text', required: true }, { key: 'payerTin', label: 'Employer EIN', box: 'b', type: 'ein', required: false }, money('wages', 'Wages, tips, other compensation', '1', { required: true }), WITHHELD('2'), money('socialSecurityWages', 'Social security wages', '3'), money('socialSecurityTax', 'Social security tax withheld', '4'), money('medicareWages', 'Medicare wages and tips', '5'), money('medicareTax', 'Medicare tax withheld', '6'), money('socialSecurityTips', 'Social security tips', '7'), money('dependentCareBenefits', 'Dependent care benefits', '10'), { key: 'box12', label: 'Box 12 codes', box: '12', type: 'code', required: false }, { key: 'retirementPlan', label: 'Retirement plan', box: '13', type: 'yesno', required: false }, { key: 'state', label: 'State', box: '15', type: 'state', required: false }, money('stateWages', 'State wages', '16'), money('stateWithheld', 'State income tax', '17'), money('localWithheld', 'Local income tax', '19')] },
  '1099-INT': { title: 'Interest Income', description: 'Interest from a bank, broker or the Treasury.', fields: [...PAYER, money('interest', 'Interest income', '1', { required: true }), money('earlyWithdrawalPenalty', 'Early withdrawal penalty', '2'), money('treasuryInterest', 'Interest on U.S. Savings Bonds and Treasury obligations', '3'), WITHHELD('4'), money('foreignTaxPaid', 'Foreign tax paid', '6'), money('taxExemptInterest', 'Tax-exempt interest', '8')] },
  '1099-DIV': { title: 'Dividends and Distributions', description: 'Dividends and fund distributions.', fields: [...PAYER, money('ordinaryDividends', 'Total ordinary dividends', '1a', { required: true }), money('qualifiedDividends', 'Qualified dividends', '1b'), money('capitalGainDistributions', 'Total capital gain distributions', '2a'), WITHHELD('4'), money('section199aDividends', 'Section 199A dividends', '5'), money('foreignTaxPaid', 'Foreign tax paid', '7'), money('exemptInterestDividends', 'Exempt-interest dividends', '12')] },
  '1099-B': { title: 'Proceeds From Broker Transactions', description: 'Sales of stocks, bonds and funds. One sale per form, or a list of sales.', fields: [...PAYER, { key: 'description', label: 'Description of property', box: '1a', type: 'text', required: false }, { key: 'dateAcquired', label: 'Date acquired', box: '1b', type: 'date', required: false }, { key: 'dateSold', label: 'Date sold', box: '1c', type: 'date', required: false }, money('proceeds', 'Proceeds', '1d', { required: true }), money('costBasis', 'Cost or other basis', '1e', { required: true }), money('washSaleLossDisallowed', 'Wash sale loss disallowed', '1g'), { key: 'term', label: 'Short-term or long-term', box: '2', type: 'term', required: true }, { key: 'basisReportedToIrs', label: 'Basis reported to IRS', box: '12', type: 'yesno', required: false }, WITHHELD('4')] },
  '1099-NEC': { title: 'Nonemployee Compensation', description: 'Pay for work as a contractor.', fields: [...PAYER, money('nonemployeeCompensation', 'Nonemployee compensation', '1', { required: true }), WITHHELD('4')] },
  '1099-MISC': { title: 'Miscellaneous Information', description: 'Rents, royalties, prizes and other income.', fields: [...PAYER, money('rents', 'Rents', '1'), money('royalties', 'Royalties', '2'), money('otherIncome', 'Other income', '3'), WITHHELD('4')] },
  '1099-G': { title: 'Certain Government Payments', description: 'Unemployment and state tax refunds.', fields: [...PAYER, money('unemployment', 'Unemployment compensation', '1'), money('stateRefund', 'State or local income tax refunds', '2'), WITHHELD('4')] },
  '1099-R': { title: 'Distributions From Pensions, Annuities, Retirement Plans, IRAs', description: 'Pension, annuity and IRA payouts.', fields: [...PAYER, money('grossDistribution', 'Gross distribution', '1', { required: true }), money('taxableAmount', 'Taxable amount', '2a'), WITHHELD('4'), { key: 'distributionCode', label: 'Distribution code', box: '7', type: 'code', required: false }, { key: 'iraSepSimple', label: 'IRA/SEP/SIMPLE', box: '7', type: 'yesno', required: false }] },
  'SSA-1099': { title: 'Social Security Benefit Statement', description: 'Social Security benefits.', fields: [{ key: 'payer', label: 'Payer', box: '', type: 'text', required: false }, money('netBenefits', 'Net benefits (negative when repayments were larger)', '5', { required: true, negative: true }), WITHHELD('6')] },
  1098: { title: 'Mortgage Interest Statement', description: 'Home mortgage interest and property tax.', fields: [...PAYER, money('mortgageInterest', 'Mortgage interest received', '1', { required: true }), money('outstandingPrincipal', 'Outstanding mortgage principal', '2'), money('pointsPaid', 'Points paid on purchase', '6'), money('propertyTax', 'Property tax paid from escrow', '10')] },
  '1098-E': { title: 'Student Loan Interest Statement', description: 'Interest paid on a student loan.', fields: [...PAYER, money('studentLoanInterest', 'Student loan interest received', '1', { required: true })] },
  '1095-A': { title: 'Health Insurance Marketplace Statement', description: 'Coverage bought on HealthCare.gov or a state Marketplace, for the premium tax credit (Form 8962). Enter the monthly amounts, or only the line 33 totals if nothing changed all year.', fields: [{ key: 'payer', label: 'Marketplace identifier', box: '1', type: 'text', required: true }, { key: 'policyNumber', label: 'Marketplace-assigned policy number', box: '2', type: 'text', required: false }, { key: 'issuer', label: 'Policy issuer\'s name', box: '3', type: 'text', required: false }, { key: 'recipientName', label: 'Recipient\'s name', box: '4', type: 'text', required: false }, ...MARKETPLACE_MONTHS, money('enrollmentPremiumAnnual', 'Annual total: enrollment premiums', '33A'), money('slcspPremiumAnnual', 'Annual total: SLCSP premiums', '33B'), money('advancePaymentAnnual', 'Annual total: advance payments of the premium tax credit', '33C')] },
  [RENTAL_ENTRY_KIND]: { title: 'Rental Property or Royalty (Schedule E)', description: 'One rental property or royalty source: rents, royalties, expenses, depreciation and passive loss details.', fields: [
    { key: 'payer', label: 'Property address (street, city, state, ZIP) or royalty source', box: '1a', type: 'text', required: true },
    { key: 'propertyType', label: 'Type: 1 single family, 2 multi-family, 3 vacation/short-term, 4 commercial, 5 land, 6 royalties, 7 self-rental, 8 other', box: '1b', type: 'code', required: true },
    { key: 'otherDescription', label: 'Description of the property (type 8)', box: '1b', type: 'text', required: false },
    { key: 'fairRentalDays', label: 'Days rented at a fair rental price', box: '2', type: 'days', required: false },
    { key: 'personalUseDays', label: 'Days of personal use', box: '2', type: 'days', required: false },
    { key: 'qjv', label: 'Qualified joint venture with your spouse', box: '2', type: 'yesno', required: false },
    { key: 'rentPayer', label: 'Payer named on a 1099-MISC for these rents or royalties', box: '', type: 'text', required: false },
    money('rents', 'Rents received (including any on a 1099-MISC)', '3'), money('royalties', 'Royalties received (including any on a 1099-MISC)', '4'),
    money('advertising', 'Advertising', '5'), money('autoTravel', 'Auto and travel', '6'), money('cleaningMaintenance', 'Cleaning and maintenance', '7'), money('commissions', 'Commissions', '8'), money('insurance', 'Insurance', '9'), money('legalProfessional', 'Legal and other professional fees', '10'), money('managementFees', 'Management fees', '11'), money('mortgageInterest', 'Mortgage interest paid to banks', '12'), money('otherInterest', 'Other interest', '13'), money('repairs', 'Repairs', '14'), money('supplies', 'Supplies', '15'), money('taxes', 'Taxes', '16'), money('utilities', 'Utilities', '17'),
    money('depreciation', 'Depreciation or depletion (leave empty to figure it from the cost)', '18'), money('otherExpenses', 'Other expenses', '19'),
    money('costBasis', 'Cost or other basis of the property, land included', ''), money('landValue', 'Part of the cost that is land', ''),
    { key: 'placedInService', label: 'Date placed in service', box: '', type: 'date', required: false },
    { key: 'recoveryClass', label: 'Building class: residential (27.5 years) or nonresidential (39 years)', box: '', type: 'code', required: false },
    { key: 'activeParticipation', label: 'You actively participated (own 10% or more and make the management decisions)', box: '', type: 'yesno', required: false },
    money('priorYearUnallowedLoss', 'Unallowed passive loss carried from last year (Form 8582)', ''),
    { key: 'shortStays', label: 'Average rental stay of 7 days or less', box: '', type: 'yesno', required: false },
    { key: 'notAtRisk', label: 'Part of the investment is not at risk (Form 6198)', box: '', type: 'yesno', required: false },
    { key: 'soldInYear', label: 'Sold or disposed of during the year', box: '', type: 'yesno', required: false },
  ] },
  '1098-T': { title: 'Tuition Statement', description: 'College tuition for an education credit.', fields: [...PAYER, { key: 'studentName', label: 'Student name', box: '', type: 'text', required: false }, money('tuitionPaid', 'Payments received for qualified tuition', '1', { required: true }), money('scholarships', 'Scholarships or grants', '5'), { key: 'atLeastHalfTime', label: 'At least half-time student', box: '8', type: 'yesno', required: false }, { key: 'graduate', label: 'Graduate student', box: '9', type: 'yesno', required: false }] },
  '2441-PROVIDER': { title: 'Child and dependent care provider', description: 'A daycare, after-school program, sitter or other person you paid for care so you could work (Form 2441). Add one for each provider.', fields: [{ key: 'payer', label: 'Care provider name', box: '1a', type: 'text', required: true }, { key: 'payerTin', label: 'Provider EIN', box: '1c', type: 'ein', required: false }, { key: 'providerAddress', label: 'Provider address', box: '1b', type: 'text', required: false }, money('amountPaid', 'Amount you paid for care this year', '1e', { required: true }), { key: 'qualifyingPerson', label: 'Who was cared for (first name, or spouse)', box: '2a', type: 'text', required: false }, { key: 'householdEmployee', label: 'Household employee, such as a nanny', box: '1d', type: 'yesno', required: false }] },
});

const QUESTIONS = Object.freeze([
  { id: 'digitalAssets', text: 'At any time during the year, did you receive, sell, exchange or otherwise dispose of a digital asset (such as crypto)?', help: 'The yes or no question at the top of Form 1040. Holding crypto without any transaction is a no.', kind: 'yesno' },
  { id: 'useBooksForScheduleC', text: 'Use the business books in MyCA for your Schedule C?', help: 'Gross receipts, cost of goods and expenses for the year come from the invoices, bills and expenses recorded here.', kind: 'yesno', when: (ctx) => ctx.booksHaveIncome },
  { id: 'businessGrossReceipts', text: 'Self-employment: gross receipts for the year', help: 'Everything your own business or side work brought in, including 1099-NEC and 1099-K amounts. Leave empty if you had none.', kind: 'amount', when: (ctx) => !ctx.usesBooks },
  { id: 'businessActivityCode', text: 'Self-employment: business activity code (six digits)', help: 'The NAICS-based principal business code from the Schedule C instructions, for example 541510 for computer programming.', kind: 'text', when: (ctx) => ctx.hasBusiness },
  { id: 'businessCostOfGoods', text: 'Self-employment: cost of goods sold', help: 'What you paid for goods you resold.', kind: 'amount', when: (ctx) => !ctx.usesBooks && ctx.manualBusiness },
  { id: 'businessExpenses', text: 'Self-employment: total business expenses', help: 'Supplies, software, advertising, travel, the business part of your phone, and the like.', kind: 'amount', when: (ctx) => !ctx.usesBooks && ctx.manualBusiness },
  { id: 'estimatedTaxPayments', text: 'Federal estimated tax paid for the year (Form 1040-ES)', help: 'All four instalments together, including one paid in January.', kind: 'amount' },
  { id: 'priorYearTax', text: 'Last year\'s total federal tax (Form 1040 line 24)', help: 'Used to check whether an estimated tax penalty can apply. Leave empty if you did not file last year.', kind: 'amount' },
  { id: 'priorYearAgi', text: 'Last year\'s adjusted gross income (Form 1040 line 11)', help: 'Above $150,000 ($75,000 separate) the safe harbor is 110% of last year\'s tax.', kind: 'amount', when: (ctx) => ctx.answers?.priorYearTax !== undefined },
  { id: 'priorYearOverpaymentApplied', text: 'Last year\'s refund applied to this year', help: 'Only if you chose to apply it rather than receive it.', kind: 'amount' },
  { id: 'stateRefundTaxable', text: 'How much of the state refund on your 1099-G is taxable?', help: 'Zero if you took the standard deduction last year. If you itemized, the part that lowered your federal tax.', kind: 'amount', when: (ctx) => ctx.hasStateRefund },
  { id: 'earlyDistributionException', text: 'Does an exception to the 10% early distribution tax apply to your 1099-R with code 1?', help: 'For example a first home (IRA, up to $10,000), higher education costs, disability or certain medical costs. An exception is claimed on Form 5329.', kind: 'yesno', when: (ctx) => ctx.hasEarlyDistribution },
  { id: 'qbiMaterialParticipation', text: 'Did you work in your business regularly, continuously and substantially this year?', help: 'This is material participation, for example more than 500 hours, or most of the work in the business. From 2026 it can give you a minimum business income deduction of $400 (IRC 199A(i)).', kind: 'yesno', when: (ctx) => ctx.hasBusiness && Number(ctx.taxYear) >= 2026 },
  { id: 'rentalIncome', text: 'Did you have rental or royalty income not on a 1099-MISC?', help: 'Renting out a home, room or vacation property, or royalties. Add each one as a rental property; they go on Schedule E.', kind: 'yesno' },
  { id: 'rentalQbiSafeHarbor', text: 'Do your rentals meet the 250-hour safe harbor of Rev. Proc. 2019-38, and do you want them treated as a business for the QBI deduction?', help: 'Separate books for each enterprise, 250 or more hours of rental services a year and contemporaneous records of them. Not for a home you used personally or a triple net lease.', kind: 'yesno', when: (ctx) => ctx.hasRental },
  { id: 'realEstateProfessional', text: 'Were you a real estate professional (more than half your working time and over 750 hours in real property businesses)?', help: 'Real estate professionals can treat rentals as nonpassive (section 469(c)(7)).', kind: 'yesno', when: (ctx) => ctx.hasRental },
  { id: 'scheduleK1Income', text: 'Did you receive a Schedule K-1 from a partnership, S corporation, estate or trust?', help: 'Those amounts go on Schedule E Parts II and III.', kind: 'yesno' },
  { id: 'careMfsUnmarried', text: 'For the care credit: did you live apart from your spouse for the last 6 months of the year, in a home that was the cared-for person\'s main home for more than half the year, and pay more than half its upkeep?', help: 'Only then can a married person filing separately claim the child and dependent care credit (Form 2441 line A).', kind: 'yesno', when: (ctx) => ctx.status === 'mfs' && ctx.hasCare },
  { id: 'careStudentOrDisabled', text: 'Was either of you a full-time student or unable to care for yourself during the year?', help: 'A student (some part of 5 months) or disabled spouse is treated as earning $250 a month ($500 with two or more qualifying persons) for Form 2441, for only one of you in any month.', kind: 'choice', options: ['none', 'taxpayer', 'spouse'], when: (ctx) => ctx.joint && ctx.hasCare },
  { id: 'careStudentOrDisabledMonths', text: 'For how many months was that spouse a full-time student or unable to care for themself?', help: 'Count each month with any part as a student or disabled. MyCA uses the larger of the deemed amount for these months and the actual earnings for the year.', kind: 'choice', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], when: (ctx) => ctx.joint && ctx.hasCare && ['taxpayer', 'spouse'].includes(ctx.answers?.careStudentOrDisabled) },
  { id: 'careBenefitsCarriedIn', text: 'Dependent care benefits carried over from last year and used in this year\'s grace period', help: 'Form 2441 line 13. Leave empty if your plan has no grace period.', kind: 'amount', when: (ctx) => ctx.hasCareBenefits },
  { id: 'careBenefitsForfeited', text: 'Dependent care benefits you forfeited or carried forward to next year', help: 'Form 2441 line 14: amounts in W-2 box 10 you did not use for care this year.', kind: 'amount', when: (ctx) => ctx.hasCareBenefits },
  { id: 'careSpouseEarnedIncome', text: 'Your spouse\'s earned income for the year', help: 'On a separate return the dependent care benefit exclusion is limited to the smaller of your and your spouse\'s earned income (Form 2441 line 19).', kind: 'amount', when: (ctx) => ctx.status === 'mfs' && ctx.hasCareBenefits && ctx.answers?.careMfsUnmarried !== true },
  { id: 'marketplaceCoverage', text: 'Did anyone on this return have health coverage from the Marketplace (Form 1095-A)?', help: 'Coverage bought on HealthCare.gov or a state exchange. If yes, add the Form 1095-A on the Tax forms step.', kind: 'yesno' },
  { id: 'marketplacePolicyShared', text: 'Did a Marketplace policy on your 1095-A also cover someone outside this return\'s tax family, or cover someone on this return under another person\'s 1095-A?', help: 'For example a policy shared with a former spouse or with an adult child who files their own return (Form 8962 Part IV).', kind: 'yesno', when: (ctx) => ctx.hasMarketplace },
  { id: 'marketplaceDependentsMagi', text: 'Modified AGI of your dependents who must file their own return', help: 'Their AGI plus tax-exempt interest, excluded foreign income and untaxed Social Security (Form 8962 Worksheet 1-2). Leave empty if no dependent has to file.', kind: 'amount', when: (ctx) => ctx.hasMarketplace && ctx.hasDependents },
  { id: 'marketplaceForeignExcluded', text: 'Foreign earned income and housing excluded on Form 2555 (lines 45 and 50)', help: 'Added back to modified AGI for the premium tax credit. Leave empty if none.', kind: 'amount', when: (ctx) => ctx.hasMarketplace },
  { id: 'marketplaceEnrollmentEstimate', text: 'When you enrolled, did the Marketplace estimate your household income at or above the federal poverty line (and, from 2026, no more than four times it), and were advance payments made?', help: 'Only matters if your actual income was below the poverty line: then you can still take the credit.', kind: 'yesno', when: (ctx) => ctx.hasMarketplace },
  { id: 'marketplaceLawfullyPresent', text: 'Was the person enrolled a lawfully present immigrant who could not get Medicaid because of immigration status?', help: 'For 2025 this lets the credit be taken with household income below the poverty line. It does not apply from 2026.', kind: 'yesno', when: (ctx) => ctx.hasMarketplace && ctx.taxYear === '2025' },
  { id: 'marketplaceAbuseException', text: 'Are you living apart from your spouse and unable to file jointly because of domestic abuse or spousal abandonment?', help: 'Checking box A on Form 8962 lets a married person filing separately take the premium tax credit, for at most three years in a row.', kind: 'yesno', when: (ctx) => ctx.hasMarketplace && ctx.status === 'mfs' },
  { id: 'marketplaceMarriageAlternative', text: 'Did you marry during the year and want the alternative calculation for the year of marriage?', help: 'Form 8962 Part V can lower the repayment of advance payments for the months before the marriage.', kind: 'yesno', when: (ctx) => ctx.hasMarketplace && (ctx.status === 'mfj' || ctx.status === 'mfs') },
  { id: 'otherIncome', text: 'Other income not on a form', help: 'Prizes, jury duty pay, hobby income and similar.', kind: 'amount' },
  { id: 'qualifiedTips', text: 'Tips you received as an employee in a job where tips are customary', help: 'For the no-tax-on-tips deduction (2025 to 2028): the tips on your W-2 or Form 4137 (Schedule 1-A line 4).', kind: 'amount' },
  { id: 'spouseQualifiedTips', text: 'Tips your spouse received as an employee', help: 'For the no-tax-on-tips deduction.', kind: 'amount', when: (ctx) => ctx.joint },
  { id: 'businessQualifiedTips', text: 'Tips you received in your own business (on a 1099-NEC, 1099-MISC or 1099-K)', help: 'Counted only up to the net income of the business (Schedule 1-A line 5).', kind: 'amount', when: (ctx) => ctx.hasBusiness },
  { id: 'spouseBusinessQualifiedTips', text: 'Tips your spouse received in their own business', help: 'Counted only up to the net income of that business.', kind: 'amount', when: (ctx) => ctx.joint && ctx.hasBusiness },
  { id: 'qualifiedOvertime', text: 'The overtime premium you were paid (the "half" in time-and-a-half)', help: 'For the overtime deduction (2025 to 2028). Your employer reports it on your W-2.', kind: 'amount' },
  { id: 'spouseQualifiedOvertime', text: 'Your spouse\'s overtime premium', help: 'For the overtime deduction.', kind: 'amount', when: (ctx) => ctx.joint },
  { id: 'excludedForeignIncome', text: 'Income excluded from your return: foreign earned income or housing (Form 2555 lines 45 and 50), American Samoa (Form 4563) or Puerto Rico', help: 'Added back to AGI for the Schedule 1-A, child tax credit and education credit income limits. Leave empty if none.', kind: 'amount' },
  { id: 'carLoanInterest', text: 'Interest on a loan for a new US-assembled car bought for personal use', help: 'Loans taken after 2024, up to $10,000 of interest (2025 to 2028).', kind: 'amount' },
  { id: 'educatorExpenses', text: 'Classroom supplies you paid for as a K-12 teacher', help: 'Only if you are an eligible educator. Up to $300 for 2025 and $350 for 2026 is deducted from income; from 2026 the rest is an itemized deduction (IRC 67(b)(13)).', kind: 'amount' },
  { id: 'spouseEducatorExpenses', text: 'Classroom supplies your spouse paid for as a K-12 teacher', help: '', kind: 'amount', when: (ctx) => ctx.joint },
  { id: 'hsaDeduction', text: 'HSA deduction (Form 8889 line 13)', help: 'Your own contributions to a health savings account, not those through payroll.', kind: 'amount' },
  { id: 'iraDeduction', text: 'Deductible traditional IRA contributions', help: 'The deductible amount from the IRA worksheet; your CPA can confirm it if you have a workplace plan.', kind: 'amount' },
  { id: 'retirementPlanDeduction', text: 'SEP, SIMPLE or solo 401(k) contributions for yourself', help: '', kind: 'amount', when: (ctx) => ctx.hasBusiness },
  { id: 'selfEmployedHealthInsurance', text: 'Health insurance you paid as a self-employed person', help: '', kind: 'amount', when: (ctx) => ctx.hasBusiness },
  { id: 'studentLoanInterest', text: 'Student loan interest not on a 1098-E', help: '', kind: 'amount' },
  { id: 'shortTermLossCarryover', text: 'Short-term capital loss carried over from last year', help: 'From last year\'s capital loss carryover worksheet.', kind: 'amount' },
  { id: 'longTermLossCarryover', text: 'Long-term capital loss carried over from last year', help: '', kind: 'amount' },
  { id: 'itemize', text: 'Itemize deductions?', help: 'Auto picks whichever is larger: the standard deduction or your itemized deductions.', kind: 'choice', options: ['auto', 'yes', 'no'] },
  { id: 'medicalExpenses', text: 'Medical and dental expenses you paid', help: 'Only the part above 7.5% of your AGI counts, and only if you itemize.', kind: 'amount' },
  { id: 'realEstateTaxes', text: 'Property tax paid on your home (not through escrow)', help: '', kind: 'amount' },
  { id: 'personalPropertyTaxes', text: 'Personal property tax (for example on a car)', help: 'The part based on value.', kind: 'amount' },
  { id: 'charityCash', text: 'Cash gifts to charities', help: 'From 2026 non-itemizers can deduct up to $1,000 ($2,000 joint).', kind: 'amount' },
  { id: 'charityNonCash', text: 'Non-cash gifts to charities (clothes, goods)', help: 'At fair market value.', kind: 'amount' },
  { id: 'livedWithSpouse', text: 'Did you live with your spouse at any time during the year?', help: 'Affects how Social Security benefits are taxed on a separate return.', kind: 'yesno', when: (ctx) => ctx.status === 'mfs' },
  { id: 'spouseItemizes', text: 'Is your spouse itemizing on their separate return?', help: 'If so, you must itemize too.', kind: 'yesno', when: (ctx) => ctx.status === 'mfs' },
  { id: 'separatedFromSpouse', text: 'Did you live apart from your spouse for the last six months of the year?', help: 'Needed for the earned income credit on a separate return.', kind: 'yesno', when: (ctx) => ctx.status === 'mfs' },
  { id: 'applyToNextYear', text: 'Refund to apply to next year\'s estimated tax', help: 'Leave empty to get it all back.', kind: 'amount' },
]);

const LINE_LABELS = Object.freeze({
  '1040': { '1a': 'Wages (W-2 box 1)', '1e': 'Taxable dependent care benefits (Form 2441)', '1z': 'Total wages', '2a': 'Tax-exempt interest', '2b': 'Taxable interest', '3a': 'Qualified dividends', '3b': 'Ordinary dividends', '4a': 'IRA distributions', '4b': 'IRA distributions, taxable', '5a': 'Pensions and annuities', '5b': 'Pensions and annuities, taxable', '6a': 'Social security benefits', '6b': 'Social security benefits, taxable', 7: 'Capital gain or loss', 8: 'Additional income (Schedule 1)', 9: 'Total income', 10: 'Adjustments to income (Schedule 1)', 11: 'Adjusted gross income', 12: 'Standard or itemized deduction', '13a': 'Qualified business income deduction', '13b': 'Additional deductions (Schedule 1-A)', 14: 'Total deductions', 15: 'Taxable income', 16: 'Tax', 17: 'Schedule 2, line 3', 18: 'Tax before credits', 19: 'Child tax credit and credit for other dependents', 20: 'Other credits (Schedule 3)', 21: 'Total credits', 22: 'Tax after credits', 23: 'Other taxes (Schedule 2)', 24: 'Total tax', '25a': 'Federal tax withheld, W-2', '25b': 'Federal tax withheld, 1099', '25c': 'Federal tax withheld, other', '25d': 'Total withholding', 26: 'Estimated tax payments', 27: 'Earned income credit', 28: 'Additional child tax credit', 29: 'American opportunity credit, refundable', 31: 'Other payments (Schedule 3)', 32: 'Total other payments and refundable credits', 33: 'Total payments', 34: 'Overpaid', '35a': 'Refund', 36: 'Applied to next year\'s estimated tax', 37: 'Amount you owe' },
  'Schedule 1': { 1: 'Taxable state and local refunds', 3: 'Business income (Schedule C)', 5: 'Rental real estate and royalties (Schedule E)', 7: 'Unemployment compensation', '8z': 'Other income', 10: 'Total additional income', 11: 'Educator expenses', 13: 'HSA deduction', 15: 'Deductible part of self-employment tax', 16: 'SEP, SIMPLE and qualified plans', 17: 'Self-employed health insurance', 18: 'Penalty on early withdrawal of savings', 20: 'IRA deduction', 21: 'Student loan interest deduction', 26: 'Total adjustments' },
  'Schedule 1-A': { 13: 'No tax on tips', 21: 'No tax on overtime', 30: 'Car loan interest', 37: 'Enhanced deduction for seniors', charity: 'Charitable gifts (non-itemizer)', 38: 'Total additional deductions' },
  'Schedule 2': { '1a': 'Excess advance premium tax credit repayment (Form 8962)', 3: 'Total additions to tax (to Form 1040 line 17)', 4: 'Self-employment tax', 8: 'Additional tax on early retirement distributions', 11: 'Additional Medicare tax', 12: 'Net investment income tax', 21: 'Total other taxes' },
  'Schedule 3': { 1: 'Foreign tax credit', 2: 'Child and dependent care credit (Form 2441)', 3: 'Education credits', 8: 'Total nonrefundable credits', 9: 'Net premium tax credit (Form 8962)', 11: 'Excess social security tax withheld', 15: 'Total other payments' },
  'Schedule A': { 4: 'Medical and dental above 7.5% of AGI', '5d': 'State and local taxes before the cap', '5e': 'State and local taxes after the cap', 10: 'Home mortgage interest', 14: 'Gifts to charity', 16: 'Other itemized deductions', 17: 'Total itemized deductions' },
  'Form 2441': { 3: 'Care expenses within the dollar limit', 4: 'Your earned income', 5: 'Spouse\'s earned income', 6: 'Smallest of expenses and earned incomes', '9a': 'Credit before the tax limit', 10: 'Tax liability limit', 11: 'Child and dependent care credit', 12: 'Dependent care benefits received', 25: 'Excluded dependent care benefits', 26: 'Taxable dependent care benefits' },
  'Schedule E': { '23a': 'Total rents received', '23b': 'Total royalties received', '23c': 'Total mortgage interest', '23d': 'Total depreciation and depletion', '23e': 'Total expenses', 24: 'Income', 25: 'Losses allowed', 26: 'Total rental real estate and royalty income or loss' },
  'Schedule D': { 7: 'Net short-term gain or loss', 13: 'Capital gain distributions', 15: 'Net long-term gain or loss', 16: 'Net gain or loss', 21: 'Loss allowed this year' },
});

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function yearArg(value) {
  const year = String(value || '').trim() || String(Number(localToday().slice(0, 4)) - 1);
  return SUPPORTED_YEARS.includes(year) ? year : null;
}

function store(state) {
  if (!state.usReturns || typeof state.usReturns !== 'object') state.usReturns = {};
  return state.usReturns;
}

function blankReturn(taxYear) {
  return { taxYear, scopeId: randomBytes(9).toString('base64url'), filingStatus: '', taxpayer: null, spouse: null, dependents: [], address: null, forms: [], answers: {}, nextFormNumber: 1, nextDependentNumber: 1, updatedAt: '' };
}

function returnOf(state, taxYear, create = false) {
  const all = store(state);
  if (!all[taxYear] && create) all[taxYear] = blankReturn(taxYear);
  return all[taxYear] || null;
}

const text = (value, max = 80) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function sealedPerson(previous, incoming, scope, problems, who) {
  if (!incoming || typeof incoming !== 'object') return null;
  const person = { firstName: text(incoming.firstName, 40), lastName: text(incoming.lastName, 40), dateOfBirth: incoming.dateOfBirth ? String(incoming.dateOfBirth) : previous?.dateOfBirth || '', occupation: text(incoming.occupation ?? previous?.occupation, 40), blind: Boolean(incoming.blind ?? previous?.blind), canBeClaimedAsDependent: Boolean(incoming.canBeClaimedAsDependent ?? previous?.canBeClaimedAsDependent), tin: previous?.tin || null };
  if (!person.firstName || !person.lastName) problems.push(`${who}: first and last name are required.`);
  if (person.dateOfBirth && !isDate(person.dateOfBirth)) problems.push(`${who}: date of birth must be YYYY-MM-DD.`);
  const raw = incoming.ssn;
  if (raw !== undefined && raw !== null && raw !== '' && !/^\*/.test(String(raw)) && !isSealedTin(raw)) {
    const error = tinShapeError(raw);
    if (error) problems.push(`${who}: ${error === 'TIN_NOT_NINE_DIGITS' ? 'the SSN or ITIN must have nine digits' : error === 'TIN_NOT_ISSUABLE' ? 'that SSN or ITIN cannot have been issued' : 'the SSN or ITIN is required'}.`);
    else person.tin = sealTin(raw, { scope });
  }
  return person;
}

export function planUsTaxpayer(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const previous = returnOf(state, taxYear) || blankReturn(taxYear);
  const problems = [];
  const filingStatus = args.filingStatus === undefined ? previous.filingStatus : String(args.filingStatus);
  if (filingStatus && !FILING_STATUSES.includes(filingStatus)) problems.push(`Filing status must be one of ${FILING_STATUSES.join(', ')}.`);
  let taxpayer = previous.taxpayer;
  let spouse = previous.spouse;
  let dependents = previous.dependents;
  let address = previous.address;
  try {
    if (args.taxpayer !== undefined) taxpayer = sealedPerson(previous.taxpayer, args.taxpayer, `${previous.scopeId}:taxpayer`, problems, 'You');
    if (args.spouse !== undefined) spouse = args.spouse ? sealedPerson(previous.spouse, args.spouse, `${previous.scopeId}:spouse`, problems, 'Spouse') : null;
    let nextDependentNumber = previous.nextDependentNumber || 1;
    if (args.dependents !== undefined) {
      if (!Array.isArray(args.dependents) || args.dependents.length > 20) problems.push('Dependents must be a list of at most 20.');
      else dependents = args.dependents.map((item, index) => {
        const kept = previous.dependents.find((old) => old.id && old.id === item.id);
        const id = kept?.id || `dep-${nextDependentNumber++}`;
        const person = sealedPerson(kept, item, `${previous.scopeId}:dependent-${id}`, problems, `Dependent ${index + 1}`) || {};
        const relationship = String(item.relationship || kept?.relationship || '');
        if (!RELATIONSHIPS.includes(relationship)) problems.push(`Dependent ${index + 1}: relationship must be one of ${RELATIONSHIPS.join(', ')}.`);
        const months = item.months === undefined ? (kept?.months ?? 12) : Number(item.months);
        if (!Number.isInteger(months) || months < 0 || months > 12) problems.push(`Dependent ${index + 1}: months lived with you is 0 to 12.`);
        return { id, ...person, relationship, months, student: Boolean(item.student ?? kept?.student), disabled: Boolean(item.disabled ?? kept?.disabled), bornOrDiedInYear: Boolean(item.bornOrDiedInYear ?? kept?.bornOrDiedInYear) };
      });
    }
    if (args.address !== undefined) {
      const a = args.address || {};
      address = { line1: text(a.line1, 60), line2: text(a.line2, 60), city: text(a.city, 40), state: text(a.state, 2).toUpperCase(), zip: text(a.zip, 10) };
      if (!address.line1 || !address.city) problems.push('Address needs a street line and a city.');
      if (address.state && !US_STATES.has(address.state)) problems.push('State must be a two-letter US state or territory code.');
      if (address.zip && !/^\d{5}(?:-\d{4})?$/.test(address.zip)) problems.push('ZIP code must be 5 digits or ZIP+4.');
    }
    if (problems.length) return fail('US_TAXPAYER_INVALID', { problems });
    return { ok: true, taxYear, update: { filingStatus, taxpayer, spouse, dependents, address, nextDependentNumber } };
  } catch (err) {
    return fail(err?.code || 'TIN_SEAL_FAILED', { problems: [String(err?.code || err?.message || err)] });
  }
}

function personView(person) {
  if (!person) return null;
  return { firstName: person.firstName, lastName: person.lastName, ssn: person.tin ? maskTin(person.tin.last4) : '', ssnLast4: person.tin?.last4 || '', tinKind: person.tin?.kind || '', dateOfBirth: person.dateOfBirth, occupation: person.occupation, blind: person.blind, canBeClaimedAsDependent: person.canBeClaimedAsDependent };
}

function profileView(ret) {
  return { taxYear: ret.taxYear, filingStatus: ret.filingStatus, taxpayer: personView(ret.taxpayer), spouse: personView(ret.spouse), dependents: ret.dependents.map((item) => ({ id: item.id, ...personView(item), relationship: item.relationship, months: item.months, student: item.student, disabled: item.disabled })), address: ret.address };
}

export function usTaxpayer(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = returnOf(state, taxYear);
  if (!ret) return { ok: true, data: { taxYear, started: false, filingStatus: '', taxpayer: null, spouse: null, dependents: [], address: null } };
  return { ok: true, data: { started: true, ...profileView(ret) } };
}

export function setUsTaxpayer(state, args = {}) {
  const plan = planUsTaxpayer(state, args);
  if (!plan.ok) return plan;
  const ret = returnOf(state, plan.taxYear, true);
  Object.assign(ret, plan.update, { updatedAt: new Date().toISOString() });
  audit(state, 'us_taxpayer_set', { taxYear: plan.taxYear, filingStatus: ret.filingStatus, dependents: ret.dependents.length, spouse: Boolean(ret.spouse) });
  return { ok: true, data: profileView(ret) };
}

export function coerceFields(kind, fields, problems) {
  const spec = FORM_SPECS[kind];
  const out = {};
  const source = fields && typeof fields === 'object' ? fields : {};
  for (const item of spec.fields) {
    if (item.key === 'payer' || item.key === 'payerTin') continue;
    const value = source[item.key];
    if (value === undefined || value === null || value === '') {
      if (item.required) problems.push(`${item.label} (box ${item.box}) is required.`);
      continue;
    }
    if (item.type === 'money') {
      const number = Number(value);
      if (!Number.isFinite(number) || Math.abs(number) > MAX_AMOUNT) problems.push(`${item.label} must be an amount.`);
      else if (number < 0 && !item.negative && !(kind === '1099-B' && item.key === 'proceeds')) problems.push(`${item.label} cannot be negative.`);
      else out[item.key] = Math.round(number * 100) / 100;
    } else if (item.type === 'yesno') out[item.key] = value === true || ['yes', 'y', 'true', '1'].includes(String(value).trim().toLowerCase());
    else if (item.type === 'days') {
      const days = Number(value);
      if (!Number.isInteger(days) || days < 0 || days > 366) problems.push(`${item.label} is a whole number of days from 0 to 366.`);
      else out[item.key] = days;
    }
    else if (item.type === 'term') {
      if (value !== 'short' && value !== 'long') problems.push('Term is short or long.');
      else out[item.key] = value;
    } else if (item.type === 'state') {
      const code = text(value, 2).toUpperCase();
      if (!US_STATES.has(code)) problems.push('State must be a two-letter code.');
      else out[item.key] = code;
    } else if (item.type === 'date') {
      if (String(value).toLowerCase() === 'various') out[item.key] = 'VARIOUS';
      else if (!isDate(value)) problems.push(`${item.label} must be YYYY-MM-DD.`);
      else out[item.key] = String(value);
    } else if (item.key === 'box12') {
      const list = Array.isArray(value) ? value : [];
      out.box12 = list.slice(0, 8).map((row) => ({ code: text(row?.code, 2).toUpperCase(), amount: Math.round(Number(row?.amount || 0) * 100) / 100 })).filter((row) => /^[A-Z]{1,2}$/.test(row.code));
    } else out[item.key] = text(value, 60);
  }
  if (kind === RENTAL_ENTRY_KIND) rentalEntryProblems(out, problems);
  if (kind === '1099-B' && Array.isArray(source.transactions)) {
    out.transactions = source.transactions.slice(0, 500).map((row, index) => {
      const local = [];
      const coerced = coerceFields('1099-B', { ...row }, local);
      delete coerced.transactions;
      for (const problem of local) problems.push(`Sale ${index + 1}: ${problem}`);
      return coerced;
    });
  }
  return out;
}

function marketplaceProblems(fields) {
  const problems = [];
  const monthly = Object.keys(fields).some((key) => /^(enrollmentPremium|slcspPremium|advancePayment)\d+$/.test(key));
  if (!monthly && fields.enrollmentPremiumAnnual === undefined) problems.push('Enter the monthly amounts (lines 21 to 32) or the annual totals (line 33).');
  for (let month = 1; month <= 12; month += 1) {
    if (Number(fields[`advancePayment${month}`] || 0) > 0 && !(Number(fields[`enrollmentPremium${month}`] || 0) > 0)) problems.push(`${MONTH_NAMES[month - 1]}: an advance payment needs that month's enrollment premium (column A).`);
  }
  if (monthly) {
    for (const [prefix, total] of [['enrollmentPremium', 'enrollmentPremiumAnnual'], ['slcspPremium', 'slcspPremiumAnnual'], ['advancePayment', 'advancePaymentAnnual']]) {
      if (fields[total] === undefined) continue;
      const added = Array.from({ length: 12 }, (_, index) => Number(fields[`${prefix}${index + 1}`] || 0)).reduce((sum, value) => sum + value, 0);
      if (Math.abs(added - fields[total]) > 1) problems.push(`Line 33 ${total === 'enrollmentPremiumAnnual' ? 'column A' : total === 'slcspPremiumAnnual' ? 'column B' : 'column C'} (${fields[total]}) is not the total of the months (${Math.round(added * 100) / 100}).`);
    }
  }
  return problems;
}

function rentalEntryProblems(out, problems) {
  const type = Number(out.propertyType);
  if (out.propertyType !== undefined) {
    if (!Number.isInteger(type) || type < 1 || type > 8) problems.push('The type of property is a code from 1 to 8.');
    else out.propertyType = type;
  }
  if (out.recoveryClass !== undefined) {
    const value = String(out.recoveryClass).toLowerCase();
    const recoveryClass = value.startsWith('non') || value === '39' ? 'nonresidential' : value.startsWith('res') || value === '27.5' ? 'residential' : '';
    if (!recoveryClass) problems.push('The building class is residential or nonresidential.');
    else out.recoveryClass = recoveryClass;
  }
  if (out.placedInService === 'VARIOUS') problems.push('Date placed in service must be YYYY-MM-DD.');
  if ((out.fairRentalDays || 0) + (out.personalUseDays || 0) > 366) problems.push('Fair rental days and personal use days together cannot be more than the days in the year.');
  if (out.landValue > 0 && !(out.costBasis > 0)) problems.push('Enter the cost of the property with the land value.');
  if (out.landValue > out.costBasis) problems.push('The land value cannot be more than the cost.');
  if (type === 8 && !out.otherDescription) problems.push('Describe the property when its type is 8 (other).');
}

export function planUsTaxForm(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const asked = String(args.kind || '').trim().toUpperCase().replace(/^FORM\s*/, '');
  const kind = US_INPUT_KINDS.find((item) => item.toUpperCase() === asked);
  if (!kind) return fail('FORM_KIND_UNKNOWN', { kinds: US_INPUT_KINDS });
  const owner = args.owner === 'spouse' ? 'spouse' : 'taxpayer';
  const problems = [];
  const payer = text(args.payer ?? args.fields?.payer, 80);
  if (!payer && kind !== 'SSA-1099') problems.push(`${FORM_SPECS[kind].fields.find((item) => item.key === 'payer')?.label || 'Payer name'} is required.`);
  const payerTin = text(args.payerTin ?? args.fields?.payerTin, 12);
  if (payerTin && !/^\d{2}-?\d{7}$/.test(payerTin)) problems.push('Payer TIN must be an EIN, NN-NNNNNNN.');
  const hasTransactions = kind === '1099-B' && Array.isArray(args.fields?.transactions) && args.fields.transactions.length > 0;
  const fields = coerceFields(kind, hasTransactions ? { transactions: args.fields.transactions } : args.fields, hasTransactions ? [] : problems);
  if (hasTransactions) {
    const local = [];
    fields.transactions = coerceFields(kind, { transactions: args.fields.transactions }, local).transactions;
    problems.push(...local.filter((problem) => problem.startsWith('Sale ')));
  }
  if (kind === 'W-2' && fields.wages > 0 && fields.federalWithheld > fields.wages) problems.push('Federal tax withheld is more than the wages.');
  if (kind === '1095-A') problems.push(...marketplaceProblems(fields));
  if (problems.length) return fail('US_TAX_FORM_INVALID', { problems });
  const source = ['upload', 'payroll'].includes(args.source) ? args.source : 'manual';
  return { ok: true, taxYear, form: { kind, owner, payer, payerTin: payerTin.replace(/^(\d{2})-?(\d{7})$/, '$1-$2'), fields, source, documentId: text(args.documentId || args.documentSha256, 80) } };
}

export function addUsTaxForm(state, args = {}) {
  const plan = planUsTaxForm(state, args);
  if (!plan.ok) return plan;
  const ret = returnOf(state, plan.taxYear, true);
  const index = args.id ? ret.forms.findIndex((item) => item.id === String(args.id)) : -1;
  if (args.id && index < 0) return fail('US_TAX_FORM_NOT_FOUND', { id: args.id, taxYear: plan.taxYear });
  const form = index >= 0 ? { id: ret.forms[index].id, ...plan.form, addedOn: ret.forms[index].addedOn, updatedOn: localToday() } : { id: `usf-${plan.taxYear}-${ret.nextFormNumber++}`, ...plan.form, addedOn: localToday() };
  if (index >= 0) ret.forms[index] = form;
  else ret.forms.push(form);
  ret.updatedAt = new Date().toISOString();
  audit(state, index >= 0 ? 'us_tax_form_updated' : 'us_tax_form_added', { taxYear: plan.taxYear, id: form.id, kind: form.kind, owner: form.owner, payer: form.payer, source: form.source });
  return { ok: true, data: formView(form) };
}

export function findUsTaxForm(state, id) {
  for (const ret of Object.values(store(state))) {
    const form = ret.forms.find((item) => item.id === id);
    if (form) return { ret, form };
  }
  return null;
}

export function removeUsTaxForm(state, args = {}) {
  const found = findUsTaxForm(state, String(args.id || ''));
  if (!found) return fail('US_TAX_FORM_NOT_FOUND', { id: args.id });
  found.ret.forms = found.ret.forms.filter((item) => item.id !== found.form.id);
  found.ret.updatedAt = new Date().toISOString();
  audit(state, 'us_tax_form_removed', { taxYear: found.ret.taxYear, id: found.form.id, kind: found.form.kind, payer: found.form.payer });
  return { ok: true, data: { removed: found.form.id, kind: found.form.kind, payer: found.form.payer } };
}

function formView(form) {
  return { id: form.id, kind: form.kind, owner: form.owner, payer: form.payer, payerTin: form.payerTin, amounts: form.fields, source: form.source, documentId: form.documentId || '', addedOn: form.addedOn };
}

export function listUsTaxForms(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = returnOf(state, taxYear);
  return { ok: true, data: { taxYear, forms: (ret?.forms || []).map(formView) } };
}

export function usFormKinds() {
  return { ok: true, data: { kinds: US_INPUT_KINDS.map((kind) => ({ kind, title: FORM_SPECS[kind].title, description: FORM_SPECS[kind].description, fields: FORM_SPECS[kind].fields })), owners: ['taxpayer', 'spouse'], years: SUPPORTED_YEARS } };
}

function booksScheduleC(state, taxYear) {
  const hasUsInvoices = (state.invoices || []).some((inv) => inv.country === 'US' && String(inv.date || '').startsWith(taxYear));
  if (!hasUsInvoices) return null;
  const summary = scheduleCSummary(state, { year: taxYear });
  return summary.ok ? summary.data : null;
}

function context(state, ret) {
  const answers = ret?.answers || {};
  const books = ret ? booksScheduleC(state, ret.taxYear) : null;
  const usesBooks = Boolean(books) && answers.useBooksForScheduleC !== false;
  const manualBusiness = Number(answers.businessGrossReceipts || 0) > 0;
  return { taxYear: ret?.taxYear || '', status: ret?.filingStatus || '', hasMarketplace: (ret?.forms || []).some((form) => form.kind === '1095-A') || answers.marketplaceCoverage === true, answers: ret?.answers || {}, hasDependents: (ret?.dependents || []).length > 0, joint: ret?.filingStatus === 'mfj', booksHaveIncome: Boolean(books), usesBooks, books, manualBusiness, hasBusiness: usesBooks || manualBusiness || (ret?.forms || []).some((form) => form.kind === '1099-NEC'), hasStateRefund: (ret?.forms || []).some((form) => form.kind === '1099-G' && Number(form.fields.stateRefund || 0) > 0), hasEarlyDistribution: (ret?.forms || []).some((form) => form.kind === '1099-R' && String(form.fields.distributionCode || '').includes('1')), hasCareBenefits: (ret?.forms || []).some((form) => form.kind === 'W-2' && Number(form.fields.dependentCareBenefits || 0) > 0), hasCare: (ret?.forms || []).some((form) => form.kind === '2441-PROVIDER' || (form.kind === 'W-2' && Number(form.fields.dependentCareBenefits || 0) > 0)), hasRental: (ret?.forms || []).some((form) => form.kind === RENTAL_ENTRY_KIND || (form.kind === '1099-MISC' && Number(form.fields.rents || 0) + Number(form.fields.royalties || 0) > 0)) || answers.rentalIncome === true };
}

function visibleQuestions(state, ret) {
  const ctx = context(state, ret);
  return QUESTIONS.filter((question) => !question.when || question.when(ctx));
}

export function usInterview(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = returnOf(state, taxYear);
  const answers = ret?.answers || {};
  return { ok: true, data: { taxYear, questions: visibleQuestions(state, ret).map((question) => ({ id: question.id, text: question.text, help: question.help, kind: question.kind, options: question.options || [], answer: Object.hasOwn(answers, question.id) ? answers[question.id] : null })) } };
}

export function planUsInterviewAnswer(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const question = QUESTIONS.find((item) => item.id === String(args.id || ''));
  if (!question) return fail('US_QUESTION_UNKNOWN', { known: QUESTIONS.map((item) => item.id) });
  const raw = args.answer;
  if (raw === null || raw === undefined || raw === '') return { ok: true, taxYear, id: question.id, answer: null, question };
  if (question.kind === 'amount') {
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) return fail('US_ANSWER_INVALID', { problems: ['The answer is an amount of zero or more.'] });
    return { ok: true, taxYear, id: question.id, answer: Math.round(number * 100) / 100, question };
  }
  if (question.kind === 'yesno') {
    if (typeof raw !== 'boolean' && !['yes', 'no', 'true', 'false'].includes(String(raw).toLowerCase())) return fail('US_ANSWER_INVALID', { problems: ['The answer is yes or no.'] });
    return { ok: true, taxYear, id: question.id, answer: raw === true || ['yes', 'true'].includes(String(raw).toLowerCase()), question };
  }
  if (question.kind === 'choice') {
    if (!question.options.includes(String(raw))) return fail('US_ANSWER_INVALID', { problems: [`The answer is one of ${question.options.join(', ')}.`] });
    return { ok: true, taxYear, id: question.id, answer: String(raw), question };
  }
  if (question.id === 'businessActivityCode' && !/^\d{6}$/.test(String(raw).trim())) return fail('US_ANSWER_INVALID', { problems: ['The activity code has six digits.'] });
  return { ok: true, taxYear, id: question.id, answer: text(raw, 200), question };
}

export function answerUsInterview(state, args = {}) {
  const plan = planUsInterviewAnswer(state, args);
  if (!plan.ok) return plan;
  const ret = returnOf(state, plan.taxYear, true);
  if (plan.answer === null) delete ret.answers[plan.id];
  else ret.answers[plan.id] = plan.answer;
  ret.updatedAt = new Date().toISOString();
  audit(state, 'us_interview_answered', { taxYear: plan.taxYear, id: plan.id, answer: plan.answer });
  return { ok: true, data: { taxYear: plan.taxYear, id: plan.id, answer: plan.answer } };
}

function personInput(person, scope, forFiling) {
  if (!person) return null;
  const ssn = person.tin ? (forFiling ? openTin(person.tin.sealed, { scope }) : maskTin(person.tin.last4)) : '';
  return { firstName: person.firstName, lastName: person.lastName, ssn, dateOfBirth: person.dateOfBirth, dob: person.dateOfBirth, occupation: person.occupation, blind: person.blind, canBeClaimedAsDependent: person.canBeClaimedAsDependent, ssnValid: person.tin ? person.tin.kind === 'ssn' : undefined };
}

export function engineInput(state, ret, { forFiling = false } = {}) {
  const ctx = context(state, ret);
  const answers = { ...ret.answers };
  const businesses = [];
  if (ctx.usesBooks && ctx.books) businesses.push({ id: 'books', name: state.company?.name || 'Business', owner: 'taxpayer', source: 'books', grossReceipts: ctx.books.grossReceipts, returnsAndAllowances: ctx.books.returnsAndAllowances, costOfGoodsSold: ctx.books.costOfGoodsSold, expenses: ctx.books.expenses.filter((row) => row.deductible).map((row) => ({ line: row.line, label: row.label, amount: row.amount })) });
  else if (ctx.manualBusiness) businesses.push({ id: 'manual', name: 'Self-employment', owner: 'taxpayer', source: 'interview', grossReceipts: answers.businessGrossReceipts, costOfGoodsSold: answers.businessCostOfGoods, totalExpenses: answers.businessExpenses });
  return {
    taxYear: ret.taxYear,
    filingStatus: ret.filingStatus,
    taxpayer: personInput(ret.taxpayer, `${ret.scopeId}:taxpayer`, forFiling) || {},
    spouse: personInput(ret.spouse, `${ret.scopeId}:spouse`, forFiling),
    dependents: ret.dependents.map((item) => ({ ...personInput(item, `${ret.scopeId}:dependent-${item.id}`, forFiling), id: item.id, relationship: item.relationship, months: item.months, student: item.student, disabled: item.disabled, bornOrDiedInYear: item.bornOrDiedInYear })),
    address: ret.address,
    forms: ret.forms.map((form) => ({ id: form.id, kind: form.kind, owner: form.owner, payer: form.payer, fields: form.fields })),
    businesses,
    answers,
  };
}

const STEP_OF_CODE = { SSA_NET_REPAYMENT: 'forms', SSA_REPAYMENT_1341: 'forms', TIPS_ABOVE_NET_INCOME: 'interview', SPOUSE_REQUIRED: 'profile', SPOUSE_NAME_FOR_MFS: 'profile', HOH_NEEDS_QUALIFYING_PERSON: 'profile', QSS_NEEDS_CHILD: 'profile', DEPENDENT_DOB_INVALID: 'profile', CHILD_WITHOUT_SSN: 'profile', TAXPAYER_DOB_MISSING: 'profile', SPOUSE_FORM_ON_NON_JOINT: 'forms', NEC_ABOVE_RECEIPTS: 'forms', RENTAL_PROPERTY_NEEDED: 'forms', SCHEDULE_K1_NOT_COVERED: 'interview', REAL_ESTATE_PROFESSIONAL_NOT_COVERED: 'interview', VACATION_HOME_LIMIT: 'forms', SHORT_TERM_RENTAL_NOT_COVERED: 'forms', FORM_6198_NOT_COVERED: 'forms', FORM_4797_NOT_COVERED: 'forms', RENTAL_FROM_1099_ONLY: 'forms', RENTS_BELOW_1099: 'forms', ROYALTIES_BELOW_1099: 'forms', RENTAL_TYPE_INVALID: 'forms', RENTAL_DAYS_REQUIRED: 'forms', RENTAL_UNDER_15_DAYS: 'forms', RENTAL_PERSONAL_SHARE: 'forms', RENTAL_NOT_DEPRECIABLE: 'forms', RENTAL_RECOVERY_CLASS_REQUIRED: 'forms', RENTAL_DEPRECIATION_INVALID: 'forms', ROYALTY_NOT_PASSIVE: 'forms', ACTIVE_PARTICIPATION_UNANSWERED: 'forms', PASSIVE_LOSS_CARRYFORWARD: 'review', CARE_PROVIDERS_NEEDED: 'forms', CARE_PERSON_UNKNOWN: 'forms', CARE_PERSON_NOT_NAMED: 'forms', CARE_PERSON_NOT_QUALIFYING: 'forms', CARE_PROVIDER_TIN_MISSING: 'forms', CARE_HOUSEHOLD_EMPLOYEE: 'forms', CARE_CREDIT_MFS: 'interview', CARE_NO_QUALIFYING_PERSON: 'profile', CARE_SPOUSE_EARNED_INCOME: 'interview', FORM_8962_NOT_COVERED: 'interview', FORM_2210_MAY_APPLY: 'interview', QBI_ABOVE_THRESHOLD: 'review', NO_INCOME_DOCUMENTS: 'forms', EARLY_DISTRIBUTION: 'forms', FORM_AMOUNT_NEGATIVE: 'forms', DEPENDENT_FILER_WITH_DEPENDENTS: 'profile', DEPENDENT_BORN_AFTER_YEAR: 'profile', TAXPAYER_DOB_INVALID: 'profile', CTC_NEEDS_FILER_SSN: 'profile', FORM_1116_NEEDED: 'forms', ITEMIZED_37_LIMIT: 'interview', STATE_REFUND_TAXABILITY: 'interview', SE_HEALTH_ABOVE_PROFIT: 'interview', MORTGAGE_DEBT_LIMIT: 'forms', FORM_8283: 'interview', EMPLOYER_OVERWITHHELD_SS: 'forms', FORM_1095A_MISSING: 'forms', FORM_1095A_MONTHLY_NEEDED: 'forms', FORM_1095A_ANNUAL_ONLY: 'forms', FORM_1095A_SLCSP_DIFFERS: 'forms', FORM_8962_ALLOCATION_NOT_COVERED: 'interview', FORM_8962_MARRIAGE_ALTERNATIVE_NOT_COVERED: 'interview', PTC_MFS_NOT_ALLOWED: 'interview', PTC_BELOW_POVERTY_LINE: 'interview', PTC_ABOVE_400_PERCENT: 'review', PTC_CLAIMED_AS_DEPENDENT: 'profile', PTC_SE_HEALTH_INSURANCE: 'interview', PTC_RULES_MISSING: 'review' };

function profileChecks(ret) {
  const checks = [];
  const add = (code, message, fix) => checks.push({ level: 'error', code, message, fix, step: 'profile' });
  if (!ret.filingStatus) add('FILING_STATUS_REQUIRED', 'Choose a filing status.', 'Pick it on the About you step.');
  if (!ret.taxpayer) add('TAXPAYER_REQUIRED', 'Your name, SSN and date of birth are needed.', 'Fill in the About you step.');
  else if (!ret.taxpayer.tin) add('TAXPAYER_SSN_REQUIRED', 'Your SSN or ITIN is needed to file.', 'Add it on the About you step.');
  if (ret.filingStatus === 'mfj' && ret.spouse && !ret.spouse.tin) add('SPOUSE_SSN_REQUIRED', 'Your spouse\'s SSN or ITIN is needed on a joint return.', 'Add it on the About you step.');
  if (!ret.address?.line1 || !ret.address?.zip || !ret.address?.state) add('ADDRESS_REQUIRED', 'Your home address with state and ZIP is needed.', 'Add it on the About you step.');
  for (const item of ret.dependents) if (!item.tin) add('DEPENDENT_SSN_REQUIRED', `${item.firstName || 'A dependent'} needs an SSN, ITIN or ATIN.`, 'Add it on the About you step.');
  return checks;
}

function computedFor(state, taxYear, options = {}) {
  const ret = returnOf(state, taxYear);
  if (!ret) return { ret: null, result: fail('US_RETURN_NOT_STARTED', { taxYear }) };
  if (!ret.filingStatus) return { ret, result: fail('FILING_STATUS_REQUIRED') };
  return { ret, result: computeForm1040(engineInput(state, ret, options), taxYear) };
}

function reviewLines(data) {
  const rows = [];
  const push = (form, values, sourceFor = () => 'computed') => {
    const labels = LINE_LABELS[form] || {};
    for (const [line, label] of Object.entries(labels)) {
      if (!Object.hasOwn(values, line)) continue;
      const amount = values[line];
      if (form !== '1040' && !amount) continue;
      rows.push({ form, line, label, amount, source: sourceFor(line) });
    }
  };
  const fromForms = new Set(['1a', '1z', '2a', '2b', '3a', '3b', '4a', '5a', '6a', '25a', '25b']);
  push('1040', data.lines, (line) => (fromForms.has(line) ? 'forms' : line === '26' ? 'interview' : 'computed'));
  for (const [key, form] of [['1', 'Schedule 1'], ['1-A', 'Schedule 1-A'], ['2', 'Schedule 2'], ['3', 'Schedule 3'], ['2441', 'Form 2441'], ['A', 'Schedule A'], ['D', 'Schedule D']]) if (data.schedules[key]) push(form, data.schedules[key]);
  if (data.schedules.E) push('Schedule E', data.schedules.E.lines);
  return rows;
}

function amendmentLink(ret, data) {
  if (!ret.amendment) return null;
  const people = (ret.dependents || []).map((item, index) => ({ ...item, ctcEligible: data.dependents?.[index]?.ctcEligible || false, odcEligible: data.dependents?.[index]?.odcEligible || false }));
  const out = form1040X({ taxYear: ret.taxYear, amendment: ret.amendment, amended: figuresOf1040(data, people), amendedDependents: people, today: localToday() });
  if (!out.ok) return { started: true, form: '1040-X', tool: 'us_amended_return', computed: false, error: out.error };
  const x = out.data;
  return { started: true, form: '1040-X', tool: 'us_amended_return', computed: true, source: x.source, netChangeInTax: x.lines['11'].B, owed: x.owed, refund: x.refund, appliedToNextYear: x.appliedToNextYear, errors: x.checks.filter((item) => item.level === 'error').length };
}

export function usReturnReview(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const { ret, result } = computedFor(state, taxYear);
  if (!ret) return result;
  const profile = profileChecks(ret);
  if (!result.ok) return { ok: true, data: { taxYear, lines: [], refund: 0, owed: 0, unsupported: [], checks: [...profile, ...(result.error === 'FILING_STATUS_REQUIRED' && profile.some((item) => item.code === 'FILING_STATUS_REQUIRED') ? [] : [{ level: 'error', code: result.error, message: result.error === 'RULE_NOT_IN_FORCE' ? `MyCA has no tax rules for ${taxYear} yet.` : result.error, fix: '', step: 'review' }])], computed: false } };
  const data = result.data;
  const checks = [...profile, ...data.checks.map((item) => ({ ...item, step: STEP_OF_CODE[item.code] || 'review' }))];
  return { ok: true, data: { taxYear, filingStatus: data.filingStatus, lines: reviewLines(data), summary: data.summary, refund: data.summary.refund, owed: data.summary.owed, checks, schedules: Object.keys(data.schedules), rulesUsed: data.rulesUsed, unreviewed: data.unreviewed, unsupported: data.unsupported, notCovered: data.notCovered, notes: data.notes, computed: true, amendment: amendmentLink(ret, data) } };
}

export function usReturnStatus(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = returnOf(state, taxYear);
  if (!ret) return { ok: true, data: { taxYear, started: false, filingStatus: '', taxpayerName: '', steps: STEPS.map(([id, label]) => ({ id, label, done: false })), refund: 0, owed: 0, readyToSign: false, unsupported: [] } };
  const review = usReturnReview(state, { taxYear }).data;
  const errors = review.checks.filter((item) => item.level === 'error');
  const questions = visibleQuestions(state, ret);
  const done = {
    profile: !errors.some((item) => item.step === 'profile'),
    forms: ret.forms.length > 0 || context(state, ret).hasBusiness,
    interview: questions.every((question) => Object.hasOwn(ret.answers, question.id)),
    review: review.computed && errors.length === 0,
    sign: Boolean(state.usEfile?.returns?.[String(taxYear)]?.signature?.signedAt),
  };
  return { ok: true, data: { taxYear, started: true, filingStatus: ret.filingStatus, taxpayerName: ret.taxpayer ? `${ret.taxpayer.firstName} ${ret.taxpayer.lastName}`.trim() : '', steps: STEPS.map(([id, label]) => ({ id, label, done: done[id] })), refund: review.refund, owed: review.owed, readyToSign: done.profile && done.forms && done.review, errors: errors.length, warnings: review.checks.length - errors.length, unsupported: review.unsupported || [] } };
}

function efileShape(ret, data, input) {
  const w2s = ret.forms.filter((form) => form.kind === 'W-2').map((form) => ({ id: form.id, owner: form.owner, ein: form.payerTin, employerName: form.payer, wages: Math.round(form.fields.wages || 0), fedWithheld: Math.round(form.fields.federalWithheld || 0), ssWages: Math.round(form.fields.socialSecurityWages || 0), ssWithheld: Math.round(form.fields.socialSecurityTax || 0), medicareWages: Math.round(form.fields.medicareWages || 0), medicareWithheld: Math.round(form.fields.medicareTax || 0), state: form.fields.state || '', stateWages: Math.round(form.fields.stateWages || 0), stateWithheld: Math.round(form.fields.stateWithheld || 0) }));
  const person = (item) => (item ? { firstName: item.firstName, lastName: item.lastName, ssn: item.ssn, dob: item.dateOfBirth, occupation: item.occupation } : null);
  return {
    taxYear: data.taxYear,
    filingStatus: data.filingStatus,
    taxpayer: person(input.taxpayer),
    spouse: person(input.spouse),
    address: ret.address,
    dependents: input.dependents.map((item, index) => ({ firstName: item.firstName, lastName: item.lastName, ssn: item.ssn, dob: item.dateOfBirth, relationship: item.relationship, ctcEligible: data.dependents[index]?.ctcEligible || false, odcEligible: data.dependents[index]?.odcEligible || false, months: item.months })),
    digitalAssets: ret.answers.digitalAssets === true,
    answers: { ...ret.answers },
    lines: data.lines,
    schedules: data.schedules.C ? { ...data.schedules, C: data.schedules.C.map((item) => ({ ...item, businessName: item.name, activityCode: ret.answers.businessActivityCode || '' })) } : data.schedules,
    forms: ret.forms.map((form) => ({ id: form.id, kind: form.kind, owner: form.owner, payer: form.payer, payerTin: form.payerTin, fields: form.fields })),
    w2s,
    refund: ret.directDeposit || null,
    summary: data.summary,
    checks: data.checks,
    unsupported: data.unsupported,
    rulesUsed: data.rulesUsed,
    unreviewed: data.unreviewed,
  };
}

export function computedForm1040(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = returnOf(state, taxYear);
  if (!ret) return fail('US_RETURN_NOT_STARTED', { taxYear });
  const input = engineInput(state, ret);
  const result = computeForm1040(input, taxYear);
  if (!result.ok) return result;
  return { ok: true, data: efileShape(ret, result.data, input) };
}

export function computedForm1040ForFiling(state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const ret = returnOf(state, taxYear);
  if (!ret) return fail('US_RETURN_NOT_STARTED', { taxYear });
  let input;
  try {
    input = engineInput(state, ret, { forFiling: true });
  } catch (err) {
    return fail(err?.code || 'TIN_UNREADABLE');
  }
  const result = computeForm1040(input, taxYear);
  if (!result.ok) return result;
  return { ok: true, data: efileShape(ret, result.data, input) };
}

export function usTaxEstimate(_state, args = {}) {
  const taxYear = yearArg(args.taxYear);
  if (!taxYear) return fail('TAX_YEAR_NOT_SUPPORTED', { supported: SUPPORTED_YEARS });
  const kids = Math.max(0, Math.min(10, Number.parseInt(args.children ?? 0, 10) || 0));
  const forms = [];
  if (Number(args.wages) > 0) forms.push({ kind: 'W-2', owner: 'taxpayer', payer: 'Employer', fields: { wages: Number(args.wages), federalWithheld: Number(args.federalWithheld || 0), socialSecurityWages: Number(args.wages), medicareWages: Number(args.wages) } });
  if (Number(args.interest) > 0) forms.push({ kind: '1099-INT', payer: 'Interest', fields: { interest: Number(args.interest) } });
  if (Number(args.dividends) > 0) forms.push({ kind: '1099-DIV', payer: 'Dividends', fields: { ordinaryDividends: Number(args.dividends), qualifiedDividends: Number(args.qualifiedDividends || 0) } });
  if (Number(args.longTermGains) !== 0 && Number.isFinite(Number(args.longTermGains))) forms.push({ kind: '1099-B', payer: 'Gains', fields: { proceeds: Math.max(0, Number(args.longTermGains)), costBasis: Math.max(0, -Number(args.longTermGains)), term: 'long' } });
  const birthYear = Number(taxYear) - (Number(args.age) || 40);
  const input = {
    filingStatus: FILING_STATUSES.includes(args.filingStatus) ? args.filingStatus : 'single',
    taxpayer: { firstName: 'Estimate', lastName: '', dateOfBirth: `${birthYear}-07-01` },
    spouse: args.filingStatus === 'mfj' ? { firstName: 'Spouse', lastName: '', dateOfBirth: `${birthYear}-07-01` } : null,
    dependents: Array.from({ length: kids }, (_, index) => ({ firstName: `Child ${index + 1}`, relationship: 'son', dateOfBirth: `${Number(taxYear) - 8}-07-01`, months: 12 })),
    forms,
    businesses: Number(args.businessProfit) ? [{ name: 'Business', owner: 'taxpayer', grossReceipts: Number(args.businessProfit), totalExpenses: 0 }] : [],
    answers: { itemize: args.itemizedDeductions ? 'auto' : 'no', otherItemizedDeductions: Number(args.itemizedDeductions || 0), estimatedTaxPayments: Number(args.estimatedTaxPayments || 0) },
  };
  const result = computeForm1040(input, taxYear);
  if (!result.ok) return result;
  const data = result.data;
  return { ok: true, data: { taxYear, filingStatus: data.filingStatus, summary: data.summary, lines: data.lines, schedules: Object.keys(data.schedules), checks: data.checks.filter((item) => !['TAXPAYER_DOB_MISSING', 'SPOUSE_REQUIRED'].includes(item.code)), rulesUsed: data.rulesUsed, unreviewed: data.unreviewed, notes: ['An estimate from the figures given, children taken as under 17 with SSNs; for your CPA to confirm.', ...data.notes] } };
}

export function usTaxpayerPreview(state, args) {
  const plan = planUsTaxpayer(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.error], summary: '', effects: [], figures: {} };
  const u = plan.update;
  const names = [u.taxpayer, u.spouse].filter(Boolean).map((item) => `${item.firstName} ${item.lastName}`.trim());
  return { blockers: [], summary: `${plan.taxYear} return: ${u.filingStatus ? u.filingStatus.toUpperCase() : 'no filing status yet'}${names.length ? `, ${names.join(' and ')}` : ''}${u.dependents.length ? `, ${u.dependents.length === 1 ? '1 dependent' : `${u.dependents.length} dependents`}` : ''}.`, effects: ['SSNs are kept sealed; only the last four digits are shown.'], figures: { taxYear: plan.taxYear, filingStatus: u.filingStatus, dependents: u.dependents.length } };
}

export function usTaxFormPreview(state, args) {
  const plan = planUsTaxForm(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.error === 'FORM_KIND_UNKNOWN' ? `The form is one of ${US_INPUT_KINDS.join(', ')}.` : plan.error], summary: '', effects: [], figures: {} };
  const f = plan.form;
  const main = FORM_SPECS[f.kind].fields.find((item) => item.required && item.type === 'money');
  const amount = main && f.fields[main.key] !== undefined ? ` ${main.label.toLowerCase()} $${Number(f.fields[main.key]).toLocaleString('en-US')}` : '';
  return { blockers: [], summary: `${f.kind} from ${f.payer || 'the payer'}${f.owner === 'spouse' ? ' (spouse)' : ''}:${amount}${f.fields.federalWithheld ? `, federal tax withheld $${Number(f.fields.federalWithheld).toLocaleString('en-US')}` : ''}.`, effects: [args.id ? `Replaces ${args.id} on the ${plan.taxYear} return.` : `Added to the ${plan.taxYear} return.`], figures: { taxYear: plan.taxYear, kind: f.kind } };
}

export function removeUsTaxFormPreview(state, args) {
  const found = findUsTaxForm(state, String(args.id || ''));
  if (!found) return { blockers: ['That form is not on any return.'], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Remove the ${found.form.kind} from ${found.form.payer || 'the payer'} from the ${found.ret.taxYear} return.`, effects: ['The return is recomputed without it.'], figures: { id: found.form.id } };
}

export function usInterviewPreview(state, args) {
  const plan = planUsInterviewAnswer(state, args);
  if (!plan.ok) return { blockers: plan.problems || [plan.error], summary: '', effects: [], figures: {} };
  const shown = plan.answer === null ? 'cleared' : plan.question.kind === 'amount' ? `$${Number(plan.answer).toLocaleString('en-US')}` : plan.question.kind === 'yesno' ? (plan.answer ? 'yes' : 'no') : String(plan.answer);
  return { blockers: [], summary: `${plan.question.text}: ${shown}.`, effects: [`Saved on the ${plan.taxYear} return.`], figures: { taxYear: plan.taxYear, id: plan.id } };
}

export function usReturnRecord(state, taxYear, { create = false, scopeId = '' } = {}) {
  const all = store(state);
  if (!all[taxYear] && create) all[taxYear] = { ...blankReturn(taxYear), ...(scopeId ? { scopeId } : {}) };
  return all[taxYear] || null;
}

export function usReturnWords(name, data, money) {
  if (name === 'us_return_status') {
    if (!data.started) return `No ${data.taxYear} return started yet. Start with your filing status and details.`;
    const next = data.steps.find((step) => !step.done);
    return `${data.taxYear} return${data.taxpayerName ? ` for ${data.taxpayerName}` : ''}: ${data.refund > 0 ? `refund ${money(data.refund)}` : data.owed > 0 ? `you owe ${money(data.owed)}` : 'no refund or balance due'} so far.${next ? ` Next: ${next.label.toLowerCase()}.` : ''}${data.errors ? ` ${data.errors === 1 ? '1 thing' : `${data.errors} things`} to fix.` : ''}`;
  }
  if (name === 'us_return_review') {
    if (!data.computed) return `The ${data.taxYear} return cannot be computed yet: ${data.checks.map((item) => item.message).join(' ')}`;
    const s = data.summary;
    const errors = data.checks.filter((item) => item.level === 'error');
    return [`${data.taxYear} Form 1040 draft (${data.filingStatus}):`, `· Total income ${money(s.totalIncome)}, AGI ${money(s.agi)}`, `· ${s.itemized ? 'Itemized' : 'Standard'} deduction ${money(s.deduction)}, taxable income ${money(s.taxableIncome)}`, `· Total tax ${money(s.totalTax)}, payments and refundable credits ${money(s.payments)}`, `· ${s.refund > 0 ? `Refund ${money(s.refund)}` : `Amount owed ${money(s.owed)}`}`, ...errors.map((item) => `· To fix: ${item.message}`), data.amendment?.computed ? `· Amended return (Form 1040-X) started: tax ${data.amendment.netChangeInTax >= 0 ? 'up' : 'down'} ${money(Math.abs(data.amendment.netChangeInTax))}, ${data.amendment.owed > 0 ? `${money(data.amendment.owed)} more to pay` : `${money(data.amendment.refund)} more refunded`}; see us_amended_return.` : '', data.unreviewed ? 'A US CPA has not reviewed these rules yet; for your CPA to confirm.' : ''].filter(Boolean).join('\n');
  }
  if (name === 'us_tax_estimate') {
    const s = data.summary;
    return `${data.taxYear} federal estimate (${data.filingStatus}): AGI ${money(s.agi)}, taxable income ${money(s.taxableIncome)}, total tax ${money(s.totalTax)} (${s.effectiveRate}% of income), ${s.refund > 0 ? `refund ${money(s.refund)}` : `owed ${money(s.owed)}`} after payments. For your CPA to confirm.`;
  }
  if (name === 'list_us_tax_forms') return data.forms.length ? [`Tax forms on the ${data.taxYear} return:`, ...data.forms.map((form) => `· ${form.kind} from ${form.payer || 'payer'}${form.owner === 'spouse' ? ' (spouse)' : ''}`)].join('\n') : `No tax forms on the ${data.taxYear} return yet.`;
  if (name === 'us_interview') {
    const open = data.questions.filter((question) => question.answer === null);
    return open.length ? `${open.length} of ${data.questions.length} questions left for ${data.taxYear}. Next: ${open[0].text}` : `All ${data.questions.length} questions for ${data.taxYear} are answered.`;
  }
  return '';
}

