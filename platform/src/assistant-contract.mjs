import { planReceiptWithoutInvoice } from './receipt-intent.mjs';
import { planExpenseFromChat } from './expense-intent.mjs';
import { planPaymentFromChat } from './payment-intent.mjs';
import { planOweQuestion } from './owe-intent.mjs';
import { planFilingFromChat } from './filing-intent.mjs';
import { reviewOf } from './gst-review.mjs';
import { planReminderFromChat } from './reminder-intent.mjs';
import { planCashFromChat } from './cash-intent.mjs';
import { planTermsFromChat, takeInvoiceTerms } from './terms-intent.mjs';
import { localToday } from './dates.mjs';
import { normalizeChat, parseDocument, receiptAmount, receiptDate, isPurchaseIntent, isSaleIntent, isQuestion, isNegated, ROUTES } from './intent.mjs';
import { confirmationIntent } from './chat-confirm.mjs';

const noArgs = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

const lineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'qty', 'rate', 'gstRate'],
  properties: {
    description: { type: 'string', minLength: 1 },
    hsn: { type: 'string' },
    qty: { type: 'number', exclusiveMinimum: 0 },
    rate: { type: 'number', minimum: 0 },
    gstRate: { type: 'number', minimum: 0, maximum: 28 },
  },
};

const documentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['partyName', 'lines'],
  properties: {
    partyName: { type: 'string', minLength: 1 },
    partyGstin: { type: 'string' },
    partyState: { type: 'string' },
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
      name: { type: 'string' },
      gstin: { type: 'string', maxLength: 15 },
      pan: { type: 'string', maxLength: 10 },
      state: { type: 'string', maxLength: 2 },
      fy: { type: 'string', maxLength: 7 },
      address: { type: 'string' },
      city: { type: 'string' },
      pin: { type: 'string' },
      entityType: { type: 'string' },
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
    properties: { ...documentSchema.properties, paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 } },
  },
  create_purchase: {
    ...documentSchema,
    properties: { ...documentSchema.properties, supplierInvoiceNo: { type: 'string', maxLength: 16 } },
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
    },
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
    properties: {
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
      party: { type: 'string', maxLength: 80 },
    },
  },
  complete_reminder: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^REM-[0-9]{4,}$' } },
  },
  list_filings: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  list_reminders: {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['open', 'done', 'all'] } },
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
  gst_review: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  gst_review_answer: {
    type: 'object',
    additionalProperties: false,
    required: ['period', 'step', 'answer', 'draftHash'],
    properties: {
      period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      step: { type: 'string', enum: ['held', 'sales', 'credit', 'approve'] },
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
  gst_payable: noArgs,
  prepare_gstr1: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  gst_period_summary: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  export_gstr1_json: {
    type: 'object',
    additionalProperties: false,
    properties: {
      fp: { type: 'string', pattern: '^(0[1-9]|1[0-2])[0-9]{4}$' },
      grossTurnover: { type: 'number', minimum: 0 },
      currentGrossTurnover: { type: 'number', minimum: 0 },
    },
  },
  prepare_gstr3b: {
    type: 'object',
    additionalProperties: false,
    properties: { inwardText: { type: 'string' }, period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
  },
  filing_pack: {
    type: 'object',
    additionalProperties: false,
    properties: { period: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } },
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
      invoiceId: { type: 'string', pattern: '^INV-[0-9]{4,}$' },
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
      type: { type: 'string', enum: ['csv', 'text'] },
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
      narration: { type: 'string', maxLength: 200 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      gstRate: { type: 'number', minimum: 0, maximum: 28 },
      date: { type: 'string' },
      mode: { type: 'string', enum: ['bank', 'cash'] },
      payee: { type: 'string', maxLength: 80 },
      supplierGstin: { type: 'string', pattern: '^([0-9]{2}[A-Z0-9]{13})?$' },
      head: { type: 'string', pattern: '^5[0-9]{3}$' },
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

const ASSISTANT_BLOCKED_TOOLS = new Set(['govt_save_credentials', 'govt_set_public_key', 'govt_nic_cancel_irn', 'govt_nic_generate_ewb', 'seed_demo', 'approval_decide', 'set_company', 'add_client', 'set_active_client', 'save_document', 'get_document', 'lock_period', 'unlock_period', 'send_notification', 'test_notification']);

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
  cancel_invoice: 'writes_books',
  gst_review_answer: 'writes_books',
  import_gstr2b: 'writes_books',
  add_reminder: 'writes_books',
  complete_reminder: 'writes_books',
  set_cash_balance: 'writes_books',
  record_filing: 'writes_books',
  set_payment_terms: 'writes_books',
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
    if (quoted) {
      if (quoted.lines[0].gstRate == null) {
        return { kind: 'reply', reply: 'I have not made the quote, because I will not guess the GST rate. Say it again with the rate, for example "quote ABC Ltd 50000 for consulting GST 18%".', tools: [] };
      }
      return { kind: 'tool', name: 'create_quote', args: { partyName: quoted.partyName, ...(quoted.partyGstin ? { partyGstin: quoted.partyGstin } : {}), lines: quoted.lines, ...(validity ? { validDays: Number(validity[1]) } : {}) } };
    }
  }
  const filed = planFilingFromChat(text);
  if (filed) return filed;
  const owed = planOweQuestion(state, text);
  if (owed) return owed;
  const payment = planPaymentFromChat(state, text);
  if (payment) return payment;
  const saidTerms = takeInvoiceTerms(text);
  const doc = parseDocument(saidTerms.text);
  const asking = isQuestion(text) || isNegated(text);
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

  if (/\breview\b.*\b(?:gst|gstr|return)\b|\b(?:gst|gstr-?[13]b?|return)\b.*\breview\b/i.test(text) && !isNegated(text)) {
    return planReview(state, text);
  }

  const cancelMatch = text.match(/\bcancel\s+(?:invoice\s+)?(INV-\d{4,})\b(?:\s*(?:because|reason|:|-)?\s*(.+))?$/i);
  if (cancelMatch && !isQuestion(text) && !/(?:do\s*not|don'?t|never)/i.test(text) && !/(?:irn|e-?invoice)/i.test(text)) {
    const reason = String(cancelMatch[2] || '').trim();
    return { kind: 'tool', name: 'cancel_invoice', args: { invoiceId: cancelMatch[1].toUpperCase(), date: receiptDate(text, localToday()), ...(reason ? { reason: reason.slice(0, 200) } : {}) } };
  }
  const creditMatch = text.match(/\bcredit\s+note\b.*?\b(INV-\d{4,})\b/i);
  if (creditMatch && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
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

  const mockIrnId = text.match(/\b(INV-\d+)\b/i);
  if (mockIrnId && /\bmock\s*(irn|einvoice|e-invoice)\b/i.test(text)) {
    return { kind: 'tool', name: 'govt_nic_mock', args: { invoiceId: mockIrnId[1].toUpperCase() } };
  }

  const irnId = text.match(/\b(INV-\d+)\b/i);
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
    return {
      kind: 'tool',
      name: 'record_receipt',
      args: { invoiceId, mode: /cash/i.test(text) ? 'cash' : 'bank', date: receiptDate(text, localToday()), ...(amount == null ? {} : { amount }) },
    };
  }

  const expense = planExpenseFromChat(state, text);
  if (expense) return expense;
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
    const xml = state.pendingFile?.content || state.files.tallyXml;
    if (!xml) return { kind: 'reply', reply: 'Attach a Tally XML file first (dropdown: Tally XML).', tools: [] };
    return { kind: 'tool', name: 'import_tally_xml', args: { xml, fileName: state.pendingFile?.name || 'tally.xml' }, clearsPendingFile: true };
  }
  if (/\bimport tally\b|\btally day/i.test(text)) {
    const csv = state.pendingFile?.content || state.files.tally;
    if (!csv) return { kind: 'reply', reply: 'Attach a Tally Day Book CSV first (dropdown: Tally Day Book).', tools: [] };
    return { kind: 'tool', name: 'import_tally', args: { csv, fileName: state.pendingFile?.name || 'tally.csv' }, clearsPendingFile: true };
  }
  if (/\bimport zoho\b|\bzoho books\b/i.test(text)) {
    const csv = state.pendingFile?.content || state.files.zoho;
    if (!csv) return { kind: 'reply', reply: 'Attach a Zoho Books invoice CSV first.', tools: [] };
    return { kind: 'tool', name: 'import_zoho', args: { csv }, clearsPendingFile: true };
  }
  if (/\bimport bank\b|\bbank statement\b/i.test(text)) {
    const content = state.pendingFile?.content || state.files.bank;
    if (!content) return { kind: 'reply', reply: 'Attach a bank CSV or TXT first.', tools: [] };
    return { kind: 'tool', name: 'import_bank', args: { content, type: /\.txt$/i.test(state.pendingFile?.name || '') ? 'text' : 'csv' }, clearsPendingFile: true };
  }

  for (const route of ROUTES) {
    if (route.re.test(text)) return { kind: 'tool', name: route.tool, args: {} };
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
