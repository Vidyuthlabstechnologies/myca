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
  'company_profile', 'set_company', 'rules_status', 'chart_of_accounts', 'trial_balance', 'journal', 'period_status', 'lock_period', 'unlock_period',
  'list_invoices', 'invoice_document', 'record_receipt', 'record_payment', 'list_expenses', 'expense_heads', 'business_summary',
  'export_entries', 'books_check', 'list_reminders', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'cash_forecast', 'can_afford',
  'ask_ca', 'reply_ca', 'close_ca', 'list_ca_requests', 'list_quotes', 'quote_document', 'mark_quote',
  'list_employees', 'add_employee', 'change_salary', 'end_employment', 'set_payment_terms', 'set_party_address', 'record_share',
  'exceptions', 'exception_decide', 'approval_list', 'approval_request', 'approval_decide',
  'list_clients', 'register_client', 'set_active_client', 'list_documents', 'upload_document', 'get_document',
  'list_debit_notes', 'list_credit_notes', 'list_payroll', 'list_filings', 'list_outbox',
]);

let currentCountry = DEFAULT_COUNTRY;

export function setCurrentCountry(stateOrCode) {
  currentCountry = typeof stateOrCode === 'string' ? (isCountry(stateOrCode) ? stateOrCode.toUpperCase() : DEFAULT_COUNTRY) : countryOf(stateOrCode);
  return currentCountry;
}

export function formatMoneyCurrent(amount, options) {
  return formatMoney({ country: currentCountry }, amount, options);
}

const US_ONLY_TOOLS = new Set(['set_sales_tax_rate', 'list_sales_tax_rates', 'set_contractor', 'contractor_payments', 'set_sales_tax_nexus', 'list_sales_tax_nexus', 'sales_tax_return', 'sales_tax_review', 'sales_tax_review_answer', 'record_sales_tax_payment', 'record_sales_tax_filing', 'sales_tax_overview']);

export function toolServesCountry(toolName, country) {
  const name = String(toolName || '');
  if (country === 'IN') return !US_ONLY_TOOLS.has(name);
  return SHARED_TOOLS.has(name) || US_ONLY_TOOLS.has(name) || name === 'create_invoice' || name === 'create_purchase' || name === 'post_expense' || name === 'set_expense_head';
}

export function toolsForCountry(tools, country) {
  return tools.filter((tool) => toolServesCountry(tool.name, country));
}
