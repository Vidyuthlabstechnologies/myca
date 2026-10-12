const CENT = 1;
const DOLLAR = 100 * CENT;

export const RULES = [
  {
    id: 'us.federal.1099-nec.threshold',
    value: { amountCents: 600 * DOLLAR },
    basis: 'calendar_year_payments_for_services_to_a_non_employee_at_or_above',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2025-12-31',
    act: 'IRC',
    section: '6041(a); 6041A(a)',
    source: 'Internal Revenue Code section 6041(a) and 6041A(a): payments of six hundred dollars or more in a calendar year to a person for services in the course of a trade or business are reported; Form 1099-NEC reinstated for 2020 by the Taxpayer First Act (IRS Form 1099-NEC instructions 2020 to 2025). Registry coverage starts 1 January 2020; the figure was in force long before',
    attestations: []
  },
  {
    id: 'us.federal.1099-nec.threshold',
    value: { amountCents: 2000 * DOLLAR },
    basis: 'calendar_year_payments_for_services_to_a_non_employee_at_or_above',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6041(a); 6041A(a) as amended',
    source: 'Public Law 119-21 (One Big Beautiful Bill Act, enacted 4 July 2025) section 70433 raising the reporting threshold in sections 6041(a) and 6041A(a) from six hundred to two thousand dollars for payments made after 31 December 2025, indexed for inflation after 2026 (indexing not encoded); figure as stated in published 2026 guidance on 2026-10-13, the enacted text not re-read for this record',
    attestations: []
  }
];
