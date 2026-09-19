import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

export {
  GOVT_SITES,
  GOVT_GUIDE,
  mycaDir,
  govtConfigPath,
  loadGovtConfig,
  saveGovtConfig,
  migrateGovtVault,
  publicGovtConfig,
  pemFromDisk,
  normalizeNicPublicKey,
  saveNicPublicKey,
  invoiceToNicPayload,
} from './nic-config.mjs';

import { GOVT_SITES, publicGovtConfig, mycaDir } from './nic-config.mjs';

export async function probeGovt(fetchFn = fetch) {
  const targets = [
    { id: 'gst.gov.in', url: GOVT_SITES.gstHome },
    { id: 'einvoice1.gst.gov.in', url: GOVT_SITES.einvoicePortal },
    { id: 'einv-apisandbox.nic.in (portal)', url: GOVT_SITES.nicSandbox },
    { id: 'IRP sandbox gateway', url: `${GOVT_SITES.nicAuthSandbox.replace('/eivital/v1.04/auth', '')}/eivital/v1.04/heartbeat/ping` },
    { id: 'mca.gov.in', url: GOVT_SITES.mca },
    { id: 'eportal.incometax.gov.in', url: GOVT_SITES.itePortal },
  ];
  const hits = [];
  for (const t of targets) {
    const started = Date.now();
    try {
      const res = await fetchFn(t.url, {
        method: 'GET',
        headers: { accept: 'application/json, text/plain, text/html, */*', 'user-agent': 'MyCA/0.1 (local books; GSTN/NIC client)' },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      hits.push({ id: t.id, url: t.url, ok: res.status > 0, status: res.status, ms: Date.now() - started });
    } catch (err) {
      hits.push({ id: t.id, url: t.url, ok: false, status: 0, error: String(err.message || err), ms: Date.now() - started });
    }
  }
  return {
    at: new Date().toISOString(),
    live: hits.filter((h) => h.ok).length,
    total: hits.length,
    hits,
    config: publicGovtConfig(),
    note: 'HTTP to official hosts from this machine. Auth/IRN still need your NIC client-id and API user.',
  };
}

export function migrateLegacyBooks() {
  const neu = join(mycaDir(), 'state.json');
  const home = process.env.APPDATA || process.env.HOME || process.cwd();
  const old = join(home, 'Bahikhata', 'state.json');
  mkdirSync(mycaDir(), { recursive: true });
  if (!existsSync(neu) && existsSync(old)) copyFileSync(old, neu);
  return neu;
}

export {
  nicAuthenticate,
  nicGenerateIrn,
  nicCancelIrn,
  nicGetIrn,
  nicGetIrnByDoc,
  nicGetRejectedIrns,
  nicGenerateEwayBill,
  nicGetEwayBill,
  nicCancelEwayBill,
  nicGstinMaster,
  nicHealth,
  nicSession,
  clearNicSession,
  encryptPayload,
  decryptPayload,
  generateMockIrnPayload,
  IRP_HOSTS,
  IRP_PATHS,
} from './nic-client.mjs';
