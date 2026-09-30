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

// A blank date means today; anything else must be a real day.
export function postingDate(value) {
  if (value == null || String(value).trim() === '') return localToday();
  return isoDate(value);
}
