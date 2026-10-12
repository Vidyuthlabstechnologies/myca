import { RULES as GST_RULES } from './rules/gst.mjs';
import { RULES as INCOME_TAX_RULES } from './rules/income-tax.mjs';
import { RULES as TDS_RULES } from './rules/tds.mjs';
import { RULES as DUE_DATE_RULES } from './rules/due-dates.mjs';
import { RULES as AUDIT_THRESHOLD_RULES } from './rules/audit-thresholds.mjs';
import { RULES as HOLIDAY_RULES } from './rules/holidays.mjs';
import { RULES as PAYROLL_RULES } from './rules/payroll.mjs';
import { RULES as US_FEDERAL_RULES } from './rules/us-federal.mjs';
import { RULES as US_SALES_TAX_RULES } from './rules/us-sales-tax.mjs';

export const RULE_MODULES = Object.freeze({
  'gst': GST_RULES,
  'income-tax': INCOME_TAX_RULES,
  'tds': TDS_RULES,
  'due-dates': DUE_DATE_RULES,
  'audit-thresholds': AUDIT_THRESHOLD_RULES,
  'holidays': HOLIDAY_RULES,
  'payroll': PAYROLL_RULES,
  'us-federal': US_FEDERAL_RULES,
  'us-sales-tax': US_SALES_TAX_RULES
});

export function registeredRecords() {
  const sources = Object.values(RULE_MODULES);
  return sources.every(Array.isArray) ? sources.flat() : null;
}
