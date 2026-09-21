const COVERAGE = 'Registry coverage starts 1-4-2024 (FY 2024-25); the figure was already in force before that date.';
const ACT_1961_TEXT = 'Income-tax Act, 1961 text as published at incometaxindia.gov.in';
const FA_2024 = 'Finance (No. 2) Act, 2024 (15 of 2024), Gazette of India Extraordinary Part II s.1 No. 18, 16-8-2024, s.2(5) and First Schedule Part II';
const FA_2025 = 'Finance Act, 2025 (7 of 2025), Gazette of India Extraordinary Part II s.1 No. 7, 29-3-2025, in force 1-4-2025 by s.1(2)(a)';
const FA_2026 = 'Finance Act, 2026 (4 of 2026), Gazette of India Extraordinary Part II s.1 No. 9, 30-3-2026, First Schedule Part II';
const ITA_2025 = 'Income-tax Act, 2025 (30 of 2025), Gazette of India Extraordinary Part II s.1 No. 35, 21-8-2025, in force 1-4-2026 by s.1(3)';
const ITA_2025_UNCHANGED = 'serial number not amended by Finance Act, 2026 (4 of 2026) s.84; same text in the Act as amended by Finance Act, 2026 published at incometaxindia.gov.in';
const FA_2025_TDS_UNCHANGED = 'Finance Act, 2025 (7 of 2025) ss.56-69 amended other TDS sections but not this provision';

const FY_2024_25 = { effectiveFrom: '2024-04-01', effectiveTo: '2025-03-31' };
const FY_2025_26 = { effectiveFrom: '2025-04-01', effectiveTo: '2026-03-31' };
const FY_2024_26 = { effectiveFrom: '2024-04-01', effectiveTo: '2026-03-31' };
const FROM_2026 = { effectiveFrom: '2026-04-01', effectiveTo: null };
const FY_2026_27 = { effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31' };

export const RULES = [
  {
    id: 'tds.194A.rate',
    value: { basisPoints: 1000 },
    ...FY_2024_25,
    act: 'IT-1961',
    section: '194A(1)',
    source: `${FA_2024} items 1(a)(i) and 2(a)(i): 10 per cent on interest other than "Interest on securities" for a resident non-company payee and a domestic company, rates in force for FY 2024-25`,
    attestations: []
  },
  {
    id: 'tds.194A.rate',
    value: { basisPoints: 1000 },
    ...FY_2025_26,
    act: 'IT-1961',
    section: '194A(1)',
    source: `${FA_2025}, s.2(5) and First Schedule Part II items 1(a)(i) and 2(a)(i): 10 per cent on interest other than "Interest on securities", rates in force for FY 2025-26`,
    attestations: []
  },
  {
    id: 'tds.194A.rate',
    value: { basisPoints: 1000 },
    ...FY_2026_27,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 5(ii) and 5(iii)',
    source: `${FA_2026} items 1(a)(i) and 2(a)(i): 10% on interest other than "Interest on securities", rates in force under s.393(1) Table Sl. No. 5 for FY 2026-27 only`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.bank-coop-post-office.senior-citizen',
    value: { amountPaise: 5000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2024_25,
    act: 'IT-1961',
    section: '194A(3)(i) third proviso',
    source: `${ACT_1961_TEXT}: s.194A(3)(i) third proviso read "fifty thousand rupees" for a senior citizen payee of a banking company, co-operative bank or post office deposit until substituted by ${FA_2025} s.58(a)(iii). ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.bank-coop-post-office.senior-citizen',
    value: { amountPaise: 10000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2025_26,
    act: 'IT-1961',
    section: '194A(3)(i) third proviso',
    source: `${FA_2025} s.58(a)(iii): "one lakh rupees" for a senior citizen payee under s.194A(3)(i)(a) to (c), aggregate credited or paid during the financial year`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.bank-coop-post-office.senior-citizen',
    value: { amountPaise: 10000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 5(ii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 5(ii), payer a banking company, co-operative bank or post office, col. D threshold (a) 1,00,000 for a senior citizen; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.bank-coop-post-office.other-payee',
    value: { amountPaise: 4000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2024_25,
    act: 'IT-1961',
    section: '194A(3)(i)(a)-(c)',
    source: `${ACT_1961_TEXT}: s.194A(3)(i)(a) to (c) read "forty thousand rupees" for a banking company, co-operative bank or post office deposit until substituted by ${FA_2025} s.58(a)(i). ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.bank-coop-post-office.other-payee',
    value: { amountPaise: 5000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2025_26,
    act: 'IT-1961',
    section: '194A(3)(i)(a)-(c)',
    source: `${FA_2025} s.58(a)(i): "fifty thousand rupees" for a banking company, co-operative bank or post office deposit under s.194A(3)(i)(a) to (c), aggregate credited or paid during the financial year`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.bank-coop-post-office.other-payee',
    value: { amountPaise: 5000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 5(ii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 5(ii), payer a banking company, co-operative bank or post office, col. D threshold (b) 50,000 for a person other than a senior citizen; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.other-payer',
    value: { amountPaise: 500000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2024_25,
    act: 'IT-1961',
    section: '194A(3)(i)(d)',
    source: `${ACT_1961_TEXT}: s.194A(3)(i)(d) read "five thousand rupees in any other case" until substituted by ${FA_2025} s.58(a)(ii); no separate senior-citizen figure for this payer. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.other-payer',
    value: { amountPaise: 1000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2025_26,
    act: 'IT-1961',
    section: '194A(3)(i)(d)',
    source: `${FA_2025} s.58(a)(ii): "ten thousand rupees in any other case" under s.194A(3)(i)(d), aggregate credited or paid during the financial year, senior citizens included`,
    attestations: []
  },
  {
    id: 'tds.194A.threshold.other-payer',
    value: { amountPaise: 1000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 5(iii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 5(iii), payer a specified person other than those in Sl. No. 5(ii), col. D threshold 10,000; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194C.threshold.single-sum',
    value: { amountPaise: 3000000 },
    basis: 'single_sum_credited_or_paid',
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194C(5)',
    source: `${ACT_1961_TEXT}: s.194C(5), no deduction where a sum credited or paid does not exceed "thirty thousand rupees"; Finance (No. 2) Act, 2024 s.53 changed only the Explanation; ${FA_2025_TDS_UNCHANGED}. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194C.threshold.single-sum',
    value: { amountPaise: 3000000 },
    basis: 'single_sum_credited_or_paid',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(i)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(i), col. D threshold (a) 30000 for any such sum; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194C.threshold.aggregate',
    value: { amountPaise: 10000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194C(5) proviso',
    source: `${ACT_1961_TEXT}: s.194C(5) proviso, deduction where the aggregate of such sums during the financial year exceeds "one lakh rupees"; ${FA_2025_TDS_UNCHANGED}. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194C.threshold.aggregate',
    value: { amountPaise: 10000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(i)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(i), col. D threshold (b) 100000 in case of aggregate of such sums during the tax year; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194C.rate.individual-huf',
    value: { basisPoints: 100 },
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194C(1)(i)',
    source: `${ACT_1961_TEXT}: s.194C(1)(i), "one per cent" where the contractor is an individual or a Hindu undivided family; ${FA_2025_TDS_UNCHANGED}. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194C.rate.individual-huf',
    value: { basisPoints: 100 },
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(i)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(i), col. D rate (a) 1% if the contractor is an individual or Hindu undivided family; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194C.rate.other-payee',
    value: { basisPoints: 200 },
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194C(1)(ii)',
    source: `${ACT_1961_TEXT}: s.194C(1)(ii), "two per cent" where the contractor is a person other than an individual or a Hindu undivided family; ${FA_2025_TDS_UNCHANGED}. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194C.rate.other-payee',
    value: { basisPoints: 200 },
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(i)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(i), col. D rate (b) 2% if the contractor is a person other than an individual or Hindu undivided family; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194I.threshold',
    value: { amountPaise: 24000000 },
    basis: 'aggregate_per_payee_per_financial_year',
    ...FY_2024_25,
    act: 'IT-1961',
    section: '194-I first proviso',
    source: `${ACT_1961_TEXT}: s.194-I first proviso, as amended by Act 7 of 2019 w.e.f. 1-4-2019, no deduction where rent credited or paid during the financial year does not exceed "two hundred and forty thousand rupees"; replaced by ${FA_2025} s.64. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194I.threshold',
    value: { amountPaise: 5000000 },
    basis: 'per_payee_per_month_or_part_of_month',
    ...FY_2025_26,
    act: 'IT-1961',
    section: '194-I first proviso',
    source: `${FA_2025} s.64: no deduction where rent credited or paid "for a month or part of a month" to the payee does not exceed "fifty thousand rupees"`,
    attestations: []
  },
  {
    id: 'tds.194I.threshold',
    value: { amountPaise: 5000000 },
    basis: 'per_payee_per_month_or_part_of_month',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 2(ii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 2(ii), rent paid by a specified person, col. D threshold for (a) and (b) 50,000 for a month or part of a month; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194I.rate.plant-machinery-equipment',
    value: { basisPoints: 200 },
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194-I(a)',
    source: `${ACT_1961_TEXT}: s.194-I(a), "two per cent for the use of any machinery or plant or equipment"; ${FA_2025} s.64 replaced only the first proviso. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194I.rate.plant-machinery-equipment',
    value: { basisPoints: 200 },
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 2(ii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 2(ii), col. D rate (a) 2% for the use of any machinery or plant or equipment; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194I.rate.land-building-furniture-fittings',
    value: { basisPoints: 1000 },
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194-I(b)',
    source: `${ACT_1961_TEXT}: s.194-I(b), "ten per cent for the use of any land or building (including factory building) or land appurtenant to a building (including factory building) or furniture or fittings"; ${FA_2025} s.64 replaced only the first proviso. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194I.rate.land-building-furniture-fittings',
    value: { basisPoints: 1000 },
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 2(ii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 2(ii), col. D rate (b) 10% for the use of any land, building, land appurtenant to a building, furniture or fittings; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194J.threshold.per-category',
    value: { amountPaise: 3000000 },
    basis: 'aggregate_per_payee_per_category_per_financial_year',
    ...FY_2024_25,
    act: 'IT-1961',
    section: '194J(1) first proviso cl. (B)',
    source: `${ACT_1961_TEXT}: s.194J(1) first proviso cl. (B)(i) to (iv), "thirty thousand rupees" each for fees for professional services, fees for technical services, royalty and sums under s.28(va), aggregate during the financial year; substituted by ${FA_2025} s.65. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194J.threshold.per-category',
    value: { amountPaise: 5000000 },
    basis: 'aggregate_per_payee_per_category_per_financial_year',
    ...FY_2025_26,
    act: 'IT-1961',
    section: '194J(1) first proviso cl. (B)',
    source: `${FA_2025} s.65: "fifty thousand rupees" wherever "thirty thousand rupees" occurs in s.194J(1) first proviso cl. (B), so 50,000 each for professional fees, technical fees, royalty and s.28(va) sums, aggregate during the financial year`,
    attestations: []
  },
  {
    id: 'tds.194J.threshold.per-category',
    value: { amountPaise: 5000000 },
    basis: 'aggregate_per_payee_per_category_per_financial_year',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(iii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(iii), col. D threshold (i) 50,000 for each of (a) professional fees, (b) technical fees, (d) royalty and (e) sums under s.26(2)(h) of col. B; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194J.threshold.director-remuneration',
    value: { amountPaise: 0 },
    basis: 'no_threshold',
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194J(1)(ba)',
    source: `${ACT_1961_TEXT}: s.194J(1) first proviso cl. (B) sets thresholds only for clauses (a), (b), (c) and (d), so remuneration, fees or commission to a director under clause (ba) has none; unchanged by ${FA_2025} s.65. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194J.threshold.director-remuneration',
    value: { amountPaise: 0 },
    basis: 'no_threshold',
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(iii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(iii), col. D threshold (ii) Nil for (c) of col. B, remuneration, fees or commission to a director; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194J.rate.technical-film-royalty-call-centre',
    value: { basisPoints: 200 },
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194J(1)',
    source: `${ACT_1961_TEXT}: s.194J(1), "two per cent" for fees for technical services (not being a professional services) and royalty for sale, distribution or exhibition of cinematographic films, and by the fourth proviso for a payee engaged only in the business of operation of call centre; ${FA_2025} s.65 changed only thresholds. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194J.rate.technical-film-royalty-call-centre',
    value: { basisPoints: 200 },
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(iii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(iii), col. D rate (a) 2% for fees for technical services (not being a professional services), royalty for sale, distribution or exhibition of cinematographic films, or a payee engaged only in call-centre business; ${ITA_2025_UNCHANGED}`,
    attestations: []
  },
  {
    id: 'tds.194J.rate.other',
    value: { basisPoints: 1000 },
    ...FY_2024_26,
    act: 'IT-1961',
    section: '194J(1)',
    source: `${ACT_1961_TEXT}: s.194J(1), "ten per cent of such sum in other cases", covering fees for professional services, other royalty, director remuneration and s.28(va) sums; ${FA_2025} s.65 changed only thresholds. ${COVERAGE}`,
    attestations: []
  },
  {
    id: 'tds.194J.rate.other',
    value: { basisPoints: 1000 },
    ...FROM_2026,
    act: 'IT-2025',
    section: '393(1) Table Sl. No. 6(iii)',
    source: `${ITA_2025}: s.393(1) Table Sl. No. 6(iii), col. D rate (b) 10% of such sum in cases other than (a); ${ITA_2025_UNCHANGED}`,
    attestations: []
  }
];
