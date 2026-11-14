import { emirateOf, fail, toFils, toDirhams, isIsoDate, ruleOn, percentOf } from './common.mjs';
import { checkTrn, checkTin } from './trn.mjs';

export const TAX_CATEGORIES = Object.freeze({
  S: Object.freeze({ basisPoints: 500, name: 'Standard rate' }),
  Z: Object.freeze({ basisPoints: 0, name: 'Zero rated' }),
  E: Object.freeze({ basisPoints: 0, name: 'Exempt from VAT' }),
  O: Object.freeze({ basisPoints: 0, name: 'Outside the scope of VAT' }),
  AE: Object.freeze({ basisPoints: 0, name: 'Reverse charge' }),
});
export const LEGAL_ID_TYPES = Object.freeze(['TL', 'EID', 'PAS', 'CD']);
export const ITEM_TYPES = Object.freeze(['G', 'S', 'B']);
const TRANSACTION_FLAGS = Object.freeze(['freeZone', 'deemedSupply', 'marginScheme', 'eCommerce', 'summaryInvoice', 'disclosedAgent', 'continuousSupply', 'exports']);
const ENDPOINT = /^\d{4}:[A-Za-z0-9.-]{1,50}$/;
const CURRENCY = /^[A-Z]{3}$/;

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function amountText(fils) {
  return toDirhams(fils).toFixed(2);
}

function mandateRule() {
  return ruleOn('ae.einvoice.mandate', '2026-07-01');
}

export function transactionCode(flags = {}) {
  return TRANSACTION_FLAGS.map((name) => (flags && flags[name] === true ? '1' : '0')).join('');
}

function partyProblems(party, prefix, { seller }) {
  const problems = [];
  if (!party || typeof party !== 'object') return [{ field: prefix, why: seller ? 'Save the business profile first (name, TRN, trade licence, address).' : 'The buyer is required.' }];
  if (!String(party.name || '').trim()) problems.push({ field: `${prefix}.name`, why: 'The registered legal name is required.' });
  const country = String(party.country || 'AE').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) problems.push({ field: `${prefix}.country`, why: 'Use the two-letter ISO country code.' });
  if (party.trn) {
    const trn = checkTrn(party.trn);
    if (!trn.valid) problems.push({ field: `${prefix}.trn`, why: trn.why });
  }
  if (party.tin && !checkTin(party.tin).valid) problems.push({ field: `${prefix}.tin`, why: 'A TIN is the first 10 digits of the TRN.' });
  if (country === 'AE') {
    if (!String(party.addressLine || '').trim()) problems.push({ field: `${prefix}.addressLine`, why: 'The first address line is required.' });
    if (!String(party.city || '').trim()) problems.push({ field: `${prefix}.city`, why: 'The city is required.' });
    if (!emirateOf(party.emirate)) problems.push({ field: `${prefix}.emirate`, why: 'The emirate is required: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.' });
  }
  if (seller) {
    if (!party.trn && !party.tin) problems.push({ field: `${prefix}.trn`, why: 'The seller\'s TRN, or its TIN when not VAT registered, is required.' });
    if (!String(party.legalId || '').trim()) problems.push({ field: `${prefix}.legalId`, why: 'The trade licence (or Emirates ID, passport or Cabinet Decision) number is required.' });
    if (!LEGAL_ID_TYPES.includes(String(party.legalIdType || 'TL'))) problems.push({ field: `${prefix}.legalIdType`, why: `The legal registration type is one of ${LEGAL_ID_TYPES.join(', ')}.` });
  }
  return problems;
}

function tinOf(party) {
  if (party.tin && checkTin(party.tin).valid) return String(party.tin).replace(/[\s-]/g, '');
  const trn = party.trn ? checkTrn(party.trn) : null;
  return trn && trn.valid ? trn.tin : '';
}

function buyerEndpoint(buyer, flags, rule, warnings) {
  if (buyer.endpoint) return String(buyer.endpoint);
  const tin = tinOf(buyer);
  if (tin) return `${rule.value.endpointScheme}:${tin}`;
  if (flags.deemedSupply === true) return `${rule.value.endpointScheme}:${rule.value.deemedSupplyBuyer}`;
  if (String(buyer.country || 'AE').toUpperCase() !== 'AE') return `${rule.value.endpointScheme}:${rule.value.exportBuyerNoPeppol}`;
  warnings.push('The buyer has no TIN, so the invoice goes to the FTA endpoint for buyers not yet on the network. Ask the buyer for its TRN.');
  return `${rule.value.endpointScheme}:${rule.value.domesticBuyerNotOnNetwork}`;
}

export function buildPintAe(input = {}) {
  const rule = mandateRule();
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.einvoice.mandate' });
  const problems = [];
  const warnings = [];
  const type = input.type === 'credit-note' ? 'credit-note' : input.type === undefined || input.type === 'invoice' ? 'invoice' : null;
  if (!type) problems.push({ field: 'type', why: 'The document is an invoice or a credit-note.' });
  const buyer = input.buyer || null;
  if (buyer && buyer.consumer === true) return fail('OUT_OF_SCOPE', { hint: 'Sales to consumers are outside UAE e-invoicing for now. Issue a normal tax invoice (a simplified one up to AED 10,000).' });
  const number = String(input.number || '').trim();
  if (!number) problems.push({ field: 'number', why: 'The invoice number is required and must be unique.' });
  if (number.length > 50) problems.push({ field: 'number', why: 'Keep the invoice number to 50 characters.' });
  if (!isIsoDate(input.issueDate)) problems.push({ field: 'issueDate', why: 'Write the issue date as YYYY-MM-DD.' });
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
    if (!isIsoDate(input.dueDate)) problems.push({ field: 'dueDate', why: 'Write the due date as YYYY-MM-DD.' });
    else if (isIsoDate(input.issueDate) && input.dueDate < input.issueDate) problems.push({ field: 'dueDate', why: 'The payment due date cannot be before the issue date.' });
  }
  const currency = String(input.currency || 'AED').toUpperCase();
  if (!CURRENCY.test(currency)) problems.push({ field: 'currency', why: 'Use the ISO 4217 currency code.' });
  const rate = currency === 'AED' ? 1 : Number(input.exchangeRate);
  if (currency !== 'AED' && !(Number.isFinite(rate) && rate > 0)) problems.push({ field: 'exchangeRate', why: 'A foreign-currency invoice needs the AED exchange rate, because VAT and totals are also shown in AED.' });
  problems.push(...partyProblems(input.seller, 'seller', { seller: true }));
  problems.push(...partyProblems(buyer, 'buyer', { seller: false }));
  const flags = input.transaction || {};
  if (type === 'credit-note' && (!input.original || !String(input.original.number || '').trim())) problems.push({ field: 'original.number', why: 'A credit note names the invoice it corrects.' });
  if (buyer && buyer.endpoint && !ENDPOINT.test(String(buyer.endpoint))) problems.push({ field: 'buyer.endpoint', why: 'A Peppol endpoint is a four-digit scheme, a colon and the identifier (0235:1234567890).' });
  if (buyer && buyer.vatRegistered === true && String(buyer.country || 'AE').toUpperCase() === 'AE' && !buyer.trn) problems.push({ field: 'buyer.trn', why: 'A tax invoice to a VAT-registered buyer shows the buyer\'s TRN.' });

  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (!lines.length) problems.push({ field: 'lines', why: 'At least one line is required.' });
  const built = [];
  const categories = new Map();
  lines.forEach((line, at) => {
    const where = `lines[${at}]`;
    if (!line || typeof line !== 'object') {
      problems.push({ field: where, why: 'Each line is an object.' });
      return;
    }
    const name = String(line.name || line.description || '').trim();
    if (!name) problems.push({ field: `${where}.name`, why: 'Name the goods or service.' });
    const quantity = line.quantity === undefined ? 1 : Number(line.quantity);
    if (!(Number.isFinite(quantity) && quantity > 0)) problems.push({ field: `${where}.quantity`, why: type === 'credit-note' ? 'Give the credited quantity as a positive number.' : 'Quantity must be more than zero; to reduce an invoice, issue a credit note.' });
    const priceFils = toFils(line.unitPrice);
    if (priceFils === null || priceFils < 0) problems.push({ field: `${where}.unitPrice`, why: 'The net unit price is a number of AED or the invoice currency, not negative.' });
    const discountFils = line.discount === undefined ? 0 : toFils(line.discount);
    if (discountFils === null || discountFils < 0) problems.push({ field: `${where}.discount`, why: 'A discount is a positive amount.' });
    const category = String(line.taxCategory || 'S').toUpperCase();
    if (!TAX_CATEGORIES[category]) problems.push({ field: `${where}.taxCategory`, why: `The tax category is one of ${Object.keys(TAX_CATEGORIES).join(', ')}.` });
    const itemType = String(line.itemType || 'S').toUpperCase();
    if (!ITEM_TYPES.includes(itemType)) problems.push({ field: `${where}.itemType`, why: 'The item type is G (goods), S (services) or B (both).' });
    if ((category === 'E' || category === 'O' || category === 'Z') && !String(line.exemptionReason || '').trim()) warnings.push(`Line ${at + 1}: give the reason for ${TAX_CATEGORIES[category]?.name.toLowerCase() || 'this category'} (for example "Export of services").`);
    if (category === 'AE' && !String(input.reverseChargeNarrative || line.exemptionReason || '').trim()) problems.push({ field: `${where}.exemptionReason`, why: 'A reverse-charge line needs the narrative that the buyer accounts for the VAT, and the type of goods.' });
    if (!(Number.isFinite(quantity) && quantity > 0) || priceFils === null || priceFils < 0 || !TAX_CATEGORIES[category] || discountFils === null || discountFils < 0) return;
    const gross = Math.round(quantity * priceFils);
    if (discountFils > gross) {
      problems.push({ field: `${where}.discount`, why: 'The discount is larger than the line amount.' });
      return;
    }
    const net = gross - discountFils;
    built.push({ id: String(at + 1), name, description: String(line.description || name), quantity, unitCode: String(line.unitCode || 'EA'), priceFils, discountFils, net, category, itemType, exemptionReason: String(line.exemptionReason || '') });
    const sum = categories.get(category) || { net: 0 };
    sum.net += net;
    categories.set(category, sum);
  });
  if (String(buyer?.country || 'AE').toUpperCase() !== 'AE' && built.some((line) => line.category === 'S')) warnings.push('Supplies to a buyer outside the UAE are often zero rated (exports); check the standard-rated lines.');
  if (problems.length) return fail('EINVOICE_INVALID', { problems, warnings });

  const breakdown = [...categories.entries()].map(([category, sum]) => ({ category, basisPoints: TAX_CATEGORIES[category].basisPoints, net: sum.net, tax: percentOf(sum.net, TAX_CATEGORIES[category].basisPoints) }));
  const net = breakdown.reduce((total, row) => total + row.net, 0);
  const tax = breakdown.reduce((total, row) => total + row.tax, 0);
  const payable = net + tax;
  const toAed = (fils) => (currency === 'AED' ? fils : Math.round(fils * rate));
  const endpoint = buyerEndpoint(buyer, flags, rule, warnings);
  const sellerTin = tinOf(input.seller);
  const totals = { currency, net: toDirhams(net), tax: toDirhams(tax), payable: toDirhams(payable), taxAed: toDirhams(toAed(tax)), payableAed: toDirhams(toAed(payable)) };
  const document = {
    specification: rule.value.specification,
    profile: rule.value.profile,
    type,
    typeCode: type === 'credit-note' ? '381' : '380',
    transactionCode: transactionCode(flags),
    number,
    issueDate: input.issueDate,
    dueDate: input.dueDate || null,
    currency,
    sellerEndpoint: `${rule.value.endpointScheme}:${sellerTin}`,
    buyerEndpoint: endpoint,
    lines: built.map((line) => ({ ...line, netAed: toDirhams(toAed(line.net)), vatAed: toDirhams(toAed(percentOf(line.net, TAX_CATEGORIES[line.category].basisPoints))) })),
    breakdown: breakdown.map((row) => ({ category: row.category, percent: row.basisPoints / 100, net: toDirhams(row.net), tax: toDirhams(row.tax) })),
  };
  const xml = pintAeXml({ input, type, number, currency, flags, endpoint, sellerTin, built, breakdown, net, tax, payable, toAed, rule });
  return { ok: true, totals, document, xml, warnings };
}

function partyXml(tag, party, endpoint) {
  const emirate = emirateOf(party.emirate);
  const country = String(party.country || 'AE').toUpperCase();
  const [scheme, id] = endpoint.split(':');
  const trn = party.trn ? checkTrn(party.trn) : null;
  return [
    `<cac:${tag}><cac:Party>`,
    `<cbc:EndpointID schemeID="${escapeXml(scheme)}">${escapeXml(id)}</cbc:EndpointID>`,
    `<cac:PostalAddress>${party.addressLine ? `<cbc:StreetName>${escapeXml(party.addressLine)}</cbc:StreetName>` : ''}${party.city ? `<cbc:CityName>${escapeXml(party.city)}</cbc:CityName>` : ''}${emirate ? `<cbc:CountrySubentity>${emirate.subdivision}</cbc:CountrySubentity>` : ''}<cac:Country><cbc:IdentificationCode>${escapeXml(country)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`,
    trn && trn.valid ? `<cac:PartyTaxScheme><cbc:CompanyID>${trn.trn}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '',
    `<cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(party.name)}</cbc:RegistrationName>${party.legalId ? `<cbc:CompanyID schemeAgencyName="${escapeXml(party.legalIdType || 'TL')}">${escapeXml(party.legalId)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>`,
    `</cac:Party></cac:${tag}>`,
  ].join('');
}

function pintAeXml({ input, type, number, currency, flags, endpoint, sellerTin, built, breakdown, net, tax, payable, toAed, rule }) {
  const root = type === 'credit-note' ? 'CreditNote' : 'Invoice';
  const namespace = type === 'credit-note' ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const lineTag = type === 'credit-note' ? 'CreditNoteLine' : 'InvoiceLine';
  const quantityTag = type === 'credit-note' ? 'CreditedQuantity' : 'InvoicedQuantity';
  const typeTag = type === 'credit-note' ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
  const money = (fils, code = currency) => `currencyID="${code}">${amountText(fils)}`;
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${root} xmlns="${namespace}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `<cbc:CustomizationID>${rule.value.specification}</cbc:CustomizationID>`,
    `<cbc:ProfileID>${rule.value.profile}</cbc:ProfileID>`,
    `<cbc:ProfileExecutionID>${transactionCode(flags)}</cbc:ProfileExecutionID>`,
    `<cbc:ID>${escapeXml(number)}</cbc:ID>`,
    `<cbc:IssueDate>${input.issueDate}</cbc:IssueDate>`,
    input.dueDate && type === 'invoice' ? `<cbc:DueDate>${input.dueDate}</cbc:DueDate>` : '',
    `<cbc:${typeTag}>${type === 'credit-note' ? '381' : '380'}</cbc:${typeTag}>`,
    `<cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>`,
    currency === 'AED' ? '' : '<cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>',
    type === 'credit-note' ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${escapeXml(input.original.number)}</cbc:ID>${isIsoDate(input.original.issueDate) ? `<cbc:IssueDate>${input.original.issueDate}</cbc:IssueDate>` : ''}</cac:InvoiceDocumentReference></cac:BillingReference>` : '',
    partyXml('AccountingSupplierParty', input.seller, `${rule.value.endpointScheme}:${sellerTin}`),
    partyXml('AccountingCustomerParty', input.buyer, endpoint),
    `<cac:PaymentMeans><cbc:PaymentMeansCode>${escapeXml(input.paymentMeans || '30')}</cbc:PaymentMeansCode></cac:PaymentMeans>`,
    `<cac:TaxTotal><cbc:TaxAmount ${money(tax)}</cbc:TaxAmount>`,
    ...breakdown.map((row) => `<cac:TaxSubtotal><cbc:TaxableAmount ${money(row.net)}</cbc:TaxableAmount><cbc:TaxAmount ${money(row.tax)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${row.category}</cbc:ID><cbc:Percent>${(row.basisPoints / 100).toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`),
    '</cac:TaxTotal>',
    currency === 'AED' ? '' : `<cac:TaxTotal><cbc:TaxAmount ${money(toAed(tax), 'AED')}</cbc:TaxAmount></cac:TaxTotal>`,
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount ${money(net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount ${money(net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount ${money(payable)}</cbc:TaxInclusiveAmount><cbc:PayableAmount ${money(payable)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`,
    ...built.map((line) => [
      `<cac:${lineTag}><cbc:ID>${line.id}</cbc:ID>`,
      `<cbc:${quantityTag} unitCode="${escapeXml(line.unitCode)}">${line.quantity}</cbc:${quantityTag}>`,
      `<cbc:LineExtensionAmount ${money(line.net)}</cbc:LineExtensionAmount>`,
      line.discountFils ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount ${money(line.discountFils)}</cbc:Amount></cac:AllowanceCharge>` : '',
      `<cac:Item><cbc:Description>${escapeXml(line.description)}</cbc:Description><cbc:Name>${escapeXml(line.name)}</cbc:Name>`,
      `<cac:ClassifiedTaxCategory><cbc:ID>${line.category}</cbc:ID><cbc:Percent>${(TAX_CATEGORIES[line.category].basisPoints / 100).toFixed(2)}</cbc:Percent>${line.exemptionReason ? `<cbc:TaxExemptionReason>${escapeXml(line.exemptionReason)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>`,
      `<cac:AdditionalItemProperty><cbc:Name>ItemType</cbc:Name><cbc:Value>${line.itemType}</cbc:Value></cac:AdditionalItemProperty>`,
      '</cac:Item>',
      `<cac:Price><cbc:PriceAmount ${money(line.priceFils)}</cbc:PriceAmount><cbc:BaseQuantity unitCode="${escapeXml(line.unitCode)}">1</cbc:BaseQuantity></cac:Price>`,
      `</cac:${lineTag}>`,
    ].join('')),
    `</${root}>`,
  ];
  return parts.filter(Boolean).join('');
}
