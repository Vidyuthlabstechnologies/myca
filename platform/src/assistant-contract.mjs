import { planReceiptWithoutInvoice } from './receipt-intent.mjs';
import { planExpenseFromChat, planRetagFromChat } from './expense-intent.mjs';
import { planPaymentFromChat } from './payment-intent.mjs';
import { planOweQuestion } from './owe-intent.mjs';
import { planFilingFromChat, saidPeriod } from './filing-intent.mjs';
import { planEmployeeFromChat } from './employee-intent.mjs';
import { planTdsFromChat } from './tds-intent.mjs';
import { planGstPayFromChat } from './gst-pay-intent.mjs';
import { planTransportFromChat, planAddressFromChat } from './eway-intent.mjs';
import { planPayrollFromChat } from './payroll-intent.mjs';
import { planUsFromChat } from './us-intent.mjs';
import { countryOf } from './country.mjs';
import { tdsReviewOf } from './tds-review.mjs';
import { parseQuarter } from './tds-return.mjs';
import { reviewOf } from './gst-review.mjs';
import { planReminderFromChat } from './reminder-intent.mjs';
import { planCollectionFromChat } from './collections-intent.mjs';
import { planPaymentRunFromChat } from './payment-run-intent.mjs';
import { planMonthCloseFromChat } from './month-close-intent.mjs';
import { planRestockFromChat } from './restock-intent.mjs';
import { planAdvanceTaxFromChat } from './advance-tax-intent.mjs';
import { planSupplierBankFromChat } from './supplier-bank-intent.mjs';
import { planReportFromChat } from './reports-intent.mjs';
import { planIntegrationFromChat } from './integrations-intent.mjs';
import { planCashFromChat } from './cash-intent.mjs';
import { planTermsFromChat, takeInvoiceTerms } from './terms-intent.mjs';
import { localToday } from './dates.mjs';
import { documentsOf } from './document-store.mjs';

const PERIOD_TOOLS = new Set(['gst_payable', 'export_tally', 'export_gstr1_json', 'prepare_gstr1', 'filing_pack', 'prepare_gstr3b']);

export function pendingFileContent(state) {
  const pending = state.pendingFile;
  if (!pending) return '';
  if (typeof pending.content === 'string') return pending.content;
  if (!pending.sha256) return '';
  const read = documentsOf(state).read(pending.sha256);
  if (typeof read === 'string') return read;
  return read && read.ok ? String(read.content ?? '') : '';
}
import { normalizeChat, parseDocument, documentProblemReply, saidNonPositiveAmount, receiptAmount, receiptDate, isPurchaseIntent, isSaleIntent, isQuestion, isNegated, ROUTES } from './intent.mjs';
import { confirmationIntent } from './chat-confirm.mjs';

const noArgs = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

const lineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'qty', 'rate'],
  properties: {
    description: { type: 'string', minLength: 1 },
    hsn: { type: 'string' },
    qty: { type: 'number', exclusiveMinimum: 0 },
    rate: { type: 'number', minimum: 0 },
    gstRate: { type: 'number', minimum: 0, maximum: 28 },
    taxable: { type: 'boolean' },
    supply: { type: 'string', enum: ['nil', 'exempt', 'non-gst'] },
  },
};

const salaryComponent = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'amount'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 40 },
    amount: { type: 'number', minimum: 0 },
  },
};

const tdsProperties = {
  tdsSection: { type: 'string', enum: ['194A', '194C', '194I', '194J'] },
  tdsCategory: { type: 'string', enum: ['professional', 'technical', 'director'] },
  tdsAsset: { type: 'string', enum: ['building', 'plant'] },
  payeePan: { type: 'string', maxLength: 12 },
};

const REGISTRATION_ARG = { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' };

const documentSchema = {
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

export const TOOL_ARG_SCHEMAS = {
  company_profile: noArgs,
  set_company: {
    type: 'object',
    additionalProperties: false,
    properties: {
      country: { type: 'string', enum: ['IN', 'US'] },
      ein: { type: 'string', pattern: '^([0-9]{2}-?[0-9]{7})?$' },
      name: { type: 'string' },
      gstin: { type: 'string', maxLength: 15 },
      pan: { type: 'string', maxLength: 10 },
      state: { type: 'string', maxLength: 2 },
      fy: { type: 'string', maxLength: 7 },
      address: { type: 'string' },
      city: { type: 'string' },
      pin: { type: 'string' },
      entityType: { type: 'string' },
      invoiceNumbering: { type: 'string', enum: ['continuous', 'yearly'] },
    },
  },
  list_clients: noArgs,
  add_client: {
    type: 'object',
    additionalProperties: false,
    required: ['clientId', 'name'],
    properties: {
      clientId: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      gstin: { type: 'string', maxLength: 15 },
      pan: { type: 'string', maxLength: 10 },
      state: { type: 'string', maxLength: 2 },
      entityType: { type: 'string' },
      turnover: { type: 'number', minimum: 0 },
      gstFrequency: { type: 'string' },
      auditRequired: { type: 'boolean' },
    },
  },
  set_active_client: {
    type: 'object',
    additionalProperties: false,
    required: ['clientId'],
    properties: { clientId: { type: 'string', minLength: 1 } },
  },
  list_documents: noArgs,
  save_document: {
    type: 'object',
    additionalProperties: false,
    required: ['content'],
    properties: {
      kind: { type: 'string' },
      fileName: { type: 'string' },
      contentType: { type: 'string' },
      content: { type: 'string', minLength: 1 },
    },
  },
  get_document: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId'],
    properties: { documentId: { type: 'string', minLength: 1 } },
  },
  lock_period: {
    type: 'object',
    additionalProperties: false,
    required: ['through'],
    properties: {
      through: { type: 'string', minLength: 10, maxLength: 10 },
      reason: { type: 'string' },
    },
  },
  unlock_period: {
    type: 'object',
    additionalProperties: false,
    properties: { reason: { type: 'string' } },
  },
  period_status: noArgs,
  provider_doctor: noArgs,
  govt_set_public_key: {
    type: 'object',
    additionalProperties: false,
    required: ['key'],
    properties: { key: { type: 'string', minLength: 1 } },
  },
  govt_nic_health: noArgs,
  govt_nic_session: noArgs,
  govt_nic_gstin: {
    type: 'object',
    additionalProperties: false,
    required: ['gstin'],
    properties: { gstin: { type: 'string', minLength: 15, maxLength: 15 } },
  },
  govt_nic_cancel_irn: {
    type: 'object',
    additionalProperties: false,
    properties: {
      invoiceId: { type: 'string' },
      irn: { type: 'string' },
      reason: { type: 'string', enum: ['1', '2', '3', '4'] },
      remark: { type: 'string' },
    },
  },
  govt_nic_get_irn: {
    type: 'object',
    additionalProperties: false,
    required: ['irn'],
    properties: { irn: { type: 'string', minLength: 1 } },
  },
  govt_nic_get_irn_by_doc: {
    type: 'object',
    additionalProperties: false,
    required: ['docNo', 'docDate'],
    properties: {
      docType: { type: 'string' },
      docNo: { type: 'string', minLength: 1 },
      docDate: { type: 'string', minLength: 8 },
    },
  },
  govt_nic_rejected_irns: {
    type: 'object',
    additionalProperties: false,
    required: ['date'],
    properties: { date: { type: 'string', minLength: 8 } },
  },
  govt_nic_generate_ewb: {
    type: 'object',
    additionalProperties: false,
    required: ['irn'],
    properties: {
      irn: { type: 'string', minLength: 1 },
      transport: { type: 'object' },
    },
  },
  govt_nic_get_ewb: {
    type: 'object',
    additionalProperties: false,
    required: ['irn'],
    properties: { irn: { type: 'string', minLength: 1 } },
  },
  test_notification: {
    type: 'object',
    additionalProperties: false,
    required: ['channel', 'to'],
    properties: {
      channel: { type: 'string', enum: ['email', 'whatsapp'] },
      to: { type: 'string', minLength: 1 },
    },
  },
  share_invoice: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId', 'channel'],
    properties: {
      invoiceId: { type: 'string', minLength: 1 },
      channel: { type: 'string', enum: ['email', 'whatsapp'] },
      to: { type: 'string' },
    },
  },
  list_outbox: noArgs,
  send_notification: {
    type: 'object',
    additionalProperties: false,
    required: ['messageId'],
    properties: { messageId: { type: 'string', minLength: 1 } },
  },
  trial_balance: noArgs,
  chart_of_accounts: noArgs,
  journal: {
    type: 'object',
    additionalProperties: false,
    properties: { limit: { type: 'number', minimum: 1, maximum: 500 } },
  },
  list_invoices: noArgs,
  create_invoice: {
    ...documentSchema,
    properties: {
      taxJurisdiction: { type: 'string', maxLength: 24 },
      taxExempt: { type: 'boolean' },
      exemptionReason: { type: 'string', maxLength: 120 },
      partyAddress: { type: 'string', maxLength: 200 },
      exportSale: {
        type: 'object',
        additionalProperties: false,
        properties: {
          currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
          exchangeRate: { type: 'number', exclusiveMinimum: 0 },
          withTax: { type: 'boolean' },
          shippingBillNo: { type: 'string', maxLength: 7 },
          shippingBillDate: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
          portCode: { type: 'string', maxLength: 6 },
        },
      }, ...documentSchema.properties, paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 } },
  },
  create_purchase: {
    ...documentSchema,
    properties: {
      salesTaxPaid: { type: 'number', minimum: 0 }, ...documentSchema.properties, supplierInvoiceNo: { type: 'string', maxLength: 16 }, documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, ...tdsProperties },
  },
  print_invoice: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^(INV|BILL)-[0-9]{4,}$' } },
  },
  invoice_document: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^INV-[0-9]{4,}$' } },
  },
  create_credit_note: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId', 'reason'],
    properties: {
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      reason: { type: 'string', minLength: 1, maxLength: 200 },
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['rate', 'gstRate'],
          properties: {
            description: { type: 'string', maxLength: 200 },
            hsn: { type: 'string', maxLength: 8 },
            qty: { type: 'number', exclusiveMinimum: 0 },
            rate: { type: 'number', exclusiveMinimum: 0 },
            gstRate: { type: 'number', minimum: 0, maximum: 28 },
          },
        },
      },
    },
  },
  create_debit_note: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId', 'amount', 'reason'],
    properties: {
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      reason: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
  create_purchase_note: {
    type: 'object',
    additionalProperties: false,
    required: ['billId', 'amount', 'reason'],
    properties: {
      billId: { type: 'string', pattern: '^BILL-[0-9]{4,}$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      reason: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
  record_supplier_debit_note: {
    type: 'object',
    additionalProperties: false,
    required: ['billId', 'amount', 'reason'],
    properties: {
      billId: { type: 'string', pattern: '^BILL-[0-9]{4,}$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      reason: { type: 'string', minLength: 1, maxLength: 200 },
      supplierNoteNo: { type: 'string', maxLength: 16 },
    },
  },
  list_debit_notes: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  cancel_invoice: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      date: { type: 'string' },
      reason: { type: 'string', maxLength: 200 },
    },
  },
  list_credit_notes: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  business_summary: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  import_gstr2b: {
    type: 'object',
    additionalProperties: false,
    required: ['csv', 'period'],
    properties: {
      csv: { type: 'string', minLength: 1 },
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      fileName: { type: 'string', maxLength: 120 },
    },
  },
  books_check: noArgs,
  cash_forecast: {
    type: 'object',
    additionalProperties: false,
    properties: { days: { type: 'integer', minimum: 1, maximum: 180 } },
  },
  can_afford: {
    type: 'object',
    additionalProperties: false,
    required: ['amount'],
    properties: {
      amount: { type: 'number', exclusiveMinimum: 0 },
      on: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  record_filing: {
    type: 'object',
    additionalProperties: false,
    required: ['returnType', 'period', 'arn'],
    properties: { gstin: REGISTRATION_ARG,
      returnType: { type: 'string', pattern: '^[A-Za-z0-9_-]{2,20}$' },
      period: { type: 'string', minLength: 4, maxLength: 20 },
      arn: { type: 'string', pattern: '^[A-Za-z0-9 ]{10,24}$' },
      filedOn: { type: 'string' },
      filedBy: { type: 'string', maxLength: 60 },
    },
  },
  set_cash_balance: {
    type: 'object',
    additionalProperties: false,
    properties: {
      bank: { type: 'number' },
      cash: { type: 'number', minimum: 0 },
      on: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  create_quote: {
    type: 'object',
    additionalProperties: false,
    required: ['partyName', 'lines'],
    properties: {
      partyName: { type: 'string', minLength: 1, maxLength: 80 },
      partyGstin: { type: 'string' },
      date: { type: 'string' },
      validDays: { type: 'integer', minimum: 1, maximum: 365 },
      lines: { type: 'array', minItems: 1, items: lineSchema },
    },
  },
  mark_quote: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'outcome'],
    properties: {
      id: { type: 'string', pattern: '^QT-[0-9]{4,}$' },
      outcome: { type: 'string', enum: ['accepted', 'declined'] },
    },
  },
  convert_quote: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^QT-[0-9]{4,}$' },
      date: { type: 'string' },
    },
  },
  list_quotes: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['all', 'open', 'accepted', 'declined', 'expired', 'invoiced'] } },
  },
  quote_document: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^QT-[0-9]{4,}$' } },
  },
  ask_ca: {
    type: 'object',
    additionalProperties: false,
    required: ['subject', 'note'],
    properties: {
      subject: {
        type: 'object',
        additionalProperties: false,
        required: ['kind'],
        properties: {
          kind: { type: 'string', enum: ['invoice', 'bill', 'expense', 'exception', 'period', 'other'] },
          id: { type: 'string', maxLength: 40 },
          period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
        },
      },
      title: { type: 'string', maxLength: 160 },
      note: { type: 'string', minLength: 1, maxLength: 1000 },
      documents: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sha256'],
          properties: { sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, name: { type: 'string', maxLength: 120 } },
        },
      },
    },
  },
  reply_ca: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'text'],
    properties: {
      id: { type: 'string', pattern: '^ASK-[0-9]{4,}$' },
      text: { type: 'string', minLength: 1, maxLength: 1000 },
    },
  },
  close_ca: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^ASK-[0-9]{4,}$' } },
  },
  list_ca_requests: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['open', 'closed', 'all'] } },
  },
  set_sales_tax_rate: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'ratePercent'],
    properties: {
      code: { type: 'string', maxLength: 24 },
      name: { type: 'string', maxLength: 80 },
      ratePercent: { type: 'number', minimum: 0, maximum: 20 },
      from: { type: 'string' },
    },
  },
  list_sales_tax_rates: noArgs,
  set_contractor: {
    type: 'object',
    additionalProperties: false,
    required: ['partyName'],
    properties: {
      partyName: { type: 'string', minLength: 1, maxLength: 120 },
      contractor: { type: 'boolean' },
      w9Name: { type: 'string', maxLength: 120 },
      entityType: { type: 'string', enum: ['individual', 'sole-proprietor', 'llc', 'partnership', 'c-corp', 's-corp', 'other'] },
      tinLast4: { type: 'string', pattern: '^([0-9]{4})?$' },
      w9Received: { type: 'boolean' },
    },
  },
  contractor_payments: {
    type: 'object',
    additionalProperties: false,
    properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } },
  },
  set_withholding: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^EMP-[0-9]{4,}$' },
      federalWithholding: { type: 'number', minimum: 0 },
      stateWithholding: { type: 'number', minimum: 0 },
      workState: { type: 'string', pattern: '^[A-Za-z]{2}$' },
    },
  },
  set_suta_rate: {
    type: 'object',
    additionalProperties: false,
    required: ['state', 'ratePercent', 'wageBase'],
    properties: {
      state: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      ratePercent: { type: 'number', minimum: 0, maximum: 15 },
      wageBase: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
      from: { type: 'string' },
    },
  },
  list_suta_rates: noArgs,
  us_payroll_filings: {
    type: 'object',
    additionalProperties: false,
    properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } },
  },
  schedule_c_summary: {
    type: 'object',
    additionalProperties: false,
    properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } },
  },
  estimated_tax_dates: {
    type: 'object',
    additionalProperties: false,
    properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } },
  },
  import_pos_sales: {
    type: 'object',
    additionalProperties: false,
    properties: {
      csv: { type: 'string' },
      documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    },
  },
  import_settlement: {
    type: 'object',
    additionalProperties: false,
    properties: {
      csv: { type: 'string' },
      documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      channel: { type: 'string', enum: ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce', 'marketplace'] },
      bankAmount: { type: 'number', minimum: 0 },
    },
  },
  import_marketplace_orders: {
    type: 'object',
    additionalProperties: false,
    properties: {
      csv: { type: 'string' },
      documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      channel: { type: 'string', enum: ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce', 'marketplace'] },
    },
  },
  set_channel_identity: {
    type: 'object',
    additionalProperties: false,
    required: ['channel'],
    properties: {
      channel: { type: 'string', enum: ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce'] },
      gstin: { type: 'string', maxLength: 15 },
      tan: { type: 'string', maxLength: 10 },
      name: { type: 'string', maxLength: 120 },
    },
  },
  import_tcs_statement: {
    type: 'object',
    additionalProperties: false,
    properties: { csv: { type: 'string' }, documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } },
  },
  import_26as_credits: {
    type: 'object',
    additionalProperties: false,
    properties: { csv: { type: 'string' }, documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } },
  },
  marketplace_credits: {
    type: 'object',
    additionalProperties: false,
    properties: { fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' } },
  },
  set_sku_cost: {
    type: 'object',
    additionalProperties: false,
    required: ['sku'],
    properties: {
      sku: { type: 'string', minLength: 1, maxLength: 64 },
      cost: { type: 'number', minimum: 0 },
      name: { type: 'string', maxLength: 120 },
      hsn: { type: 'string', maxLength: 8 },
      gstRate: { type: 'number', minimum: 0, maximum: 28 },
      on: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  import_sku_costs: {
    type: 'object',
    additionalProperties: false,
    properties: { csv: { type: 'string' }, documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } },
  },
  record_stock: {
    type: 'object',
    additionalProperties: false,
    required: ['sku', 'qty'],
    properties: {
      sku: { type: 'string', minLength: 1, maxLength: 64 },
      qty: { type: 'number' },
      location: { type: 'string', maxLength: 40 },
      date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      note: { type: 'string', maxLength: 200 },
      kind: { type: 'string', enum: ['in', 'out', 'adjust'] },
    },
  },
  stock_position: {
    type: 'object',
    additionalProperties: false,
    properties: { sku: { type: 'string', maxLength: 64 }, location: { type: 'string', maxLength: 40 } },
  },
  value_inventory: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  inventory_valuations: { type: 'object', additionalProperties: false, properties: {} },
  stock_moves: {
    type: 'object',
    additionalProperties: false,
    properties: { sku: { type: 'string', maxLength: 64 }, location: { type: 'string', maxLength: 40 }, limit: { type: 'integer', minimum: 1, maximum: 500 } },
  },
  sku_margins: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
      channel: { type: 'string', enum: ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce', 'marketplace'] },
    },
  },
  daily_close: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  set_registration: {
    type: 'object',
    additionalProperties: false,
    required: ['gstin'],
    properties: {
      gstin: { type: 'string', maxLength: 15 },
      kind: { type: 'string', enum: ['apob', 'warehouse', 'branch'] },
      label: { type: 'string', maxLength: 60 },
      effectiveFrom: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  retire_registration: {
    type: 'object',
    additionalProperties: false,
    required: ['gstin'],
    properties: { gstin: { type: 'string', maxLength: 15 }, effectiveTo: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  registrations: { type: 'object', additionalProperties: false, properties: {} },
  record_stock_transfer: {
    type: 'object',
    additionalProperties: false,
    required: ['sku', 'qty', 'fromGstin', 'toGstin'],
    properties: {
      sku: { type: 'string', minLength: 1, maxLength: 64 },
      qty: { type: 'number', exclusiveMinimum: 0 },
      fromGstin: { type: 'string', maxLength: 15 },
      toGstin: { type: 'string', maxLength: 15 },
      date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      unitValue: { type: 'number', minimum: 0 },
      gstRate: { type: 'number', minimum: 0, maximum: 28 },
      hsn: { type: 'string', maxLength: 8 },
    },
  },
  save_gstr1_portal: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, gstin: REGISTRATION_ARG, caApprovalId: { type: 'string', maxLength: 40 } },
  },
  file_gstr1_portal: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'otp'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, gstin: REGISTRATION_ARG, otp: { type: 'string', pattern: '^[0-9]{6}$' }, pan: { type: 'string', maxLength: 10 }, caApprovalId: { type: 'string', maxLength: 40 } },
  },
  generate_tds_fvu: {
    type: 'object',
    additionalProperties: false,
    required: ['quarter'],
    properties: { quarter: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' }, form: { type: 'string', enum: ['24Q', '26Q', '27Q'] }, tan: { type: 'string', maxLength: 10 }, filingType: { type: 'string', enum: ['regular', 'correction'] }, caApprovalId: { type: 'string', maxLength: 40 } },
  },
  portal_status: { type: 'object', additionalProperties: false, properties: {} },
  set_channel_connector: {
    type: 'object',
    additionalProperties: false,
    required: ['channel'],
    properties: {
      channel: { type: 'string', enum: ['amazon', 'shopify', 'razorpay', 'zoho'] },
      clientId: { type: 'string', maxLength: 200 }, clientSecret: { type: 'string', maxLength: 500 }, refreshToken: { type: 'string', maxLength: 2000 }, marketplaceId: { type: 'string', maxLength: 40 }, region: { type: 'string', enum: ['IN', 'EU', 'NA', 'FE'] },
      shopDomain: { type: 'string', maxLength: 120 }, accessToken: { type: 'string', maxLength: 500 },
      keyId: { type: 'string', maxLength: 120 }, keySecret: { type: 'string', maxLength: 500 },
      orgId: { type: 'string', maxLength: 40 }, dc: { type: 'string', enum: ['in', 'com', 'eu', 'au'] },
      enabled: { type: 'boolean' },
    },
  },
  channel_connectors: { type: 'object', additionalProperties: false, properties: {} },
  fetch_channel_report: {
    type: 'object',
    additionalProperties: false,
    required: ['channel'],
    properties: {
      channel: { type: 'string', enum: ['amazon', 'shopify', 'razorpay'] },
      kind: { type: 'string', enum: ['settlement', 'orders'] },
      from: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      to: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  sync_channels: { type: 'object', additionalProperties: false, properties: { to: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } } },
  push_zoho_invoices: { type: 'object', additionalProperties: false, properties: { period: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, caApprovalId: { type: 'string', maxLength: 80 } } },
  settlement_status: {
    type: 'object',
    additionalProperties: false,
    properties: {
      channel: { type: 'string', enum: ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce', 'marketplace'] },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
  },
  contractor_1099_file: {
    type: 'object',
    additionalProperties: false,
    properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } },
  },
  import_us_invoices: {
    type: 'object',
    additionalProperties: false,
    properties: {
      csv: { type: 'string' },
      documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      taxJurisdiction: { type: 'string', maxLength: 24 },
    },
  },
  export_trial_balance: noArgs,
  rules_status: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, country: { type: 'string', enum: ['IN', 'US'] } },
  },
  run_automation: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, force: { type: 'boolean' } },
  },
  automation_status: { type: 'object', additionalProperties: false, properties: {} },
  read_document: { type: 'object', additionalProperties: false, required: ['documentSha256'], properties: { documentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } } },
  amend_invoice: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId', 'reason'],
    properties: {
      invoiceId: { type: 'string', minLength: 1, maxLength: 24 },
      reason: { type: 'string', minLength: 1, maxLength: 120 },
      partyGstin: { type: 'string', maxLength: 15 },
      date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      lines: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['rate', 'gstRate'], properties: { description: { type: 'string', maxLength: 120 }, hsn: { type: 'string', maxLength: 8 }, qty: { type: 'number', exclusiveMinimum: 0 }, rate: { type: 'number', minimum: 0 }, gstRate: { type: 'number', minimum: 0, maximum: 28 } } } },
    },
  },
  list_amendments: { type: 'object', additionalProperties: false, properties: { period: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' } } },
  schedule_se: { type: 'object', additionalProperties: false, properties: { year: { type: 'string', pattern: '^[0-9]{4}$' }, filingStatus: { type: 'string', enum: ['single', 'married_joint', 'married_separate', 'head_of_household'] }, otherSocialSecurityWages: { type: 'number', minimum: 0 } } },
  schedule_c_document: { type: 'object', additionalProperties: false, properties: { year: { type: 'string', pattern: '^[0-9]{4}$' }, filingStatus: { type: 'string', enum: ['single', 'married_joint', 'married_separate', 'head_of_household'] }, otherSocialSecurityWages: { type: 'number', minimum: 0 } } },
  cpa_pack: { type: 'object', additionalProperties: false, properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } } },
  payroll_941_file: { type: 'object', additionalProperties: false, required: ['quarter'], properties: { quarter: { type: 'string', pattern: '^[0-9]{4}-Q[1-4]$' } } },
  payroll_w2_file: { type: 'object', additionalProperties: false, required: ['year'], properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } } },
  set_sales_tax_nexus: {
    type: 'object',
    additionalProperties: false,
    required: ['state', 'frequency'],
    properties: {
      state: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      frequency: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
      from: { type: 'string' },
      permitNo: { type: 'string', maxLength: 40 },
      dueDay: { type: 'string', pattern: '^([1-9]|1[0-9]|2[0-8]|last)$' },
    },
  },
  list_sales_tax_nexus: noArgs,
  sales_tax_return: {
    type: 'object',
    additionalProperties: false,
    required: ['state'],
    properties: { state: { type: 'string', pattern: '^[A-Za-z]{2}$' }, period: { type: 'string', pattern: '^[0-9]{4}(-(0[1-9]|1[0-2]|Q[1-4]))?$' } },
  },
  sales_tax_review: {
    type: 'object',
    additionalProperties: false,
    required: ['state'],
    properties: { state: { type: 'string', pattern: '^[A-Za-z]{2}$' }, period: { type: 'string', pattern: '^[0-9]{4}(-(0[1-9]|1[0-2]|Q[1-4]))?$' } },
  },
  sales_tax_review_answer: {
    type: 'object',
    additionalProperties: false,
    required: ['state', 'period', 'step', 'answer', 'draftHash'],
    properties: {
      state: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      period: { type: 'string', pattern: '^[0-9]{4}(-(0[1-9]|1[0-2]|Q[1-4]))?$' },
      step: { type: 'string', enum: ['sales', 'tax', 'approve'] },
      answer: { type: 'string', enum: ['correct', 'wrong', 'approve'] },
      draftHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      note: { type: 'string', maxLength: 500 },
    },
  },
  record_sales_tax_payment: {
    type: 'object',
    additionalProperties: false,
    required: ['state'],
    properties: {
      state: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      period: { type: 'string', pattern: '^[0-9]{4}(-(0[1-9]|1[0-2]|Q[1-4]))?$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      mode: { type: 'string', enum: ['bank', 'cash'] },
      reference: { type: 'string', maxLength: 40 },
    },
  },
  record_sales_tax_filing: {
    type: 'object',
    additionalProperties: false,
    required: ['state', 'confirmation'],
    properties: {
      state: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      period: { type: 'string', pattern: '^[0-9]{4}(-(0[1-9]|1[0-2]|Q[1-4]))?$' },
      confirmation: { type: 'string', minLength: 3, maxLength: 40 },
      filedOn: { type: 'string' },
      filedBy: { type: 'string', maxLength: 60 },
    },
  },
  sales_tax_overview: noArgs,
  set_party_address: {
    type: 'object',
    additionalProperties: false,
    required: ['partyName', 'address'],
    properties: {
      partyName: { type: 'string', minLength: 1, maxLength: 80 },
      partyGstin: { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' },
      address: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
  set_transport: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId', 'distanceKm'],
    properties: {
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      vehicleNo: { type: 'string', maxLength: 12 },
      distanceKm: { type: 'integer', minimum: 1, maximum: 4000 },
      transporterName: { type: 'string', maxLength: 100 },
      transporterId: { type: 'string', maxLength: 15 },
      mode: { type: 'string', enum: ['road', 'rail', 'air', 'ship'] },
      docNo: { type: 'string', maxLength: 15 },
    },
  },
  record_share: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string', pattern: '^(INV|QT)-[0-9]{4,}$' },
      channel: { type: 'string', maxLength: 40 },
      outcome: { type: 'string', enum: ['shared', 'printed', 'cancelled'] },
      to: { type: 'string', maxLength: 120 },
    },
  },
  eway_bill_status: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId'],
    properties: { invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' } },
  },
  govt_generate_ewb: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId'],
    properties: { invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' }, caApprovalId: { type: 'string', maxLength: 40 } },
  },
  set_invoice_numbering: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: { mode: { type: 'string', enum: ['continuous', 'yearly'] } },
  },
  set_invoice_template: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accent: { type: 'string', maxLength: 7 },
      layout: { type: 'string', enum: ['classic', 'minimal'] },
      signatory: { type: 'string', maxLength: 80 },
      footer: { type: 'string', maxLength: 300 },
      terms: { type: 'string', maxLength: 600 },
      showHsn: { type: 'boolean' },
      bank: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 80 },
          account: { type: 'string', maxLength: 20 },
          ifsc: { type: 'string', maxLength: 11 },
          upi: { type: 'string', maxLength: 80 },
        },
      },
    },
  },
  invoice_template: { type: 'object', additionalProperties: false, properties: {} },
  set_supplier_terms: {
    type: 'object',
    additionalProperties: false,
    properties: {
      partyName: { type: 'string', maxLength: 80 },
      partyGstin: { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' },
      msme: { type: 'boolean' },
      udyam: { type: 'string', maxLength: 19 },
      category: { type: 'string', enum: ['micro', 'small', 'medium'] },
      days: { type: 'integer', minimum: 0, maximum: 365 },
    },
  },
  supplier_dues: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  set_payment_terms: {
    type: 'object',
    additionalProperties: false,
    required: ['days'],
    properties: {
      partyName: { type: 'string', maxLength: 80 },
      partyGstin: { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' },
      days: { type: 'integer', minimum: 0, maximum: 365 },
    },
  },
  add_reminder: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'due'],
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 200 },
      due: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      billId: { type: 'string', pattern: '^BILL-[0-9]{4,}$' },
      documentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      documentName: { type: 'string', maxLength: 120 },
      assignedTo: { type: 'string', maxLength: 32 },
      party: { type: 'string', maxLength: 80 },
    },
  },
  complete_reminder: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^REM-[0-9]{4,}$' } },
  },
  list_employees: {
    type: 'object',
    additionalProperties: false,
    properties: { include: { type: 'string', enum: ['current', 'all'] } },
  },
  payroll_run: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  approve_payroll: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      draftHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    },
  },
  record_salary_payment: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      date: { type: 'string' },
      mode: { type: 'string', enum: ['bank', 'cash'] },
    },
  },
  list_payroll: noArgs,
  payslip: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'employeeId'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      employeeId: { type: 'string', pattern: '^EMP-[0-9]{4,}$' },
    },
  },
  add_employee: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'joinedOn', 'components'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 80 },
      joinedOn: { type: 'string' },
      components: { type: 'array', minItems: 1, maxItems: 10, items: salaryComponent },
      designation: { type: 'string', maxLength: 60 },
      pan: { type: 'string', maxLength: 10 },
      uan: { type: 'string', maxLength: 14 },
      esiNumber: { type: 'string', maxLength: 12 },
      pfMember: { type: 'boolean' },
      esiMember: { type: 'boolean' },
      ptState: { type: 'string', pattern: '^[0-9]{2}$' },
      taxRegime: { type: 'string', enum: ['new', 'old'] },
      sex: { type: 'string', enum: ['male', 'female'] },
      workState: { type: 'string', pattern: '^[A-Za-z]{2}$' },
      federalWithholding: { type: 'number', minimum: 0 },
      stateWithholding: { type: 'number', minimum: 0 },
      bankAccount: { type: 'string', minLength: 9, maxLength: 18 },
      ifsc: { type: 'string', minLength: 9, maxLength: 11 },
    },
  },
  set_employee_bank: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'bankAccount', 'ifsc'],
    properties: {
      id: { type: 'string', pattern: '^EMP-[0-9]{4,}$' },
      bankAccount: { type: 'string', minLength: 9, maxLength: 18 },
      ifsc: { type: 'string', minLength: 9, maxLength: 11 },
    },
  },
  payroll_payout_file: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  change_salary: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'effectiveFrom', 'components'],
    properties: {
      id: { type: 'string', pattern: '^EMP-[0-9]{4,}$' },
      effectiveFrom: { type: 'string' },
      components: { type: 'array', minItems: 1, maxItems: 10, items: salaryComponent },
    },
  },
  end_employment: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'leftOn'],
    properties: {
      id: { type: 'string', pattern: '^EMP-[0-9]{4,}$' },
      leftOn: { type: 'string' },
    },
  },
  request_documents: {
    type: 'object',
    additionalProperties: false,
    required: ['clientId', 'items'],
    properties: {
      clientId: { type: 'string', minLength: 1, maxLength: 32 },
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      items: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 60 } },
      dueOn: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      note: { type: 'string', maxLength: 500 },
    },
  },
  record_document_received: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^DRQ-[0-9]{4,}$' },
      item: { type: 'string', maxLength: 60 },
      on: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      documentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    },
  },
  document_requests: {
    type: 'object',
    additionalProperties: false,
    properties: { clientId: { type: 'string', maxLength: 32 }, status: { type: 'string', enum: ['open', 'complete', 'all'] } },
  },
  eval_events: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['all', 'corrected', 'uncorrected', 'failed'] }, limit: { type: 'integer', minimum: 1, maximum: 200 } },
  },
  correct_eval: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^EVL-[0-9]{5,}$' },
      correctTool: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 500 },
      wasRight: { type: 'boolean' },
    },
  },
  search_firm_notes: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: { query: { type: 'string', minLength: 2, maxLength: 120 } },
  },
  ask_knowledge: {
    type: 'object',
    additionalProperties: false,
    required: ['question'],
    properties: { question: { type: 'string', minLength: 3, maxLength: 400 } },
  },
  can_make_payroll: { type: 'object', additionalProperties: false, properties: {} },
  push_tally: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, url: { type: 'string', maxLength: 120 }, again: { type: 'boolean' } },
  },
  dsc_certificates: { type: 'object', additionalProperties: false, properties: {} },
  dsc_sign: {
    type: 'object',
    additionalProperties: false,
    required: ['thumbprint'],
    properties: { documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, text: { type: 'string', maxLength: 200000 }, thumbprint: { type: 'string', pattern: '^[0-9A-Fa-f]{40}$' }, purpose: { type: 'string', maxLength: 120 }, caApprovalId: { type: 'string', maxLength: 80 } },
  },
  suggest_expense_head: {
    type: 'object',
    additionalProperties: false,
    properties: { description: { type: 'string', maxLength: 200 }, payee: { type: 'string', maxLength: 120 } },
  },
  attach_document: {
    type: 'object',
    additionalProperties: false,
    required: ['documentSha256', 'id'],
    properties: { documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, id: { type: 'string', minLength: 1, maxLength: 24 } },
  },
  save_report: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'metric'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 60 },
      metric: { type: 'string', enum: ['sales', 'purchases', 'expenses', 'owed', 'owing'] },
      groupBy: { type: 'string', enum: ['customer', 'supplier', 'head', 'month', 'none'] },
      period: { type: 'string', maxLength: 12 },
      compare: { type: 'boolean' },
    },
  },
  run_report: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } },
  list_reports: { type: 'object', additionalProperties: false, properties: {} },
  delete_report: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } },
  set_supplier_bank: {
    type: 'object',
    additionalProperties: false,
    properties: {
      partyName: { type: 'string', maxLength: 80 },
      partyGstin: { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' },
      account: { type: 'string', maxLength: 24 },
      ifsc: { type: 'string', maxLength: 11 },
      upi: { type: 'string', maxLength: 80 },
      holder: { type: 'string', maxLength: 80 },
    },
  },
  supplier_payout_file: {
    type: 'object',
    additionalProperties: false,
    properties: { billIds: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 40 } }, windowDays: { type: 'integer', minimum: 1, maximum: 60 } },
  },
  advance_tax: {
    type: 'object',
    additionalProperties: false,
    properties: { regime: { type: 'string', enum: ['old', 'new'] }, presumptive: { type: 'boolean' }, otherIncome: { type: 'number', minimum: 0 }, asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  record_advance_tax: {
    type: 'object',
    additionalProperties: false,
    required: ['amount'],
    properties: { amount: { type: 'number', exclusiveMinimum: 0 }, date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, challan: { type: 'string', maxLength: 30 }, mode: { type: 'string', enum: ['bank', 'cash'] } },
  },
  restock_plan: { type: 'object', additionalProperties: false, properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } } },
  set_sku_supply: {
    type: 'object',
    additionalProperties: false,
    required: ['sku'],
    properties: {
      sku: { type: 'string', minLength: 1, maxLength: 40 },
      supplier: { type: 'string', maxLength: 80 },
      leadDays: { type: 'integer', minimum: 0, maximum: 365 },
      pack: { type: 'integer', minimum: 1 },
      moq: { type: 'integer', minimum: 0 },
    },
  },
  record_purchase_order: {
    type: 'object',
    additionalProperties: false,
    required: ['supplier', 'lines'],
    properties: {
      supplier: { type: 'string', minLength: 1, maxLength: 80 },
      lines: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['sku', 'qty'], properties: { sku: { type: 'string', minLength: 1, maxLength: 40 }, qty: { type: 'integer', minimum: 1 }, rate: { type: 'number', minimum: 0 } } } },
      date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      expectedOn: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  month_close: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, receiptThreshold: { type: 'number', minimum: 0 } },
  },
  month_close_approve: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'draftHash'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      draftHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      note: { type: 'string', maxLength: 500 },
    },
  },
  weekly_brief: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  payment_run: {
    type: 'object',
    additionalProperties: false,
    properties: {
      windowDays: { type: 'integer', minimum: 1, maximum: 60 },
      asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  record_payment_run: {
    type: 'object',
    additionalProperties: false,
    properties: {
      billIds: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 40 } },
      date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      mode: { type: 'string', enum: ['bank', 'cash'] },
    },
  },
  collection_drafts: {
    type: 'object',
    additionalProperties: false,
    properties: { customer: { type: 'string', maxLength: 120 } },
  },
  record_collection_reminder: {
    type: 'object',
    additionalProperties: false,
    required: ['customer'],
    properties: {
      customer: { type: 'string', minLength: 1, maxLength: 120 },
      message: { type: 'string', maxLength: 2000 },
      channel: { type: 'string', enum: ['whatsapp', 'email', 'other'] },
    },
  },
  supplier_reminder_draft: {
    type: 'object',
    additionalProperties: false,
    required: ['supplier'],
    properties: {
      supplier: { type: 'string', minLength: 1, maxLength: 120 },
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
    },
  },
  record_supplier_reminder: {
    type: 'object',
    additionalProperties: false,
    required: ['supplier', 'period'],
    properties: {
      supplier: { type: 'string', minLength: 1, maxLength: 120 },
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      message: { type: 'string', maxLength: 2000 },
      channel: { type: 'string', enum: ['whatsapp', 'email', 'other'] },
    },
  },
  tds_summary: noArgs,
  set_tds_deductor: {
    type: 'object',
    additionalProperties: false,
    required: ['tan'],
    properties: { tan: { type: 'string', maxLength: 12 } },
  },
  record_tds_deposit: {
    type: 'object',
    additionalProperties: false,
    required: ['challan'],
    properties: {
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      challan: { type: 'string', maxLength: 40 },
      mode: { type: 'string', enum: ['bank', 'cash'] },
    },
  },
  tds_return: {
    type: 'object',
    additionalProperties: false,
    properties: { quarter: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' }, form: { type: 'string', enum: ['other', 'salary'] } },
  },
  tds_review: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' }, form: { type: 'string', enum: ['other', 'salary'] } },
  },
  salary_annexure: {
    type: 'object',
    additionalProperties: false,
    properties: { fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' } },
  },
  tds_certificates: {
    type: 'object',
    additionalProperties: false,
    properties: {
      quarter: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' },
      form: { type: 'string', enum: ['other', 'salary', '16A', '16'] },
      fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
    },
  },
  pf_ecr: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  esi_return: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  tds_review_answer: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'step', 'answer', 'draftHash'],
    properties: {
      period: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' },
      form: { type: 'string', enum: ['other', 'salary'] },
      step: { type: 'string', enum: ['deductees', 'challans', 'approve'] },
      answer: { type: 'string', enum: ['correct', 'wrong', 'approve'] },
      draftHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      note: { type: 'string', maxLength: 500 },
    },
  },
  list_filings: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  list_reminders: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['open', 'done', 'all'] }, assignedTo: { type: 'string', maxLength: 32 } },
  },
  credit_at_risk: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  export_entries: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  export_tally: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  gst_review: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  gst_review_answer: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'step', 'answer', 'draftHash'],
    properties: { gstin: REGISTRATION_ARG,
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      step: { type: 'string', enum: ['held', 'sales', 'credit', 'pay', 'approve'] },
      answer: { type: 'string', enum: ['correct', 'wrong', 'approve'] },
      note: { type: 'string', maxLength: 500 },
      draftHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    },
  },
  record_receipt: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      mode: { type: 'string', enum: ['bank', 'cash'] },
      date: { type: 'string' },
    },
  },
  record_payment: {
    type: 'object',
    additionalProperties: false,
    required: ['billId'],
    properties: {
      billId: { type: 'string', minLength: 1, maxLength: 64 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      mode: { type: 'string', enum: ['bank', 'cash'] },
      date: { type: 'string' },
    },
  },
  exceptions: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scope: { type: 'string', enum: ['client', 'firm'] },
      status: { type: 'string', enum: ['open', 'all', 'resolved', 'waived', 'in_review'] },
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      source: { type: 'string', maxLength: 32 },
      asOfDate: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
  exception_decide: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'decision'],
    properties: {
      id: { type: 'string', pattern: '^EXC-[0-9]{6}$' },
      decision: { type: 'string', enum: ['assign', 'resolve', 'waive', 'reopen'] },
      note: { type: 'string', maxLength: 500 },
      owner: { type: 'string', maxLength: 64 },
    },
  },
  record_gst_payment: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG,
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      date: { type: 'string' },
      mode: { type: 'string', enum: ['bank', 'cash'] },
      cpin: { type: 'string', pattern: '^[0-9]{14}$' },
    },
  },
  list_gst_payments: noArgs,
  export_gstr1_quarter: {
    type: 'object',
    additionalProperties: false,
    required: ['quarter'],
    properties: { gstin: REGISTRATION_ARG, quarter: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' }, grossTurnover: { type: 'number', minimum: 0 }, currentGrossTurnover: { type: 'number', minimum: 0 } },
  },
  export_iff: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { gstin: REGISTRATION_ARG, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  close_year: {
    type: 'object',
    additionalProperties: false,
    properties: { year: { type: 'string', pattern: '^[0-9]{4}(-[0-9]{2})?$' } },
  },
  list_year_closings: noArgs,
  week_ahead: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  gstr9_draft: {
    type: 'object',
    additionalProperties: false,
    properties: { fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' } },
  },
  gst_payable: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG,
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      payOn: { type: 'string' },
    },
  },
  set_gst_credit_opening: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      igst: { type: 'number', minimum: 0 },
      cgst: { type: 'number', minimum: 0 },
      sgst: { type: 'number', minimum: 0 },
    },
  },
  prepare_gstr1: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  gst_period_summary: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  export_gstr1_json: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG,
      fp: { type: 'string', pattern: '^(0[1-9]|1[0-2])[0-9]{4}$' },
      grossTurnover: { type: 'number', minimum: 0 },
      currentGrossTurnover: { type: 'number', minimum: 0 },
    },
  },
  prepare_gstr3b: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG, inwardText: { type: 'string' }, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  filing_pack: {
    type: 'object',
    additionalProperties: false,
    properties: { gstin: REGISTRATION_ARG, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  govt_probe: noArgs,
  govt_nic_auth: noArgs,
  govt_nic_mock: {
    type: 'object',
    additionalProperties: false,
    properties: { invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' } },
  },
  govt_generate_irn: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string', pattern: '^(INV|CN|DN)-[0-9]{4,}$' },
      provider: { type: 'string', enum: ['nic', 'sandbox'] },
      caApprovalId: { type: 'string' },
    },
  },
  integration_readiness: {
    type: 'object',
    additionalProperties: false,
    properties: {
      available: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
  integration_connect: {
    type: 'object',
    additionalProperties: false,
    required: ['requirementId', 'provider'],
    properties: {
      requirementId: { type: 'string' },
      provider: { type: 'string', minLength: 1 },
      baseUrl: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  integration_disconnect: {
    type: 'object',
    additionalProperties: false,
    required: ['requirementId'],
    properties: {
      requirementId: { type: 'string' },
    },
  },
  provider_catalog: {
    type: 'object',
    additionalProperties: false,
    properties: {
      providerId: { type: 'string', enum: ['sandbox'] },
    },
  },
  sandbox_adapter_plan: {
    type: 'object',
    additionalProperties: false,
    properties: {
      requirementId: { type: 'string', pattern: '^REQ-CA-0(06|07|08|09|10)$' },
      operationId: { type: 'string' },
    },
  },
  sandbox_status: noArgs,
  sandbox_connect: noArgs,
  sandbox_operation: {
    type: 'object',
    additionalProperties: false,
    required: ['operationId'],
    properties: {
      operationId: { type: 'string', minLength: 1 },
      params: { type: 'object' },
      caApprovalId: { type: 'string' },
      actorId: { type: 'string' },
      clientId: { type: 'string' },
    },
  },
  approval_request: {
    type: 'object',
    additionalProperties: false,
    required: ['operationId', 'requestedBy'],
    properties: {
      operationId: { type: 'string', minLength: 1 },
      requirementId: { type: 'string' },
      requestedBy: { type: 'string', minLength: 1 },
      note: { type: 'string' },
      clientId: { type: 'string' },
      params: { type: 'object' },
    },
  },
  approval_decide: {
    type: 'object',
    additionalProperties: false,
    required: ['approvalId', 'decision', 'decidedBy', 'role'],
    properties: {
      approvalId: { type: 'string', minLength: 1 },
      decision: { type: 'string', enum: ['approve', 'reject'] },
      decidedBy: { type: 'string', minLength: 1 },
      role: { type: 'string', enum: ['partner', 'reviewer', 'admin'] },
      reason: { type: 'string' },
    },
  },
  approval_list: noArgs,
  nim_status: noArgs,
  nim_ask: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      model: { type: 'string' },
    },
  },
  prepare_itr: {
    type: 'object',
    additionalProperties: false,
    properties: {
      aisText: { type: 'string' },
      tds26Text: { type: 'string' },
      incomeText: { type: 'string' },
    },
  },
  monitor_tds: {
    type: 'object',
    additionalProperties: false,
    properties: { paymentsText: { type: 'string' } },
  },
  import_tally: {
    type: 'object',
    additionalProperties: false,
    required: ['csv'],
    properties: {
      csv: { type: 'string', minLength: 1 },
      fileName: { type: 'string' },
      asOfDate: { type: 'string' },
    },
  },
  import_tally_xml: {
    type: 'object',
    additionalProperties: false,
    required: ['xml'],
    properties: {
      xml: { type: 'string', minLength: 1 },
      fileName: { type: 'string' },
      asOfDate: { type: 'string' },
    },
  },
  import_zoho: {
    type: 'object',
    additionalProperties: false,
    required: ['csv'],
    properties: { csv: { type: 'string', minLength: 1 } },
  },
  import_bank: {
    type: 'object',
    additionalProperties: false,
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['csv', 'text', 'aa'] },
      fileName: { type: 'string' },
      asOfDate: { type: 'string' },
    },
  },
  gst_reconcile: {
    type: 'object',
    additionalProperties: false,
    properties: {
      purchaseRegister: { type: 'string' },
      gstr2b: { type: 'string' },
      gstr3b: { type: 'string' },
      gstr1: { type: 'string' },
      asOfDate: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      supplierFilings: {
        type: 'array',
        maxItems: 5000,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['gstin', 'period'],
          properties: {
            gstin: { type: 'string', maxLength: 15 },
            period: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' },
            filedOn: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
          },
        },
      },
    },
  },
  validate_gstin: {
    type: 'object',
    additionalProperties: false,
    required: ['gstin'],
    properties: { gstin: { type: 'string', minLength: 1, maxLength: 20 } },
  },
  deadlines: {
    type: 'object',
    additionalProperties: false,
    properties: {
      holidaysText: { type: 'string' },
      months: { type: 'array', items: { type: 'string' } },
      asOfDate: { type: 'string' },
    },
  },
  audit_books: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ledgerText: { type: 'string' },
      asOfDate: { type: 'string' },
    },
  },
  post_expense: {
    type: 'object',
    additionalProperties: false,
    required: ['amount'],
    properties: {
      headSource: { type: 'string', enum: ['model'] },
      headWhy: { type: 'string', maxLength: 200 },

      documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      narration: { type: 'string', maxLength: 200 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      gstRate: { type: 'number', minimum: 0, maximum: 28 },
      date: { type: 'string' },
      mode: { type: 'string', enum: ['bank', 'cash'] },
      payee: { type: 'string', maxLength: 80 },
      supplierGstin: { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' },
      head: { type: 'string', pattern: '^5[0-9]{3}$' },
      ...tdsProperties,
    },
  },
  set_expense_head: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'head'],
    properties: {
      id: { type: 'string', pattern: '^EXP-[0-9]{4,}$' },
      head: { type: 'string', pattern: '^5[0-9]{3}$' },
    },
  },
  list_expenses: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  expense_heads: noArgs,
  track_gst_returns: {
    type: 'object',
    additionalProperties: false,
    properties: {
      gstin: { type: 'string', maxLength: 15 },
      financialYear: { type: 'string' },
      gstr: { type: 'string', maxLength: 10 },
    },
  },
  search_gstin: {
    type: 'object',
    additionalProperties: false,
    properties: {
      gstin: { type: 'string', maxLength: 15 },
    },
  },
};

const ASSISTANT_BLOCKED_TOOLS = new Set(['govt_save_credentials', 'set_channel_connector', 'govt_set_public_key', 'govt_nic_cancel_irn', 'govt_nic_generate_ewb', 'seed_demo', 'approval_decide', 'set_company', 'add_client', 'set_active_client', 'save_document', 'get_document', 'lock_period', 'unlock_period', 'send_notification', 'test_notification']);

const TOOL_RISK = {
  create_invoice: 'writes_books',
  create_purchase: 'writes_books',
  record_receipt: 'writes_books',
  record_payment: 'writes_books',
  import_tally: 'writes_books',
  import_tally_xml: 'writes_books',
  import_zoho: 'writes_books',
  import_bank: 'writes_books',
  post_expense: 'writes_books',
  set_expense_head: 'writes_books',
  create_credit_note: 'writes_books',
  create_debit_note: 'writes_books',
  create_purchase_note: 'writes_books',
  record_supplier_debit_note: 'writes_books',
  cancel_invoice: 'writes_books',
  gst_review_answer: 'writes_books',
  import_gstr2b: 'writes_books',
  add_reminder: 'writes_books',
  complete_reminder: 'writes_books',
  set_cash_balance: 'writes_books',
  record_filing: 'writes_books',
  record_supplier_reminder: 'writes_books',
  record_collection_reminder: 'writes_books',
  record_payment_run: 'writes_books',
  month_close_approve: 'writes_books',
  set_sku_supply: 'writes_books',
  record_advance_tax: 'writes_books',
  set_supplier_bank: 'writes_books',
  attach_document: 'writes_books',
  push_tally: 'writes_books',
  dsc_sign: 'external_government_api',
  save_report: 'writes_books',
  delete_report: 'writes_books',
  record_purchase_order: 'writes_books',
  add_employee: 'writes_books',
  approve_payroll: 'writes_books',
  record_salary_payment: 'writes_books',
  set_tds_deductor: 'writes_books',
  set_gst_credit_opening: 'writes_books',
  record_gst_payment: 'writes_books',
  close_year: 'writes_books',
  run_automation: 'writes_books',
  amend_invoice: 'writes_books',
  tds_review_answer: 'writes_books',
  record_tds_deposit: 'writes_books',
  change_salary: 'writes_books',
  end_employment: 'writes_books',
  set_employee_bank: 'writes_books',
  set_payment_terms: 'writes_books',
  set_supplier_terms: 'writes_books',
  request_documents: 'writes_books',
  record_document_received: 'writes_books',
  correct_eval: 'writes_books',
  set_invoice_numbering: 'writes_books',
  set_invoice_template: 'writes_books',
  invoice_template: 'read_only',
  set_party_address: 'writes_books',
  set_sales_tax_rate: 'writes_books',
  set_contractor: 'writes_books',
  set_sales_tax_nexus: 'writes_books',
  set_withholding: 'writes_books',
  set_suta_rate: 'writes_books',
  import_us_invoices: 'writes_books',
  import_pos_sales: 'writes_books',
  import_settlement: 'writes_books',
  import_marketplace_orders: 'writes_books',
  set_channel_identity: 'writes_books',
  import_tcs_statement: 'writes_books',
  import_26as_credits: 'writes_books',
  marketplace_credits: 'read_only',
  set_sku_cost: 'writes_books',
  import_sku_costs: 'writes_books',
  record_stock: 'writes_books',
  stock_position: 'read_only',
  stock_moves: 'read_only',
  value_inventory: 'writes_books',
  set_channel_connector: 'writes_books',
  save_gstr1_portal: 'external_government_api',
  file_gstr1_portal: 'external_government_api',
  generate_tds_fvu: 'external_government_api',
  portal_status: 'read_only',
  ask_knowledge: 'read_only',
  channel_connectors: 'read_only',
  fetch_channel_report: 'external_government_api',
  sync_channels: 'external_government_api',
  push_zoho_invoices: 'external_government_api',
  inventory_valuations: 'read_only',
  sku_margins: 'read_only',
  daily_close: 'read_only',
  set_registration: 'writes_books',
  retire_registration: 'writes_books',
  registrations: 'read_only',
  record_stock_transfer: 'writes_books',
  settlement_status: 'read_only',
  sales_tax_review_answer: 'writes_books',
  record_sales_tax_payment: 'writes_books',
  record_sales_tax_filing: 'writes_books',
  set_transport: 'writes_books',
  record_share: 'writes_books',
  govt_generate_ewb: 'external_government_api',
  ask_ca: 'writes_books',
  create_quote: 'writes_books',
  mark_quote: 'writes_books',
  convert_quote: 'writes_books',
  reply_ca: 'writes_books',
  close_ca: 'writes_books',
  govt_nic_auth: 'external_auth_probe',
  govt_generate_irn: 'external_government_api',
  sandbox_operation: 'external_government_api',
  approval_request: 'internal_workflow',
  exception_decide: 'internal_workflow',
  track_gst_returns: 'read_or_prepare',
  search_gstin: 'read_or_prepare',
};

export function assistantTools(tools) {
  return tools
    .filter((tool) => !ASSISTANT_BLOCKED_TOOLS.has(tool.name))
    .map((tool) => ({
      type: 'function',
      name: tool.name,
      description: `${tool.title}: ${tool.description}`,
      parameters: TOOL_ARG_SCHEMAS[tool.name] || noArgs,
      strict: true,
      risk: TOOL_RISK[tool.name] || 'read_or_prepare',
    }));
}

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkScalar(schema, value, path) {
  if (!schema) return null;
  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) return `${path} must be integer`;
  } else if (schema.type && valueType(value) !== schema.type) return `${path} must be ${schema.type}`;
  if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of ${schema.enum.join(', ')}`;
  if (schema.type === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) return `${path} is too short`;
    if (schema.maxLength != null && value.length > schema.maxLength) return `${path} is too long`;
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) return `${path} does not match ${schema.pattern}`;
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (!Number.isFinite(value)) return `${path} must be finite`;
    if (schema.minimum != null && value < schema.minimum) return `${path} must be >= ${schema.minimum}`;
    if (schema.maximum != null && value > schema.maximum) return `${path} must be <= ${schema.maximum}`;
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) return `${path} must be > ${schema.exclusiveMinimum}`;
  }
  return null;
}

function validateObject(schema, value, path = 'args') {
  if (schema.type !== 'object') return checkScalar(schema, value, path);
  if (!value || valueType(value) !== 'object') return `${path} must be object`;
  const required = schema.required || [];
  for (const key of required) {
    if (value[key] == null || value[key] === '') return `${path}.${key} is required`;
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!schema.properties?.[key]) return `${path}.${key} is not allowed`;
    }
  }
  for (const [key, childSchema] of Object.entries(schema.properties || {})) {
    if (value[key] == null || value[key] === '') continue;
    if (childSchema.type === 'array') {
      if (!Array.isArray(value[key])) return `${path}.${key} must be array`;
      if (childSchema.minItems != null && value[key].length < childSchema.minItems) return `${path}.${key} needs at least ${childSchema.minItems} item(s)`;
      if (childSchema.maxItems != null && value[key].length > childSchema.maxItems) return `${path}.${key} allows at most ${childSchema.maxItems} item(s)`;
      for (let i = 0; i < value[key].length; i++) {
        const err = validateObject(childSchema.items, value[key][i], `${path}.${key}[${i}]`);
        if (err) return err;
      }
      continue;
    }
    const err = childSchema.type === 'object'
      ? validateObject(childSchema, value[key], `${path}.${key}`)
      : checkScalar(childSchema, value[key], `${path}.${key}`);
    if (err) return err;
  }
  return null;
}

export function validateAssistantToolCall(name, args = {}) {
  if (ASSISTANT_BLOCKED_TOOLS.has(name)) return { ok: false, error: `assistant cannot call ${name}` };
  const schema = TOOL_ARG_SCHEMAS[name];
  if (!schema) return { ok: false, error: `unknown assistant tool ${name}` };
  const error = validateObject(schema, args || {});
  return error ? { ok: false, error } : { ok: true, name, args: args || {} };
}

const MAX_CHAT_CHARS = 2000;

function planInvoiceDesignFromChat(text) {
  const t = text.trim();
  if (isNegated(t)) return null;
  if (/^(?:show|what(?:'s| is)|see)\s+(?:the\s+|my\s+)?invoice\s+(?:design|template|look|layout)\??$/i.test(t)) return { kind: 'tool', name: 'invoice_template', args: {} };
  const bank = /^(?:bank|payment)\s+details?\s+(?:on|for)\s+(?:the\s+|my\s+)?invoices?\s*[:\-]?\s*(.+)$/i.exec(t);
  if (bank) {
    const body = bank[1];
    const account = /\b(?:a\/c|account|acct)\.?\s*(?:no\.?|number)?\s*[:#]?\s*([0-9][0-9 ]{5,24})/i.exec(body);
    const ifsc = /\bifsc\s*[:#]?\s*([A-Za-z]{4}0[A-Za-z0-9]{6})\b/i.exec(body);
    const upi = /\bupi\s*(?:id)?\s*[:#]?\s*([a-z0-9][a-z0-9._-]+@[a-z][a-z0-9]+)/i.exec(body);
    const name = /^([A-Za-z][A-Za-z&. ]{1,60}?)\s*(?:,|a\/c|account|acct|ifsc|upi)/i.exec(body);
    if (!account && !upi) return null;
    return { kind: 'tool', name: 'set_invoice_template', args: { bank: { ...(name ? { name: name[1].trim() } : {}), ...(account ? { account: account[1].replace(/\s/g, '') } : {}), ...(ifsc ? { ifsc: ifsc[1].toUpperCase() } : {}), ...(upi ? { upi: upi[1].toLowerCase() } : {}) } } };
  }
  const footer = /^(?:invoice\s+)?footer\s*(?:line|text)?\s*[:\-]\s*(.+)$/i.exec(t);
  if (footer) return { kind: 'tool', name: 'set_invoice_template', args: { footer: footer[1].trim() } };
  const terms = /^(?:invoice\s+)?terms\s*(?:on\s+(?:the\s+)?invoices?)?\s*[:\-]\s*(.+)$/i.exec(t);
  if (terms) return { kind: 'tool', name: 'set_invoice_template', args: { terms: terms[1].trim() } };
  const signed = /^sign\s+(?:the\s+|my\s+)?invoices?\s+(?:as|by)\s+(.+)$/i.exec(t);
  if (signed) return { kind: 'tool', name: 'set_invoice_template', args: { signatory: signed[1].trim() } };
  const colour = /^invoice\s+colou?r\s*[:\-]?\s*(#[0-9a-f]{6}|default)\s*$/i.exec(t);
  if (colour) return { kind: 'tool', name: 'set_invoice_template', args: { accent: colour[1].toLowerCase() } };
  const layout = /^(?:invoice\s+)?layout\s*[:\-]?\s*(classic|minimal)\s*$|^(classic|minimal)\s+invoices?\s*$/i.exec(t);
  if (layout) return { kind: 'tool', name: 'set_invoice_template', args: { layout: (layout[1] || layout[2]).toLowerCase() } };
  const hsn = /^(hide|show)\s+(?:the\s+)?hsn(?:\s+column)?(?:\s+on\s+(?:the\s+)?invoices?)?\s*$/i.exec(t);
  if (hsn) return { kind: 'tool', name: 'set_invoice_template', args: { showHsn: hsn[1].toLowerCase() === 'show' } };
  return null;
}

export function planLocalToolCall(state, message) {
  const raw = String(message == null ? '' : message);
  if (raw.length > MAX_CHAT_CHARS) {
    return { kind: 'reply', reply: `That message is ${raw.length} characters; I read up to ${MAX_CHAT_CHARS}. Send the instruction on its own, and attach long data as a file.`, tools: [] };
  }
  const text = normalizeChat(message);
  if (!text) return { kind: 'reply', reply: 'Tell me what to post, import, or file.', tools: [] };

  const decision = confirmationIntent(text);
  if (decision) {
    if (!state.pendingChatAction) return { kind: 'reply', reply: 'There is nothing waiting to be posted.', tools: [] };
    return decision === 'cancel' ? { kind: 'cancel' } : { kind: 'confirm', decision };
  }

  if (/^(help|\?)$/i.test(text) || /^what can you do$/i.test(text)) {
    return {
      kind: 'reply',
      reply: `MyCA posts invoices, bills, payments and expenses to your books, but only after you see a preview and say yes.\n\nYou can say:\n· invoice Kiran Stores 50000 for consulting GST 18%\n· received 20000 from Kiran Stores\n· bill from Fabric Co 10000 GST 5%\n· paid Fabric Co 4000\n· paid 12000 rent\n· who owes me? / how much do I owe Fabric Co?\n· quote Retail Mart 25000 for design GST 18%\n· credit note INV-0001 5000 damaged goods\n· cash forecast · review GST · remind me to call Kiran tomorrow`,
      tools: [],
    };
  }

  {
    const saving = /^save\s+gstr-?1\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:to|on)\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (saving && !isNegated(text)) return { kind: 'tool', name: 'save_gstr1_portal', args: { period: saving[1], ...(saving[2] ? { gstin: saving[2].toUpperCase() } : {}), ...(saving[3] ? { caApprovalId: saving[3].toUpperCase() } : {}) } };
    const filing = /^file\s+gstr-?1\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:with\s+)?otp\s+(\d{6})(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (filing && !isNegated(text)) return { kind: 'tool', name: 'file_gstr1_portal', args: { period: filing[1], otp: filing[3], ...(filing[2] ? { gstin: filing[2].toUpperCase() } : {}), ...(filing[4] ? { caApprovalId: filing[4].toUpperCase() } : {}) } };
    const fvu = /^(?:generate|make|prepare)\s+(?:the\s+)?fvu\s+(?:for\s+)?(Q[1-4]\s+\d{4}-\d{2})(?:\s+(24Q|26Q|27Q))?(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (fvu && !isNegated(text)) return { kind: 'tool', name: 'generate_tds_fvu', args: { quarter: fvu[1].toUpperCase(), ...(fvu[2] ? { form: fvu[2].toUpperCase() } : {}), ...(fvu[3] ? { caApprovalId: fvu[3].toUpperCase() } : {}) } };
    if (/\bportal\s+(?:status|saves)\b|\bwhat\s+(?:is|was)\s+saved\s+to\s+the\s+portal\b|\bfvu\s+jobs?\b/i.test(text)) return { kind: 'tool', name: 'portal_status', args: {} };
  }
  const integration = planIntegrationFromChat(state, text);
  if (integration) return integration;
  if (/\b(upload|submit|sign|file)\b.*\b(gstn|return|gstr|dsc|otp)\b/i.test(text)) {
    return {
      kind: 'reply',
      reply: 'I can prepare the GST filing pack and export GSTR data, but I cannot upload, submit, sign, or file on GSTN. A practising CA must review and complete filing on the portal.',
      tools: [],
      blocked: true,
    };
  }

  const quoteRef = text.match(/\b(QT-\d{4,})\b/i);
  if (quoteRef && !isQuestion(text) && !isNegated(text)) {
    const id = quoteRef[1].toUpperCase();
    if (/\b(?:convert|make|turn|raise)\b.*\binvoice\b|\binvoice\s+(?:it|for|from)?\s*QT-/i.test(text)) return { kind: 'tool', name: 'convert_quote', args: { id } };
    if (/\baccepted\b|\bapproved\b|\bconfirmed\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'accepted' } };
    if (/\bdeclined\b|\brejected\b|\bnot\s+going\s+ahead\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'declined' } };
  }
  if (/\b(?:quote|quotation|estimate)\b/i.test(text) && !quoteRef && !isQuestion(text) && !isNegated(text)) {
    const validity = text.match(/\s*,?\s*\bvalid\s+(?:for\s+)?(\d{1,3})\s*days?\b/i);
    const asInvoice = (validity ? text.replace(validity[0], ' ') : text).replace(/\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:quotation|quote|estimate)\b/i, 'invoice');
    const quoted = parseDocument(asInvoice);
    if (quoted && quoted.problem) return documentProblemReply(quoted);
    if (quoted) {
      if (quoted.lines[0].gstRate == null) {
        return { kind: 'reply', reply: 'I have not made the quote, because I will not guess the GST rate. Say it again with the rate, for example "quote ABC Ltd 50000 for consulting GST 18%".', tools: [] };
      }
      return { kind: 'tool', name: 'create_quote', args: { partyName: quoted.partyName, ...(quoted.partyGstin ? { partyGstin: quoted.partyGstin } : {}), lines: quoted.lines, ...(validity ? { validDays: Number(validity[1]) } : {}) } };
    }
  }
  const closeYearAsk = text.match(/\bclose\s+(?:the\s+)?(?:year|books?\s+for|financial\s+year|fy)\s*(\d{4}(?:-\d{2})?)?\b/i);
  if (closeYearAsk && !isQuestion(text) && !isNegated(text)) return { kind: 'tool', name: 'close_year', args: closeYearAsk[1] ? { year: closeYearAsk[1] } : {} };
  const tdsAsk = planTdsFromChat(text);
  if (tdsAsk) return tdsAsk;
  const gstPay = planGstPayFromChat(text);
  if (gstPay) return gstPay;
  const transport = planTransportFromChat(text);
  if (transport) return transport;
  const address = planAddressFromChat(state, text);
  if (address) return address;
  const payroll = planPayrollFromChat(state, text);
  if (payroll) return payroll;
  const hired = planEmployeeFromChat(text);
  if (hired) return hired;
  const filed = planFilingFromChat(text);
  if (filed) return filed;
  const owed = planOweQuestion(state, text);
  if (owed) return owed;
  const report = planReportFromChat(state, text);
  if (report) return report;
  const supplierBank = planSupplierBankFromChat(state, text);
  if (supplierBank) return supplierBank;
  const advance = planAdvanceTaxFromChat(state, text);
  if (advance) return advance;
  const stock = planRestockFromChat(state, text);
  if (stock) return stock;
  const closing = planMonthCloseFromChat(state, text);
  if (closing) return closing;
  const run = planPaymentRunFromChat(state, text);
  if (run) return run;
  const payment = planPaymentFromChat(state, text);
  if (payment) return payment;
  if (countryOf(state) === 'US') {
    const us = planUsFromChat(state, text);
    if (us) return us;
  }
  {
    const exported = /^export\s+(?:invoice|sale)\s+(?:to\s+)?(.+?)\s+(?:([A-Za-z]{3})\s*)?([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?\s+(?:at|rate|@)\s*([\d.]+)(?:\s+(under\s+lut|under\s+bond|without\s+(?:tax|igst)|with\s+(?:tax|igst)(?:\s+(\d{1,2})%)?))?\s*$/i.exec(text.trim());
    if (exported && !isNegated(text) && !isQuestion(text)) {
      const currency = (exported[2] || exported[4] || 'USD').toUpperCase();
      const amount = Number(exported[3].replace(/,/g, ''));
      const withTax = /^with\s/i.test(exported[6] || '');
      const gstRate = withTax ? Number(exported[7] || 18) : 0;
      return { kind: 'tool', name: 'create_invoice', args: { partyName: exported[1].trim(), lines: [{ description: 'Export', qty: 1, rate: amount, gstRate }], exportSale: { currency, exchangeRate: Number(exported[5]), withTax } } };
    }
  }
  const saidTerms = takeInvoiceTerms(text);
  const doc = /\b(?:debit|credit)\s+note\b/i.test(text) ? null : parseDocument(saidTerms.text);
  const asking = isQuestion(text) || isNegated(text);
  if (doc && doc.problem && !asking && (isPurchaseIntent(text) || isSaleIntent(text))) return documentProblemReply(doc);
  if (doc && doc.problem) return { kind: 'tool', name: 'company_profile', args: {}, fallback: true };
  if (doc && !asking && doc.lines[0].gstRate == null && (isPurchaseIntent(text) || isSaleIntent(text))) {
    return {
      kind: 'reply',
      reply: 'I have not posted anything, because I will not guess the GST rate. Say it again with the rate, for example "invoice Retail Mart 8000 GST 18%". Use GST 0% if none applies.',
      tools: [],
    };
  }
  if (doc && !asking && isPurchaseIntent(text)) return { kind: 'tool', name: 'create_purchase', args: doc };
  if (doc && !asking && isSaleIntent(text)) return { kind: 'tool', name: 'create_invoice', args: saidTerms.days == null ? doc : { ...doc, paymentTermsDays: saidTerms.days } };
  if (doc && asking && (isPurchaseIntent(text) || isSaleIntent(text))) {
    return { kind: 'reply', reply: 'That reads like a question, so I have not posted anything. To post it, say it as an instruction, for example "invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 50000, GST 5%".', tools: [] };
  }

  const connectReq = text.match(/\bconnect\s+(REQ-CA-\d{3}|[a-z_]+)\b(?:.*?\bprovider\s+([A-Za-z0-9 .&_-]{2,60}))?/i);
  if (connectReq && /\b(api|integration|connector|requirement|provider)\b/i.test(text)) {
    return {
      kind: 'tool',
      name: 'integration_connect',
      args: {
        requirementId: connectReq[1],
        provider: (connectReq[2] || 'Manual connector').trim(),
      },
    };
  }

  const disconnectReq = text.match(/\b(disconnect|remove)\s+(REQ-CA-\d{3}|[a-z_]+)\b/i);
  if (disconnectReq && /\b(api|integration|connector|requirement)\b/i.test(text)) {
    return {
      kind: 'tool',
      name: 'integration_disconnect',
      args: { requirementId: disconnectReq[2] },
    };
  }

  if (/\b(sandbox\s*(status|ping|health|test|check)|ping\s*sandbox)\b/i.test(text)) {
    return { kind: 'tool', name: 'sandbox_status', args: {} };
  }

  if (/\bconnect\s+(sandbox|quicko)\b/i.test(text)) {
    return { kind: 'tool', name: 'sandbox_connect', args: {} };
  }

  if (/\b(nim\s*(status|ping|health|check)|nvidia\s*nim)\b/i.test(text)) {
    return { kind: 'tool', name: 'nim_status', args: {} };
  }

  const nimAskMatch = text.match(/^(?:ask\s+nim|nim|ask\s+nvidia)\s+(.+)$/i);
  if (nimAskMatch) {
    return { kind: 'tool', name: 'nim_ask', args: { prompt: nimAskMatch[1].trim() } };
  }

  if (/\b(nic\s*mock\s*auth|mock\s*nic\s*auth|mock\s*auth)\b/i.test(text)) {
    return { kind: 'tool', name: 'govt_nic_auth', args: {} };
  }

  const gstinQuery = text.match(/\b(?:validate|verify|check|search|lookup)\s*gstin\s+([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/i);
  if (gstinQuery) {
    return { kind: 'tool', name: 'validate_gstin', args: { gstin: gstinQuery[1].toUpperCase() } };
  }

  const standaloneGstin = text.match(/^gstin\s+([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])$/i)
    || text.match(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])$/i);
  if (standaloneGstin && !doc) {
    return { kind: 'tool', name: 'validate_gstin', args: { gstin: standaloneGstin[1].toUpperCase() } };
  }

  const trackQuery = text.match(/\b(?:track\s+returns?|return\s+status|filing\s+status)\b(?:\s+(?:for\s+)?([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]))?/i);
  if (trackQuery) {
    const gstin = trackQuery[1] ? trackQuery[1].toUpperCase() : undefined;
    return { kind: 'tool', name: 'track_gst_returns', args: gstin ? { gstin } : {} };
  }

  const reminder = planReminderFromChat(text);
  if (reminder) return reminder;
  const cash = planCashFromChat(text);
  if (cash) return cash;
  const terms = planTermsFromChat(text);
  if (terms) return terms;

  if (/\breview\b.*\btds\b|\btds\b.*\breview\b/i.test(text) && !isNegated(text)) {
    return planTdsReview(state, text, /\bsalar(?:y|ies)\b|\b24q\b|\bform\s*138\b/i.test(text) ? 'salary' : 'other');
  }
  if (/\btds\b.*\b(?:return|statement|26q|24q|form\s*1(?:38|40)|quarterly)\b|\b(?:return|statement|26q|24q|quarterly)\b.*\btds\b/i.test(text) && !isNegated(text)) {
    const quarter = quarterSaid(text);
    const form = /\bsalar(?:y|ies)\b|\b24q\b|\bform\s*138\b/i.test(text) ? 'salary' : 'other';
    return { kind: 'tool', name: 'tds_return', args: { ...(quarter ? { quarter } : {}), ...(form === 'salary' ? { form } : {}) } };
  }
  {
    const ask = /^(?:request|ask)\s+(?:documents?\s+)?from\s+([A-Za-z0-9_-]+)\s*:\s*(.+?)(?:\s+for\s+(\d{4}-\d{2}))?(?:\s+by\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (ask && !isNegated(text)) {
      return { kind: 'tool', name: 'request_documents', args: { clientId: ask[1].toUpperCase(), items: ask[2].split(',').map((item) => item.trim()).filter(Boolean), ...(ask[3] ? { period: ask[3] } : {}), ...(ask[4] ? { dueOn: ask[4] } : {}) } };
    }
    const got = /^(?:received|got)\s+(.+?)\s+(?:for|against|on)\s+(DRQ-\d{4,})\s*$/i.exec(text.trim());
    if (got && !isNegated(text)) return { kind: 'tool', name: 'record_document_received', args: { id: got[2].toUpperCase(), ...(/^(?:all|everything)$/i.test(got[1].trim()) ? {} : { item: got[1].trim().toLowerCase() }) } };
    if (/^\s*(?:document\s+requests?|what\s+(?:documents?|files)\s+(?:are|is)\s+(?:still\s+)?(?:outstanding|pending|due)|outstanding\s+documents?)\s*\??\s*$/i.test(text)) return { kind: 'tool', name: 'document_requests', args: {} };
    if (/^\s*(?:eval\s+(?:log|events?)|assistant\s+log|corrections?\s+log)\s*$/i.test(text)) return { kind: 'tool', name: 'eval_events', args: {} };
    const search = /^\s*(?:search|find)\s+(?:firm\s+)?notes?\s+(?:for\s+)?(.+?)\s*$/i.exec(text);
    if (search) return { kind: 'tool', name: 'search_firm_notes', args: { query: search[1] } };
    const asked = /^\s*(?:what\s+do\s+(?:the|our)\s+notes\s+say\s+about|ask\s+(?:the\s+)?notes?|from\s+(?:the|our)\s+notes[,:]?)\s+(.+?)\s*\??\s*$/i.exec(text);
    if (asked) return { kind: 'tool', name: 'ask_knowledge', args: { question: asked[1] } };
  }
  {
    const design = planInvoiceDesignFromChat(text);
    if (design) return design;
  }
  if (/\b(?:number|numbering|series)\b.*\binvoices?\b.*\b(?:per|by|each|every)\s+(?:financial\s+)?year\b|\binvoices?\s+(?:numbering|numbers?|series)\b.*\b(?:per|by|each|every)\s+(?:financial\s+)?year\b|\byearly\s+invoice\s+(?:numbers?|numbering|series)\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'set_invoice_numbering', args: { mode: 'yearly' } };
  }
  if (/\b(?:continuous|single|one)\s+(?:invoice\s+)?(?:series|numbering|sequence)\b|\bnumber\s+invoices\s+continuously\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'set_invoice_numbering', args: { mode: 'continuous' } };
  }
  if (/\b(?:msme|udyam|micro|small\s+enterprise)\b.*\b(?:dues?|owe|owed|payable|bills?|pay)\b|\b(?:supplier|vendor)\s+dues\b|\bwhat\s+do\s+i\s+owe\s+(?:my\s+)?(?:msme|suppliers)\b/i.test(text) && !/\bis\s+(?:an?\s+)?msme\b/i.test(text)) {
    return { kind: 'tool', name: 'supplier_dues', args: {} };
  }
  {
    const msmeSaid = /^(.+?)\s+is\s+(?:an?\s+|a\s+registered\s+)?(?:msme|micro\s+enterprise|small\s+enterprise)\b(?:[,;\s]+(?:udyam\s*(?:no\.?|number)?\s*[:#]?\s*)?(UDYAM-[A-Z]{2}-\d{2}-\d{7}))?(?:.*?\bnet\s+(\d{1,3})\b|.*?\b(\d{1,3})\s+days\b)?/i.exec(text.trim());
    if (msmeSaid && !isNegated(text) && !isQuestion(text)) {
      const days = msmeSaid[3] || msmeSaid[4];
      return { kind: 'tool', name: 'set_supplier_terms', args: { partyName: msmeSaid[1].trim(), msme: true, ...(msmeSaid[2] ? { udyam: msmeSaid[2].toUpperCase() } : {}), ...(days ? { days: Number(days) } : {}) } };
    }
    const udyamOnly = /^(.+?)(?:'s)?\s+udyam\s*(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b/i.exec(text.trim());
    if (udyamOnly && !isNegated(text)) return { kind: 'tool', name: 'set_supplier_terms', args: { partyName: udyamOnly[1].trim(), msme: true, udyam: udyamOnly[2].toUpperCase() } };
  }
  if (/\b(?:salary|payroll)\b.*\b(?:payout|bank)\b.*\bfile\b|\bpayout\s+file\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'payroll_payout_file', args: { period: monthSaid(text) } };
  }
  if (/\b(?:pf|provident\s+fund|epf)\b.*\b(?:file|ecr|return|challan)\b|\becr\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'pf_ecr', args: { period: monthSaid(text) } };
  }
  if (/\besi(?:c)?\b.*\b(?:file|return|contribution)\b|\bstate\s+insurance\s+(?:file|return)\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'esi_return', args: { period: monthSaid(text) } };
  }
  if (/\breview\b.*\b(?:gst|gstr|return)\b|\b(?:gst|gstr-?[13]b?|return)\b.*\breview\b/i.test(text) && !isNegated(text)) {
    return planReview(state, text);
  }

  const cancelMatch = text.match(/\bcancel\s+(?:invoice\s+)?(INV-\d{4,})\b(?:\s*(?:because|reason|:|-)?\s*(.+))?$/i);
  if (cancelMatch && !isQuestion(text) && !/\b(?:do\s*not|don'?t|never)\b/i.test(text) && !/\b(?:irn|e-?invoice)\b/i.test(text)) {
    const reason = String(cancelMatch[2] || '').trim();
    return { kind: 'tool', name: 'cancel_invoice', args: { invoiceId: cancelMatch[1].toUpperCase(), date: receiptDate(text, localToday()), ...(reason ? { reason: reason.slice(0, 200) } : {}) } };
  }
  const supplierNote = text.match(/\bdebit\s+note\b.*?\b(BILL-\d{4,})\b/i);
  const supplierIssued = supplierNote && /\b(?:supplier'?s?|their|vendor'?s?)\s+debit\s+note\b|\bdebit\s+note\s+from\b|\breceived\s+(?:a\s+)?debit\s+note\b/i.test(text);
  if (supplierIssued && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text.replace(/\b(?:no\b\.?|number\b|#)\s*[A-Z0-9/-]+/i, ' '));
    const noteNo = (text.match(/\b(?:note\s+)?(?:no\b\.?|number\b|#)\s*([A-Z0-9][A-Z0-9/-]{0,15})\b/i) || [])[1] || '';
    const cleaned = text.replace(/,?\s*(?:note\s+)?(?:no\b\.?|number\b|#)\s*[A-Z0-9][A-Z0-9/-]*\s*$/i, '');
    const afterBill = cleaned.slice(cleaned.toUpperCase().indexOf(supplierNote[1].toUpperCase()) + supplierNote[1].length);
    const reason = (cleaned.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterBill.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (amount == null) return { kind: 'reply', reply: `Say the amount, for example "supplier's debit note on ${supplierNote[1].toUpperCase()} 2360 - extra freight, no. FC-7". I have recorded nothing.`, tools: [] };
    if (!reason.trim()) return { kind: 'reply', reply: `Say why, for example "supplier's debit note on ${supplierNote[1].toUpperCase()} 2360 - extra freight". I have recorded nothing.`, tools: [] };
    return { kind: 'tool', name: 'record_supplier_debit_note', args: { billId: supplierNote[1].toUpperCase(), amount, date: receiptDate(text, localToday()), reason: reason.replace(/,?\s*(?:note\s+)?(?:no\b\.?|number\b|#)\s*[A-Z0-9/-]+\s*$/i, '').trim().slice(0, 200), ...(noteNo ? { supplierNoteNo: noteNo.toUpperCase() } : {}) } };
  }
  if (supplierNote && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
    const afterBill = text.slice(text.toUpperCase().indexOf(supplierNote[1].toUpperCase()) + supplierNote[1].length);
    const reason = (text.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterBill.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (amount == null) return { kind: 'reply', reply: `Say the amount, for example "debit note for ${supplierNote[1].toUpperCase()} 1000 - goods returned". I have recorded nothing.`, tools: [] };
    if (!reason.trim()) return { kind: 'reply', reply: `Say why, for example "debit note for ${supplierNote[1].toUpperCase()} 1000 - goods returned". I have recorded nothing.`, tools: [] };
    return { kind: 'tool', name: 'create_purchase_note', args: { billId: supplierNote[1].toUpperCase(), amount, date: receiptDate(text, localToday()), reason: reason.trim().slice(0, 200) } };
  }
  const debitMatch = text.match(/\bdebit\s+note\b.*?\b(INV-\d{4,})\b/i);
  if (debitMatch && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
    const afterInvoice = text.slice(text.toUpperCase().indexOf(debitMatch[1].toUpperCase()) + debitMatch[1].length);
    const reason = (text.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterInvoice.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (amount == null) return { kind: 'reply', reply: `Say the amount, for example "debit note for ${debitMatch[1].toUpperCase()} 2000 - price revised". I have recorded nothing.`, tools: [] };
    if (!reason.trim()) return { kind: 'reply', reply: `Say why, for example "debit note for ${debitMatch[1].toUpperCase()} 2000 - price revised". I have recorded nothing.`, tools: [] };
    return { kind: 'tool', name: 'create_debit_note', args: { invoiceId: debitMatch[1].toUpperCase(), amount, date: receiptDate(text, localToday()), reason: reason.trim().slice(0, 200) } };
  }
  const creditMatch = text.match(/\bcredit\s+note\b.*?\b(INV-\d{4,})\b/i);
  if (creditMatch && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
    if (amount == null && saidNonPositiveAmount(text)) return { kind: 'reply', reply: `A credit note has to be a positive amount, for example "credit note for ${creditMatch[1].toUpperCase()} 2000 - goods returned". I have recorded nothing.`, tools: [] };
    const afterInvoice = text.slice(text.toUpperCase().indexOf(creditMatch[1].toUpperCase()) + creditMatch[1].length);
    const reason = (text.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterInvoice.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (!reason.trim()) {
      return { kind: 'reply', reply: `Say why, for example "credit note for ${creditMatch[1].toUpperCase()} 2000 - goods returned". I have recorded nothing.`, tools: [] };
    }
    return { kind: 'tool', name: 'create_credit_note', args: { invoiceId: creditMatch[1].toUpperCase(), date: receiptDate(text, localToday()), reason: reason.trim().slice(0, 200), ...(amount == null ? {} : { amount }) } };
  }

  const decisionMatch = text.match(/\b(waive|resolve|reopen|assign)\s+(EXC-\d{6})\b(.*)$/i);
  if (decisionMatch) {
    const [, verb, id, tail] = decisionMatch;
    const note = (tail.match(/(?:because|reason|:|-)\s*(.+)$/i) || [])[1] || '';
    const owner = (tail.match(/\bto\s+([A-Za-z][A-Za-z0-9 .'-]{1,40})/i) || [])[1] || '';
    return {
      kind: 'tool',
      name: 'exception_decide',
      args: {
        id: id.toUpperCase(),
        decision: verb.toLowerCase(),
        ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}),
        ...(owner.trim() ? { owner: owner.trim() } : {}),
      },
    };
  }

  const printId = text.match(/\b(INV-\d+|BILL-\d+)\b/i);
  if (printId && /print|show/i.test(text) && !/irn|einvoice|e-invoice/i.test(text)) {
    return { kind: 'tool', name: 'print_invoice', args: { id: printId[1].toUpperCase() } };
  }

  const mockIrnId = text.match(/\b((?:INV|CN|DN)-\d+)\b/i);
  if (mockIrnId && /\bmock\s*(irn|einvoice|e-invoice)\b/i.test(text)) {
    return { kind: 'tool', name: 'govt_nic_mock', args: { invoiceId: mockIrnId[1].toUpperCase() } };
  }

  const irnId = text.match(/\b((?:INV|CN|DN)-\d+)\b/i);
  if (irnId && /\birn\b|e-?invoice/i.test(text)) {
    const invoiceId = irnId[1].toUpperCase();
    if (/\bcancel/i.test(text)) return { kind: 'tool', name: 'govt_nic_cancel_irn', args: { invoiceId } };
    const negated = /\b(do\s*not|don'?t|never|stop|avoid)\b/i.test(text);
    const question = /\?\s*$/.test(text) || /^\s*(what|which|when|where|why|how|is|are|has|have|does|did|do|can|show|status)\b/i.test(text);
    if (negated || question) {
      return { kind: 'reply', reply: `Nothing was generated. To issue an IRN for ${invoiceId}, say "generate irn ${invoiceId}"; it still needs a CA approval before anything reaches the IRP.` };
    }
    return { kind: 'tool', name: 'govt_generate_irn', args: { invoiceId } };
  }

  const paidId = text.match(/\b(INV-\d+)\b/i);
  if (paidId && /\b(paid|receipt|received)\b/i.test(text)) {
    const invoiceId = paidId[1].toUpperCase();
    if (isQuestion(text) || isNegated(text)) {
      const inv = (state.invoices || []).find((i) => i.id === invoiceId);
      const status = inv ? `${invoiceId} is marked ${inv.status}.` : `${invoiceId} is not in these books.`;
      return { kind: 'reply', reply: `${status} I have recorded nothing. To record money received, say "record receipt ${invoiceId}" and confirm the preview.`, tools: [] };
    }
    const amount = receiptAmount(text);
    if (amount == null && saidNonPositiveAmount(text)) return { kind: 'reply', reply: `An amount of zero or less cannot be received. Say the amount, for example "received 5000 against ${invoiceId}", or leave it out to settle the whole invoice. I have recorded nothing.`, tools: [] };
    return {
      kind: 'tool',
      name: 'record_receipt',
      args: { invoiceId, mode: /cash/i.test(text) ? 'cash' : 'bank', date: receiptDate(text, localToday()), ...(amount == null ? {} : { amount }) },
    };
  }

  const retag = planRetagFromChat(state, text);
  if (retag) return retag;
  const expense = planExpenseFromChat(state, text);
  if (expense) return expense;
  const chase = planCollectionFromChat(state, text);
  if (chase) return chase;
  const receipt = planReceiptWithoutInvoice(state, text);
  if (receipt) return receipt;

  if ((isQuestion(text) || isNegated(text)) && /\b(import|attach|upload|reconcile)\b/i.test(text) && /\b(tally|zoho|bank|statement|xml|csv)\b/i.test(text)) {
    return {
      kind: 'reply',
      reply: 'Nothing was imported. Attach the file with the dropdown, then say "import tally", "import zoho", "import bank" or "import tally xml"; I will show you what it would post before anything lands in the books.',
      tools: [],
    };
  }
  if (/\bimport tally xml\b|\btally xml\b/i.test(text)) {
    const xml = pendingFileContent(state) || state.files.tallyXml;
    if (!xml) return { kind: 'reply', reply: 'Attach a Tally XML file first (dropdown: Tally XML).', tools: [] };
    return { kind: 'tool', name: 'import_tally_xml', args: { xml, fileName: state.pendingFile?.name || 'tally.xml' }, clearsPendingFile: true };
  }
  if (/\bimport tally\b|\btally day/i.test(text)) {
    const csv = pendingFileContent(state) || state.files.tally;
    if (!csv) return { kind: 'reply', reply: 'Attach a Tally Day Book CSV first (dropdown: Tally Day Book).', tools: [] };
    return { kind: 'tool', name: 'import_tally', args: { csv, fileName: state.pendingFile?.name || 'tally.csv' }, clearsPendingFile: true };
  }
  {
    const addReg = /^(?:add|register|new)\s+(?:gst\s+)?registration\s+([0-9]{2}[A-Z0-9]{13})(?:\s+(?:as|kind)\s+(apob|warehouse|branch))?(?:\s+(?:called|labelled|label)\s+(.+))?\s*$/i.exec(text.trim());
    if (addReg && !isNegated(text)) return { kind: 'tool', name: 'set_registration', args: { gstin: addReg[1].toUpperCase(), ...(addReg[2] ? { kind: addReg[2].toLowerCase() } : {}), ...(addReg[3] ? { label: addReg[3].trim() } : {}) } };
    const retire = /^(?:retire|surrender|close)\s+(?:gst\s+)?registration\s+([0-9]{2}[A-Z0-9]{13})(?:\s+(?:from|on)\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (retire && !isNegated(text)) return { kind: 'tool', name: 'retire_registration', args: { gstin: retire[1].toUpperCase(), ...(retire[2] ? { effectiveTo: retire[2] } : {}) } };
    if (/^(?:gst\s+)?registrations\??$|\b(?:my|our|list)\s+(?:gst\s+)?registrations\b|\bwhich\s+gstins?\b/i.test(text.trim())) return { kind: 'tool', name: 'registrations', args: {} };
    const move = /^(?:transfer|move)\s+([\d.]+)\s+(?:of\s+)?([A-Za-z0-9][A-Za-z0-9_./-]{0,63})\s+from\s+([0-9]{2}[A-Z0-9]{13})\s+to\s+([0-9]{2}[A-Z0-9]{13})(?:\s+at\s+(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:each|per unit)?)?(?:\s+(?:gst\s+)?(\d{1,2})%)?\s*$/i.exec(text.trim());
    if (move && !isNegated(text)) return { kind: 'tool', name: 'record_stock_transfer', args: { sku: move[2].toUpperCase(), qty: Number(move[1]), fromGstin: move[3].toUpperCase(), toGstin: move[4].toUpperCase(), ...(move[5] ? { unitValue: Number(move[5].replace(/,/g, '')) } : {}), ...(move[6] ? { gstRate: Number(move[6]) } : {}) } };
  }
  if (/\b(?:daily|nightly|day'?s|today'?s)\s+close\b|\bclose\s+(?:status|checklist|the\s+books|of\s+the\s+day)\b|\b(?:are|is)\s+(?:the\s+|my\s+)?books\s+closed\b|\bbooks\s+closed\s*\??$|^closure\s*\??$/i.test(text) && !/\bclose\s+(?:the\s+)?year\b|\byear\s+close\b/i.test(text)) {
    const on = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
    return { kind: 'tool', name: 'daily_close', args: on ? { asOf: on[1] } : {} };
  }
  {
    const cost = /^(?:cost\s+of\s+|set\s+cost\s+(?:of\s+)?)([A-Za-z0-9][A-Za-z0-9_./-]{0,63})\s+(?:is|=|:|to|at)?\s*(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)(?:\s+(?:at|gst)\s+(\d{1,2})%)?\s*$/i.exec(text.trim());
    if (cost && !isNegated(text)) return { kind: 'tool', name: 'set_sku_cost', args: { sku: cost[1].toUpperCase(), cost: Number(cost[2].replace(/,/g, '')), ...(cost[3] ? { gstRate: Number(cost[3]) } : {}) } };
    const stock = /^stock\s+(in|out)\s+([A-Za-z0-9][A-Za-z0-9_./-]{0,63})\s+([\d.]+)(?:\s+(?:at|to|from|in)\s+([A-Za-z0-9][A-Za-z0-9 _-]{0,39}))?\s*$/i.exec(text.trim());
    if (stock && !isNegated(text)) return { kind: 'tool', name: 'record_stock', args: { sku: stock[2].toUpperCase(), qty: stock[1].toLowerCase() === 'in' ? Number(stock[3]) : -Number(stock[3]), ...(stock[4] ? { location: stock[4].trim().toLowerCase() } : {}) } };
    if (/\bimport\s+(?:sku\s+)?costs?\b|\bsku\s+costs?\s+(?:file|csv|sheet)\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach a sheet with sku and cost columns (name and HSN optional), then say "import sku costs".', tools: [] };
      return { kind: 'tool', name: 'import_sku_costs', args: { csv }, clearsPendingFile: true };
    }
    const margins = /\bmargins?\b.*\b(?:sku|channel|product)s?\b|\b(?:sku|product|channel)\s+margins?\b|\bwhich\s+(?:skus?|products?)\s+(?:make|lose|earn)\b|\bmargins?\s+(?:for|in)\s+(\d{4}-\d{2})\b|^margins?\??$/i.exec(text);
    if (margins) {
      const period = /\b(\d{4}-(?:0[1-9]|1[0-2]))\b/.exec(text);
      const channel = /\b(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\b/i.exec(text);
      return { kind: 'tool', name: 'sku_margins', args: { ...(period ? { period: period[1] } : {}), ...(channel ? { channel: channel[1].toLowerCase() } : {}) } };
    }
    const valuing = /^value\s+(?:the\s+)?(?:inventory|stock)(?:\s+(?:at|as\s+at|on|as\s+of)\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (valuing && !isNegated(text)) return { kind: 'tool', name: 'value_inventory', args: valuing[1] ? { asOf: valuing[1] } : {} };
    if (/\b(?:inventory|stock)\s+valuations?\b|\bwhat\s+is\s+(?:my\s+)?(?:inventory|stock)\s+worth\b|\bvalue\s+of\s+(?:my\s+)?(?:inventory|stock)\b/i.test(text)) return { kind: 'tool', name: 'inventory_valuations', args: {} };
    const history = /\b(?:stock\s+(?:history|movements?|moves)|movements?\s+of)\s*(?:of\s+|for\s+)?([A-Za-z0-9][A-Za-z0-9_./-]{0,63})?\s*\??$/i.exec(text.trim());
    if (history) return { kind: 'tool', name: 'stock_moves', args: history[1] ? { sku: history[1].toUpperCase() } : {} };
    if (/\bstock\s+(?:on\s+hand|position|level|left|balance)\b|\bhow\s+much\s+stock\b|\bstock\s+(?:at|in)\s+[A-Za-z]/i.test(text)) {
      const location = /\bstock\s+(?:at|in)\s+([A-Za-z0-9][A-Za-z0-9 _-]{0,39}?)\s*\??$/i.exec(text.trim());
      return { kind: 'tool', name: 'stock_position', args: location ? { location: location[1].trim().toLowerCase() } : {} };
    }
  }
  {
    const identity = /^(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\s+(?:gstin|tan)\b/i.exec(text.trim());
    if (identity && !isQuestion(text)) {
      const gstin = /\bgstin\s*[:#]?\s*([0-9]{2}[A-Z0-9]{13})\b/i.exec(text);
      const tan = /\btan\s*[:#]?\s*([A-Z]{4}[0-9]{5}[A-Z])\b/i.exec(text);
      return { kind: 'tool', name: 'set_channel_identity', args: { channel: identity[1].toLowerCase(), ...(gstin ? { gstin: gstin[1].toUpperCase() } : {}), ...(tan ? { tan: tan[1].toUpperCase() } : {}) } };
    }
    if (/\bimport\s+(?:the\s+)?tcs\s+(?:credit\s+)?(?:statement|received|credits?)\b|\btds\s+and\s+tcs\s+credit\s+received\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach the "TDS and TCS credit received" statement from the GST portal (operator GSTIN, period, integrated, central and state tax), then say "import tcs statement".', tools: [] };
      return { kind: 'tool', name: 'import_tcs_statement', args: { csv }, clearsPendingFile: true };
    }
    if (/\bimport\s+(?:form\s+)?26\s*as\b|\b26\s*as\s+(?:credits?|194-?o)\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach Form 26AS as a CSV or text table (section, TAN of deductor, tax deducted, date), then say "import 26AS". Only section 194-O rows are read here.', tools: [] };
      return { kind: 'tool', name: 'import_26as_credits', args: { csv }, clearsPendingFile: true };
    }
    if (/\b(?:tcs|194-?o|tds\s+194)\b.*\b(?:credits?|claim|status|available|deducted)\b|\b(?:marketplace|amazon|flipkart)\s+(?:tcs|tds)\b|\btcs\s+and\s+tds\b/i.test(text)) {
      return { kind: 'tool', name: 'marketplace_credits', args: {} };
    }
  }
  {
    const orders = /\bimport\s+(?:the\s+)?(?:(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay|quick[\s-]?commerce)\s+)?(?:orders?|mtr|order\s+report|sales\s+report|gst\s+report)\b/i.exec(text);
    if (orders && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      const fetchedOrders = !csv && orders[1] ? state.attachments?.[`channel:${orders[1].toLowerCase()}:orders`] : null;
      if (!csv && fetchedOrders) return { kind: 'tool', name: 'import_marketplace_orders', args: { documentSha256: fetchedOrders.sha256, channel: orders[1].toLowerCase() } };
      if (!csv) return { kind: 'reply', reply: 'Attach the order report first (Amazon MTR, Flipkart GST report, or any sheet with order id, date, delivery state, GST rate and taxable value), then say "import amazon orders". Each day and state becomes one invoice to unregistered buyers after you see the preview; returns become credit notes.', tools: [] };
      const channel = orders[1] ? orders[1].toLowerCase().replace(/\s+/, '-') : undefined;
      return { kind: 'tool', name: 'import_marketplace_orders', args: { csv, ...(channel ? { channel } : {}) }, clearsPendingFile: true };
    }
  }
  {
    const fetching = /^(?:[f]etch|pull|download)\s+(?:the\s+)?(amazon|shopify|razorpay)\s+(settlement|payout|orders?)s?(?:\s+(?:report|file))?(?:\s+(?:from|since)\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(?:to|until)\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (fetching && !isNegated(text)) return { kind: 'tool', name: 'fetch_channel_report', args: { channel: fetching[1].toLowerCase(), kind: /^order/i.test(fetching[2]) ? 'orders' : 'settlement', ...(fetching[3] ? { from: fetching[3] } : {}), ...(fetching[4] ? { to: fetching[4] } : {}) } };
    if (/^(?:sync|[f]etch|pull)\s+(?:all\s+)?(?:channels?|marketplaces?|connectors?)\s*$/i.test(text.trim()) && !isNegated(text)) return { kind: 'tool', name: 'sync_channels', args: {} };
    const zohoPush = /^\s*(?:push|send|sync)\s+(?:the\s+)?(?:invoices\s+)?(?:to\s+)?zoho(?:\s+books)?(?:\s+(?:invoices|for))?\s*(\d{4}-\d{2})?\s*(?:with\s+approval\s+([A-Za-z0-9-]+))?\s*$/i.exec(text);
    if (zohoPush && !isNegated(text)) return { kind: 'tool', name: 'push_zoho_invoices', args: { ...(zohoPush[1] ? { period: zohoPush[1] } : {}), ...(zohoPush[2] ? { caApprovalId: zohoPush[2] } : {}) } };
    if (/\b(?:channel|marketplace)\s+connectors?\b|\bconnected\s+channels\b|\bwhich\s+channels\s+are\s+connected\b/i.test(text)) return { kind: 'tool', name: 'channel_connectors', args: {} };
  }
  {
    const settle = /\bimport\s+(?:the\s+)?(?:(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay|quick[\s-]?commerce)\s+)?(?:settlement|payout)s?\b(?:\s+(?:report|file|csv))?(?:.*?\b(?:bank|received|got|paid)\s+(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?))?/i.exec(text);
    if (settle && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      const fetchedSettlement = !csv && settle[1] ? state.attachments?.[`channel:${settle[1].toLowerCase()}:settlement`] : null;
      if (!csv && fetchedSettlement) return { kind: 'tool', name: 'import_settlement', args: { documentSha256: fetchedSettlement.sha256, channel: settle[1].toLowerCase(), ...(settle[2] ? { bankAmount: Number(settle[2].replace(/,/g, '')) } : {}) } };
      if (!csv) return { kind: 'reply', reply: 'Attach the settlement or payout report first (Amazon settlement CSV, Flipkart settlement sheet, or any sheet with sale, fees and settlement value per order), then say "import settlement". Add "bank received 1,23,456" if the bank credit is not in the books yet.', tools: [] };
      const channel = settle[1] ? settle[1].toLowerCase().replace(/\s+/, '-') : undefined;
      const bankAmount = settle[2] ? Number(settle[2].replace(/,/g, '')) : undefined;
      return { kind: 'tool', name: 'import_settlement', args: { csv, ...(channel ? { channel } : {}), ...(bankAmount != null ? { bankAmount } : {}) }, clearsPendingFile: true };
    }
    const paid = /\b(?:did|has|have)\s+(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\s+(?:pay|paid|settle|settled)\b|\b(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\s+(?:payout|payouts|settlement|settlements)\b|\bsettlement\s+status\b|\b(?:marketplace\s+)?payouts?\s+(?:status|so far|this month)\b/i.exec(text);
    if (paid) {
      const channel = (paid[1] || paid[2] || '').toLowerCase();
      return { kind: 'tool', name: 'settlement_status', args: channel ? { channel } : {} };
    }
  }
  if (/\bimport\s+(?:pos|counter|daily)\s*(?:sales)?\b|\b(?:pos|counter)\s+sales\s+(?:csv|file|import)\b/i.test(text)) {
    const csv = pendingFileContent(state);
    if (!csv) return { kind: 'reply', reply: 'Attach the daily sales CSV from your billing counter first (date, GST rate, taxable value, and the GST if it has it), then say "import pos sales". Each day becomes one walk-in invoice by rate after you see the preview.', tools: [] };
    return { kind: 'tool', name: 'import_pos_sales', args: { csv }, clearsPendingFile: true };
  }
  if (/\bimport\s+(?:quickbooks|qbo|xero)\b|\b(?:quickbooks|xero)\s+(?:invoices|export|csv)\b/i.test(text)) {
    const csv = pendingFileContent(state);
    if (!csv) return { kind: 'reply', reply: 'Attach the QuickBooks or Xero invoice CSV first, then say "import xero" or "import quickbooks". I will show what would post before anything lands in the books.', tools: [] };
    const jurisdiction = (text.match(/\b(?:tax|jurisdiction)\s+([A-Z]{2}(?:-[A-Z0-9]{2,20})?)\b/) || [])[1];
    return { kind: 'tool', name: 'import_us_invoices', args: { csv, ...(jurisdiction ? { taxJurisdiction: jurisdiction } : {}) }, clearsPendingFile: true };
  }
  if (/\bimport zoho\b|\bzoho books\b/i.test(text)) {
    const csv = pendingFileContent(state) || state.files.zoho;
    if (!csv) return { kind: 'reply', reply: 'Attach a Zoho Books invoice CSV first.', tools: [] };
    return { kind: 'tool', name: 'import_zoho', args: { csv }, clearsPendingFile: true };
  }
  if (/\bimport bank\b|\bbank statement\b|\bimport\s+(?:account\s+aggregator|aa)\s+(?:data|file|json|statement)\b|\baccount\s+aggregator\s+(?:data|file|json)\b/i.test(text)) {
    const content = pendingFileContent(state) || state.files.bank;
    if (!content) return { kind: 'reply', reply: 'Attach a bank CSV or TXT, or the Account Aggregator FI data JSON, first.', tools: [] };
    const name = state.pendingFile?.name || '';
    return { kind: 'tool', name: 'import_bank', args: { content, type: /\.json$/i.test(name) || /account\s+aggregator|\baa\b/i.test(text) ? 'aa' : /\.txt$/i.test(name) ? 'text' : 'csv' }, clearsPendingFile: true };
  }

  for (const route of ROUTES) {
    if (!route.re.test(text)) continue;
    const period = PERIOD_TOOLS.has(route.tool) ? saidPeriod(text) : '';
    return { kind: 'tool', name: route.tool, args: period ? { period } : {} };
  }

  if (doc) {
    return { kind: 'reply', reply: 'Say “invoice …” to sell or “purchase from …” to book a supplier bill, with a rate and GST %.', tools: [] };
  }

  return { kind: 'tool', name: 'company_profile', args: {}, fallback: true };
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function reviewPeriodSaid(state, text) {
  const iso = text.match(/\b(\d{4}-(?:0[1-9]|1[0-2]))\b/);
  if (iso) return iso[1];
  const lower = text.toLowerCase();
  const index = MONTH_NAMES.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}(?:${name.slice(3)})?\\b`).test(lower));
  if (index < 0) return undefined;
  const wanted = String(index + 1).padStart(2, '0');
  const known = (reviewOf(state).data?.periods || []).filter((period) => period.endsWith(`-${wanted}`));
  return known.at(-1) || `${localToday().slice(0, 4)}-${wanted}`;
}

function monthSaid(text) {
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const lower = text.toLowerCase();
  const index = MONTH_NAMES.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}(?:${name.slice(3)})?\\b`).test(lower));
  const today = localToday();
  if (index < 0) return today.slice(0, 7);
  const [y, m] = today.split('-').map(Number);
  const year = index + 1 <= m ? y : y - 1;
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}

function quarterSaid(text) {
  const said = text.match(/\b(?:FY\s*)?(\d{4}-\d{2})\s*[-,]?\s*Q([1-4])\b|\bQ([1-4])\b(?:\s*(?:of\s*|,\s*|FY\s*)?(\d{4}-\d{2}))?/i);
  if (!said) return '';
  const quarter = said[2] || said[3];
  const fy = said[1] || said[4];
  if (fy) return parseQuarter(`Q${quarter} ${fy}`)?.label || '';
  const today = localToday();
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return `Q${quarter} ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function planTdsReview(state, text, form = 'other') {
  const review = tdsReviewOf(state, quarterSaid(text) || undefined, form);
  if (!review.ok) {
    if (review.error === 'NOT_A_DEDUCTOR') return { kind: 'reply', reply: 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN to start.', tools: [] };
    if (review.error === 'NO_DEDUCTIONS') return { kind: 'reply', reply: form === 'salary' ? 'No salary TDS has been deducted yet; approve a payroll month first.' : 'No TDS has been deducted yet, so there is no statement to review.', tools: [] };
    return { kind: 'reply', reply: 'I could not read the quarter. Say it like "review TDS for Q2 2026-27".', tools: [] };
  }
  const data = review.data;
  if (data.empty) return { kind: 'reply', reply: `Nothing was deducted in ${data.period}, so there is nothing to review.`, tools: [] };
  if (data.approved) return { kind: 'reply', reply: `You approved the ${data.period} TDS statement on ${data.approval.on}. Nothing has changed since.`, tools: [] };
  const step = data.steps.find((item) => item.id === data.next);
  return {
    kind: 'tool',
    name: 'tds_review_answer',
    args: { period: data.period, ...(form === 'salary' ? { form } : {}), step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: data.draftHash },
  };
}

function planReview(state, text) {
  const review = reviewOf(state, reviewPeriodSaid(state, text));
  if (!review.ok) return { kind: 'reply', reply: 'I could not read the month. Say it like "review GST for September" or "review GST 2026-09".', tools: [] };
  const data = review.data;
  if (data.empty) return { kind: 'reply', reply: `There are no sales, purchases or credit notes dated in ${data.month}, so there is nothing to review.`, tools: [] };
  if (data.approved) return { kind: 'reply', reply: `You approved the ${data.month} figures on ${data.approval.on}. Nothing has changed since. Save the GSTR-1 file from Taxes, or send it to your CA.`, tools: [] };
  const step = data.steps.find((item) => item.id === data.next);
  return {
    kind: 'tool',
    name: 'gst_review_answer',
    args: { period: data.period, step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: data.draftHash },
  };
}
