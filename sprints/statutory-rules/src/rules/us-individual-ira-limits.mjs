const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const LIMIT_RULE = 'The overall limit on contributions to traditional and Roth IRAs is the smaller of the dollar limit (plus the catch-up for an individual who attained age 50 before the close of the year) or taxable compensation; on a joint return the compensation limit is the combined compensation less the other spouse\'s IRA contributions (section 219(c), Kay Bailey Hutchison spousal IRA, Pub. 590-A)';

export const RULES = [
  {
    id: 'us.federal.individual.ira-contribution-limit',
    value: { limitCents: 7000 * D, catchUpCents: 1000 * D, catchUpAge: 50 },
    basis: 'overall_limit_on_traditional_and_roth_ira_contributions_for_the_year_plus_the_catch_up_at_age_50_limited_to_taxable_compensation',
    ...year(2025),
    act: 'IRC',
    section: '219(b)(1), 219(b)(5), 219(c), 408A(c)(2)',
    source: `IRC section 219(b)(5)(A) and (C) as indexed, section 219(b)(5)(B) catch-up, section 408A(c)(2) (Roth contributions share the same limit). ${LIMIT_RULE}. Read from the 2025 Instructions for Form 8606, irs.gov/pub/irs-pdf/i8606.pdf ("the smaller of $7,000 ($8,000 if age 50 or older at the end of 2025) or your taxable compensation"), and the 2025 Instructions for Form 5329, irs.gov/pub/irs-pdf/i5329.pdf, line 10, on 2026-11-22`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ira-contribution-limit',
    value: { limitCents: 7500 * D, catchUpCents: 1100 * D, catchUpAge: 50 },
    basis: 'overall_limit_on_traditional_and_roth_ira_contributions_for_the_year_plus_the_catch_up_at_age_50_limited_to_taxable_compensation',
    ...year(2026),
    act: 'IRC',
    section: '219(b)(1), 219(b)(5), 219(c), 408A(c)(2)',
    source: `IRC section 219(b)(5)(A) and (C) as indexed; the catch-up is indexed from 2024 by section 219(b)(5)(C)(iii) (SECURE 2.0 Act section 108). ${LIMIT_RULE}. Notice 2025-67 and news release IR-2025-111 (13 November 2025), irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500: "$7,500, up from $7,000" and the catch-up "$1,100, up from $1,000"; the 2026 draft Instructions for Form 8606 and Form 5329, irs.gov/pub/irs-dft/i8606--dft.pdf and i5329--dft.pdf, say "$7,500 ($8,600 if age 50 or older at the end of 2026)"; read on 2026-11-22`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ira-contribution-limit',
    value: { limitCents: 7500 * D, catchUpCents: 1100 * D, catchUpAge: 50 },
    basis: 'overall_limit_on_traditional_and_roth_ira_contributions_for_the_year_plus_the_catch_up_at_age_50_limited_to_taxable_compensation',
    ...year(2027),
    act: 'IRC',
    section: '219(b)(1), 219(b)(5), 219(c), 408A(c)(2)',
    source: `IRC section 219(b)(5) as indexed. ${LIMIT_RULE}. Notice 2026-66 and news release IR-2026-136 (12 November 2026), irs.gov/node/167581: the IRA limit for 2027 is $7,500 and the catch-up $1,100, both unchanged from 2026; read on 2026-11-22`,
    attestations: []
  },
];
