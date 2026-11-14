const schema = (properties = {}, required = []) => Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(properties), ...(required.length ? { required: Object.freeze(required) } : {}) });
const HMRC = Object.freeze({ live: Object.freeze(['api.service.hmrc.gov.uk']), test: Object.freeze(['test-api.service.hmrc.gov.uk']) });
const taxYear = { type: 'string', pattern: '^\\d{4}-\\d{2}$' };
const money = { type: 'number' };
const device = { type: 'object' };
const lines = { type: 'array', items: { type: 'object' } };
const plans = { type: 'array', items: { type: 'string', enum: ['plan1', 'plan2', 'plan4', 'plan5', 'postgraduate'] } };
const approvalId = { type: 'string' };

export const MANIFEST = Object.freeze({
  country: 'GB',
  capabilities: Object.freeze({
    'income-tax': Object.freeze({ status: 'beta', roles: Object.freeze({ profile: 'set_gb_taxpayer', estimate: 'gb_tax_estimate', review: 'gb_itsa_quarter_check' }) }),
    'indirect-tax': Object.freeze({ status: 'beta', roles: Object.freeze({ summary: 'gb_vat_return_check', return: 'submit_gb_vat_return' }) }),
    filing: Object.freeze({ status: 'beta', roles: Object.freeze({ submit: 'submit_gb_itsa_update', status: 'gb_hmrc_status' }) }),
    identity: Object.freeze({ status: 'beta', roles: Object.freeze({ validate: 'validate_gb_identifier' }) }),
  }),
  ruleFamilies: Object.freeze([
    Object.freeze({ key: 'gb-income-tax', title: 'UK income tax, National Insurance and student loans', prefix: 'gb.income-tax.', watch: Object.freeze(['The Budget each autumn', 'Scottish Budget each winter', 'HMRC rates and allowances pages each April']) }),
    Object.freeze({ key: 'gb-ni', title: 'UK self-employed National Insurance', prefix: 'gb.ni.', watch: Object.freeze(['The Budget each autumn', 'HMRC rates and thresholds each April']) }),
    Object.freeze({ key: 'gb-student-loan', title: 'UK student loan repayment', prefix: 'gb.student-loan.', watch: Object.freeze(['Department for Education threshold announcements each January to April']) }),
    Object.freeze({ key: 'gb-cgt', title: 'UK capital gains tax', prefix: 'gb.cgt.', watch: Object.freeze(['The Budget each autumn']) }),
    Object.freeze({ key: 'gb-self-assessment', title: 'UK Self Assessment deadlines, payments on account and penalties', prefix: 'gb.sa.', watch: Object.freeze(['HMRC Self Assessment manual updates']) }),
    Object.freeze({ key: 'gb-vat', title: 'UK VAT rates, thresholds and schemes', prefix: 'gb.vat.', watch: Object.freeze(['The Budget each autumn', 'VAT Notices 700, 733, 731 and 732']) }),
    Object.freeze({ key: 'gb-mtd-it', title: 'Making Tax Digital for Income Tax', prefix: 'gb.mtd-it.', watch: Object.freeze(['MTD for Income Tax software developer newsletter', 'GOV.UK MTD for Income Tax guidance']) }),
    Object.freeze({ key: 'gb-penalties', title: 'UK late submission points and late payment penalties', prefix: 'gb.penalty-points.', watch: Object.freeze(['HMRC penalty reform guidance']) }),
    Object.freeze({ key: 'gb-late-payment', title: 'UK late payment penalties and interest', prefix: 'gb.late-payment.', watch: Object.freeze(['HMRC interest rate changes after each Bank of England rate decision']) }),
  ]),
  externalActions: Object.freeze([
    Object.freeze({ id: 'hmrc_fraud_headers_test', access: 'read', timeoutSeconds: 30, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_itsa_calculate', access: 'write', timeoutSeconds: 60, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_itsa_final_declaration', access: 'write', irreversible: true, timeoutSeconds: 60, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_itsa_read', access: 'read', timeoutSeconds: 30, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_itsa_submit', access: 'write', timeoutSeconds: 60, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_oauth_token', access: 'read', timeoutSeconds: 30, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_vat_read', access: 'read', timeoutSeconds: 30, hosts: HMRC }),
    Object.freeze({ id: 'hmrc_vat_submit', access: 'write', irreversible: true, timeoutSeconds: 60, hosts: HMRC }),
  ]),
  tools: Object.freeze([
    Object.freeze({
      name: 'connect_gb_hmrc', title: 'Connect to HMRC',
      description: 'Start connecting MyCA to HMRC for Making Tax Digital: gives the HMRC sign-in link where the taxpayer grants MyCA authority for VAT and Income Tax. Nothing is sent to HMRC until the code comes back.',
      access: 'write',
      schema: schema({ scopes: { type: 'array', items: { type: 'string' } } }),
    }),
    Object.freeze({
      name: 'disconnect_gb_hmrc', title: 'Disconnect from HMRC',
      description: 'Delete the HMRC access tokens MyCA holds for this business. Authority at HMRC itself is removed in the Government Gateway account.',
      access: 'write',
      schema: schema({}),
    }),
    Object.freeze({
      name: 'finish_gb_hmrc_connection', title: 'Finish connecting to HMRC',
      description: 'Finish the HMRC connection with the code and state HMRC sent back after sign-in; exchanges the code for tokens kept encrypted. Sandbox unless live calls are on.',
      access: 'write', providerCalls: true,
      schema: schema({ code: { type: 'string' }, state: { type: 'string' } }, ['code', 'state']),
    }),
    Object.freeze({
      name: 'gb_hmrc_status', title: 'HMRC connection and obligations',
      description: 'Whether MyCA is connected to HMRC, in which environment, when it last synced, the VAT and Income Tax obligations and calculations it pulled, and the fraud prevention header check. Read-only; sync to refresh.',
      access: 'read',
      schema: schema({}),
    }),
    Object.freeze({
      name: 'gb_itsa_quarter_check', title: 'Prepare an MTD Income Tax quarterly update',
      description: 'Build the cumulative quarterly update for a self-employment (from categorised transactions) or UK property business (from income and expense totals), in HMRC\'s fields, and list what is missing. Read-only; nothing is sent.',
      access: 'read',
      schema: schema({ kind: { type: 'string', enum: ['self-employment', 'uk-property'] }, taxYear, periodStartDate: { type: 'string' }, periodEndDate: { type: 'string' }, transactions: lines, consolidatedExpenses: { type: 'boolean' }, income: { type: 'object' }, expenses: { type: 'object' } }, ['kind', 'taxYear']),
    }),
    Object.freeze({
      name: 'gb_late_payment', title: 'UK late payment penalty and interest',
      description: 'Penalties and interest HMRC charges when VAT or MTD Income Tax is paid late: 3% at day 15, another 3% at day 30, then 10% a year, plus base rate plus 4% interest. Read-only.',
      access: 'read',
      schema: schema({ amount: money, dueBy: { type: 'string' }, paidOn: { type: 'string' }, bankRateBasisPoints: { type: 'integer' } }, ['amount', 'dueBy']),
    }),
    Object.freeze({
      name: 'gb_mtd_mandate', title: 'Must I use Making Tax Digital for Income Tax?',
      description: 'Compare qualifying income (self-employment turnover plus property income, before expenses) with the MTD for Income Tax thresholds of April 2026, 2027 and 2028. Read-only.',
      access: 'read',
      schema: schema({ selfEmploymentTurnover: money, propertyIncome: money, returnYear: taxYear }),
    }),
    Object.freeze({
      name: 'gb_mtd_periods', title: 'MTD Income Tax quarters and deadlines',
      description: 'The four cumulative quarterly update periods of a UK tax year, standard or calendar quarters, with each deadline and the final declaration date. Read-only.',
      access: 'read',
      schema: schema({ taxYear, calendarQuarters: { type: 'boolean' } }, ['taxYear']),
    }),
    Object.freeze({
      name: 'gb_penalty_points', title: 'HMRC late submission penalty points',
      description: 'Count late submission penalty points from a list of due and sent dates for VAT or MTD Income Tax, and say when the £200 penalty starts. Read-only.',
      access: 'read',
      schema: schema({ frequency: { type: 'string', enum: ['quarterly', 'monthly', 'annual'] }, regime: { type: 'string', enum: ['vat', 'itsa'] }, submissions: lines, today: { type: 'string' } }, ['submissions']),
    }),
    Object.freeze({
      name: 'gb_tax_calendar', title: 'UK tax deadlines for a tax year',
      description: 'Every Self Assessment, payment on account, MTD Income Tax and VAT deadline for one UK tax year in date order, from the saved taxpayer profile. Read-only.',
      access: 'read',
      schema: schema({ taxYear, vatStagger: { type: 'string', enum: ['1', '2', '3', 'monthly'] } }, ['taxYear']),
    }),
    Object.freeze({
      name: 'gb_tax_estimate', title: 'Estimate UK Self Assessment tax',
      description: 'Work out income tax (England, Wales, Northern Ireland or Scottish rates), Class 4 and voluntary Class 2 National Insurance, student loan, High Income Child Benefit Charge and capital gains tax for one tax year, with payments on account. Read-only; figures come from dated rules.',
      access: 'read',
      schema: schema({ taxYear, residence: { type: 'string', enum: ['england', 'wales', 'northern-ireland', 'scotland'] }, income: { type: 'object' }, taxPaid: { type: 'object' }, pensionContributionsNet: money, giftAidNet: money, childBenefit: money, studentLoans: plans, studentLoanDeducted: money, gains: { type: 'object' }, class2Voluntary: { type: 'boolean' }, overStatePensionAge: { type: 'boolean' }, blind: { type: 'boolean' }, marriageAllowance: { type: 'string', enum: ['transfer', 'receive'] }, paymentsOnAccountMade: money }, ['taxYear']),
    }),
    Object.freeze({
      name: 'gb_vat_registration', title: 'Must I register for UK VAT?',
      description: 'Check taxable turnover against the VAT registration threshold on the rolling 12-month and forward 30-day tests, or the deregistration threshold when registered. Read-only.',
      access: 'read',
      schema: schema({ last12Months: money, next30Days: money, next12Months: money, registered: { type: 'boolean' }, date: { type: 'string' } }),
    }),
    Object.freeze({
      name: 'gb_vat_return_check', title: 'Prepare a UK VAT return',
      description: 'Build the nine-box MTD VAT return from sales and purchase lines (standard or flat rate scheme) and list every box that breaks HMRC\'s rules, with the due date. Read-only; nothing is sent.',
      access: 'read',
      schema: schema({ periodKey: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, scheme: { type: 'string', enum: ['standard', 'flat-rate'] }, sales: lines, purchases: lines, flatRateBasisPoints: { type: 'integer' }, firstYearOfRegistration: { type: 'boolean' }, periodMonths: { type: 'integer' } }, ['periodKey']),
    }),
    Object.freeze({
      name: 'set_gb_taxpayer', title: 'Save the UK taxpayer details',
      description: 'Save the name, UTR, National Insurance number, VAT number, where the taxpayer lives (for Scottish rates), student loan plans and quarter choice used by the UK tools. Each number is checked first.',
      access: 'write',
      schema: schema({ name: { type: 'string' }, utr: { type: 'string' }, nino: { type: 'string' }, vrn: { type: 'string' }, residence: { type: 'string', enum: ['england', 'wales', 'northern-ireland', 'scotland'] }, studentLoans: plans, calendarQuarters: { type: 'boolean' }, vatStagger: { type: 'string', enum: ['1', '2', '3', 'monthly'] }, vatScheme: { type: 'string', enum: ['standard', 'flat-rate'] }, flatRateBasisPoints: { type: 'integer' } }),
    }),
    Object.freeze({
      name: 'submit_gb_final_declaration', title: 'Send the MTD final declaration',
      description: 'Send the Income Tax final declaration to HMRC for a tax year, using the intent-to-finalise calculation the taxpayer reviewed and their declaration that it is correct and complete. Cannot be undone. Sandbox unless live calls are on.',
      access: 'write', providerCalls: true, clientAddress: true,
      schema: schema({ taxYear, calculationId: { type: 'string' }, declaration: { type: 'boolean' }, device, approvalId }, ['taxYear', 'calculationId', 'declaration']),
    }),
    Object.freeze({
      name: 'submit_gb_itsa_update', title: 'Send an MTD Income Tax quarterly update',
      description: 'Send a cumulative quarterly update for one self-employment or UK property business to HMRC. It replaces the earlier update of the same tax year. Sandbox unless live calls are on.',
      access: 'write', providerCalls: true, clientAddress: true,
      schema: schema({ kind: { type: 'string', enum: ['self-employment', 'uk-property'] }, businessId: { type: 'string' }, taxYear, body: { type: 'object' }, device, approvalId }, ['kind', 'businessId', 'taxYear', 'body']),
    }),
    Object.freeze({
      name: 'submit_gb_vat_return', title: 'Send a UK VAT return',
      description: 'Send the nine-box VAT return for one obligation to HMRC through Making Tax Digital, after the business declares it true and complete. Cannot be undone; a correction goes on a later return. Sandbox unless live calls are on.',
      access: 'write', providerCalls: true, clientAddress: true,
      schema: schema({ vrn: { type: 'string' }, body: { type: 'object' }, declaration: { type: 'boolean' }, device, approvalId }, ['body', 'declaration']),
    }),
    Object.freeze({
      name: 'sync_gb_hmrc', title: 'Sync with HMRC',
      description: 'Pull VAT obligations (and optionally liabilities and payments), Income Tax businesses and quarterly obligations, a calculation, and the fraud prevention header check from HMRC into MyCA for a tax year. Sandbox unless live calls are on.',
      access: 'write', providerCalls: true, clientAddress: true,
      schema: schema({ taxYear, vrn: { type: 'string' }, nino: { type: 'string' }, includeVatAccount: { type: 'boolean' }, calculationId: { type: 'string' }, checkFraudHeaders: { type: 'boolean' }, device }),
    }),
    Object.freeze({
      name: 'trigger_gb_itsa_calculation', title: 'Ask HMRC for an Income Tax calculation',
      description: 'Ask HMRC to work out Income Tax and National Insurance from the updates sent so far: in-year, intent-to-finalise (before the final declaration) or intent-to-amend. Sandbox unless live calls are on.',
      access: 'write', providerCalls: true, clientAddress: true,
      schema: schema({ taxYear, calculationType: { type: 'string', enum: ['in-year', 'intent-to-finalise', 'intent-to-amend'] }, device }, ['taxYear']),
    }),
    Object.freeze({
      name: 'validate_gb_identifier', title: 'Check a UK tax number',
      description: 'Check the format and check digit of a UTR, National Insurance number, VAT registration number, postcode or Companies House number. Read-only; HMRC is not asked.',
      access: 'read',
      schema: schema({ kind: { type: 'string', enum: ['utr', 'nino', 'vrn', 'postcode', 'company'] }, value: { type: 'string' } }, ['kind', 'value']),
    }),
  ]),
});
