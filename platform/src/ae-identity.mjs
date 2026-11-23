const EID_SPACED = /(?<![\w-])784[- ](\d{4})[- ](\d{7})[- ](\d)(?![\w-])/g;
const EID_BARE = /(?<![\w.,$-])784(\d{12})(?![\w,-]|\.\d)/g;
const IBAN = /(?<![A-Za-z0-9])AE\s?(\d{2})\s?((?:\d\s?){19})(?![A-Za-z0-9])/gi;
const EID_KEYS = /^(emiratesId|emiratesIdNumber|eid|nationalId)$/i;
const IBAN_KEYS = /^(iban|account|accountNumber|bankAccount)$/i;

function luhnOk(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function emiratesIdDigits(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

export function isEmiratesId(value) {
  const digits = emiratesIdDigits(value);
  return /^784\d{12}$/.test(digits) && luhnOk(digits);
}

export function maskEmiratesId(value) {
  const digits = emiratesIdDigits(value);
  return /^784\d{12}$/.test(digits) ? `784-XXXX-XXX${digits.slice(10, 14)}-${digits[14]}` : '';
}

export function isUaeIban(value) {
  const compact = String(value ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^AE\d{21}$/.test(compact)) return false;
  const moved = `${compact.slice(4)}${compact.slice(0, 4)}`.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of moved) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

export function maskUaeIban(value) {
  const compact = String(value ?? '').replace(/\s/g, '').toUpperCase();
  return /^AE\d{21}$/.test(compact) ? `AE••••${compact.slice(-4)}` : '';
}

export function redactEmiratesIds(text) {
  if (text == null) return text;
  return String(text)
    .replace(EID_SPACED, (match, a, b, c) => (isEmiratesId(`784${a}${b}${c}`) ? maskEmiratesId(`784${a}${b}${c}`) : match))
    .replace(EID_BARE, (match) => (isEmiratesId(match) ? maskEmiratesId(match) : match));
}

export function redactUaeIbans(text) {
  if (text == null) return text;
  return String(text).replace(IBAN, (match) => (isUaeIban(match) ? maskUaeIban(match) : match));
}

function deep(value, textFn, keyFn, depth = 0) {
  if (depth > 20) return value;
  if (typeof value === 'string') return textFn(value);
  if (Array.isArray(value)) return value.map((item) => deep(item, textFn, keyFn, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = keyFn(key, item) ?? deep(item, textFn, keyFn, depth + 1);
    return out;
  }
  return value;
}

function eidField(key, item) {
  return typeof item === 'string' && EID_KEYS.test(key) && /^784[- ]?\d{4}[- ]?\d{7}[- ]?\d$/.test(item.trim()) ? maskEmiratesId(item) : null;
}

function ibanField(key, item) {
  if (typeof item !== 'string') return null;
  if (IBAN_KEYS.test(key) && /^AE\d{21}$/i.test(item.replace(/\s/g, ''))) return maskUaeIban(item);
  return eidField(key, item);
}

export function redactEmiratesIdsDeep(value) {
  return deep(value, redactEmiratesIds, eidField);
}

export function redactUaeForModel(text) {
  return redactUaeIbans(redactEmiratesIds(text));
}

export function redactUaeForModelDeep(value) {
  return deep(value, redactUaeForModel, ibanField);
}
