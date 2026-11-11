const ISO = /^\d{4}-\d{2}-\d{2}$/;

function two(n) {
  return String(n).padStart(2, '0');
}

function iso(year, month, day) {
  return `${year}-${two(month)}-${two(day)}`;
}

function realDate(text) {
  if (!ISO.test(String(text || ''))) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === text;
}

function dayBefore(text) {
  const at = new Date(`${text}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

function plusMonths(text, months) {
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7)) - 1 + months;
  return iso(year + Math.floor(month / 12), ((month % 12) + 12) % 12 + 1, Number(text.slice(8, 10)));
}

export function taxYearBounds(pack, label) {
  const text = String(label || '');
  const calendar = pack.yearStartMonth === 1 && pack.yearStartDay === 1;
  const hit = calendar ? /^(\d{4})$/.exec(text) : /^(\d{4})-(\d{2})$/.exec(text);
  if (!hit) return null;
  const start = Number(hit[1]);
  if (!calendar && Number(hit[2]) !== (start + 1) % 100) return null;
  const from = iso(start, pack.yearStartMonth, pack.yearStartDay);
  return { label: text, from, to: dayBefore(plusMonths(from, 12)) };
}

export function periodsBetween(from, to, months) {
  if (!realDate(from) || !realDate(to) || to < from) return [];
  if (!Number.isInteger(months) || months < 1 || months > 12) return [];
  if (Number(from.slice(8, 10)) > 28) return [];
  const out = [];
  for (let index = 0; ; index += 1) {
    const start = plusMonths(from, index * months);
    if (start > to) break;
    const end = dayBefore(plusMonths(from, (index + 1) * months));
    out.push({ index: index + 1, from: start, to: end < to ? end : to });
  }
  return out;
}

export function periodOf(periods, date) {
  return realDate(date) ? periods.find((period) => period.from <= date && date <= period.to) || null : null;
}
