import { existsSync } from 'node:fs';
import { loadEnvFile, productionCallsEnabled } from './runtime-config.mjs';

export const MEF_HOSTS = Object.freeze({
  ats: 'https://la.alt.www4.irs.gov/a2a/mef',
  production: 'https://la.www4.irs.gov/a2a/mef',
});

function config(name) {
  return String(process.env[name] ?? loadEnvFile()[name] ?? '').trim();
}

export function irsMefSettings() {
  const certPath = config('MYCA_IRS_CERT_PATH');
  const keyPath = config('MYCA_IRS_KEY_PATH');
  return {
    etin: config('MYCA_IRS_ETIN'),
    efin: config('MYCA_IRS_EFIN'),
    softwareId: config('MYCA_IRS_SOFTWARE_ID'),
    appSysId: config('MYCA_IRS_APP_SYS_ID'),
    certPath,
    keyPath,
    certPresent: Boolean(certPath && existsSync(certPath)),
    keyPresent: Boolean(keyPath && existsSync(keyPath)),
    baseUrl: config('MYCA_IRS_MEF_URL') || (productionCallsEnabled() ? MEF_HOSTS.production : MEF_HOSTS.ats),
  };
}

export function irsMefMissing(settings = irsMefSettings()) {
  const missing = [];
  if (!/^\d{5}$/.test(settings.etin)) missing.push('MYCA_IRS_ETIN');
  if (!/^\d{6}$/.test(settings.efin)) missing.push('MYCA_IRS_EFIN');
  if (!/^\d{8}$/.test(settings.softwareId)) missing.push('MYCA_IRS_SOFTWARE_ID');
  if (!settings.appSysId) missing.push('MYCA_IRS_APP_SYS_ID');
  if (!settings.certPresent) missing.push('MYCA_IRS_CERT_PATH');
  if (!settings.keyPresent) missing.push('MYCA_IRS_KEY_PATH');
  return missing;
}
