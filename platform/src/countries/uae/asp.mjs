import { createHash } from 'node:crypto';
import { appendAuditEvent } from '../../ca-api.mjs';
import { mockModeEnabled, providerEnvironment } from '../../runtime-config.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { fail } from './common.mjs';

export function aspMode() {
  if (mockModeEnabled()) return 'sandbox';
  return providerEnvironment() === 'live' ? 'live' : 'sandbox';
}

function sandboxUuid(hash) {
  const hex = hash.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function issuedEinvoices(state) {
  const slice = countrySlice(state, 'aeEinvoices');
  return slice && slice.byNumber ? Object.values(slice.byNumber) : [];
}

export function sendThroughAsp(state, { document, xml, totals, actorId = 'owner' }) {
  const mode = aspMode();
  if (mode === 'live') return fail('ASP_NOT_CONTRACTED', { hint: 'No Accredited Service Provider is connected yet, so live e-invoices cannot be sent. Sandbox mode (MYCA_PROVIDER_ENV=test or MYCA_MOCK_MODE=1) checks and records them without sending.' });
  const slice = openCountrySlice(state, 'aeEinvoices', () => ({ byNumber: {} }));
  if (!slice.byNumber) slice.byNumber = {};
  const key = `${document.type}:${document.number}`;
  const existing = slice.byNumber[key];
  const hash = createHash('sha256').update(xml).digest('hex');
  if (existing) {
    if (existing.hash === hash) return { ok: true, sandbox: true, duplicate: true, data: existing };
    return fail('EINVOICE_NUMBER_USED', { number: document.number, hint: 'This number was already issued with different content. Use a new number, or a credit note to correct it.' });
  }
  const record = {
    number: document.number, type: document.type, typeCode: document.typeCode, issueDate: document.issueDate, buyerEndpoint: document.buyerEndpoint,
    uuid: sandboxUuid(hash), hash, totals, status: 'sandbox-reported', mode, sentAt: new Date().toISOString(),
  };
  slice.byNumber[key] = record;
  appendAuditEvent(state, { action: 'ae_einvoice_issued', actorId, metadata: { number: record.number, type: record.type, uuid: record.uuid, mode, payable: totals.payable, currency: totals.currency } });
  return { ok: true, sandbox: true, data: record, hint: 'Sandbox: checked against PINT AE and recorded, not sent to an Accredited Service Provider or the FTA.' };
}
