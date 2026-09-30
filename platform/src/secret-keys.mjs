const SECRET_KEY_PARTS = ['secret', 'password', 'passwd', 'otp', 'token', 'apikey', 'appkey', 'auth', 'credential', 'privatekey'];
const SECRET_KEY_EXACT = new Set(['sek', 'pwd', 'evc']);

export const REDACTED = '[REDACTED]';

export function isSecretKey(key) {
  const k = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_KEY_EXACT.has(k) || SECRET_KEY_PARTS.some((part) => k.includes(part));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mapSecrets(value, onSecret) {
  if (Array.isArray(value)) return value.map((item) => mapSecrets(item, onSecret));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) {
      const replaced = onSecret(child);
      if (replaced !== undefined) out[key] = replaced;
      continue;
    }
    out[key] = mapSecrets(child, onSecret);
  }
  return out;
}

export function redactSecrets(value) {
  return mapSecrets(value, () => REDACTED);
}

export function omitSecrets(value) {
  return mapSecrets(value, () => undefined);
}

export function hasSecretKey(value) {
  if (Array.isArray(value)) return value.some(hasSecretKey);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, child]) => isSecretKey(key) || hasSecretKey(child));
}
