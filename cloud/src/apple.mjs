import { createHash, timingSafeEqual } from 'node:crypto';
import { createJwksKeys, createIdTokenVerifier, clientIdsFrom } from './oidc.mjs';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_BUNDLE_ID = 'com.mldynamic.myca.us';
const PRIVATE_RELAY = /@privaterelay\.appleid\.com$/i;
const RAW_NONCE = /^[\x21-\x7e]{16,128}$/;

export function appleClientIdsFromEnv(env = process.env) {
  const raw = String(env.MYCA_APPLE_CLIENT_IDS || '').trim();
  return raw === 'unset' ? [] : clientIdsFrom(raw);
}

export function createAppleKeys({ fetchImpl = fetch, now = () => Date.now(), url = APPLE_KEYS_URL } = {}) {
  return createJwksKeys({ url, fetchImpl, now });
}

export function hashNonce(rawNonce) {
  return createHash('sha256').update(String(rawNonce), 'utf8').digest('hex');
}

function nonceMatches(rawNonce, claimed) {
  if (typeof rawNonce !== 'string' || !RAW_NONCE.test(rawNonce) || typeof claimed !== 'string' || !claimed) return false;
  const expected = Buffer.from(hashNonce(rawNonce));
  const given = Buffer.from(claimed.toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function displayName(given) {
  if (!given || typeof given !== 'object') return '';
  const part = (value) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '');
  return [part(given.givenName), part(given.familyName)].filter(Boolean).join(' ').slice(0, 80);
}

export function createAppleVerifier({ clientIds = [], keys, now = () => Date.now() }) {
  const verifier = createIdTokenVerifier({
    issuers: [APPLE_ISSUER],
    clientIds,
    keys,
    now,
    codes: { invalid: 'INVALID_APPLE_TOKEN', expired: 'APPLE_TOKEN_EXPIRED', unreachable: 'APPLE_UNREACHABLE', unavailable: 'APPLE_SIGN_IN_UNAVAILABLE' },
  });
  return {
    enabled: verifier.enabled,
    async verify(idToken, { rawNonce, fullName } = {}) {
      const out = await verifier.verify(idToken);
      if (!out.ok) return out.error === 'WRONG_AUDIENCE' ? { ok: false, error: 'APPLE_WRONG_AUDIENCE' } : out;
      if (!nonceMatches(rawNonce, out.nonce)) return { ok: false, error: 'APPLE_NONCE_MISMATCH' };
      return {
        ok: true,
        issuer: APPLE_ISSUER,
        sub: out.sub,
        email: out.email,
        privateRelay: PRIVATE_RELAY.test(out.email),
        name: displayName(fullName),
      };
    },
  };
}
