import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnvFile() {
  const paths = [
    join(root, '.env'),
    join(root, '.env.production'),
    join(root, '.env.local'),
  ];
  const env = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          if (!env[key] && value) env[key] = value;
        }
      }
    } catch { /* ignore parse error */ }
  }
  return env;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

// Live outbound calls to providers (Quicko Sandbox, NVIDIA NIM) are opt-in.
// Default OFF: the assistant and tools must never reach external portals
// without an explicit, deliberate operator decision.
export function liveCallsEnabled() {
  const env = loadEnvFile();
  const raw = process.env.MYCA_ENABLE_LIVE_CALLS ?? env.MYCA_ENABLE_LIVE_CALLS ?? '';
  return TRUTHY.has(String(raw).trim().toLowerCase());
}
