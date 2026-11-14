// One strict date reader for everything that posts or locks by date.
// Accepts YYYY-MM-DD, YYYY-M-D, YYYY/MM/DD, DD-MM-YYYY and DD/MM/YYYY; returns
// YYYY-MM-DD, or null for anything that is not a real calendar day.
export function isoDate(value) {
  const raw = String(value == null ? '' : value).trim();
  let y;
  let m;
  let d;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (match) [, y, m, d] = match;
  else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw);
    if (!match) return null;
    [, d, m, y] = match;
  }
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The local calendar day. toISOString() gives the UTC day, which in India is
// the previous day until 05:30.
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const MONTH_NUMBERS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function reportDate(value) {
  const raw = String(value == null ? '' : value).trim();
  const timed = /^(\S+?)(?:T|\s+)\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[AaPp][Mm])?\s*(?:Z|UTC|IST|GMT|[+-]\d{2}:?\d{2})?$/.exec(raw);
  const day = timed ? timed[1] : raw;
  const named = /^(\d{1,2})[-/. ]([A-Za-z]{3,4})[-/. ](\d{4})$/.exec(day);
  if (named) return Object.hasOwn(MONTH_NUMBERS, named[2].toLowerCase()) ? isoDate(`${named[1]}-${MONTH_NUMBERS[named[2].toLowerCase()]}-${named[3]}`) : null;
  return isoDate(day);
}

// A blank date means today; anything else must be a real day.
export function postingDate(value) {
  if (value == null || String(value).trim() === '') return localToday();
  return isoDate(value);
}
