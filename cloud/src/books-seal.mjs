import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const MIN_KEY_LENGTH = 32;

export function booksKeyFromEnv(env = process.env) {
  const value = String(env.MYCA_BOOKS_KEY || '').trim();
  if (value === 'unset' || !value) return '';
  if (value.length < MIN_KEY_LENGTH) throw new Error(`MYCA_BOOKS_KEY must be at least ${MIN_KEY_LENGTH} characters`);
  return value;
}

function dataKey(secret, businessId) {
  return Buffer.from(hkdfSync('sha256', secret, String(businessId), 'myca-books-state', 32));
}

export function isSealed(value) {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`);
}

export function sealState(secret, businessId, text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, dataKey(secret, businessId), iv);
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${VERSION}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

export function openState(secret, businessId, value) {
  if (!isSealed(value)) return value;
  if (!secret) throw Object.assign(new Error('the books are sealed and the service has no MYCA_BOOKS_KEY'), { code: 'BOOKS_KEY_MISSING' });
  const [, iv, tag, body] = value.split('.');
  try {
    const decipher = createDecipheriv(ALGORITHM, dataKey(secret, businessId), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8'));
  } catch {
    throw Object.assign(new Error('the books could not be opened with this key'), { code: 'BOOKS_KEY_WRONG' });
  }
}

export function storedState(secret, businessId, text) {
  return secret ? JSON.stringify(sealState(secret, businessId, text)) : text;
}
