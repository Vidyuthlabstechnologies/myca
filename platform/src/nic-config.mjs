import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicEncrypt, constants, createPublicKey, createHash } from 'node:crypto';
import { encryptSecret, decryptSecret, vaultBackend } from './credential-vault.mjs';

export const GOVT_SITES = {
  gstHome: 'https://www.gst.gov.in/',
  gstServices: 'https://services.gst.gov.in/services/login',
  einvoicePortal: 'https://einvoice1.gst.gov.in/',
  nicSandbox: 'https://einv-apisandbox.nic.in/',
  nicAuthSandbox: 'https://einv1api.gstsandbox.nic.in/eivital/v1.04/auth',
  nicIrnSandbox: 'https://einv1api.gstsandbox.nic.in/eicore/v1.03/Invoice',
  nicAuthProd: 'https://einvoice1.gst.gov.in/eivital/v1.04/auth',
  nicIrnProd: 'https://einvoice1.gst.gov.in/eicore/v1.03/Invoice',
  ewbProd: 'https://api.ewaybillgst.gov.in/',
  mca: 'https://www.mca.gov.in/',
  itePortal: 'https://eportal.incometax.gov.in/',
};

export const GOVT_GUIDE = [
  {
    step: 1,
    title: 'Register on the API portal',
    url: GOVT_SITES.nicSandbox,
    do: 'On the e-Invoice API sandbox (einv-apisandbox.nic.in) choose User Type = Tax Payer, enter your GSTIN, the trade name as on the GST certificate, and the GST-registered mobile + email. OTP goes to that mobile.',
  },
  {
    step: 2,
    title: 'Note the credentials',
    url: GOVT_SITES.nicSandbox,
    do: 'You receive a Client ID + Client Secret (the "vital" credentials). Then create a Username + Password for the GSTIN in user management.',
  },
  {
    step: 3,
    title: 'Download the IRP public key',
    url: GOVT_SITES.nicSandbox,
    do: 'Download the .cer public key from the same portal. MyCA uses it to encrypt credentials; it refuses to authenticate without it.',
  },
  {
    step: 4,
    title: 'Paste credentials in MyCA',
    url: GOVT_SITES.nicSandbox,
    do: 'Govt tab: environment, Client ID, Client Secret, API user, password, GSTIN → Save. Then paste the .cer path → Load public key.',
  },
  {
    step: 5,
    title: 'Authenticate, then IRN',
    url: GOVT_SITES.einvoicePortal,
    do: 'Chat "nic auth" then "generate irn INV-0001". Auth RSA-encrypts the credentials; every IRN/e-Way Bill call is AES-256 encrypted with the session key NIC returns.',
  },
  {
    step: 6,
    title: 'Production is separate',
    url: GOVT_SITES.einvoicePortal,
    do: 'Production credentials come from einvoice1.gst.gov.in after on-boarding (static IPs + test report). The sandbox is for building and testing only.',
  },
];

export function mycaDir() {
  const home = process.env.APPDATA || process.env.HOME || process.cwd();
  return join(home, 'MyCA');
}

export function govtConfigPath() {
  return join(mycaDir(), 'govt.json');
}

export function loadGovtConfig() {
  const p = govtConfigPath();
  if (!existsSync(p)) {
    return { env: 'sandbox', clientId: '', clientSecret: '', username: '', password: '', gstin: '', publicKeyPem: '' };
  }
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  const secrets = raw.secrets || {};
  return {
    env: raw.env || 'sandbox',
    clientId: raw.clientId || '',
    clientSecret: secrets.clientSecret ? decryptSecret(secrets.clientSecret) : (raw.clientSecret || ''),
    username: raw.username || '',
    password: secrets.password ? decryptSecret(secrets.password) : (raw.password || ''),
    gstin: raw.gstin || '',
    publicKeyPem: raw.publicKeyPem || '',
  };
}

export function saveGovtConfig(patch) {
  const cfg = { ...loadGovtConfig(), ...patch };
  const secrets = {};
  const clientSecret = encryptSecret(cfg.clientSecret);
  const password = encryptSecret(cfg.password);
  if (clientSecret) secrets.clientSecret = clientSecret;
  if (password) secrets.password = password;
  const file = {
    env: cfg.env || 'sandbox',
    clientId: String(cfg.clientId || ''),
    username: String(cfg.username || ''),
    gstin: String(cfg.gstin || ''),
    publicKeyPem: String(cfg.publicKeyPem || ''),
    vault: vaultBackend(),
    secrets,
  };
  mkdirSync(mycaDir(), { recursive: true });
  writeFileSync(govtConfigPath(), JSON.stringify(file, null, 2), { mode: 0o600 });
  return publicGovtConfig(cfg);
}

export function migrateGovtVault() {
  const p = govtConfigPath();
  if (!existsSync(p)) return false;
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  if (!raw.clientSecret && !raw.password) return false;
  saveGovtConfig({});
  return true;
}

export function publicGovtConfig(cfg = loadGovtConfig()) {
  return {
    env: cfg.env || 'sandbox',
    gstin: cfg.gstin || '',
    username: cfg.username || '',
    clientIdSet: Boolean(cfg.clientId),
    passwordSet: Boolean(cfg.password),
    publicKeySet: Boolean(cfg.publicKeyPem) || existsSync(join(mycaDir(), 'einv-public.pem')),
    vault: vaultBackend(),
    guide: GOVT_GUIDE,
    sites: GOVT_SITES,
  };
}

export function pemFromDisk() {
  const p = join(mycaDir(), 'einv-public.pem');
  if (existsSync(p)) return readFileSync(p, 'utf8');
  return loadGovtConfig().publicKeyPem || '';
}

export function rsaEncryptBase64(plainUtf8, pem) {
  return publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(plainUtf8, 'utf8')).toString('base64');
}

export function normalizeNicPublicKey(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { ok: false, error: 'PUBLIC_KEY_REQUIRED' };
  const candidates = [];
  if (existsSync(raw)) {
    const buf = readFileSync(raw);
    const text = buf.toString('utf8');
    if (/-----BEGIN/.test(text)) candidates.push(text);
    else {
      candidates.push({ key: buf, format: 'der', type: 'spki' });
      candidates.push({ key: buf, format: 'der', type: 'pkcs1' });
    }
  } else if (/-----BEGIN/.test(raw)) {
    candidates.push(raw);
  } else if (/^[A-Za-z0-9+/=\s]{40,}$/.test(raw)) {
    const buf = Buffer.from(raw.replace(/\s+/g, ''), 'base64');
    candidates.push({ key: buf, format: 'der', type: 'spki' });
    candidates.push({ key: buf, format: 'der', type: 'pkcs1' });
  }
  for (const candidate of candidates) {
    try {
      const key = createPublicKey(candidate);
      return { ok: true, pem: key.export({ type: 'spki', format: 'pem' }), bits: key.asymmetricKeyDetails?.modulusLength || null };
    } catch { /* try the next shape */ }
  }
  return { ok: false, error: 'INVALID_PUBLIC_KEY' };
}

export function saveNicPublicKey(input) {
  const normalized = normalizeNicPublicKey(input);
  if (!normalized.ok) return normalized;
  saveGovtConfig({ publicKeyPem: normalized.pem });
  return { ok: true, bits: normalized.bits };
}

export function nicDocType(id) {
  const prefix = String(id || '').split('-')[0].toUpperCase();
  return prefix === 'CN' ? 'CRN' : prefix === 'DN' ? 'DBN' : 'INV';
}

function nicDate(iso) {
  const dt = String(iso || '').split('-');
  return dt.length === 3 ? `${dt[2]}/${dt[1]}/${dt[0]}` : String(iso || '');
}

export function invoiceToNicPayload(company, inv) {
  const date = nicDate(inv.date);
  const docType = nicDocType(inv.id);
  const pin = Number(company.pin || 411001);
  const loc = company.city || 'Pune';
  const items = (inv.lines || []).map((l, i) => ({
    SlNo: String(i + 1),
    IsServc: 'N',
    HsnCd: String(l.hsn || '5208'),
    Qty: Number(l.qty || 1),
    Unit: 'NOS',
    UnitPrice: Number(l.rate || 0),
    TotAmt: Number(l.taxable || 0),
    Discount: 0,
    PreTaxVal: Number(l.taxable || 0),
    AssAmt: Number(l.taxable || 0),
    GstRt: Number(l.gstRate || 0),
    IgstAmt: Number(l.igst || 0),
    CgstAmt: Number(l.cgst || 0),
    SgstAmt: Number(l.sgst || 0),
    TotItemVal: Number(l.amount || 0),
  }));
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: inv.partyGstin ? 'B2B' : 'B2C', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: docType, No: String(inv.id).slice(0, 16), Dt: date },
    ...(docType !== 'INV' && inv.invoiceId ? { PrecDocDtls: [{ InvNo: String(inv.invoiceId).slice(0, 16), InvDt: nicDate(inv.invoiceDate) }] } : {}),
    SellerDtls: {
      Gstin: company.gstin,
      LglNm: company.name,
      Addr1: company.address || loc,
      Loc: loc,
      Pin: pin,
      Stcd: company.state || '27',
    },
    BuyerDtls: {
      Gstin: inv.partyGstin || undefined,
      LglNm: inv.partyName,
      Pos: inv.partyState || inv.placeOfSupply || company.state,
      Addr1: inv.partyName,
      Loc: loc,
      Pin: pin,
      Stcd: inv.partyState || company.state,
    },
    ItemList: items,
    ValDtls: {
      AssVal: Number(inv.taxable || 0),
      CgstVal: Number(inv.cgst || 0),
      SgstVal: Number(inv.sgst || 0),
      IgstVal: Number(inv.igst || 0),
      TotInvVal: Number(inv.total || 0),
    },
  };
}

export function generateMockIrnPayload(company, inv) {
  const hashInput = `${company?.gstin || '27AABCN1234F1ZW'}${inv?.id || 'INV-0001'}${inv?.date || '2026-08-05'}${company?.fy || '2026-27'}`;
  const irn = createHash('sha256').update(hashInput).digest('hex');
  const ackNo = `1126${(BigInt(`0x${irn.slice(0, 15)}`) % 100000000000n).toString().padStart(11, '0')}`;
  const ackDate = `${inv?.date || '2026-08-05'} 00:00:00`;
  const qrData = {
    SellerGstin: company?.gstin || '27AABCN1234F1ZW',
    BuyerGstin: inv?.partyGstin || 'URP',
    DocNo: inv?.id || 'INV-0001',
    DocTyp: nicDocType(inv?.id),
    DocDt: inv?.date || '2026-08-05',
    TotInvVal: inv?.total || 0,
    ItemCnt: (inv?.lines || []).length || 1,
    MainHsnCode: inv?.lines?.[0]?.hsn || '5208',
    Irn: irn,
  };
  return {
    irn,
    ackNo,
    ackDate,
    signedQrCode: Buffer.from(JSON.stringify(qrData)).toString('base64url'),
    signedInvoice: `mock_jwt_${Buffer.from(JSON.stringify({ id: inv?.id, total: inv?.total })).toString('base64url')}.sig`,
  };
}
