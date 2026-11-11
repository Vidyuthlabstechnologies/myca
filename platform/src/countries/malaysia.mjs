import { planned } from './planned.mjs';

export const MALAYSIA = planned({
  code: 'MY', name: 'Malaysia', currency: 'MYR', symbol: 'RM', locale: 'en-MY', languages: ['en', 'ms'], minorUnit: 'sen', yearStartMonth: 1, yearLabel: 'year of assessment', taxId: 'TIN', taxName: 'SST', requiresState: false, flavor: 'my', timeZone: 'Asia/Kuala_Lumpur',
  residency: { rule: 'Malaysian taxpayer data is hosted in Google Cloud Singapore (asia-southeast1), a transfer abroad allowed by PDPA section 129 as amended in 2024, until Google Cloud opens a Malaysia region. Owner decision 2026-11-11.', regionPrefixes: ['asia-southeast1'], defaultRegion: 'asia-southeast1' },
  filing: [
    { id: 'myinvois', authority: 'LHDN (IRBM)', route: 'MyInvois API, as the taxpayer\'s system or as an intermediary the taxpayer authorises' },
    { id: 'income-tax', authority: 'LHDN (IRBM)', route: 'Prepared in MyCA and filed by the taxpayer in MyTax e-Filing, which has no third-party API' },
    { id: 'sst', authority: 'Royal Malaysian Customs Department', route: 'Prepared in MyCA and filed by the business in MySST' },
  ],
  segments: ['business', 'individual'],
  licences: [
    { id: 'transfer-notice', authority: 'Personal Data Protection Commissioner', what: 'A privacy notice telling Malaysian users their data is stored in Singapore, with the PDPA section 129 basis for the transfer' },
    { id: 'myinvois-intermediary', authority: 'LHDN (IRBM)', what: 'MyInvois production credentials for the MyCA system, and each taxpayer adding MyCA as its intermediary in the MyInvois portal' },
    { id: 'signing-certificate', authority: 'A licensed Malaysian certification authority', what: 'An organisation digital certificate to sign e-invoices from document version 1.1' },
    { id: 'data-protection-officer', authority: 'Personal Data Protection Commissioner', what: 'A data protection officer and a breach notification process under the amended PDPA' },
  ],
});
