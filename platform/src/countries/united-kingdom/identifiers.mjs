import { weightedSum } from '../kit/index.mjs';

const UTR_WEIGHTS = [6, 7, 8, 9, 10, 5, 4, 3, 2];
const UTR_CHECK = '21987654321';
const VRN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2];
const NINO = /^(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/;
const POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ](?:\d[A-HJKPSTUW]?|\d{2}|[A-HK-Y]\d[ABEHMNPRV-Y]?|[A-HK-Y]\d{2}) ?\d[ABD-HJLNP-UW-Z]{2})$/;
const COMPANY_NUMBER = /^(?:\d{8}|(?:SC|NI|OC|SO|NC|R0|LP|SL|NL|FC|SF|NF|GE|IP|SP|RC|SR|NR|NO|SE|ES|GS|AC|SA|NA|CE|CS|PC|RS)\d{6})$/;

function compact(value) {
  return String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
}

export function normaliseUtr(value) {
  const text = compact(value).replace(/K$/, '');
  return /^\d{13}$/.test(text) ? text.slice(3) : text;
}

export function utrValid(value) {
  const text = normaliseUtr(value);
  if (!/^\d{10}$/.test(text)) return false;
  const sum = weightedSum(text.slice(1), UTR_WEIGHTS);
  return sum !== null && UTR_CHECK[sum % 11] === text[0];
}

export function normaliseNino(value) {
  return compact(value);
}

export function ninoValid(value) {
  return NINO.test(normaliseNino(value));
}

export function normaliseVrn(value) {
  return compact(value).replace(/^GB/, '');
}

export function vrnValid(value) {
  const text = normaliseVrn(value);
  const core = /^\d{12}$/.test(text) ? text.slice(0, 9) : text;
  if (!/^\d{9}$/.test(core) || /^0{9}$/.test(core)) return false;
  const sum = weightedSum(core.slice(0, 7), VRN_WEIGHTS) + Number(core.slice(7));
  return sum % 97 === 0 || (sum + 55) % 97 === 0;
}

export function postcodeValid(value) {
  return POSTCODE.test(String(value ?? '').toUpperCase().trim().replace(/\s+/g, ' '));
}

export function companyNumberValid(value) {
  return COMPANY_NUMBER.test(compact(value));
}

const CHECKS = Object.freeze({
  utr: { valid: utrValid, normalise: normaliseUtr, what: 'Unique Taxpayer Reference', why: 'A UTR is 10 digits and its first digit is a check digit over the other nine.' },
  nino: { valid: ninoValid, normalise: normaliseNino, what: 'National Insurance number', why: 'A National Insurance number is two letters, six digits and a final A, B, C or D; D, F, I, Q, U and V are never used as either prefix letter, O is never second, and BG, GB, KN, NK, NT, TN and ZZ are never issued.' },
  vrn: { valid: vrnValid, normalise: normaliseVrn, what: 'VAT registration number', why: 'A VAT number is 9 digits (12 for a branch), optionally after GB, and passes the HMRC modulus 97 check.' },
  postcode: { valid: postcodeValid, normalise: (value) => String(value ?? '').toUpperCase().trim().replace(/\s+/g, ' '), what: 'postcode', why: 'Not in a UK postcode format.' },
  company: { valid: companyNumberValid, normalise: compact, what: 'Companies House number', why: 'A company number is 8 digits, or a two-letter prefix such as SC or NI and 6 digits.' },
});

export const IDENTIFIER_KINDS = Object.freeze(Object.keys(CHECKS));

export function checkGbIdentifier(kind, value) {
  const check = CHECKS[kind];
  if (!check) return { ok: false, error: 'UNKNOWN_IDENTIFIER_KIND', kinds: IDENTIFIER_KINDS };
  const normalised = check.normalise(value);
  const valid = check.valid(value);
  return { ok: true, data: { kind, what: check.what, value: normalised, valid, ...(valid ? {} : { why: check.why }) } };
}
