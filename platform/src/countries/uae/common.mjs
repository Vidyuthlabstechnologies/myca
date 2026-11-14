import { rules } from '../../sprint-load.mjs';

export const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const EMIRATES = Object.freeze([
  Object.freeze({ code: 'AUH', box: '1a', en: 'Abu Dhabi', ar: 'أبوظبي', subdivision: 'AZ' }),
  Object.freeze({ code: 'DXB', box: '1b', en: 'Dubai', ar: 'دبي', subdivision: 'DU' }),
  Object.freeze({ code: 'SHJ', box: '1c', en: 'Sharjah', ar: 'الشارقة', subdivision: 'SH' }),
  Object.freeze({ code: 'AJM', box: '1d', en: 'Ajman', ar: 'عجمان', subdivision: 'AJ' }),
  Object.freeze({ code: 'UAQ', box: '1e', en: 'Umm Al Quwain', ar: 'أم القيوين', subdivision: 'UQ' }),
  Object.freeze({ code: 'RAK', box: '1f', en: 'Ras Al Khaimah', ar: 'رأس الخيمة', subdivision: 'RK' }),
  Object.freeze({ code: 'FUJ', box: '1g', en: 'Fujairah', ar: 'الفجيرة', subdivision: 'FU' }),
]);

const EMIRATE_ALIASES = new Map(EMIRATES.flatMap((emirate) => [
  [emirate.code, emirate],
  [emirate.subdivision, emirate],
  [emirate.en.toUpperCase().replace(/[^A-Z]/g, ''), emirate],
]));

export function emirateOf(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return EMIRATE_ALIASES.get(key) || null;
}

export function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function toFils(dirhams) {
  const number = Number(dirhams);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100 + (number >= 0 ? 1e-7 : -1e-7));
}

export function toDirhams(fils) {
  return Math.round(fils) / 100;
}

export function isIsoDate(text) {
  if (!ISO_DATE.test(String(text || ''))) return false;
  const [year, month, day] = text.split('-').map(Number);
  return day <= lastDayOf(year, month);
}

export function lastDayOf(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function addMonthsClamped(date, months) {
  const [year, month, day] = date.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const endOfMonth = day === lastDayOf(year, month);
  return iso(nextYear, nextMonth, endOfMonth ? lastDayOf(nextYear, nextMonth) : Math.min(day, lastDayOf(nextYear, nextMonth)));
}

export function monthsBetween(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function ruleOn(id, date) {
  const found = rules.rule(id, date);
  return found.ok ? found.record : null;
}

export function ruleNote(record) {
  return { ruleId: record.id, effectiveFrom: record.effectiveFrom, unreviewed: !(record.attestations || []).length };
}

export function roundHalfUp(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function percentOf(fils, basisPoints) {
  const sign = fils < 0 ? -1n : 1n;
  const product = BigInt(Math.abs(Math.round(fils))) * BigInt(Math.round(basisPoints));
  return Number(sign * ((product + 5000n) / 10000n));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
