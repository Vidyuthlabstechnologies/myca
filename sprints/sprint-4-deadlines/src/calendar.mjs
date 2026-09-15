function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDays(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function fromDays(days) {
  const d = new Date(days * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export const URGENT_DAYS = 2;
export const DUE_SOON_DAYS = 7;

export function addDays(iso, n) {
  return fromDays(toDays(iso) + n);
}

export function isWeekend(iso) {
  const dow = new Date(toDays(iso) * 86400000).getUTCDay();
  return dow === 0 || dow === 6;
}

export function nextWorkingDay(iso, holidays = []) {
  const set = new Set(holidays.map((h) => String(h).trim()));
  let d = iso;
  while (isWeekend(d) || set.has(d)) d = fromDays(toDays(d) + 1);
  return d;
}

export function daysUntil(due, asOf) {
  return toDays(due) - toDays(asOf);
}

export function escalationLevel(daysUntilValue) {
  if (daysUntilValue < 0) return 'overdue';
  if (daysUntilValue <= URGENT_DAYS) return 'urgent';
  if (daysUntilValue <= DUE_SOON_DAYS) return 'due_soon';
  return 'on_track';
}

export function fyOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m >= 4 ? `${y}-${pad2((y + 1) % 100)}` : `${y - 1}-${pad2(y % 100)}`;
}

export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const end = fromDays(Date.UTC(y, m, 1) / 86400000 - 1);
  return { start, end };
}