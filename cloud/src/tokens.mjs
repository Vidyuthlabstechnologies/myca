import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 60 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const PREFIX = 'v1';

export function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`token secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return secret;
}

function mac(secret, body) {
  return createHmac('sha256', secret).update(`${PREFIX}.${body}`).digest();
}

export function signAccessToken({ userId, deviceId }, secret, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const body = Buffer.from(JSON.stringify({ sub: userId, dev: deviceId, iat: issued, exp: issued + ACCESS_TTL_SECONDS })).toString('base64url');
  return `${PREFIX}.${body}.${mac(assertSecret(secret), body).toString('base64url')}`;
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, error: 'MALFORMED_TOKEN' };
  const given = Buffer.from(parts[2], 'base64url');
  const expected = mac(assertSecret(secret), parts[1]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: 'BAD_SIGNATURE' };
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'MALFORMED_TOKEN' };
  }
  if (typeof claims?.sub !== 'string' || typeof claims?.dev !== 'string' || !Number.isFinite(claims?.exp)) {
    return { ok: false, error: 'MALFORMED_TOKEN' };
  }
  if (claims.exp * 1000 <= now) return { ok: false, error: 'TOKEN_EXPIRED' };
  return { ok: true, userId: claims.sub, deviceId: claims.dev, expiresAt: claims.exp * 1000 };
}

export function newRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex');
}

export function keyedHash(secret, value) {
  return createHmac('sha256', assertSecret(secret)).update(String(value ?? ''), 'utf8').digest('hex');
}
