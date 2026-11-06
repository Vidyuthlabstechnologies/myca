import { rules } from './sprint-load.mjs';

export const COUNTRIES = Object.freeze({
  IN: Object.freeze({ code: 'IN', name: 'India', currency: 'INR', symbol: '₹', locale: 'en-IN', minorUnit: 'paise', yearStartMonth: 4, yearLabel: 'financial year', taxId: 'GSTIN', region: 'asia-south1' }),
  US: Object.freeze({ code: 'US', name: 'United States', currency: 'USD', symbol: '$', locale: 'en-US', minorUnit: 'cents', yearStartMonth: 1, yearLabel: 'calendar year', taxId: 'EIN', region: 'us-central1' }),
});

export const DEFAULT_COUNTRY = 'IN';

export function countryOf(stateOrCompany) {
  const company = stateOrCompany && stateOrCompany.company ? stateOrCompany.company : stateOrCompany;
  const code = String(company?.country || DEFAULT_COUNTRY).toUpperCase();
  return COUNTRIES[code] ? code : DEFAULT_COUNTRY;
}

export function countryInfo(stateOrCompany) {
  return COUNTRIES[countryOf(stateOrCompany)];
}

export function isCountry(value) {
  return Object.hasOwn(COUNTRIES, String(value || '').toUpperCase());
}

export function formatMoney(stateOrCompany, amount, { fractionDigits = 2 } = {}) {
  const info = countryInfo(stateOrCompany);
  return new Intl.NumberFormat(info.locale, { style: 'currency', currency: info.currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(Number(amount) || 0);
}

export function yearOf(stateOrCompany, isoDate) {
  const info = countryInfo(stateOrCompany);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return null;
  if (info.yearStartMonth === 4) return rules.fyOf(isoDate);
  return isoDate.slice(0, 4);
}

export function yearWords(stateOrCompany, isoDate) {
  const year = yearOf(stateOrCompany, isoDate);
  if (!year) return '';
  return countryInfo(stateOrCompany).yearStartMonth === 4 ? `FY ${year}` : year;
}

const SHARED_TOOLS = new Set([
  'company_profile', 'set_company', 'rules_status', 'run_automation', 'automation_status', 'read_document', 'chart_of_accounts', 'trial_balance', 'journal', 'period_status', 'lock_period', 'unlock_period',
  'list_invoices', 'invoice_document', 'record_receipt', 'record_payment', 'list_expenses', 'expense_heads', 'business_summary',
  'export_entries', 'export_trial_balance', 'profit_and_loss', 'balance_sheet', 'cash_flow_statement', 'customer_statement', 'import_bank', 'books_check', 'list_reminders', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'cash_forecast', 'can_afford',
  'ask_ca', 'reply_ca', 'close_ca', 'list_ca_requests', 'list_quotes', 'quote_document', 'mark_quote', 'create_quote', 'convert_quote', 'create_credit_note', 'close_year', 'list_year_closings', 'week_ahead',
  'list_employees', 'add_employee', 'change_salary', 'end_employment', 'set_employee_bank', 'payroll_payout_file', 'set_payment_terms', 'set_supplier_terms', 'supplier_dues', 'set_invoice_numbering', 'set_invoice_template', 'invoice_template', 'import_settlement', 'settlement_status', 'import_marketplace_orders', 'set_channel_identity', 'import_tcs_statement', 'import_26as_credits', 'marketplace_credits', 'set_sku_cost', 'import_sku_costs', 'record_stock', 'stock_position', 'stock_moves', 'value_inventory', 'inventory_valuations', 'set_channel_connector', 'channel_connectors', 'fetch_channel_report', 'sync_channels', 'push_zoho_invoices', 'save_gstr1_portal', 'file_gstr1_portal', 'generate_tds_fvu', 'portal_status', 'sku_margins', 'daily_close', 'set_registration', 'retire_registration', 'registrations', 'record_stock_transfer', 'request_documents', 'record_document_received', 'document_requests', 'eval_events', 'correct_eval', 'search_firm_notes', 'ask_knowledge', 'set_party_address', 'record_share',
  'exceptions', 'exception_decide', 'approval_list', 'approval_request', 'approval_decide',
  'list_clients', 'register_client', 'set_active_client', 'list_documents', 'upload_document', 'get_document',
  'list_debit_notes', 'list_credit_notes', 'list_payroll', 'payroll_run', 'approve_payroll', 'record_salary_payment', 'payslip', 'list_filings', 'list_outbox',
  'set_channel_connector', 'channel_connectors', 'fetch_channel_report', 'sync_channels', 'provider_doctor',
]);

let currentCountry = DEFAULT_COUNTRY;

export function setCurrentCountry(stateOrCode) {
  currentCountry = typeof stateOrCode === 'string' ? (isCountry(stateOrCode) ? stateOrCode.toUpperCase() : DEFAULT_COUNTRY) : countryOf(stateOrCode);
  return currentCountry;
}

export function formatMoneyCurrent(amount, options) {
  return formatMoney({ country: currentCountry }, amount, options);
}

const US_ONLY_TOOLS = new Set(['import_payroll_summary', 'list_payroll_imports', 'us_connectors', 'plaid_link_sandbox', 'plaid_link_token', 'plaid_exchange', 'track1099_csv', 'track1099_issuers', 'track1099_import', 'track1099_job', 'taxjar_rate', 'gusto_connect_url', 'gusto_callback', 'set_sales_tax_rate', 'list_sales_tax_rates', 'set_contractor', 'contractor_payments', 'set_sales_tax_nexus', 'list_sales_tax_nexus', 'sales_tax_return', 'sales_tax_review', 'sales_tax_review_answer', 'record_sales_tax_payment', 'record_sales_tax_filing', 'sales_tax_overview', 'set_withholding', 'us_payroll_filings', 'schedule_c_summary', 'estimated_tax_dates', 'import_us_invoices', 'contractor_1099_file', 'set_suta_rate', 'list_suta_rates', 'schedule_se', 'schedule_c_document', 'cpa_pack', 'payroll_941_file', 'payroll_w2_file']);

export function toolServesCountry(toolName, country) {
  const name = String(toolName || '');
  if (country === 'IN') return !US_ONLY_TOOLS.has(name);
  return SHARED_TOOLS.has(name) || US_ONLY_TOOLS.has(name) || name === 'create_invoice' || name === 'create_purchase' || name === 'post_expense' || name === 'set_expense_head';
}

export function toolsForCountry(tools, country) {
  return tools.filter((tool) => toolServesCountry(tool.name, country));
}
