export const MANIFEST = Object.freeze({
  country: '*',
  capabilities: Object.freeze({
    profile: Object.freeze({ status: 'live', roles: Object.freeze({ country: 'country_profile' }) }),
  }),
  ruleFamilies: Object.freeze([]),
  tools: Object.freeze([
    Object.freeze({
      name: 'country_profile',
      title: 'Country profile',
      description: 'What MyCA does for this business\'s country: currency, languages, when the tax year starts, the tax year a date falls in, who the app serves, how returns and invoices reach the government, and which parts (income tax, indirect tax, e-invoice, payroll) are built. Read-only.',
      access: 'read',
      schema: Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ date: Object.freeze({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }) }) }),
    }),
  ]),
});
