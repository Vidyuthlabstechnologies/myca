import { TOKENS, COUNTRIES } from '../generated/js/tokens.mjs';

export { TOKENS, COUNTRIES };

export const RTL_LANGUAGES = Object.freeze(['ar', 'fa', 'he', 'ur']);
export const DEFAULT_COUNTRY = 'IN';

export function country(code) {
  return COUNTRIES[String(code || '').trim().toUpperCase()] ?? COUNTRIES[DEFAULT_COUNTRY];
}

export function look(code) {
  const pick = TOKENS.country[country(code).code.toLowerCase()];
  return { accent: pick.accent, accentSoft: pick.accentSoft, accentDark: pick.accentDark, accentSoftDark: pick.accentSoftDark, highlight: pick.highlight };
}

export function localeFor(code, language) {
  const facts = country(code);
  const lang = String(language || '').split(/[-_]/)[0].toLowerCase();
  if (!lang || !facts.languages.includes(lang)) return facts.locale;
  return `${lang}-${facts.code}`;
}

export function direction(language) {
  return RTL_LANGUAGES.includes(String(language || '').split(/[-_]/)[0].toLowerCase()) ? 'rtl' : 'ltr';
}

const formatters = new Map();
function cached(key, make) {
  if (!formatters.has(key)) formatters.set(key, make());
  return formatters.get(key);
}

export function formatMoney(amount, code, { language, minor = false, sign = 'auto', compact = false } = {}) {
  const facts = country(code);
  const value = minor ? Number(amount) / 100 : Number(amount);
  const locale = localeFor(facts.code, language);
  const format = cached(`m|${locale}|${facts.currency}|${sign}|${compact}`, () => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: facts.currency,
    currencyDisplay: 'narrowSymbol',
    signDisplay: sign,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }));
  return format.format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value, code, { language, digits = 0 } = {}) {
  const locale = localeFor(code, language);
  return cached(`n|${locale}|${digits}`, () => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })).format(Number(value) || 0);
}

function parseIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCDate() === Number(match[3]) ? date : null;
}

const DATE_STYLES = Object.freeze({
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
});

export function formatDate(iso, code, { language, style = 'medium' } = {}) {
  const date = parseIso(iso);
  if (!date) return String(iso ?? '');
  const locale = localeFor(code, language);
  const options = DATE_STYLES[style] ?? DATE_STYLES.medium;
  return cached(`d|${locale}|${style}`, () => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })).format(date);
}

export function weekStart(code) {
  const locale = new Intl.Locale(country(code).locale);
  const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
  return info?.firstDay ?? 1;
}

export function taxYearLabel(code, startYear) {
  const facts = country(code);
  const label = facts.yearLabel.charAt(0).toUpperCase() + facts.yearLabel.slice(1);
  const spans = facts.yearStartMonth !== 1 || facts.yearStartDay !== 1;
  return spans ? `${label} ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` : `${label} ${startYear}`;
}

export function applyCountry(element, code, { language, theme } = {}) {
  const facts = country(code);
  const locale = localeFor(facts.code, language);
  element.setAttribute('data-country', facts.code.toLowerCase());
  element.setAttribute('lang', locale);
  element.setAttribute('dir', direction(locale));
  if (theme === 'light' || theme === 'dark') element.setAttribute('data-theme', theme);
  else element.removeAttribute('data-theme');
  return { code: facts.code, locale, dir: direction(locale) };
}
