export function daysIn(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function lastDay(period) {
  return `${period}-${String(daysIn(period)).padStart(2, '0')}`;
}

export function daysWorked(employee, period) {
  const start = `${period}-01`;
  const end = lastDay(period);
  const from = employee.joinedOn > start ? employee.joinedOn : start;
  const to = employee.leftOn && employee.leftOn < end ? employee.leftOn : end;
  if (to < from) return 0;
  return Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1;
}
