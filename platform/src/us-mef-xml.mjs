import { createHash } from 'node:crypto';
import { htmlEscape } from './text-safe.mjs';
import { canonicalJson } from './approvals.mjs';
import { MEF_NAMESPACE, FILING_STATUS_CODES, W2_FIELDS, SCHEDULE_B_ELEMENTS, SCHEDULE_D_GROUPS, CAPITAL_TOTALS, FORM_8949_ELEMENTS, SCHEDULE_EIC_ELEMENTS, FORM_8995_ROW, FORM_8962_MONTHLY, FORM_8962_POVERTY_TABLE, mefRelationshipCode, form1040MefLines, form1040MefOrder, scheduleMefDocuments, repeatedLines } from './us-mef-map.mjs';

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

function unmapped(where, line, problems) {
  problems.push(problem('UNMAPPED_LINE', `${where} line ${line} has no MeF element in MyCA yet.`, 'Nothing was dropped: MyCA stops rather than file a return without this line. Report it so the mapping is added.', 'review'));
}

function leaf(path, xml) {
  const parts = String(path).split('/');
  return { groups: parts.slice(0, -1), xml };
}

function nest(entries) {
  let out = '';
  let index = 0;
  while (index < entries.length) {
    const entry = entries[index];
    if (!entry.groups.length) {
      out += entry.xml;
      index += 1;
      continue;
    }
    const head = entry.groups[0];
    const inner = [];
    while (index < entries.length && entries[index].groups[0] === head) {
      inner.push({ groups: entries[index].groups.slice(1), xml: entries[index].xml });
      index += 1;
    }
    out += group(head, nest(inner));
  }
  return out;
}

function flatLines(lines, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(lines || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, flatLines(value, `${prefix}${key}.`));
    else out[`${prefix}${key}`] = value;
  }
  return out;
}

function lineValue(spec, line, value, where, problems) {
  if (spec.checkboxes?.includes(line)) return value === true || value === 'X' ? 'X' : '';
  if (spec.booleans?.includes(line)) {
    if (value === true || value === 'yes') return 'true';
    if (value === false || value === 'no') return 'false';
    return '';
  }
  if (spec.codes?.includes(line)) return String(value || '');
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(problem('NOT_WHOLE_DOLLARS', `${where} line ${line} is ${value}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
    return '';
  }
  if (spec.decimals?.includes(line)) return String(value);
  if (!wholeDollars(value)) {
    problems.push(problem('NOT_WHOLE_DOLLARS', `${where} line ${line} is ${value}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
    return '';
  }
  return String(spec.unsigned?.includes(line) ? Math.abs(value) : value);
}

function lineEntries(lines, spec, where, problems, { skip = [], extras = {} } = {}) {
  const flat = flatLines(lines);
  const order = spec.order || [];
  const skipped = new Set([...skip, ...(spec.ignore || []), ...(spec.omit || [])]);
  for (const line of Object.keys(flat)) {
    const value = flat[line];
    if (skipped.has(line) || skipped.has(line.split('.')[0]) || value === null || value === undefined || value === 0 || value === '' || value === false) continue;
    if (extras[line] === undefined && !spec.lines[line]) unmapped(where, line, problems);
  }
  const entries = [];
  for (const line of order) {
    if (extras[line] !== undefined) {
      if (extras[line]) entries.push({ groups: [], xml: extras[line] });
      continue;
    }
    const value = flat[line];
    if (skipped.has(line) || value === null || value === undefined || value === '' || (value === 0 && !spec.booleans?.includes(line))) continue;
    const text = lineValue(spec, line, value, where, problems);
    if (!text) continue;
    const path = spec.lines[line];
    const name = path.split('/').pop();
    entries.push(leaf(path, el(name, text)));
  }
  return entries;
}

function amountsXml(lines, spec, where, problems, options) {
  return nest(lineEntries(lines, spec, where, problems, options));
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
    const relationship = mefRelationshipCode(dep?.relationship);
    if (!relationship) problems.push(problem('RELATIONSHIP_INVALID', `The ${where}'s relationship "${dep?.relationship || ''}" is not one the IRS accepts.`, 'Pick the relationship from the list.', 'interview'));
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
  const repeated = repeatedLines(computed.taxYear, '1040');
  const amounts = amountsXml(lines, { lines: form1040MefLines(computed.taxYear), order: form1040MefOrder(computed.taxYear) }, 'Form 1040', problems, { skip: ['35a', ...repeated] });
  const refundXml = Number(lines['35a'] || 0) > 0 ? el('RefundAmt', lines['35a']) + deposit : '';
  const splitAt = amounts.indexOf('<AppliedToEsTaxAmt>') >= 0 ? amounts.indexOf('<AppliedToEsTaxAmt>') : (amounts.indexOf('<OwedAmt>') >= 0 ? amounts.indexOf('<OwedAmt>') : amounts.length);
  const deps = dependentsXml(computed.dependents, problems, ssnOf);
  const header = el('IndividualReturnFilingStatusCd', FILING_STATUS_CODES[computed.filingStatus]) + el('VirtualCurAcquiredDurTYInd', computed.digitalAssets ? 'true' : 'false') + el('PrimaryOccupationTxt', String(computed.taxpayer?.occupation || '').slice(0, 25)) + (computed.spouse ? el('SpouseOccupationTxt', String(computed.spouse.occupation || '').slice(0, 25)) : '');
  return group('IRS1040', header + deps + amounts.slice(0, splitAt) + refundXml + amounts.slice(splitAt), ' documentId="IRS1040"');
}

const NOT_ATTACHED = Object.freeze({
  EIC: (value) => !(Number(value?.credit) > 0) || !(Number(value?.qualifyingChildren) > 0),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function businessName(value) {
  return String(value || '').replace(/[^A-Za-z0-9&'()\- ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 75);
}

function personName(person) {
  return `${String(person?.firstName || '').trim()} ${String(person?.lastName || '').trim()}`.replace(/[^A-Za-z\- ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 35);
}

function ownerOf(ctx, owner) {
  return owner === 'spouse' ? { person: ctx.spouse, ssn: ctx.spouseSsn } : { person: ctx.taxpayer, ssn: ctx.primarySsn };
}

function personXml(spec, owner, ctx, where, problems) {
  const { person, ssn } = ownerOf(ctx, owner);
  if (!ssn) {
    problems.push(problem('SSN_INVALID', `${where} belongs to the ${owner === 'spouse' ? 'spouse' : 'taxpayer'}, whose SSN is missing.`, 'Add the SSN on the About you step.', 'profile'));
    return '';
  }
  return el(spec.person.name, personName(person)) + el(spec.person.ssn, ssn);
}

function eicXml(spec, value, ctx, problems) {
  const e = SCHEDULE_EIC_ELEMENTS;
  const wanted = Math.min(3, Number(value.qualifyingChildren) || 0);
  const children = (ctx.dependents || []).filter((dep) => dep && dep.eitcChild).slice(0, wanted);
  if (children.length < wanted) problems.push(problem('EIC_CHILD_DETAILS_MISSING', `Schedule EIC needs ${wanted} qualifying children but only ${children.length} have their details.`, 'Check each child\'s name, SSN, date of birth and months lived with you on the About you step.', 'profile'));
  const rowsXml = children.map((dep, index) => {
    const where = `Schedule EIC child ${index + 1}`;
    const ssn = ctx.ssnOf(dep.ssn);
    const born = /^\d{4}/.test(String(dep.dob || dep.dateOfBirth || '')) ? Number(String(dep.dob || dep.dateOfBirth).slice(0, 4)) : null;
    const relationship = mefRelationshipCode(dep.relationship);
    if (!ssnShapeValid(ssn)) problems.push(problem('SSN_INVALID', `${where} has no valid SSN.`, 'Re-enter the child\'s SSN on the About you step.', 'profile'));
    if (born === null) problems.push(problem('DEPENDENT_DOB_INVALID', `${where} has no date of birth.`, 'Add the child\'s date of birth on the About you step.', 'profile'));
    if (!relationship) problems.push(problem('RELATIONSHIP_INVALID', `${where}'s relationship "${dep.relationship || ''}" is not one the IRS accepts.`, 'Pick the relationship from the list.', 'interview'));
    const months = dep.bornOrDiedInYear ? 12 : Math.max(0, Math.min(12, Math.round(Number(dep.months ?? 12))));
    const olderThanEighteen = born !== null && Number(ctx.taxYear) - born >= 19;
    const entries = [
      leaf(e.firstName, el('PersonFirstNm', String(dep.firstName || '').trim().slice(0, 20))),
      leaf(e.lastName, el('PersonLastNm', String(dep.lastName || '').trim().slice(0, 20))),
      leaf(e.nameControl, el(e.nameControl, nameControl(dep.lastName))),
      leaf(e.ssn, el(e.ssn, ssn)),
      leaf(e.birthYear, el(e.birthYear, born)),
      ...(olderThanEighteen ? [leaf(e.student, el(e.student, dep.student ? 'true' : 'false'))] : []),
      ...(olderThanEighteen && !dep.student ? [leaf(e.disabled, el(e.disabled, dep.disabled ? 'true' : 'false'))] : []),
      leaf(e.relationship, el(e.relationship, relationship)),
      leaf(e.months, el(e.months, months)),
    ];
    return group(e.child, nest(entries));
  });
  return rowsXml.join('');
}

function scheduleBXml(spec, value, ctx, problems) {
  const b = SCHEDULE_B_ELEMENTS;
  const payerRows = (list, groupName, payerPath, amountName, what) => (Array.isArray(list) ? list : []).filter((row) => Number(row?.amount) > 0).map((row) => {
    const name = businessName(row.payer);
    if (!name) problems.push(problem('SCHEDULE_B_PAYER_MISSING', `A ${what} payer on Schedule B has no name.`, `Add the payer name on the ${what} form.`, 'forms'));
    if (!wholeDollars(row.amount)) problems.push(problem('NOT_WHOLE_DOLLARS', `Schedule B ${what} from ${name} is ${row.amount}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
    return group(groupName, nest([leaf(payerPath, el(payerPath.split('/').pop(), name)), leaf(amountName, el(amountName, row.amount))]));
  });
  const interest = payerRows(value.interest, b.interestGroup, b.interestPayer, b.interestAmount, 'interest');
  const dividends = payerRows(value.dividends, b.dividendGroup, b.dividendPayer, b.dividendAmount, 'dividend');
  const interestTotal = (value.interest || []).reduce((total, row) => total + (Number(row?.amount) > 0 ? Number(row.amount) : 0), 0);
  const dividendTotal = (value.dividends || []).reduce((total, row) => total + (Number(row?.amount) > 0 ? Number(row.amount) : 0), 0);
  if (Number(value[4] || 0) !== interestTotal || Number(value[6] || 0) !== dividendTotal) problems.push(problem('SCHEDULE_B_TOTAL_MISMATCH', 'The Schedule B totals do not equal the payers listed.', 'Check that every interest and dividend form has its amounts; nothing was filed.', 'forms'));
  if (typeof value.foreignAccounts !== 'boolean' || typeof value.foreignTrust !== 'boolean') problems.push(problem('SCHEDULE_B_PART_III_UNANSWERED', 'Schedule B Part III asks about foreign financial accounts and foreign trusts.', 'Answer the two foreign account and foreign trust questions in the interview.', 'interview'));
  if (value.foreignAccounts === true) problems.push(problem('SCHEDULE_B_FOREIGN_ACCOUNTS_NOT_COVERED', 'You had a foreign financial account; MyCA does not prepare the FinCEN Form 114 answers and country list for Schedule B line 7.', 'File this return with a CPA.', 'interview'));
  const amounts = (lines) => amountsXml(lines, spec, 'Schedule B', problems, { skip: ['interest', 'dividends', 'foreignAccounts', 'foreignTrust'] });
  const part1 = amounts({ 2: interestTotal, 4: value[4] });
  const part2 = amounts({ 6: value[6] });
  const part3 = (typeof value.foreignAccounts === 'boolean' ? el(b.foreignAccounts, String(value.foreignAccounts)) : '') + (typeof value.foreignTrust === 'boolean' ? el(b.foreignTrust, String(value.foreignTrust)) : '');
  return interest.join('') + part1 + dividends.join('') + part2 + part3;
}

function capitalTotals(rows) {
  return rows.reduce((t, row) => ({ proceeds: t.proceeds + Number(row.proceeds || 0), basis: t.basis + Number(row.basis || 0), adjustment: t.adjustment + Number(row.adjustment || 0), gain: t.gain + Number(row.gain || 0) }), { proceeds: 0, basis: 0, adjustment: 0, gain: 0 });
}

function capitalTotalsXml(totals) {
  return Object.entries(CAPITAL_TOTALS).map(([field, name]) => (field === 'adjustment' && !totals[field] ? '' : el(name, totals[field]))).join('');
}

function scheduleDXml(spec, value, ctx, problems) {
  const rowsOf = (box) => (Array.isArray(ctx.schedules?.[8949]) ? ctx.schedules[8949] : []).filter((row) => row.box === box);
  const boxGroup = (box) => {
    const list = rowsOf(box);
    return list.length ? group(SCHEDULE_D_GROUPS[box], capitalTotalsXml(capitalTotals(list))) : '';
  };
  const lines = value || {};
  const qof = typeof lines.qofDisposition === 'boolean' ? el('DisposeInvestmentQOFInd', String(lines.qofDisposition)) : '';
  if (typeof lines.qofDisposition !== 'boolean') problems.push(problem('SCHEDULE_D_QOF_UNANSWERED', 'Schedule D asks whether you disposed of any investment in a qualified opportunity fund.', 'Answer the qualified opportunity fund question in the interview.', 'interview'));
  if (lines.qofDisposition === true) problems.push(problem('FORM_8997_NOT_COVERED', 'You disposed of a qualified opportunity fund investment; MyCA does not prepare Form 8997.', 'File this return with a CPA.', 'interview'));
  const line15 = Number(lines[15] || 0);
  const line16 = Number(lines[16] || 0);
  const bothGains = line16 > 0 ? line15 > 0 : null;
  const extras = {
    'box.A': boxGroup('A'),
    'box.B': boxGroup('B'),
    'box.D': boxGroup('D'),
    'box.E': boxGroup('E'),
    q17: bothGains === null ? '' : el('STAndLTGainInd', String(bothGains)),
    q20: bothGains ? el('ZeroOrBlankInd', 'true') : '',
    q22: line16 < 0 || bothGains === false ? el('QualifiedDividendsInd', String(Number(ctx.lines?.['3a'] || 0) > 0)) : '',
  };
  return qof + amountsXml(lines, spec, 'Schedule D', problems, { extras });
}

function form8949Xml(spec, value, ctx, problems) {
  const f = FORM_8949_ELEMENTS;
  const rows = Array.isArray(value) ? value : [];
  const boxGroup = (box) => {
    const list = rows.filter((row) => row.box === box);
    if (!list.length) return '';
    const assets = list.map((row, index) => {
      const where = `Form 8949 box ${box} row ${index + 1}`;
      const description = String(row.description || '').trim().slice(0, 35);
      if (!description) problems.push(problem('FORM_8949_DESCRIPTION_MISSING', `${where} has no description of the property sold.`, 'Add the description (for example 100 sh XYZ) on the 1099-B.', 'forms'));
      if (!ISO_DATE.test(String(row.dateAcquired || ''))) problems.push(problem('FORM_8949_DATE_ACQUIRED_MISSING', `${where} has no date acquired.`, 'Add the date acquired from the 1099-B.', 'forms'));
      if (!ISO_DATE.test(String(row.dateSold || ''))) problems.push(problem('FORM_8949_DATE_SOLD_MISSING', `${where} has no date sold.`, 'Add the date sold from the 1099-B.', 'forms'));
      for (const field of ['proceeds', 'basis', 'adjustment', 'gain']) if (!wholeDollars(Number(row[field] || 0))) problems.push(problem('NOT_WHOLE_DOLLARS', `${where} ${field} is ${row[field]}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
      return group(f.asset, el(f.description, description) + el(f.acquired, row.dateAcquired) + el(f.sold, row.dateSold) + el(f.proceeds, Number(row.proceeds || 0)) + el(f.basis, Number(row.basis || 0)) + (row.adjustment ? el(f.code, row.code) + el(f.adjustment, row.adjustment) : '') + el(f.gain, Number(row.gain || 0)));
    });
    return group(box === 'A' || box === 'B' ? f.shortGroup : f.longGroup, el(f.boxIndicator[box], 'X') + assets.join('') + capitalTotalsXml(capitalTotals(list)));
  };
  const unknown = rows.filter((row) => !f.boxIndicator[row.box]);
  if (unknown.length) problems.push(problem('UNSUPPORTED_SCHEDULE', 'A Form 8949 row is in a box MyCA cannot e-file yet.', 'Nothing was filed. File this return on paper or with a CPA.', 'forms'));
  return ['A', 'B', 'D', 'E'].map(boxGroup).join('');
}

function form8995Xml(spec, value, ctx, problems) {
  const r = FORM_8995_ROW;
  const businesses = Array.isArray(value.businesses) ? value.businesses : [];
  if (businesses.length > 5) problems.push(problem('FORM_8995_TOO_MANY_BUSINESSES', 'Form 8995 line 1 has room for five businesses; this return has more.', 'File this return with a CPA.', 'review'));
  const rowsXml = businesses.slice(0, 5).map((row, index) => {
    const name = businessName(row.name);
    if (!name) problems.push(problem('FORM_8995_NAME_MISSING', `Form 8995 business ${index + 1} has no name.`, 'Name the business.', 'forms'));
    const { ssn } = ownerOf(ctx, row.owner);
    if (!wholeDollars(row.qbi)) problems.push(problem('NOT_WHOLE_DOLLARS', `Form 8995 business ${index + 1} is ${row.qbi}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
    return group(r.group, nest([leaf(r.name, el('BusinessNameLine1Txt', name)), leaf(r.ssn, el(r.ssn, ssn)), leaf(r.amount, el(r.amount, row.qbi))]));
  });
  return rowsXml.join('') + amountsXml(value, spec, 'Form 8995', problems);
}

function form8962Xml(spec, value, ctx, problems) {
  const m = FORM_8962_MONTHLY;
  const monthKeys = Object.keys(value).filter((key) => /^\d+$/.test(key) && Number(key) >= 12 && Number(key) <= 23);
  const monthly = monthKeys.sort((a, b) => Number(a) - Number(b)).map((key) => {
    const row = value[key] || {};
    const cells = Object.entries(m.columns).filter(([column]) => row[column] !== undefined && row[column] !== null).map(([column, name]) => {
      if (!wholeDollars(row[column])) problems.push(problem('NOT_WHOLE_DOLLARS', `Form 8962 line ${key} column ${column} is ${row[column]}; MeF amounts are whole dollars.`, 'The return engine must round this line before filing.', 'review'));
      return el(name, row[column]);
    }).join('');
    return group('MonthlyPTCCalculationGrp', el(m.month, String(row.month || '').toUpperCase()) + cells);
  }).join('');
  const lines = Object.fromEntries(Object.entries(value).filter(([key]) => !monthKeys.includes(key)));
  if (lines.povertyTable !== undefined) lines.povertyTable = FORM_8962_POVERTY_TABLE[lines.povertyTable] || '';
  if (value.povertyTable !== undefined && !lines.povertyTable) problems.push(problem('UNMAPPED_LINE', `Form 8962 line 4 poverty table "${value.povertyTable}" has no MeF code.`, 'Nothing was dropped: MyCA stops rather than file a return without this line. Report it so the mapping is added.', 'review'));
  return amountsXml(lines, spec, 'Form 8962', problems, { extras: { monthly } });
}

const BUILDERS = Object.freeze({ eic: eicXml, scheduleB: scheduleBXml, scheduleD: scheduleDXml, form8949: form8949Xml, form8995: form8995Xml, form8962: form8962Xml });

function genericXml(spec, item, ctx, problems, key) {
  const lines = item.lines && typeof item.lines === 'object' && !Array.isArray(item.lines) ? item.lines : item;
  const where = /^[0-9]{4}$/.test(key) ? `Form ${key}` : `Schedule ${key}`;
  const person = spec.person ? personXml(spec, item.owner, ctx, where, problems) : '';
  const text = spec.text ? Object.entries(spec.text).map(([field, name]) => el(name, item[field])).join('') : '';
  let coverage = '';
  if (spec.coverage) {
    const name = spec.coverage[lines[1]];
    if (lines[1] !== undefined && !name) problems.push(problem('UNMAPPED_LINE', `${where} line 1 coverage "${lines[1]}" has no MeF element in MyCA yet.`, 'Nothing was dropped: MyCA stops rather than file a return without this line. Report it so the mapping is added.', 'review'));
    coverage = name ? el(name, 'X') : '';
  }
  const skip = [...NON_LINE_FIELDS, ...Object.keys(spec.text || {}), ...repeatedLines(ctx.taxYear, key), ...(spec.coverage ? ['1'] : [])];
  const amounts = amountsXml(lines, spec, where, problems, { skip });
  return amounts ? person + text + coverage + amounts : '';
}

function schedulesXml(schedules, problems, ctx) {
  const docs = [];
  const documents = scheduleMefDocuments(ctx.taxYear);
  for (const [key, value] of Object.entries(schedules || {})) {
    if (value === null || value === undefined) continue;
    if (NOT_ATTACHED[key]?.(value)) continue;
    const spec = documents[key];
    if (!spec) {
      problems.push(problem('UNSUPPORTED_SCHEDULE', `Schedule ${key} is on the return but MyCA cannot e-file it yet.`, 'Nothing was filed. File this return on paper or with a CPA until Schedule support is added.', 'forms'));
      continue;
    }
    const items = spec.repeats ? (Array.isArray(value) ? value : [value]) : [value];
    items.filter((item) => item && !item.belowMinimum).forEach((item, index) => {
      const inner = spec.builder ? BUILDERS[spec.builder](spec, item, ctx, problems) : genericXml(spec, item, ctx, problems, key);
      const id = `${spec.element}${spec.repeats ? `-${index + 1}` : ''}`;
      if (inner) docs.push(group(spec.element, inner, ` documentId="${id}"`));
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
  const schedules = schedulesXml(c.schedules, problems, { taxYear, ssnOf, primarySsn, spouseSsn, taxpayer: c.taxpayer, spouse: c.spouse, dependents: c.dependents, lines: c.lines, schedules: c.schedules });
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
