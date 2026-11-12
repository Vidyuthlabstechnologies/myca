import { ENGINE_ARG_SCHEMAS } from './countries/manifests.mjs';
import { US_TOOL_SCHEMAS } from './tool-schemas-us.mjs';
import { TAX_TOOL_SCHEMAS } from './tool-schemas-tax.mjs';
import { SALES_PURCHASE_TOOL_SCHEMAS } from './tool-schemas-sales-purchases.mjs';
import { BOOKS_TOOL_SCHEMAS } from './tool-schemas-books.mjs';

export const TOOL_ARG_SCHEMAS = {
  ...US_TOOL_SCHEMAS,
  ...TAX_TOOL_SCHEMAS,
  ...SALES_PURCHASE_TOOL_SCHEMAS,
  ...BOOKS_TOOL_SCHEMAS,
  ...ENGINE_ARG_SCHEMAS,
};
