export const noArgs = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

export const lineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'qty', 'rate'],
  properties: {
    description: { type: 'string', minLength: 1 },
    hsn: { type: 'string' },
    qty: { type: 'number', exclusiveMinimum: 0 },
    unit: { type: 'string', maxLength: 20 },
    sku: { type: 'string', maxLength: 64 },
    batch: { type: 'string', maxLength: 20 },
    expiry: { type: 'string', pattern: '^([0-9]{4}-[0-9]{2}(-[0-9]{2})?|[0-9]{2}/[0-9]{4})$' },
    rate: { type: 'number', minimum: 0 },
    gstRate: { type: 'number', minimum: 0, maximum: 40 },
    taxable: { type: 'boolean' },
    supply: { type: 'string', enum: ['nil', 'exempt', 'non-gst'] },
    cessRate: { type: 'number', minimum: 0 },
    cessPerUnit: { type: 'number', minimum: 0 },
  },
};

export const salaryComponent = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'amount'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 40 },
    amount: { type: 'number', minimum: 0 },
  },
};

export const tdsProperties = {
  tdsSection: { type: 'string', enum: ['194A', '194C', '194I', '194J'] },
  tdsCategory: { type: 'string', enum: ['professional', 'technical', 'director'] },
  tdsAsset: { type: 'string', enum: ['building', 'plant'] },
  payeePan: { type: 'string', maxLength: 12 },
};

export const REGISTRATION_ARG = { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' };

export const documentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['partyName', 'lines'],
  properties: {
    partyName: { type: 'string', minLength: 1 },
    partyGstin: { type: 'string' },
    partyState: { type: 'string' },
    registrationGstin: REGISTRATION_ARG,
    date: { type: 'string' },
    lines: {
      type: 'array',
      minItems: 1,
      items: lineSchema,
    },
  },
};

export const US_PRIOR_YEAR = { type: 'object', additionalProperties: false, properties: { agi: { type: 'integer', minimum: -100000000000, maximum: 100000000000 }, pin: { type: 'string', pattern: '^[0-9]{5}$' } } };
export const US_IP_PIN = { type: 'string', pattern: '^[0-9]{6}$' };

export const INVOICE_ID_PATTERN = '^INV-(?:[A-Z]{2}[0-9]{4}-)?[0-9]{4,}$';
export const INVOICE_ID = { type: 'string', pattern: INVOICE_ID_PATTERN };

export function invoiceIdOr(prefixes) {
  return { type: 'string', pattern: `^(?:INV-(?:[A-Z]{2}[0-9]{4}-)?|(?:${prefixes.join('|')})-)[0-9]{4,}$` };
}

export const OFFLINE_DEVICE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$';
export const MAX_OFFLINE_ENTRIES = 20;
export const OFFLINE_RECEIPT_MODES = Object.freeze(['cash', 'upi', 'card', 'bank']);
