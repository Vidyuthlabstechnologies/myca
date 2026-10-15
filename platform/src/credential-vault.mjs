import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { hostname } from 'node:os';

const require = createRequire(import.meta.url);
const DOMAIN = 'myca.local.vault.v1';

// Inside Electron we get the OS keychain (DPAPI on Windows) for free.
// Under plain `node` (dev / CI / tests) electron's main-process API is absent,
// so we fall back to AES-256-GCM under a key derived from machine + user identity.
function resolveSafeStorage() {
  try {
    const electron = require('electron');
    if (electron && electron.safeStorage && electron.safeStorage.isEncryptionAvailable()) {
      return electron.safeStorage;
    }
  } catch { /* not running inside Electron */ }
  return null;
}

const safeStorage = resolveSafeStorage();

export function vaultBackend() {
  return safeStorage ? 'electron-safeStorage' : 'aes-256-gcm-local';
}

export function vaultIsHardwareBacked() {
  return Boolean(safeStorage);
}

function machineKey(salt) {
  const user = process.env.USERNAME || process.env.USER || process.env.LOGNAME || '';
  return scryptSync(`${hostname()}::${user}::${DOMAIN}`, salt, 32);
}

export function safeStorageRequired() {
  return process.env.MYCA_REQUIRE_SAFE_STORAGE === '1' && !safeStorage;
}

export function encryptSecret(value) {
  const text = value == null ? '' : String(value);
  if (!text) return null;
  if (safeStorageRequired()) {
    const err = new Error('SAFE_STORAGE_REQUIRED');
    err.code = 'SAFE_STORAGE_REQUIRED';
    throw err;
  }
  if (safeStorage) {
    return { scheme: 'safeStorage', data: safeStorage.encryptString(text).toString('base64') };
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', machineKey(salt), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    scheme: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  };
}

export function decryptSecret(record) {
  if (!record || typeof record !== 'object') return '';
  try {
    if (record.scheme === 'safeStorage') {
      if (!safeStorage) return '';
      return safeStorage.decryptString(Buffer.from(record.data, 'base64'));
    }
    if (record.scheme === 'aes-256-gcm') {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        machineKey(Buffer.from(record.salt, 'base64')),
        Buffer.from(record.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8');
    }
  } catch { return ''; }
  return '';
}
