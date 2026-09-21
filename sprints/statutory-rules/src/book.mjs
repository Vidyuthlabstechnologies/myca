import { isIsoDate } from './dates.mjs';
import { isRuleId, validateRules } from './validate.mjs';
import { isVerifiedFor } from './attest.mjs';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function byEffectiveFrom(left, right) {
  if (left.effectiveFrom < right.effectiveFrom) return -1;
  return left.effectiveFrom > right.effectiveFrom ? 1 : 0;
}

export function createRuleBook(records) {
  const integrity = validateRules(records);
  const wholeBookInvalid = integrity.problems.some((problem) => !isRuleId(problem.id));
  const taintedIds = new Set(integrity.problems.filter((problem) => isRuleId(problem.id)).map((problem) => problem.id));
  const cleanRecords = wholeBookInvalid ? [] : records.filter((record) => !taintedIds.has(record.id)).map((record) => deepFreeze(structuredClone(record)));
  const versionsById = new Map();
  for (const record of cleanRecords) {
    if (!versionsById.has(record.id)) versionsById.set(record.id, []);
    versionsById.get(record.id).push(record);
  }
  for (const versions of versionsById.values()) versions.sort(byEffectiveFrom);

  function rule(id, onDate) {
    if (wholeBookInvalid || (typeof id === 'string' && taintedIds.has(id))) return { ok: false, error: 'RULE_REGISTRY_INVALID', id };
    const versions = typeof id === 'string' ? versionsById.get(id) : undefined;
    if (!versions) return { ok: false, error: 'RULE_UNKNOWN' };
    if (!isIsoDate(onDate)) return { ok: false, error: 'RULE_DATE_INVALID', id, onDate };
    const record = versions.find((version) => version.effectiveFrom <= onDate && (version.effectiveTo === null || onDate <= version.effectiveTo));
    if (!record) return { ok: false, error: 'RULE_NOT_IN_FORCE', id, onDate };
    return { ok: true, value: record.value, record };
  }

  function createRuleContext() {
    const used = new Map();
    function contextRule(id, onDate) {
      const result = rule(id, onDate);
      if (result.ok) used.set(`${result.record.id}@${result.record.effectiveFrom}`, result.record);
      return result;
    }
    function rulesUsed() {
      return [...used.keys()].sort();
    }
    function unverifiedRules(firmId) {
      return [...used.entries()].filter(([, record]) => !isVerifiedFor(record, firmId)).map(([key]) => key).sort();
    }
    return Object.freeze({ rule: contextRule, rulesUsed, unverifiedRules });
  }

  return Object.freeze({
    rule,
    createRuleContext,
    records: Object.freeze(cleanRecords),
    integrity: deepFreeze(integrity)
  });
}
