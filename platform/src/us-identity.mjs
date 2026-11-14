import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from './credential-vault.mjs';
import { redactNrics, redactNricsDeep } from './my-identity.mjs';

const SEALED_PREFIX = 'tin1';
const VAULT_PREFIX = 'tinv';
const MIN_KEY_LENGTH = 32;
const KNOWN_INVALID = new Set(['078051120', '219099999', '123456789', '111111111', '222222222', '333333333', '444444444', '555555555', '777777777', '888888888']);
const ITIN_GROUPS = [[50, 65], [70, 88], [90, 92], [94, 99]];

function fail(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

export function tinDigits(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

export function tinKind(value) {
  const digits = tinDigits(value);
  if (!/^\d{9}$/.test(digits)) return null;
  const area = Number(digits.slice(0, 3));
  const group = Number(digits.slice(3, 5));
  const serial = Number(digits.slice(5));
  if (digits[0] === '9') return ITIN_GROUPS.some(([low, high]) => group >= low && group <= high) ? 'itin' : null;
  if (area === 0 || area === 666 || group === 0 || serial === 0 || KNOWN_INVALID.has(digits)) return null;
  return 'ssn';
}

export function tinShapeError(value) {
  const digits = tinDigits(value);
  if (!digits) return 'TIN_REQUIRED';
  if (!/^\d{9}$/.test(digits)) return 'TIN_NOT_NINE_DIGITS';
  return tinKind(digits) ? null : 'TIN_NOT_ISSUABLE';
}

export function isValidSsn(value) {
  return tinKind(value) === 'ssn';
}

export function isValidItin(value) {
  return tinKind(value) === 'itin';
}

export function lastFour(value) {
  const digits = tinDigits(value);
  return /^\d{9}$/.test(digits) ? digits.slice(5) : '';
}

export function maskTin(valueOrLast4) {
  const text = String(valueOrLast4 ?? '');
  const last4 = /^\d{4}$/.test(text) ? text : lastFour(text);
  return last4 ? `***-**-${last4}` : '';
}

export function piiKeyFromEnv(env = process.env) {
  const value = String(env.MYCA_PII_KEY || '').trim();
  if (value && value !== 'unset') {
    if (value.length < MIN_KEY_LENGTH) throw fail('PII_KEY_TOO_SHORT');
    return value;
  }
  if (env.MYCA_REQUIRE_PII_KEY === '1') throw fail('PII_KEY_MISSING');
  return '';
}

function tinKey(secret, scope) {
  return Buffer.from(hkdfSync('sha256', secret, String(scope || ''), 'myca-us-tin', 32));
}

export function isSealedTin(value) {
  return typeof value === 'string' && (value.startsWith(`${SEALED_PREFIX}.`) || value.startsWith(`${VAULT_PREFIX}.`));
}

export function sealTin(value, { scope = '', secret = piiKeyFromEnv() } = {}) {
  const error = tinShapeError(value);
  if (error) throw fail(error);
  const digits = tinDigits(value);
  if (!secret) {
    const record = encryptSecret(digits);
    return { sealed: `${VAULT_PREFIX}.${Buffer.from(JSON.stringify(record)).toString('base64url')}`, last4: digits.slice(5), kind: tinKind(digits) };
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tinKey(secret, scope), iv);
  cipher.setAAD(Buffer.from(String(scope || '')));
  const body = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
  return {
    sealed: `${SEALED_PREFIX}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`,
    last4: digits.slice(5),
    kind: tinKind(digits),
  };
}

export function openTin(sealed, { scope = '', secret = piiKeyFromEnv() } = {}) {
  if (!isSealedTin(sealed)) throw fail('TIN_NOT_SEALED');
  if (sealed.startsWith(`${VAULT_PREFIX}.`)) {
    let record = null;
    try {
      record = JSON.parse(Buffer.from(sealed.slice(VAULT_PREFIX.length + 1), 'base64url').toString('utf8'));
    } catch {
      throw fail('TIN_UNREADABLE');
    }
    const digits = decryptSecret(record);
    if (!/^\d{9}$/.test(digits)) throw fail('TIN_UNREADABLE');
    return digits;
  }
  if (!secret) throw fail('PII_KEY_MISSING');
  const [, iv, tag, body] = sealed.split('.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', tinKey(secret, scope), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(String(scope || '')));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw fail('TIN_UNREADABLE');
  }
}

export const sealSsn = sealTin;
export const openSsn = openTin;
export const maskSsn = maskTin;

const DASHED = /(?<![\w-])(\d{3})[- ](\d{2})[- ](\d{4})(?![\w-])/g;
const BARE = /(?<![\w.,$-])(\d{9})(?![\w.,-])/g;

export function redactTins(text) {
  if (text == null) return text;
  return String(text)
    .replace(DASHED, (_, a, b, c) => maskTin(`${a}${b}${c}`) || '***-**-****')
    .replace(BARE, (match) => (tinKind(match) ? maskTin(match) : match));
}

export const redactSsns = redactTins;

function redactorFor(country) {
  const code = String(country || '').toUpperCase();
  if (code === 'US') return { text: redactTins, deep: redactTinsDeep };
  if (code === 'MY') return { text: redactNrics, deep: redactNricsDeep };
  return null;
}

export function tinsMaskedFor(country) {
  return redactorFor(country) !== null;
}

export function redactTinsFor(country, text) {
  const redactor = redactorFor(country);
  return redactor ? redactor.text(text) : text;
}

export function redactTinsDeepFor(country, value) {
  const redactor = redactorFor(country);
  return redactor ? redactor.deep(value) : value;
}

export function redactTinsDeep(value, depth = 0) {
  if (depth > 20) return value;
  if (typeof value === 'string') return redactTins(value);
  if (Array.isArray(value)) return value.map((item) => redactTinsDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = /^(ssn|itin|tin|taxpayerId)$/i.test(key) && typeof item === 'string' && !isSealedTin(item) && tinKind(item) ? maskTin(item) : redactTinsDeep(item, depth + 1);
    }
    return out;
  }
  return value;
}

function redactBlock(block, redactor) {
  if (typeof block === 'string') return redactor.text(block);
  if (!block || typeof block !== 'object') return block;
  if (block.type === 'text' && typeof block.text === 'string') return { ...block, text: redactor.text(block.text) };
  if (block.type === 'tool_result') return { ...block, content: Array.isArray(block.content) ? block.content.map((item) => redactBlock(item, redactor)) : redactBlock(block.content, redactor) };
  if (block.type === 'tool_use' && block.input) return { ...block, input: redactor.deep(block.input) };
  return block;
}

export function redactModelRequest(body, country = 'US') {
  const redactor = redactorFor(country);
  if (!body || typeof body !== 'object' || !redactor) return body;
  const out = { ...body };
  if (typeof out.system === 'string') out.system = redactor.text(out.system);
  else if (Array.isArray(out.system)) out.system = out.system.map((block) => redactBlock(block, redactor));
  if (Array.isArray(out.messages)) {
    out.messages = out.messages.map((message) => ({ ...message, content: Array.isArray(message.content) ? message.content.map((block) => redactBlock(block, redactor)) : redactBlock(message.content, redactor) }));
  }
  return out;
}

export function maskAccount(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : '';
}

export function routingShapeError(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) return 'ROUTING_NOT_NINE_DIGITS';
  if (!/^(0[0-9]|1[0-2]|2[1-9]|3[0-2]|61|62|63|64|65|66|67|68|69|70|71|72|80)/.test(digits)) return 'ROUTING_BAD_PREFIX';
  const d = digits.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0 ? null : 'ROUTING_CHECKSUM';
}
