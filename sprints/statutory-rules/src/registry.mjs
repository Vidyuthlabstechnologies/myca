import { RULES as GST_RULES } from './rules/gst.mjs';
import { RULES as INCOME_TAX_RULES } from './rules/income-tax.mjs';
import { RULES as TDS_RULES } from './rules/tds.mjs';
import { RULES as DUE_DATE_RULES } from './rules/due-dates.mjs';
import { RULES as AUDIT_THRESHOLD_RULES } from './rules/audit-thresholds.mjs';
import { RULES as HOLIDAY_RULES } from './rules/holidays.mjs';
import { RULES as PAYROLL_RULES } from './rules/payroll.mjs';
import { RULES as US_FEDERAL_RULES } from './rules/us-federal.mjs';
import { RULES as US_INDIVIDUAL_RULES } from './rules/us-individual.mjs';
import { RULES as US_2441_RULES } from './rules/us-individual-2441.mjs';
import { RULES as US_8962_RULES } from './rules/us-individual-8962.mjs';
import { RULES as US_SCHEDULE_E_RULES } from './rules/us-individual-schedule-e.mjs';
import { RULES as US_1040X_RULES } from './rules/us-individual-1040x.mjs';
import { RULES as US_MIP_RULES } from './rules/us-individual-mortgage-insurance.mjs';
import { RULES as US_8889_RULES } from './rules/us-individual-8889.mjs';
import { RULES as US_8880_5695_RULES } from './rules/us-individual-8880-5695.mjs';
import { RULES as US_SALES_TAX_RULES } from './rules/us-sales-tax.mjs';
import { RULES as US_STATES_RULES } from './rules/us-states.mjs';
import { RULES as MALAYSIA_RULES } from './rules/malaysia.mjs';
import { RULES as MALAYSIA_PAYROLL_RULES } from './rules/malaysia-payroll.mjs';
import { RULES as UNITED_KINGDOM_RULES } from './rules/united-kingdom.mjs';
import { RULES as UAE_RULES } from './rules/uae.mjs';
import { RULES as MSME_RULES } from './rules/msme.mjs';
import { RULES as PRESUMPTIVE_RULES } from './rules/presumptive.mjs';

export const RULE_MODULES = Object.freeze({
  'gst': GST_RULES,
  'income-tax': INCOME_TAX_RULES,
  'tds': TDS_RULES,
  'due-dates': DUE_DATE_RULES,
  'audit-thresholds': AUDIT_THRESHOLD_RULES,
  'holidays': HOLIDAY_RULES,
  'payroll': PAYROLL_RULES,
  'us-federal': US_FEDERAL_RULES,
  'us-individual': [...US_INDIVIDUAL_RULES, ...US_2441_RULES, ...US_8962_RULES, ...US_SCHEDULE_E_RULES, ...US_1040X_RULES, ...US_MIP_RULES, ...US_8889_RULES, ...US_8880_5695_RULES],
  'us-sales-tax': US_SALES_TAX_RULES,
  'us-states': US_STATES_RULES,
  'malaysia': MALAYSIA_RULES,
  'malaysia-payroll': MALAYSIA_PAYROLL_RULES,
  'msme': MSME_RULES,
  'presumptive': PRESUMPTIVE_RULES,
  'united-kingdom': UNITED_KINGDOM_RULES,
  'uae': UAE_RULES
});

export function registeredRecords() {
  const sources = Object.values(RULE_MODULES);
  return sources.every(Array.isArray) ? sources.flat() : null;
}
