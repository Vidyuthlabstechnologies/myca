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

function kindOf(value) {
  return value === null ? 'null' : Array.isArray(value) ? 'list' : typeof value;
}

function sameShape(base, given) {
  if (kindOf(base) !== kindOf(given)) return false;
  if (Array.isArray(base)) return base.length === 0 || given.length > 0 && given.every((entry) => sameShape(base[0], entry));
  if (kindOf(base) === 'object') return Object.keys(base).every((key) => key in given && sameShape(base[key], given[key]));
  return true;
}

function shapeProblems(records) {
  const known = new Map();
  for (const record of [...(BUILT_IN || []), ...FROM_FILES]) if (!known.has(record.id)) known.set(record.id, record.value);
  return records.filter((record) => known.has(record.id) && !sameShape(known.get(record.id), record.value)).map((record) => ({ code: 'RULE_VALUE_SHAPE', id: record.id, message: `The value of ${record.id} must have the same shape as the rule it changes` }));
}

function assess(records) {
  const shape = validateRules(records);
  if (!shape.ok) return { ok: false, problems: shape.problems };
  const wrong = shapeProblems(records);
  if (wrong.length > 0) return { ok: false, problems: wrong };
  const candidate = createRuleBook(assemble(records));
  if (!candidate.integrity.ok) return { ok: false, problems: candidate.integrity.problems };
  return { ok: true, candidate };
}

export function checkRuleOverlay(records) {
  const out = assess(records);
  return out.ok ? { ok: true } : out;
}

export function setRuleOverlay(records) {
  const out = assess(records);
  if (!out.ok) return out;
  live = records.map((record) => structuredClone(record));
  REGISTRY = out.candidate;
  RULES = REGISTRY.records;
  return { ok: true, records: live.length };
}
