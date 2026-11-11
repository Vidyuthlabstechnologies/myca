import { createHash } from 'node:crypto';
import { htmlEscape } from './text-safe.mjs';
import { canonicalJson } from './approvals.mjs';
import { MEF_NAMESPACE, FILING_STATUS_CODES, FORM_1040_LINES, SCHEDULE_DOCUMENTS, W2_FIELDS, RELATIONSHIP_CODES } from './us-mef-map.mjs';

export const MEF_SCHEMA_VERSION = '2025v5.7';
const SSN = /^\d{9}$/;
const EIN = /^\d{9}$/;
const EFIN = /^\d{6}$/;
const SOFTWARE_ID = /^\d{8}$/;
const SUBMISSION_ID = /^\d{13}[a-z0-9]{7}$/;
const STATE = /^[A-Z]{2}$/;
const ZIP = /^\d{5}(\d{4})?$/;
const SIGNATURE_PIN = /^\d{5}$/;
const IP_PIN = /^\d{6}$/;
const ROUTING = /^\d{9}$/;
const ACCOUNT = /^[A-Za-z0-9-]{1,17}$/;
const DEVICE_ID = /^[0-9A-Fa-f]{40}$/;
const NON_LINE_FIELDS = new Set(['lines', 'id', 'owner', 'source', 'expenses', 'belowMinimum']);
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function el(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${htmlEscape(value)}</${name}>`;
}

function group(name, inner, attributes = '') {
  if (!inner) return '';
  return `<${name}${attributes}>${inner}</${name}>`;
}

function problem(code, message, fix, step) {
  return { code, message, fix, step };
}

export function nameControl(lastName) {
  return String(lastName || '').toUpperCase().replace(/[^A-Z-]/g, '').replace(/^-+/, '').slice(0, 4);
}

export function businessNameControl(name) {
  return String(name || '').toUpperCase().replace(/^THE\s+/, '').replace(/[^A-Z0-9&-]/g, '').slice(0, 4);
}

export function routingNumberValid(value) {
  const digits = String(value || '');
  if (!ROUTING.test(digits)) return false;
  if (!/^(0[0-9]|1[0-2]|2[1-9]|3[0-2])/.test(digits)) return false;
  const d = [...digits].map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export function ssnShapeValid(value) {
  const ssn = String(value || '');
  if (!SSN.test(ssn)) return false;
  if (ssn.startsWith('000') || ssn.startsWith('666')) return false;
  if (ssn.slice(3, 5) === '00' || ssn.slice(5) === '0000') return false;
  return true;
}

function julianDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  return String(Math.floor((Date.UTC(y, m - 1, d) - start) / 86400000) + 1).padStart(3, '0');
}

export function makeSubmissionId(efin, isoDate, sequence) {
  const seq = Number(sequence);
  if (!EFIN.test(String(efin || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || '')) || !Number.isInteger(seq) || seq < 1) return '';
  return `${efin}${isoDate.slice(0, 4)}${julianDay(isoDate)}${seq.toString(36).padStart(7, '0')}`;
}

function withoutVolatile(computed) {
  const { refund, ...rest } = computed || {};
  return rest;
}

export function returnDigest(computed) {
  return createHash('sha256').update(canonicalJson(withoutVolatile(computed))).digest('hex');
}

function wholeDollars(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function amountElements(lines, map, where, problems) {
  let out = '';
  for (const [line, value] of Object.entries(lines || {})) {
    if (value === null || value === undefined || value === 0) continue;
    const element = map[line];
    if (!element) {
      problems.push(problem('UNMAPPED_LINE', `${where} line ${line} has no MeF element in MyCA yet.`, 'Nothing was dropped: MyCA stops rather than file a return without this line. Report it so the mapping is added.', 'review'));
      continue;
    }
    if (!wholeDollars(value)) {
      problems.push(problem('NOT_WHOLE_DOLLARS', `${where} line ${line} is ${value}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
      continue;
    }
    out += el(element, value);
  }
  return out;
}

function orderedAmounts(lines, map, where, problems) {
  const order = Object.keys(map);
  const sorted = Object.fromEntries(Object.entries(lines || {}).sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  }));
  return amountElements(sorted, map, where, problems);
}

function personChecks(person, who, step, problems, ssnOf) {
  if (!person || typeof person !== 'object') {
    problems.push(problem('PERSON_MISSING', `The ${who} is missing.`, `Add the ${who}'s name and SSN.`, step));
    return null;
  }
  if (!String(person.firstName || '').trim() || !nameControl(person.lastName)) problems.push(problem('NAME_MISSING', `The ${who}'s first and last name are needed.`, `Enter the ${who}'s name exactly as on the Social Security card.`, step));
  const ssn = ssnOf(person.ssn);
  if (!ssnShapeValid(ssn)) {
    problems.push(problem('SSN_INVALID', `The ${who}'s SSN or ITIN is missing or not a valid number.`, `Re-enter the ${who}'s nine-digit SSN or ITIN.`, step));
    return null;
  }
  return ssn;
}

function addressChecks(address, problems) {
  const a = address || {};
  if (!String(a.line1 || '').trim() || !String(a.city || '').trim() || !STATE.test(String(a.state || '')) || !ZIP.test(String(a.zip || '').replace('-', ''))) {
    problems.push(problem('ADDRESS_INVALID', 'The home address needs a street, city, two-letter state and ZIP code.', 'Fix the address in your profile.', 'profile'));
    return '';
  }
  return group('USAddress', el('AddressLine1Txt', a.line1.trim().slice(0, 35)) + el('AddressLine2Txt', String(a.line2 || '').trim().slice(0, 35)) + el('CityNm', a.city.trim().slice(0, 22)) + el('StateAbbreviationCd', a.state) + el('ZIPCd', String(a.zip).replace('-', '')));
}

function nameLine(taxpayer, spouse, status) {
  const first = `${String(taxpayer.firstName || '').trim()}${taxpayer.middleInitial ? ` ${taxpayer.middleInitial}` : ''}`;
  const last = String(taxpayer.lastName || '').trim();
  if (status === 'mfj' && spouse) {
    const spouseFirst = String(spouse.firstName || '').trim();
    const spouseLast = String(spouse.lastName || '').trim();
    if (spouseLast && spouseLast.toUpperCase() !== last.toUpperCase()) return `${first} ${last} & ${spouseFirst} ${spouseLast}`.toUpperCase().slice(0, 35);
    return `${first} & ${spouseFirst} ${last}`.toUpperCase().slice(0, 35);
  }
  return `${first} ${last}`.toUpperCase().slice(0, 35);
}

function signatureElements(signature, needsSpouse, problems) {
  const s = signature || {};
  let out = el('PINTypeCd', 'Self-Select On-Line') + el('JuratDisclosureCd', 'Online Self Select PIN');
  const people = [['Primary', 'taxpayer', s.taxpayer]];
  if (needsSpouse) people.push(['Spouse', 'spouse', s.spouse]);
  for (const [prefix, who, person] of people) {
    const p = person || {};
    if (!SIGNATURE_PIN.test(String(p.pin || '')) || p.pin === '00000') {
      problems.push(problem('SIGNATURE_PIN_MISSING', `The ${who}'s five-digit signature PIN is missing.`, 'Sign the return again with a five-digit PIN (any digits except 00000).', 'sign'));
      continue;
    }
    out += el(`${prefix}SignaturePIN`, p.pin);
    if (p.priorYearPin && SIGNATURE_PIN.test(String(p.priorYearPin))) out += el(`${prefix}PriorYearPIN`, p.priorYearPin);
    else if (Number.isInteger(p.priorYearAgi) && p.priorYearAgi >= 0) out += el(`${prefix}PriorYearAGIAmt`, p.priorYearAgi);
    else problems.push(problem('PRIOR_YEAR_VERIFICATION_MISSING', `The ${who}'s prior-year AGI (or prior-year PIN) is needed to sign.`, 'Enter last year\'s adjusted gross income from last year\'s return, or 0 if you did not file.', 'sign'));
    if (p.ipPin) {
      if (IP_PIN.test(String(p.ipPin))) out += el(`${prefix}IPPIN`, p.ipPin);
      else problems.push(problem('IP_PIN_INVALID', `The ${who}'s Identity Protection PIN must be six digits.`, 'Re-enter the IP PIN from the IRS letter or your IRS online account.', 'sign'));
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.date || ''))) problems.push(problem('SIGNATURE_DATE_MISSING', 'The signature has no date.', 'Sign the return again.', 'sign'));
  out += el('PrimarySignatureDt', s.date);
  return out;
}

function deviceGroup(name, device) {
  if (!device || typeof device !== 'object') return '';
  const ip = String(device.ipAddress || '');
  const match = IPV4.exec(ip);
  const ipXml = match && match.slice(1).every((n) => Number(n) <= 255) ? group('IPAddress', el('IPv4AddressTxt', ip)) : (ip.includes(':') ? group('IPAddress', el('IPv6AddressTxt', ip.toUpperCase())) : '');
  const id = DEVICE_ID.test(String(device.deviceId || '')) ? String(device.deviceId).toUpperCase() : '';
  return group(name, ipXml + el('IPTs', device.at) + el('DeviceId', id) + el('DeviceTypeCd', device.deviceType || 'Browser-based'));
}

function dependentsXml(dependents, problems, ssnOf) {
  let out = '';
  (dependents || []).forEach((dep, index) => {
    const where = `dependent ${index + 1}`;
    const ssn = personChecks(dep, where, 'interview', problems, ssnOf);
    const relationship = String(dep?.relationship || '').toUpperCase();
    if (!RELATIONSHIP_CODES.has(relationship)) problems.push(problem('RELATIONSHIP_INVALID', `The ${where}'s relationship "${dep?.relationship || ''}" is not one the IRS accepts.`, 'Pick the relationship from the list.', 'interview'));
    if (!ssn) return;
    out += group('DependentDetail', el('DependentFirstNm', String(dep.firstName).trim().slice(0, 16)) + el('DependentLastNm', String(dep.lastName).trim().slice(0, 32)) + el('DependentNameControlTxt', nameControl(dep.lastName)) + el('DependentSSN', ssn) + el('DependentRelationshipCd', relationship) + (dep.ctcEligible ? el('EligibleForChildTaxCreditInd', 'X') : '') + (dep.odcEligible ? el('EligibleForODCInd', 'X') : ''));
  });
  return out;
}

function bankChecks(bank, what, problems) {
  if (!routingNumberValid(bank.routing)) problems.push(problem('ROUTING_INVALID', `The ${what} routing number is not a valid US bank routing number.`, 'Check the nine-digit routing number on your cheque or bank app.', 'sign'));
  if (!ACCOUNT.test(String(bank.account || ''))) problems.push(problem('ACCOUNT_INVALID', `The ${what} account number must be 1 to 17 letters or digits.`, 'Re-enter the account number.', 'sign'));
  if (!['checking', 'savings'].includes(bank.accountType)) problems.push(problem('ACCOUNT_TYPE_INVALID', `Say whether the ${what} account is checking or savings.`, 'Choose checking or savings.', 'sign'));
}

function form1040Xml(computed, problems, ssnOf) {
  const lines = computed.lines || {};
  const refund = computed.refund || null;
  let deposit = '';
  if (refund && refund.method === 'direct_deposit' && Number(lines['35a'] || 0) > 0) {
    bankChecks(refund, 'refund', problems);
    deposit = el('RoutingTransitNum', refund.routing) + el('BankAccountTypeCd', refund.accountType === 'savings' ? '2' : '1') + el('DepositorAccountNum', refund.account);
  }
  const amounts = orderedAmounts(Object.fromEntries(Object.entries(lines).filter(([k]) => k !== '35a')), FORM_1040_LINES, 'Form 1040', problems);
  const refundXml = Number(lines['35a'] || 0) > 0 ? el('RefundAmt', lines['35a']) + deposit : '';
  const splitAt = amounts.indexOf('<AppliedToEsTaxAmt>') >= 0 ? amounts.indexOf('<AppliedToEsTaxAmt>') : (amounts.indexOf('<OwedAmt>') >= 0 ? amounts.indexOf('<OwedAmt>') : amounts.length);
  const deps = dependentsXml(computed.dependents, problems, ssnOf);
  const header = el('IndividualReturnFilingStatusCd', FILING_STATUS_CODES[computed.filingStatus]) + el('VirtualCurAcquiredDurTYInd', computed.digitalAssets ? 'true' : 'false') + el('PrimaryOccupationTxt', String(computed.taxpayer?.occupation || '').slice(0, 25)) + (computed.spouse ? el('SpouseOccupationTxt', String(computed.spouse.occupation || '').slice(0, 25)) : '');
  return group('IRS1040', header + deps + amounts.slice(0, splitAt) + refundXml + amounts.slice(splitAt), ' documentId="IRS1040"');
}

const NOT_ATTACHED = Object.freeze({
  EIC: (value) => !(Number(value?.credit) > 0) || !(Number(value?.qualifyingChildren) > 0),
});

function schedulesXml(schedules, problems) {
  const docs = [];
  for (const [key, value] of Object.entries(schedules || {})) {
    if (value === null || value === undefined) continue;
    const spec = SCHEDULE_DOCUMENTS[key];
    if (!spec && NOT_ATTACHED[key]?.(value)) continue;
    if (!spec) {
      problems.push(problem('UNSUPPORTED_SCHEDULE', `Schedule ${key} is on the return but MyCA cannot e-file it yet.`, 'Nothing was filed. File this return on paper or with a CPA until Schedule support is added.', 'forms'));
      continue;
    }
    const items = spec.repeats ? (Array.isArray(value) ? value : [value]) : [value];
    items.filter((item) => item && !item.belowMinimum).forEach((item, index) => {
      const lines = item.lines && typeof item.lines === 'object' ? item.lines : item;
      const text = spec.text ? Object.entries(spec.text).map(([field, name]) => el(name, item[field])).join('') : '';
      const amounts = orderedAmounts(Object.fromEntries(Object.entries(lines).filter(([k]) => !(spec.text && k in spec.text) && !NON_LINE_FIELDS.has(k))), spec.lines, `Schedule ${key}`, problems);
      const id = `${spec.element}${spec.repeats ? `-${index + 1}` : ''}`;
      if (amounts) docs.push(group(spec.element, text + amounts, ` documentId="${id}"`));
    });
  }
  return docs;
}

function w2Xml(w2s, problems) {
  return (w2s || []).map((w2, index) => {
    const ein = String(w2.ein || '').replace('-', '');
    if (!EIN.test(ein)) problems.push(problem('W2_EIN_INVALID', `W-2 ${index + 1} has no valid employer EIN.`, 'Copy box b from the W-2.', 'forms'));
    if (!String(w2.employerName || '').trim()) problems.push(problem('W2_EMPLOYER_MISSING', `W-2 ${index + 1} has no employer name.`, 'Copy box c from the W-2.', 'forms'));
    const amounts = Object.entries(W2_FIELDS).map(([field, name]) => {
      const value = w2[field];
      if (value === undefined || value === null) return '';
      if (!wholeDollars(value)) {
        problems.push(problem('NOT_WHOLE_DOLLARS', `W-2 ${index + 1} ${field} is ${value}; MeF amounts are whole dollars.`, 'The return engine must round W-2 amounts.', 'review'));
        return '';
      }
      return el(name, value);
    }).join('');
    return group('IRSW2', el('EmployerEIN', ein) + el('EmployerNameControlTxt', businessNameControl(w2.employerName)) + group('EmployerName', el('BusinessNameLine1Txt', String(w2.employerName || '').trim().slice(0, 75))) + amounts, ` documentId="IRSW2-${index + 1}"`);
  });
}

function paymentXml(payment, owed, problems) {
  if (!payment || payment.method !== 'direct_debit' || !(owed > 0)) return '';
  bankChecks(payment, 'payment', problems);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payment.date || ''))) problems.push(problem('PAYMENT_DATE_MISSING', 'The direct debit needs a payment date.', 'Pick a date on or before the due date.', 'sign'));
  if (!/^\d{10}$/.test(String(payment.phone || ''))) problems.push(problem('PAYMENT_PHONE_MISSING', 'The IRS needs a ten-digit daytime phone number for a direct debit.', 'Enter your daytime phone number.', 'sign'));
  return group('IRSPayment2', el('RoutingTransitNum', payment.routing) + el('BankAccountNum', payment.account) + el('BankAccountTypeCd', payment.accountType === 'savings' ? '2' : '1') + el('PaymentAmt', payment.amount ?? owed) + el('RequestedPaymentDt', payment.date) + el('TaxpayerDaytimePhoneNum', payment.phone), ' documentId="IRSPayment2"');
}

export function buildMefSubmission(computed, options = {}) {
  const problems = [];
  const ssnOf = typeof options.openSsn === 'function' ? options.openSsn : (value) => String(value || '');
  const c = computed || {};
  const taxYear = Number(c.taxYear);
  if (!Number.isInteger(taxYear) || taxYear < 2020) problems.push(problem('TAX_YEAR_INVALID', 'The return has no tax year.', 'Pick the tax year.', 'profile'));
  if (!FILING_STATUS_CODES[c.filingStatus]) problems.push(problem('FILING_STATUS_INVALID', 'The filing status is missing.', 'Answer the filing status question.', 'interview'));
  const efin = String(options.efin || '');
  const softwareId = String(options.softwareId || '');
  const submissionId = String(options.submissionId || '');
  if (!EFIN.test(efin)) problems.push(problem('EFIN_MISSING', 'MyCA has no EFIN configured.', 'This is a MyCA setup step, not yours; e-filing opens once MyCA is an authorized IRS e-file provider.', 'review'));
  if (!SOFTWARE_ID.test(softwareId)) problems.push(problem('SOFTWARE_ID_MISSING', 'MyCA has no IRS software ID configured.', 'This is a MyCA setup step; the software ID comes from IRS assurance testing.', 'review'));
  if (!SUBMISSION_ID.test(submissionId)) problems.push(problem('SUBMISSION_ID_INVALID', 'The submission ID is malformed.', 'Try filing again.', 'review'));
  const needsSpouse = c.filingStatus === 'mfj';
  const primarySsn = personChecks(c.taxpayer, 'taxpayer', 'profile', problems, ssnOf);
  const spouseSsn = needsSpouse || (c.filingStatus === 'mfs' && c.spouse) ? personChecks(c.spouse, 'spouse', 'profile', problems, ssnOf) : null;
  const address = addressChecks(c.address, problems);
  const signature = signatureElements(options.signature, needsSpouse, problems);
  const security = options.device ? group('FilingSecurityInformation', deviceGroup('AtSubmissionCreationGrp', options.device) + deviceGroup('AtSubmissionFilingGrp', options.device)) : '';
  const form1040 = form1040Xml(c, problems, ssnOf);
  const schedules = schedulesXml(c.schedules, problems);
  const w2s = w2Xml(c.w2s, problems);
  const payment = paymentXml(options.payment, Number(c.lines?.['37'] || 0), problems);
  if (problems.length) return { ok: false, error: 'RETURN_NOT_READY', problems };

  const tp = c.taxpayer;
  const filer = el('PrimarySSN', primarySsn) + el('SpouseSSN', spouseSsn) + el('NameLine1Txt', nameLine(tp, c.spouse, c.filingStatus)) + el('PrimaryNameControlTxt', nameControl(tp.lastName)) + (spouseSsn ? el('SpouseNameControlTxt', nameControl(c.spouse.lastName)) : '') + address;
  const documents = [form1040, ...schedules, ...w2s, payment].filter(Boolean);
  const timestamp = String(options.timestamp || '');
  const header = el('ReturnTs', timestamp) + el('TaxYr', taxYear) + el('TaxPeriodBeginDt', `${taxYear}-01-01`) + el('TaxPeriodEndDt', `${taxYear}-12-31`) + el('SoftwareId', softwareId) + el('SoftwareVersionNum', options.softwareVersion || '1.0') + group('OriginatorGrp', el('EFIN', efin) + el('OriginatorTypeCd', 'OnlineFiler')) + signature + el('ReturnTypeCd', '1040') + group('Filer', filer) + security;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Return xmlns="${MEF_NAMESPACE}" returnVersion="${MEF_SCHEMA_VERSION}"><ReturnHeader binaryAttachmentCnt="0">${header}</ReturnHeader><ReturnData documentCnt="${documents.length}">${documents.join('')}</ReturnData></Return>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><IRSSubmissionManifest xmlns="${MEF_NAMESPACE}">${el('SubmissionId', submissionId)}${el('EFIN', efin)}${el('TaxYr', taxYear)}${el('GovernmentCd', 'IRS')}${el('FederalSubmissionTypeCd', '1040')}${el('TaxPeriodBeginDt', `${taxYear}-01-01`)}${el('TaxPeriodEndDt', `${taxYear}-12-31`)}${el('TIN', primarySsn)}</IRSSubmissionManifest>`;
  return {
    ok: true,
    submissionId,
    taxYear,
    xml,
    manifest,
    returnHash: returnDigest(c),
    xmlSha256: createHash('sha256').update(xml).digest('hex'),
    documentCount: documents.length,
  };
}
