const RUPEE = 100;
const LAKH = 100000 * RUPEE;

const RATE_SET_BEFORE_22_SEP_2025 =[0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28];
const RATE_SET_22_SEP_2025_TO_31_JAN_2026 = [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 28, 40];
const RATE_SET_FROM_1_FEB_2026 = [0, 0.1, 0.25, 1.5, 3, 5, 7.5, 12, 18, 40];

const MERCHANT_EXPORTER = '40/2017-Central Tax (Rate) dated 23.10.2017 (0.05 per cent central tax, 0.1 per cent combined, supplies to merchant exporters)';
const SERVICES_BEFORE = '11/2017-Central Tax (Rate) as amended up to 16.01.2025 (central tax 0.75, 2.5, 3.75, 6, 9, 14; 0.75 and 3.75 for residential construction inserted by 3/2019-Central Tax (Rate) w.e.f. 01.04.2019)';
const SERVICES_AFTER = '11/2017-Central Tax (Rate) as amended by 15/2025-Central Tax (Rate) w.e.f. 22.09.2025 (central tax 0.75, 2.5, 3.75, 6, 9, 20; 6 kept for item (ie) ongoing housing projects)';
const GOODS_AFTER = '9/2025-Central Tax (Rate) dated 17.09.2025 w.e.f. 22.09.2025 superseding 1/2017-Central Tax (Rate) (central tax 2.5, 9, 20, 1.5, 0.125, 0.75 and 14 in Schedule VII for pan masala and tobacco); 14/2025-Central Tax (Rate) w.e.f. 22.09.2025 (central tax 6 for bricks and roofing tiles)';

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
  }
];
