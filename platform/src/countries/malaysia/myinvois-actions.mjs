import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performExternalAction } from '../../action-gate.mjs';
import { appendAuditEvent } from '../../ca-api.mjs';
import { loadEnvFile, providerEnvironment } from '../../runtime-config.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { submissionEntry } from './myinvois-document.mjs';
import { signMyInvoisDocument } from './myinvois-sign.mjs';
import { submitMyInvoisDocuments, myInvoisSubmission, cancelMyInvoisDocument, validateMyTin, myInvoisShareLink } from './myinvois-client.mjs';

const UID = /^[A-Z0-9]{26}$/;

function setting(name) {
  const env = loadEnvFile();
  return String(process.env[name] ?? env[name] ?? '').trim();
}

function actorOf(args) {
  return { userId: String(args.actorId || 'owner'), role: String(args.role || '') };
}

function mockUid(seed) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const hash = createHash('sha256').update(String(seed)).digest();
  return Array.from({ length: 26 }, (_, index) => alphabet[hash[index] % 32]).join('');
}

export function myInvoisConfig(transport) {
  return {
    environment: providerEnvironment(),
    clientId: setting('MYCA_MYINVOIS_CLIENT_ID'),
    clientSecret: setting('MYCA_MYINVOIS_CLIENT_SECRET'),
    onBehalfOf: setting('MYCA_MYINVOIS_ON_BEHALF_OF'),
    transport,
  };
}

function signingMaterial() {
  const certPath = setting('MYCA_MYINVOIS_CERT_PATH');
  const keyPath = setting('MYCA_MYINVOIS_KEY_PATH');
  if (!certPath || !keyPath) return null;
  return { certificatePem: readFileSync(certPath, 'utf8'), privateKeyPem: readFileSync(keyPath, 'utf8'), passphrase: setting('MYCA_MYINVOIS_KEY_PASSPHRASE') || undefined };
}

function einvoices(state) {
  return openCountrySlice(state, 'myEinvoices', () => ({ byNumber: {} }));
}

export async function submitMyInvois(state, args) {
  const number = String(args.number);
  const existing = countrySlice(state, 'myEinvoices').byNumber?.[number];
  if (existing && existing.status !== 'rejected' && existing.status !== 'cancelled') return { ok: false, error: 'EINVOICE_ALREADY_SENT', number, uuid: existing.uuid, status: existing.status };
  const material = signingMaterial();
  let document = args.document;
  if (material) {
    const signed = signMyInvoisDocument(document, material);
    if (!signed.ok) return signed;
    document = signed.document;
  } else if (providerEnvironment() !== 'off') {
    return { ok: false, error: 'SIGNING_CERTIFICATE_MISSING', settings: ['MYCA_MYINVOIS_CERT_PATH', 'MYCA_MYINVOIS_KEY_PATH'], hint: 'MyInvois v1.1 needs a digital certificate from a Malaysian certification authority such as MSC Trustgate or Pos Digicert.' };
  }
  const entry = submissionEntry(document, number);
  const out = await performExternalAction(state, {
    actionId: 'myinvois_submit',
    clientId: String(state.activeClientId || 'SELF'),
    params: { number, documentHash: entry.documentHash, payable: args.totals.payable },
    actor: actorOf(args),
    approvalId: args.approvalId,
    metadata: { number },
    fixture: () => ({ ok: true, mock: true, data: { submissionUid: mockUid(`s${entry.documentHash}`), acceptedDocuments: [{ uuid: mockUid(entry.documentHash), invoiceCodeNumber: number }], rejectedDocuments: [] } }),
  }, async (transports) => submitMyInvoisDocuments(myInvoisConfig(transports.https.request), { documents: [{ document, codeNumber: number }], approvalId: args.approvalId }));
  if (!out.ok) return out;
  const accepted = (out.data.acceptedDocuments || []).find((doc) => doc.invoiceCodeNumber === number);
  const rejected = (out.data.rejectedDocuments || []).find((doc) => doc.invoiceCodeNumber === number);
  const record = {
    number,
    submissionUid: out.data.submissionUid,
    uuid: accepted ? accepted.uuid : '',
    status: accepted ? 'submitted' : 'rejected',
    error: rejected ? rejected.error : null,
    documentHash: entry.documentHash,
    totals: args.totals,
    environment: out.mock ? 'mock' : providerEnvironment(),
    at: new Date().toISOString(),
  };
  einvoices(state).byNumber[number] = record;
  appendAuditEvent(state, { action: 'my_einvoice_submitted', actorId: actorOf(args).userId, metadata: { number, uuid: record.uuid, submissionUid: record.submissionUid, status: record.status } });
  return { ok: Boolean(accepted), ...(accepted ? {} : { error: 'EINVOICE_REJECTED', lhdn: rejected ? rejected.error : null }), mock: Boolean(out.mock), data: record, hint: 'LHDN validates asynchronously; ask my_einvoice_status with the submission UID.' };
}

export async function readMyInvoisSubmission(state, args) {
  const submissionUid = String(args.submissionUid || '').trim();
  if (!UID.test(submissionUid)) return { ok: false, error: 'BAD_SUBMISSION_UID' };
  const out = await performExternalAction(state, {
    actionId: 'myinvois_status',
    clientId: String(state.activeClientId || 'SELF'),
    params: { submissionUid },
    actor: actorOf(args),
    fixture: () => ({ ok: true, mock: true, data: { submissionUid, overallStatus: 'Valid', documentSummary: [] } }),
  }, async (transports) => myInvoisSubmission(myInvoisConfig(transports.https.request), { submissionUid }));
  if (!out.ok) return out;
  const documents = (out.data.documentSummary || []).map((doc) => ({ uuid: doc.uuid, number: doc.internalId, status: doc.status, longId: doc.longId || '', link: doc.longId ? myInvoisShareLink(providerEnvironment(), doc.uuid, doc.longId) : '' }));
  const book = einvoices(state).byNumber;
  for (const doc of documents) {
    const record = book[doc.number];
    if (record && record.uuid === doc.uuid && doc.status) {
      record.status = String(doc.status).toLowerCase();
      if (doc.link) record.link = doc.link;
    }
  }
  return { ok: true, mock: Boolean(out.mock), data: { submissionUid, overallStatus: out.data.overallStatus, documents } };
}

export async function cancelMyInvois(state, args) {
  const uuid = String(args.uuid || '').trim();
  const reason = String(args.reason || '').trim();
  if (!UID.test(uuid)) return { ok: false, error: 'BAD_DOCUMENT_UUID' };
  if (!reason) return { ok: false, error: 'CANCEL_REASON_REQUIRED' };
  const out = await performExternalAction(state, {
    actionId: 'myinvois_cancel',
    clientId: String(state.activeClientId || 'SELF'),
    params: { uuid, reason },
    actor: actorOf(args),
    approvalId: args.approvalId,
    fixture: () => ({ ok: true, mock: true, data: { uuid, status: 'Cancelled' } }),
  }, async (transports) => cancelMyInvoisDocument(myInvoisConfig(transports.https.request), { uuid, reason, approvalId: args.approvalId }));
  if (!out.ok) return out;
  const record = Object.values(einvoices(state).byNumber).find((row) => row.uuid === uuid);
  if (record) record.status = 'cancelled';
  appendAuditEvent(state, { action: 'my_einvoice_cancelled', actorId: actorOf(args).userId, metadata: { uuid, reason } });
  return { ok: true, mock: Boolean(out.mock), data: { uuid, status: 'cancelled' } };
}

export async function checkMyTin(state, args) {
  const tin = String(args.tin).trim().toUpperCase();
  const out = await performExternalAction(state, {
    actionId: 'myinvois_tin_validate',
    clientId: String(state.activeClientId || 'SELF'),
    params: { tin, idType: String(args.idType || 'BRN') },
    actor: actorOf(args),
    fixture: () => ({ ok: true, mock: true, data: { tin, valid: true } }),
  }, async (transports) => validateMyTin(myInvoisConfig(transports.https.request), args));
  if (!out.ok) return out;
  return { ok: true, mock: Boolean(out.mock), data: { tin, format: true, lhdn: out.data.valid ? 'valid' : 'not found' } };
}
