import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicEncrypt, constants, createPublicKey, createHash } from 'node:crypto';
import { encryptSecret, decryptSecret, vaultBackend } from './credential-vault.mjs';
import { providerContext } from './provider-context.mjs';
import { rcmSupplyType, selfInvoiceById } from './reverse-charge.mjs';

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

export function normalizePem(text) {
  const raw = String(text || '').trim();
  const body = raw.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
  if (!body || !/^[A-Za-z0-9+/=]+$/.test(body)) return raw;
  const label = /BEGIN CERTIFICATE/.test(raw) ? 'CERTIFICATE' : 'PUBLIC KEY';
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
}

export function loadGovtConfig() {
  const given = providerContext()?.govt;
  if (given) {
    return {
      env: given.env === 'production' ? 'production' : 'sandbox',
      clientId: String(given.clientId || ''),
      clientSecret: String(given.clientSecret || ''),
      username: String(given.username || ''),
      password: String(given.password || ''),
      gstin: String(given.gstin || ''),
      publicKeyPem: normalizePem(given.publicKeyPem),
    };
  }
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

const PIN = /\b([1-9][0-9]{5})\b/;
const IRN_FROM = '2021-10-01';
const CANCEL_HOURS = 24;

function pinIn(text) {
  const found = PIN.exec(String(text || ''));
  return found ? Number(found[1]) : null;
}

function sellerPin(company) {
  const pin = String(company?.pin ?? '').trim();
  return /^[1-9][0-9]{5}$/.test(pin) ? Number(pin) : pinIn(company?.address);
}

function hsnOf(line) {
  return String(line?.hsn ?? '').replace(/\s+/g, '');
}

export function nicSupplyType(inv) {
  if (inv?.kind === 'purchase') return rcmSupplyType(inv);
  if (inv?.export) return inv.export.withTax ? 'EXPWP' : 'EXPWOP';
  return String(inv?.partyGstin || '').trim() ? 'B2B' : '';
}

export function nicPayloadProblems(company, inv, party = null, today = new Date().toISOString().slice(0, 10)) {
  const problems = [];
  const supply = nicSupplyType(inv);
  if (inv?.kind === 'purchase' && !supply) {
    problems.push(inv.reverseCharge
      ? { code: 'RCM_SUPPLIER_INVOICES', words: 'The supplier is registered, so the supplier issues the invoice for this reverse charge bill; you do not self-invoice it.' }
      : { code: 'NOT_A_SELF_INVOICE', words: 'A purchase bill gets an IRN only when it is a reverse charge self-invoice (from an unregistered supplier or an import of services).' });
    return problems;
  }
  if (!supply) problems.push({ code: 'B2C_NO_IRN', words: 'An invoice to a buyer without a GSTIN gets no IRN: e-invoicing covers B2B, export and SEZ supplies only.' });
  const date = String(inv?.date || '');
  if (date && date < IRN_FROM) problems.push({ code: 'DOCUMENT_TOO_OLD', words: 'The IRP takes documents dated 1 October 2021 or later.' });
  if (date && date > today) problems.push({ code: 'FUTURE_DOCUMENT', words: 'The document is dated in the future.' });
  const missing = (inv?.lines || []).map((line, at) => ({ at: at + 1, hsn: hsnOf(line) })).filter((line) => !/^[0-9]{4}(?:[0-9]{2}){0,2}$/.test(line.hsn));
  if (missing.length) problems.push({ code: 'HSN_REQUIRED', lines: missing.map((line) => line.at), words: `Line ${missing.map((line) => line.at).join(', ')} needs an HSN or SAC code of 4, 6 or 8 digits (6 or more when the yearly turnover is above 5 crore).` });
  if (!sellerPin(company)) problems.push({ code: 'SELLER_PIN_REQUIRED', words: 'Your business PIN code is not on file. Say "business address: ..." with the 6-digit PIN.' });
  if (!String(company?.address || '').trim()) problems.push({ code: 'SELLER_ADDRESS_REQUIRED', words: 'Your business address is not on file. Say "business address: ..." with the 6-digit PIN.' });
  if (supply === 'RCMDOM' && !pinIn(inv.partyAddress)) problems.push({ code: 'SUPPLIER_PIN_REQUIRED', words: `${inv.partyName || 'The supplier'}'s address with its PIN code is not on the bill. Record the bill again with the supplier's address.` });
  if (supply === 'RCMIMP' && !/^[A-Z]{2}$/.test(String(inv.reverseCharge?.originCountry || ''))) problems.push({ code: 'ORIGIN_COUNTRY_REQUIRED', words: 'A reverse charge import needs the supplier\'s country code (for example US or SG).' });
  if (supply === 'RCMIMP' && String(inv.reverseCharge?.originCountry || '') === 'IN') problems.push({ code: 'ORIGIN_COUNTRY_INDIA', words: 'The origin country of a reverse charge import must be outside India.' });
  if (supply === 'RCMIMP' && (inv.lines || []).some((line) => !hsnOf(line).startsWith('99'))) problems.push({ code: 'RCM_IMPORT_SERVICES_ONLY', words: 'A reverse charge import covers services only; every line needs a SAC starting 99.' });
  if (supply === 'B2B' && !pinIn(party?.address)) problems.push({ code: 'BUYER_PIN_REQUIRED', words: `${inv.partyName || 'The buyer'}'s address with its PIN code is not on file. Say "address for ${inv.partyName || 'the customer'}: ..." with the PIN.` });
  if (inv?.export && !/^[A-Z]{2}$/.test(String(inv.export.countryCode || '')) ) problems.push({ code: 'EXPORT_COUNTRY_REQUIRED', words: 'An export e-invoice needs the buyer\'s country code (for example US or AE).' });
  if (inv?.export && String(inv.export.countryCode || '').toUpperCase() === 'IN') problems.push({ code: 'EXPORT_COUNTRY_INDIA', words: 'An export buyer\'s country cannot be India.' });
  return problems;
}

export function nicPartyFor(state, inv) {
  const parties = Array.isArray(state?.parties) ? state.parties : [];
  return parties.find((party) => (inv?.partyAccountId && party.accountId === inv.partyAccountId)) || parties.find((party) => party.name === inv?.partyName) || null;
}

export function nicPayloadRefusal(state, inv) {
  const problems = nicPayloadProblems(state.company || {}, inv, nicPartyFor(state, inv));
  return problems.length ? { ok: false, error: 'IRN_PAYLOAD_INVALID', invoiceId: inv.id, problems, hint: problems.map((problem) => problem.words).join(' ') } : null;
}

export function nicCancelProblem(inv, now = new Date()) {
  const raw = String(inv?.ackDate || inv?.sandboxAckDate || '').trim();
  if (!raw) return null;
  const at = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}+05:30`);
  if (Number.isNaN(at.getTime())) return null;
  if (now.getTime() - at.getTime() <= CANCEL_HOURS * 3600 * 1000) return null;
  return { code: 'IRN_CANCEL_WINDOW_PASSED', words: 'An IRN can be cancelled on the IRP only within 24 hours of generation. Issue a credit note instead.' };
}

function selfInvoiceToNicPayload(company, bill) {
  const imported = bill.reverseCharge.kind === 'import';
  const ownState = bill.registrationState || company.state;
  const ownAddress = String(company.address || '');
  const ownLoc = String(company.city || '').trim() || ownAddress.split(',').map((part) => part.trim()).filter(Boolean).pop() || '';
  const supplierAddress = String(bill.partyAddress || '').trim();
  const supplierState = imported ? '96' : bill.partyState || ownState;
  const origin = imported ? String(bill.reverseCharge.originCountry || '').toUpperCase() : '';
  const items = (bill.lines || []).map((l, i) => ({
    SlNo: String(i + 1),
    IsServc: hsnOf(l).startsWith('99') ? 'Y' : 'N',
    HsnCd: hsnOf(l),
    Qty: Number(l.qty || 1),
    Unit: hsnOf(l).startsWith('99') ? 'OTH' : 'NOS',
    UnitPrice: Number(l.rate || 0),
    TotAmt: Number(l.taxable || 0),
    Discount: 0,
    PreTaxVal: Number(l.taxable || 0),
    AssAmt: Number(l.taxable || 0),
    GstRt: Number(l.gstRate || 0),
    IgstAmt: Number(l.igst || 0),
    CgstAmt: Number(l.cgst || 0),
    SgstAmt: Number(l.sgst || 0),
    ...(origin ? { OrgCntry: origin } : {}),
    TotItemVal: Number(l.amount || 0),
  }));
  const tax = Number(bill.cgst || 0) + Number(bill.sgst || 0) + Number(bill.igst || 0);
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: imported ? 'RCMIMP' : 'RCMDOM', RegRev: 'Y', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: String(bill.selfInvoiceNo).slice(0, 16), Dt: nicDate(bill.date) },
    SellerDtls: {
      Gstin: 'URP',
      LglNm: bill.partyName,
      Addr1: imported ? (supplierAddress.slice(0, 100) || bill.partyName) : supplierAddress.slice(0, 100),
      Loc: (supplierAddress.split(',').map((part) => part.trim()).filter(Boolean).pop()?.replace(PIN, '').trim() || origin || bill.partyName).slice(0, 50),
      Pin: imported ? 999999 : pinIn(supplierAddress),
      Stcd: supplierState,
    },
    BuyerDtls: {
      Gstin: bill.registrationGstin || company.gstin,
      LglNm: company.name,
      Pos: ownState,
      Addr1: ownAddress.slice(0, 100),
      Loc: ownLoc.slice(0, 50),
      Pin: sellerPin(company),
      Stcd: ownState,
    },
    ItemList: items,
    ValDtls: {
      AssVal: Number(bill.taxable || 0),
      CgstVal: Number(bill.cgst || 0),
      SgstVal: Number(bill.sgst || 0),
      IgstVal: Number(bill.igst || 0),
      TotInvVal: Math.round((Number(bill.taxable || 0) + tax) * 100) / 100,
    },
  };
}

export function nicDocumentById(state, id) {
  const key = String(id ?? '').trim();
  return [...(state?.invoices || []), ...(state?.creditNotes || []), ...(state?.debitNotes || [])].find((doc) => doc.id === key) || selfInvoiceById(state, key);
}

export function invoiceToNicPayload(company, inv, party = null) {
  if (rcmSupplyType(inv)) return selfInvoiceToNicPayload(company, inv);
  const date = nicDate(inv.date);
  const docType = nicDocType(inv.id);
  const exported = inv.export || null;
  const supply = nicSupplyType(inv) || 'B2B';
  const ownPin = sellerPin(company);
  const loc = String(company.city || '').trim() || String(company.address || '').split(',').map((part) => part.trim()).filter(Boolean).pop() || '';
  const buyerAddress = String(party?.address || '').trim();
  const buyerState = exported ? '96' : inv.partyState || inv.registrationState || company.state;
  const items = (inv.lines || []).map((l, i) => ({
    SlNo: String(i + 1),
    IsServc: hsnOf(l).startsWith('99') ? 'Y' : 'N',
    HsnCd: hsnOf(l),
    Qty: Number(l.qty || 1),
    Unit: hsnOf(l).startsWith('99') ? 'OTH' : 'NOS',
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
    TranDtls: { TaxSch: 'GST', SupTyp: supply, RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: docType, No: String(inv.id).slice(0, 16), Dt: date },
    ...(docType !== 'INV' && inv.invoiceId ? { PrecDocDtls: [{ InvNo: String(inv.invoiceId).slice(0, 16), InvDt: nicDate(inv.invoiceDate) }] } : {}),
    SellerDtls: {
      Gstin: inv.registrationGstin || company.gstin,
      LglNm: company.name,
      Addr1: String(company.address || '').slice(0, 100),
      Loc: loc.slice(0, 50),
      Pin: ownPin,
      Stcd: inv.registrationState || company.state,
    },
    BuyerDtls: {
      Gstin: exported ? 'URP' : inv.partyGstin || undefined,
      LglNm: inv.partyName,
      Pos: exported ? '96' : inv.partyState || inv.placeOfSupply || inv.registrationState || company.state,
      Addr1: buyerAddress.slice(0, 100) || undefined,
      Loc: buyerAddress.split(',').map((part) => part.trim()).filter(Boolean).pop()?.replace(PIN, '').trim().slice(0, 50) || undefined,
      Pin: exported ? 999999 : pinIn(buyerAddress),
      Stcd: buyerState,
    },
    ItemList: items,
    ValDtls: {
      AssVal: Number(inv.taxable || 0),
      CgstVal: Number(inv.cgst || 0),
      SgstVal: Number(inv.sgst || 0),
      IgstVal: Number(inv.igst || 0),
      TotInvVal: Number(inv.total || 0),
    },
    ...(exported ? {
      ExpDtls: {
        CntCode: String(exported.countryCode || '').toUpperCase() || undefined,
        ForCur: exported.currency && exported.currency !== 'INR' ? exported.currency : undefined,
        ShipBNo: exported.shippingBillNo || undefined,
        ShipBDt: exported.shippingBillDate ? nicDate(exported.shippingBillDate) : undefined,
        Port: exported.portCode || undefined,
      },
    } : {}),
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
    DocNo: inv?.selfInvoiceNo || inv?.id || 'INV-0001',
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
