import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rules } from '../../sprint-load.mjs';

const CODES = JSON.parse(readFileSync(new URL('./codes/lhdn-codes.json', import.meta.url), 'utf8'));
const MSIC = new Map(JSON.parse(readFileSync(new URL('./codes/msic-codes.json', import.meta.url), 'utf8')).msic);
const STATES = new Map(CODES.states);
const STATE_BY_NAME = new Map(CODES.states.map(([code, name]) => [name.toLowerCase(), code]));
const TAX_TYPES = new Map(CODES.taxTypes);
const CLASSIFICATIONS = new Map(CODES.classifications);
const PAYMENT_METHODS = new Map(CODES.paymentMethods);
const COUNTRIES = new Set(CODES.countries);
const CURRENCIES = new Set(CODES.currencies);
const UNITS = new Set(CODES.units);

export const DOCUMENT_TYPES = Object.freeze({
  invoice: '01',
  'credit-note': '02',
  'debit-note': '03',
  'refund-note': '04',
  'self-billed-invoice': '11',
  'self-billed-credit-note': '12',
  'self-billed-debit-note': '13',
  'self-billed-refund-note': '14',
});

export const SPECIAL_TINS = Object.freeze({
  'general-public': 'EI00000000010',
  'foreign-buyer': 'EI00000000020',
  'foreign-supplier': 'EI00000000030',
  government: 'EI00000000040',
});

const ID_SCHEMES = ['BRN', 'NRIC', 'PASSPORT', 'ARMY'];
const TIN = /^(?:IG\d{9,11}|(?:C|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|J|LE)\d{8,12}|EI\d{11})$/;
const PHONE = /^\+?[0-9]{8,15}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADJUSTMENTS = new Set(['02', '03', '04', '12', '13', '14']);
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export const LHDN_CODE_SOURCE = CODES.source;

export function stateCode(value) {
  const text = String(value || '').trim();
  if (STATES.has(text.padStart(2, '0'))) return text.padStart(2, '0');
  return STATE_BY_NAME.get(text.toLowerCase()) || '';
}

export function msicDescription(code) {
  return MSIC.get(String(code || '')) || '';
}

const text = (value) => [{ _: String(value) }];
const money = (value, currency) => [{ _: round2(value), currencyID: currency }];

function address(party) {
  const where = party.address || {};
  const lines = (Array.isArray(where.lines) && where.lines.length ? where.lines : ['NA']).slice(0, 3);
  return [{
    CityName: text(where.city || 'NA'),
    ...(where.postcode ? { PostalZone: text(where.postcode) } : {}),
    CountrySubentityCode: text(stateCode(where.state) || '17'),
    AddressLine: lines.map((line) => ({ Line: text(line) })),
    Country: [{ IdentificationCode: [{ _: String(where.country || 'MYS').toUpperCase(), listID: 'ISO3166-1', listAgencyID: '6' }] }],
  }];
}

function identifications(party, { supplier }) {
  const ids = [{ ID: [{ _: party.tin, schemeID: 'TIN' }] }];
  ids.push({ ID: [{ _: party.idValue || 'NA', schemeID: party.idType || 'BRN' }] });
  ids.push({ ID: [{ _: party.sst || 'NA', schemeID: 'SST' }] });
  if (supplier) ids.push({ ID: [{ _: party.ttx || 'NA', schemeID: 'TTX' }] });
  return ids;
}

function partyNode(party, { supplier }) {
  return {
    ...(supplier ? { IndustryClassificationCode: [{ _: party.msic, name: party.msicDescription || msicDescription(party.msic) }] } : {}),
    PartyIdentification: identifications(party, { supplier }),
    PostalAddress: address(party),
    PartyLegalEntity: [{ RegistrationName: text(party.name) }],
    Contact: [{ Telephone: text(party.phone || 'NA'), ...(party.email ? { ElectronicMail: text(party.email) } : {}) }],
  };
}

export function lineAmounts(line) {
  const quantity = Number(line.quantity ?? 1);
  const unitPrice = round2(line.unitPrice);
  const subtotal = round2(quantity * unitPrice);
  const discount = round2(line.discount || 0);
  const net = round2(subtotal - discount);
  const basisPoints = Number(line.taxRateBasisPoints || 0);
  const tax = line.taxType === 'E' || line.taxType === '06' ? 0 : round2(net * basisPoints / 10000);
  return { quantity, unitPrice, subtotal, discount, net, basisPoints, tax };
}

function lineNode(line, index, currency) {
  const amounts = lineAmounts(line);
  const taxCategory = {
    ID: text(line.taxType),
    ...(line.taxType === 'E' ? { TaxExemptionReason: text(line.exemptionReason || 'Exempt') } : {}),
    TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }],
  };
  return {
    ID: text(String(index + 1)),
    InvoicedQuantity: [{ _: amounts.quantity, unitCode: line.unitCode || 'C62' }],
    LineExtensionAmount: money(amounts.net, currency),
    ...(amounts.discount ? { AllowanceCharge: [{ ChargeIndicator: [{ _: false }], AllowanceChargeReason: text(line.discountReason || 'Discount'), Amount: money(amounts.discount, currency) }] } : {}),
    TaxTotal: [{
      TaxAmount: money(amounts.tax, currency),
      TaxSubtotal: [{ TaxableAmount: money(amounts.net, currency), TaxAmount: money(amounts.tax, currency), Percent: [{ _: amounts.basisPoints / 100 }], TaxCategory: [taxCategory] }],
    }],
    Item: [{
      CommodityClassification: [
        ...(line.tariffCode ? [{ ItemClassificationCode: [{ _: line.tariffCode, listID: 'PTC' }] }] : []),
        { ItemClassificationCode: [{ _: line.classification, listID: 'CLASS' }] },
      ],
      Description: text(line.description),
    }],
    Price: [{ PriceAmount: money(amounts.unitPrice, currency) }],
    ItemPriceExtension: [{ Amount: money(amounts.subtotal, currency) }],
  };
}

function partyProblems(party, role, { supplier }) {
  const problems = [];
  const add = (field, why) => problems.push({ field: `${role}.${field}`, why });
  if (!party || typeof party !== 'object') return [{ field: role, why: 'missing' }];
  if (!String(party.name || '').trim()) add('name', 'the registered name is required');
  if (!TIN.test(String(party.tin || ''))) add('tin', 'not an LHDN tax identification number; check it with validate_my_tin');
  if (!Object.values(SPECIAL_TINS).includes(party.tin)) {
    if (!ID_SCHEMES.includes(party.idType || 'BRN')) add('idType', `one of ${ID_SCHEMES.join(', ')}`);
    if (!String(party.idValue || '').trim()) add('idValue', 'the business registration, MyKad, passport or army number is required');
  }
  if (supplier) {
    if (!/^\d{5}$/.test(String(party.msic || ''))) add('msic', 'the five-digit MSIC 2008 activity code is required');
    else if (!MSIC.has(party.msic)) add('msic', 'not in the LHDN MSIC code table');
  }
  if (party.phone && !PHONE.test(String(party.phone).replace(/[\s-]/g, ''))) add('phone', 'digits with an optional leading +, 8 to 15 long');
  if (!party.phone && supplier) add('phone', 'the supplier contact number is required');
  const where = party.address || {};
  const country = String(where.country || 'MYS').toUpperCase();
  if (!COUNTRIES.has(country)) add('address.country', 'an ISO 3166-1 alpha-3 code');
  if (country === 'MYS' && !stateCode(where.state)) add('address.state', 'a Malaysian state name or LHDN state code 01 to 16');
  if (!String(where.city || '').trim()) add('address.city', 'the city is required');
  return problems;
}

export function documentProblems(input = {}) {
  const problems = [];
  const add = (field, why) => problems.push({ field, why });
  const type = DOCUMENT_TYPES[input.type || 'invoice'];
  if (!type) add('type', `one of ${Object.keys(DOCUMENT_TYPES).join(', ')}`);
  if (!String(input.number || '').trim() || String(input.number).length > 50) add('number', 'the invoice number, at most 50 characters');
  if (!ISO_DATE.test(String(input.issueDate || ''))) add('issueDate', 'YYYY-MM-DD, in UTC');
  if (!/^\d{2}:\d{2}:\d{2}Z$/.test(String(input.issueTime || ''))) add('issueTime', 'HH:MM:SSZ, in UTC');
  const currency = String(input.currency || 'MYR').toUpperCase();
  if (!CURRENCIES.has(currency)) add('currency', 'an ISO 4217 code');
  if (currency !== 'MYR' && !(Number(input.exchangeRate) > 0)) add('exchangeRate', 'needed when the invoice is not in ringgit');
  problems.push(...partyProblems(input.supplier, 'supplier', { supplier: true }));
  problems.push(...partyProblems(input.buyer, 'buyer', { supplier: false }));
  if (type && ADJUSTMENTS.has(type) && !(input.original && input.original.uuid)) add('original.uuid', 'a credit, debit or refund note names the LHDN UUID of the e-invoice it adjusts');
  if (input.paymentMethod && !PAYMENT_METHODS.has(input.paymentMethod)) add('paymentMethod', 'an LHDN payment method code 01 to 08');
  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (!lines.length) add('lines', 'at least one line');
  lines.forEach((line, index) => {
    const at = `lines[${index}]`;
    if (!String(line.description || '').trim()) add(`${at}.description`, 'required');
    if (!CLASSIFICATIONS.has(String(line.classification || ''))) add(`${at}.classification`, 'an LHDN classification code such as 022 (others)');
    if (!TAX_TYPES.has(String(line.taxType || ''))) add(`${at}.taxType`, `one of ${[...TAX_TYPES.keys()].join(', ')}`);
    if (line.unitCode && !UNITS.has(line.unitCode)) add(`${at}.unitCode`, 'a UN/ECE recommendation 20 unit code such as C62 (one)');
    if (!(Number(line.quantity ?? 1) > 0)) add(`${at}.quantity`, 'greater than zero');
    if (!Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) add(`${at}.unitPrice`, 'zero or more');
    if (line.taxType === 'E' && !String(line.exemptionReason || '').trim()) add(`${at}.exemptionReason`, 'say why the line is exempt');
  });
  if (input.consolidated && ISO_DATE.test(String(input.issueDate || ''))) {
    const mandate = rules.rule('my.einvoice.mandate', input.issueDate);
    if (mandate.ok) {
      const limit = mandate.record.value.consolidationLimitSen / 100;
      lines.forEach((line, index) => {
        if (lineAmounts(line).net + lineAmounts(line).tax > limit) add(`lines[${index}]`, `a transaction above RM${limit.toLocaleString('en-MY')} needs its own e-invoice, not a consolidated one`);
      });
    }
  }
  return problems;
}

export function buildMyInvoisDocument(input = {}) {
  const problems = documentProblems(input);
  if (problems.length) return { ok: false, error: 'EINVOICE_FIELDS_MISSING', problems };
  const currency = String(input.currency || 'MYR').toUpperCase();
  const lines = input.lines.map((line) => ({ ...line, ...lineAmounts(line) }));
  const net = round2(lines.reduce((sum, line) => sum + line.net, 0));
  const tax = round2(lines.reduce((sum, line) => sum + line.tax, 0));
  const byTaxType = new Map();
  for (const line of lines) {
    const row = byTaxType.get(line.taxType) || { taxable: 0, tax: 0 };
    row.taxable = round2(row.taxable + line.net);
    row.tax = round2(row.tax + line.tax);
    byTaxType.set(line.taxType, row);
  }
  const typeCode = DOCUMENT_TYPES[input.type || 'invoice'];
  const invoice = {
    ID: text(input.number),
    IssueDate: text(input.issueDate),
    IssueTime: text(input.issueTime),
    InvoiceTypeCode: [{ _: typeCode, listVersionID: '1.1' }],
    DocumentCurrencyCode: text(currency),
    TaxCurrencyCode: text('MYR'),
    ...(currency !== 'MYR' ? { TaxExchangeRate: [{ SourceCurrencyCode: text(currency), TargetCurrencyCode: text('MYR'), CalculationRate: [{ _: Number(input.exchangeRate) }] }] } : {}),
    ...(input.period ? { InvoicePeriod: [{ StartDate: text(input.period.from), EndDate: text(input.period.to), Description: text(input.period.frequency || 'Monthly') }] } : {}),
    ...(input.original && input.original.uuid ? { BillingReference: [{ InvoiceDocumentReference: [{ ID: text(input.original.number || input.original.uuid), UUID: text(input.original.uuid) }] }] } : {}),
    AccountingSupplierParty: [{ Party: [partyNode(input.supplier, { supplier: true })] }],
    AccountingCustomerParty: [{ Party: [partyNode(input.buyer, { supplier: false })] }],
    ...(input.paymentMethod ? { PaymentMeans: [{ PaymentMeansCode: text(input.paymentMethod) }] } : {}),
    TaxTotal: [{
      TaxAmount: money(tax, currency),
      TaxSubtotal: [...byTaxType.entries()].map(([code, row]) => ({
        TaxableAmount: money(row.taxable, currency),
        TaxAmount: money(row.tax, currency),
        TaxCategory: [{ ID: text(code), TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }] }],
      })),
    }],
    LegalMonetaryTotal: [{
      LineExtensionAmount: money(net, currency),
      TaxExclusiveAmount: money(net, currency),
      TaxInclusiveAmount: money(net + tax, currency),
      PayableAmount: money(net + tax, currency),
    }],
    InvoiceLine: input.lines.map((line, index) => lineNode(line, index, currency)),
  };
  const document = {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [invoice],
  };
  return { ok: true, document, totals: { net, tax, payable: round2(net + tax), currency } };
}

export function submissionEntry(document, codeNumber) {
  const json = JSON.stringify(document);
  return {
    format: 'JSON',
    document: Buffer.from(json, 'utf8').toString('base64'),
    documentHash: createHash('sha256').update(json, 'utf8').digest('hex'),
    codeNumber: String(codeNumber),
  };
}
