const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

const RATE_SET_BEFORE_22_SEP_2025 = [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28];
const RATE_SET_22_SEP_2025_TO_31_JAN_2026 = [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28, 40];
const RATE_SET_FROM_1_FEB_2026 = [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 40];

function twoDigitCodes(from, to) {
  return Array.from({ length: to - from + 1 }, (_, offset) => String(from + offset).padStart(2, '0'));
}

const STATE_CODES_BEFORE_LADAKH = [...twoDigitCodes(1, 27), ...twoDigitCodes(29, 37), '97', '99'];
const STATE_CODES_WITH_LADAKH = [...twoDigitCodes(1, 27), ...twoDigitCodes(29, 38), '97', '99'];
const STATE_CODE_LISTS = 'State code masters of the e-invoice portal (einvoice1.gst.gov.in Master Codes: 01-27, 29-38, 96, 97, 99) and the e-way bill API (docs.ewaybillgst.gov.in state codes: 01-24, 26, 27, 29-38, 97, 99); neither lists 28; 96 is a place-of-supply code for foreign recipients, not a GSTIN prefix';

const MERCHANT_EXPORTER = '40/2017-Central Tax (Rate) dated 23.10.2017 (0.05 per cent central tax, 0.1 per cent combined, supplies to merchant exporters)';
const SERVICES_BEFORE = '11/2017-Central Tax (Rate) as amended up to 16.01.2025 (central tax 0.75, 2.5, 3.75, 6, 9, 14; 0.75 and 3.75 for residential construction inserted by 3/2019-Central Tax (Rate) w.e.f. 01.04.2019)';
const SERVICES_AFTER = '11/2017-Central Tax (Rate) as amended by 15/2025-Central Tax (Rate) w.e.f. 22.09.2025 (central tax 0.75, 2.5, 3.75, 6, 9, 20; 6 kept for item (ie) ongoing housing projects)';
const GOODS_AFTER = '9/2025-Central Tax (Rate) dated 17.09.2025 w.e.f. 22.09.2025 superseding 1/2017-Central Tax (Rate) (central tax 2.5, 9, 20, 1.5, 0.125, 0.75 and 14 in Schedule VII for pan masala and tobacco); 14/2025-Central Tax (Rate) w.e.f. 22.09.2025 (central tax 6 for bricks and roofing tiles)';

function gstr9Exemption(effectiveFrom, effectiveTo, section, source) {
  return {
    id: 'gst.gstr9.exemption-threshold',
    value: 2 * CRORE,
    basis: 'aggregate_turnover_paise_up_to',
    effectiveFrom,
    effectiveTo,
    act: 'CGST',
    section,
    source,
    attestations: []
  };
}

export const RULES = [
  {
    id: 'gst.rates.valid',
    value: RATE_SET_BEFORE_22_SEP_2025,
    basis: 'combined_rate_percent',
    effectiveFrom: '2019-04-01',
    effectiveTo: '2025-09-21',
    act: 'CGST',
    section: 'Section 9(1) and section 11(1); IGST Act section 5(1)',
    source: `Goods: 1/2017-Central Tax (Rate) dated 28.06.2017 as amended (central tax 2.5, 6, 9, 14, 1.5, 0.125 and 0.75 in Schedule VII from 18.07.2022 by 6/2022-Central Tax (Rate)); ${MERCHANT_EXPORTER}; services: ${SERVICES_BEFORE}; 0 for nil-rated and exempt supplies (2/2017-Central Tax (Rate), 12/2017-Central Tax (Rate)); IGST rates equal the combined rate under the matching Integrated Tax (Rate) notifications`,
    attestations: []
  },
  {
    id: 'gst.rates.valid',
    value: RATE_SET_22_SEP_2025_TO_31_JAN_2026,
    basis: 'combined_rate_percent',
    effectiveFrom: '2025-09-22',
    effectiveTo: '2026-01-31',
    act: 'CGST',
    section: 'Section 9(1) and section 11(1); IGST Act section 5(1)',
    source: `Goods: ${GOODS_AFTER}; ${MERCHANT_EXPORTER}; services: ${SERVICES_AFTER}; 0 for nil-rated and exempt supplies; IGST rates equal the combined rate under 9/2025-Integrated Tax (Rate) and the matching Integrated Tax (Rate) notifications`,
    attestations: []
  },
  {
    id: 'gst.rates.valid',
    value: RATE_SET_FROM_1_FEB_2026,
    basis: 'combined_rate_percent',
    effectiveFrom: '2026-02-01',
    effectiveTo: null,
    act: 'CGST',
    section: 'Section 9(1) and section 11(1); IGST Act section 5(1)',
    source: `Goods: ${GOODS_AFTER}; 19/2025-Central Tax (Rate) and 19/2025-Integrated Tax (Rate) dated 31.12.2025 w.e.f. 01.02.2026 omit Schedule VII (14 per cent central, 28 per cent combined), moving pan masala and tobacco goods to 40 and biris to 18; 01/2026-Central Tax (Rate) dated 30.04.2026 changes no rate; ${MERCHANT_EXPORTER}; services: ${SERVICES_AFTER}; 0 for nil-rated and exempt supplies`,
    attestations: []
  },
  {
    id: 'gst.b2cl.threshold',
    value: 250000 * RUPEE,
    basis: 'invoice_value_paise_more_than',
    effectiveFrom: '2017-07-01',
    effectiveTo: '2020-12-31',
    act: 'CGST',
    section: 'Rule 59(2)(a)(ii) and (b)(ii), CGST Rules 2017; FORM GSTR-1 Table 5',
    source: 'CGST Rules 2017, rule 59 as it read before substitution by Notification 82/2020-Central Tax: invoice-wise details of inter-State supplies to unregistered persons with invoice value more than two and a half lakh rupees',
    attestations: []
  },
  {
    id: 'gst.b2cl.threshold',
    value: 250000 * RUPEE,
    basis: 'invoice_value_paise_more_than',
    effectiveFrom: '2021-01-01',
    effectiveTo: '2024-07-31',
    act: 'CGST',
    section: 'Rule 59(4)(a)(ii) and (b)(ii), CGST Rules 2017; FORM GSTR-1 Table 5',
    source: 'Notification 82/2020-Central Tax dated 10.11.2020 substituting rule 59 w.e.f. 01.01.2021 (two and a half lakh rupees)',
    attestations: []
  },
  {
    id: 'gst.b2cl.threshold',
    value: LAKH,
    basis: 'invoice_value_paise_more_than',
    effectiveFrom: '2024-08-01',
    effectiveTo: null,
    act: 'CGST',
    section: 'Rule 59(4)(a)(ii) and (b)(ii), CGST Rules 2017; FORM GSTR-1 Table 5',
    source: 'Notification 12/2024-Central Tax dated 10.07.2024, rule 11(ii) and rule 28: in rule 59(4) and FORM GSTR-1 Table 5, two and a half lakh rupees replaced by one lakh rupees w.e.f. 01.08.2024',
    attestations: []
  },
  {
    id: 'gst.gstin.state-codes',
    value: STATE_CODES_BEFORE_LADAKH,
    basis: 'gstin_first_two_characters',
    effectiveFrom: '2017-07-01',
    effectiveTo: '2019-12-31',
    act: 'CGST',
    section: '',
    source: `${STATE_CODE_LISTS}; Ladakh GSTINs used 01 until 31.12.2019`,
    attestations: []
  },
  {
    id: 'gst.gstin.state-codes',
    value: STATE_CODES_WITH_LADAKH,
    basis: 'gstin_first_two_characters',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'CGST',
    section: '',
    source: `${STATE_CODE_LISTS}; GSTN user guide (tutorial.gst.gov.in, First-time login): new GSTINs with UT code 38 for Ladakh apply to periods from 1 January 2020`,
    attestations: []
  },
  gstr9Exemption('2017-04-01', '2019-03-31', 'Section 148 special procedure for the annual return under section 44(1) and rule 80(1)', 'Notification 47/2019-Central Tax dated 09.10.2019: for FY 2017-18 and 2018-19, registered persons whose aggregate turnover does not exceed two crore rupees may choose to furnish the annual return; if not furnished it is deemed furnished on the due date'),
  gstr9Exemption('2019-04-01', '2020-03-31', 'Section 148 special procedure for the annual return under section 44(1) and rule 80(1)', 'Notification 47/2019-Central Tax as amended by Notification 77/2020-Central Tax dated 15.10.2020 extending the optional annual return to FY 2019-20 (aggregate turnover not exceeding two crore rupees)'),
  gstr9Exemption('2020-04-01', '2021-03-31', 'Section 44, first proviso', 'Notification 31/2021-Central Tax dated 30.07.2021 w.e.f. 01.08.2021: exempts registered persons whose aggregate turnover in FY 2020-21 is up to two crore rupees from filing the annual return for that year'),
  gstr9Exemption('2021-04-01', '2022-03-31', 'Section 44, first proviso', 'Notification 10/2022-Central Tax dated 05.07.2022: exempts registered persons whose aggregate turnover in FY 2021-22 is up to two crore rupees from filing the annual return for that year'),
  gstr9Exemption('2022-04-01', '2023-03-31', 'Section 44, first proviso', 'Notification 32/2023-Central Tax dated 31.07.2023: exempts registered persons whose aggregate turnover in FY 2022-23 is up to two crore rupees from filing the annual return for that year'),
  gstr9Exemption('2023-04-01', '2024-03-31', 'Section 44, first proviso', 'Notification 14/2024-Central Tax dated 10.07.2024: exempts registered persons whose aggregate turnover in FY 2023-24 is up to two crore rupees from filing the annual return for that year'),
  gstr9Exemption('2024-04-01', null, 'Section 44(1), first proviso', 'Notification 15/2025-Central Tax dated 17.09.2025: for FY 2024-25 onwards, exempts registered persons whose aggregate turnover in any financial year is up to two crore rupees from filing the annual return for that year')
];
