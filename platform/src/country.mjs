import { rules } from './sprint-load.mjs';
import { DEFAULT_COUNTRY, countryPack, servedPacks, toolOwner } from './countries/index.mjs';

const IDENTITY_KEYS = ['code', 'name', 'currency', 'symbol', 'locale', 'minorUnit', 'yearStartMonth', 'yearLabel', 'taxId'];

export const COUNTRIES = Object.freeze(Object.fromEntries(servedPacks().map((pack) => [pack.code, Object.freeze({ ...Object.fromEntries(IDENTITY_KEYS.map((key) => [key, pack[key]])), region: pack.residency.defaultRegion })])));

export { DEFAULT_COUNTRY, countryPack };

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
  if (info.yearStartMonth === 1) return isoDate.slice(0, 4);
  if (info.yearStartMonth === 4 && info.code === 'IN') return rules.fyOf(isoDate);
  const year = Number(isoDate.slice(0, 4));
  const start = Number(isoDate.slice(5, 7)) >= info.yearStartMonth ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function yearWords(stateOrCompany, isoDate) {
  const year = yearOf(stateOrCompany, isoDate);
  if (!year) return '';
  return countryInfo(stateOrCompany).yearStartMonth === 1 ? year : `FY ${year}`;
}

const SHARED_TOOLS = new Set([
  'company_profile', 'set_company', 'rules_status', 'run_automation', 'automation_status', 'read_document', 'chart_of_accounts', 'trial_balance', 'journal', 'period_status', 'lock_period', 'unlock_period',
  'list_invoices', 'invoice_document', 'record_receipt', 'record_payment', 'list_expenses', 'expense_heads', 'business_summary',
  'export_entries', 'export_trial_balance', 'export_xlsx', 'profit_and_loss', 'balance_sheet', 'cash_flow_statement', 'customer_statement', 'import_bank', 'books_check', 'list_reminders', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'cash_forecast', 'can_afford', 'audit_trail',
  'ask_ca', 'reply_ca', 'close_ca', 'list_ca_requests', 'list_quotes', 'quote_document', 'mark_quote', 'create_quote', 'convert_quote', 'add_recurring', 'stop_recurring', 'list_recurring', 'run_recurring', 'create_credit_note', 'close_year', 'list_year_closings', 'week_ahead',
  'list_employees', 'add_employee', 'change_salary', 'end_employment', 'set_employee_bank', 'payroll_payout_file', 'set_payment_terms', 'set_supplier_terms', 'supplier_dues', 'set_invoice_numbering', 'set_invoice_template', 'invoice_template', 'import_settlement', 'settlement_status', 'import_marketplace_orders', 'set_channel_identity', 'import_tcs_statement', 'import_26as_credits', 'marketplace_credits', 'set_sku_cost', 'import_sku_costs', 'record_stock', 'stock_position', 'stock_moves', 'value_inventory', 'inventory_valuations', 'set_channel_connector', 'channel_connectors', 'fetch_channel_report', 'sync_channels', 'push_zoho_invoices', 'save_gstr1_portal', 'file_gstr1_portal', 'generate_tds_fvu', 'portal_status', 'sku_margins', 'daily_close', 'set_registration', 'retire_registration', 'registrations', 'record_stock_transfer', 'request_documents', 'record_document_received', 'document_requests', 'eval_events', 'correct_eval', 'search_firm_notes', 'ask_knowledge', 'ask_tax', 'tax_modules', 'set_party_address', 'record_share',
  'exceptions', 'exception_decide', 'approval_list', 'approval_request', 'approval_decide',
  'list_clients', 'register_client', 'set_active_client', 'list_documents', 'upload_document', 'get_document',
  'list_debit_notes', 'list_credit_notes', 'list_payroll', 'payroll_run', 'approve_payroll', 'record_salary_payment', 'payslip', 'list_filings', 'list_outbox',
  'set_channel_connector', 'channel_connectors', 'fetch_channel_report', 'sync_channels', 'provider_doctor',
  'bank_reconciliation', 'match_bank_line', 'unmatch_bank_line', 'book_bank_charges', 'add_bank_rule', 'remove_bank_rule', 'list_bank_rules', 'run_bank_rules', 'set_bank_account', 'list_bank_accounts', 'record_transfer',
]);

let currentCountry = DEFAULT_COUNTRY;

export function setCurrentCountry(stateOrCode) {
  currentCountry = typeof stateOrCode === 'string' ? (isCountry(stateOrCode) ? stateOrCode.toUpperCase() : DEFAULT_COUNTRY) : countryOf(stateOrCode);
  return currentCountry;
}

export function formatMoneyCurrent(amount, options) {
  return formatMoney({ country: currentCountry }, amount, options);
}

const SHARED_EXTRA = new Set(['create_invoice', 'create_purchase', 'post_expense', 'set_expense_head']);

export function toolServesCountry(toolName, country) {
  const name = String(toolName || '');
  const pack = countryPack(country) || countryPack(DEFAULT_COUNTRY);
  const owner = toolOwner(name);
  if (owner) return owner === pack.code;
  if (pack.toolPolicy === 'unclaimed') return true;
  return SHARED_TOOLS.has(name) || SHARED_EXTRA.has(name);
}

export function toolsForCountry(tools, country) {
  return tools.filter((tool) => toolServesCountry(tool.name, country));
}
