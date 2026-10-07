import { createPublicKey, verify } from 'node:crypto';

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const SKEW_SECONDS = 60;
const DEFAULT_CACHE_SECONDS = 3600;

function fail(error) {
  return { ok: false, error };
}

function decodeJson(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function clientIdsFrom(value) {
  return String(value || '').split(',').map((id) => id.trim()).filter(Boolean);
}

export function createGoogleKeys({ fetchImpl = fetch, now = () => Date.now(), url = GOOGLE_CERTS_URL } = {}) {
  let cache = { keys: new Map(), expiresAt: 0 };
  let loading = null;

  async function load() {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`google certs: HTTP ${res.status}`);
    const body = await res.json();
    const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [])[1]) || DEFAULT_CACHE_SECONDS;
    const keys = new Map();
    for (const jwk of body.keys || []) {
      if (jwk.kty === 'RSA' && typeof jwk.kid === 'string') keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
    }
    cache = { keys, expiresAt: now() + maxAge * 1000 };
  }

  return {
    async get(kid) {
      const fresh = now() < cache.expiresAt;
      if (fresh && cache.keys.has(kid)) return cache.keys.get(kid);
      loading = loading || load().finally(() => { loading = null; });
      await loading;
      return cache.keys.get(kid) || null;
    },
  };
}

export function createGoogleVerifier({ clientIds = [], keys, now = () => Date.now() }) {
  const audiences = new Set(clientIds);
  return {
    enabled: audiences.size > 0,
    async verify(idToken) {
      if (!audiences.size) return fail('GOOGLE_SIGN_IN_UNAVAILABLE');
      const parts = typeof idToken === 'string' ? idToken.split('.') : [];
      if (parts.length !== 3 || idToken.length > 8192) return fail('INVALID_GOOGLE_TOKEN');
      const header = decodeJson(parts[0]);
      const claims = decodeJson(parts[1]);
      if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return fail('INVALID_GOOGLE_TOKEN');
      let key;
      try {
        key = await keys.get(header.kid);
      } catch {
        return fail('GOOGLE_UNREACHABLE');
      }
      if (!key) return fail('INVALID_GOOGLE_TOKEN');
      const signed = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
      if (!signed) return fail('INVALID_GOOGLE_TOKEN');
      if (!ISSUERS.has(claims.iss)) return fail('INVALID_GOOGLE_TOKEN');
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!aud.some((id) => audiences.has(id))) return fail('WRONG_AUDIENCE');
      const seconds = now() / 1000;
      if (!(Number(claims.exp) > seconds - SKEW_SECONDS)) return fail('GOOGLE_TOKEN_EXPIRED');
      if (Number(claims.iat) > seconds + SKEW_SECONDS) return fail('INVALID_GOOGLE_TOKEN');
      if (typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) return fail('INVALID_GOOGLE_TOKEN');
      const verifiedEmail = claims.email_verified === true || claims.email_verified === 'true';
      return {
        ok: true,
        sub: claims.sub,
        email: verifiedEmail && typeof claims.email === 'string' ? claims.email.slice(0, 254) : '',
        name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 80) : '',
      };
    },
  };
}
