const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });

const RECIPROCITY = {
  DC: ['*'],
  IL: ['IA', 'KY', 'MI', 'WI'],
  IN: ['KY', 'MI', 'OH', 'PA', 'WI'],
  IA: ['IL'],
  KY: ['IL', 'IN', 'MI', 'OH', 'VA', 'WV', 'WI'],
  MD: ['DC', 'PA', 'VA', 'WV'],
  MI: ['IL', 'IN', 'KY', 'MN', 'OH', 'WI'],
  MN: ['MI', 'ND'],
  MT: ['ND'],
  NJ: ['PA'],
  ND: ['MN', 'MT'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
  PA: ['IN', 'MD', 'NJ', 'OH', 'VA', 'WV'],
  VA: ['DC', 'KY', 'MD', 'PA', 'WV'],
  WV: ['KY', 'MD', 'OH', 'PA', 'VA'],
  WI: ['IL', 'IN', 'KY', 'MI'],
};

const SOURCE = 'Each work state\'s reciprocal agreement page: Illinois Department of Revenue Publication 130; Indiana Department of Revenue Income Tax Information Bulletin 33; Kentucky Revenue Circular 40C003; Comptroller of Maryland Administrative Release 3; Michigan Revenue Administrative Bulletin 2016-24; Minnesota Revenue Fact Sheet 1 (North Dakota) and the Michigan agreement; Montana Department of Revenue (North Dakota agreement); New Jersey Division of Taxation reciprocal agreement with Pennsylvania (NJ-165, PA REV-419); Ohio Revised Code 5747.05(A)(3) agreements; Pennsylvania Department of Revenue reciprocal agreements (REV-419); Virginia Code 58.1-332 and Tax Bulletin on reciprocity; West Virginia Code 11-21-40; Wisconsin Publication 121; District of Columbia Code 47-1806.03 (DC does not tax the wages of nonresidents). Compiled 2026-11-21 from the agencies\' published lists; the agreement texts not re-read for this record';

export const RULES = [2025, 2026].map((y) => ({
  id: 'us.state-return.reciprocity',
  value: { workStateExemptsResidentsOf: RECIPROCITY, covers: 'wages_salaries_tips_and_commissions_only' },
  basis: 'work_state_does_not_tax_wages_of_residents_of_a_reciprocal_state_the_employee_files_the_work_state_exemption_certificate_and_files_a_work_state_return_only_to_get_back_tax_withheld_in_error',
  ...year(y),
  act: 'State reciprocal income tax agreements',
  section: 'wages of nonresidents',
  source: SOURCE,
  attestations: []
}));
