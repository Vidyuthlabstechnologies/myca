const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FY_LABEL = /^(\d{4})-(\d{2})$/;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad(number, width) {
  return String(number).padStart(width, '0');
}

export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function nextDay(isoDate) {
  if (!isIsoDate(isoDate)) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  if (day < daysInMonth(year, month)) return `${pad(year, 4)}-${pad(month, 2)}-${pad(day + 1, 2)}`;
  if (month < 12) return `${pad(year, 4)}-${pad(month + 1, 2)}-01`;
  return `${pad(year + 1, 4)}-01-01`;
}

function fyLabel(startYear) {
  return `${pad(startYear, 4)}-${pad((startYear + 1) % 100, 2)}`;
}

export function fyOf(isoDate) {
  if (!isIsoDate(isoDate)) return null;
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return fyLabel(month >= 4 ? year : year - 1);
}

function fyStartYear(fy) {
  if (typeof fy !== 'string') return null;
  const match = FY_LABEL.exec(fy);
  if (!match) return null;
  const startYear = Number(match[1]);
  if (startYear < 1 || fyLabel(startYear) !== fy) return null;
  return startYear;
}

export function fyStart(fy) {
  const startYear = fyStartYear(fy);
  return startYear === null ? null : `${pad(startYear, 4)}-04-01`;
}

export function fyEnd(fy) {
  const startYear = fyStartYear(fy);
  return startYear === null ? null : `${pad(startYear + 1, 4)}-03-31`;
}
