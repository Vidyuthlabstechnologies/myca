const DOPT_OM_2026 = 'DoPT Office Memorandum F.No.12/2/2023-JCA dated 03.07.2025, "Holidays to be observed in Central Government Offices during the year 2026"';
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

const MOON_SIGHTING = ['Id-ul-Fitr', 'Id-ul-Zuha (Bakrid)', 'Muharram', 'Milad-un-Nabi or Id-e-Milad (Birthday of Prophet Mohammad)'];

function holidays(rows) {
  return rows.map(([date, name]) => ({ date, name }));
}

function record(id, rows, section, source) {
  return {
    id,
    value: { holidays: holidays(rows), moonSightingMayChange: MOON_SIGHTING },
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    act: 'DoPT-OM',
    section,
    source: `${DOPT_OM_2026}, ${source}. ${DISPLAY_ONLY}`,
    attestations: []
  };
}

export const RULES = [
  record(
    'holiday.central-government.delhi', DELHI_2026, 'Annexure-I',
    'Annexure-I: the 17 holidays of Central Government administrative offices at Delhi/New Delhi; para 5.1: Idu\'l Fitr, Idu\'l Zuha, Muharram and Id-e-Milad may move on moon sighting'
  ),
  record(
    'holiday.central-government.compulsory', DELHI_2026.filter(([, , compulsory]) => compulsory), 'para 2',
    'para 2: the 14 holidays every Central Government administrative office outside Delhi observes, dated as in Annexure-I; each State\'s coordination committee adds three more from para 3.1 and may move the moon-sighting holidays (para 5.2)'
  )
];
