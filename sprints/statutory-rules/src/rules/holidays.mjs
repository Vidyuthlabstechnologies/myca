const DOPT_OM_2026 = 'DoPT Office Memorandum F.No.12/2/2023-JCA dated 03.07.2025, "Holidays to be observed in Central Government Offices during the year 2026"';
const DOPT_OM_2027 = 'DoPT Office Memorandum F.No.12/2/2023-JCA dated 16.07.2026, "Holidays to be observed in Central Government Offices during the year 2027" (as forwarded by Department of Posts letter No. Y-21/2/2026-PE-II-DOP dated 08.09.2026)';
const DISPLAY_ONLY = 'Holidays are shown on the deadline calendar only; they never move a statutory due date (see due-date.rollover)';

const DELHI_2026 = [
  ['2026-01-26', 'Republic Day', true],
  ['2026-03-04', 'Holi', false],
  ['2026-03-21', 'Id-ul-Fitr', true],
  ['2026-03-26', 'Ram Navami', false],
  ['2026-03-31', 'Mahavir Jayanti', true],
  ['2026-04-03', 'Good Friday', true],
  ['2026-05-01', 'Budha Purnima', true],
  ['2026-05-27', 'Id-ul-Zuha (Bakrid)', true],
  ['2026-06-26', 'Muharram', true],
  ['2026-08-15', 'Independence Day', true],
  ['2026-08-26', 'Milad-un-Nabi or Id-e-Milad (Birthday of Prophet Mohammad)', true],
  ['2026-09-04', 'Janmashtami (Vaishnva)', false],
  ['2026-10-02', 'Mahatma Gandhi\'s Birthday', true],
  ['2026-10-20', 'Dussehra', true],
  ['2026-11-08', 'Diwali (Deepavali)', true],
  ['2026-11-24', 'Guru Nanak\'s Birthday', true],
  ['2026-12-25', 'Christmas Day', true]
];

const DELHI_2027 = [
  ['2027-01-26', 'Republic Day', true],
  ['2027-03-10', 'Id-ul-Fitr', true],
  ['2027-03-23', 'Holi', false],
  ['2027-03-26', 'Good Friday', true],
  ['2027-04-15', 'Ram Navami', false],
  ['2027-04-19', 'Mahavir Jayanti', true],
  ['2027-05-17', 'Id-ul-Zuha (Bakrid)', true],
  ['2027-05-20', 'Budha Purnima', true],
  ['2027-06-16', 'Muharram', true],
  ['2027-08-15', 'Independence Day', true],
  ['2027-08-15', 'Milad-un-Nabi or Id-e-Milad (Prophet Mohammad\'s Birthday)', true],
  ['2027-08-25', 'Janmashtami (Vaishnav)', false],
  ['2027-10-02', 'Mahatma Gandhi\'s Birthday', true],
  ['2027-10-09', 'Dussehra (Vijaya Dashmi)', true],
  ['2027-10-29', 'Diwali (Deepavali)', true],
  ['2027-11-14', 'Guru Nanak\'s Birthday', true],
  ['2027-12-25', 'Christmas Day', true]
];

const MOON_SIGHTING = ['Id-ul-Fitr', 'Id-ul-Zuha (Bakrid)', 'Muharram', 'Milad-un-Nabi or Id-e-Milad (Birthday of Prophet Mohammad)'];
const MOON_SIGHTING_2027 = ['Id-ul-Fitr', 'Id-ul-Zuha (Bakrid)', 'Muharram', 'Milad-un-Nabi or Id-e-Milad (Prophet Mohammad\'s Birthday)'];

const YEAR_2026 = { from: '2026-01-01', to: '2026-12-31', memorandum: DOPT_OM_2026, moonSighting: MOON_SIGHTING };
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31', memorandum: DOPT_OM_2027, moonSighting: MOON_SIGHTING_2027 };

const DELHI_SECTION = 'Annexure-I: the 17 holidays of Central Government administrative offices at Delhi/New Delhi; para 5.1: Idu\'l Fitr, Idu\'l Zuha, Muharram and Id-e-Milad may move on moon sighting';
const COMPULSORY_SECTION = 'para 2: the 14 holidays every Central Government administrative office outside Delhi observes, dated as in Annexure-I; each State\'s coordination committee adds three more from para 3.1 and may move the moon-sighting holidays (para 5.2)';

function holidays(rows) {
  return rows.map(([date, name]) => ({ date, name }));
}

function record(id, rows, section, source, year) {
  return {
    id,
    value: { holidays: holidays(rows), moonSightingMayChange: year.moonSighting },
    effectiveFrom: year.from,
    effectiveTo: year.to,
    act: 'DoPT-OM',
    section,
    source: `${year.memorandum}, ${source}. ${DISPLAY_ONLY}`,
    attestations: []
  };
}

function yearRecords(rows, year) {
  return [
    record('holiday.central-government.delhi', rows, 'Annexure-I', DELHI_SECTION, year),
    record('holiday.central-government.compulsory', rows.filter(([, , compulsory]) => compulsory), 'para 2', COMPULSORY_SECTION, year)
  ];
}

export const RULES = [
  ...yearRecords(DELHI_2026, YEAR_2026),
  ...yearRecords(DELHI_2027, YEAR_2027)
];
