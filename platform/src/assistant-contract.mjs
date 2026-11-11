import { IMS_MAX_KEY } from './ims.mjs';
import { planReceiptWithoutInvoice } from './receipt-intent.mjs';
import { planExpenseFromChat, planRetagFromChat } from './expense-intent.mjs';
import { planPaymentFromChat } from './payment-intent.mjs';
import { planOweQuestion } from './owe-intent.mjs';
import { planFilingFromChat, saidPeriod } from './filing-intent.mjs';
import { REPORT_KEYS } from './report-sheets.mjs';
import { planEmployeeFromChat } from './employee-intent.mjs';
import { planBillTdsFromChat, planTdsChat, planTdsFromChat, withoutSettledTds } from './tds-intent.mjs';
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
import { isoDate, localToday } from './dates.mjs';
import { documentsOf } from './document-store.mjs';
import { inWords } from './words.mjs';
import { isReturnPeriod } from './return-period.mjs';

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
import { normalizeChat, parseDocument, documentProblemReply, saidNonPositiveAmount, receiptAmount, amountsSaid, soleAmountSaid, receiptDate, moneyDate, isPurchaseIntent, isSaleIntent, isQuestion, isNegated, ROUTES } from './intent.mjs';
import { confirmationIntent } from './chat-confirm.mjs';
import { planBankFromChat } from './bank-intent.mjs';

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

const US_PRIOR_YEAR = { type: 'object', additionalProperties: false, properties: { agi: { type: 'integer', minimum: 0 }, pin: { type: 'string', pattern: '^[0-9]{5}$' } } };
const US_IP_PIN = { type: 'string', pattern: '^[0-9]{6}$' };

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
          countryCode: { type: 'string', pattern: '^[A-Za-z]{2}$' },
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
      kind: { type: 'string', enum: ['quote', 'proforma', 'order', 'challan'] },
      reason: { type: 'string', enum: ['job-work', 'approval', 'line-sale', 'exhibition', 'own-use', 'other'] },
    },
  },
  mark_quote: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'outcome'],
    properties: {
      id: { type: 'string', pattern: '^(QT|PI|SO|DC)-[0-9]{4,}$' },
      outcome: { type: 'string', enum: ['accepted', 'declined', 'cancelled', 'returned'] },
    },
  },
  convert_quote: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: '^(QT|PI|SO|DC)-[0-9]{4,}$' },
      date: { type: 'string' },
    },
  },
  add_recurring: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'every'],
    properties: {
      kind: { type: 'string', enum: ['invoice', 'bill', 'expense'] },
      every: { type: 'string', enum: ['week', 'month', 'quarter', 'half-year', 'year'] },
      startDate: { type: 'string' },
      endDate: { type: 'string' },
      partyName: { type: 'string', minLength: 1, maxLength: 80 },
      partyGstin: { type: 'string' },
      lines: { type: 'array', minItems: 1, items: lineSchema },
      paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 },
      taxJurisdiction: { type: 'string', maxLength: 24 },
      taxExempt: { type: 'boolean' },
      exemptionReason: { type: 'string', maxLength: 120 },
      narration: { type: 'string', maxLength: 160 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      gstRate: { type: 'number', minimum: 0, maximum: 28 },
      payee: { type: 'string', maxLength: 80 },
      supplierGstin: { type: 'string' },
      head: { type: 'string', maxLength: 8 },
    },
  },
  stop_recurring: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^RP-[0-9]{4,}$' } },
  },
  list_recurring: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['all', 'active', 'stopped', 'ended'] } },
  },
  run_recurring: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  bank_reconciliation: {
    type: 'object',
    additionalProperties: false,
    properties: {
      account: { type: 'string', maxLength: 60 },
      from: { type: 'string' },
      to: { type: 'string' },
      status: { type: 'string', enum: ['all', 'unmatched', 'matched', 'booked', 'ignored'] },
      limit: { type: 'integer', minimum: 1, maximum: 2000 },
    },
  },
  match_bank_line: {
    type: 'object',
    additionalProperties: false,
    required: ['lineId', 'kind'],
    properties: {
      lineId: { type: 'string', pattern: '^BL-[0-9]{6,}$' },
      kind: { type: 'string', enum: ['books', 'receipt', 'payment', 'expense', 'charge', 'interest', 'transfer', 'ignore'] },
      transferId: { type: 'string', maxLength: 40 },
      invoiceId: { type: 'string', maxLength: 40 },
      billId: { type: 'string', maxLength: 40 },
      partyName: { type: 'string', maxLength: 80 },
      head: { type: 'string', maxLength: 8 },
      otherAccount: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 200 },
      remember: { type: 'boolean' },
    },
  },
  unmatch_bank_line: {
    type: 'object',
    additionalProperties: false,
    required: ['lineId'],
    properties: { lineId: { type: 'string', pattern: '^BL-[0-9]{6,}$' } },
  },
  book_bank_charges: {
    type: 'object',
    additionalProperties: false,
    properties: {
      account: { type: 'string', maxLength: 60 },
      lineIds: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string', pattern: '^BL-[0-9]{6,}$' } },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  },
  add_bank_rule: {
    type: 'object',
    additionalProperties: false,
    required: ['kind'],
    properties: {
      side: { type: 'string', enum: ['in', 'out', 'any'] },
      contains: { type: 'string', minLength: 1, maxLength: 80 },
      pattern: { type: 'string', minLength: 1, maxLength: 120 },
      minAmount: { type: 'number', minimum: 0 },
      maxAmount: { type: 'number', minimum: 0 },
      kind: { type: 'string', enum: ['receipt', 'payment', 'expense', 'charge', 'interest', 'transfer', 'ignore'] },
      partyName: { type: 'string', maxLength: 80 },
      head: { type: 'string', maxLength: 8 },
      otherAccount: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 120 },
      applyNow: { type: 'boolean' },
    },
  },
  remove_bank_rule: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^BR-[0-9]{4,}$' } },
  },
  list_bank_rules: { type: 'object', additionalProperties: false, properties: {} },
  run_bank_rules: {
    type: 'object',
    additionalProperties: false,
    properties: { account: { type: 'string', maxLength: 60 }, dryRun: { type: 'boolean' } },
  },
  set_bank_account: {
    type: 'object',
    additionalProperties: false,
    required: ['label'],
    properties: {
      id: { type: 'string', pattern: '^10[0-9]{2}$' },
      label: { type: 'string', minLength: 1, maxLength: 60 },
      kind: { type: 'string', enum: ['bank', 'cash', 'wallet'] },
      maskedNumber: { type: 'string', maxLength: 24 },
      ifsc: { type: 'string', maxLength: 11 },
    },
  },
  list_bank_accounts: { type: 'object', additionalProperties: false, properties: {} },
  record_transfer: {
    type: 'object',
    additionalProperties: false,
    required: ['fromAccount', 'toAccount', 'amount'],
    properties: {
      fromAccount: { type: 'string', minLength: 1, maxLength: 60 },
      toAccount: { type: 'string', minLength: 1, maxLength: 60 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string' },
      reference: { type: 'string', maxLength: 120 },
    },
  },
  list_quotes: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['all', 'open', 'accepted', 'declined', 'expired', 'invoiced', 'cancelled', 'returned'] }, kind: { type: 'string', enum: ['all', 'quote', 'proforma', 'order', 'challan'] } },
  },
  quote_document: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^(QT|PI|SO|DC)-[0-9]{4,}$' } },
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
      address: { type: 'string', maxLength: 200 },
      email: { type: 'string', maxLength: 120 },
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
  add_bill_tds: {
    type: 'object',
    additionalProperties: false,
    required: ['billId', 'tdsSection'],
    properties: { billId: { type: 'string', pattern: '^BILL-[0-9]{4,}$' }, ...tdsProperties },
  },
  record_tds_withheld: {
    type: 'object',
    additionalProperties: false,
    required: ['invoiceId', 'amount'],
    properties: {
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string', minLength: 10, maxLength: 10 },
      section: { type: 'string', maxLength: 6 },
      tan: { type: 'string', maxLength: 10 },
    },
  },
  tds_credit_check: {
    type: 'object',
    additionalProperties: false,
    properties: { fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' } },
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
  save_gstr3b_portal: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, gstin: REGISTRATION_ARG, caApprovalId: { type: 'string', maxLength: 40 } },
  },
  gstr3b_portal_liability: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, gstin: REGISTRATION_ARG },
  },
  offset_gstr3b_portal: {
    type: 'object',
    additionalProperties: false,
    required: ['period'],
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' }, gstin: REGISTRATION_ARG, caApprovalId: { type: 'string', maxLength: 40 } },
  },
  file_gstr3b_portal: {
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
      channel: { type: 'string', enum: ['amazon', 'shopify', 'razorpay', 'zoho', 'plaid', 'taxjar', 'gusto', 'track1099', 'pinwheel'] },
      clientId: { type: 'string', maxLength: 200 }, clientSecret: { type: 'string', maxLength: 500 }, refreshToken: { type: 'string', maxLength: 2000 }, marketplaceId: { type: 'string', maxLength: 40 }, region: { type: 'string', enum: ['IN', 'EU', 'NA', 'FE'] },
      teamApiId: { type: 'string', maxLength: 80 }, secret: { type: 'string', maxLength: 500 }, environment: { type: 'string', enum: ['sandbox', 'development', 'production', 'demo'] }, apiToken: { type: 'string', maxLength: 500 }, apiKey: { type: 'string', maxLength: 500 }, testMode: { type: 'string', enum: ['true', 'false'] }, redirectUri: { type: 'string', maxLength: 300 }, companyUuid: { type: 'string', maxLength: 80 },
      shopDomain: { type: 'string', maxLength: 120 }, accessToken: { type: 'string', maxLength: 500 },
      keyId: { type: 'string', maxLength: 120 }, keySecret: { type: 'string', maxLength: 500 },
      orgId: { type: 'string', maxLength: 40 }, dc: { type: 'string', enum: ['in', 'com', 'eu', 'au'] },
      enabled: { type: 'boolean' },
    },
  },
  channel_connectors: { type: 'object', additionalProperties: false, properties: {} },
  us_connectors: { type: 'object', additionalProperties: false, properties: {} },
  plaid_link_sandbox: { type: 'object', additionalProperties: false, properties: { institutionId: { type: 'string', pattern: '^ins_[0-9]{1,12}$' } } },
  plaid_link_token: { type: 'object', additionalProperties: false, properties: { userId: { type: 'string', maxLength: 80 } } },
  plaid_exchange: { type: 'object', additionalProperties: false, required: ['publicToken'], properties: { publicToken: { type: 'string', maxLength: 200 } } },
  taxjar_rate: { type: 'object', additionalProperties: false, required: ['zip'], properties: { zip: { type: 'string', pattern: '^[0-9]{5}(-[0-9]{4})?$' }, city: { type: 'string', maxLength: 60 }, state: { type: 'string', pattern: '^[A-Za-z]{2}$' }, code: { type: 'string', maxLength: 40 }, name: { type: 'string', maxLength: 80 }, from: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, record: { type: 'boolean' } } },
  gusto_connect_url: { type: 'object', additionalProperties: false, properties: { redirectUri: { type: 'string', maxLength: 300 }, port: { type: 'integer', minimum: 1, maximum: 65535 } } },
  gusto_callback: { type: 'object', additionalProperties: false, required: ['code', 'state'], properties: { code: { type: 'string', maxLength: 500 }, state: { type: 'string', maxLength: 120 } } },
  track1099_csv: { type: 'object', additionalProperties: false, properties: { year: { type: 'string', pattern: '^[0-9]{4}$' } } },
  import_payroll_summary: { type: 'object', additionalProperties: false, properties: { csv: { type: 'string', maxLength: 2000000 }, documentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, provider: { type: 'string', enum: ['gusto'] }, settle: { type: 'boolean' }, fileName: { type: 'string', maxLength: 120 } } },
  list_payroll_imports: { type: 'object', additionalProperties: false, properties: {} },
  track1099_issuers: { type: 'object', additionalProperties: false, properties: {} },
  track1099_import: { type: 'object', additionalProperties: false, required: ['issuerId'], properties: { year: { type: 'string', pattern: '^[0-9]{4}$' }, issuerId: { type: 'string', maxLength: 80 }, caApprovalId: { type: 'string', maxLength: 80 } } },
  track1099_job: { type: 'object', additionalProperties: false, required: ['jobId'], properties: { jobId: { type: 'string', maxLength: 80 } } },
  fetch_channel_report: {
    type: 'object',
    additionalProperties: false,
    required: ['channel'],
    properties: {
      channel: { type: 'string', enum: ['amazon', 'shopify', 'razorpay', 'plaid', 'gusto'] },
      kind: { type: 'string', enum: ['settlement', 'orders', 'bank', 'payroll'] },
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
  profit_and_loss: {
    type: 'object',
    additionalProperties: false,
    properties: { from: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, to: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  balance_sheet: {
    type: 'object',
    additionalProperties: false,
    properties: { asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  cash_flow_statement: {
    type: 'object',
    additionalProperties: false,
    properties: { from: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, to: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  customer_statement: {
    type: 'object',
    additionalProperties: false,
    properties: {
      party: { type: 'string', maxLength: 120 },
      gstin: { type: 'string', maxLength: 15 },
      from: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      to: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    },
  },
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
  sign_us_return: {
    type: 'object',
    additionalProperties: false,
    required: ['taxYear', 'taxpayerPin', 'consent8879'],
    properties: {
      taxYear: { type: 'integer', minimum: 2020, maximum: 2100 },
      taxpayerPin: { type: 'string', pattern: '^[0-9]{5}$' },
      spousePin: { type: 'string', pattern: '^[0-9]{5}$' },
      priorYear: { type: 'object', additionalProperties: false, properties: { taxpayer: US_PRIOR_YEAR, spouse: US_PRIOR_YEAR } },
      priorYearAgi: { type: 'integer', minimum: 0 },
      priorYearPin: { type: 'string', pattern: '^[0-9]{5}$' },
      identityProtectionPin: { type: 'object', additionalProperties: false, properties: { taxpayer: US_IP_PIN, spouse: US_IP_PIN } },
      consent8879: { type: 'boolean' },
      refund: { type: 'object', additionalProperties: false, required: ['method'], properties: { method: { type: 'string', enum: ['direct_deposit', 'check'] }, routing: { type: 'string', pattern: '^[0-9]{9}$' }, account: { type: 'string', pattern: '^[A-Za-z0-9-]{1,17}$' }, accountType: { type: 'string', enum: ['checking', 'savings'] } } },
      payment: { type: 'object', additionalProperties: false, required: ['method'], properties: { method: { type: 'string', enum: ['direct_debit', 'later'] }, routing: { type: 'string', pattern: '^[0-9]{9}$' }, account: { type: 'string', pattern: '^[A-Za-z0-9-]{1,17}$' }, accountType: { type: 'string', enum: ['checking', 'savings'] }, date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, phone: { type: 'string', pattern: '^[0-9]{10}$' } } },
      device: { type: 'object', additionalProperties: false, properties: { ipAddress: { type: 'string', maxLength: 45 }, deviceId: { type: 'string', pattern: '^[0-9A-Fa-f]{40}$' }, deviceType: { type: 'string', maxLength: 30 }, at: { type: 'string', maxLength: 40 } } },
    },
  },
  file_us_return: { type: 'object', additionalProperties: false, required: ['taxYear'], properties: { taxYear: { type: 'integer', minimum: 2020, maximum: 2100 }, caApprovalId: { type: 'string', maxLength: 40 } } },
  us_efile_status: { type: 'object', additionalProperties: false, required: ['taxYear'], properties: { taxYear: { type: 'integer', minimum: 2020, maximum: 2100 } } },
  fetch_us_efile_acks: { type: 'object', additionalProperties: false, properties: {} },
  us_efile_setup: { type: 'object', additionalProperties: false, properties: {} },
  pinwheel_link_token: { type: 'object', additionalProperties: false, properties: { userId: { type: 'string', maxLength: 80 } } },
  payroll_tax_forms: { type: 'object', additionalProperties: false, required: ['taxYear'], properties: { taxYear: { type: 'integer', minimum: 2020, maximum: 2100 }, accountId: { type: 'string', pattern: '^[A-Za-z0-9-]{8,80}$' }, owner: { type: 'string', enum: ['taxpayer', 'spouse'] } } },
  import_payroll_tax_forms: { type: 'object', additionalProperties: false, required: ['taxYear', 'taxFormIds'], properties: { taxYear: { type: 'integer', minimum: 2020, maximum: 2100 }, taxFormIds: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,80}$' } }, accountId: { type: 'string', pattern: '^[A-Za-z0-9-]{8,80}$' }, owner: { type: 'string', enum: ['taxpayer', 'spouse'] } } },
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
  set_business_address: {
    type: 'object',
    additionalProperties: false,
    required: ['address', 'pin'],
    properties: {
      address: { type: 'string', minLength: 1, maxLength: 200 },
      city: { type: 'string', maxLength: 50 },
      pin: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
    },
  },
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
      partyName: { type: 'string' },
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
      partyName: { type: 'string' },
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
  ask_tax: {
    type: 'object',
    additionalProperties: false,
    required: ['question'],
    properties: { question: { type: 'string', minLength: 3, maxLength: 500 }, asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, module: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 } },
  },
  tax_modules: {
    type: 'object',
    additionalProperties: false,
    properties: { module: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 }, asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
  },
  tax_plan: {
    type: 'object',
    additionalProperties: false,
    properties: { fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, ageBand: { type: 'string', enum: ['below-60', '60-to-79', '80-plus'] }, salary: { type: 'number', minimum: 0, maximum: 1000000000000 }, businessIncome: { type: 'number', minimum: 0, maximum: 1000000000000 }, otherIncome: { type: 'number', minimum: 0, maximum: 1000000000000 }, section80C: { type: 'number', minimum: 0, maximum: 1000000000000 }, health80DSelf: { type: 'number', minimum: 0, maximum: 1000000000000 }, health80DParents: { type: 'number', minimum: 0, maximum: 1000000000000 }, selfSenior: { type: 'boolean' }, parentsSenior: { type: 'boolean' }, turnover: { type: 'number', minimum: 0, maximum: 1000000000000 }, digitalReceipts: { type: 'number', minimum: 0, maximum: 1000000000000 }, cashReceipts: { type: 'number', minimum: 0, maximum: 1000000000000 }, profession: { type: 'boolean' }, asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, actualProfit: { type: 'number', minimum: 0, maximum: 1000000000000 } },
  },
  review_income_tax: {
    type: 'object',
    additionalProperties: false,
    required: ['regime'],
    properties: { regime: { type: 'string', enum: ['old', 'new'] }, fy: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, ageBand: { type: 'string', enum: ['below-60', '60-to-79', '80-plus'] }, salary: { type: 'number', minimum: 0, maximum: 1000000000000 }, businessIncome: { type: 'number', minimum: 0, maximum: 1000000000000 }, otherIncome: { type: 'number', minimum: 0, maximum: 1000000000000 }, section80C: { type: 'number', minimum: 0, maximum: 1000000000000 }, health80DSelf: { type: 'number', minimum: 0, maximum: 1000000000000 }, health80DParents: { type: 'number', minimum: 0, maximum: 1000000000000 }, selfSenior: { type: 'boolean' }, parentsSenior: { type: 'boolean' }, turnover: { type: 'number', minimum: 0, maximum: 1000000000000 }, digitalReceipts: { type: 'number', minimum: 0, maximum: 1000000000000 }, cashReceipts: { type: 'number', minimum: 0, maximum: 1000000000000 }, profession: { type: 'boolean' }, asOf: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }, presumptive: { type: 'boolean' }, nonGstReceipts: { type: 'number', minimum: 0, maximum: 1000000000000 }, claimedStandardDeduction: { type: 'number', minimum: 0, maximum: 1000000000000 }, claimedDeductions: { type: 'number', minimum: 0, maximum: 1000000000000 }, claimedTotalIncome: { type: 'number', minimum: 0, maximum: 1000000000000 }, claimedRebate: { type: 'number', minimum: 0, maximum: 1000000000000 }, claimedTaxPayable: { type: 'number', minimum: 0, maximum: 1000000000000 }, claimedTds: { type: 'number', minimum: 0, maximum: 1000000000000 } },
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
      partyName: { type: 'string' },
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
  ims_review: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  ims_decide: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'decision'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      keys: { type: 'array', maxItems: 500, items: { type: 'string', maxLength: IMS_MAX_KEY } },
      select: { type: 'string', enum: ['matched', 'suggested', 'undecided', 'all'] },
      decision: { type: 'string', enum: ['accept', 'reject', 'pending', 'clear'] },
      note: { type: 'string', maxLength: 200 },
    },
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
  export_xlsx: {
    type: 'object',
    additionalProperties: false,
    properties: {
      report: { type: 'string', enum: REPORT_KEYS },
      period: { type: 'string', pattern: '^(?:[0-9]{4}-(0[1-9]|1[0-2])|this-month|last-month|this-quarter|this-year|last-year)$' },
      from: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      to: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      name: { type: 'string', maxLength: 60 },
      account: { type: 'string', maxLength: 24 },
      actor: { type: 'string', maxLength: 80 },
      limit: { type: 'integer', minimum: 1, maximum: 2000 },
    },
  },
  audit_trail: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period: { type: 'string', pattern: '^(?:[0-9]{4}-(0[1-9]|1[0-2])|this-month|last-month|this-quarter|this-year|last-year)$' },
      from: { type: 'string', minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      to: { type: 'string', minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      view: { type: 'string', enum: ['changes', 'all'] },
      actor: { type: 'string', maxLength: 80 },
      limit: { type: 'integer', minimum: 1, maximum: 2000 },
    },
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
  sandbox_keys: noArgs,
  sandbox_clear_keys: noArgs,
  sandbox_save_keys: { type: 'object', additionalProperties: false, required: ['apiKey', 'apiSecret'], properties: { environment: { type: 'string', enum: ['test', 'live'] }, apiKey: { type: 'string', minLength: 8, maxLength: 200 }, apiSecret: { type: 'string', minLength: 8, maxLength: 400 }, baseUrl: { type: 'string', maxLength: 120 } } },
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
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      gstin: REGISTRATION_ARG,
      quarter: { type: 'string', pattern: '^Q[1-4] [0-9]{4}-[0-9]{2}$' },
      form: { type: 'string', maxLength: 8 },
      tan: { type: 'string', maxLength: 10 },
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
      post: { type: 'string', enum: ['auto', 'hold'] },
      account: { type: 'string', maxLength: 60 },
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
  credit_at_risk: 'read_only',
  ims_review: 'read_only',
  ims_decide: 'writes_books',
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
  sandbox_save_keys: 'external_government_api',
  plaid_link_sandbox: 'external_government_api',
  plaid_link_token: 'external_government_api',
  pinwheel_link_token: 'external_government_api',
  payroll_tax_forms: 'external_government_api',
  import_payroll_tax_forms: 'writes_books',
  plaid_exchange: 'external_government_api',
  import_payroll_summary: 'writes_books',
  track1099_issuers: 'external_government_api',
  track1099_import: 'external_government_api',
  track1099_job: 'external_government_api',
  taxjar_rate: 'external_government_api',
  gusto_connect_url: 'external_government_api',
  gusto_callback: 'external_government_api',
  sandbox_clear_keys: 'external_government_api',
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
  set_business_address: 'writes_books',
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
  add_bill_tds: 'writes_books',
  record_tds_withheld: 'writes_books',
  tds_credit_check: 'read_only',
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
  save_gstr3b_portal: 'external_government_api',
  gstr3b_portal_liability: 'external_government_api',
  offset_gstr3b_portal: 'external_government_api',
  file_gstr3b_portal: 'external_government_api',
  file_us_return: 'external_government_api',
  fetch_us_efile_acks: 'external_government_api',
  sign_us_return: 'writes_books',
  generate_tds_fvu: 'external_government_api',
  portal_status: 'read_only',
  ask_knowledge: 'read_only',
  ask_tax: 'read_only',
  tax_modules: 'read_only',
  tax_plan: 'read_only',
  review_income_tax: 'read_only',
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
  add_recurring: 'writes_books',
  stop_recurring: 'writes_books',
  list_recurring: 'read_only',
  run_recurring: 'writes_books',
  bank_reconciliation: 'read_only',
  match_bank_line: 'writes_books',
  unmatch_bank_line: 'writes_books',
  book_bank_charges: 'writes_books',
  add_bank_rule: 'writes_books',
  remove_bank_rule: 'writes_books',
  list_bank_rules: 'read_only',
  run_bank_rules: 'writes_books',
  set_bank_account: 'writes_books',
  list_bank_accounts: 'read_only',
  record_transfer: 'writes_books',
  reply_ca: 'writes_books',
  close_ca: 'writes_books',
  govt_nic_auth: 'external_auth_probe',
  govt_generate_irn: 'external_government_api',
  sandbox_operation: 'external_government_api',
  approval_request: 'internal_workflow',
  exception_decide: 'internal_workflow',
  track_gst_returns: 'read_or_prepare',
  search_gstin: 'read_or_prepare',
  export_xlsx: 'read_only',
  audit_trail: 'read_only',
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

const SALES_KIND_WORDS = [
  { kind: 'proforma', words: /\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:pro\s*-?\s*forma(?:\s+invoice)?|pi)\b/i, label: 'proforma invoice', example: 'proforma ABC Ltd 50000 for consulting GST 18%' },
  { kind: 'order', words: /\b(?:make\s+(?:a|an)\s+|book\s+(?:a|an)\s+)?(?:sales\s+order|sale\s+order)\b/i, label: 'sales order', example: 'sales order ABC Ltd 50000 for chairs GST 18%' },
  { kind: 'challan', words: /\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:delivery\s+challan|challan)\b/i, label: 'delivery challan', example: 'delivery challan ABC Ltd 50000 for fabric GST 5% for job work' },
  { kind: 'quote', words: /\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:quotation|quote|estimate)\b/i, label: 'quote', example: 'quote ABC Ltd 50000 for consulting GST 18%' },
];

function otherEditionReply() {
  return { kind: 'reply', reply: 'That is for a different country edition, so nothing was changed.', tools: [] };
}

function repeatSaid(text) {
  const named = /\b(?:repeat(?:ing)?|recurring)\b/i.test(text);
  const found = text.match(/(?<!\s)\s*,?\s*\bevery\s+(week|month|quarter|six\s+months|half[\s-]?year|year)\b|(?<!\s)\s*,?\s*\b(weekly|monthly|quarterly|half[\s-]?yearly|yearly|annually)\b/i);
  if (!named && !found) return null;
  if (!named && !/\binvoice\b/i.test(text)) return null;
  const word = String(found ? found[1] || found[2] : 'month').toLowerCase().replace(/\s+/g, ' ');
  const every = /^week/.test(word) ? 'week' : /^quarter/.test(word) ? 'quarter' : /six|half/.test(word) ? 'half-year' : /^(?:year|annual)/.test(word) ? 'year' : 'month';
  return { every, words: found ? found[0] : /$^/ };
}

function salesDocumentKindSaid(text) {
  if (/\b(?:gst|tds|tax|cpin)\s+challan\b|\bchallan\s+(?:no|number|for\s+(?:gst|tds))\b/i.test(text)) return null;
  return SALES_KIND_WORDS.find((entry) => entry.words.test(text)) || null;
}

const EXCEL_SAID = /\b(?:excel|xlsx|spreadsheet)\b/i;
const EXCEL_THEN_WORD = /\b(?:excel|xlsx|spreadsheet)\s+([a-z0-9&.'-]+)/gi;
const EXCEL_VERBS = /\b(?:export|save|download|prepare|generate|make|send|give|get|want|need|put|print)\b/i;
const EXCEL_AFTER_PREPOSITION = /\b(?:to|as|in|into)\s+(?:an?\s+|the\s+)?(?:excel|xlsx|spreadsheet)\b/i;
const EXCEL_OF = /\b(?:excel|xlsx|spreadsheet)\s+(?:file\s+|sheet\s+|workbook\s+)?(?:of|with)\b/i;
const NOT_AN_EXPORT = /\b(?:import|upload|attach|bring\s+in|read)\b/i;
const POSTING_VERBS = /\b(?:sold|sell|selling|invoice|invoiced|billed|bought|buy|purchased|received|receipt|collected|paid|pay|spent|spend|expense)\b/i;
const SAVED_REPORT_TO_EXCEL = /\breport\s+(?:called\s+|named\s+)?["“]?([^"”]+?)["”]?\s+(?:to|as|in|into)\s+(?:an?\s+|the\s+)?(?:excel|xlsx|spreadsheet)\b/i;
const EXCEL_PERIOD_WORDS = /\b(this\s+month|last\s+month|this\s+quarter|this\s+year|last\s+year)\b/i;
const AUDIT_TRAIL_PHRASES = '\\baudit[\\s-]*(?:trail|log)s?\\b|\\b(?:edit|change)[\\s-]*logs?\\b|\\bwho\\s+changed\\b|\\bwhat\\s+changed\\s+in\\s+(?:(?:the|my|our|your)\\s+)?books\\b';
const EXCEL_REPORTS = [
  { key: 'audit_trail', words: new RegExp(AUDIT_TRAIL_PHRASES, 'i') },
  { key: 'trial_balance', words: /\btrial\s*balance\b/i },
  { key: 'tds_credit_check', words: /\b26\s*as\b|\btds\s+(?:credits?|receivables?)\b/i },
  { key: 'ims_review', words: /\bims\b|\binvoice\s+management\b/i },
  { key: 'bank_reconciliation', words: /\bbank\b|^(?![\s\S]*\b(?:gst\w*|2b|tds|26\s*as|itc)\b)[\s\S]*\breconcil/i },
  { key: 'day_book', words: /\bday\s*book\b|\bjournal\b|\bledger\b/i },
  { key: 'entries', words: /\bentries\b|\bvouchers?\b/i },
  { key: 'credit_notes', words: /\bcredit\s*notes?\b/i },
  { key: 'debit_notes', words: /\bdebit\s*notes?\b/i },
  { key: 'credit_at_risk', words: /\bcredit\s+at\s+risk\b|\bgstr-?2b\b|\b2b\b/i },
  { key: 'supplier_dues', words: /\b(?:supplier|vendor|creditor)s?\b.*\b(?:dues?|owe|owed|owing|outstanding|unpaid|bills?)\b|\bpayables?\b|\b(?:i|we)\s+owe\b/i },
  { key: 'customer_dues', words: /\bdues?\b|\bowed?\b|\bowes\b|\breceivables?\b|\bdebtors?\b|\boutstanding\b|\bunpaid\b|\boverdue\b/i },
  { key: 'saved_report', words: /\bsaved\s+report\b/i },
  { key: 'cash_forecast', words: /\bcash\s*forecast\b|\bforecast\b|\bcash\s*flow\b/i },
  { key: 'tds_summary', words: /\btds\b/i },
  { key: 'sku_margins', words: /\bmargins?\b/i },
  { key: 'stock_position', words: /\bstock\b|\binventory\b/i },
  { key: 'gst_period_summary', words: /\bgst\b|\bgstr/i },
  { key: 'business_summary', words: /\bbusiness\s+summary\b|\bat\s+a\s+glance\b|\bsummary\b/i },
  { key: 'sales', words: /\bsales?\b|\binvoices?\b|\bsold\b/i },
  { key: 'purchases', words: /\bpurchases?\b|\bbills?\b|\bbought\b/i },
  { key: 'expenses', words: /\bexpenses?\b|\bspending\b/i },
];

function nameKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function excelPartyNames(state) {
  const names = new Set();
  const add = (name) => {
    if (name && EXCEL_SAID.test(name)) names.add(nameKey(name));
  };
  for (const party of state.parties || []) add(party?.name);
  for (const inv of state.invoices || []) add(inv?.partyName);
  for (const bill of state.purchases || []) add(bill?.partyName);
  for (const expense of state.expenses || []) add(expense?.payee);
  return [...names].filter(Boolean);
}

function namesAnExcelParty(text, partyNames) {
  const haystack = ` ${nameKey(text)} `;
  if (partyNames.some((name) => haystack.includes(` ${name} `))) return true;
  const partyWords = new Set(partyNames.flatMap((name) => name.split(' ')).filter((word) => word.length >= 3 && !EXCEL_SAID.test(word)));
  for (const found of text.matchAll(EXCEL_THEN_WORD)) if (partyWords.has(nameKey(found[1]))) return true;
  return false;
}

function excelPlanWaits(text) {
  if (EXCEL_VERBS.test(text)) return false;
  return POSTING_VERBS.test(text.slice(0, text.search(EXCEL_SAID)));
}

const CHAT_MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const FINANCIAL_YEAR_UNREAD = 'I could not read that financial year. Say it like "FY 2025-26", which runs from 1 April 2025 to 31 March 2026.';
const FINANCIAL_YEAR_LABELLED = /\b(?:fy\.?|f\.\s?y\.?|financial\s+year)\s*[:#-]?\s*(\d{2,4})(?:\s*[-/]\s*(\d{2,4}))?(?![\d/-])/gi;
const FINANCIAL_YEAR_ASSESSED = /\b(?:ay|a\.\s?y\.?|assessment\s+year)\s*[:#-]?\s*(\d{2,4})(?:\s*[-/]\s*(\d{2,4}))?(?![\d/-])/gi;
const FINANCIAL_YEAR_RELATIVE = /\b(last|previous|prior|preceding|this|current)\s+(?:financial\s+year|fy|f\.\s?y\.?)(?![\w-])/gi;
const FINANCIAL_YEAR_BARE = /(?<![\w/.-])(20\d{2})\s*-\s*(\d{2}|20\d{2})(?![\w/-])/g;

function financialYearStart(iso) {
  const [year, month] = iso.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

function financialYearStartOf(startText, endText) {
  const start = startText.length === 2 ? 2000 + Number(startText) : startText.length === 4 ? Number(startText) : 0;
  if (!endText || start < 2000 || start > 2099) return null;
  const consistent = endText.length === 2 ? Number(endText) === (start + 1) % 100 : endText.length === 4 && Number(endText) === start + 1;
  return consistent ? start : null;
}

function financialYearRange(start, text) {
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, text };
}

function financialYearSaid(text, today = localToday()) {
  const spaced = text.replace(/\s+/g, ' ');
  const current = financialYearStart(today);
  const found = [];
  const take = (pattern, read) => {
    for (const hit of spaced.matchAll(pattern)) {
      const at = hit.index;
      const end = at + hit[0].length;
      if (found.some((other) => at < other.end && end > other.at)) continue;
      const reading = read(hit);
      if (reading) found.push({ at, end, ...reading });
    }
  };
  take(FINANCIAL_YEAR_ASSESSED, (hit) => {
    const start = financialYearStartOf(hit[1], hit[2]);
    return start == null ? { unreadable: true } : financialYearRange(start - 1, hit[0]);
  });
  take(FINANCIAL_YEAR_LABELLED, (hit) => {
    const start = financialYearStartOf(hit[1], hit[2]);
    return start == null ? { unreadable: true } : financialYearRange(start, hit[0]);
  });
  take(FINANCIAL_YEAR_BARE, (hit) => {
    if (isReturnPeriod(`${hit[1]}-${hit[2]}`)) return null;
    const start = financialYearStartOf(hit[1], hit[2]);
    return start == null ? { unreadable: true } : financialYearRange(start, hit[0]);
  });
  take(FINANCIAL_YEAR_RELATIVE, (hit) => financialYearRange(/^(?:this|current)$/i.test(hit[1]) ? current : current - 1, hit[0]));
  if (found.length === 0) return null;
  if (found.length > 1 || found[0].unreadable) return { unreadable: true };
  return { from: found[0].from, to: found[0].to, text: found[0].text };
}

function planExcelFromChat(state, text) {
  if (!EXCEL_SAID.test(text) || isNegated(text) || NOT_AN_EXPORT.test(text)) return null;
  if (namesAnExcelParty(text, excelPartyNames(state))) return null;
  if (!EXCEL_VERBS.test(text) && !EXCEL_AFTER_PREPOSITION.test(text) && !EXCEL_OF.test(text)) return null;
  const saved = SAVED_REPORT_TO_EXCEL.exec(text);
  if (saved) return { kind: 'tool', name: 'export_xlsx', args: { report: 'saved_report', name: saved[1].trim() } };
  const imsParty = namesAnImsParty(state, text);
  const found = EXCEL_REPORTS.find((entry) => !(imsParty && entry.key === 'ims_review') && entry.words.test(text));
  const report = found ? found.key : 'trial_balance';
  if (report === 'audit_trail') {
    const range = auditRangeSaid(text);
    if (!range) return { kind: 'reply', reply: AUDIT_RANGE_UNREAD, tools: [] };
    const narrowed = auditExportNarrowing(text);
    return { kind: 'tool', name: 'export_xlsx', args: { report, ...range, ...narrowed.args }, ...(narrowed.note ? { note: narrowed.note } : {}) };
  }
  const named = EXCEL_PERIOD_WORDS.exec(text);
  const period = named ? named[1].toLowerCase().replace(/\s+/g, '-') : saidPeriod(text);
  if (report === 'ims_review' && countryOf(state) === 'IN') return planImsSheetFromChat(state, text, period);
  const from = /\b(?:from|since|starting)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
  const to = /\b(?:to|till|until|up\s+to)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
  if (from || to) return { kind: 'tool', name: 'export_xlsx', args: { report, ...(from ? { from: from[1] } : {}), ...(to ? { to: to[1] } : {}) } };
  if (report === 'tds_credit_check') {
    const year = financialYearSaid(text);
    if (year && year.unreadable) return { kind: 'reply', reply: FINANCIAL_YEAR_UNREAD, tools: [] };
    if (year) return { kind: 'tool', name: 'export_xlsx', args: { report, from: year.from, to: year.to } };
  }
  return { kind: 'tool', name: 'export_xlsx', args: { report, ...(period ? { period } : {}) } };
}

function planImsSheetFromChat(state, text, period) {
  const asMonth = !period || isReturnPeriod(period) || period === 'this-month' || period === 'last-month';
  if (!asMonth) return { kind: 'tool', name: 'export_xlsx', args: { report: 'ims_review', period } };
  const reading = imsPeriodReading(text);
  if (reading.unread) return imsMonthUnread(state, 'ims review in excel for');
  const month = reading.period || latestTwobMonth(state) || localToday().slice(0, 7);
  if (!hasTwobFor(state, month)) return { kind: 'reply', reply: inWords(`Add the GSTR-2B for ${month} first.`), tools: [] };
  return { kind: 'tool', name: 'export_xlsx', args: { report: 'ims_review', period: month } };
}

const AUDIT_TRAIL_ASKED = new RegExp(AUDIT_TRAIL_PHRASES, 'i');
const AUDIT_TRAIL_EVERYTHING = /\b(?:everything|all events|including reads)\b/i;
const AUDIT_TRAIL_EVERY = new RegExp(AUDIT_TRAIL_PHRASES, 'gi');

const AUDIT_RANGE_UNREAD = 'I could not read that date range, so I have not looked anything up. Say it like "audit trail from 2026-10-01 to 2026-10-31", "audit trail for October" or "audit trail for FY 2025-26".';
const AUDIT_NUMERIC_DAY = /(?<![\w./-])(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?![\w/-])/g;
const AUDIT_WORDED_DAY = new RegExp(`(?<![\\w.,-])(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${CHAT_MONTH_WORDS})\\.?,?\\s+(\\d{4})|(${CHAT_MONTH_WORDS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}))(?![\\w-])`, 'gi');
const AUDIT_YEARLESS_DAY = new RegExp(`(?<![\\w.,-])\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${CHAT_MONTH_WORDS})\\b(?!\\.?,?\\s*\\d{4})|\\b(?:${CHAT_MONTH_WORDS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d{4})`, 'i');
const AUDIT_THIS_WEEK = /\bthis\s+week\b/i;
const AUDIT_LAST_WEEK = /\b(?:last|previous|prior|preceding)\s+week\b/i;
const AUDIT_LAST_QUARTER = /\b(?:last|previous|prior|preceding)\s+quarter\b/i;
const AUDIT_LAST_DAYS = /\b(?:last|past|previous)\s+(\d{1,4})\s+days?\b/i;
const AUDIT_RELATIVE_PERIOD = /\b(current|previous|prior|preceding)\s+(month|quarter|year)\b/i;
const AUDIT_MODAL_MAY = /\b(?:i|we|you|he|she|they|it)\s+may\b|\bmay\s+(?:i|we|you|he|she|they|it|there|someone|anyone|see|have|get|show|check|look|be|not|need|want|know|ask)\b/gi;
const AUDIT_ISO_MONTH = /\b20\d{2}-(?:0[1-9]|1[0-2])\b(?!-\d)/;
const AUDIT_NAMED_MONTH = new RegExp(`\\b(?:${CHAT_MONTH_WORDS})\\b(?:\\s+20\\d{2})?`, 'i');
const CHAT_MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CHAT_MONTH_NAMED = new RegExp(`\\b(${CHAT_MONTH_WORDS})\\b(?:\\s+(20\\d{2}))?`, 'i');
const AUDIT_RANGE_WORDS = /\b(?:last|past|previous|next)\s+(?:week|quarter|\d+\s+(?:days?|weeks?|months?|years?))\b|\bnext\s+month\b|\b\d+\s+(?:days?|weeks?|months?)\s+ago\b|\b(?:fy\.?|f\.\s?y\.?|financial\s+year)\s*\d|\bq[1-4]\b|\b(?:first|second|third|fourth)\s+quarter\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|(?<![\w/.-])(?:20\d{2}|\d{4}\s*-\s*\d{2,4})(?![\w/-])/i;
const AUDIT_UNREADABLE = new RegExp([
  '(?<![\\w/.-])\\d{1,2}(?:st|nd|rd|th)(?!\\w)',
  '\\bweeks?\\s+(?:of|ending|ended|starting|commencing|beginning|from|to|ago|before|after)\\b',
  '\\b(?:last|past|previous|prior|preceding|next|coming|following)\\s+(?:the\\s+)?(?:\\w+\\s+){0,2}?(?:hours?|days?|weeks?|fortnights?|months?|quarters?|years?)\\b',
  '\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty|ninety|few|couple(?:\\s+of)?|several)\\s+(?:hours?|days?|weeks?|fortnights?|months?|quarters?|years?)\\b',
  '\\b(?:between|from|to|till|until|through)\\s+\\d{1,2}(?![\\w.:/-])',
  '\\b(?:ytd|mtd|qtd)\\b',
  '\\b(?:year|month|quarter)\\s*-?\\s*to\\s*-?\\s*date\\b',
  '\\bh[12]\\b',
  '\\b(?:first|second)\\s+half\\b',
  '\\bhalf[\\s-]?year(?:ly)?\\b',
  '\\bfortnight(?:ly)?\\b',
  '\\bsemester\\b',
  '\\b(?:tomorrow|tonight|midnight|overnight)\\b',
  '\\bago\\b',
  '\\b(?:before|after)\\s+(?:last|next)\\b',
  '\\bthis\\s+(?:morning|afternoon|evening)\\b',
  '(?<![\\w/.-])\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2}(?![\\w/-])',
  '(?<![\\w/.-])\\d{1,2}[-/.]\\d{4}(?![\\w/-])',
  '(?<![\\w/.-])\\d{1,2}/\\d{1,2}(?![\\w/.-])',
].join('|'), 'i');
const AUDIT_YEAR_LABEL = /\b(?:(?:financial|fiscal|assessment|calendar)\s+year|fy|f\.\s?y\.?|ay|a\.\s?y\.?)(?![\w-])/i;
const AUDIT_NEGATED = /\b(?:not|never|except|excluding|exclude|without|besides|other\s+than|apart\s+from|instead\s+of)\b|n['’]t\b/i;
const AUDIT_DIRECTED_PERIOD = new RegExp(`\\b(?:since|from|until|till|before|after|through|upto|up\\s+to|starting|beginning|ending|between|onwards?)\\s+(?:the\\s+)?(?:(?:last|this|past|previous|next)\\s+(?:month|quarter|year|week)|(?:${CHAT_MONTH_WORDS})\\b|20\\d{2}-(?:0[1-9]|1[0-2])\\b)`, 'i');
const AUDIT_MONTH_WORD = new RegExp(`\\b(?:${CHAT_MONTH_WORDS})\\b`, 'gi');
const AUDIT_OPENING_WORDS = new Set(['please', 'pls', 'kindly', 'can', 'could', 'would', 'will', 'you', 'i', 'we', 'let', 'lets', 'us', 'me', 'my', 'our', 'the', 'a', 'an', 'show', 'give', 'get', 'open', 'view', 'see', 'list', 'display', 'pull', 'up', 'need', 'want', 'like', 'to', 'also', 'and', 'then', 'now', 'ok', 'okay', 'hey', 'hi', 'hello', 'just', 'tell', 'check', 'look', 'at', 'd', 'll']);

function shiftIsoDay(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mondayOfWeek(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return shiftIsoDay(iso, -((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7));
}

function quarterBefore(iso) {
  const [year, month] = iso.split('-').map(Number);
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  const from = start > 3 ? `${year}-${String(start - 3).padStart(2, '0')}-01` : `${year - 1}-10-01`;
  return { from, to: shiftIsoDay(`${year}-${String(start).padStart(2, '0')}-01`, -1) };
}

function chatMonthKey(word, year, today) {
  const [thisYear, thisMonth] = today.split('-').map(Number);
  const number = CHAT_MONTH_PREFIXES.indexOf(word.slice(0, 3).toLowerCase()) + 1;
  return `${year ? Number(year) : number <= thisMonth ? thisYear : thisYear - 1}-${String(number).padStart(2, '0')}`;
}

function chatMonthSaid(text, today = localToday()) {
  const iso = AUDIT_ISO_MONTH.exec(text);
  if (iso) return iso[0];
  const named = CHAT_MONTH_NAMED.exec(text);
  return named ? chatMonthKey(named[1], named[2], today) : '';
}

function auditDaysSaid(text, today) {
  const days = [];
  for (const hit of text.matchAll(AUDIT_NUMERIC_DAY)) days.push({ at: hit.index, end: hit.index + hit[0].length, iso: isoDate(hit[0]) });
  for (const hit of text.matchAll(AUDIT_WORDED_DAY)) {
    const [day, month, year] = hit[1] ? [hit[1], hit[2], hit[3]] : [hit[5], hit[4], hit[6]];
    const number = MONTH_NAMES.findIndex((name) => name.startsWith(month.slice(0, 3).toLowerCase())) + 1;
    days.push({ at: hit.index, end: hit.index + hit[0].length, iso: isoDate(`${year}-${number}-${day}`) });
  }
  for (const hit of text.matchAll(/\b(today|yesterday)\b/gi)) days.push({ at: hit.index, end: hit.index + hit[0].length, iso: hit[1].toLowerCase() === 'today' ? today : shiftIsoDay(today, -1) });
  return days.sort((a, b) => a.at - b.at);
}

function auditDaysRange(text, days) {
  const [first, second] = days;
  if (second) return first.iso <= second.iso ? { from: first.iso, to: second.iso } : null;
  const before = text.slice(0, first.at);
  if (/\b(?:since|from|starting(?:\s+(?:from|on))?|beginning(?:\s+(?:from|on))?|on\s+or\s+after)\s*$/i.test(before)) return { from: first.iso };
  if (/\bafter\s*$/i.test(before)) return { from: shiftIsoDay(first.iso, 1) };
  if (/\b(?:until|till|upto|up\s+to|through|to|ending(?:\s+on)?|on\s+or\s+before)\s*$/i.test(before)) return { to: first.iso };
  if (/\bbefore\s*$/i.test(before)) return { to: shiftIsoDay(first.iso, -1) };
  return { from: first.iso, to: first.iso };
}

function auditRangeSaid(text) {
  const today = localToday();
  const spaced = text.replace(/\s+/g, ' ').replace(AUDIT_MODAL_MAY, ' ');
  const days = auditDaysSaid(spaced, today);
  if (days.length > 2 || days.some((day) => !day.iso)) return null;
  let left = days.reduceRight((rest, day) => `${rest.slice(0, day.at)} ${rest.slice(day.end)}`, spaced);
  const readings = [];
  if (days.length) {
    const range = auditDaysRange(spaced, days);
    if (!range) return null;
    readings.push(range);
  }
  if (AUDIT_DIRECTED_PERIOD.test(left)) return null;
  const week = AUDIT_THIS_WEEK.exec(left);
  if (week) {
    readings.push({ from: mondayOfWeek(today), to: today });
    left = left.replace(week[0], ' ');
  }
  const lastWeek = AUDIT_LAST_WEEK.exec(left);
  if (lastWeek) {
    const monday = mondayOfWeek(today);
    readings.push({ from: shiftIsoDay(monday, -7), to: shiftIsoDay(monday, -1) });
    left = left.replace(lastWeek[0], ' ');
  }
  const lastQuarter = AUDIT_LAST_QUARTER.exec(left);
  if (lastQuarter) {
    readings.push(quarterBefore(today));
    left = left.replace(lastQuarter[0], ' ');
  }
  const lastDays = AUDIT_LAST_DAYS.exec(left);
  if (lastDays) {
    if (Number(lastDays[1]) < 1) return null;
    readings.push({ from: shiftIsoDay(today, -Number(lastDays[1])), to: today });
    left = left.replace(lastDays[0], ' ');
  }
  const year = financialYearSaid(left, today);
  if (year) {
    if (year.unreadable) return null;
    readings.push({ from: year.from, to: year.to });
    left = left.replace(year.text, ' ');
  }
  const yearless = AUDIT_YEARLESS_DAY.test(left);
  const monthWords = new Set([...left.matchAll(AUDIT_MONTH_WORD)].map((hit) => hit[0].slice(0, 3).toLowerCase()));
  const named = EXCEL_PERIOD_WORDS.exec(left);
  const relative = named ? null : AUDIT_RELATIVE_PERIOD.exec(left);
  let period = '';
  if (named || relative) {
    period = named ? named[1].toLowerCase().replace(/\s+/g, '-') : `${/^current$/i.test(relative[1]) ? 'this' : 'last'}-${relative[2].toLowerCase()}`;
    left = left.replace((named || relative)[0], ' ');
  } else {
    period = chatMonthSaid(left, today);
    const phrase = period ? AUDIT_ISO_MONTH.exec(left) || AUDIT_NAMED_MONTH.exec(left) : null;
    if (phrase) left = left.replace(phrase[0], ' ');
  }
  if (period === 'last-quarter' || EXCEL_PERIOD_WORDS.test(left) || AUDIT_RELATIVE_PERIOD.test(left) || (!year && AUDIT_YEAR_LABEL.test(left))) return null;
  if (period) readings.push({ period });
  if (readings.length > 1 || monthWords.size > 1 || yearless || left.search(AUDIT_MONTH_WORD) >= 0) return null;
  if (AUDIT_UNREADABLE.test(left) || AUDIT_RANGE_WORDS.test(left)) return null;
  if (readings.length && AUDIT_NEGATED.test(left)) return null;
  return readings[0] || {};
}

function auditAskedFirst(text) {
  const first = text.search(AUDIT_TRAIL_ASKED);
  return first >= 0 && nameKey(text.slice(0, first)).split(' ').filter(Boolean).every((word) => AUDIT_OPENING_WORDS.has(word));
}

function auditKnownNames(state) {
  const known = new Map();
  for (const name of [
    ...(state.parties || []).map((party) => party?.name),
    ...(state.vendors || []).map((vendor) => vendor?.name),
    ...(state.invoices || []).map((invoice) => invoice?.partyName),
    ...(state.purchases || []).map((bill) => bill?.partyName),
    ...(state.expenses || []).map((expense) => expense?.payee),
  ]) {
    const key = nameKey(name);
    if (key && !known.has(key)) known.set(key, String(name).trim());
  }
  return known;
}

function auditWithoutName(padded, key) {
  const needle = ` ${key} `;
  let left = padded;
  while (left.includes(needle)) left = left.split(needle).join(' ');
  return left;
}

function auditWordsAreNames(state, text, known) {
  const left = [...known.keys()].filter((name) => AUDIT_TRAIL_ASKED.test(name)).reduce(auditWithoutName, ` ${nameKey(text)} `);
  const phrases = [...left.matchAll(AUDIT_TRAIL_EVERY)].map((hit) => nameKey(hit[0]));
  if (!phrases.length) return true;
  const kind = salesDocumentKindSaid(text);
  const doc = /\b(?:debit|credit)\s+note\b/i.test(text) ? null : parseDocument(takeInvoiceTerms(kind ? text.replace(kind.words, 'invoice') : text).text);
  const posted = [planExpenseFromChat(state, text), planPaymentFromChat(state, text), planReceiptWithoutInvoice(state, text)]
    .filter(Boolean)
    .map((plan) => (plan.kind === 'tool' ? JSON.stringify(plan.args) : plan.reply));
  if (doc && !doc.problem) posted.push(doc.partyName);
  if (phrases.every((phrase) => posted.some((value) => ` ${nameKey(value)} `.includes(` ${phrase} `)))) return true;
  return posted.length > 0 && !isQuestion(text) && !auditAskedFirst(text);
}

const REMINDER_WORDS = /\b(?:remind(?:er|ers|s)?|yaad\s+dila(?:na|o|iye)?)\b/i;
const AUDIT_MAKING_WORDS = '(?:record(?:ed)?|add|enter|book|make|made|create|created|raise|issue|generate|prepare|post)\\s+(?:an?\\s+|the\\s+|new\\s+)?';
const AUDIT_RECEIPT_MADE = new RegExp(`\\b(?:paid|received|${AUDIT_MAKING_WORDS}receipt)\\b`, 'i');
const AUDIT_NOTE_MADE = new RegExp(`\\b${AUDIT_MAKING_WORDS}(?:credit|debit)\\s+note\\b`, 'i');
const AUDIT_INVOICE_ID = /\bINV-\d+\b/i;
const AUDIT_DOCUMENT_ID = /\b(?:INV|BILL)-\d+\b/i;
const AUDIT_NOTE_WORDS = /\b(?:credit|debit)\s+notes?\b/i;
const AUDIT_ACTOR_STOP = new Set(['the', 'a', 'an', 'this', 'last', 'past', 'previous', 'prior', 'for', 'from', 'since', 'until', 'till', 'in', 'on', 'at', 'to', 'today', 'yesterday', 'tomorrow', 'limit', 'everything', 'including', 'all', 'and', 'or', 'as', 'between', 'during', 'over', 'after', 'before', 'each', 'per', 'with', 'please', 'pls', 'thanks', 'now', 'only', 'just', 'also', 'then', 'week', 'month', 'quarter', 'year', 'fy', 'date', 'day', 'time', 'user', 'users', 'person', 'people', 'actor', 'actors', 'name', 'action', 'type', 'kind', 'excel', 'xlsx', 'spreadsheet', 'invoice', 'invoices', 'bill', 'bills', 'party', 'parties', 'customer', 'customers', 'supplier', 'suppliers', 'client', 'clients', 'tool', 'tools', 'account', 'accounts', 'entry', 'entries', 'change', 'changes', 'event', 'events', 'role', 'roles', 'hand', 'ims', 'gst', 'tds', 'newest', 'oldest', 'latest', 'earliest', 'recent', 'recently', 'first', 'category', 'categories', 'hour', 'hours', 'minute', 'minutes', 'who', 'whom', 'whose', 'which', 'what', 'order', 'sorted', 'sort', 'size', 'amount', 'value', 'number', 'id', 'status', 'source', 'group', 'section', 'module', 'reason', 'field', 'ledger', 'record', 'records', 'result', 'results', 'chat', 'app', 'phone', 'email', 'voice', 'default', 'mistake', 'accident', 'most', 'least', 'top', 'bottom', 'highest', 'lowest', 'biggest', 'smallest', 'largest', 'reverse', 'ascending', 'descending', 'asc', 'desc', 'alphabetical', 'alphabetically', 'chronological', 'chronologically', 'timestamp', 'timestamps', 'days', 'weeks', 'months', 'years', 'when', 'where', 'how', 'why', 'weekday', 'priority', 'severity', 'risk', 'importance', 'relevance', 'any', 'that', 'whatever', 'whichever']);
const AUDIT_ACTOR_LABEL = /^(?:(?:the|a)\s+)?(?:user|actor|person|staff|member|employee|accountant|partner)\s+(?:(?:called|named)\s+)?(?=[a-z])/i;
const AUDIT_ACTOR_ANYONE = new Set(['everyone', 'everybody', 'anyone', 'anybody']);
const AUDIT_ACTOR_UNKNOWN = new Set(['me', 'myself', 'i', 'my', 'us', 'we', 'you', 'someone', 'somebody', 'our', 'your', 'his', 'her', 'their', 'him', 'them', 'he', 'she', 'they', 'it', 'its']);
const AUDIT_ACTOR_UNREAD = 'I cannot tell who you mean, so I have not looked anything up. Say whose changes to show by name, for example "audit trail by Priya".';
const AUDIT_LIMIT_UNREAD = 'I show between 1 and 2000 changes at a time, so I have not looked anything up. Say it like "audit trail limit 50".';
const AUDIT_LIMIT_LIST = '(?:changes?|events?|entries|edits?|actions?|records?|items?|rows?|lines?)';
const AUDIT_LIMIT_FORMS = [
  /\blimit(?:ed)?(?:\s+(?:to|of))?\s*[:=]?\s*(\d+)(?!\d)/i,
  new RegExp(`\\b(?:last|latest|recent|most\\s+recent|top)\\s+(\\d+)(?!\\d)\\s+${AUDIT_LIMIT_LIST}\\b`, 'i'),
  new RegExp(`\\b(\\d+)(?!\\d)\\s+(?:latest|recent|most\\s+recent)\\s+${AUDIT_LIMIT_LIST}\\b`, 'i'),
  /\b(?:last|latest|recent|most\s+recent|top)\s+(\d+)(?!\d)(?!\s*(?:-\s*)?(?:hours?|hrs?|days?|weeks?|fortnights?|months?|quarters?|years?|st|nd|rd|th)\b)/i,
];
const AUDIT_MONTH_ONLY = new RegExp(`^(?:${CHAT_MONTH_WORDS})$`, 'i');
const AUDIT_NARROWING_IDS = /\b(?:INV|BILL|CN|DN|PDN)-\d+\b/gi;
const AUDIT_REQUEST_WORDS = new Set([...AUDIT_ACTOR_STOP, ...AUDIT_OPENING_WORDS, 'audit', 'trail', 'trails', 'log', 'logs', 'edit', 'changed', 'books', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', ...CHAT_MONTH_PREFIXES, 'sept']);

function auditActorSaid(text) {
  const by = /\bby\s+(?=[a-z])/i.exec(text);
  if (!by) return { rest: text };
  const label = AUDIT_ACTOR_LABEL.exec(text.slice(by.index + by[0].length));
  const from = by.index + by[0].length + (label ? label[0].length : 0);
  const taken = [];
  let end = from;
  for (const hit of text.slice(from).matchAll(/\S+/g)) {
    const bare = hit[0].replace(/[,;:!?)]+$/, '');
    if (!bare || /\d/.test(bare) || AUDIT_ACTOR_STOP.has(bare.replace(/\.$/, '').toLowerCase()) || taken.length === 3) break;
    taken.push(bare);
    end = from + hit.index + bare.length;
    if (bare !== hit[0]) break;
  }
  if (!taken.length) return { rest: text };
  const first = taken[0].replace(/\.$/, '').toLowerCase();
  if (AUDIT_MONTH_ONLY.test(first) || /^[a-z]{3,}ing$/.test(first)) return { rest: text };
  const rest = `${text.slice(0, by.index)} ${text.slice(end)}`.replace(/\s+/g, ' ');
  if (AUDIT_ACTOR_ANYONE.has(first)) return { rest };
  if (AUDIT_ACTOR_UNKNOWN.has(first)) return { unreadable: true, rest };
  return { name: taken.join(' ').replace(/\.+$/, '').slice(0, 80), rest };
}

function auditLimitSaid(text) {
  for (const form of AUDIT_LIMIT_FORMS) {
    const hit = form.exec(text);
    if (!hit) continue;
    const count = Number(hit[1]);
    const rest = text.replace(hit[0], ' ').replace(/\s+/g, ' ');
    return count >= 1 && count <= 2000 ? { count, rest } : { unreadable: true, rest };
  }
  return { rest: text };
}

function auditExportNarrowing(text) {
  const actor = auditActorSaid(text);
  const limit = auditLimitSaid(actor.rest);
  const args = { ...(actor.name ? { actor: actor.name } : {}), ...(limit.count ? { limit: limit.count } : {}) };
  const unread = [];
  if (actor.unreadable) unread.push('the person you named');
  if (limit.unreadable) unread.push('the count you gave');
  if (!unread.length) return { args };
  return { args, note: `I could not read ${unread.join(' or ')}, so the Excel file is not narrowed by ${unread.length > 1 ? 'them' : 'it'}.` };
}

function auditNarrowing(known, text) {
  const ids = [...new Set((text.match(AUDIT_NARROWING_IDS) || []).map((id) => id.toUpperCase()))];
  let rest = ` ${nameKey(text.replace(AUDIT_NARROWING_IDS, ' '))} `;
  const parties = [];
  for (const [key, display] of [...known].sort((a, b) => b[0].length - a[0].length)) {
    if (!rest.includes(` ${key} `) || key.split(' ').every((word) => AUDIT_REQUEST_WORDS.has(word))) continue;
    parties.push(display);
    rest = auditWithoutName(rest, key);
  }
  return [...ids, ...parties];
}

function auditNarrowingNote(names, narrowed) {
  const list = names.length > 5 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${narrowed ? '' : 'This lists every change in the period. '}It is not narrowed to ${list}, because I cannot narrow the audit trail to one document or party yet.`;
}

function auditPhraseFollowsPosting(text) {
  const before = text.slice(0, text.search(AUDIT_TRAIL_ASKED));
  if (REMINDER_WORDS.test(before)) return true;
  if (isQuestion(text) || auditAskedFirst(text)) return false;
  if (AUDIT_RECEIPT_MADE.test(before) && AUDIT_INVOICE_ID.test(before)) return true;
  if (AUDIT_NOTE_MADE.test(before) && AUDIT_DOCUMENT_ID.test(before)) return true;
  if (amountsSaid(before.replace(AUDIT_LAST_DAYS, ' ')).length > 0) return true;
  return AUDIT_NOTE_WORDS.test(before) && AUDIT_DOCUMENT_ID.test(text) && amountsSaid(text.replace(AUDIT_LAST_DAYS, ' ')).length > 0;
}

function planAuditTrailFromChat(state, text) {
  const spaced = text.replace(/\s+/g, ' ');
  if (!AUDIT_TRAIL_ASKED.test(spaced) || isNegated(spaced)) return null;
  const actor = auditActorSaid(spaced);
  const limit = auditLimitSaid(actor.rest);
  const known = auditKnownNames(state);
  if (auditWordsAreNames(state, limit.rest, known) || auditPhraseFollowsPosting(limit.rest)) return null;
  if (actor.unreadable) return { kind: 'reply', reply: AUDIT_ACTOR_UNREAD, tools: [] };
  if (limit.unreadable) return { kind: 'reply', reply: AUDIT_LIMIT_UNREAD, tools: [] };
  const range = auditRangeSaid(limit.rest);
  if (!range) return { kind: 'reply', reply: AUDIT_RANGE_UNREAD, tools: [] };
  const narrowing = auditNarrowing(known, limit.rest);
  return {
    kind: 'tool',
    name: 'audit_trail',
    args: { ...range, ...(actor.name ? { actor: actor.name } : {}), ...(limit.count ? { limit: limit.count } : {}), ...(AUDIT_TRAIL_EVERYTHING.test(spaced) ? { view: 'all' } : {}) },
    ...(narrowing.length ? { note: auditNarrowingNote(narrowing, Boolean(actor.name || limit.count)) } : {}),
  };
}

const IMS_SAID = /\bims\b|\binvoice\s+management\b/i;
const IMS_DECISION_SAID = /\b(accept|reject|pending)(?:ed)?\b/gi;
const IMS_SELECT_SAID = /\b(?:(?:all|every)\s+(?:the\s+)?(matched|suggested|undecided|not\s+decided)|(matched))\b/i;
const IMS_UNMATCHED_SAID = /\b(?:not|non|no|[a-z]+n['\u2019]t|isnt|arent|wasnt|werent|didnt|doesnt)\b[\s-]*(?:[a-z]+\s+){0,2}match|\bunmatched\b|\bmismatch/i;
const IMS_PERIOD_FIGURES = new RegExp([
  '\\b(?:gstr-?)?2b\\b',
  '\\b20\\d{2}(?:-\\d{1,2}(?:-\\d{1,2})?)?\\b',
  '\\b(?:fy\\.?|f\\.\\s?y\\.?|financial\\s+year)\\s*[-:\'\\u2019]?\\s*(?:20)?\\d{2}(?:\\s*[-/]\\s*(?:20)?\\d{2})?\\b',
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${CHAT_MONTH_WORDS})\\b`,
  `\\b(?:${CHAT_MONTH_WORDS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,
  '\\b[qh][1-4]\\b',
  '\\b\\d{1,2}\\s+(?:months?|quarters?|years?)\\b',
].join('|'), 'gi');
const IMS_PERIOD_UNREAD = new RegExp([
  '\\b(?:fy|f\\.\\s?y)(?![a-z])',
  '\\b(?:years?|quarters?|months|weeks?|fortnights?|ago)\\b',
  '\\b[qh][1-4]\\b',
  '\\b(?:first|second)\\s+half\\b',
  '\\bbefore\\s+last\\b',
  '\\b(?:every|each|all|any)\\s+(?:the\\s+)?(?:month|periods?)\\b',
  '\\b(?:next|coming|following)\\s+month\\b',
  '\\bpast\\s+month\\b',
  '\\bmonth\\s+(?:back|earlier)\\b',
  '\\b(?:annual(?:ly)?|biannual(?:ly)?|monthly|bimonthly|quarterly|yearly|weekly|daily|fortnightly)\\b',
  '\\b(?:yesterday|ytd|mtd|qtd)\\b',
  '\\bso\\s+far\\b',
  '\\bmonth\\s*-?\\s*to\\s*-?\\s*date\\b',
  `\\b(?:since|until|till|before|after|upto|up\\s+to|onwards?)\\s+(?:the\\s+)?(?:(?:${CHAT_MONTH_WORDS})\\b|20\\d{2}-\\d{2}\\b(?!-\\d)|(?:last|this|previous|prior|next)\\s+month\\b)`,
].join('|'), 'i');
const IMS_PERIOD_NUMBERS = new RegExp([
  '(?<![\\w/.-])\\d{1,2}\\s*[/.-]\\s*20\\d{2}(?![\\w/-]|\\.\\d)',
  '(?<![\\w/.-])20\\d{2}\\s*[/.]\\s*\\d{1,2}(?![\\w/-]|\\.\\d)',
  `\\b(?:${CHAT_MONTH_WORDS})\\.?\\s*[-'\\u2019/]\\s*\\d{2}\\b`,
  '\\b\\d{1,2}(?:st|nd|rd|th)\\s+(?:quarter|half|year)\\b',
].join('|'), 'gi');
const IMS_ISO_MONTH = /\b(20\d{2})-(\d{1,2})\b/g;
const IMS_THIS_MONTH = /\b(?:this|current)\s+month\b/gi;
const IMS_LAST_MONTH = /\b(?:last|previous|prior|preceding)\s+month\b/gi;
const IMS_NAMED_MONTH = new RegExp(`\\b(${CHAT_MONTH_WORDS})\\b\\.?(?:(?:\\s+|\\s*,\\s*|\\s+of\\s+|\\s*\\(\\s*)(20\\d{2})\\b\\)?)?`, 'gi');
const IMS_BARE_YEAR = /(?<![\w-])20\d{2}(?![\w-])/;
const IMS_MODAL_MAY = /\b(?:i|we|you|he|she|they|it)\s+may\b|(?<!\b(?:for|in|of|during|from|to|till|until|through|thru|and|or|between|by|since|upto|on|at|the|this|last|next|previous|prior|month)\s+)(?<![-\u2013/&]\s*)\bmay\s+(?:i|we|you|he|she|they|it|there|someone|anyone|see|have|get|show|check|look|be|not|need|want|know|ask)\b/gi;
const IMS_DECISION_VERB = { accept: /\baccept\b/i, reject: /\breject\b/i, pending: /\b(?:mark|put|set|make|move|keep|leave)\b/i };
const IMS_INFORMATIONAL = new RegExp([
  '\\b(?:what|who|whom|how|why|whether|should|shall)\\b',
  '\\bwhich\\s+(?:invoices?|bills?|rows?|entries|entry|ones|items?|notes?|documents?|records?|of|to)\\b',
  '\\b(?:see|tell|explain|summary|summaries|summari[sz]e|overview|posted|updated|informed)\\b',
  '\\ba\\s+lists?\\b|\\blists?\\s+(?:of|all|the|every|out)\\b',
  '\\b(?:invoices?|bills?|rows?|entries|entry|ones|items?|notes?|documents?|records?|steps?|ways?|things?|stuff|those|these)\\s+(?:that\\s+)?(?:(?:i|we)\\s+)?(?:(?:should|shall|must|can|could|may|might|need\\s+to|have\\s+to)\\s+|to\\s+)(?:accept|reject)\\b',
].join('|'), 'i');
const IMS_PENDING_NOUN = /\bpending\s+(?:invoices?|bills?|rows?|entries|entry|items?|ones|documents?|notes?|records?)\b/i;
const IMS_ONE_AT_A_TIME = 'IMS takes one decision at a time. Say, for example, "accept all matched invoices in IMS" first, then "reject all undecided invoices in IMS".';
const IMS_BULK_ONLY = 'I have changed nothing in IMS. A bulk decision applies to every row of that set, so I will not run it for one supplier, for only some of the rows or with an exception left out. Say it for the whole set, for example "accept all matched invoices in IMS", or pick single rows in the IMS screen.';
const IMS_NARROWED = /\b(?:except(?:ing)?|exclud(?:e|es|ed|ing)|other\s+than|apart\s+from|aside\s+from|besides|but\s+not|not\s+including|leav(?:e|es|ing)\s+out|skip(?:s|ping)?|where|whose)\b|\bonly\b(?!\s+(?:the\s+)?(?:matched|suggested|undecided|not\s+decided)\b)(?!\s*(?:$|[.!?]|(?:in|on|for|at|within)\b))|(?<!\bevery\s)(?<!\beach\s)(?<!\bany\s)\b(?:supplier|vendor|seller)\b(?!\s+(?:invoices?|bills?|documents?|notes?|rows?|entries|records?|credit|debit)\b)/i;
const IMS_REFERENCE = '(?:in|on|at|within|inside|via|through|thru|using)\\s+(?:the\\s+)?(?:gst\\s+)?(?:ims|invoice\\s+management(?:\\s+system)?)\\b(?:\\s+(?:screen|page|tab|dashboard|list|view))?';
const IMS_TAIL_PERIOD = `(?:for|in)\\s+(?:the\\s+)?(?:month\\s+of\\s+)?(?:(?:this|last|previous|prior)\\s+month|(?:${CHAT_MONTH_WORDS})(?:\\s+20\\d{2})?|20\\d{2}-(?:0[1-9]|1[0-2]))\\b`;
const IMS_TAIL_WORDS = '(?:and|then|also|just|please|pls|kindly|thanks|thank\\s+you|thx|ok|okay|confirm|approve|proceed|continue|submit|apply|post|save|yes|say\\s+yes|sure|go\\s+ahead|do\\s+it|let\\s+me\\s+know)\\b';
const IMS_TAIL_PIECE = `[,;:.!?)]|${IMS_REFERENCE}|${IMS_TAIL_PERIOD}|${IMS_TAIL_WORDS}`;
const IMS_FROM_CLOSING = `(?=(?:\\s*(?:${IMS_TAIL_PIECE}))*\\s*$)`;
const IMS_FROM_SOURCE = '(?:(?:gst|gstn|government|govt)\\s+)?portal\\b|gstn\\b|(?:gstr[\\s-]?)?2b\\b';
const IMS_FROM_PLACE = '(?:gst\\s+)?ims\\b(?:\\s+(?:screen|page|tab|dashboard|list|view))?|dashboard\\b|here\\b|now\\b|(?:(?:all|every|each|any)\\b(?:\\s+of)?(?:\\s+(?:the|my|our))?\\s+(?:(?:registered|known|gst)\\s+)?(?:suppliers?|vendors?)\\b)|(?:(?:registered|known)\\s+)?(?:suppliers|vendors)\\b';
const IMS_FROM_PERIOD = new RegExp(`\\bfrom\\s+(?:(?:the|my|our)\\s+)?(?:(?:${IMS_FROM_SOURCE}|${IMS_FROM_PLACE})${IMS_FROM_CLOSING}|(?:this|last|previous|prior)\\s+(?:month|quarter)\\b|(?:${CHAT_MONTH_WORDS})(?:\\s+(?:in|for|on|to|ims|20\\d{2})\\b|\\s*[,.]|\\s*$)|fy\\b|financial\\s+year\\b|(?!2b\\b)\\d)`, 'gi');
const IMS_COUNT_WORDS = '(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|top|next|single|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|some|few|couple|several|both|half|most|other|another|either|latest|newest|oldest|earliest|biggest|largest|smallest|highest|lowest|recent)';
const IMS_PART_OF_SET = new RegExp(`(?<!\\b(?:every|each)\\s)\\b${IMS_COUNT_WORDS}\\b(?:\\s+(?:${IMS_COUNT_WORDS}|of|a|an|the|these|those|my|our))*\\s+(?:matched|suggested|undecided|not\\s+decided)\\b`, 'i');
const IMS_RELATIVE_PERIOD = /\b(?:this|last|previous|prior|next)\s+(?:month|quarter|year|week)\b|\b(?:first|second|third|fourth)\s+quarter\b/gi;
const IMS_SET_WORDS = '(?:matched|suggested|undecided|not\\s+decided)';
const IMS_DAY_DATE = `(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${CHAT_MONTH_WORDS})\\b|(?:${CHAT_MONTH_WORDS})\\.?\\s+\\d{1,2}(?!\\d)|20\\d{2}-\\d{2}-\\d{2}\\b)`;
const IMS_DATE_FILTER = new RegExp(`\\b(?:dated|on|from|since|until|till|before|after|between|upto|up\\s+to)\\s+(?:the\\s+)?${IMS_DAY_DATE}`, 'i');
const IMS_SINGLE_ROW = new RegExp(`(?<!\\b(?:every|each|any|all)\\s)\\b(?:the|this|that|a|an)\\s+${IMS_SET_WORDS}\\s+(?:invoice|bill|note|row|entry|record|document|one)\\b`, 'i');
const IMS_ROW_TYPE = new RegExp(`\\b${IMS_SET_WORDS}\\s+(?:credit|debit)\\s+notes?\\b|\\b(?:credit|debit)\\s+notes?\\s+(?:(?:(?:that|which)\\s+)?(?:are|is)\\s+)?${IMS_SET_WORDS}\\b`, 'i');
const IMS_COMMAND_WORDS = new Set(['accept', 'accepted', 'reject', 'rejected', 'pending', 'all', 'every', 'each', 'any', 'the', 'matched', 'suggested', 'undecided', 'not', 'decided', 'invoice', 'invoices', 'bill', 'bills', 'row', 'rows', 'entry', 'entries', 'ims', 'management', 'gst', 'gstn', 'gstr', 'portal', 'mark', 'make', 'put', 'please', 'pls', 'kindly', 'can', 'could', 'would', 'will', 'you', 'let', 'lets', 'want', 'need', 'like', 'and', 'then', 'now', 'also', 'just', 'this', 'that', 'these', 'those', 'them', 'for', 'from', 'with', 'month', 'quarter', 'year', 'last', 'previous', 'prior', 'current', 'financial', 'period', 'list', 'screen', 'dashboard', 'statement', 'return', 'okay', 'yes', 'hey', 'hello', 'thanks', 'sure', 'one', 'whole', 'only', 'ones', 'supplier', 'suppliers', 'vendor', 'vendors', 'ahead', 'done', 'right', 'today', 'tomorrow', 'yesterday', 'here', 'there', 'once', 'again', 'together', 'everything']);
const IMS_MONTH_WORD = new RegExp(`^(?:${CHAT_MONTH_WORDS})$`, 'i');

function latestTwobMonth(state) {
  const stored = state.gstr2b && typeof state.gstr2b === 'object' ? Object.keys(state.gstr2b) : [];
  return stored.filter((key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key)).sort().pop() || '';
}

function hasTwobFor(state, month) {
  return Boolean(state.gstr2b && typeof state.gstr2b === 'object' && Object.hasOwn(state.gstr2b, month) && state.gstr2b[month]);
}

function chatMonthBefore(today) {
  const [year, month] = today.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

function imsPeriodReading(sentence, today = localToday()) {
  const text = sentence.replace(IMS_MODAL_MAY, ' ');
  const months = new Set();
  let unread = IMS_PERIOD_UNREAD.test(text) || text.search(IMS_PERIOD_NUMBERS) >= 0;
  const left = text
    .replace(IMS_ISO_MONTH, (_, year, month) => {
      if (isReturnPeriod(`${year}-${month}`)) months.add(`${year}-${month}`);
      else unread = true;
      return ' ';
    })
    .replace(IMS_THIS_MONTH, () => {
      months.add(today.slice(0, 7));
      return ' ';
    })
    .replace(IMS_LAST_MONTH, () => {
      months.add(chatMonthBefore(today));
      return ' ';
    })
    .replace(IMS_NAMED_MONTH, (_, word, year) => {
      months.add(chatMonthKey(word, year, today));
      return ' ';
    });
  if (unread || months.size > 1 || IMS_BARE_YEAR.test(left)) return { unread: true };
  return months.size ? { period: [...months][0] } : {};
}

function imsMonthUnread(state, ask = 'accept all matched invoices in IMS for') {
  const example = latestTwobMonth(state) || chatMonthBefore(localToday());
  return { kind: 'reply', reply: inWords(`I could not read that period as one month, so I have changed nothing in IMS. Say the month, for example "${ask} ${example}".`), tools: [] };
}

function namesAnImsParty(state, text) {
  const haystack = ` ${nameKey(text)} `;
  return [...(state.parties || []), ...(state.vendors || [])].some((party) => {
    const name = nameKey(party?.name);
    return name && IMS_SAID.test(name) && haystack.includes(` ${name} `);
  });
}

function imsNamesSupplier(state, period, text) {
  const padded = ` ${nameKey(text)} `;
  const rows = state.gstr2b && typeof state.gstr2b === 'object' && state.gstr2b[period] ? state.gstr2b[period].rows : [];
  const names = [
    ...(Array.isArray(rows) ? rows : []).map((row) => row?.supplierName),
    ...(state.purchases || []).map((bill) => bill?.partyName),
    ...(state.vendors || []).map((vendor) => vendor?.name),
    ...(state.parties || []).map((party) => party?.name),
  ].map(nameKey);
  return names.some((name) => name && padded.includes(` ${name} `));
}

function imsNamesSupplierWord(state, period, text) {
  const rows = state.gstr2b && typeof state.gstr2b === 'object' && state.gstr2b[period] ? state.gstr2b[period].rows : [];
  const leads = new Set([
    ...(Array.isArray(rows) ? rows : []).map((row) => row?.supplierName),
    ...(state.purchases || []).map((bill) => bill?.partyName),
    ...(state.vendors || []).map((vendor) => vendor?.name),
    ...(state.parties || []).map((party) => party?.name),
  ].map((name) => nameKey(name).split(' ')[0]).filter((word) => word.length >= 3 && !IMS_COMMAND_WORDS.has(word) && !IMS_MONTH_WORD.test(word)));
  return nameKey(text).split(' ').some((word) => leads.has(word));
}

function imsSelectionQualified(state, period, text) {
  const kept = text.replace(IMS_FROM_PERIOD, ' ');
  const counted = kept.replace(IMS_RELATIVE_PERIOD, ' ');
  return /\bfrom\b/i.test(kept) || IMS_NARROWED.test(kept) || IMS_DATE_FILTER.test(text) || IMS_SINGLE_ROW.test(counted) || IMS_ROW_TYPE.test(counted) || IMS_PART_OF_SET.test(counted) || imsNamesSupplier(state, period, kept) || imsNamesSupplierWord(state, period, counted);
}

function planImsFromChat(state, text) {
  if (countryOf(state) !== 'IN' || !IMS_SAID.test(text) || isNegated(text) || REMINDER_WORDS.test(text) || namesAnImsParty(state, text)) return null;
  const hits = [...text.matchAll(IMS_DECISION_SAID)];
  const said = new Set(hits.map((hit) => hit[1].toLowerCase()));
  const bulkOnly = { kind: 'reply', reply: IMS_BULK_ONLY, tools: [] };
  const verbed = said.size === 1 && IMS_DECISION_VERB[[...said][0]].test(text);
  const marker = IMS_INFORMATIONAL.exec(text);
  const informational = Boolean(marker) && (!hits.length || marker.index < hits[0].index || hits.some((hit) => hit.index >= marker.index && hit.index < marker.index + marker[0].length));
  const commanded = verbed && !informational && !(said.has('pending') && IMS_PENDING_NOUN.test(text));
  if (/\d/.test(text.replace(IMS_PERIOD_NUMBERS, ' ').replace(IMS_PERIOD_FIGURES, ' '))) return verbed && !isQuestion(text) ? bulkOnly : null;
  const reading = imsPeriodReading(text);
  const period = reading.period || latestTwobMonth(state);
  const review = reading.unread ? imsMonthUnread(state, said.size && !isQuestion(text) && !informational ? undefined : 'show IMS for') : { kind: 'tool', name: 'ims_review', args: period ? { period } : {} };
  if (isQuestion(text) || informational) return review;
  if (said.size > 1) return { kind: 'reply', reply: IMS_ONE_AT_A_TIME, tools: [] };
  const pick = IMS_SELECT_SAID.exec(text);
  if (said.size === 1 && (pick || !said.has('pending')) && imsSelectionQualified(state, period, text)) return bulkOnly;
  if (commanded && (!pick || IMS_UNMATCHED_SAID.test(text))) return bulkOnly;
  if (said.size !== 1 || !pick || IMS_UNMATCHED_SAID.test(text) || reading.unread) return review;
  const word = (pick[1] || pick[2]).toLowerCase().replace(/\s+/g, ' ');
  return { kind: 'tool', name: 'ims_decide', args: { period: period || localToday().slice(0, 7), select: word === 'not decided' ? 'undecided' : word, decision: [...said][0] } };
}

const SUPPLIER_DUES_SAID = /\b(?:msme|udyam|micro|small\s+enterprise)\b.*\b(?:dues?|owe|owed|payable|bills?|pay)\b|\b(?:supplier|vendor)\s+dues\b|\bwhat\s+do\s+i\s+owe\s+(?:my\s+)?(?:msme|suppliers)\b/i;
const MSME_STATED = /\bis\s+(?:an?\s+)?msme\b/i;
const MSME_KEYWORD = '(?:msme|micro\\s+enterprise|small\\s+enterprise|medium\\s+enterprise)';
const MSME_ARTICLE = '(?:(?:an?|the)\\s+|a\\s+registered\\s+)?';
const MSME_MARKED = new RegExp(`^(?:please\\s+)?mark\\s+(.+?)\\s+as\\s+${MSME_ARTICLE}(${MSME_KEYWORD})\\b(.*)$`, 'i');
const MSME_IS = new RegExp(`^(.+?)\\s+is\\s+${MSME_ARTICLE}(${MSME_KEYWORD})\\b(.*)$`, 'i');
const MSME_WORD = new RegExp(`\\b${MSME_KEYWORD}`, 'i');
const MSME_CATEGORY = /\b(micro|small|medium)\s+(?:category|enterprise|unit)\b|\bcategory\s*[:=-]?\s*(micro|small|medium)\b/i;
const MSME_CATEGORY_BARE = /(?<![\w-])(micro|small|medium)(?![\w-])(?=\s*(?:$|[,;.)]|\d))/i;
const SUPPLIER_DAYS_NUMBER = '\\d+(?:[.,]\\d+)*';
const SUPPLIER_DAYS_PATTERN = `\\bnet\\s*(${SUPPLIER_DAYS_NUMBER})\\b|(?<!\\d)(?<!\\d[.,])(${SUPPLIER_DAYS_NUMBER})\\s*-?\\s*days?\\b`;
const SUPPLIER_DAYS = new RegExp(SUPPLIER_DAYS_PATTERN, 'i');
const SUPPLIER_DAYS_SAID = new RegExp(SUPPLIER_DAYS_PATTERN, 'gi');
const SUPPLIER_DAYS_FORM = 'Agreed days must be a whole number from 0 to 365.';
const SUPPLIER_TERMS_FOR = /^(?:please\s+)?(?:(?:set|update|change|record|save)\s+)?(?:the\s+)?(?:supplier|vendor)\s+terms\s+(?:for|of|with)\s+(.+)$/i;
const PAYMENT_TERMS_FOR = /^(?:please\s+)?(?:(?:set|update|change|record|save|put)\s+)?(?:the\s+)?payment\s+terms\s+(?:for|of|with)\s+(.+)$/i;
const PAYMENT_TERMS_OF = /^(?:please\s+)?(?:(?:set|update|change|record|save|put)\s+)?(?:the\s+)?(.+?)(?:['’]s)?\s+payment\s+terms\b(.*)$/i;
const TERMS_DETAILS_START = /\s*[:,;]\s*|\s+(?:to|are|is|as|at|net)\b|\s+(?=\d)/i;
const TERMS_NEXT = /^(?:\s*[:,;]|\s+(?:\d|(?:to|are|is|as|at|net|msme|micro|small|medium|udyam|payable|pay|in|within|after)\b)|\s*$)/i;
const TERMS_TRAILING = /\b(?:msme|micro|small|medium|enterprise|udyam|payable|pay|paid|in|within|after|of|for|on)\s*$/i;
const NOT_SAID = /\b(?:not|non|no|never)\b|n['’]t\b/i;
const NOT_A_NAME = /[%₹]|\b(?:gst|gstin|rs|inr)\b|\d{4,}/i;
const UDYAM_NUMBER_SAID = /(?:\b(?:with|having|under|on)\s+)?(?:\budyam\s*(?:registration\s*)?(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*)?\b(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b/i;
const UDYAM_MALFORMED = /\budyam\b\s*(?:registration\s*)?(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*(?:UDYAM\b|[A-Za-z0-9-]*\d)/i;
const UDYAM_ONLY = /^(.+?)(?:['’]s|\s+(?:has|have|had|holds?|got))?\s+udyam\s*(?:registration\s*)?(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b(.*)/i;
const UDYAM_ONLY_MALFORMED = /^(.+?)(?:['’]s)?\s+udyam\s*(?:registration\s*)?(?:(?:no\.?|number)\s*(?:is\s*)?[:#]?\s*\S*\d|(?:is\s*)?[:#]?\s*(?:UDYAM\b|[A-Za-z]{2}-\d{2}-\d))/i;
const UDYAM_OF = /^(?:the\s+)?udyam\s*(?:registration\s*)?(?:no\.?|number)?\s+(?:of|for)\s+(.+?)\s*(?:\b(?:is|are)\b\s*)?[:=]?\s*(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b(.*)$/i;
const UDYAM_OF_MALFORMED = /^(?:the\s+)?udyam\s*(?:registration\s*)?(?:no\.?|number)?\s+(?:of|for)\s+.+?\s*(?:\b(?:is|are)\b\s*)?[:=]?\s*(?:UDYAM\b|[A-Za-z]{2}-\d{2}-\d)/i;
const UDYAM_ANOTHER = /UDYAM-[A-Z]{2}-\d{2}-\d{7}/i;
const UDYAM_FORM = 'A Udyam number looks like UDYAM-XX-00-0000000.';
const PAYS_WITHIN_DAYS = /^(?:(?:please|pls|kindly)\s+)?(?:(?:we|i)(?:['’](?:ll|d))?\s+(?:(?:will|shall|usually|normally|always|should|must|can|could|would|need\s+to|have\s+to|agreed?\s+to|have\s+agreed\s+to|are\s+to|plan\s+to|want\s+to)\s+)*)?pay\s+(.+?)\s+(?:(?:in|within|after)\s+(\d+(?:[.,]\d+)*)\s*-?\s*days?|net\s*(\d+(?:[.,]\d+)*))\b(.*)$/i;
const SUPPLIER_NAME_NOISE = new Set(['my', 'our', 'the', 'a', 'an', 'supplier', 'vendor', 'suppliers', 'vendors', 'please', 'pls', 'kindly', 'mark', 'that', 's', 'since', 'as', 'because', 'so', 'also', 'but', 'note', 'now', 'today', 'hey', 'hi', 'hello', 'oh', 'just', 'well', 'btw', 'fyi', 'actually', 'remember', 'confirm', 'once', 'after', 'maybe', 'all', 'every', 'each', 'both', 'set', 'add', 'save', 'record', 'update', 'register', 'tag', 'msme', 'too', 'called', 'named', 'yes', 'ok', 'okay', 'again']);
const SUPPLIER_LEAD_PHRASE = '(?:by\\s+the\\s+way|for\\s+the\\s+record|just\\s+so\\s+you\\s+know|for\\s+your\\s+information|note\\s+to\\s+self|(?:(?:please|pls|kindly)\\s+)?note\\s+(?:that|down)|(?:please|pls|kindly)\\s+note|remember\\s+that|confirm\\s+that)';
const SUPPLIER_LEAD_SURE = '(?:since|as|because|so|also|but|please|pls|kindly|that|hey|btw|fyi|actually|remember|maybe)';
const SUPPLIER_LEAD_MAYBE = '(?:note|now|today|confirm|once|after|just|well|hi|hello|oh|okay|ok)';
const SUPPLIER_LEAD_SOFT = '(?:\\s*[:,;]\\s*|\\s+-\\s+|\\s+)';
const SUPPLIER_LEAD_HARD = '(?:\\s*[:,;]\\s*|\\s+-\\s+)';
const SUPPLIER_LEAD_IN = new RegExp(`^(?:(?:${SUPPLIER_LEAD_PHRASE}|${SUPPLIER_LEAD_SURE})${SUPPLIER_LEAD_SOFT}|${SUPPLIER_LEAD_MAYBE}${SUPPLIER_LEAD_HARD})+`, 'i');
const SUPPLIER_ASIDE = /\b(?:by the way|for the record|just so you know|for your information|note to self|note down|note that|remember that|confirm that)\b/g;
const SUPPLIER_CONDITIONAL = /^(?:(?:ok(?:ay)?|so|well|and|but|then|hey|btw|fyi|also|please)[\s,]+)*(?:(?:even|only|as|what|not\s+sure|unsure|wonder(?:ing)?|check(?:ing)?|see(?:ing)?|ask(?:ing)?|know(?:ing)?|find\s+out)\s+)?(?:if|when|whenever|whether|suppose|supposing|assuming|unless|in\s+case|provided)\b/i;
const NAME_LIST_SAID = /[,;&+/]|\b(?:and|or|nor|plus|both|either|neither)\b/i;
const NAME_PRONOUNS = new Set(['i', 'me', 'we', 'us', 'you', 'he', 'him', 'she', 'her', 'it', 'they', 'them', 'who', 'whom', 'whoever', 'which', 'what', 'this', 'that', 'these', 'those', 'one', 'ones', 'everyone', 'everybody', 'everything', 'anyone', 'anybody', 'anything', 'someone', 'somebody', 'something', 'nobody', 'nothing', 'none', 'his', 'hers', 'their', 'theirs', 'its', 'your', 'yours', 'mine', 'ours', 'last', 'same', 'other', 'others', 'another']);
const MSME_ALSO = /\band\b.+\b(?:as|is|are)\s+(?:(?:an?|the)\s+)?(?:msme|micro|small|medium)\b/i;
const TERMS_TALK_SAID = /\b(?:msme|udyam|(?:supplier|vendor)\s+terms)\b/i;
const POSTING_SAID = /\b(?:invoice|bill\s+from|buy\s+from|bought|purchased?|sold|sell|raise\s+bill|create\s+bill|sales?\s+to)\b/i;

function knownSupplierNames(state, { suppliersOnly = false } = {}) {
  const names = new Map();
  const add = (name) => {
    const key = nameKey(name);
    if (key && !names.has(key)) names.set(key, String(name).trim());
  };
  for (const bill of state.purchases || []) add(bill?.partyName);
  for (const vendor of state.vendors || []) add(vendor?.name);
  if (!suppliersOnly) for (const party of state.parties || []) add(party?.name);
  return names;
}

function knownSupplierIn(names, part) {
  const padded = ` ${nameKey(part)} `;
  const hits = [...names.entries()].filter(([key]) => padded.includes(` ${key} `)).sort((a, b) => b[0].length - a[0].length);
  for (const [key, display] of hits) {
    const left = padded.replace(` ${key} `, ' ').replace(SUPPLIER_ASIDE, ' ').trim().split(/\s+/).filter((word) => word && !SUPPLIER_NAME_NOISE.has(word));
    if (!left.length) return display;
  }
  return '';
}

function supplierNamesIn(names, part) {
  const padded = ` ${nameKey(part)} `;
  const hits = [...names.keys()].filter((key) => padded.includes(` ${key} `));
  return hits.filter((key) => !hits.some((other) => other !== key && ` ${other} `.includes(` ${key} `)));
}

function supplierNameSaid(state, part, loose) {
  const names = knownSupplierNames(state);
  const known = knownSupplierIn(names, part);
  if (known) return known;
  const lead = loose ? /^(?:please\s+)?(?:(?:my|our|the)\s+)?(?:supplier|vendor)\s+/i : /^(?:please\s+)?(?:my|our|the)\s+(?:supplier|vendor)\s+/i;
  const name = String(part || '').trim().replace(SUPPLIER_LEAD_IN, '').replace(lead, '').replace(/\s+(?:supplier|vendor|msme)$/i, '').trim();
  if (!name || name.toLowerCase().split(/\s+/).every((word) => SUPPLIER_NAME_NOISE.has(word)) || NOT_A_NAME.test(name) || !/[a-z]/i.test(name)) return '';
  if (NAME_LIST_SAID.test(name.replace(/\bm\/s\b\.?/gi, ' ')) || supplierNamesIn(names, name).length > 1) return '';
  return nameKey(name).split(' ').some((word) => NAME_PRONOUNS.has(word)) ? '' : name;
}

function supplierOnlyNamed(state, part) {
  const supplier = knownSupplierIn(knownSupplierNames(state, { suppliersOnly: true }), part);
  if (!supplier) return '';
  const key = nameKey(supplier);
  const customers = [...(state.parties || []).map((party) => party?.name), ...(state.invoices || []).map((invoice) => invoice?.partyName)];
  return customers.some((name) => nameKey(name) === key) ? '' : supplier;
}

function supplierTermsTail(state, tail) {
  const known = [...knownSupplierNames(state).values()]
    .sort((a, b) => b.length - a.length)
    .find((name) => tail.slice(0, name.length).toLowerCase() === name.toLowerCase() && TERMS_NEXT.test(tail.slice(name.length)));
  if (known) return { part: known, rest: tail.slice(known.length), known: true };
  const cut = TERMS_DETAILS_START.exec(tail);
  return { part: cut ? tail.slice(0, cut.index) : tail, rest: cut ? tail.slice(cut.index) : '', known: false };
}

function supplierConditional(part) {
  const body = String(part || '').trim();
  return SUPPLIER_CONDITIONAL.test(body) || SUPPLIER_CONDITIONAL.test(body.replace(SUPPLIER_LEAD_IN, ''));
}

function supplierTermsDeclined() {
  return { kind: 'tool', name: 'company_profile', args: {}, fallback: true };
}

function supplierTermsDetails(udyam, keyword, rest, msme) {
  const days = SUPPLIER_DAYS.exec(rest);
  const worded = /^(micro|small|medium)\b/i.exec(keyword) || MSME_CATEGORY.exec(rest) || (msme ? MSME_CATEGORY_BARE.exec(rest) : null);
  const category = worded ? (worded[1] || worded[2]).toLowerCase() : '';
  return { ...(udyam ? { udyam } : {}), ...(category ? { category } : {}), ...(days ? { days: Number(days[1] || days[2]) } : {}) };
}

function supplierDaysBad(token) {
  return /[.,]/.test(token) || Number(token) > 365;
}

function supplierDaysOutOfRange(text) {
  for (const hit of text.matchAll(SUPPLIER_DAYS_SAID)) if (supplierDaysBad(hit[1] || hit[2])) return true;
  return false;
}

function supplierDaysRefused() {
  return { kind: 'reply', reply: SUPPLIER_DAYS_FORM, tools: [], blocked: true };
}

function supplierPayingDays(state, body) {
  const paying = PAYS_WITHIN_DAYS.exec(body);
  if (!paying || /\d/.test(`${paying[1]} ${paying[4]}`)) return null;
  const supplier = knownSupplierIn(knownSupplierNames(state, { suppliersOnly: true }), paying[1]);
  if (!supplier) return null;
  const days = paying[2] || paying[3];
  return supplierDaysBad(days) ? supplierDaysRefused() : { kind: 'tool', name: 'set_supplier_terms', args: { partyName: supplier, days: Number(days) } };
}

function supplierPaymentTerms(state, body) {
  const termsFor = PAYMENT_TERMS_FOR.exec(body);
  const termsOf = termsFor ? null : PAYMENT_TERMS_OF.exec(body);
  const tail = termsFor ? supplierTermsTail(state, termsFor[1]) : null;
  const part = tail ? tail.part : termsOf ? termsOf[1] : '';
  const rest = tail ? tail.rest : termsOf ? termsOf[2] : '';
  const supplier = part ? supplierOnlyNamed(state, part) : '';
  if (!supplier || NOT_SAID.test(rest)) return null;
  if (supplierDaysOutOfRange(rest)) return supplierDaysRefused();
  const details = supplierTermsDetails('', '', rest, MSME_WORD.test(rest));
  if (details.days == null) return null;
  return { kind: 'tool', name: 'set_supplier_terms', args: { partyName: supplier, ...(MSME_WORD.test(rest) ? { msme: true } : {}), ...details } };
}

function udyamTermsPlan(state, name, udyam, rest) {
  if (UDYAM_ANOTHER.test(rest)) return null;
  if (supplierConditional(name)) return supplierTermsDeclined();
  const partyName = supplierNameSaid(state, name, true);
  if (!partyName) return null;
  if (supplierDaysOutOfRange(rest)) return supplierDaysRefused();
  return { kind: 'tool', name: 'set_supplier_terms', args: { partyName, msme: true, ...supplierTermsDetails(udyam.toUpperCase(), '', rest, true) } };
}

function planSupplierTermsFromChat(state, text) {
  const body = text.replace(/\s+/g, ' ').trim();
  if (isNegated(body) || isQuestion(body)) return null;
  if (POSTING_SAID.test(body)) return supplierPayingDays(state, body) || supplierPaymentTerms(state, body);
  const udyamFound = UDYAM_NUMBER_SAID.exec(body);
  const udyam = udyamFound ? udyamFound[1].toUpperCase() : '';
  const bare = udyamFound ? body.replace(udyamFound[0], ' ').replace(/\s+/g, ' ').trim() : body;
  const marked = MSME_MARKED.exec(bare);
  const stated = marked || MSME_IS.exec(bare);
  const termsFor = stated ? null : SUPPLIER_TERMS_FOR.exec(bare);
  if (stated || termsFor) {
    const tail = termsFor ? supplierTermsTail(state, termsFor[1]) : null;
    const part = stated ? stated[1] : tail.part;
    const rest = stated ? stated[3] : tail.rest;
    if (UDYAM_MALFORMED.test(`${part} ${rest}`)) return { kind: 'reply', reply: UDYAM_FORM, tools: [] };
    if (tail && (NOT_SAID.test(rest) || (!tail.known && (NOT_SAID.test(part) || TERMS_TRAILING.test(part))))) return supplierTermsDeclined();
    if (MSME_ALSO.test(rest) || UDYAM_NUMBER_SAID.test(bare)) return null;
    if (stated && supplierConditional(part)) return supplierTermsDeclined();
    const partyName = tail?.known ? part : supplierNameSaid(state, part, Boolean(marked || termsFor));
    if (!partyName) return termsFor ? supplierTermsDeclined() : null;
    if (supplierDaysOutOfRange(rest)) return supplierDaysRefused();
    const msme = Boolean(stated) || MSME_WORD.test(rest);
    const details = supplierTermsDetails(udyam, stated ? stated[2] : '', rest, msme);
    if (termsFor && !msme && !Object.keys(details).length) return supplierTermsDeclined();
    return { kind: 'tool', name: 'set_supplier_terms', args: { partyName, ...(msme ? { msme: true } : {}), ...details } };
  }
  const udyamOf = UDYAM_OF.exec(body);
  if (udyamOf) return udyamTermsPlan(state, udyamOf[1], udyamOf[2], udyamOf[3]);
  const udyamOnly = UDYAM_ONLY.exec(body);
  if (udyamOnly) return udyamTermsPlan(state, udyamOnly[1], udyamOnly[2], udyamOnly[3]);
  if (UDYAM_OF_MALFORMED.test(body) || UDYAM_ONLY_MALFORMED.test(body)) return { kind: 'reply', reply: UDYAM_FORM, tools: [] };
  return supplierPayingDays(state, body) || supplierPaymentTerms(state, body);
}

function challanReasonSaid(text) {
  if (/\bjob\s*work/i.test(text)) return 'job-work';
  if (/\bapproval\b/i.test(text)) return 'approval';
  if (/\bexhibition\b/i.test(text)) return 'exhibition';
  if (/\bown\s+use\b/i.test(text)) return 'own-use';
  return '';
}

const TDS_WORDING = /\btax\s+(?:deducted|withheld)\s+at\s+source\b/i;

function severalReceiptAmounts(text, invoiceId) {
  const amounts = amountsSaid(text);
  const asked = 'I read more than one amount in that, so I have recorded nothing.';
  if (TDS_WORDING.test(text) && amounts.length === 2) {
    return { kind: 'reply', reply: `${asked} If one of them is TDS your customer withheld, a receipt that carries TDS is two entries: first say "received ${Math.max(...amounts)} against ${invoiceId}", then say "record tds withheld ${Math.min(...amounts)} on ${invoiceId} under 194J" (use the section on the TDS certificate). The TDS then takes the date of the receipt.`, tools: [] };
  }
  return { kind: 'reply', reply: `${asked} Say the one amount you received, for example "received ${amounts[0]} against ${invoiceId}", or leave the amounts out to settle the whole invoice.`, tools: [] };
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

  const ownAddress = /^(?:(?:my|our)\s+)?(?:business|company|shop|office|firm)(?:'s)?\s+address\s*(?:is\b|:|-)\s*(.{5,200})$/i.exec(text.trim());
  if (ownAddress && !isQuestion(text)) {
    const said = ownAddress[1].trim().replace(/[.\s]+$/, '');
    const pin = /\b([1-9][0-9]{5})\b/.exec(said);
    if (!pin) return { kind: 'reply', reply: 'Say the address with its 6-digit PIN code, for example "business address: Plot 4, MIDC, Pune 411019". I have recorded nothing.', tools: [] };
    const city = said.slice(0, pin.index).split(',').map((part) => part.trim()).filter(Boolean).pop() || '';
    return { kind: 'tool', name: 'set_business_address', args: { address: said, pin: pin[1], ...(city && city !== said ? { city: city.slice(0, 50) } : {}) } };
  }
  const billTds = planBillTdsFromChat(state, text);
  if (billTds) return billTds;

  {
    const saving = /^save\s+gstr-?1\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:to|on)\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (saving && !isNegated(text)) return { kind: 'tool', name: 'save_gstr1_portal', args: { period: saving[1], ...(saving[2] ? { gstin: saving[2].toUpperCase() } : {}), ...(saving[3] ? { caApprovalId: saving[3].toUpperCase() } : {}) } };
    const filing = /^file\s+gstr-?1\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:with\s+)?otp\s+(\d{6})(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (filing && !isNegated(text)) return { kind: 'tool', name: 'file_gstr1_portal', args: { period: filing[1], otp: filing[3], ...(filing[2] ? { gstin: filing[2].toUpperCase() } : {}), ...(filing[4] ? { caApprovalId: filing[4].toUpperCase() } : {}) } };
    const saving3b = /^save\s+gstr-?3b\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:to|on)\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (saving3b && !isNegated(text)) return { kind: 'tool', name: 'save_gstr3b_portal', args: { period: saving3b[1], ...(saving3b[2] ? { gstin: saving3b[2].toUpperCase() } : {}), ...(saving3b[3] ? { caApprovalId: saving3b[3].toUpperCase() } : {}) } };
    const paying3b = /^(?:pay|set\s*off|offset)\s+(?:the\s+)?gstr-?3b(?:\s+tax)?\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+on\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (paying3b && !isNegated(text)) return { kind: 'tool', name: 'offset_gstr3b_portal', args: { period: paying3b[1], ...(paying3b[2] ? { gstin: paying3b[2].toUpperCase() } : {}), ...(paying3b[3] ? { caApprovalId: paying3b[3].toUpperCase() } : {}) } };
    const filing3b = /^file\s+gstr-?3b\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:with\s+)?otp\s+(\d{6})(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (filing3b && !isNegated(text)) return { kind: 'tool', name: 'file_gstr3b_portal', args: { period: filing3b[1], otp: filing3b[3], ...(filing3b[2] ? { gstin: filing3b[2].toUpperCase() } : {}), ...(filing3b[4] ? { caApprovalId: filing3b[4].toUpperCase() } : {}) } };
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
  const excel = planExcelFromChat(state, text);
  if (excel && !excelPlanWaits(text)) return excel;
  const imsAudit = IMS_SAID.test(text) ? planAuditTrailFromChat(state, text) : null;
  if (imsAudit) return imsAudit;
  const ims = planImsFromChat(state, text);
  if (ims) return ims;

  const quoteRef = text.match(/\b((?:QT|PI|SO|DC)-\d{4,})\b/i);
  if (quoteRef && !isQuestion(text) && !isNegated(text)) {
    const id = quoteRef[1].toUpperCase();
    if (/\b(?:convert|make|turn|raise)\b.*\binvoice\b|\binvoice\s+(?:it|for|from)?\s*(?:QT|PI|SO|DC)-/i.test(text)) return { kind: 'tool', name: 'convert_quote', args: { id } };
    if (/\baccepted\b|\bapproved\b|\bconfirmed\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'accepted' } };
    if (/\bdeclined\b|\brejected\b|\bnot\s+going\s+ahead\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'declined' } };
    if (/\bcancel(?:led|ed)?\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'cancelled' } };
    if (/\b(?:returned|came\s+back|received\s+back)\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'returned' } };
  }
  const stopRepeat = text.match(/\b(?:stop|end|cancel)\b.*\b(RP-\d{4,})\b/i);
  if (stopRepeat && !isQuestion(text)) return { kind: 'tool', name: 'stop_recurring', args: { id: stopRepeat[1].toUpperCase() } };
  const repeatAsk = repeatSaid(text);
  if (repeatAsk && !isNegated(text)) {
    if (!/\d/.test(text)) return { kind: 'tool', name: 'list_recurring', args: {} };
    if (/\binvoice\b/i.test(text) && !isQuestion(text)) {
      const from = text.match(/\s*,?\s*\b(?:from|starting|start(?:ing)?\s+on|beginning)\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/i);
      const until = text.match(/\s*,?\s*\b(?:until|till|upto|up\s+to|to\s+end\s+on)\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/i);
      let rest = text.replace(repeatAsk.words, ' ');
      for (const part of [from, until]) if (part) rest = rest.replace(part[0], ' ');
      rest = rest.replace(/\b(?:repeat(?:ing)?|recurring|set\s+up(?:\s+a)?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      const parsed = parseDocument(rest);
      if (parsed && parsed.problem) return documentProblemReply(parsed, countryOf(state));
      if (parsed) {
        if (parsed.lines[0].gstRate == null) return { kind: 'reply', reply: 'I have not set it up, because I will not guess the GST rate. Say it again with the rate, for example "repeat invoice to ABC Ltd 25000 for rent GST 18% every month from 2026-12-01".', tools: [] };
        return { kind: 'tool', name: 'add_recurring', args: { kind: 'invoice', every: repeatAsk.every, partyName: parsed.partyName, ...(parsed.partyGstin ? { partyGstin: parsed.partyGstin } : {}), lines: parsed.lines, ...(from ? { startDate: from[1] } : {}), ...(until ? { endDate: until[1] } : {}) } };
      }
    }
  }
  const bankPlan = planBankFromChat(state, text);
  if (bankPlan) return bankPlan;
  const auditPlan = planAuditTrailFromChat(state, text);
  if (auditPlan) return auditPlan;
  const salesKind = salesDocumentKindSaid(text);
  if (salesKind && !quoteRef && !isQuestion(text) && !isNegated(text)) {
    const validity = text.match(/\s*,?\s*\bvalid\s+(?:for\s+)?(\d{1,3})\s*days?\b/i);
    const reason = salesKind.kind === 'challan' ? challanReasonSaid(text) : '';
    const cleaned = (validity ? text.replace(validity[0], ' ') : text).replace(/\s*,?\s*\bfor\s+(?:job\s*work|approval|exhibition|own\s+use)\b/i, ' ');
    const asInvoice = cleaned.replace(salesKind.words, 'invoice');
    const quoted = parseDocument(asInvoice);
    if (quoted && quoted.problem) return documentProblemReply(quoted, countryOf(state));
    if (quoted) {
      if (quoted.lines[0].gstRate == null) {
        return { kind: 'reply', reply: `I have not made the ${salesKind.label}, because I will not guess the GST rate. Say it again with the rate, for example "${salesKind.example}".`, tools: [] };
      }
      return { kind: 'tool', name: 'create_quote', args: { partyName: quoted.partyName, ...(quoted.partyGstin ? { partyGstin: quoted.partyGstin } : {}), lines: quoted.lines, ...(validity ? { validDays: Number(validity[1]) } : {}), ...(salesKind.kind === 'quote' ? {} : { kind: salesKind.kind }), ...(reason ? { reason } : {}) } };
    }
  }
  const closeYearAsk = text.match(/\bclose\s+(?:the\s+)?(?:year|books?\s+for|financial\s+year|fy)\s*(\d{4}(?:-\d{2})?)?\b/i);
  if (closeYearAsk && !isQuestion(text) && !isNegated(text)) return { kind: 'tool', name: 'close_year', args: closeYearAsk[1] ? { year: closeYearAsk[1] } : {} };
  const tdsChat = planTdsChat(state, text);
  if (tdsChat) return tdsChat;
  const tdsAsk = planTdsFromChat(text);
  if (tdsAsk) return tdsAsk;
  const gstPay = planGstPayFromChat(text);
  if (gstPay) return countryOf(state) === 'IN' ? gstPay : otherEditionReply();
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
  const agreedTerms = planSupplierTermsFromChat(state, text);
  if (agreedTerms) return agreedTerms;
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
  const parsed = /\b(?:debit|credit)\s+note\b/i.test(text) ? null : parseDocument(saidTerms.text);
  const doc = parsed && !parsed.problem && parsed.lines[0].gstRate == null && TERMS_TALK_SAID.test(text) && !POSTING_SAID.test(text) ? null : parsed;
  const asking = isQuestion(text) || isNegated(text);
  if (doc && doc.problem && !asking && (isPurchaseIntent(text) || isSaleIntent(text))) return documentProblemReply(doc, countryOf(state));
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
    const taxAsked = /^\s*(?:tax\s+(?:question|help|query)|(?:gst|tds|itc|income\s+tax)\s+question|ask\s+(?:the\s+)?tax\s+(?:assistant|guide|modules?))\s*[:,-]?\s+(.{3,500}?)\s*$/i.exec(text);
    if (taxAsked) return { kind: 'tool', name: 'ask_tax', args: { question: taxAsked[1] } };
    if (/^\s*(?:tax\s+(?:modules|topics|guides?|knowledge)|what\s+tax\s+(?:topics|modules)\s+(?:do\s+you|can\s+you)\s+(?:know|cover|answer))\s*\??\s*$/i.test(text)) return { kind: 'tool', name: 'tax_modules', args: {} };
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
  if (SUPPLIER_DUES_SAID.test(text) && !MSME_STATED.test(text)) {
    return { kind: 'tool', name: 'supplier_dues', args: {} };
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
    if (countryOf(state) === 'IN') return planReview(state, text);
    if (/\bgst/i.test(text)) return otherEditionReply();
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
    let amount = soleAmountSaid(text);
    if (amount == null && saidNonPositiveAmount(text)) return { kind: 'reply', reply: `An amount of zero or less cannot be received. Say the amount, for example "received 5000 against ${invoiceId}", or leave it out to settle the whole invoice. I have recorded nothing.`, tools: [] };
    if (amount == null && amountsSaid(text).length > 1 && (state.invoices || []).some((invoice) => invoice.id === invoiceId)) {
      amount = soleAmountSaid(withoutSettledTds(text));
      if (amount == null) return severalReceiptAmounts(text, invoiceId);
    }
    return {
      kind: 'tool',
      name: 'record_receipt',
      args: { invoiceId, mode: /cash/i.test(text) ? 'cash' : 'bank', date: moneyDate(text, localToday()), ...(amount == null ? {} : { amount }) },
    };
  }

  const retag = planRetagFromChat(state, text);
  if (retag) return retag;
  const expense = planExpenseFromChat(state, text);
  if (expense) return expense;
  const chase = planCollectionFromChat(state, text);
  if (chase) return chase;
  const receipt = planReceiptWithoutInvoice(state, text);
  if (receipt) {
    if (receipt.kind !== 'tool' || receipt.name !== 'record_receipt') return receipt;
    if (saidNonPositiveAmount(text)) return { kind: 'reply', reply: 'An amount of zero or less cannot be received. Say the amount, or leave it out to settle the whole invoice. I have recorded nothing.', tools: [] };
    const said = amountsSaid(text);
    const sole = said.length > 1 ? soleAmountSaid(withoutSettledTds(text)) : (said[0] ?? null);
    if (said.length > 1 && sole == null) return severalReceiptAmounts(text, receipt.args.invoiceId);
    const kept = Object.fromEntries(Object.entries(receipt.args).filter(([key]) => key !== 'amount'));
    return { ...receipt, args: { ...kept, date: moneyDate(text, localToday()), ...(sole == null ? {} : { amount: sole }) } };
  }

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
    if (/\b(?:import|upload)\s+(?:(?:the|my)\s+)?(?:form\s+)?26\s*as\b|\b26\s*as\s+(?:credits?|194-?o)\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach Form 26AS as a CSV or text table (section, TAN of deductor, tax deducted, date), then say "import 26AS". Every section is read: the 194-O credits marketplaces deposited and the TDS your customers deducted.', tools: [] };
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
  if (excel) return excel;

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
