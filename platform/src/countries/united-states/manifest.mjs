const schema = (properties = {}, required = []) => Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(properties), ...(required.length ? { required: Object.freeze(required) } : {}) });
const taxYear = Object.freeze({ type: 'string', pattern: '^20[0-9]{2}$' });
const stateCode = Object.freeze({ type: 'string', pattern: '^[A-Za-z]{2}$' });
const amount = Object.freeze({ type: 'number' });
const incomeFields = ['wages', 'taxableInterest', 'usObligationInterest', 'ordinaryDividends', 'qualifiedDividends', 'capitalGain', 'iraTaxable', 'pensionTaxable', 'socialSecurityTaxable', 'unemployment', 'stateRefundTaxable', 'businessIncome', 'otherIncome', 'adjustments'];
const residencyEntry = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: Object.freeze(['state', 'residency']),
  properties: Object.freeze({
    state: stateCode,
    residency: Object.freeze({ type: 'string', enum: Object.freeze(['full-year', 'part-year', 'nonresident']) }),
    from: Object.freeze({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
    to: Object.freeze({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
    income: Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(Object.fromEntries(incomeFields.map((key) => [key, amount]))) }),
    answers: Object.freeze({ type: 'object' }),
    estimatedPayments: amount,
    extensionPayment: amount,
    otherWithheld: amount,
  }),
});

export const MANIFEST = Object.freeze({
  country: 'US',
  ruleFamilies: Object.freeze([
    Object.freeze({ key: 'us-state-returns', title: 'US state individual income tax returns', prefix: 'us.state-return.', watch: Object.freeze(['Each state revenue department\'s form instructions, published each December or January', 'State budget acts that change rates, deductions or credits', 'State inflation adjustments announced each autumn']) }),
  ]),
  tools: Object.freeze([
    Object.freeze({
      name: 'set_us_state_answers', title: 'Answer one state\'s questions',
      description: 'Save answers to one state\'s own questions for a tax year (from us_state_questions) without changing where you lived. Only the answers given change; give null to clear one. Writes the book after you confirm.',
      access: 'write',
      schema: schema({ taxYear, state: stateCode, answers: Object.freeze({ type: 'object' }) }, ['state', 'answers']),
    }),
    Object.freeze({
      name: 'set_us_state_residency', title: 'Say where you lived and worked',
      description: 'Save, for one tax year, each US state you lived in or earned income in: full-year resident, part-year resident with the dates, or nonresident, plus the income received there and the state\'s own questions (renter\'s credit, property tax paid, New York City residence and the like). Every state return is worked out from this.',
      access: 'write',
      schema: schema({ taxYear, states: Object.freeze({ type: 'array', minItems: 1, maxItems: 12, items: residencyEntry }) }, ['states']),
    }),
    Object.freeze({
      name: 'us_state_coverage', title: 'Which state returns MyCA prepares',
      description: 'The US states whose individual income tax returns MyCA prepares, the forms, the residencies handled and what each one leaves out, and the states with no income tax. Read-only.',
      access: 'read',
      schema: schema({}),
    }),
    Object.freeze({
      name: 'us_state_filing_package', title: 'State returns ready to e-file',
      description: 'The state returns for a tax year as the e-file partner receives them alongside the federal return: form, lines, amounts, due date and anything still blocking filing. Read-only; nothing is sent.',
      access: 'read',
      schema: schema({ taxYear, state: stateCode }),
    }),
    Object.freeze({
      name: 'us_state_questions', title: 'State questions to answer',
      description: 'The questions each state return asks beyond the federal return (rent paid, property tax, city of residence, health coverage, and so on) with the answers given so far. Read-only.',
      access: 'read',
      schema: schema({ taxYear, state: stateCode }),
    }),
    Object.freeze({
      name: 'us_state_returns', title: 'Your state income tax returns',
      description: 'Prepare every US state individual income tax return for a tax year from the federal Form 1040: resident, part-year and nonresident returns line by line, credit for tax paid to another state, reciprocal wage agreements, state withholding, and the refund or amount due for each state. Read-only.',
      access: 'read',
      schema: schema({ taxYear, state: stateCode }),
    }),
  ]),
});
