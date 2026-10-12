export const REMOTE_QUERY_TOOLS = new Set([
  'company_profile',
  'list_invoices',
  'invoice_document',
  'record_share',
  'eway_bill_status',
  'list_expenses',
  'list_credit_notes',
  'business_summary',
  'gst_review',
  'export_entries',
  'export_tally',
  'credit_at_risk',
  'books_check',
  'list_reminders',
  'list_filings',
  'supplier_reminder_draft',
  'list_employees',
  'list_sales_tax_rates',
  'contractor_payments',
  'list_sales_tax_nexus',
  'sales_tax_return',
  'sales_tax_review',
  'sales_tax_overview',
  'payroll_run',
  'list_payroll',
  'payslip',
  'tds_summary',
  'tds_return',
  'pf_ecr',
  'esi_return',
  'tds_review',
  'cash_forecast',
  'can_afford',
  'list_ca_requests',
  'list_quotes',
  'quote_document',
  'expense_heads',
  'gst_payable',
  'gst_period_summary',
  'export_gstr1_json',
  'deadlines',
  'exceptions',
  'trial_balance',
  'period_status',
  'validate_gstin',
]);

export const COMPANY_PROFILE_FIELDS = ['name', 'gstin', 'pan', 'state', 'address', 'city', 'pin', 'entityType'];

export function isRemoteQuery(name) {
  return REMOTE_QUERY_TOOLS.has(String(name));
}

export function companyProfilePatch(fields = {}) {
  const patch = {};
  for (const key of COMPANY_PROFILE_FIELDS) {
    if (Object.hasOwn(fields || {}, key) && fields[key] != null) patch[key] = fields[key];
  }
  return patch;
}
