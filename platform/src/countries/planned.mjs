function planned({ code, name, currency, symbol, locale, minorUnit, yearStartMonth, yearLabel, taxId, requiresState, residency, flavor, filing, timeZone }) {
  return Object.freeze({
    code,
    name,
    status: 'planned',
    currency,
    symbol,
    locale,
    minorUnit,
    yearStartMonth,
    yearLabel,
    taxId,
    requiresState,
    residency: Object.freeze({ ...residency, regionPrefixes: Object.freeze(residency.regionPrefixes), timeZone }),
    app: Object.freeze({ flavor, androidId: `com.mldynamic.myca.${flavor}`, label: `MyCA ${code}`, edition: code }),
    billing: Object.freeze({ currency, providers: Object.freeze([]), plans: Object.freeze([]) }),
    filing: Object.freeze(filing.map((entry) => Object.freeze({ ...entry, liveSwitch: '', modules: Object.freeze([]) }))),
    taxModules: Object.freeze([]),
    knowledge: Object.freeze([]),
    compliance: Object.freeze([]),
    toolPolicy: 'shared-and-own',
    tools: Object.freeze([]),
  });
}

export const UNITED_KINGDOM = planned({
  code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', locale: 'en-GB', minorUnit: 'pence', yearStartMonth: 4, yearLabel: 'tax year', taxId: 'UTR', requiresState: false, flavor: 'uk', timeZone: 'Europe/London',
  residency: { rule: 'UK taxpayer data is hosted in the UK (UK GDPR, ICO registration).', regionPrefixes: ['europe-west2'], defaultRegion: 'europe-west2' },
  filing: [{ id: 'mtd-itsa', authority: 'HMRC', route: 'Making Tax Digital API (HMRC-recognised software)' }, { id: 'mtd-vat', authority: 'HMRC', route: 'Making Tax Digital API' }],
});

export const CANADA = planned({
  code: 'CA', name: 'Canada', currency: 'CAD', symbol: '$', locale: 'en-CA', minorUnit: 'cents', yearStartMonth: 1, yearLabel: 'tax year', taxId: 'BN', requiresState: true, flavor: 'ca', timeZone: 'America/Toronto',
  residency: { rule: 'Canadian taxpayer data is hosted in Canada (PIPEDA, Quebec Law 25).', regionPrefixes: ['northamerica-northeast'], defaultRegion: 'northamerica-northeast1' },
  filing: [{ id: 'netfile', authority: 'CRA', route: 'NETFILE (yearly certification)' }, { id: 'netfile-quebec', authority: 'Revenu Québec', route: 'NetFile Québec' }],
});

export const UNITED_ARAB_EMIRATES = planned({
  code: 'AE', name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', locale: 'en-AE', minorUnit: 'fils', yearStartMonth: 1, yearLabel: 'tax period', taxId: 'TRN', requiresState: false, flavor: 'uae', timeZone: 'Asia/Dubai',
  residency: { rule: 'UAE business data is hosted in the UAE; Google Cloud has no UAE region, so this pack needs an in-country host before launch.', regionPrefixes: [], defaultRegion: '' },
  filing: [{ id: 'vat-ct', authority: 'Federal Tax Authority', route: 'EmaraTax' }, { id: 'einvoice', authority: 'Ministry of Finance', route: 'Accredited Service Provider (Peppol)' }],
});

export const AUSTRALIA = planned({
  code: 'AU', name: 'Australia', currency: 'AUD', symbol: '$', locale: 'en-AU', minorUnit: 'cents', yearStartMonth: 7, yearLabel: 'financial year', taxId: 'ABN', requiresState: true, flavor: 'au', timeZone: 'Australia/Sydney',
  residency: { rule: 'Australian taxpayer data is hosted onshore (ATO DSP Operational Framework).', regionPrefixes: ['australia-southeast'], defaultRegion: 'australia-southeast1' },
  filing: [{ id: 'sbr', authority: 'ATO', route: 'Standard Business Reporting (DSP framework)' }],
});
