import { createPublicKey, verify } from 'node:crypto';

const SKEW_SECONDS = 60;
const DEFAULT_CACHE_SECONDS = 3600;
const MAX_TOKEN_LENGTH = 8192;
const ALGORITHMS = { RS256: 'RSA-SHA256', RS384: 'RSA-SHA384', RS512: 'RSA-SHA512' };

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

export function createJwksKeys({ url, fetchImpl = fetch, now = () => Date.now(), discover = null } = {}) {
  let cache = { keys: new Map(), expiresAt: 0 };
  let loading = null;
  let jwksUrl = url || '';

  async function load() {
    if (!jwksUrl && discover) jwksUrl = await discover();
    if (!jwksUrl) throw new Error('jwks: no url');
    const res = await fetchImpl(jwksUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`jwks: HTTP ${res.status}`);
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

export function createIdTokenVerifier({ issuers, clientIds = [], keys, now = () => Date.now(), codes = {} }) {
  const accepted = new Set(issuers);
  const audiences = new Set(clientIds);
  const INVALID = codes.invalid || 'INVALID_ID_TOKEN';
  const EXPIRED = codes.expired || 'ID_TOKEN_EXPIRED';
  const UNREACHABLE = codes.unreachable || 'ISSUER_UNREACHABLE';
  const UNAVAILABLE = codes.unavailable || 'SIGN_IN_UNAVAILABLE';
  return {
    enabled: audiences.size > 0 && accepted.size > 0,
    async verify(idToken) {
      if (!audiences.size || !accepted.size) return fail(UNAVAILABLE);
      const parts = typeof idToken === 'string' ? idToken.split('.') : [];
      if (parts.length !== 3 || idToken.length > MAX_TOKEN_LENGTH) return fail(INVALID);
      const header = decodeJson(parts[0]);
      const claims = decodeJson(parts[1]);
      if (!header || !claims || !ALGORITHMS[header.alg] || typeof header.kid !== 'string') return fail(INVALID);
      let key;
      try {
        key = await keys.get(header.kid);
      } catch {
        return fail(UNREACHABLE);
      }
      if (!key) return fail(INVALID);
      const signed = verify(ALGORITHMS[header.alg], Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
      if (!signed) return fail(INVALID);
      if (!accepted.has(claims.iss)) return fail(INVALID);
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!aud.some((id) => audiences.has(id))) return fail('WRONG_AUDIENCE');
      const seconds = now() / 1000;
      if (!(Number(claims.exp) > seconds - SKEW_SECONDS)) return fail(EXPIRED);
      if (Number(claims.iat) > seconds + SKEW_SECONDS) return fail(INVALID);
      if (typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) return fail(INVALID);
      const verifiedEmail = claims.email_verified === true || claims.email_verified === 'true';
      return {
        ok: true,
        issuer: String(claims.iss),
        sub: claims.sub,
        email: verifiedEmail && typeof claims.email === 'string' ? claims.email.slice(0, 254) : '',
        name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 80) : typeof claims.preferred_username === 'string' ? claims.preferred_username.trim().slice(0, 80) : '',
      };
    },
  };
}

export function oidcConfigFromEnv(env = process.env) {
  const value = (name) => String(env[name] || '').trim();
  const unset = (v) => !v || v === 'unset';
  return {
    issuer: unset(value('MYCA_OIDC_ISSUER')) ? '' : value('MYCA_OIDC_ISSUER').replace(/\/+$/, ''),
    clientIds: clientIdsFrom(unset(value('MYCA_OIDC_CLIENT_IDS')) ? '' : value('MYCA_OIDC_CLIENT_IDS')),
    jwksUrl: unset(value('MYCA_OIDC_JWKS_URL')) ? '' : value('MYCA_OIDC_JWKS_URL'),
  };
}

export function createOidcVerifier({ issuer = '', clientIds = [], jwksUrl = '', keys = null, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const trimmed = String(issuer || '').replace(/\/+$/, '');
  const issuers = trimmed ? [trimmed, `${trimmed}/`] : [];
  const discover = async () => {
    const res = await fetchImpl(`${trimmed}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`oidc discovery: HTTP ${res.status}`);
    const body = await res.json();
    if (typeof body.jwks_uri !== 'string' || !/^https:\/\//.test(body.jwks_uri)) throw new Error('oidc discovery: no jwks_uri');
    return body.jwks_uri;
  };
  const resolvedKeys = keys || createJwksKeys({ url: jwksUrl, fetchImpl, now, discover: trimmed ? discover : null });
  const verifier = createIdTokenVerifier({
    issuers,
    clientIds,
    keys: resolvedKeys,
    now,
    codes: { invalid: 'INVALID_ID_TOKEN', expired: 'ID_TOKEN_EXPIRED', unreachable: 'ISSUER_UNREACHABLE', unavailable: 'OIDC_SIGN_IN_UNAVAILABLE' },
  });
  return { enabled: verifier.enabled, issuer: trimmed, verify: verifier.verify };
}
