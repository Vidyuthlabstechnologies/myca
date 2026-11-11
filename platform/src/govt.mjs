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
  nicSupplyType,
  nicPayloadProblems,
} from './nic-config.mjs';

import { mycaDir } from './nic-config.mjs';

export { probeGovt } from './reachability.mjs';

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
