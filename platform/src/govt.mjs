import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, publicEncrypt, constants, createHash } from 'node:crypto';

export const GOVT_SITES = {
  gstHome: 'https://www.gst.gov.in/',
  gstServices: 'https://services.gst.gov.in/services/login',
  einvoicePortal: 'https://einvoice1.gst.gov.in/',
  nicSandbox: 'https://einv-apisandbox.nic.in/',
  nicAuthSandbox: 'https://einv-apisandbox.nic.in/eivital/v1.04/auth',
  nicIrnSandbox: 'https://einv-apisandbox.nic.in/eicore/v1.03/Invoice',
  nicAuthProd: 'https://api.einvoice.gst.gov.in/eivital/v1.04/auth',
  nicIrnProd: 'https://api.einvoice.gst.gov.in/eicore/v1.03/Invoice',
  mca: 'https://www.mca.gov.in/',
  itePortal: 'https://eportal.incometax.gov.in/',
};

export const GOVT_GUIDE = [
  {
    step: 1,
    title: 'GST portal login',
    url: GOVT_SITES.gstServices,
    do: 'Create or use the GSTIN login at services.gst.gov.in. Returns are filed here (or via a GSP). MyCA prepares GSTR-1 JSON; it does not replace DSC/OTP on the portal.',
  },
  {
    step: 2,
    title: 'Enable e-invoice API user',
    url: GOVT_SITES.einvoicePortal,
    do: 'On einvoice1.gst.gov.in → API registration: create the e-invoice username/password for this GSTIN. Only GSTINs notified for e-invoice can authenticate.',
  },
  {
    step: 3,
    title: 'Sandbox first',
    url: GOVT_SITES.nicSandbox,
    do: 'Register on einv-apisandbox.nic.in, download the sandbox public key (.cer), and note client-id / client-secret from the developer portal.',
  },
  {
    step: 4,
    title: 'Paste credentials in MyCA',
    url: GOVT_SITES.nicSandbox,
    do: 'Govt tab: environment, client-id, client-secret, API user, password, GSTIN. Save. Put the .cer PEM into %APPDATA%\\MyCA\\einv-public.pem if you have it.',
  },
  {
    step: 5,
    title: 'Authenticate, then IRN',
    url: 'https://einv-apisandbox.nic.in/version1.04/authentication.html',
    do: 'Chat “nic auth” then “generate irn INV-0001”. Auth encrypts UserName/Password/AppKey with NIC’s RSA public key (official v1.04). Production uses api.einvoice.gst.gov.in.',
  },
  {
    step: 6,
    title: 'GSTR-1 / 3B filing',
    url: GOVT_SITES.gstServices,
    do: 'Download GSTR-1 JSON from the GST tab and upload via GSTN offline utility, or file on the portal. Live GSTR APIs require a licensed GSP — MyCA is not a GSP.',
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
    return {
      env: 'sandbox',
      clientId: '',
      clientSecret: '',
      username: '',
      password: '',
      gstin: '',
      publicKeyPem: '',
    };
  }
  return { env: 'sandbox', ...JSON.parse(readFileSync(p, 'utf8')) };
}

export function saveGovtConfig(patch) {
  const next = { ...loadGovtConfig(), ...patch };
  mkdirSync(mycaDir(), { recursive: true });
  writeFileSync(govtConfigPath(), JSON.stringify(next, null, 2));
  return publicGovtConfig(next);
}

export function publicGovtConfig(cfg = loadGovtConfig()) {
  return {
    env: cfg.env || 'sandbox',
    gstin: cfg.gstin || '',
    username: cfg.username || '',
    clientIdSet: Boolean(cfg.clientId),
    passwordSet: Boolean(cfg.password),
    publicKeySet: Boolean(cfg.publicKeyPem) || existsSync(join(mycaDir(), 'einv-public.pem')),
    guide: GOVT_GUIDE,
    sites: GOVT_SITES,
  };
}

function pemFromDisk() {
  const p = join(mycaDir(), 'einv-public.pem');
  if (existsSync(p)) return readFileSync(p, 'utf8');
  return loadGovtConfig().publicKeyPem || '';
}

export async function probeGovt(fetchFn = fetch) {
  const targets = [
    { id: 'gst.gov.in', url: GOVT_SITES.gstHome },
    { id: 'einvoice1.gst.gov.in', url: GOVT_SITES.einvoicePortal },
    { id: 'einv-apisandbox.nic.in', url: GOVT_SITES.nicSandbox },
    { id: 'NIC auth sandbox', url: GOVT_SITES.nicAuthSandbox },
    { id: 'mca.gov.in', url: GOVT_SITES.mca },
    { id: 'eportal.incometax.gov.in', url: GOVT_SITES.itePortal },
  ];
  const hits = [];
  for (const t of targets) {
    const started = Date.now();
    try {
      const res = await fetchFn(t.url, {
        method: t.url.includes('/auth') ? 'POST' : 'GET',
        headers: { accept: 'application/json, text/html, */*', 'user-agent': 'MyCA/0.1 (local books; GSTN/NIC client)' },
        body: t.url.includes('/auth') ? JSON.stringify({ Data: 'probe' }) : undefined,
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      hits.push({
        id: t.id,
        url: t.url,
        ok: res.status > 0,
        status: res.status,
        ms: Date.now() - started,
      });
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

function rsaEncryptBase64(plainUtf8, pem) {
  const buf = Buffer.from(plainUtf8, 'utf8');
  const enc = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, buf);
  return enc.toString('base64');
}

export function invoiceToNicPayload(company, inv) {
  const dt = String(inv.date || '').split('-');
  const date = dt.length === 3 ? `${dt[2]}/${dt[1]}/${dt[0]}` : inv.date;
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
    DocDtls: { Typ: 'INV', No: String(inv.id).slice(0, 16), Dt: date },
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
  const hashInput = `${company?.gstin || '27AABCN1234F1Z5'}${inv?.id || 'INV-0001'}${inv?.date || '2026-08-05'}${company?.fy || '2026-27'}`;
  const irn = createHash('sha256').update(hashInput).digest('hex');
  const ackNo = '1126' + String(Math.floor(10000000000 + Math.random() * 89999999999));
  const now = new Date();
  const ackDate = now.toISOString().replace('T', ' ').slice(0, 19);
  const qrData = {
    SellerGstin: company?.gstin || '27AABCN1234F1Z5',
    BuyerGstin: inv?.partyGstin || 'URP',
    DocNo: inv?.id || 'INV-0001',
    DocTyp: 'INV',
    DocDt: inv?.date || '2026-08-05',
    TotInvVal: inv?.total || 0,
    ItemCnt: (inv?.lines || []).length || 1,
    MainHsnCode: inv?.lines?.[0]?.hsn || '5208',
    Irn: irn,
  };
  const signedQrCode = Buffer.from(JSON.stringify(qrData)).toString('base64url');
  return {
    irn,
    ackNo,
    ackDate,
    signedQrCode,
    signedInvoice: `mock_jwt_${Buffer.from(JSON.stringify(inv || {})).toString('base64url').slice(0, 40)}.sig`,
  };
}

export async function nicAuthenticate(cfg = loadGovtConfig(), fetchFn = fetch, options = {}) {
  const useMock = Boolean(options.mock || cfg.env === 'mock' || cfg.useMock);
  if (useMock) {
    const mockToken = 'mock_nic_jwt_' + randomBytes(16).toString('hex');
    const sek = randomBytes(32).toString('base64');
    return {
      ok: true,
      status: 200,
      env: 'sandbox (mock)',
      mock: true,
      token: mockToken,
      nic: {
        Status: 1,
        Data: {
          AuthToken: mockToken,
          Sek: sek,
          TokenExpiry: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
        },
      },
      hint: 'NIC Sandbox Mock active. Simulated authentication valid for workflow testing.',
    };
  }
  if (!cfg.clientId || !cfg.username || !cfg.password || !cfg.gstin) {
    return {
      ok: false,
      error: 'MISSING_CREDENTIALS',
      guide: GOVT_GUIDE,
      hint: 'Save client-id, client-secret, API username, password and GSTIN on the Govt tab, or pass { mock: true } to use the NIC sandbox mock.',
    };
  }
  const env = cfg.env === 'production' ? 'production' : 'sandbox';
  const url = env === 'production' ? GOVT_SITES.nicAuthProd : GOVT_SITES.nicAuthSandbox;
  const appKey = randomBytes(32).toString('base64');
  const inner = JSON.stringify({
    UserName: cfg.username,
    Password: cfg.password,
    AppKey: appKey,
    ForceRefreshAccessToken: false,
  });
  const pem = pemFromDisk();
  if (!pem) {
    return {
      ok: false,
      error: 'MISSING_NIC_PUBLIC_KEY',
      guide: GOVT_GUIDE,
      hint: 'NIC requires the RSA public key to encrypt credentials. Download the sandbox .cer from einv-apisandbox.nic.in and save it as %APPDATA%\\MyCA\\einv-public.pem, then retry. MyCA will never transmit credentials unencrypted.',
    };
  }
  const body = { Data: rsaEncryptBase64(inner, pem) };
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'client-id': cfg.clientId,
      'client-secret': cfg.clientSecret || '',
      gstin: cfg.gstin,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 800) }; }
  return {
    ok: res.ok && Number(parsed.Status) === 1,
    status: res.status,
    url,
    env,
    encrypted: true,
    nic: parsed,
    hint: 'If Status is 0, check username/password/GSTIN on the e-invoice portal.',
  };
}

export async function nicGenerateIrn(state, invoiceId, fetchFn = fetch, options = {}) {
  const inv = (state.invoices || []).find((i) => i.id === invoiceId);
  if (!inv) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  const cfg = loadGovtConfig();
  const useMock = Boolean(options.mock || cfg.env === 'mock' || cfg.useMock);

  if (useMock) {
    const mockData = generateMockIrnPayload(state.company, inv);
    inv.irn = mockData.irn;
    inv.ackNo = mockData.ackNo;
    inv.ackDate = mockData.ackDate;
    inv.signedQrCode = mockData.signedQrCode;
    const payload = invoiceToNicPayload(state.company, inv);
    return {
      ok: true,
      status: 200,
      env: 'sandbox (mock)',
      mock: true,
      irn: mockData.irn,
      ackNo: mockData.ackNo,
      ackDate: mockData.ackDate,
      signedQrCode: mockData.signedQrCode,
      payload,
      nic: {
        Status: 1,
        Data: {
          Irn: mockData.irn,
          AckNo: mockData.ackNo,
          AckDt: mockData.ackDate,
          SignedQRCode: mockData.signedQrCode,
          SignedInvoice: mockData.signedInvoice,
          Status: 'ACT',
        },
      },
      authOk: true,
    };
  }

  const auth = await nicAuthenticate(cfg, fetchFn, options);
  if (!auth.ok) {
    if (options.allowFallback) {
      return nicGenerateIrn(state, invoiceId, fetchFn, { ...options, mock: true });
    }
    return { ok: false, error: 'AUTH_FAILED', auth };
  }
  const env = cfg.env === 'production' ? 'production' : 'sandbox';
  const url = env === 'production' ? GOVT_SITES.nicIrnProd : GOVT_SITES.nicIrnSandbox;
  const payload = invoiceToNicPayload(state.company, inv);
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'client-id': cfg.clientId,
      'client-secret': cfg.clientSecret || '',
      gstin: cfg.gstin,
      'auth-token': auth.nic?.Data?.AuthToken || auth.nic?.authToken || '',
    },
    body: JSON.stringify({ Data: payload }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 1200) }; }
  const ok = res.ok && Number(parsed.Status) === 1;
  if (ok && parsed.Data?.Irn) {
    inv.irn = parsed.Data.Irn;
    inv.ackNo = parsed.Data.AckNo;
    inv.ackDate = parsed.Data.AckDt;
  }
  return { ok, status: res.status, url, payload, nic: parsed, authOk: true };
}

export function migrateLegacyBooks() {
  const neu = join(mycaDir(), 'state.json');
  const home = process.env.APPDATA || process.env.HOME || process.cwd();
  const old = join(home, 'Bahikhata', 'state.json');
  mkdirSync(mycaDir(), { recursive: true });
  if (!existsSync(neu) && existsSync(old)) copyFileSync(old, neu);
  return neu;
}
