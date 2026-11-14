import { planned } from './planned.mjs';

const BASE = planned({
  code: 'AE', name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', locale: 'en-AE', languages: ['en', 'ar'], minorUnit: 'fils', yearStartMonth: 1, yearLabel: 'tax period', taxId: 'TRN', taxName: 'VAT', requiresState: false, flavor: 'uae', timeZone: 'Asia/Dubai',
  residency: { rule: 'Beta and sandbox data is hosted in Google Cloud Doha (me-central1), the nearest Google region, a transfer abroad that Federal Decree-Law 45 of 2021 allows with safeguards. Google Cloud has no UAE region, so general launch needs an in-UAE host (AWS me-central-1 or Azure UAE North) or a confirmed owner decision. Thread decision 2026-11-14 under the owner\'s delegation of open choices.', regionPrefixes: ['me-central1'], defaultRegion: 'me-central1' },
  filing: [
    { id: 'vat', authority: 'Federal Tax Authority', route: 'Prepared in MyCA (VAT 201) and filed by the business or its registered tax agent on EmaraTax, which has no third-party filing API' },
    { id: 'corporate-tax', authority: 'Federal Tax Authority', route: 'Prepared in MyCA and filed by the business or its registered tax agent on EmaraTax' },
    { id: 'einvoice', authority: 'Ministry of Finance', route: 'PINT AE over Peppol through an Accredited Service Provider; sandbox until an ASP partner is signed' },
  ],
  segments: ['business', 'accountant'],
  licences: [
    { id: 'asp', authority: 'Ministry of Finance', what: 'An Accredited Service Provider partner for Peppol e-invoicing, or MyCA\'s own accreditation' },
    { id: 'in-country-host', authority: 'MyCA', what: 'A cloud with a UAE region (Google Cloud has none) or an owner decision on hosting' },
    { id: 'uae-entity', authority: 'A UAE free zone or mainland licensing authority', what: 'A UAE company or free-zone licence to contract with ASPs, tax agents and payment providers' },
    { id: 'tax-agent-partner', authority: 'Federal Tax Authority', what: 'A registered tax agent partner to review returns before customers file, since MyCA is not a tax agent' },
    { id: 'pdpl-notice', authority: 'UAE Data Office', what: 'A privacy notice and processing records under Federal Decree-Law 45 of 2021, and a cross-border transfer basis if data is hosted outside the UAE' },
  ],
});

export const UNITED_ARAB_EMIRATES = Object.freeze({
  ...BASE,
  status: 'beta',
  billing: Object.freeze({
    currency: 'AED',
    providers: Object.freeze(['play']),
    plans: Object.freeze([
      Object.freeze({ id: 'starter', kind: 'monthly', price: 299, sells: 'software', provider: 'play' }),
      Object.freeze({ id: 'business', kind: 'monthly', price: 799, sells: 'software', provider: 'play' }),
      Object.freeze({ id: 'firm', kind: 'monthly', price: 2499, sells: 'software', provider: 'play', review: 'For tax agents and accounting firms serving many UAE clients.' }),
    ]),
  }),
});
