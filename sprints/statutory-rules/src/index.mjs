import { createRuleBook } from './book.mjs';
import { registeredRecords } from './registry.mjs';

export { isIsoDate, fyOf, fyStart, fyEnd } from './dates.mjs';
export { validateRules } from './validate.mjs';
export { isVerifiedFor } from './attest.mjs';
export { createRuleBook } from './book.mjs';

const REGISTRY = createRuleBook(registeredRecords());

export const RULES = REGISTRY.records;

export function registryIntegrity() {
  return REGISTRY.integrity;
}

export function rule(id, onDate) {
  return REGISTRY.rule(id, onDate);
}

export function createRuleContext() {
  return REGISTRY.createRuleContext();
}
