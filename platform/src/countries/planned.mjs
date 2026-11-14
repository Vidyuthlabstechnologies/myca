export function planned({ code, name, currency, symbol, locale, languages, minorUnit, yearStartMonth, yearStartDay = 1, yearLabel, taxId, taxName, requiresState, residency, flavor, filing, timeZone, segments, licences }) {
  return Object.freeze({
    code,
    name,
    status: 'planned',
    currency,
    symbol,
    locale,
    languages: Object.freeze(languages),
    minorUnit,
    yearStartMonth,
    yearStartDay,
    yearLabel,
    taxId,
    taxName,
    requiresState,
    segments: Object.freeze(segments),
    residency: Object.freeze({ ...residency, regionPrefixes: Object.freeze(residency.regionPrefixes), timeZone }),
    app: Object.freeze({ flavor, androidId: `com.mldynamic.myca.${flavor}`, label: `MyCA ${code}`, edition: code }),
    billing: Object.freeze({ currency, providers: Object.freeze([]), plans: Object.freeze([]) }),
    filing: Object.freeze(filing.map((entry) => Object.freeze({ ...entry, liveSwitch: '', modules: Object.freeze([]) }))),
    licences: Object.freeze(licences.map((entry) => Object.freeze({ ...entry, status: 'needed' }))),
    taxModules: Object.freeze([]),
    knowledge: Object.freeze([]),
    compliance: Object.freeze([]),
    toolPolicy: 'shared-and-own',
    tools: Object.freeze([]),
  });
}

export const CANADA = planned({
  code: 'CA', name: 'Canada', currency: 'CAD', symbol: '$', locale: 'en-CA', languages: ['en', 'fr'], minorUnit: 'cents', yearStartMonth: 1, yearLabel: 'tax year', taxId: 'BN', taxName: 'GST/HST', requiresState: true, flavor: 'ca', timeZone: 'America/Toronto',
  residency: { rule: 'Canadian taxpayer data is hosted in Canada (PIPEDA, Quebec Law 25).', regionPrefixes: ['northamerica-northeast'], defaultRegion: 'northamerica-northeast1' },
  filing: [{ id: 'netfile', authority: 'CRA', route: 'NETFILE (yearly certification)' }, { id: 'netfile-quebec', authority: 'Revenu Québec', route: 'NetFile Québec' }],
  segments: ['individual', 'business'],
  licences: [
    { id: 'netfile-certification', authority: 'CRA', what: 'NETFILE certification, repeated each year: test returns in mid-November, confirmation letter before the season' },
    { id: 'revenu-quebec', authority: 'Revenu Québec', what: 'Authorisation then certification of the TP-1 software, needed only to serve Quebec residents' },
  ],
});

export const UNITED_ARAB_EMIRATES = planned({
  code: 'AE', name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', locale: 'en-AE', languages: ['en', 'ar'], minorUnit: 'fils', yearStartMonth: 1, yearLabel: 'tax period', taxId: 'TRN', taxName: 'VAT', requiresState: false, flavor: 'uae', timeZone: 'Asia/Dubai',
  residency: { rule: 'UAE business data is hosted in the UAE; Google Cloud has no UAE region, so this pack needs an in-country host before launch.', regionPrefixes: [], defaultRegion: '' },
  filing: [{ id: 'vat-ct', authority: 'Federal Tax Authority', route: 'EmaraTax' }, { id: 'einvoice', authority: 'Ministry of Finance', route: 'Accredited Service Provider (Peppol)' }],
  segments: ['business'],
  licences: [
    { id: 'asp', authority: 'Ministry of Finance', what: 'An Accredited Service Provider partner for Peppol e-invoicing, or MyCA\'s own accreditation' },
    { id: 'in-country-host', authority: 'MyCA', what: 'A cloud with a UAE region (Google Cloud has none) or an owner decision on hosting' },
  ],
});

export const AUSTRALIA = planned({
  code: 'AU', name: 'Australia', currency: 'AUD', symbol: '$', locale: 'en-AU', languages: ['en'], minorUnit: 'cents', yearStartMonth: 7, yearLabel: 'financial year', taxId: 'ABN', taxName: 'GST', requiresState: true, flavor: 'au', timeZone: 'Australia/Sydney',
  residency: { rule: 'Australian taxpayer data is hosted onshore (ATO DSP Operational Framework).', regionPrefixes: ['australia-southeast'], defaultRegion: 'australia-southeast1' },
  filing: [{ id: 'sbr', authority: 'ATO', route: 'Standard Business Reporting (DSP framework)' }],
  segments: ['business', 'accountant'],
  licences: [
    { id: 'dsp', authority: 'ATO', what: 'Digital Service Provider registration and the Operational Framework: ISO 27001 or self-assessment by category, MFA, onshore hosting, 12 months of audit logs' },
    { id: 'tax-agent', authority: 'Tax Practitioners Board', what: 'A registered tax agent, needed before any tailored advice or lodging for a fee' },
  ],
});
