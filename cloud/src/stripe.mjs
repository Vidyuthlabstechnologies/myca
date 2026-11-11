import { createHmac, timingSafeEqual } from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_SECONDS = 300;

function flatten(value, prefix, out) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) flatten(inner, prefix ? `${prefix}[${key}]` : key, out);
    return out;
  }
  out.append(prefix, String(value));
  return out;
}

export function stripeForm(params) {
  return flatten(params, '', new URLSearchParams()).toString();
}

export function stripeSignature(secret, payload, timestamp) {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

export function stripeSignatureValid(secret, payload, header, nowSeconds) {
  if (!secret || typeof header !== 'string' || !header) return false;
  const parts = header.split(',').map((part) => part.trim().split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(stripeSignature(secret, payload, timestamp));
  return parts.filter(([key]) => key === 'v1').some(([, given]) => {
    const actual = Buffer.from(String(given || ''));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function createStripe({ secretKey, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  async function call(method, path, params) {
    const res = await fetchImpl(`${STRIPE_API}/${path}`, {
      method,
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
      body: method === 'GET' ? undefined : stripeForm(params || {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
  return {
    createCheckout: (params) => call('POST', 'checkout/sessions', params),
    getCheckout: (id) => call('GET', `checkout/sessions/${encodeURIComponent(id)}`),
    getSubscription: (id) => call('GET', `subscriptions/${encodeURIComponent(id)}`),
    cancelAtPeriodEnd: (id) => call('POST', `subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: true }),
  };
}
