import { ENGINE_TOOL_RISK } from './countries/manifests.mjs';
import { noArgs } from './tool-schema-parts.mjs';
import { TOOL_ARG_SCHEMAS } from './tool-schemas.mjs';

const ASSISTANT_BLOCKED_TOOLS = new Set(['govt_save_credentials', 'set_channel_connector', 'govt_set_public_key', 'govt_nic_cancel_irn', 'seed_demo', 'approval_decide', 'set_company', 'add_client', 'set_active_client', 'save_document', 'get_document', 'lock_period', 'unlock_period', 'send_notification', 'test_notification']);

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
  read_us_tax_document: 'read_only',
  us_return_pdf: 'read_only',
  us_taxpayer: 'read_only',
  us_return_status: 'read_only',
  list_us_tax_forms: 'read_only',
  us_interview: 'read_only',
  us_return_review: 'read_only',
  us_supported_forms: 'read_only',
  us_withholding_check: 'read_only',
  us_estimated_payments: 'read_only',
  read_irs_letter: 'read_only',
  us_form_kinds: 'read_only',
  us_tax_estimate: 'read_only',
  set_us_taxpayer: 'writes_books',
  add_us_tax_form: 'writes_books',
  remove_us_tax_form: 'writes_books',
  answer_us_interview: 'writes_books',
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
  itr_knowledge: 'read_only',
  check_itr_json: 'read_only',
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
  quicko_catalog: 'read_only',
  read_form16: 'external_government_api',
  read_form26as: 'external_government_api',
  capital_gains_pnl: 'external_government_api',
  quicko_tax_check: 'external_government_api',
  verify_pan: 'external_government_api',
  pan_aadhaar_status: 'external_government_api',
  check_206ab: 'external_government_api',
  search_tan: 'external_government_api',
  lookup_ifsc: 'external_government_api',
  verify_bank_account: 'external_government_api',
  mca_company: 'external_government_api',
  gstins_for_pan: 'external_government_api',
  approval_request: 'internal_workflow',
  exception_decide: 'internal_workflow',
  track_gst_returns: 'read_or_prepare',
  search_gstin: 'read_or_prepare',
  export_xlsx: 'read_only',
  audit_trail: 'read_only',
  ...ENGINE_TOOL_RISK,
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

export const MAX_EXACT_AMOUNT = 1e11;

function lineValue(items) {
  let total = 0;
  for (const item of items) {
    if (item && typeof item.qty === 'number' && typeof item.rate === 'number') total += Math.abs(item.qty * item.rate);
  }
  return total;
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
    if (schema.maximum == null && Math.abs(value) > MAX_EXACT_AMOUNT) return `${path} is too large`;
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
      if (lineValue(value[key]) > MAX_EXACT_AMOUNT) return `${path}.${key} is too large`;
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
