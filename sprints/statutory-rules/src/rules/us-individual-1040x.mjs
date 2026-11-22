const D = 100;
const READ_1040X = 'read from the Instructions for Form 1040-X (Rev. December 2025), irs.gov/pub/irs-pdf/i1040x.pdf, and Form 1040-X (Rev. December 2025), irs.gov/pub/irs-pdf/f1040x.pdf, on 2026-11-21';
const READ_FAQ = 'read from IRS Amended Return Frequently Asked Questions, irs.gov/filing/amended-return-frequently-asked-questions (answers updated May 28, 2025 and January 2, 2024), on 2026-11-21';

export const RULES = [
  {
    id: 'us.federal.individual.amended-return',
    value: { refundYearsFromFiling: 3, refundYearsFromPayment: 2, efilePriorPeriods: 2, efileMaxPerYear: 3 },
    basis: 'claim_for_credit_or_refund_on_form_1040x_within_3_years_after_the_original_return_was_filed_or_2_years_after_the_tax_was_paid_whichever_is_later_and_electronic_filing_of_form_1040x_for_the_current_and_two_prior_tax_periods',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6511(a), 6513(a)',
    source: `IRC section 6511(a): a claim for credit or refund within three years from the time the return was filed or two years from the time the tax was paid, whichever is later; section 6513(a): a return filed before the due date is treated as filed on the due date. ${READ_1040X} ("Generally, for a credit or refund, you must file Form 1040-X within 3 years (including extensions) after the date you filed your original return or within 2 years after the date you paid the tax, whichever is later"; "In general, you can't change your filing status from a joint return to separate returns after the due date of the original return"). Electronic filing for "the current or two prior tax periods" and "up to three amended returns per tax year": ${READ_FAQ}. The section 7503 move of a deadline on a Saturday, Sunday or District of Columbia legal holiday is in us.federal.legal-holidays; disaster and combat-zone postponements and financial disability under section 6511(h) are not encoded`,
    attestations: []
  },
  {
    id: 'us.federal.individual.claim-of-right',
    value: { thresholdCents: 3000 * D },
    basis: 'repayment_of_an_amount_included_in_income_in_an_earlier_year_is_an_itemized_deduction_or_a_section_1341_credit_only_when_it_exceeds_the_threshold',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '1341(a)(3), 67(b)(9)',
    source: 'IRC section 1341(a)(3): the claim-of-right computation applies when the deduction exceeds three thousand dollars; section 67(b)(9) keeps that deduction outside the miscellaneous itemized deductions. Pub. 915 (2026), Repayments More Than Gross Benefits: a negative box 5 makes none of the benefits taxable and offsets a positive box 5 of another form, including the spouse form on a joint return; "If the figure is $3,000 or less, it is a miscellaneous itemized deduction and can no longer be deducted"; above $3,000 the tax is figured both with the itemized deduction and with the section 1341 credit (Schedule 3 line 13z, I.R.C. 1341) and the smaller is used. Read from irs.gov/publications/p915 on 2026-11-21; the 2025 edition was not re-read',
    attestations: []
  },
];
