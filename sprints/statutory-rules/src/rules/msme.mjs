const LOOKUP = 'Looked up by the date of the supply (the day of acceptance of the goods or services)';

function record(id, value, basis, effectiveFrom, effectiveTo, act, section, source) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source}. ${LOOKUP}`, attestations: [] };
}

export const RULES = [
  record(
    'msme.payment-days', { withAgreementMaxDays: 45, withoutAgreementDays: 15, appliesTo: ['micro', 'small', 'medium'] }, 'days_from_acceptance',
    '2006-10-02', null, 'MSMED-2006', '15; 2(b)',
    'Micro, Small and Medium Enterprises Development Act 2006 (27 of 2006), in force from 02.10.2006 (S.O. 1154(E) dated 18.07.2006): s.15 requires the buyer to pay on or before the date agreed in writing, and that date shall not exceed forty-five days from the day of acceptance or the day of deemed acceptance; where there is no agreement, before the appointed day, which s.2(b) defines as the day following fifteen days from the day of acceptance'
  ),
  record(
    'msme.deduction-on-payment', { appliesTo: ['micro', 'small'], deductibleOnlyWhenPaidWithinMsmedTime: true, otherwiseDeductibleInYearOfPayment: true }, 'payment_within_msmed_s15_time',
    '2023-04-01', '2026-03-31', 'IT-1961', '43B(h)',
    'Income-tax Act 1961 s.43B(h), inserted by the Finance Act 2023 with effect from 01.04.2024 (assessment year 2024-25, so previous years from 01.04.2023): a sum payable to a micro or small enterprise beyond the time limit in s.15 of the MSMED Act is deductible only in the previous year in which it is actually paid; the proviso to s.43B (payment before the return due date) does not apply to clause (h). Medium enterprises are not covered'
  ),
  record(
    'msme.deduction-on-payment', { appliesTo: ['micro', 'small'], deductibleOnlyWhenPaidWithinMsmedTime: true, otherwiseDeductibleInYearOfPayment: true }, 'payment_within_msmed_s15_time',
    '2026-04-01', null, 'IT-2025', 'Deductions allowed only on actual payment (successor to s.43B(h))',
    'Income-tax Act 2025 (30 of 2025), in force from 01.04.2026, carries the s.43B(h) rule forward in its provision for deductions allowed only on actual payment; the section number in the 2025 Act was not re-read for this record and must be confirmed by the advisor before attestation'
  )
];
