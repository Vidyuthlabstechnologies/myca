export const RULES = [
  {
    id: 'us.federal.legal-holidays',
    value: {
      fixed: [['01-01', 'New Year\'s Day'], ['04-16', 'District of Columbia Emancipation Day'], ['06-19', 'Juneteenth National Independence Day'], ['07-04', 'Independence Day'], ['11-11', 'Veterans Day'], ['12-25', 'Christmas Day']],
      nthWeekday: [[1, 1, 3, 'Dr. Martin Luther King Jr.\'s Birthday'], [2, 1, 3, 'Washington\'s Birthday'], [9, 1, 1, 'Labor Day'], [10, 1, 2, 'Columbus Day (Indigenous Peoples\' Day in the District of Columbia)'], [11, 4, 4, 'Thanksgiving Day']],
      lastWeekday: [[5, 1, 'Memorial Day']],
      inauguration: { monthDay: '01-20', firstYear: 1965, everyYears: 4, name: 'Inauguration Day' },
      saturdayObservedDays: -1,
      sundayObservedDays: 1,
    },
    basis: 'a_deadline_falling_on_a_saturday_sunday_or_legal_holiday_in_the_district_of_columbia_moves_to_the_next_day_that_is_none_of_these',
    effectiveFrom: '2021-06-17',
    effectiveTo: null,
    act: 'IRC',
    section: '7503',
    source: 'IRC section 7503: when the last day for performing an act falls on a Saturday, Sunday or legal holiday the act is timely on the next succeeding day that is not one of these; a legal holiday is a legal holiday in the District of Columbia (and, for an act at an office outside the District, a statewide legal holiday of that state, which is not encoded). Read from law.cornell.edu/uscode/text/26/7503 on 2026-11-22. District of Columbia holidays from D.C. Code section 28-2701, code.dccouncil.gov/us/dc/council/code/sections/28-2701, read on 2026-11-22: 1 January, third Monday in January, third Monday in February, 16 April (Emancipation Day), last Monday in May, 19 June, 4 July, first Monday in September, second Monday in October, 11 November, fourth Thursday in November, 25 December and Inauguration Day every fourth year; a holiday on a Saturday is observed the preceding day (not Inauguration Day) and one on a Sunday the next day. The same legal public holidays are in 5 U.S.C. 6103(a), law.cornell.edu/uscode/text/5/6103; Juneteenth was added by Public Law 117-17 from 17 June 2021. Days the President appoints as holidays are not encoded',
    attestations: []
  },
];
