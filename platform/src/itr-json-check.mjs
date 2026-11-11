import { loadItrForm, searchItrKnowledge } from './itr-knowledge.mjs';

const MAX_ERRORS = 200;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((type) => type === actual || (type === 'number' && actual === 'integer'));
}

const patternCache = new Map();
function patternOf(source) {
  if (!patternCache.has(source)) {
    try {
      patternCache.set(source, new RegExp(source, 'u'));
    } catch {
      try {
        patternCache.set(source, new RegExp(source));
      } catch {
        patternCache.set(source, null);
      }
    }
  }
  return patternCache.get(source);
}

export function validateAgainstSchema(schema, data) {
  const defs = schema.definitions || {};
  const errors = [];
  let truncated = false;
  const push = (path, code, message, extra = {}) => {
    if (errors.length >= MAX_ERRORS) {
      truncated = true;
      return;
    }
    errors.push({ path: path || '(root)', code, message, ...extra });
  };
  const resolve = (node) => {
    let current = node;
    let guard = 0;
    while (current && current.$ref && guard < 32) {
      const name = current.$ref.replace(/^#\/definitions\//, '');
      const target = defs[name];
      if (!target) return { ...current, $ref: undefined, __missing: name };
      const { $ref, ...rest } = current;
      current = { ...target, ...rest };
      guard += 1;
    }
    return current || {};
  };
  const visit = (node, value, path) => {
    if (truncated) return;
    const rule = resolve(node);
    if (rule.__missing) push(path, 'SCHEMA_REF_MISSING', `Schema definition ${rule.__missing} is missing.`);
    for (const part of rule.allOf || []) visit(part, value, path);
    if (rule.type && !typeMatches(rule.type, value)) {
      push(path, 'TYPE', `Expected ${[].concat(rule.type).join(' or ')}, found ${typeOf(value)}.`, { expected: rule.type, found: typeOf(value) });
      return;
    }
    if (rule.enum && !rule.enum.some((option) => option === value)) push(path, 'ENUM', `Value ${JSON.stringify(value)} is not one of the allowed values.`, { allowed: rule.enum.slice(0, 40) });
    if (typeof value === 'string') {
      if (rule.minLength !== undefined && [...value].length < rule.minLength) push(path, 'MIN_LENGTH', `Needs at least ${rule.minLength} characters.`);
      if (rule.maxLength !== undefined && [...value].length > rule.maxLength) push(path, 'MAX_LENGTH', `Allows at most ${rule.maxLength} characters.`);
      if (rule.pattern) {
        const pattern = patternOf(rule.pattern);
        if (pattern && !pattern.test(value)) push(path, 'PATTERN', `Value ${JSON.stringify(value)} does not match the required format.`, { pattern: rule.pattern });
      }
    }
    if (typeof value === 'number') {
      if (rule.minimum !== undefined && (rule.exclusiveMinimum === true ? value <= rule.minimum : value < rule.minimum)) push(path, 'MINIMUM', `Must be ${rule.exclusiveMinimum === true ? 'more than' : 'at least'} ${rule.minimum}.`);
      if (rule.maximum !== undefined && (rule.exclusiveMaximum === true ? value >= rule.maximum : value > rule.maximum)) push(path, 'MAXIMUM', `Must be ${rule.exclusiveMaximum === true ? 'less than' : 'at most'} ${rule.maximum}.`);
      if (rule.multipleOf && Math.abs(value / rule.multipleOf - Math.round(value / rule.multipleOf)) > 1e-9) push(path, 'MULTIPLE_OF', `Must be a multiple of ${rule.multipleOf}.`);
    }
    if (Array.isArray(value)) {
      if (rule.minItems !== undefined && value.length < rule.minItems) push(path, 'MIN_ITEMS', `Needs at least ${rule.minItems} entries.`);
      if (rule.maxItems !== undefined && value.length > rule.maxItems) push(path, 'MAX_ITEMS', `Allows at most ${rule.maxItems} entries.`);
      if (rule.items) value.forEach((item, i) => visit(rule.items, item, `${path}[${i}]`));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const props = rule.properties || {};
      for (const name of rule.required || []) if (!(name in value)) push(path ? `${path}.${name}` : name, 'REQUIRED', 'Required field is missing.');
      for (const [name, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${name}` : name;
        if (props[name]) visit(props[name], child, childPath);
        else if (rule.additionalProperties === false) push(childPath, 'NOT_ALLOWED', 'Field is not in the schema for this form.');
        else if (rule.additionalProperties && typeof rule.additionalProperties === 'object') visit(rule.additionalProperties, child, childPath);
      }
    }
  };
  visit({ type: 'object', properties: schema.properties, required: schema.required, additionalProperties: schema.additionalProperties }, data, '');
  return { errors, truncated };
}

function parseInput(args) {
  const raw = args.json ?? args.itr;
  if (raw === undefined || raw === null || raw === '') return fail('ITR_JSON_REQUIRED', { hint: 'Pass the return JSON as it was generated for upload.' });
  if (typeof raw === 'object') return { ok: true, data: raw };
  const text = String(raw);
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) return fail('ITR_JSON_TOO_LARGE');
  try {
    return { ok: true, data: JSON.parse(text.replace(/^﻿/, '')) };
  } catch (error) {
    return fail('ITR_JSON_UNREADABLE', { hint: String(error.message || error).slice(0, 200) });
  }
}

function formOf(data) {
  const body = data?.ITR;
  if (!body || typeof body !== 'object') return null;
  const key = Object.keys(body).find((name) => /^ITR[1-7]$/.test(name));
  return key ? `ITR-${key.slice(3)}` : null;
}

function ruleHintsFor(form, errors) {
  const hints = [];
  const seen = new Set();
  for (const error of errors.slice(0, 12)) {
    const leaf = error.path.replace(/\[\d+\]/g, '').split('.').filter(Boolean).slice(-2).join(' ');
    if (!leaf || seen.has(leaf)) continue;
    seen.add(leaf);
    const hit = searchItrKnowledge(leaf, { form, kind: 'rule', limit: 1 })[0];
    if (hit && hit.score >= 8) hints.push({ path: error.path, rule: hit.ref, text: hit.text });
  }
  return hints;
}

export function checkItrJson(state, args = {}) {
  const parsed = parseInput(args);
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  const form = formOf(data);
  if (!form) return fail('ITR_FORM_NOT_FOUND', { hint: 'The JSON must start with {"ITR": {"ITR1": ...}} (or ITR2 to ITR6).' });
  if (args.form && String(args.form).replace(/\s|-/g, '').toUpperCase() !== form.replace('-', '')) return fail('ITR_FORM_MISMATCH', { found: form, asked: String(args.form) });
  const schema = loadItrForm(form, 'schema');
  if (!schema) return fail('ITR_SCHEMA_MISSING', { form, hint: 'MyCA holds schemas for ITR-1 to ITR-6.' });
  const { errors, truncated } = validateAgainstSchema(schema, data);
  const body = data.ITR[`ITR${form.slice(4)}`] || {};
  const meta = body[`Form_ITR${form.slice(4)}`] || {};
  const notes = [];
  if (meta.AssessmentYear && meta.AssessmentYear !== '2025') notes.push(`The return is for assessment year ${meta.AssessmentYear}; MyCA holds the AY 2025-26 schema, so differences may be from a newer or older schema.`);
  const counts = {};
  for (const error of errors) counts[error.code] = (counts[error.code] || 0) + 1;
  const rulesDoc = loadItrForm(form, 'rules');
  const reminders = (rulesDoc?.rules || []).filter((rule) => rule.category !== 'A').map((rule) => ({ id: rule.id, category: rule.category, text: rule.text }));
  return {
    ok: true,
    data: {
      form,
      assessmentYear: meta.AssessmentYear || '',
      schemaVersion: meta.SchemaVer || '',
      valid: errors.length === 0,
      errors,
      truncated,
      counts,
      ruleHints: ruleHintsFor(form, errors),
      remindersBAndD: reminders,
      notes,
      checked: 'Structure, required fields, types, allowed values, formats and limits from the CBDT schema. The portal also runs the validation rules (Category A blocks the upload); MyCA does not run those arithmetic rules yet.',
    },
  };
}

export function checkItrJsonWords(data) {
  const head = data.valid
    ? `This ${data.form} JSON matches the official schema${data.assessmentYear ? ` (AY ${data.assessmentYear})` : ''}: no structural errors.`
    : `This ${data.form} JSON has ${data.errors.length}${data.truncated ? '+' : ''} schema ${data.errors.length === 1 ? 'error' : 'errors'}; the portal will reject it until they are fixed.`;
  const lines = [head];
  for (const error of data.errors.slice(0, 8)) lines.push(`· ${error.path}: ${error.message}`);
  if (data.errors.length > 8) lines.push(`and ${data.errors.length - 8} more.`);
  for (const hint of data.ruleHints.slice(0, 3)) lines.push(`Related rule ${hint.rule}: ${hint.text}`);
  for (const note of data.notes) lines.push(note);
  if (data.remindersBAndD.length) lines.push(`Before filing, also check the ${data.remindersBAndD.length} Category B and D rules for ${data.form} (supporting forms such as 10E, 10BA or 67), which the portal raises after upload.`);
  lines.push(data.checked);
  return lines.join('\n');
}
