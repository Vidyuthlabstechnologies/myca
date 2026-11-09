import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { loadGovtConfig, pemFromDisk, rsaEncryptBase64, GOVT_GUIDE, invoiceToNicPayload, generateMockIrnPayload, nicCancelProblem, nicPartyFor, nicPayloadRefusal } from './nic-config.mjs';
import { liveCallsEnabled, mockModeEnabled, testModeEnabled } from './runtime-config.mjs';

export { rsaEncryptBase64 };

export const IRP_HOSTS = {
  sandbox: 'https://einv1api.gstsandbox.nic.in',
  sandbox2: 'https://einv2api.gstsandbox.nic.in',
  production: 'https://einvoice1.gst.gov.in',
};

export const IRP_PATHS = {
  auth: '/eivital/v1.04/auth',
  health: '/eivital/v1.04/heartbeat/ping',
  gstinMaster: (gstin) => `/eivital/v1.04/Master/gstin/${encodeURIComponent(gstin)}`,
  generateIrn: '/eicore/v1.03/Invoice',
  cancelIrn: '/eicore/v1.03/Invoice/Cancel',
  irnByIrn: (irn) => `/eicore/v1.03/Invoice/irn/${encodeURIComponent(irn)}`,
  irnByDoc: (docType, docNo, docDate) =>
    `/eicore/v1.03/Invoice/irnbydocdetails?doctype=${encodeURIComponent(docType)}&docnum=${encodeURIComponent(docNo)}&docdate=${encodeURIComponent(docDate)}`,
  rejectedIrns: (date) => `/eicore/v1.03/Invoice/rejectedirns?date=${encodeURIComponent(date)}`,
  generateEwb: '/eiewb/v1.03/ewaybill',
  ewbByIrn: (irn) => `/eiewb/v1.03/ewaybill/irn/${encodeURIComponent(irn)}`,
};

function nicEnvironment(cfg) {
  if (testModeEnabled()) return 'sandbox';
  return cfg.env === 'production' ? 'production' : 'sandbox';
}

function hostFor(cfg, options = {}) {
  const env = nicEnvironment(cfg);
  if (options.irp === 'NIC2') return IRP_HOSTS.sandbox2;
  return env === 'production' ? IRP_HOSTS.production : IRP_HOSTS.sandbox;
}

function deadline(options, ms) {
  const timeout = AbortSignal.timeout(ms);
  return options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

export function sessionKey(sek, appKey) {
  const raw = Buffer.from(String(sek || ''), 'base64');
  if (raw.length === 32) return raw.toString('base64');
  const key = Buffer.from(String(appKey || ''), 'base64');
  if (key.length !== 32 || raw.length === 0 || raw.length % 16 !== 0) throw new Error('INVALID_SEK');
  const decipher = createDecipheriv('aes-256-ecb', key, null);
  const plain = Buffer.concat([decipher.update(raw), decipher.final()]);
  if (plain.length !== 32) throw new Error('INVALID_SEK');
  return plain.toString('base64');
}

function rsaEncrypt(plainUtf8, pem) {
  return rsaEncryptBase64(plainUtf8, pem);
}

// NIC core/eWB payloads are AES-256-ECB/PKCS7 encrypted with the session Sek
// (a base64 32-byte key returned by authentication).
export function encryptPayload(obj, sek) {
  const key = Buffer.from(String(sek || ''), 'base64');
  if (key.length !== 32) throw new Error('INVALID_SEK');
  const cipher = createCipheriv('aes-256-ecb', key, null);
  return Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]).toString('base64');
}

export function decryptPayload(base64Data, sek) {
  const key = Buffer.from(String(sek || ''), 'base64');
  if (key.length !== 32) throw new Error('INVALID_SEK');
  const decipher = createDecipheriv('aes-256-ecb', key, null);
  const plain = Buffer.concat([decipher.update(Buffer.from(String(base64Data), 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function headers(cfg, authToken, extra = {}) {
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret || '',
    Gstin: cfg.gstin,
    user_name: cfg.username || '',
    ...(authToken ? { AuthToken: authToken } : {}),
    ...extra,
  };
}

const NO_SESSION = Object.freeze({ env: '', token: '', sek: '', expiresAt: 0 });
const MAX_SESSIONS = 256;
const sessions = new Map();

function envOf(cfg) {
  return cfg?.env === 'production' ? 'production' : 'sandbox';
}

// An IRP session belongs to the taxpayer whose credentials opened it. Holding one
// per set of credentials means no other GSTIN can ever be sent under it.
export function nicSessionKey(cfg = {}) {
  return createHash('sha256')
    .update([envOf(cfg), cfg.clientId, cfg.username, cfg.gstin].map((part) => String(part ?? '').trim()).join('\n'))
    .digest('hex');
}

function sessionFor(cfg) {
  return sessions.get(nicSessionKey(cfg)) || NO_SESSION;
}

function rememberSession(cfg, session) {
  const key = nicSessionKey(cfg);
  sessions.delete(key);
  sessions.set(key, session);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
}

export function clearNicSession() {
  sessions.clear();
}

export function nicSession(cfg = loadGovtConfig()) {
  const session = sessionFor(cfg);
  return { active: Boolean(session.token) && session.expiresAt > Date.now(), env: session.env, expiresAt: session.expiresAt };
}

async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1200) }; }
}

export async function nicAuthenticate(cfg = loadGovtConfig(), fetchFn = fetch, options = {}) {
  const useMock = options.mock === false ? false : Boolean(options.mock || cfg.env === 'mock' || cfg.useMock || mockModeEnabled());
  if (useMock) {
    const token = 'mock_nic_jwt_' + randomBytes(16).toString('hex');
    const sek = randomBytes(32).toString('base64');
    return {
      ok: true,
      status: 200,
      env: 'sandbox (mock)',
      mock: true,
      token,
      sek,
      nic: { Status: 1, Data: { AuthToken: token, Sek: sek, TokenExpiry: new Date(Date.now() + 6 * 3600 * 1000).toISOString() } },
      hint: 'NIC sandbox mock active. Simulated authentication for workflow testing.',
    };
  }
  if (!cfg.clientId || !cfg.username || !cfg.password || !cfg.gstin) {
    return {
      ok: false,
      error: 'MISSING_CREDENTIALS',
      guide: GOVT_GUIDE,
      hint: 'Save client-id, client-secret, API username, password and GSTIN on the Govt tab, or pass { mock: true } to use the mock.',
    };
  }
  const pem = pemFromDisk();
  if (!pem) {
    return {
      ok: false,
      error: 'MISSING_NIC_PUBLIC_KEY',
      guide: GOVT_GUIDE,
      hint: 'NIC requires its RSA public key to encrypt credentials. Download the .cer and load it on the Govt tab. MyCA never transmits credentials unencrypted.',
    };
  }
  const env = nicEnvironment(cfg);
  const url = `${hostFor(cfg, options)}${IRP_PATHS.auth}`;
  const appKey = randomBytes(32).toString('base64');
  const inner = JSON.stringify({
    UserName: cfg.username,
    Password: cfg.password,
    AppKey: appKey,
    ForceRefreshAccessToken: Boolean(options.force),
  });
  const res = await fetchFn(url, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ Data: rsaEncryptBase64(inner, pem) }),
    signal: deadline(options, 15000),
  });
  const parsed = await readJson(res);
  const data = parsed?.Data || {};
  let sek = '';
  const ok = res.ok && Number(parsed?.Status) === 1 && Boolean(data.AuthToken);
  if (ok) {
    try {
      sek = sessionKey(data.Sek, appKey);
    } catch {
      return { ok: false, error: 'INVALID_SEK', status: res.status, url, env };
    }
    rememberSession(cfg, {
      env,
      token: data.AuthToken,
      sek,
      expiresAt: data.TokenExpiry ? Date.parse(data.TokenExpiry) || (Date.now() + 60 * 60 * 1000) : Date.now() + 60 * 60 * 1000,
    });
  }
  return {
    ok,
    status: res.status,
    url,
    env,
    encrypted: true,
    token: data.AuthToken || '',
    sek,
    nic: parsed,
    hint: ok ? 'Authenticated.' : 'If Status is 0, check the API user/password, GSTIN and client credentials.',
  };
}

async function call(cfg, fetchFn, options, { method = 'POST', path, body, needsAuth = true, timeout = 20000 }) {
  const mock = options.mock === false ? false : Boolean(options.mock || cfg.env === 'mock' || cfg.useMock || mockModeEnabled());
  if (mock) {
    const data = mockCallData(method, path, body);
    const irn = extractIrn(path, body);
    return {
      ok: true,
      status: 200,
      url: `${hostFor(cfg, options)}${path}`,
      data,
      irn,
      mock: true,
      nic: { Status: 1, Data: data },
      hint: 'NIC sandbox mock active. Simulated response — nothing reached the IRP.',
    };
  }
  if (!liveCallsEnabled() && !options.allowLive) {
    return { ok: false, error: 'LIVE_CALLS_DISABLED', hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 to call the NIC IRP.' };
  }
  const session = sessionFor(cfg);
  let token = session.token;
  let sek = session.sek;
  if (needsAuth && (!token || session.expiresAt <= Date.now() || session.env !== envOf(cfg))) {
    const auth = await nicAuthenticate(cfg, fetchFn, options);
    if (!auth.ok) return { ok: false, error: 'AUTH_FAILED', auth };
    token = auth.token;
    sek = auth.sek;
  }
  const url = `${hostFor(cfg, options)}${path}`;
  const res = await fetchFn(url, {
    method,
    headers: headers(cfg, needsAuth ? token : ''),
    body: body === undefined ? undefined : JSON.stringify({ Data: encryptPayload(body, sek) }),
    signal: deadline(options, timeout),
  });
  const parsed = await readJson(res);
  const ok = res.ok && Number(parsed?.Status) === 1;
  let data = null;
  if (ok && parsed.Data) {
    try {
      data = decryptPayload(parsed.Data, sek);
    } catch {
      return { ok: false, error: 'DECRYPT_FAILED', status: res.status, url, errorDetails: null };
    }
  }
  return { ok, status: res.status, url, data, errorDetails: parsed?.ErrorDetails || null, nic: parsed };
}

export async function nicHealth(cfg = loadGovtConfig(), fetchFn = fetch, options = {}) {
  const url = `${hostFor(cfg, options)}${IRP_PATHS.health}`;
  try {
    const res = await fetchFn(url, { method: 'GET', headers: { accept: 'text/plain, application/json' }, signal: deadline(options, 10000) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url, heartbeat: text.slice(0, 200) };
  } catch (err) {
    return { ok: false, url, error: String(err.message || err) };
  }
}

export async function nicGstinMaster(gstin, cfgOrFetch = loadGovtConfig(), fetchFn = fetch, options = {}) {
  const cfg = typeof cfgOrFetch === 'function' ? loadGovtConfig() : cfgOrFetch;
  const fn = typeof cfgOrFetch === 'function' ? cfgOrFetch : fetchFn;
  return call(cfg, fn, options, { method: 'GET', path: IRP_PATHS.gstinMaster(gstin) });
}

export async function nicGenerateIrn(state, invoiceId, fetchFn = fetch, options = {}) {
  const inv = [...(state.invoices || []), ...(state.creditNotes || []), ...(state.debitNotes || [])].find((i) => i.id === invoiceId);
  if (!inv) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  const cfg = loadGovtConfig();
  const useMock = options.mock === false ? false : Boolean(options.mock || cfg.env === 'mock' || cfg.useMock || mockModeEnabled());

  if (useMock) {
    const mockData = generateMockIrnPayload(state.company, inv);
    inv.mockIrn = mockData.irn;
    inv.mockAckNo = mockData.ackNo;
    inv.mockAckDate = mockData.ackDate;
    inv.mockSignedQrCode = mockData.signedQrCode;
    return {
      ok: true,
      status: 200,
      env: 'sandbox (mock)',
      mock: true,
      irn: mockData.irn,
      ackNo: mockData.ackNo,
      ackDate: mockData.ackDate,
      signedQrCode: mockData.signedQrCode,
      payload: invoiceToNicPayload(state.company, inv, nicPartyFor(state, inv)),
      nic: { Status: 1, Data: { Irn: mockData.irn, AckNo: mockData.ackNo, AckDt: mockData.ackDate, SignedQRCode: mockData.signedQrCode, SignedInvoice: mockData.signedInvoice, Status: 'ACT' } },
      authOk: true,
    };
  }

  const refused = nicPayloadRefusal(state, inv);
  if (refused) return refused;
  const payload = invoiceToNicPayload(state.company, inv, nicPartyFor(state, inv));
  const res = await call(cfg, fetchFn, options, { path: IRP_PATHS.generateIrn, body: payload });
  if (!res.ok) {
    return { ok: false, error: res.error || 'IRN_FAILED', status: res.status, payload, nic: res.nic, authOk: true };
  }
  const d = res.data || {};
  const sandbox = nicEnvironment(cfg) === 'sandbox';
  const prefix = sandbox ? 'sandbox' : '';
  const field = (name) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  inv[field('irn')] = d.Irn || inv[field('irn')];
  inv[field('ackNo')] = d.AckNo || inv[field('ackNo')];
  inv[field('ackDate')] = d.AckDt || inv[field('ackDate')];
  inv[field('signedQrCode')] = d.SignedQRCode || inv[field('signedQrCode')];
  if (d.EwbNo) inv[field('ewbNo')] = d.EwbNo;
  return { ok: true, sandbox, status: res.status, env: nicEnvironment(cfg), payload, irn: d.Irn, ackNo: d.AckNo, ackDate: d.AckDt, signedQrCode: d.SignedQRCode, status_: d.Status, data: d, nic: res.nic, authOk: true };
}

export async function nicCancelIrn(state, { invoiceId, irn, reason = '1', remark = '' } = {}, fetchFn = fetch, options = {}) {
  const cfg = loadGovtConfig();
  const inv = invoiceId ? (state.invoices || []).find((i) => i.id === invoiceId) : null;
  const targetIrn = irn || inv?.irn || (nicEnvironment(cfg) === 'sandbox' ? inv?.sandboxIrn : '');
  if (!targetIrn) return { ok: false, error: 'IRN_REQUIRED' };
  if (String(reason) < '1' || String(reason) > '4') return { ok: false, error: 'INVALID_CANCEL_REASON', hint: 'CnlRsn must be 1-4.' };
  const late = inv ? nicCancelProblem(inv) : null;
  if (late) return { ok: false, error: late.code, irn: targetIrn, hint: late.words };
  const res = await call(cfg, fetchFn, options, { path: IRP_PATHS.cancelIrn, body: { Irn: targetIrn, CnlRsn: String(reason), CnlRem: String(remark || '').slice(0, 100) } });
  if (res.ok && inv) {
    inv.irnStatus = 'CNL';
    inv.cancelledAt = (res.data || {}).CancelDate || new Date().toISOString();
  }
  return { ok: res.ok, status: res.status, irn: targetIrn, cancelDate: res.data?.CancelDate || null, data: res.data, nic: res.nic, error: res.error, mock: res.mock === true ? true : undefined };
}

export async function nicGetIrn(irn, cfgOrFetch = loadGovtConfig(), fetchFn = fetch, options = {}) {
  if (!irn) return { ok: false, error: 'IRN_REQUIRED' };
  const cfg = typeof cfgOrFetch === 'function' ? loadGovtConfig() : cfgOrFetch;
  const fn = typeof cfgOrFetch === 'function' ? cfgOrFetch : fetchFn;
  return call(cfg, fn, options, { method: 'GET', path: IRP_PATHS.irnByIrn(irn) });
}

export async function nicGetIrnByDoc({ docType = 'INV', docNo, docDate } = {}, cfgOrFetch = loadGovtConfig(), fetchFn = fetch, options = {}) {
  if (!docNo || !docDate) return { ok: false, error: 'DOC_NO_AND_DATE_REQUIRED' };
  const cfg = typeof cfgOrFetch === 'function' ? loadGovtConfig() : cfgOrFetch;
  const fn = typeof cfgOrFetch === 'function' ? cfgOrFetch : fetchFn;
  return call(cfg, fn, options, { method: 'GET', path: IRP_PATHS.irnByDoc(docType, docNo, docDate) });
}

export async function nicGetRejectedIrns(date, cfgOrFetch = loadGovtConfig(), fetchFn = fetch, options = {}) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(date || ''))) return { ok: false, error: 'DATE_REQUIRED', hint: 'Pass date as dd/mm/yyyy.' };
  const cfg = typeof cfgOrFetch === 'function' ? loadGovtConfig() : cfgOrFetch;
  const fn = typeof cfgOrFetch === 'function' ? cfgOrFetch : fetchFn;
  return call(cfg, fn, options, { method: 'GET', path: IRP_PATHS.rejectedIrns(date) });
}

export async function nicGenerateEwayBill(payload, cfgOrFetch = loadGovtConfig(), fetchFn = fetch, options = {}) {
  if (!payload || !payload.Irn) return { ok: false, error: 'IRN_REQUIRED', hint: 'Pass { Irn, TransId, TransName, TransMode, Distance, VehNo, VehType, ... }.' };
  const cfg = typeof cfgOrFetch === 'function' ? loadGovtConfig() : cfgOrFetch;
  const fn = typeof cfgOrFetch === 'function' ? cfgOrFetch : fetchFn;
  return call(cfg, fn, options, { path: IRP_PATHS.generateEwb, body: payload });
}

export async function nicGetEwayBill(irn, cfgOrFetch = loadGovtConfig(), fetchFn = fetch, options = {}) {
  if (!irn) return { ok: false, error: 'IRN_REQUIRED' };
  const cfg = typeof cfgOrFetch === 'function' ? loadGovtConfig() : cfgOrFetch;
  const fn = typeof cfgOrFetch === 'function' ? cfgOrFetch : fetchFn;
  return call(cfg, fn, options, { method: 'GET', path: IRP_PATHS.ewbByIrn(irn) });
}

export async function nicCancelEwayBill({ ewbNo, reason = '1', remark = '' } = {}, fetchFn = fetch, options = {}) {
  if (!ewbNo) return { ok: false, error: 'EWB_NO_REQUIRED', hint: 'Cancelling an e-Way Bill uses the separate e-Way Bill System (api.ewaybillgst.gov.in), not the IRP. Wire it once EWB credentials exist.' };
  return { ok: false, error: 'EWB_CANCEL_VIA_EWB_SYSTEM', ewbNo, reason, remark };
}

function extractIrn(path, body) {
  if (body?.Irn) return body.Irn;
  const m = String(path || '').match(/\/irn\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Deterministic canned IRP responses for mock mode.
function mockCallData(method, path, body) {
  if (path === IRP_PATHS.generateEwb) {
    return { Irn: body?.Irn || 'MOCKIRN', EwbNo: '271020000012345', EwbDt: '20/09/2026', Validity: '24/09/2026' };
  }
  if (path === IRP_PATHS.cancelIrn) {
    return { Irn: body?.Irn || '', CancelDate: '20/09/2026 13:00:00', Status: 'CNL' };
  }
  if (path.includes('/irnbyirn') || /\/(Invoice|ewaybill)\/irn\//.test(path)) {
    const irn = extractIrn(path, body);
    return { Irn: irn, AckNo: `MOCK-ACK-${irn.slice(-6)}`, AckDt: '20/09/2026 12:00:00', SignedInvoice: `mock_jwt_${irn}.sig`, Status: 'ACT' };
  }
  if (path.includes('irnbydocdetails')) {
    return { Irn: 'MOCKIRNDOC123456789X', AckNo: 'MOCK-ACK-DOC', AckDt: '20/09/2026 12:00:00', Status: 'ACT' };
  }
  if (path.includes('rejectedirns')) {
    return { Irn: [], Irns: [] };
  }
  if (path.includes('/Master/gstin/')) {
    return { LglNm: 'Nalanda Textiles Private Limited', StjCd: '27', Stj: 'Maharashtra', Ctu: 'IN', CtuNm: 'India' };
  }
  return { Irn: 'MOCKIRN000000000000X', AckNo: 'MOCK-ACK-000001', AckDt: '20/09/2026 12:00:00', Status: 'ACT' };
}

export { generateMockIrnPayload };
