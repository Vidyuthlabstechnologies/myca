import { isIsoDate, nextDay } from './dates.mjs';

const RECORD_FIELDS = new Set(['id', 'value', 'basis', 'effectiveFrom', 'effectiveTo', 'act', 'section', 'source', 'attestations']);
const ATTESTATION_FIELDS = new Set(['by', 'role', 'firmId', 'on', 'verdict']);
const RULE_ID = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

export function isRuleId(value) {
  return typeof value === 'string' && RULE_ID.test(value);
}

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isPlainData(value, ancestors = new Set()) {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  ancestors.add(value);
  let valid;
  if (Array.isArray(value)) {
    valid = Object.getPrototypeOf(value) === Array.prototype && Object.keys(value).length === value.length;
    for (let index = 0; valid && index < value.length; index += 1) valid = isPlainData(value[index], ancestors);
  } else {
    valid = isPlainObject(value) && Object.keys(value).every((key) => isPlainData(value[key], ancestors));
  }
  ancestors.delete(value);
  return valid;
}

function isValidAttestation(attestation) {
  if (!isPlainObject(attestation)) return false;
  if (Object.keys(attestation).some((key) => !ATTESTATION_FIELDS.has(key))) return false;
  if (!isNonEmptyText(attestation.by) || !isIsoDate(attestation.on)) return false;
  if (attestation.verdict !== 'verified' && attestation.verdict !== 'disputed') return false;
  if (attestation.role === 'advisor') return attestation.firmId === null;
  if (attestation.role === 'firm') return isNonEmptyText(attestation.firmId);
  return false;
}

function recordProblems(record, index) {
  if (!isPlainObject(record)) return [{ code: 'RECORD_NOT_OBJECT', index }];
  const where = typeof record.id === 'string' ? { index, id: record.id } : { index };
  const problems = [];
  const add = (code, extra = {}) => problems.push({ code, ...where, ...extra });
  for (const field of Object.keys(record)) if (!RECORD_FIELDS.has(field)) add('RECORD_UNKNOWN_FIELD', { field });
  if (!isRuleId(record.id)) add('RECORD_ID_INVALID');
  if (!('value' in record) || !isPlainData(record.value)) add('RECORD_VALUE_INVALID');
  if ('basis' in record && !isNonEmptyText(record.basis)) add('RECORD_BASIS_INVALID');
  const fromValid = isIsoDate(record.effectiveFrom);
  const toValid = record.effectiveTo === null || isIsoDate(record.effectiveTo);
  if (!fromValid) add('RECORD_EFFECTIVE_FROM_INVALID');
  if (!toValid) add('RECORD_EFFECTIVE_TO_INVALID');
  if (fromValid && toValid && record.effectiveTo !== null && record.effectiveTo < record.effectiveFrom) add('RECORD_RANGE_INVERTED');
  if (!isNonEmptyText(record.act)) add('RECORD_ACT_INVALID');
  if (typeof record.section !== 'string') add('RECORD_SECTION_INVALID');
  if (!isNonEmptyText(record.source)) add('RECORD_SOURCE_INVALID');
  if (!Array.isArray(record.attestations)) add('RECORD_ATTESTATIONS_INVALID');
  else record.attestations.forEach((attestation, position) => {
    if (!isValidAttestation(attestation)) add('ATTESTATION_INVALID', { attestation: position });
  });
  return problems;
}

function hasUsableRange(record) {
  return isPlainObject(record)
    && isRuleId(record.id)
    && isIsoDate(record.effectiveFrom)
    && (record.effectiveTo === null || (isIsoDate(record.effectiveTo) && record.effectiveTo >= record.effectiveFrom));
}

function versionProblems(id, versions) {
  const ordered = [...versions].sort((left, right) => (left.effectiveFrom < right.effectiveFrom ? -1 : left.effectiveFrom > right.effectiveFrom ? 1 : 0));
  const problems = [];
  let reach = ordered[0];
  for (const current of ordered.slice(1)) {
    if (current.effectiveFrom === reach.effectiveFrom) {
      problems.push({ code: 'RULE_DUPLICATE_VERSION', id, effectiveFrom: current.effectiveFrom });
    } else if (reach.effectiveTo === null || reach.effectiveTo >= current.effectiveFrom) {
      problems.push({ code: 'RULE_OVERLAP', id, effectiveFrom: current.effectiveFrom, previousEffectiveFrom: reach.effectiveFrom, previousEffectiveTo: reach.effectiveTo });
    } else if (nextDay(reach.effectiveTo) !== current.effectiveFrom) {
      problems.push({ code: 'RULE_GAP', id, effectiveFrom: current.effectiveFrom, previousEffectiveTo: reach.effectiveTo });
    }
    if (reach.effectiveTo !== null && (current.effectiveTo === null || current.effectiveTo > reach.effectiveTo)) reach = current;
  }
  return problems;
}

export function validateRules(records) {
  if (!Array.isArray(records)) return { ok: false, problems: [{ code: 'RULES_NOT_ARRAY' }] };
  const problems = records.flatMap((record, index) => recordProblems(record, index));
  const byId = new Map();
  for (const record of records) {
    if (!hasUsableRange(record)) continue;
    if (!byId.has(record.id)) byId.set(record.id, []);
    byId.get(record.id).push(record);
  }
  for (const id of [...byId.keys()].sort()) problems.push(...versionProblems(id, byId.get(id)));
  return { ok: problems.length === 0, problems };
}
