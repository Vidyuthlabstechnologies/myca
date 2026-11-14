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

export const UNITED_KINGDOM = planned({
  code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', locale: 'en-GB', languages: ['en'], minorUnit: 'pence', yearStartMonth: 4, yearStartDay: 6, yearLabel: 'tax year', taxId: 'UTR', taxName: 'VAT', requiresState: false, flavor: 'uk', timeZone: 'Europe/London',
  residency: { rule: 'UK taxpayer data is hosted in the UK (UK GDPR, ICO registration).', regionPrefixes: ['europe-west2'], defaultRegion: 'europe-west2' },
  filing: [{ id: 'mtd-itsa', authority: 'HMRC', route: 'Making Tax Digital API (HMRC-recognised software)' }, { id: 'mtd-vat', authority: 'HMRC', route: 'Making Tax Digital API' }],
  segments: ['business', 'individual'],
  licences: [
    { id: 'hmrc-production', authority: 'HMRC', what: 'Developer Hub production credentials: security questionnaire, fraud prevention headers, penetration test' },
    { id: 'ico-fee', authority: 'ICO', what: 'Data protection fee as a controller' },
  ],
});

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
