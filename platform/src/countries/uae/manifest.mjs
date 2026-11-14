const schema = (properties = {}, required = []) => Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(properties), ...(required.length ? { required: Object.freeze(required) } : {}) });
const object = { type: 'object' };
const list = { type: 'array', items: { type: 'object' } };
const text = { type: 'string' };
const number = { type: 'number' };
const flag = { type: 'boolean' };
const einvoiceFields = { type: text, number: text, issueDate: text, dueDate: text, currency: text, exchangeRate: number, buyer: object, seller: object, lines: list, original: object, transaction: object, paymentMeans: text, reverseChargeNarrative: text };

export const MANIFEST = Object.freeze({
  country: 'AE',
  capabilities: Object.freeze({
    'income-tax': Object.freeze({ status: 'building', roles: Object.freeze({ estimate: 'ae_ct_estimate', profile: 'set_ae_business_profile' }) }),
    'indirect-tax': Object.freeze({ status: 'building', roles: Object.freeze({ summary: 'ae_vat_registration', return: 'ae_vat_return' }) }),
    'e-invoice': Object.freeze({ status: 'building', roles: Object.freeze({ issue: 'issue_ae_einvoice', status: 'ae_einvoice_list' }) }),
    identity: Object.freeze({ status: 'building', roles: Object.freeze({ validate: 'validate_ae_trn' }) }),
  }),
  ruleFamilies: Object.freeze([
    Object.freeze({ key: 'ae-vat', title: 'UAE value added tax', prefix: 'ae.vat.', watch: Object.freeze(['FTA public clarifications and VAT guides', 'Cabinet Decisions amending the VAT Executive Regulation and the penalty schedule']) }),
    Object.freeze({ key: 'ae-corporate-tax', title: 'UAE corporate tax', prefix: 'ae.ct.', watch: Object.freeze(['Ministerial Decisions on Small Business Relief and Free Zone Persons', 'FTA Corporate Tax guides']) }),
    Object.freeze({ key: 'ae-einvoice', title: 'UAE electronic invoicing (PINT AE)', prefix: 'ae.einvoice.', watch: Object.freeze(['Ministry of Finance e-invoicing guidelines and PINT AE releases', 'Cabinet Decision 106 of 2025 amendments']) }),
  ]),
  tools: Object.freeze([
    Object.freeze({
      name: 'ae_business_profile', title: 'The saved UAE business profile',
      description: 'Read the business profile saved with set_ae_business_profile: legal names, TRN, trade licence, emirate, address, free zone and financial year end. Empty when none is saved. Read-only.',
      access: 'read',
      schema: schema({}),
    }),
    Object.freeze({
      name: 'ae_ct_estimate', title: 'Estimate UAE corporate tax',
      description: 'Corporate tax for one tax period: 0% up to AED 375,000 and 9% above, Small Business Relief when elected and open, Qualifying Free Zone Person at 0% on qualifying income, brought-forward losses capped at 75%, and the due date nine months after the period. The business files on EmaraTax. Read-only.',
      access: 'read',
      schema: schema({ periodStart: text, periodEnd: text, revenue: number, accountingProfit: number, exemptIncome: number, nonDeductibleExpenses: number, otherAdjustments: number, lossesBroughtForward: number, electSmallBusinessRelief: flag, revenueExceededInEarlierPeriod: flag, resident: flag, mneGroupRevenue: number, artificialSeparation: flag, qualifyingFreeZonePerson: flag, qualifyingIncome: number, nonQualifyingRevenue: number, foreignTaxCredit: number }, ['periodStart', 'periodEnd']),
    }),
    Object.freeze({
      name: 'ae_deadlines', title: 'UAE tax deadlines',
      description: 'The next VAT return and payment date, the corporate tax return date and the e-invoicing dates (appoint an Accredited Service Provider, go live) for the business\'s revenue, with days left. Read-only.',
      access: 'read',
      schema: schema({ today: text, vatPeriodEnd: text, ctPeriodEnd: text, revenue: number, government: flag }),
    }),
    Object.freeze({
      name: 'ae_einvoice_check', title: 'Check a UAE e-invoice',
      description: 'Build the PINT AE (Peppol) e-invoice or credit note for an invoice without sending it, list every missing or wrong field, and give the totals in the invoice currency and AED. The seller comes from the saved business profile when not given. Read-only.',
      access: 'read',
      schema: schema(einvoiceFields, ['number', 'buyer', 'lines']),
    }),
    Object.freeze({
      name: 'ae_einvoice_list', title: 'UAE e-invoices issued',
      description: 'List the e-invoices and credit notes issued from MyCA, with their UUID, status and whether they were sandbox or live. Read-only.',
      access: 'read',
      schema: schema({}),
    }),
    Object.freeze({
      name: 'ae_penalty_estimate', title: 'Estimate a UAE tax penalty',
      description: 'The administrative penalty for a late VAT return, late VAT payment, late corporate tax return or late corporate tax payment under the schedule in force from 14 April 2026. Read-only.',
      access: 'read',
      schema: schema({ kind: { type: 'string', enum: ['vat-late-return', 'vat-late-payment', 'ct-late-return', 'ct-late-payment'] }, dueDate: text, doneOn: text, taxUnpaid: number, repeatWithin24Months: flag }, ['kind', 'dueDate']),
    }),
    Object.freeze({
      name: 'ae_vat_registration', title: 'Must I register for UAE VAT?',
      description: 'Compare the last twelve months of taxable supplies, and those expected in the next 30 days, with the AED 375,000 mandatory and AED 187,500 voluntary thresholds. Read-only.',
      access: 'read',
      schema: schema({ taxableSuppliesLast12Months: { type: 'number', minimum: 0 }, expectedNext30Days: { type: 'number', minimum: 0 }, taxableExpensesLast12Months: { type: 'number', minimum: 0 }, date: text }),
    }),
    Object.freeze({
      name: 'ae_vat_return', title: 'Prepare the UAE VAT return',
      description: 'Fill the VAT 201 boxes for one tax period (written 2026-01/2026-03 or 2026-Q1) from sale and purchase lines: standard-rated sales by emirate, reverse charge, zero-rated, exempt, imports, recoverable input tax, and the payable or refundable total with the due date 28 days after the period. The business files it on EmaraTax. Read-only.',
      access: 'read',
      schema: schema({ period: text, lines: list, touristRefunds: object, customsImports: object, annualTurnover: number }, ['period', 'lines']),
    }),
    Object.freeze({
      name: 'issue_ae_einvoice', title: 'Issue a UAE e-invoice',
      description: 'Check and issue one PINT AE e-invoice or credit note through the Accredited Service Provider. In sandbox mode it is validated and recorded with a UUID but not sent; live sending waits for an ASP partner.',
      access: 'write',
      schema: schema(einvoiceFields, ['number', 'buyer', 'lines']),
    }),
    Object.freeze({
      name: 'set_ae_business_profile', title: 'Save the UAE business profile',
      description: 'Save the business\'s legal name in English and Arabic, TRN, trade licence, emirate, address, free zone status and financial year end, used on every VAT return, corporate tax estimate and e-invoice.',
      access: 'write',
      schema: schema({ name: text, nameAr: text, trn: text, tin: text, legalId: text, legalIdType: { type: 'string', enum: ['TL', 'EID', 'PAS', 'CD'] }, emirate: text, city: text, addressLine: text, freeZone: flag, freeZoneName: text, financialYearEnd: text, vatPeriod: { type: 'string', enum: ['monthly', 'quarterly'] } }, ['name', 'emirate']),
    }),
    Object.freeze({
      name: 'validate_ae_trn', title: 'Check a UAE TRN',
      description: 'Check that a Tax Registration Number has the FTA format (15 digits) and give its 10-digit TIN and Peppol endpoint (0235 and the TIN). Read-only; it does not query the FTA.',
      access: 'read',
      schema: schema({ trn: text }, ['trn']),
    }),
  ]),
});
