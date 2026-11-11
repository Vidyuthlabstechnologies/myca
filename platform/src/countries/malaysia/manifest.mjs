const schema = (properties = {}, required = []) => Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(properties), ...(required.length ? { required: Object.freeze(required) } : {}) });
const party = { type: 'object' };
const MYINVOIS_HOSTS = Object.freeze({ live: Object.freeze(['api.myinvois.hasil.gov.my']), test: Object.freeze(['preprod-api.myinvois.hasil.gov.my']) });
const lines = { type: 'array', items: { type: 'object' } };

export const MANIFEST = Object.freeze({
  country: 'MY',
  capabilities: Object.freeze({
    'income-tax': Object.freeze({ status: 'building', roles: Object.freeze({ estimate: 'my_tax_estimate' }) }),
    'indirect-tax': Object.freeze({ status: 'building', roles: Object.freeze({ summary: 'my_sst_registration', return: 'my_sst_return' }) }),
    'e-invoice': Object.freeze({ status: 'building', roles: Object.freeze({ issue: 'issue_my_einvoice', cancel: 'cancel_my_einvoice', status: 'my_einvoice_status' }) }),
    identity: Object.freeze({ status: 'building', roles: Object.freeze({ validate: 'validate_my_tin' }) }),
  }),
  ruleFamilies: Object.freeze([
    Object.freeze({ key: 'my-income-tax', title: 'Malaysia individual income tax', prefix: 'my.income-tax.', watch: Object.freeze(['The Budget each October', 'LHDN return form programme each January']) }),
    Object.freeze({ key: 'my-sst', title: 'Malaysia sales and service tax', prefix: 'my.sst.', watch: Object.freeze(['The Budget each October', 'Royal Malaysian Customs SST guides and rate orders']) }),
    Object.freeze({ key: 'my-einvoice', title: 'Malaysia e-invoice (MyInvois)', prefix: 'my.einvoice.', watch: Object.freeze(['LHDN e-Invoice Guideline and Specific Guideline updates', 'MyInvois SDK release notes']) }),
  ]),
  tools: Object.freeze([
    Object.freeze({
      name: 'cancel_my_einvoice', title: 'Cancel a Malaysian e-invoice',
      description: 'Cancel an e-invoice LHDN has validated, within 72 hours of validation, with a reason. Goes through the action gate: sandbox unless live calls are on, and production needs the accountant\'s approval.',
      access: 'write',
      schema: schema({ uuid: { type: 'string' }, reason: { type: 'string' }, approvalId: { type: 'string' } }, ['uuid', 'reason']),
    }),
    Object.freeze({
      name: 'issue_my_einvoice', title: 'Issue a Malaysian e-invoice',
      description: 'Check, sign and submit one e-invoice, credit, debit or refund note to LHDN MyInvois. The supplier comes from the saved e-invoice profile when not given. Sandbox unless live calls are on; production needs the accountant\'s approval.',
      access: 'write',
      schema: schema({ type: { type: 'string' }, number: { type: 'string' }, issueDate: { type: 'string' }, issueTime: { type: 'string' }, currency: { type: 'string' }, exchangeRate: { type: 'number' }, buyer: party, supplier: party, lines, original: party, paymentMethod: { type: 'string' }, consolidated: { type: 'boolean' }, approvalId: { type: 'string' } }, ['number', 'buyer', 'lines']),
    }),
    Object.freeze({
      name: 'my_einvoice_check', title: 'Check a Malaysian e-invoice',
      description: 'Build the MyInvois UBL 2.1 document for an invoice without sending it, and list every missing or wrong field against the LHDN code tables, with the totals. Read-only.',
      access: 'read',
      schema: schema({ type: { type: 'string' }, number: { type: 'string' }, issueDate: { type: 'string' }, issueTime: { type: 'string' }, currency: { type: 'string' }, exchangeRate: { type: 'number' }, buyer: party, supplier: party, lines, original: party, paymentMethod: { type: 'string' }, consolidated: { type: 'boolean' } }, ['number', 'buyer', 'lines']),
    }),
    Object.freeze({
      name: 'my_einvoice_status', title: 'Malaysian e-invoice status',
      description: 'Read an LHDN submission by its submission UID: whether each document is valid, invalid or still in progress. Read-only.',
      access: 'read',
      schema: schema({ submissionUid: { type: 'string' } }, ['submissionUid']),
    }),
    Object.freeze({
      name: 'my_sst_rate', title: 'Malaysian SST rate',
      description: 'The service tax rate for a service category, or the sales tax rate, on a date, from the dated rules. Read-only.',
      access: 'read',
      schema: schema({ kind: { type: 'string', enum: ['service', 'sales'] }, category: { type: 'string' }, rateBasisPoints: { type: 'number' }, date: { type: 'string' } }, ['date']),
    }),
    Object.freeze({
      name: 'my_sst_registration', title: 'Must I register for SST?',
      description: 'Compare the last twelve months of taxable services or goods with the registration threshold for that kind of business. Read-only.',
      access: 'read',
      schema: schema({ kind: { type: 'string', enum: ['service', 'sales'] }, category: { type: 'string' }, last12Months: { type: 'number', minimum: 0 }, date: { type: 'string' } }, ['last12Months', 'date']),
    }),
    Object.freeze({
      name: 'my_sst_return', title: 'Prepare the SST-02 return',
      description: 'Total sales tax and service tax for one two-month taxable period (written 2026-01/2026-02) from the lines given, with the due date. The business files it in MySST. Read-only.',
      access: 'read',
      schema: schema({ period: { type: 'string' }, lines }, ['period', 'lines']),
    }),
    Object.freeze({
      name: 'my_tax_estimate', title: 'Estimate Malaysian income tax',
      description: 'Income tax for a resident or non-resident individual for one year of assessment: reliefs capped by the dated rules, the RM400 rebate, zakat and PCB already deducted, ending in tax to pay or a refund. The taxpayer files in MyTax. Read-only.',
      access: 'read',
      schema: schema({ yearOfAssessment: { type: 'string' }, resident: { type: 'boolean' }, income: { type: 'object' }, reliefs: { type: 'object' }, spouseHasIncome: { type: 'boolean' }, zakat: { type: 'number', minimum: 0 }, monthlyTaxDeductionsPaid: { type: 'number', minimum: 0 } }, ['yearOfAssessment', 'income']),
    }),
    Object.freeze({
      name: 'set_my_einvoice_profile', title: 'Save the e-invoice supplier details',
      description: 'Save the business\'s own MyInvois details (registered name, TIN, BRN, SST number, MSIC code, phone, address) so every e-invoice uses them.',
      access: 'write',
      schema: schema({ name: { type: 'string' }, tin: { type: 'string' }, idType: { type: 'string' }, idValue: { type: 'string' }, sst: { type: 'string' }, ttx: { type: 'string' }, msic: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: party }, ['name', 'tin', 'idValue', 'msic', 'phone', 'address']),
    }),
    Object.freeze({
      name: 'validate_my_tin', title: 'Check a Malaysian TIN',
      description: 'Check a tax identification number with its BRN, MyKad, passport or army number against LHDN. Read-only.',
      access: 'read',
      schema: schema({ tin: { type: 'string' }, idType: { type: 'string', enum: ['BRN', 'NRIC', 'PASSPORT', 'ARMY'] }, idValue: { type: 'string' } }, ['tin', 'idValue']),
    }),
  ]),
  externalActions: Object.freeze([
    Object.freeze({ id: 'myinvois_cancel', access: 'write', irreversible: true, hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_login', access: 'write', hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_status', access: 'read', hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_submit', access: 'write', irreversible: true, hosts: MYINVOIS_HOSTS }),
    Object.freeze({ id: 'myinvois_tin_validate', access: 'read', hosts: MYINVOIS_HOSTS }),
  ]),
});
