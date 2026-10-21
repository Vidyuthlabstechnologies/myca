import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decryptSecret, encryptSecret, vaultBackend } from './credential-vault.mjs';
import { mycaDir } from './nic-config.mjs';

const HOSTS = { test: 'https://test-api.sandbox.co.in', live: 'https://api.sandbox.co.in' };
const EMPTY = { environment: 'test', apiKey: '', apiSecret: '', baseUrl: '', savedOn: '' };

export function sandboxKeysPath() {
  return join(mycaDir(), 'sandbox.json');
}

export function loadSandboxKeys() {
  const path = sandboxKeysPath();
  if (!existsSync(path)) return { ...EMPTY };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { ...EMPTY };
  }
  const secrets = raw.secrets || {};
  return {
    environment: raw.environment === 'live' ? 'live' : 'test',
    apiKey: secrets.apiKey ? decryptSecret(secrets.apiKey) : '',
    apiSecret: secrets.apiSecret ? decryptSecret(secrets.apiSecret) : '',
    baseUrl: String(raw.baseUrl || ''),
    savedOn: String(raw.savedOn || ''),
  };
}

function mask(value) {
  const text = String(value || '');
  if (!text) return '';
  return text.length <= 4 ? '••••' : `••••${text.slice(-4)}`;
}

export function publicSandboxKeys(cfg = loadSandboxKeys()) {
  return {
    environment: cfg.environment,
    baseUrl: cfg.baseUrl || HOSTS[cfg.environment],
    apiKeySet: Boolean(cfg.apiKey),
    apiSecretSet: Boolean(cfg.apiSecret),
    apiKeyHint: mask(cfg.apiKey),
    savedOn: cfg.savedOn,
    vault: vaultBackend(),
    path: sandboxKeysPath(),
  };
}

export function saveSandboxKeys(patch = {}, today = new Date().toISOString().slice(0, 10)) {
  const current = loadSandboxKeys();
  const environment = patch.environment == null ? current.environment : String(patch.environment).toLowerCase();
  if (environment !== 'test' && environment !== 'live') return { ok: false, error: 'BAD_ENVIRONMENT', hint: 'test or live' };
  const apiKey = patch.apiKey == null ? current.apiKey : String(patch.apiKey).trim();
  const apiSecret = patch.apiSecret == null ? current.apiSecret : String(patch.apiSecret).trim();
  if (!apiKey || !apiSecret) return { ok: false, error: 'KEY_AND_SECRET_REQUIRED', hint: 'Both the API key and the API secret from developer.sandbox.co.in are needed.' };
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(apiKey) || !/^[A-Za-z0-9._-]{8,400}$/.test(apiSecret)) return { ok: false, error: 'BAD_KEY_SHAPE', hint: 'A Sandbox key or secret is letters, digits, dots, dashes and underscores; check for spaces copied with it.' };
  let baseUrl = patch.baseUrl == null ? current.baseUrl : String(patch.baseUrl).trim().replace(/\/+$/, '');
  if (baseUrl) {
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      return { ok: false, error: 'BAD_BASE_URL' };
    }
    if (parsed.protocol !== 'https:' || !/(^|\.)sandbox\.co\.in$/.test(parsed.hostname)) return { ok: false, error: 'BAD_BASE_URL', hint: 'The host must be api.sandbox.co.in or test-api.sandbox.co.in.' };
    baseUrl = parsed.origin;
  }
  const file = { environment, baseUrl, savedOn: today, vault: vaultBackend(), secrets: { apiKey: encryptSecret(apiKey), apiSecret: encryptSecret(apiSecret) } };
  mkdirSync(mycaDir(), { recursive: true });
  writeFileSync(sandboxKeysPath(), JSON.stringify(file, null, 2), { mode: 0o600 });
  return { ok: true, keys: publicSandboxKeys({ environment, apiKey, apiSecret, baseUrl, savedOn: today }) };
}

export function clearSandboxKeys() {
  const path = sandboxKeysPath();
  if (existsSync(path)) writeFileSync(path, JSON.stringify({ environment: 'test', baseUrl: '', savedOn: '', vault: vaultBackend(), secrets: {} }, null, 2), { mode: 0o600 });
  return { ok: true, keys: publicSandboxKeys({ ...EMPTY }) };
}

export { HOSTS as SANDBOX_HOSTS };
