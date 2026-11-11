import { planned } from './planned.mjs';

export const MALAYSIA = planned({
  code: 'MY', name: 'Malaysia', currency: 'MYR', symbol: 'RM', locale: 'en-MY', languages: ['en', 'ms'], minorUnit: 'sen', yearStartMonth: 1, yearLabel: 'year of assessment', taxId: 'TIN', taxName: 'SST', requiresState: false, flavor: 'my', timeZone: 'Asia/Kuala_Lumpur',
  residency: { rule: 'Malaysian taxpayer data is hosted in Malaysia where a cloud region exists. Google Cloud has no Malaysia region yet, so the owner picks between Google Cloud Singapore under the PDPA cross-border transfer rules and a cloud with a Malaysia region before launch.', regionPrefixes: [], defaultRegion: '' },
  filing: [
    { id: 'myinvois', authority: 'LHDN (IRBM)', route: 'MyInvois API, as the taxpayer\'s system or as an intermediary the taxpayer authorises' },
    { id: 'income-tax', authority: 'LHDN (IRBM)', route: 'Prepared in MyCA and filed by the taxpayer in MyTax e-Filing, which has no third-party API' },
    { id: 'sst', authority: 'Royal Malaysian Customs Department', route: 'Prepared in MyCA and filed by the business in MySST' },
  ],
  segments: ['business', 'individual'],
  licences: [
    { id: 'hosting-decision', authority: 'MyCA', what: 'An owner decision on where Malaysian data is hosted: Google Cloud Singapore or a cloud with a Malaysia region' },
    { id: 'myinvois-intermediary', authority: 'LHDN (IRBM)', what: 'MyInvois production credentials for the MyCA system, and each taxpayer adding MyCA as its intermediary in the MyInvois portal' },
    { id: 'signing-certificate', authority: 'A licensed Malaysian certification authority', what: 'An organisation digital certificate to sign e-invoices from document version 1.1' },
    { id: 'data-protection-officer', authority: 'Personal Data Protection Commissioner', what: 'A data protection officer and a breach notification process under the amended PDPA' },
  ],
});
