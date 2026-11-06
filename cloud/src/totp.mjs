import { createHmac, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
const DEFAULT_ISSUER = 'MyCA';

export function base32Encode(buffer) {
  const bytes = Buffer.from(buffer);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

export function hotp(secretBuffer, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', Buffer.from(secretBuffer)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function stepOf(nowMs, step = TOTP_STEP_SECONDS) {
  return Math.floor(nowMs / 1000 / step);
}

export function totpCode(secretBuffer, nowMs, step = TOTP_STEP_SECONDS) {
  return hotp(secretBuffer, stepOf(nowMs, step));
}

export function verifyTotp(secretBuffer, code, nowMs, { window = 1, lastStep = 0, step = TOTP_STEP_SECONDS } = {}) {
  const given = Buffer.from(String(code ?? ''), 'utf8');
  const current = stepOf(nowMs, step);
  let matched = null;
  for (let s = Math.max(0, current - window); s <= current + window; s++) {
    const expected = Buffer.from(hotp(secretBuffer, s), 'utf8');
    const same = given.length === expected.length && timingSafeEqual(given, expected);
    if (same && s > lastStep && matched === null) matched = s;
  }
  return matched === null ? { ok: false } : { ok: true, step: matched };
}

export function otpauthUri({ issuer = DEFAULT_ISSUER, account, secretBase32 }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(String(account ?? ''))}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
