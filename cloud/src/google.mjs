import { createJwksKeys, createIdTokenVerifier, clientIdsFrom } from './oidc.mjs';

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export { clientIdsFrom };

export function createGoogleKeys({ fetchImpl = fetch, now = () => Date.now(), url = GOOGLE_CERTS_URL } = {}) {
  return createJwksKeys({ url, fetchImpl, now });
}

export function createGoogleVerifier({ clientIds = [], keys, now = () => Date.now() }) {
  const verifier = createIdTokenVerifier({
    issuers: ISSUERS,
    clientIds,
    keys,
    now,
    codes: { invalid: 'INVALID_GOOGLE_TOKEN', expired: 'GOOGLE_TOKEN_EXPIRED', unreachable: 'GOOGLE_UNREACHABLE', unavailable: 'GOOGLE_SIGN_IN_UNAVAILABLE' },
  });
  return {
    enabled: verifier.enabled,
    async verify(idToken) {
      const out = await verifier.verify(idToken);
      if (!out.ok) return out;
      return { ok: true, sub: out.sub, email: out.email, name: out.name };
    },
  };
}
