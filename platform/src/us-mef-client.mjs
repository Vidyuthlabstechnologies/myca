import { createHash, createSign, randomUUID, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { productionCallsEnabled } from './runtime-config.mjs';
import { irsMefSettings, irsMefMissing } from './us-mef-settings.mjs';
import { htmlEscape } from './text-safe.mjs';

export { irsMefSettings, irsMefMissing, MEF_HOSTS } from './us-mef-settings.mjs';

const NS = {
  soap: 'http://schemas.xmlsoap.org/soap/envelope/',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  mef: 'http://www.irs.gov/a2a/mef/MeFHeader.xsd',
  msi: 'http://www.irs.gov/a2a/mef/MeFMSIServices.xsd',
  trans: 'http://www.irs.gov/a2a/mef/MeFTransmitterServiceWse.xsd',
};

function c14nTimestamp(id, created, expires) {
  return `<wsu:Timestamp xmlns:wsu="${NS.wsu}" wsu:Id="${id}"><wsu:Created>${created}</wsu:Created><wsu:Expires>${expires}</wsu:Expires></wsu:Timestamp>`;
}

function c14nBody(id, inner) {
  return `<soap:Body xmlns:soap="${NS.soap}" xmlns:wsu="${NS.wsu}" wsu:Id="${id}">${inner}</soap:Body>`;
}

function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

function reference(id, canonical) {
  return `<ds:Reference URI="#${id}"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${digest(canonical)}</ds:DigestValue></ds:Reference>`;
}

export function mefHeader({ etin, appSysId, action, messageId, timestamp, testIndicator }) {
  return `<MeFHeader xmlns="${NS.mef}"><MessageID>${htmlEscape(messageId)}</MessageID><Action>${htmlEscape(action)}</Action><MessageTs>${htmlEscape(timestamp)}</MessageTs><ETIN>${htmlEscape(etin)}</ETIN><SessionKeyCd>Y</SessionKeyCd><TestCd>${testIndicator ? 'T' : 'P'}</TestCd><AppSysID>${htmlEscape(appSysId)}</AppSysID><WSDLVersionNum>10.4</WSDLVersionNum><ClientSoftwareTxt>MyCA</ClientSoftwareTxt></MeFHeader>`;
}

export function signedEnvelope({ header, bodyInner, certPem, keyPem, now = new Date() }) {
  const created = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const expires = new Date(now.getTime() + 5 * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tsId = `TS-${randomUUID()}`;
  const bodyId = `Body-${randomUUID()}`;
  const tokenId = `X509-${randomUUID()}`;
  const timestamp = c14nTimestamp(tsId, created, expires);
  const body = c14nBody(bodyId, bodyInner);
  const signedInfo = `<ds:SignedInfo xmlns:ds="${NS.ds}"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>${reference(tsId, timestamp)}${reference(bodyId, body)}</ds:SignedInfo>`;
  const signer = createSign('RSA-SHA256');
  signer.update(signedInfo, 'utf8');
  const signatureValue = signer.sign(keyPem, 'base64');
  const der = new X509Certificate(certPem).raw.toString('base64');
  const security = `<wsse:Security xmlns:wsse="${NS.wsse}" soap:mustUnderstand="1"><wsse:BinarySecurityToken xmlns:wsu="${NS.wsu}" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3" wsu:Id="${tokenId}">${der}</wsse:BinarySecurityToken>${timestamp}<ds:Signature xmlns:ds="${NS.ds}">${signedInfo}<ds:SignatureValue>${signatureValue}</ds:SignatureValue><ds:KeyInfo><wsse:SecurityTokenReference><wsse:Reference URI="#${tokenId}" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"></wsse:Reference></wsse:SecurityTokenReference></ds:KeyInfo></ds:Signature></wsse:Security>`;
  return `<soap:Envelope xmlns:soap="${NS.soap}"><soap:Header>${header}${security}</soap:Header>${body}</soap:Envelope>`;
}

function mtomBody(envelope, attachment) {
  const boundary = `MIMEBoundary_${randomUUID().replace(/-/g, '')}`;
  const start = '<root.message@myca>';
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/xop+xml; charset=UTF-8; type="text/xml"\r\nContent-Transfer-Encoding: 8bit\r\nContent-ID: ${start}\r\n\r\n${envelope}\r\n`),
  ];
  if (attachment) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\nContent-ID: <${attachment.cid}>\r\n\r\n`), attachment.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/related; type="application/xop+xml"; start="${start}"; start-info="text/xml"; boundary="${boundary}"` };
}

function between(text, name) {
  const m = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(text);
  return m ? m[1] : '';
}

function all(text, name) {
  return [...text.matchAll(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g'))].map((m) => m[1]);
}

export function parseAcknowledgements(xml) {
  return all(String(xml || ''), 'Acknowledgement').map((ack) => ({
    submissionId: between(ack, 'SubmissionId'),
    status: between(ack, 'AcceptanceStatusTxt') || between(ack, 'SubmissionStatusTxt'),
    statusDate: between(ack, 'StatusDt'),
    taxYear: Number(between(ack, 'TaxYr')) || null,
    errors: all(ack, 'ValidationErrorGrp').map((grp) => ({
      ruleNumber: between(grp, 'RuleNum'),
      severity: between(grp, 'SeverityCd'),
      message: between(grp, 'ErrorMessageTxt'),
      xpath: between(grp, 'XpathContent'),
    })),
  }));
}

export class IrsMefClient {
  constructor({ settings = irsMefSettings(), fetchFn = globalThis.fetch } = {}) {
    this.settings = settings;
    this.fetchFn = fetchFn;
    this.cookie = '';
  }

  isConfigured() {
    return irsMefMissing(this.settings).length === 0;
  }

  missing() {
    return irsMefMissing(this.settings);
  }

  async call(service, action, bodyInner, attachment) {
    if (!this.isConfigured()) return { ok: false, error: 'IRS_MEF_NOT_CONFIGURED', missing: this.missing() };
    const s = this.settings;
    const header = mefHeader({ etin: s.etin, appSysId: s.appSysId, action, messageId: `${s.etin}${Date.now()}`.slice(0, 20), timestamp: new Date().toISOString(), testIndicator: !productionCallsEnabled() });
    const envelope = signedEnvelope({ header, bodyInner, certPem: readFileSync(s.certPath, 'utf8'), keyPem: readFileSync(s.keyPath, 'utf8') });
    const { body, contentType } = mtomBody(envelope, attachment);
    const res = await this.fetchFn(`${s.baseUrl}/${service}`, { method: 'POST', headers: { 'content-type': contentType, soapaction: action, ...(this.cookie ? { cookie: this.cookie } : {}) }, body });
    const text = await res.text();
    const setCookie = res.headers?.get?.('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const fault = between(text, 'faultstring');
    if (!res.ok || fault) return { ok: false, error: 'IRS_MEF_FAULT', status: res.status, fault: fault.slice(0, 300) };
    return { ok: true, text };
  }

  async login() {
    return this.call('mefmsiservices/ETINService/Login', 'Login', `<LoginRequest xmlns="${NS.msi}"></LoginRequest>`);
  }

  async logout() {
    return this.call('mefmsiservices/ETINService/Logout', 'Logout', `<LogoutRequest xmlns="${NS.msi}"></LogoutRequest>`);
  }

  async sendSubmissions({ zip, submissionIds }) {
    const login = await this.login();
    if (!login.ok) return login;
    const cid = `submissions-${randomUUID()}@myca`;
    const inner = `<SendSubmissionsRequest xmlns="${NS.trans}"><SubmissionDataList><Cnt>${submissionIds.length}</Cnt>${submissionIds.map((id) => `<SubmissionData><SubmissionId>${htmlEscape(id)}</SubmissionId><ElectronicPostmarkTs>${new Date().toISOString()}</ElectronicPostmarkTs></SubmissionData>`).join('')}</SubmissionDataList><SubmissionsZip><xop:Include xmlns:xop="http://www.w3.org/2004/08/xop/include" href="cid:${cid}"></xop:Include></SubmissionsZip></SendSubmissionsRequest>`;
    const sent = await this.call('mefmsiservices/TransmitterService/SendSubmissions', 'SendSubmissions', inner, { cid, data: zip });
    await this.logout();
    if (!sent.ok) return sent;
    return { ok: true, data: { receipts: all(sent.text, 'SubmissionReceiptGrp').map((grp) => ({ submissionId: between(grp, 'SubmissionId'), receivedAt: between(grp, 'SubmissionReceivedTs') })) } };
  }

  async getAcks({ submissionIds }) {
    const login = await this.login();
    if (!login.ok) return login;
    const inner = `<GetAcksRequest xmlns="${NS.trans}"><SubmissionIdList>${submissionIds.map((id) => `<SubmissionId>${htmlEscape(id)}</SubmissionId>`).join('')}</SubmissionIdList></GetAcksRequest>`;
    const got = await this.call('mefmsiservices/TransmitterService/GetAcks', 'GetAcks', inner);
    await this.logout();
    if (!got.ok) return got;
    return { ok: true, data: { acks: parseAcknowledgements(got.text) } };
  }
}

let current = null;

export function getIrsMefClient() {
  if (!current) current = new IrsMefClient();
  return current;
}

export function setIrsMefClient(client) {
  current = client;
}
