import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensOf } from './tax-modules.mjs';

export const ITR_KNOWLEDGE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'itr-knowledge');
export const ITR_FORMS = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6'];
const KINDS = new Set(['guide', 'rule', 'cross-check', 'field', 'schedule', 'dropdown']);
const MAX_LIMIT = 20;
const FORM_WORDS = /\b(?:itr|form)\s*[-‐–]?\s*([1-7])\b|\b(sahaj|sugam)\b/gi;
const RULE_REF = /\b(?:rule|r\.?|sl\.?\s*no\.?)\s*(?:no\.?\s*)?([abd](?:\/d)?)?\s*[-‐–]?\s*(\d{1,4})\b|\b([abd])\s*[-‐–]\s*(\d{1,4})\b/gi;

let cache = null;
const formCache = new Map();

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stem(word) {
  return word.length > 4 ? word.replace(/(?:ing|es|s)$/, '') : word;
}

function words(text) {
  return tokensOf(String(text || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ')).map(stem);
}

export function formLabel(value) {
  const text = String(value || '').trim();
  const match = /^(?:itr)?\s*[-‐–]?\s*([1-7])$/i.exec(text) || /^itr\s*[-‐–]?\s*([1-7])$/i.exec(text);
  if (match) return `ITR-${match[1]}`;
  if (/^sahaj$/i.test(text)) return 'ITR-1';
  if (/^sugam$/i.test(text)) return 'ITR-4';
  return null;
}

function formsIn(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(FORM_WORDS)) {
    if (match[1]) found.add(`ITR-${match[1]}`);
    else found.add(match[2].toLowerCase() === 'sahaj' ? 'ITR-1' : 'ITR-4');
  }
  return [...found];
}

function rulesIn(text) {
  const found = [];
  for (const match of String(text || '').matchAll(RULE_REF)) {
    const category = (match[1] || match[3] || '').toUpperCase().replace('/', '');
    const no = Number(match[2] || match[4]);
    if (no) found.push({ category, no });
  }
  return found;
}

function folderOf(form) {
  return join(ITR_KNOWLEDGE_DIR, 'forms', form.toLowerCase());
}

export function loadItrForm(form, part) {
  const key = `${form}/${part}`;
  if (!formCache.has(key)) {
    const file = join(folderOf(form), `${part}.json`);
    formCache.set(key, existsSync(file) ? readJson(file) : null);
  }
  return formCache.get(key);
}

function frontmatter(text) {
  const source = text.replace(/\r\n/g, '\n');
  if (!source.startsWith('---\n')) return { fields: {}, body: source };
  const end = source.indexOf('\n---\n', 4);
  const fields = {};
  for (const line of source.slice(4, end).split('\n')) {
    const match = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return { fields, body: source.slice(end + 5) };
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function loadGuides() {
  const dir = join(ITR_KNOWLEDGE_DIR, 'docs');
  const items = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
    const { fields, body } = frontmatter(readFileSync(join(dir, file), 'utf8'));
    const doc = fields.id || file.replace(/\.md$/, '');
    const chunks = body.split(/^## /m);
    const head = chunks.shift().replace(/^# .*\n/, '').trim();
    const forms = formsIn(fields['applies-to'] || '');
    if (head) items.push({ kind: 'guide', ref: `${doc}`, doc, title: fields.title || doc, text: head, source: fields.source || '', forms });
    for (const chunk of chunks) {
      const [heading, ...rest] = chunk.split('\n');
      items.push({ kind: 'guide', ref: `${doc}#${slug(heading)}`, doc, title: `${fields.title || doc}: ${heading.trim()}`, text: rest.join('\n').trim(), source: fields.source || '', forms });
    }
  }
  return items;
}

function sourceTitle(id) {
  return catalog().sources.find((item) => item.id === id)?.title || id;
}

export function catalog() {
  if (!cache) cache = { sources: readJson(join(ITR_KNOWLEDGE_DIR, 'sources.json')).sources, index: null };
  return cache;
}

function ruleItem(form, rulesDoc, rule) {
  return {
    kind: 'rule',
    form,
    ref: rule.id,
    id: rule.id,
    category: rule.category,
    no: rule.no,
    schedule: rule.schedule || '',
    title: `${form} validation rule ${rule.category}-${rule.no}${rule.schedule ? ` (${rule.schedule})` : ''}`,
    text: rule.text,
    action: rulesDoc.categories[rule.category] || '',
    source: `${rulesDoc.title}${rule.page ? `, page ${rule.page}` : ''}`,
    sourceId: rulesDoc.source,
    page: rule.page || null,
  };
}

function fieldItem(form, fieldsDoc, field) {
  const bits = [field.description, field.enum ? `Allowed: ${field.enum.join(', ')}` : '', field.pattern ? `Pattern ${field.pattern}` : '', field.maxLength ? `Max length ${field.maxLength}` : '', field.maximum !== undefined && field.maximum < 99999999999999 ? `Maximum ${field.maximum}` : ''].filter(Boolean);
  return {
    kind: 'field',
    form,
    ref: `${form}:${field.path}`,
    path: field.path,
    title: `${form} field ${field.path.replace(/^ITR\.ITR\d\./, '')}`,
    text: `${field.type}${field.required ? ', required' : ''}. ${bits.join('. ')}`.trim(),
    field,
    source: sourceTitle(fieldsDoc.source),
    sourceId: fieldsDoc.source,
  };
}

function guideFieldItem(form, guide, entry) {
  return {
    kind: 'field',
    form,
    ref: `${form}:guide:${entry.paths[0]}`,
    path: entry.paths[0],
    paths: entry.paths,
    title: `${form} field guide: ${entry.paths.join(', ')}`,
    text: [entry.description, entry.primarySource && `Primary source: ${entry.primarySource}`, entry.validationSource && `Validated against: ${entry.validationSource}`, entry.conflictTrigger && entry.conflictTrigger !== '—' && `Conflict trigger: ${entry.conflictTrigger}`].filter(Boolean).join('\n'),
    section: entry.section,
    source: `${sourceTitle(guide.source)}, page ${entry.page}`,
    sourceId: guide.source,
    page: entry.page,
  };
}

function buildIndex() {
  const items = [...loadGuides()];
  for (const form of ITR_FORMS) {
    const rulesDoc = loadItrForm(form, 'rules');
    if (rulesDoc) {
      for (const rule of rulesDoc.rules) items.push(ruleItem(form, rulesDoc, rule));
      for (const [i, check] of (rulesDoc.auditCrossChecks || []).entries()) {
        items.push({ kind: 'cross-check', form, ref: `${form}-3CD-${i + 1}`, title: `${form} tax audit cross-check: ${check.schedule} ${check.itrRef}`.trim(), text: `${check.item}. ITR: ${check.schedule} ${check.itrRef}. Form 3CD: ${check.form3cdRef}`, source: `${rulesDoc.title}, page ${check.page}`, sourceId: rulesDoc.source, page: check.page });
      }
    }
    const fieldsDoc = loadItrForm(form, 'fields');
    if (fieldsDoc) {
      for (const field of fieldsDoc.fields) if (field.description || field.enum) items.push(fieldItem(form, fieldsDoc, field));
      for (const entry of fieldsDoc.guide?.entries || []) items.push(guideFieldItem(form, fieldsDoc.guide, entry));
    }
    const utility = loadItrForm(form, 'utility');
    if (utility) {
      for (const sheet of utility.sheets) items.push({ kind: 'schedule', form, ref: `${form}:sheet:${sheet.sheet}`, title: `${form} utility sheet ${sheet.sheet}`, text: sheet.labels.slice(0, 120).join('; '), source: sourceTitle(utility.source), sourceId: utility.source });
      for (const [name, values] of Object.entries(utility.dropdowns)) items.push({ kind: 'dropdown', form, ref: `${form}:list:${name}`, title: `${form} drop-down list ${name}`, text: values.slice(0, 60).join('; ') + (values.length > 60 ? `; and ${values.length - 60} more` : ''), values, source: sourceTitle(utility.source), sourceId: utility.source });
    }
  }
  const counts = new Map();
  for (const item of items) {
    item.tokens = new Set(words(`${item.title} ${item.text} ${item.schedule || ''}`));
    item.titleTokens = new Set(words(item.title));
    for (const token of item.tokens) counts.set(token, (counts.get(token) || 0) + 1);
  }
  const total = items.length;
  return { items, idf: (token) => Math.log(1 + total / (counts.get(token) || total)) };
}

function index() {
  const cache = catalog();
  if (!cache.index) cache.index = buildIndex();
  return cache.index;
}

const KIND_WEIGHT = { guide: 1.6, rule: 1.1, 'cross-check': 1, field: 0.9, schedule: 0.7, dropdown: 0.6 };

export function searchItrKnowledge(query, { form, kind, limit = 8 } = {}) {
  const text = String(query || '');
  const asked = [...new Set(words(text))];
  const forms = form ? [form] : formsIn(text);
  const refs = rulesIn(text);
  const { items, idf } = index();
  const scored = [];
  for (const item of items) {
    if (kind && item.kind !== kind) continue;
    if (forms.length && item.form && !forms.includes(item.form)) continue;
    if (forms.length && !item.form && item.forms?.length && !item.forms.some((f) => forms.includes(f))) continue;
    let score = 0;
    let hits = 0;
    for (const token of asked) {
      if (item.tokens.has(token)) {
        hits += 1;
        score += idf(token) * (item.titleTokens.has(token) ? 1.5 : 1);
      }
    }
    if (item.kind === 'rule') {
      for (const ref of refs) if (ref.no === item.no && (!ref.category || item.category.replace('/', '') === ref.category || item.category.startsWith(ref.category))) score += 25;
    }
    if (!score) continue;
    const coverage = asked.length ? hits / asked.length : 0;
    score = score * (0.5 + coverage) * (KIND_WEIGHT[item.kind] || 1);
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.ref.localeCompare(b.item.ref));
  const cap = Math.max(1, Math.min(Number(limit) || 8, MAX_LIMIT));
  return scored.slice(0, cap).map(({ item, score }) => publicItem(item, Math.round(score * 100) / 100));
}

function publicItem(item, score) {
  const out = { kind: item.kind, ref: item.ref, title: item.title, text: item.text, source: item.source };
  for (const key of ['id', 'form', 'category', 'no', 'schedule', 'path', 'action', 'page', 'sourceId']) if (item[key] !== undefined && item[key] !== '' && item[key] !== null) out[key] = item[key];
  if (item.kind === 'field' && item.field) out.field = item.field;
  if (score !== undefined) out.score = score;
  return out;
}

export function itrRule(form, category, no) {
  const rulesDoc = loadItrForm(form, 'rules');
  if (!rulesDoc) return null;
  const cat = String(category || '').toUpperCase().replace('/', '');
  const matches = rulesDoc.rules.filter((rule) => rule.no === Number(no) && (!cat || rule.category.replace('/', '') === cat || rule.category.startsWith(cat)));
  return matches.map((rule) => publicItem(ruleItem(form, rulesDoc, rule)));
}

export function itrFields(form, name) {
  const fieldsDoc = loadItrForm(form, 'fields');
  if (!fieldsDoc) return [];
  const wanted = String(name || '').trim().toLowerCase().replace(/^\.+/, '');
  if (!wanted) return [];
  const exact = fieldsDoc.fields.filter((field) => field.path.toLowerCase() === wanted || field.path.toLowerCase().endsWith(`.${wanted}`) || field.path.toLowerCase().replace(/\[\]/g, '').endsWith(`.${wanted}`));
  const out = exact.slice(0, MAX_LIMIT).map((field) => publicItem(fieldItem(form, fieldsDoc, field)));
  const leaf = wanted.split('.').pop();
  for (const entry of fieldsDoc.guide?.entries || []) {
    if (entry.paths.some((path) => path.toLowerCase().split('.').pop() === leaf)) out.push(publicItem(guideFieldItem(form, fieldsDoc.guide, entry)));
  }
  return out;
}

export function itrSummary() {
  const forms = ITR_FORMS.map((form) => {
    const rulesDoc = loadItrForm(form, 'rules');
    const fieldsDoc = loadItrForm(form, 'fields');
    const utility = loadItrForm(form, 'utility');
    const byCategory = {};
    for (const rule of rulesDoc?.rules || []) byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
    return {
      form,
      rules: rulesDoc?.rules.length || 0,
      byCategory,
      auditCrossChecks: rulesDoc?.auditCrossChecks?.length || 0,
      fields: fieldsDoc?.count || 0,
      fieldGuide: fieldsDoc?.guide?.entries.length || 0,
      utilitySheets: utility?.sheets.length || 0,
      dropdownLists: Object.keys(utility?.dropdowns || {}).length,
    };
  });
  const guides = [...new Set(loadGuides().map((item) => `${item.doc}|${item.title.split(':')[0]}`))].map((pair) => { const [id, title] = pair.split('|'); return { id, title }; });
  return { forms, guides, sources: catalog().sources.length };
}

export function itrKnowledge(state, args = {}) {
  const form = args.form ? formLabel(args.form) : null;
  if (args.form && !form) return fail('ITR_FORM_UNKNOWN', { hint: 'Use ITR-1 to ITR-6.' });
  const kind = args.kind ? String(args.kind) : '';
  if (kind && !KINDS.has(kind)) return fail('ITR_KIND_UNKNOWN', { known: [...KINDS] });
  if (args.rule !== undefined && args.rule !== null && args.rule !== '') {
    if (!form) return fail('ITR_FORM_REQUIRED', { hint: 'Say which form, such as ITR-3, with the rule number.' });
    const ref = /^\s*([abd](?:\/d)?)?\s*[-‐–]?\s*(\d{1,4})\s*$/i.exec(String(args.rule));
    if (!ref) return fail('ITR_RULE_INVALID', { hint: 'Give a rule number such as 46 or A-46.' });
    const found = itrRule(form, ref[1], ref[2]);
    if (!found?.length) return fail('ITR_RULE_NOT_FOUND', { form, rule: String(args.rule) });
    return { ok: true, data: { form, rule: String(args.rule), hits: found } };
  }
  if (args.field) {
    if (!form) return fail('ITR_FORM_REQUIRED', { hint: 'Say which form, such as ITR-2, with the field name.' });
    const hits = itrFields(form, args.field);
    if (!hits.length) return fail('ITR_FIELD_NOT_FOUND', { form, field: String(args.field) });
    return { ok: true, data: { form, field: String(args.field), hits } };
  }
  const query = String(args.query || '').trim();
  if (!query) return { ok: true, data: { summary: itrSummary() } };
  const hits = searchItrKnowledge(query, { form: form || undefined, kind: kind || undefined, limit: args.limit });
  return { ok: true, data: { query, form, hits } };
}

function clip(text, size = 360) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > size ? `${flat.slice(0, size - 1)}…` : flat;
}

export function itrKnowledgeWords(data) {
  if (data.summary) {
    const lines = ['MyCA\'s ITR knowledge base (AY 2025-26 forms, schemas and validation rules, plus guides):'];
    for (const item of data.summary.forms) lines.push(`· ${item.form}: ${item.rules} validation rules${item.auditCrossChecks ? `, ${item.auditCrossChecks} tax audit cross-checks` : ''}, ${item.fields} schema fields${item.fieldGuide ? `, ${item.fieldGuide} field-guide entries` : ''}, ${item.utilitySheets} utility sheets`);
    lines.push(`Guides: ${data.summary.guides.map((guide) => guide.title).join('; ')}.`);
    lines.push('Ask about a rule ("ITR-3 rule 46"), a field ("ITR-1 field GrossSalary") or a topic ("form 16 vs AIS").');
    return lines.join('\n');
  }
  if (!data.hits.length) return `Nothing in the ITR knowledge base matches "${data.query}". Try the form and a schedule or section, such as "ITR-2 schedule CG 112A".`;
  const lines = [];
  for (const hit of data.hits.slice(0, 6)) {
    const head = hit.kind === 'rule' ? `${hit.form} rule ${hit.category}-${hit.no}${hit.schedule ? ` (${hit.schedule})` : ''}` : hit.title;
    lines.push(`· ${head}: ${clip(hit.text)}${hit.kind === 'rule' && hit.action ? ` [${hit.category}: ${hit.action}]` : ''}\n  Source: ${hit.source}`);
  }
  if (data.hits.length > 6) lines.push(`and ${data.hits.length - 6} more.`);
  return lines.join('\n');
}

export function itrGuidanceSections(question, { limit = 3, minScore = 6 } = {}) {
  const forms = formsIn(question);
  const itrish = forms.length > 0 || /\b(itr|return|form\s*16|26as|ais|tis|schedule|validation|json|utility|schema|e-?filing|regime|refund|139|143|defect|rejected|upload)\b/i.test(question);
  if (!itrish) return [];
  return searchItrKnowledge(question, { limit: limit * 2 })
    .filter((hit) => hit.score >= minScore)
    .slice(0, limit)
    .map((hit) => ({
      module: 'itr-knowledge',
      id: hit.ref,
      ref: `itr-knowledge/${hit.ref}`,
      title: hit.title,
      source: hit.source,
      keywords: [],
      text: hit.kind === 'rule' ? `${hit.text}\nCategory ${hit.category}: ${hit.action}` : hit.text,
      rules: [],
      unresolved: [],
      attested: false,
      score: hit.score,
      kind: hit.kind,
    }));
}
