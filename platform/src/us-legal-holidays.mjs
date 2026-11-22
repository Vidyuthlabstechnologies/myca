const pad = (value) => String(value).padStart(2, '0');
const iso = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const utc = (year, month, day) => new Date(Date.UTC(year, month - 1, day));
const plusDays = (date, days) => new Date(date.getTime() + days * 86400000);

function nthWeekday(year, month, weekday, nth) {
  const first = utc(year, month, 1);
  return utc(year, month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (nth - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const last = utc(year, month + 1, 0);
  return utc(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}

function observed(date, rule) {
  if (date.getUTCDay() === 6) return plusDays(date, rule.saturdayObservedDays);
  if (date.getUTCDay() === 0) return plusDays(date, rule.sundayObservedDays);
  return date;
}

export function legalHolidays(year, rule) {
  const days = new Map();
  const add = (date, name) => days.set(iso(date), name);
  for (const [monthDay, name] of rule.fixed) {
    const [month, day] = monthDay.split('-').map(Number);
    for (const actualYear of [year, year + 1]) {
      const date = observed(utc(actualYear, month, day), rule);
      if (date.getUTCFullYear() === year) add(date, name);
    }
  }
  for (const [month, weekday, nth, name] of rule.nthWeekday) add(nthWeekday(year, month, weekday, nth), name);
  for (const [month, weekday, name] of rule.lastWeekday) add(lastWeekday(year, month, weekday), name);
  const inauguration = rule.inauguration;
  if (inauguration && year >= inauguration.firstYear && (year - inauguration.firstYear) % inauguration.everyYears === 0) {
    const [month, day] = inauguration.monthDay.split('-').map(Number);
    const date = utc(year, month, day);
    add(date.getUTCDay() === 0 ? plusDays(date, 1) : date, inauguration.name);
  }
  return days;
}

export function nextFilingDay(dateText, rule) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ''));
  if (!match || !rule) return { date: dateText, moved: false, skipped: [] };
  let date = utc(Number(match[1]), Number(match[2]), Number(match[3]));
  const skipped = [];
  const cache = new Map();
  const holidaysOf = (year) => {
    if (!cache.has(year)) cache.set(year, legalHolidays(year, rule));
    return cache.get(year);
  };
  for (;;) {
    const weekday = date.getUTCDay();
    const holiday = holidaysOf(date.getUTCFullYear()).get(iso(date));
    if (weekday !== 0 && weekday !== 6 && !holiday) break;
    skipped.push({ date: iso(date), reason: weekday === 0 ? 'Sunday' : weekday === 6 ? 'Saturday' : holiday });
    date = plusDays(date, 1);
  }
  return { date: iso(date), moved: skipped.length > 0, skipped };
}
