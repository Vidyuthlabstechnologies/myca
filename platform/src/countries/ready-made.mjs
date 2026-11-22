export const READY_MADE_KINDS = Object.freeze(['built-in', 'package', 'service', 'official-api']);
export const READY_MADE_DECISIONS = Object.freeze(['in-use', 'chosen', 'candidate', 'cross-check', 'reject']);
export const READY_MADE_NEEDS = Object.freeze(['formatting', 'identity', 'validation', 'e-invoice', 'filing', 'income-tax', 'indirect-tax', 'payments', 'bank-data', 'payroll-data', 'documents', 'messaging']);

const ALL = '*';
const CHECKED = '2026-11-11';

function entry(id, name, kind, need, countries, licence, url, decision, why, extra = {}) {
  return Object.freeze({ id, name, kind, need, countries: Object.freeze(countries), licence, url, decision, why, checked: CHECKED, ...extra });
}

export const READY_MADE = Object.freeze([
  entry('intl', 'Intl (CLDR data built into Node)', 'built-in', 'formatting', [ALL], 'Part of Node', 'https://nodejs.org/api/intl.html', 'in-use', 'Money, dates, number grouping and plural rules for every locale with no package. country.mjs formats money with it; the design system reads the same CLDR data.'),
  entry('dinero', 'dinero.js, currency.js, date-fns', 'package', 'formatting', [ALL], 'MIT', 'https://www.npmjs.com/package/dinero.js', 'reject', 'Amounts are whole minor units and dates are ISO strings; Intl and countries/kit cover the rest, so these would add weight for nothing.'),
  entry('stdnum', 'stdnum', 'package', 'identity', ['IN', 'US', 'CA', 'AU', 'MY'], 'MIT', 'https://www.npmjs.com/package/stdnum', 'candidate', 'Check digits and formats for national and tax numbers: PAN, GSTIN, Aadhaar, EIN, SSN, SIN, BN, ABN, TFN, the Malaysian NRIC and many more. Check the exact number is covered before relying on it; kit/check-digits has Luhn and weighted sums for the ones it lacks.', { port: 'tax-id-check', version: '1.17.0' }),
  entry('ajv', 'Ajv', 'package', 'validation', [ALL], 'MIT', 'https://www.npmjs.com/package/ajv', 'candidate', 'Full JSON Schema validation, for checking a return or an e-invoice against the schema a government publishes (ITR JSON, MyInvois JSON). The assistant argument schemas use the small validator in assistant-contract.mjs and do not need it.', { port: 'json-schema', version: '8.20.0' }),
  entry('zod', 'zod', 'package', 'validation', [ALL], 'MIT', 'https://www.npmjs.com/package/zod', 'reject', 'Tool arguments are already JSON Schema, which the model providers take as they are. A second schema language would have to be kept in step with it.'),
  entry('xml-crypto', 'xml-crypto', 'package', 'e-invoice', ['MY', 'AE', 'US'], 'MIT', 'https://www.npmjs.com/package/xml-crypto', 'candidate', 'XML digital signatures with canonicalisation, the part that is easy to get wrong by hand. Signed UBL e-invoices and other signed government XML need it.', { port: 'xml-signature', version: '6.4.0' }),
  entry('xadesjs', 'xadesjs', 'package', 'e-invoice', ['MY', 'AE'], 'MIT', 'https://www.npmjs.com/package/xadesjs', 'candidate', 'XAdES signatures on top of XML signatures. Pick this or xml-crypto after reading the signature page of the authority\'s SDK, not both.', { port: 'xml-signature', version: '3.1.0' }),
  entry('fast-xml-parser', 'fast-xml-parser', 'package', 'e-invoice', [ALL], 'MIT', 'https://www.npmjs.com/package/fast-xml-parser', 'candidate', 'Reads and writes XML without a native build. For UBL invoices and government acknowledgements when hand-built strings stop being enough.', { port: 'xml', version: '5.12.0' }),
  entry('ubl-builder', 'ubl-builder', 'package', 'e-invoice', ['MY', 'AE'], 'ISC', 'https://www.npmjs.com/package/ubl-builder', 'reject', 'Its own description says UBL 2.0; MyInvois and Peppol PINT are UBL 2.1 with national extensions, so the invoice is built from the authority\'s samples instead.'),
  entry('myinvois-sdk', 'LHDN MyInvois SDK', 'official-api', 'e-invoice', ['MY'], 'Free to use, no software licence', 'https://sdk.myinvois.hasil.gov.my/start/', 'chosen', 'The official API reference, UBL 2.1 samples in JSON and XML, code tables and a sandbox. MyCA signs in as the taxpayer\'s system or as an intermediary the taxpayer authorises.'),
  entry('quicko-sandbox', 'Sandbox by Quicko', 'service', 'filing', ['IN'], 'Commercial', 'https://developer.sandbox.co.in', 'in-use', 'The licensed route to GSTN, e-invoice, e-way bill, TDS and income tax data for India (owner decision 2026-11-09). See provider-catalog.mjs for what each endpoint maps to.'),
  entry('nic-irp', 'NIC e-invoice and e-way bill API', 'official-api', 'e-invoice', ['IN'], 'Government API', 'https://einvoice1.gst.gov.in', 'in-use', 'Direct IRN and e-way bill generation with the business\'s own API credentials (nic-client.mjs).'),
  entry('embedded-us-filer', 'Column Tax or April', 'service', 'filing', ['US'], 'Commercial', 'https://www.columntax.com', 'chosen', 'A ready-made authorised e-file provider for the 2027 season while MyCA\'s own EFIN and ATS testing run for 2028 (owner decision 2026-11-11). Which of the two is still open.'),
  entry('irs-mef', 'IRS Modernized e-File', 'official-api', 'filing', ['US'], 'Government API, needs an EFIN and ATS testing', 'https://www.irs.gov/e-file-providers/modernized-e-file-mef-internet-filing', 'candidate', 'MyCA\'s own transmission route, built and simulated in the e-file branch; live only after the licences in the US pack are held.'),
  entry('hmrc-mtd', 'HMRC Making Tax Digital APIs', 'official-api', 'filing', ['GB'], 'Government API, needs production credentials', 'https://developer.service.hmrc.gov.uk/api-documentation', 'candidate', 'Income tax and VAT submissions for the UK. Needs the production approval listed in the UK pack\'s licences.'),
  entry('peppol-asp', 'A Peppol Accredited Service Provider', 'service', 'e-invoice', ['AE'], 'Commercial', 'https://peppol.org', 'candidate', 'UAE e-invoicing must go through an accredited provider. Connect to one first; becoming one is a later decision. No provider is picked yet.'),
  entry('pint-ae', 'PINT AE specification (Ministry of Finance)', 'official-api', 'e-invoice', ['AE'], 'Government specification, free', 'https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoicing-Guidelines_V-1.0-23Feb2026.pdf', 'chosen', 'The UAE e-invoice is built to the Peppol PINT AE identifiers and fields in the Ministry guidelines (uae/einvoice.mjs) and checked before an ASP sees it; the ASP still validates against the full schematron.', { checked: '2026-11-14' }),
  entry('emaratax', 'EmaraTax', 'official-api', 'filing', ['AE'], 'Government portal', 'https://eservices.tax.gov.ae', 'reject', 'No filing API is published for software, so MyCA prepares the VAT 201 and Corporate Tax figures box by box and the business or its tax agent enters them on EmaraTax.', { checked: '2026-11-14' }),
  entry('policyengine', 'PolicyEngine (US, UK, Canada)', 'package', 'income-tax', ['US', 'GB', 'CA'], 'AGPL-3.0', 'https://github.com/PolicyEngine', 'cross-check', 'An independent open tax calculator. AGPL, so never embedded or imported; its published figures are a cross-check for MyCA\'s own engines in tests, as india-tax-guru is for India.'),
  entry('play-billing', 'Google Play Billing', 'service', 'payments', [ALL], 'Google Play terms', 'https://developer.android.com/google/play/billing', 'in-use', 'Required by Google for software subscriptions sold inside an Android app. packProblems refuses a software plan on anything else.'),
  entry('stripe', 'Stripe', 'service', 'payments', ['US', 'GB', 'CA', 'AU', 'AE', 'MY'], 'Commercial', 'https://docs.stripe.com', 'chosen', 'Cards for tax filing services, which Google exempts from Play billing. Called over HTTPS from cloud/, so no package is needed. Account approval for the US is still open.', { version: '23.1.0' }),
  entry('plaid', 'Plaid', 'service', 'bank-data', ['US', 'CA', 'GB'], 'Commercial', 'https://plaid.com/docs', 'in-use', 'Bank feeds for US books through us-connectors.mjs, called over HTTPS with no package.'),
  entry('account-aggregator', 'India Account Aggregator', 'official-api', 'bank-data', ['IN'], 'Regulated network', 'https://sahamati.org.in', 'in-use', 'Bank statements a customer shares through an Account Aggregator; aa-import.mjs reads the decrypted data file into the bank feed.'),
  entry('payroll-data', 'Pinwheel, Argyle, Plaid or Atomic', 'service', 'payroll-data', ['US'], 'Commercial', 'https://pinwheelapi.com', 'chosen', 'Pulls W-2 and pay data with the employee\'s consent so nobody types a W-2 (owner decision 2026-11-11). The provider is still being picked; the e-file branch documents Pinwheel.'),
  entry('gusto', 'Gusto', 'service', 'payroll-data', ['US'], 'Commercial', 'https://docs.gusto.com', 'in-use', 'Payroll summaries for US employers through us-connectors.mjs.'),
  entry('taxjar', 'TaxJar', 'service', 'indirect-tax', ['US'], 'Commercial', 'https://developers.taxjar.com', 'in-use', 'US sales tax rates by address through us-connectors.mjs, so MyCA does not maintain every local rate itself.'),
  entry('pdf-lib', 'pdf-lib', 'package', 'documents', [ALL], 'MIT', 'https://www.npmjs.com/package/pdf-lib', 'candidate', 'Fills the official PDF of a return. Last published in 2022, so check it still handles the authority\'s current forms before adopting.', { port: 'pdf-forms', version: '1.17.1' }),
  entry('libphonenumber', 'libphonenumber-js', 'package', 'identity', [ALL], 'MIT', 'https://www.npmjs.com/package/libphonenumber-js', 'candidate', 'Phone number formats for every country, for sign-in by phone outside India.', { port: 'phone-numbers', version: '1.13.16' }),
  entry('waha', 'WAHA', 'service', 'messaging', ['IN'], 'Open-source core, self-hosted', 'https://waha.devlike.pro', 'in-use', 'The WhatsApp gateway the owner chose over the Meta API (2026-11-09).'),
]);

export function readyMadeFor(need, country) {
  const code = String(country || '').trim().toUpperCase();
  return READY_MADE.filter((item) => item.need === need && item.decision !== 'reject' && (!code || item.countries.includes(ALL) || item.countries.includes(code)));
}

export function readyMadeProblems(list = READY_MADE) {
  const problems = [];
  const seen = new Set();
  for (const item of list) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item.id))) problems.push(`${item.id}: an id is lower case words joined by hyphens.`);
    if (seen.has(item.id)) problems.push(`${item.id}: listed twice.`);
    seen.add(item.id);
    if (!READY_MADE_KINDS.includes(item.kind)) problems.push(`${item.id}: kind is one of ${READY_MADE_KINDS.join(', ')}.`);
    if (!READY_MADE_NEEDS.includes(item.need)) problems.push(`${item.id}: need is one of ${READY_MADE_NEEDS.join(', ')}.`);
    if (!READY_MADE_DECISIONS.includes(item.decision)) problems.push(`${item.id}: decision is one of ${READY_MADE_DECISIONS.join(', ')}.`);
    if (!item.countries.length || !item.countries.every((code) => code === ALL || /^[A-Z]{2}$/.test(code))) problems.push(`${item.id}: countries are ISO codes, or * for every country.`);
    if (!/^https:\/\//.test(String(item.url))) problems.push(`${item.id}: an https link is required.`);
    if (typeof item.licence !== 'string' || !item.licence.trim()) problems.push(`${item.id}: say what licence or terms it comes under.`);
    if (typeof item.why !== 'string' || item.why.trim().length < 40) problems.push(`${item.id}: say why, in a sentence.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.checked))) problems.push(`${item.id}: the date it was checked is required.`);
    if (/\b(?:A?GPL|SSPL|BSL)\b/i.test(item.licence) && !['cross-check', 'reject'].includes(item.decision)) problems.push(`${item.id}: copyleft or source-available code is never embedded; it can only be a cross-check.`);
    if (item.kind === 'package' && item.decision === 'candidate' && !item.port) problems.push(`${item.id}: a package reaches the engines through a port; name it.`);
    if (item.kind === 'package' && item.decision === 'in-use') problems.push(`${item.id}: platform/ takes no packages. Install it in cloud/ and mark it chosen with its port.`);
  }
  return problems;
}
