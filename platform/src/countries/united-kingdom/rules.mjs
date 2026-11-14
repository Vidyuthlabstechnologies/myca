import { rules } from '../../sprint-load.mjs';

const TAX_YEAR = /^(\d{4})-(\d{2})$/;

export function parseTaxYear(label) {
  const hit = TAX_YEAR.exec(String(label || '').trim());
  if (!hit) return null;
  const start = Number(hit[1]);
  if (Number(hit[2]) !== (start + 1) % 100) return null;
  return { label: `${start}-${hit[2]}`, start, from: `${start}-04-06`, to: `${start + 1}-04-05`, hmrc: `${start}-${hit[2]}` };
}

export function taxYearOn(date) {
  const text = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const start = text.slice(5) >= '04-06' ? year : year - 1;
  return parseTaxYear(`${start}-${String((start + 1) % 100).padStart(2, '0')}`);
}

export function gbRule(id, date) {
  const found = rules.rule(id, date);
  return found.ok ? found.record : null;
}

export function ruleSet(ids, date) {
  const used = [];
  const values = {};
  const missing = [];
  for (const [key, id] of Object.entries(ids)) {
    const record = gbRule(id, date);
    if (!record) { missing.push(id); continue; }
    values[key] = record.value;
    used.push({ id: record.id, effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo, unreviewed: !(record.attestations || []).length });
  }
  return { values, used, missing };
}

export const PENCE = 100;

export function toPence(pounds) {
  const number = Number(pounds);
  return Number.isFinite(number) ? Math.round(number * PENCE) : 0;
}

export function wholePoundsPence(pounds) {
  const number = Number(pounds);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) * PENCE : 0;
}

export function positivePence(pounds) {
  return Math.max(0, toPence(pounds));
}

export function toPounds(pence) {
  return Math.round(pence) / PENCE;
}

export function share(pence, basisPoints, rounding = 'down') {
  const exact = (BigInt(Math.round(pence)) * BigInt(basisPoints));
  const whole = exact / 10000n;
  const rest = exact % 10000n;
  if (rest === 0n || rounding === 'down') return Number(whole);
  if (rounding === 'up') return Number(whole + 1n);
  return Number(rest * 2n >= 10000n ? whole + 1n : whole);
}

export function poundsFloor(pence) {
  return Math.floor(pence / PENCE) * PENCE;
}

export function gbMoney(pounds) {
  const number = Number(pounds || 0);
  const sign = number < 0 ? '-' : '';
  return `${sign}£${Math.abs(number).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function addMonthsDays(date, months, days) {
  const at = new Date(`${date}T00:00:00Z`);
  const day = at.getUTCDate();
  at.setUTCDate(1);
  at.setUTCMonth(at.getUTCMonth() + months);
  const last = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
  at.setUTCDate(Math.min(day, last));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function isIsoDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text || ''))) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === text;
}

export function monthEndPlus(date, months, days) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) + months;
  const end = new Date(Date.UTC(year, month, 0));
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString().slice(0, 10);
}
