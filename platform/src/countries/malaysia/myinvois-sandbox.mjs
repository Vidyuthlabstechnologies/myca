import { createHash, X509Certificate, verify } from 'node:crypto';
import { rules } from '../../sprint-load.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { hasCode, codeName } from './lhdn-codes.mjs';
import { unsignedCopy } from './myinvois-sign.mjs';

export const MYINVOIS_SANDBOX_CLIENT = Object.freeze({ clientId: 'myca-sandbox', clientSecret: 'myca-sandbox' });
export const MYINVOIS_SANDBOX_PORTAL = 'https://preprod.myinvois.hasil.gov.my';
export const MYINVOIS_SANDBOX_VALIDATION_MS = 2000;

const SLICE = 'myInvoisSandbox';
const TOKEN_KEY = 'myca-myinvois-sandbox-token-v1';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LONG_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const UID = /^[A-Z0-9]{26}$/;
const TIN = /^(?:IG\d{9,11}|(?:C|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|J|LE)\d{8,12}|EI\d{11})$/;
const SPECIAL = new Set(['EI00000000010', 'EI00000000020', 'EI00000000030', 'EI00000000040']);
const ADJUSTMENT_TYPES = new Set(['02', '03', '04', '12', '13', '14']);
const SELF_BILLED = new Set(['11', '12', '13', '14']);
const TYPE_NAMES = { '01': 'Invoice', '02': 'Credit Note', '03': 'Debit Note', '04': 'Refund Note', 11: 'Self-billed Invoice', 12: 'Self-billed Credit Note', 13: 'Self-billed Debit Note', 14: 'Self-billed Refund Note' };
const MAX_KEPT_DOCUMENTS = 2000;
const RECENT_DAYS = 31;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;

let clock = () => Date.now();

export function setMyInvoisSandboxClock(fn) {
  clock = typeof fn === 'function' ? fn : () => Date.now();
}

function workflow(atMs) {
  const found = rules.rule('my.einvoice.workflow', new Date(atMs).toISOString().slice(0, 10));
  if (found.ok) return found.record.value;
  return rules.rule('my.einvoice.workflow', '2024-08-01').record.value;
}

function sha256(text) {
  return createHash('sha256').update(text).digest();
}

function uid(seed, alphabet = ALPHABET, length = 26) {
  const bytes = Buffer.concat([sha256(`${seed}|a`), sha256(`${seed}|b`)]);
  return Array.from({ length }, (_, index) => alphabet[bytes[index] % alphabet.length]).join('');
}

function iso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function reply(status, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return new Response(text || null, { status, headers: { ...(text ? { 'content-type': 'application/json' } : {}), ...headers } });
}

function lhdnError(errorCode, error, { errorMS = error, propertyName = null, propertyPath = null, target = null, innerError = null } = {}) {
  return { propertyName, propertyPath, errorCode, error, errorMS, target, innerError };
}

function errorReply(status, errorCode, message, extra = {}, headers = {}) {
  return reply(status, { error: lhdnError(errorCode, message, extra) }, headers);
}

function signToken(payload) {
  return createHash('sha256').update(`${TOKEN_KEY}|${payload}`).digest('base64url').slice(0, 43);
}

function issueToken({ clientId, tin, now, seconds }) {
  const payload = Buffer.from(JSON.stringify({ c: clientId, t: tin, e: now + seconds * 1000 })).toString('base64url');
  return `sbx.${payload}.${signToken(payload)}`;
}

function readToken(header, now) {
  const match = String(header || '').match(/^Bearer\s+sbx\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match || signToken(match[1]) !== match[2]) return null;
  try {
    const claims = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    if (!(Number(claims.e) > now)) return null;
    return { clientId: String(claims.c || ''), tin: String(claims.t || '') };
  } catch {
    return null;
  }
}

function header(init, name) {
  const headers = init.headers || {};
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : '';
}

export function sandboxTinRegistered(tin) {
  const text = String(tin || '').toUpperCase();
  if (SPECIAL.has(text)) return true;
  return TIN.test(text) && !/0{6}$/.test(text);
}

function idPlausible(idType, idValue, tin) {
  const value = String(idValue || '').trim().toUpperCase();
  if (idType === 'NRIC') return /^\d{12}$/.test(value) && tin.startsWith('IG');
  if (idType === 'BRN') return (/^\d{12}$/.test(value) || /^\d{1,7}-?[A-Z]$/.test(value)) && !tin.startsWith('IG');
  if (idType === 'PASSPORT') return /^[A-Z0-9]{6,20}$/.test(value);
  if (idType === 'ARMY') return /^[A-Z0-9]{4,20}$/.test(value);
  return false;
}

function emptySandbox() {
  return { submissions: {}, documents: {}, payloads: [], order: [] };
}

function sandboxOf(state) {
  return countrySlice(state, SLICE);
}

function openSandbox(state) {
  const box = openCountrySlice(state, SLICE, emptySandbox);
  for (const [key, make] of Object.entries(emptySandbox())) if (!box[key]) box[key] = make;
  return box;
}

const first = (node) => (Array.isArray(node) ? node[0] : undefined);
const value = (node) => first(node)?._;

function party(node) {
  const p = first(first(node)?.Party);
  if (!p) return null;
  const ids = Object.fromEntries((p.PartyIdentification || []).map((entry) => [first(entry.ID)?.schemeID, first(entry.ID)?._]));
  const address = first(p.PostalAddress) || {};
  return {
    tin: String(ids.TIN || ''),
    idType: Object.keys(ids).find((scheme) => ['BRN', 'NRIC', 'PASSPORT', 'ARMY'].includes(scheme)) || '',
    name: String(value(first(p.PartyLegalEntity)?.RegistrationName) || ''),
    msic: value(p.IndustryClassificationCode),
    state: value(address.CountrySubentityCode),
    country: first(first(address.Country)?.IdentificationCode)?._,
  };
}

function number(node) {
  const raw = value(node);
  return typeof raw === 'number' ? raw : Number(raw);
}

function near(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;
}

function step(name, errors) {
  return errors.length
    ? { name, status: 'Invalid', error: lhdnError(`Error${name.slice(4, 6)}`, name, { innerError: errors }) }
    : { name, status: 'Valid' };
}

function inner(errorCode, error, propertyPath) {
  return lhdnError(errorCode, error, { propertyPath });
}

function signatureErrors(document, invoice) {
  const errors = [];
  const notes = [];
  if (!invoice.UBLExtensions) {
    notes.push('The document is not signed. LHDN pre-production and production refuse an unsigned version 1.1 document; set MYCA_MYINVOIS_CERT_PATH and MYCA_MYINVOIS_KEY_PATH before going live.');
    return { errors, notes };
  }
  try {
    const signature = invoice.UBLExtensions[0].UBLExtension[0].ExtensionContent[0].UBLDocumentSignatures[0].SignatureInformation[0].Signature[0];
    const minified = Buffer.from(JSON.stringify(unsignedCopy(document)), 'utf8');
    const digest = createHash('sha256').update(minified).digest('base64');
    if (signature.SignedInfo[0].Reference[1].DigestValue[0]._ !== digest) errors.push(inner('DS302', 'The document digest does not match the signed content.', '/Invoice/UBLExtensions'));
    const certificate = new X509Certificate(Buffer.from(signature.KeyInfo[0].X509Data[0].X509Certificate[0]._, 'base64'));
    if (!verify('sha256', minified, certificate.publicKey, Buffer.from(signature.SignatureValue[0]._, 'base64'))) errors.push(inner('DS303', 'The signature does not verify against the certificate.', '/Invoice/UBLExtensions'));
  } catch {
    errors.push(inner('DS301', 'The signature block cannot be read.', '/Invoice/UBLExtensions'));
  }
  return { errors, notes };
}

function validate(box, document, { receivedAt, submitterTin }) {
  const invoice = first(document?.Invoice);
  const steps = [];
  const notes = [];
  const structure = [];
  if (!invoice || typeof invoice !== 'object') structure.push(inner('BS01', 'The document has no Invoice.', '/Invoice'));
  else {
    for (const field of ['ID', 'IssueDate', 'IssueTime', 'InvoiceTypeCode', 'DocumentCurrencyCode', 'AccountingSupplierParty', 'AccountingCustomerParty', 'LegalMonetaryTotal', 'TaxTotal']) {
      if (!Array.isArray(invoice[field]) || !invoice[field].length) structure.push(inner('BS02', `${field} is missing.`, `/Invoice/${field}`));
    }
    if (!Array.isArray(invoice.InvoiceLine) || !invoice.InvoiceLine.length) structure.push(inner('BS02', 'InvoiceLine is missing.', '/Invoice/InvoiceLine'));
  }
  steps.push(step('Step01-Structure Validator', structure));
  if (structure.length) return { steps, notes, facts: {} };
  const typeNode = first(invoice.InvoiceTypeCode);
  const typeCode = String(typeNode?._ || '');
  const version = String(typeNode?.listVersionID || '');
  const supplier = party(invoice.AccountingSupplierParty);
  const buyer = party(invoice.AccountingCustomerParty);
  const issuer = SELF_BILLED.has(typeCode) ? buyer : supplier;
  const receiver = SELF_BILLED.has(typeCode) ? supplier : buyer;
  const currency = String(value(invoice.DocumentCurrencyCode) || '');
  const lines = invoice.InvoiceLine;
  const totals = first(invoice.LegalMonetaryTotal) || {};
  const facts = {
    typeCode,
    version,
    internalId: String(value(invoice.ID) || ''),
    issuerTin: issuer?.tin || '',
    issuerName: issuer?.name || '',
    receiverTin: receiver?.tin || '',
    receiverName: receiver?.name || '',
    currency,
    issued: `${value(invoice.IssueDate)}T${value(invoice.IssueTime)}`,
    totalExcludingTax: number(totals.TaxExclusiveAmount),
    totalNetAmount: number(totals.LineExtensionAmount),
    totalPayableAmount: number(totals.PayableAmount),
    totalDiscount: lines.reduce((sum, line) => sum + (line.AllowanceCharge || []).reduce((inside, charge) => inside + number(charge.Amount), 0), 0),
    referencedUuid: String(value(first(first(invoice.BillingReference)?.InvoiceDocumentReference)?.UUID) || ''),
  };

  const core = [];
  const rulesNow = workflow(receivedAt);
  if (!TYPE_NAMES[typeCode]) core.push(inner('CF301', 'InvoiceTypeCode is not a document type.', '/Invoice/InvoiceTypeCode'));
  if (!['1.0', '1.1'].includes(version)) core.push(inner('CF302', 'listVersionID is 1.0 or 1.1.', '/Invoice/InvoiceTypeCode'));
  const issuedMs = Date.parse(`${facts.issued}`);
  if (!Number.isFinite(issuedMs)) core.push(inner('CF320', 'IssueDate and IssueTime are not a date and time.', '/Invoice/IssueDate'));
  else {
    if (issuedMs > receivedAt + MINUTE_MS) core.push(inner('CF322', 'The issuance date and time is in the future.', '/Invoice/IssueDate'));
    if (receivedAt - issuedMs > rulesNow.issueDateMaxAgeHours * HOUR_MS) core.push(inner('CF321', `The issuance date and time is more than ${rulesNow.issueDateMaxAgeHours} hours before submission and is too old to submit.`, '/Invoice/IssueDate'));
  }
  if (!supplier || !buyer) core.push(inner('CF330', 'The supplier and the buyer are both required.', '/Invoice/AccountingSupplierParty'));
  const lineNet = lines.reduce((sum, line) => sum + number(line.LineExtensionAmount), 0);
  const lineTax = lines.reduce((sum, line) => sum + number(first(line.TaxTotal)?.TaxAmount), 0);
  const tax = number(first(invoice.TaxTotal)?.TaxAmount);
  if (!near(lineNet, facts.totalNetAmount)) core.push(inner('CF340', 'LegalMonetaryTotal LineExtensionAmount is not the sum of the lines.', '/Invoice/LegalMonetaryTotal/LineExtensionAmount'));
  if (!near(lineTax, tax)) core.push(inner('CF341', 'TaxTotal TaxAmount is not the sum of the line taxes.', '/Invoice/TaxTotal/TaxAmount'));
  if (!near(facts.totalNetAmount + tax, number(totals.TaxInclusiveAmount))) core.push(inner('CF342', 'TaxInclusiveAmount is not the net amount plus tax.', '/Invoice/LegalMonetaryTotal/TaxInclusiveAmount'));
  if (!(facts.totalPayableAmount >= 0)) core.push(inner('CF343', 'PayableAmount is zero or more.', '/Invoice/LegalMonetaryTotal/PayableAmount'));
  if (buyer?.tin === 'EI00000000010') {
    const notConsolidated = lines.some((line) => value(first(line.Item)?.CommodityClassification?.find((entry) => first(entry.ItemClassificationCode)?.listID === 'CLASS')?.ItemClassificationCode) !== '004');
    if (notConsolidated && !SELF_BILLED.has(typeCode)) notes.push('The buyer is the general public; a consolidated e-invoice uses classification 004 on every line.');
  }
  steps.push(step('Step02-Core Fields Validator', core));

  const signed = signatureErrors(document, invoice);
  notes.push(...signed.notes);
  steps.push(step('Step03-Signature Validator', signed.errors));

  const taxpayer = [];
  for (const [role, who] of [['supplier', supplier], ['buyer', buyer]]) {
    if (!who) continue;
    if (!TIN.test(who.tin)) taxpayer.push(inner('TP301', `The ${role} TIN is not an LHDN TIN.`, `/Invoice/Accounting${role === 'supplier' ? 'Supplier' : 'Customer'}Party`));
    else if (!sandboxTinRegistered(who.tin)) taxpayer.push(inner('TP302', `The ${role} TIN ${who.tin} is not registered with LHDN.`, `/Invoice/Accounting${role === 'supplier' ? 'Supplier' : 'Customer'}Party`));
  }
  if (supplier?.tin === 'EI00000000030' && !SELF_BILLED.has(typeCode)) taxpayer.push(inner('TP303', 'EI00000000030 (foreign supplier) is used only on self-billed documents.', '/Invoice/AccountingSupplierParty'));
  if (submitterTin && issuer && issuer.tin !== submitterTin) taxpayer.push(inner('TP304', 'The issuer is not the taxpayer this system signed in for.', '/Invoice'));
  steps.push(step('Step04-Taxpayer Validator', taxpayer));

  const referenced = [];
  if (ADJUSTMENT_TYPES.has(typeCode)) {
    const original = facts.referencedUuid ? box.documents[facts.referencedUuid] : null;
    if (!facts.referencedUuid) referenced.push(inner('RD301', 'A credit, debit or refund note names the UUID of the document it adjusts.', '/Invoice/BillingReference'));
    else if (!original) referenced.push(inner('RD302', `The referenced document ${facts.referencedUuid} does not exist.`, '/Invoice/BillingReference'));
    else if (documentStatus(original, receivedAt) !== 'Valid') referenced.push(inner('RD303', `The referenced document ${facts.referencedUuid} is not valid.`, '/Invoice/BillingReference'));
    else if (original.issuerTin !== facts.issuerTin) referenced.push(inner('RD304', 'The referenced document was issued by someone else.', '/Invoice/BillingReference'));
    else if (SELF_BILLED.has(typeCode) !== SELF_BILLED.has(original.typeCode)) referenced.push(inner('RD305', 'A self-billed note adjusts a self-billed invoice, and an ordinary note an ordinary invoice.', '/Invoice/BillingReference'));
  }
  steps.push(step('Step05-Referenced Documents Validator', referenced));

  const codes = [];
  for (const [role, who] of [['Supplier', supplier], ['Customer', buyer]]) {
    if (!who) continue;
    if (who.country && !hasCode('countries', who.country)) codes.push(inner('CV301', `${who.country} is not a country code.`, `/Invoice/Accounting${role}Party/Party/PostalAddress/Country`));
    if (!hasCode('states', who.state)) codes.push(inner('CV302', `${who.state} is not a state code.`, `/Invoice/Accounting${role}Party/Party/PostalAddress/CountrySubentityCode`));
    else if (who.state === '17' && who.country === 'MYS' && who.tin !== 'EI00000000010') codes.push(inner('CV317', 'State Code 17 applies only to consolidated e-Invoices and non-Malaysian buyer addresses.', `/Invoice/Accounting${role}Party/Party/PostalAddress/CountrySubentityCode`));
  }
  if (supplier && !hasCode('msic', supplier.msic)) codes.push(inner('CV303', 'The supplier MSIC code is not in the code table.', '/Invoice/AccountingSupplierParty/Party/IndustryClassificationCode'));
  if (!hasCode('currencies', currency)) codes.push(inner('CV304', `${currency} is not a currency code.`, '/Invoice/DocumentCurrencyCode'));
  const means = value(first(invoice.PaymentMeans)?.PaymentMeansCode);
  if (means !== undefined && !hasCode('paymentMethods', means)) codes.push(inner('CV305', `${means} is not a payment method code.`, '/Invoice/PaymentMeans'));
  lines.forEach((line, index) => {
    const at = `/Invoice/InvoiceLine[${index}]`;
    const unit = first(line.InvoicedQuantity)?.unitCode;
    if (unit && !hasCode('units', unit)) codes.push(inner('CV306', `${unit} is not a unit code.`, `${at}/InvoicedQuantity`));
    const classification = value(first(line.Item)?.CommodityClassification?.find((entry) => first(entry.ItemClassificationCode)?.listID === 'CLASS')?.ItemClassificationCode);
    if (!hasCode('classifications', classification)) codes.push(inner('CV307', `${classification} is not a classification code.`, `${at}/Item/CommodityClassification`));
    const taxType = value(first(first(first(line.TaxTotal)?.TaxSubtotal)?.TaxCategory)?.ID);
    if (!hasCode('taxTypes', taxType)) codes.push(inner('CV308', `${taxType} is not a tax type.`, `${at}/TaxTotal`));
  });
  steps.push(step('Step06-Code Validator', codes));

  const duplicates = [];
  const twin = Object.values(box.documents).find((doc) => doc.issuerTin === facts.issuerTin && doc.internalId === facts.internalId && doc.typeCode === typeCode && !['Invalid', 'Cancelled'].includes(documentStatus(doc, receivedAt)));
  if (twin) duplicates.push(inner('DD301', `Document ${facts.internalId} was already submitted as ${twin.uuid}.`, '/Invoice/ID'));
  steps.push(step('Step07-Duplicate Document Validator', duplicates));

  const money = [];
  const exchange = first(invoice.TaxExchangeRate);
  if (currency && currency !== 'MYR') {
    const rate = number(first(exchange?.CalculationRate) ? exchange.CalculationRate : undefined);
    if (!exchange) money.push(inner('CR301', 'A document not in MYR gives TaxExchangeRate.', '/Invoice/TaxExchangeRate'));
    else if (!(rate > 0)) money.push(inner('CR302', 'The exchange rate is greater than zero.', '/Invoice/TaxExchangeRate/CalculationRate'));
    else if (value(exchange.SourceCurrencyCode) !== currency || value(exchange.TargetCurrencyCode) !== 'MYR') money.push(inner('CR303', 'The exchange rate converts the document currency to MYR.', '/Invoice/TaxExchangeRate'));
  } else if (exchange && number(exchange.CalculationRate) !== 1) {
    money.push(inner('CR304', 'A MYR document carries no exchange rate other than 1.', '/Invoice/TaxExchangeRate'));
  }
  steps.push(step('Step08-Currency Validator', money));
  return { steps, notes, facts };
}

export function documentStatus(doc, now) {
  if (now < doc.receivedAt + MYINVOIS_SANDBOX_VALIDATION_MS) return 'Submitted';
  if (doc.steps.some((entry) => entry.status === 'Invalid')) return 'Invalid';
  if (doc.cancelledAt) return 'Cancelled';
  return 'Valid';
}

function summary(doc, now) {
  const status = documentStatus(doc, now);
  const validatedAt = doc.receivedAt + MYINVOIS_SANDBOX_VALIDATION_MS;
  return {
    uuid: doc.uuid,
    submissionUid: doc.submissionUid,
    longId: status === 'Valid' || status === 'Cancelled' ? doc.longId : '',
    internalId: doc.internalId,
    typeName: TYPE_NAMES[doc.typeCode] || '',
    typeVersionName: doc.version,
    issuerTin: doc.issuerTin,
    issuerName: doc.issuerName,
    receiverId: doc.receiverTin,
    receiverName: doc.receiverName,
    dateTimeIssued: doc.issued,
    dateTimeReceived: iso(doc.receivedAt),
    dateTimeValidated: status === 'Submitted' ? null : iso(validatedAt),
    totalExcludingTax: doc.totalExcludingTax,
    totalDiscount: doc.totalDiscount,
    totalNetAmount: doc.totalNetAmount,
    totalPayableAmount: doc.totalPayableAmount,
    status,
    cancelDateTime: doc.cancelledAt ? iso(doc.cancelledAt) : null,
    rejectRequestDateTime: doc.rejectRequestedAt ? iso(doc.rejectRequestedAt) : null,
    documentStatusReason: doc.cancelReason || doc.rejectReason || null,
    createdByUserId: doc.createdBy,
  };
}

function details(doc, now) {
  const status = documentStatus(doc, now);
  return {
    ...summary(doc, now),
    validationResults: status === 'Submitted'
      ? { status: 'Submitted', validationSteps: [] }
      : { status: doc.steps.some((entry) => entry.status === 'Invalid') ? 'Invalid' : 'Valid', validationSteps: doc.steps },
    ...(doc.notes.length ? { sandboxNotes: doc.notes } : {}),
  };
}

function overall(docs, now) {
  const statuses = docs.map((doc) => documentStatus(doc, now));
  if (statuses.includes('Submitted')) return 'InProgress';
  const invalid = statuses.filter((status) => status === 'Invalid').length;
  if (!invalid) return 'Valid';
  return invalid === statuses.length ? 'Invalid' : 'PartiallyValid';
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function login(init) {
  const form = new URLSearchParams(String(init.body || ''));
  const now = clock();
  if (form.get('grant_type') !== 'client_credentials') return reply(400, { error: 'unsupported_grant_type' });
  if (!form.get('client_id') || !form.get('client_secret')) return reply(400, { error: 'invalid_client' });
  if (form.get('scope') && form.get('scope') !== 'InvoicingAPI') return reply(400, { error: 'invalid_scope' });
  const onBehalfOf = header(init, 'onbehalfof').split(':')[0].trim().toUpperCase();
  if (onBehalfOf && !TIN.test(onBehalfOf)) return reply(400, { error: 'invalid_request', error_description: 'onbehalfof is a TIN, or a TIN and a business registration number joined by a colon.' });
  const seconds = workflow(now).tokenSeconds;
  return reply(200, { access_token: issueToken({ clientId: form.get('client_id'), tin: onBehalfOf, now, seconds }), token_type: 'Bearer', expires_in: seconds, scope: 'InvoicingAPI' });
}

function keep(box) {
  while (box.order.length > MAX_KEPT_DOCUMENTS) {
    const oldest = box.order.shift();
    const doc = box.documents[oldest];
    delete box.documents[oldest];
    if (doc && box.submissions[doc.submissionUid]) {
      box.submissions[doc.submissionUid].documents = box.submissions[doc.submissionUid].documents.filter((uuid) => uuid !== oldest);
      if (!box.submissions[doc.submissionUid].documents.length) delete box.submissions[doc.submissionUid];
    }
  }
}

function submit(state, init, caller) {
  const now = clock();
  const limits = workflow(now);
  const text = String(init.body || '');
  if (Buffer.byteLength(text) > limits.maxSubmissionBytes) return errorReply(400, 'MaximumSizeExceeded', `The submission is larger than ${limits.maxSubmissionBytes / 1048576} MB; split it into smaller submissions.`);
  const parsed = parseJson(text);
  const documents = parsed.ok && parsed.value && Array.isArray(parsed.value.documents) ? parsed.value.documents : null;
  if (!documents || !documents.length) return errorReply(400, 'BadStructure', 'The submission has no documents array.');
  if (documents.length > limits.maxDocumentsPerSubmission) return errorReply(400, 'MaximumSizeExceeded', `A submission holds at most ${limits.maxDocumentsPerSubmission} documents.`);
  const box = openSandbox(state);
  const fingerprint = createHash('sha256').update(`${caller.tin}|${text}`).digest('hex');
  box.payloads = box.payloads.filter((entry) => now - entry.at < limits.duplicateSubmissionMinutes * MINUTE_MS);
  const repeat = box.payloads.find((entry) => entry.fingerprint === fingerprint);
  if (repeat) return errorReply(422, 'DuplicateSubmission', `An identical submission was received within the last ${limits.duplicateSubmissionMinutes} minutes.`, {}, { 'Retry-After': String(Math.max(1, Math.ceil((repeat.at + limits.duplicateSubmissionMinutes * MINUTE_MS - now) / 1000))) });
  const accepted = [];
  const rejected = [];
  const seenNumbers = new Set();
  const prepared = [];
  for (const entry of documents) {
    const codeNumber = String(entry?.codeNumber ?? '');
    const refuse = (errorCode, message) => rejected.push({ invoiceCodeNumber: codeNumber, error: lhdnError(errorCode, message) });
    if (!entry || typeof entry !== 'object' || !codeNumber || typeof entry.document !== 'string' || typeof entry.documentHash !== 'string') { refuse('BadArgument', 'Each document has format, document, documentHash and codeNumber.'); continue; }
    if (entry.format !== 'JSON') { refuse('BadArgument', 'The MyCA sandbox accepts JSON documents only.'); continue; }
    if (seenNumbers.has(codeNumber)) { refuse('BadArgument', `codeNumber ${codeNumber} appears twice in this submission.`); continue; }
    seenNumbers.add(codeNumber);
    const bytes = Buffer.from(entry.document, 'base64');
    if (bytes.length > limits.maxDocumentBytes) { refuse('MaximumSizeExceeded', `The document is larger than ${limits.maxDocumentBytes / 1024} KB.`); continue; }
    const json = bytes.toString('utf8');
    if (createHash('sha256').update(json, 'utf8').digest('hex') !== entry.documentHash.toLowerCase()) { refuse('BadArgument', 'documentHash is not the SHA-256 of the document.'); continue; }
    const doc = parseJson(json);
    if (!doc.ok || !doc.value || typeof doc.value !== 'object') { refuse('BadStructure', 'The document is not JSON.'); continue; }
    const invoice = first(doc.value.Invoice);
    if (invoice && String(value(invoice.ID) || '') !== codeNumber) { refuse('BadArgument', 'codeNumber is not the document\'s own ID.'); continue; }
    prepared.push({ codeNumber, document: doc.value, documentHash: entry.documentHash.toLowerCase() });
  }
  for (const item of prepared) {
    const invoice = first(item.document.Invoice);
    const typeCode = String(first(invoice?.InvoiceTypeCode)?._ || '');
    const issuer = invoice ? party(SELF_BILLED.has(typeCode) ? invoice.AccountingCustomerParty : invoice.AccountingSupplierParty) : null;
    if (caller.tin && issuer && TIN.test(issuer.tin) && issuer.tin !== caller.tin) return errorReply(403, 'IncorrectSubmitter', 'The submitter may not submit documents for another taxpayer.');
  }
  const submissionUid = uid(`submission|${fingerprint}|${now}`);
  const uuids = [];
  for (const item of prepared) {
    const uuid = uid(`document|${item.documentHash}|${submissionUid}`);
    const checked = validate(box, item.document, { receivedAt: now, submitterTin: caller.tin });
    box.documents[uuid] = {
      uuid,
      submissionUid,
      longId: uid(`long|${uuid}|${item.documentHash}`, LONG_ALPHABET, 40),
      internalId: item.codeNumber,
      typeCode: checked.facts.typeCode || '',
      version: checked.facts.version || '',
      issuerTin: checked.facts.issuerTin || caller.tin,
      issuerName: checked.facts.issuerName || '',
      receiverTin: checked.facts.receiverTin || '',
      receiverName: checked.facts.receiverName || '',
      currency: checked.facts.currency || '',
      issued: checked.facts.issued ? `${checked.facts.issued}` : '',
      totalExcludingTax: checked.facts.totalExcludingTax ?? 0,
      totalDiscount: checked.facts.totalDiscount ?? 0,
      totalNetAmount: checked.facts.totalNetAmount ?? 0,
      totalPayableAmount: checked.facts.totalPayableAmount ?? 0,
      referencedUuid: checked.facts.referencedUuid || '',
      receivedAt: now,
      steps: checked.steps,
      notes: checked.notes,
      createdBy: caller.clientId,
      direction: 'sent',
    };
    box.order.push(uuid);
    uuids.push(uuid);
    accepted.push({ uuid, invoiceCodeNumber: item.codeNumber });
  }
  if (uuids.length) box.submissions[submissionUid] = { submissionUid, tin: caller.tin, receivedAt: now, documents: uuids };
  box.payloads.push({ fingerprint, at: now });
  keep(box);
  return reply(202, { submissionUID: uuids.length ? submissionUid : null, acceptedDocuments: accepted, rejectedDocuments: rejected });
}

function visible(doc, caller) {
  return !caller.tin || doc.issuerTin === caller.tin || doc.receiverTin === caller.tin;
}

function readSubmission(state, uidText, url, caller) {
  const box = sandboxOf(state);
  const found = box.submissions?.[uidText];
  if (!found || (caller.tin && found.tin !== caller.tin)) return errorReply(404, 'NotFound', 'The submission was not found.');
  const now = clock();
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 100));
  const pageNo = Math.max(1, Math.floor(Number(url.searchParams.get('pageNo')) || 1));
  const docs = found.documents.map((uuid) => box.documents[uuid]).filter(Boolean);
  return reply(200, {
    submissionUid: uidText,
    documentCount: docs.length,
    dateTimeReceived: iso(found.receivedAt),
    overallStatus: overall(docs, now),
    documentSummary: docs.slice((pageNo - 1) * pageSize, pageNo * pageSize).map((doc) => summary(doc, now)),
  });
}

function readDetails(state, uuid, caller) {
  const doc = sandboxOf(state).documents?.[uuid];
  if (!doc) return errorReply(404, 'NotFound', 'The document was not found.');
  if (!visible(doc, caller)) return errorReply(403, 'Forbidden', 'The document belongs to other taxpayers.');
  return reply(200, details(doc, clock()));
}

function recent(state, url, caller) {
  const now = clock();
  const direction = String(url.searchParams.get('InvoiceDirection') || '').toLowerCase();
  if (direction && !['sent', 'received'].includes(direction)) return errorReply(400, 'BadArgument', 'InvoiceDirection is Sent or Received.');
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 100));
  const pageNo = Math.max(1, Math.floor(Number(url.searchParams.get('pageNo')) || 1));
  const wantedStatus = String(url.searchParams.get('status') || '').toLowerCase();
  const docs = Object.values(sandboxOf(state).documents || {})
    .filter((doc) => now - doc.receivedAt <= RECENT_DAYS * DAY_MS)
    .filter((doc) => (direction === 'received' ? doc.receiverTin === caller.tin : direction === 'sent' ? doc.issuerTin === caller.tin : visible(doc, caller)))
    .map((doc) => summary(doc, now))
    .filter((doc) => !wantedStatus || doc.status.toLowerCase() === wantedStatus)
    .sort((a, b) => (a.dateTimeReceived < b.dateTimeReceived ? 1 : a.dateTimeReceived > b.dateTimeReceived ? -1 : a.uuid < b.uuid ? -1 : 1));
  return reply(200, { result: docs.slice((pageNo - 1) * pageSize, pageNo * pageSize), metadata: { totalPages: Math.max(1, Math.ceil(docs.length / pageSize)), totalCount: docs.length } });
}

function changeState(state, uuid, init, caller) {
  const parsed = parseJson(String(init.body || ''));
  const wanted = String(parsed.ok ? parsed.value?.status || '' : '').toLowerCase();
  const reason = String(parsed.ok ? parsed.value?.reason || '' : '').trim();
  const now = clock();
  const limits = workflow(now);
  if (!['cancelled', 'rejected'].includes(wanted)) return errorReply(400, 'BadArgument', 'status is cancelled or rejected.');
  if (!reason || reason.length > limits.maxReasonCharacters) return errorReply(400, 'BadArgument', `A reason of up to ${limits.maxReasonCharacters} characters is required.`);
  const box = sandboxOf(state);
  const existing = box.documents?.[uuid];
  if (!existing) return errorReply(404, 'NotFound', 'The document was not found.');
  const status = documentStatus(existing, now);
  const validatedAt = existing.receivedAt + MYINVOIS_SANDBOX_VALIDATION_MS;
  if (wanted === 'cancelled') {
    if (caller.tin && existing.issuerTin !== caller.tin) return errorReply(403, 'Forbidden', 'Only the issuer may cancel a document.');
    if (status !== 'Valid') return errorReply(400, 'IncorrectState', `The document is ${status} and cannot be cancelled.`);
    if (now - validatedAt > limits.cancelWithinHours * HOUR_MS) return errorReply(400, 'OperationPeriodOver', `A document can be cancelled only within ${limits.cancelWithinHours} hours of validation; issue a credit, debit or refund note instead.`);
    const referencing = Object.values(box.documents).find((doc) => doc.referencedUuid === uuid && documentStatus(doc, now) !== 'Invalid' && documentStatus(doc, now) !== 'Cancelled');
    if (referencing) return errorReply(400, 'ActiveReferencingDocuments', `Document ${referencing.uuid} refers to this one; cancel it first.`);
    const doc = openSandbox(state).documents[uuid];
    doc.cancelledAt = now;
    doc.cancelReason = reason;
    return reply(200, { uuid, status: 'Cancelled' });
  }
  if (caller.tin && existing.receiverTin !== caller.tin) return errorReply(403, 'Forbidden', 'Only the buyer may reject a document.');
  if (status !== 'Valid' || existing.rejectRequestedAt) return errorReply(400, 'IncorrectState', existing.rejectRequestedAt ? 'A rejection was already requested for this document.' : `The document is ${status} and cannot be rejected.`);
  if (now - validatedAt > limits.rejectWithinHours * HOUR_MS) return errorReply(400, 'OperationPeriodOver', `A document can be rejected only within ${limits.rejectWithinHours} hours of validation; ask the supplier for a credit note instead.`);
  const doc = openSandbox(state).documents[uuid];
  doc.rejectRequestedAt = now;
  doc.rejectReason = reason;
  return reply(200, { uuid, status: 'Requested for Rejection' });
}

function validateTin(url, tinText) {
  const tin = decodeURIComponent(tinText).toUpperCase();
  const idType = String(url.searchParams.get('idType') || '').toUpperCase();
  const idValue = String(url.searchParams.get('idValue') || '');
  if (!['BRN', 'NRIC', 'PASSPORT', 'ARMY'].includes(idType) || !idValue.trim()) return errorReply(400, 'BadArgument', 'idType is BRN, NRIC, PASSPORT or ARMY, and idValue is required.');
  if (!TIN.test(tin) || !sandboxTinRegistered(tin) || !idPlausible(idType, idValue, tin)) return reply(404, undefined);
  return reply(200, undefined);
}

export function myInvoisSandbox(state) {
  return async (url, init = {}) => {
    const target = new URL(String(url));
    const method = String(init.method || 'GET').toUpperCase();
    const path = target.pathname.replace(/\/+$/, '') || '/';
    if (target.hostname !== 'preprod-api.myinvois.hasil.gov.my') return reply(404, undefined);
    if (path === '/connect/token' && method === 'POST') return login(init);
    const caller = readToken(header(init, 'authorization'), clock());
    if (!caller) return reply(401, undefined);
    if (path === '/api/v1.0/documentsubmissions' && method === 'POST') return submit(state, init, caller);
    let match = path.match(/^\/api\/v1\.0\/documentsubmissions\/([A-Z0-9]{26})$/);
    if (match && method === 'GET') return readSubmission(state, match[1], target, caller);
    match = path.match(/^\/api\/v1\.0\/documents\/([A-Z0-9]{26})\/details$/);
    if (match && method === 'GET') return readDetails(state, match[1], caller);
    match = path.match(/^\/api\/v1\.0\/documents\/state\/([A-Z0-9]{26})\/state$/);
    if (match && method === 'PUT') return changeState(state, match[1], init, caller);
    if (path === '/api/v1.0/documents/recent' && method === 'GET') return recent(state, target, caller);
    match = path.match(/^\/api\/v1\.0\/taxpayer\/validate\/([^/]+)$/);
    if (match && method === 'GET') return validateTin(target, match[1]);
    return reply(404, undefined);
  };
}

export function sandboxShareLink(uuid, longId) {
  return `${MYINVOIS_SANDBOX_PORTAL}/${uuid}/share/${longId}`;
}

export function receiveSandboxDocument(state, { buyerTin, buyerName, supplier = {}, number, issueDate, total, tax = 0, currency = 'MYR' }) {
  const now = clock();
  const problems = [];
  if (!TIN.test(String(buyerTin || ''))) problems.push({ field: 'buyerTin', why: 'save the e-invoice profile first; the received e-invoice is addressed to its TIN' });
  if (!TIN.test(String(supplier.tin || '')) || SPECIAL.has(String(supplier.tin))) problems.push({ field: 'supplier.tin', why: 'the supplier\'s own LHDN TIN' });
  if (!String(supplier.name || '').trim()) problems.push({ field: 'supplier.name', why: 'required' });
  if (!String(number || '').trim() || String(number).length > 50) problems.push({ field: 'number', why: 'the supplier\'s invoice number, at most 50 characters' });
  if (!(typeof total === 'number' && Number.isFinite(total) && total >= 0)) problems.push({ field: 'total', why: 'the payable amount, zero or more' });
  if (!(typeof tax === 'number' && Number.isFinite(tax) && tax >= 0 && tax <= (Number(total) || 0))) problems.push({ field: 'tax', why: 'zero or more and no more than the total' });
  if (!hasCode('currencies', String(currency))) problems.push({ field: 'currency', why: 'an ISO 4217 code' });
  if (problems.length) return { ok: false, error: 'SANDBOX_DOCUMENT_INCOMPLETE', problems };
  const box = openSandbox(state);
  const issued = /^\d{4}-\d{2}-\d{2}$/.test(String(issueDate || '')) ? `${issueDate}T00:00:00Z` : iso(now);
  const submissionUid = uid(`inbound-submission|${supplier.tin}|${number}|${now}`);
  const uuid = uid(`inbound|${supplier.tin}|${number}|${now}`);
  box.documents[uuid] = {
    uuid,
    submissionUid,
    longId: uid(`long|${uuid}`, LONG_ALPHABET, 40),
    internalId: String(number),
    typeCode: '01',
    version: '1.1',
    issuerTin: String(supplier.tin),
    issuerName: String(supplier.name),
    receiverTin: String(buyerTin),
    receiverName: String(buyerName || ''),
    currency: String(currency),
    issued,
    totalExcludingTax: Math.round((total - tax) * 100) / 100,
    totalDiscount: 0,
    totalNetAmount: Math.round((total - tax) * 100) / 100,
    totalPayableAmount: total,
    referencedUuid: '',
    receivedAt: now - MYINVOIS_SANDBOX_VALIDATION_MS,
    steps: [],
    notes: [],
    createdBy: 'sandbox-supplier',
    direction: 'received',
  };
  box.submissions[submissionUid] = { submissionUid, tin: String(supplier.tin), receivedAt: now, documents: [uuid] };
  box.order.push(uuid);
  keep(box);
  return { ok: true, data: { uuid, number: String(number), supplier: { tin: supplier.tin, name: supplier.name }, total, status: 'Valid', typeName: codeName('documentTypes', '01') } };
}
