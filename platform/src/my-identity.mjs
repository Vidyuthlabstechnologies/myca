const PLACE_CODES = new Set([
  ...range(1, 16), ...range(21, 59), ...range(60, 68), 71, 72, ...range(74, 79), ...range(82, 93), 98, 99,
].map((code) => String(code).padStart(2, '0')));
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const SPACED = /(?<![\w-])(\d{6})[- ](\d{2})[- ](\d{4})(?![\w-])/g;
const BARE = /(?<![\w.,$-])(\d{12})(?![\w,-]|\.\d)/g;
const NRIC_KEYS = /^(nric|mykad|mykadNumber|icNumber|newIc|identityCard)$/i;

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function nricDigits(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

export function nricShapeError(value) {
  const digits = nricDigits(value);
  if (!digits) return 'NRIC_REQUIRED';
  if (!/^\d{12}$/.test(digits)) return 'NRIC_NOT_TWELVE_DIGITS';
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return 'NRIC_BAD_BIRTH_DATE';
  if (!PLACE_CODES.has(digits.slice(6, 8))) return 'NRIC_BAD_PLACE_CODE';
  return null;
}

export function isNric(value) {
  return nricShapeError(value) === null;
}

export function maskNric(value) {
  const digits = nricDigits(value);
  return /^\d{12}$/.test(digits) ? `******-**-${digits.slice(8)}` : '';
}

export function redactNrics(text) {
  if (text == null) return text;
  return String(text)
    .replace(SPACED, (match, a, b, c) => (isNric(`${a}${b}${c}`) ? maskNric(`${a}${b}${c}`) : match))
    .replace(BARE, (match) => (isNric(match) ? maskNric(match) : match));
}

function maskedField(key, item, parent) {
  if (typeof item !== 'string' || !/^\d{6}[- ]?\d{2}[- ]?\d{4}$/.test(item.trim())) return null;
  if (NRIC_KEYS.test(key)) return maskNric(item);
  if (key === 'idValue' && String(parent.idType || '').toUpperCase() === 'NRIC') return maskNric(item);
  return null;
}

export function redactNricsDeep(value, depth = 0) {
  if (depth > 20) return value;
  if (typeof value === 'string') return redactNrics(value);
  if (Array.isArray(value)) return value.map((item) => redactNricsDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = maskedField(key, item, value) ?? redactNricsDeep(item, depth + 1);
    return out;
  }
  return value;
}
