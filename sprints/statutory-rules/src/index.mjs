import { fileURLToPath } from 'node:url';
import { createRuleBook } from './book.mjs';
import { loadDataRecords } from './data.mjs';
import { mergeRecords } from './overlay.mjs';
import { registeredRecords } from './registry.mjs';
import { validateRules } from './validate.mjs';

export { isIsoDate, fyOf, fyStart, fyEnd } from './dates.mjs';
export { validateRules } from './validate.mjs';
export { isVerifiedFor } from './attest.mjs';
export { createRuleBook } from './book.mjs';
export { mergeRecords } from './overlay.mjs';
export { runGolden } from './golden.mjs';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

const BUILT_IN = registeredRecords();
const FROM_FILES = loadDataRecords(DATA_DIR);
const fileProblems = validateRules(FROM_FILES);
if (!fileProblems.ok) throw new Error(`The rules data files are not valid: ${JSON.stringify(fileProblems.problems.slice(0, 5))}`);

let live = [];

function assemble(runtime) {
  if (BUILT_IN === null) return null;
  return mergeRecords(mergeRecords(BUILT_IN, FROM_FILES), runtime);
}

let REGISTRY = createRuleBook(assemble(live));

export let RULES = REGISTRY.records;

export function registryIntegrity() {
  return REGISTRY.integrity;
}

export function rule(id, onDate) {
  return REGISTRY.rule(id, onDate);
}

export function createRuleContext() {
  return REGISTRY.createRuleContext();
}

export function ruleOverlay() {
  return live.map((record) => structuredClone(record));
}

export function setRuleOverlay(records) {
  const shape = validateRules(records);
  if (!shape.ok) return { ok: false, problems: shape.problems };
  const candidate = createRuleBook(assemble(records));
  if (!candidate.integrity.ok) return { ok: false, problems: candidate.integrity.problems };
  live = records.map((record) => structuredClone(record));
  REGISTRY = candidate;
  RULES = REGISTRY.records;
  return { ok: true, records: live.length };
}
