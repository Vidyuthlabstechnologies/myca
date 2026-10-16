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

// MYCA_MOCK_MODE=1 makes every provider front door (Sandbox by Quicko, NIC e-invoice,
// notifications, NVIDIA NIM) return realistic simulated responses without credentials,
// the live switch, or CA approvals. No bytes ever leave the machine in mock mode.
// Deterministic outputs; every result is tagged mock:true so it is never mistaken for
// a real filing. Default OFF: real operations stay fail-closed until deliberately enabled.
export function channelPullsEnabled() {
  const env = loadEnvFile();
  const raw = process.env.MYCA_ENABLE_CHANNEL_PULLS ?? env.MYCA_ENABLE_CHANNEL_PULLS ?? '';
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

export function mockModeEnabled() {
  const env = loadEnvFile();
  const raw = process.env.MYCA_MOCK_MODE ?? env.MYCA_MOCK_MODE ?? '';
  return TRUTHY.has(String(raw).trim().toLowerCase());
}
