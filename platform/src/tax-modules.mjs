import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rules } from './sprint-load.mjs';
import { localToday } from './dates.mjs';

export const TAX_MODULES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tax-modules');

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FRONTMATTER_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const PLACEHOLDER = /\{\{([A-Za-z0-9._-]+)(?:#([A-Za-z0-9.]+))?(?:\|(paise|percent|days))?\}\}/g;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STOP = new Set(['what', 'does', 'did', 'the', 'our', 'about', 'with', 'from', 'that', 'this', 'have', 'has', 'had', 'for', 'and', 'are', 'was', 'were', 'when', 'where', 'which', 'who', 'how', 'why', 'say', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'must', 'need', 'any', 'there', 'their', 'they', 'them', 'into', 'than', 'then', 'been', 'being', 'please', 'tell', 'know', 'you', 'your', 'not', 'all', 'one', 'get', 'out', 'way', 'much', 'many', 'its', 'also', 'only', 'more', 'most', 'some', 'such', 'under', 'over', 'per', 'each', 'other']);
const UNRESOLVED_TEXT = '[figure not in MyCA rules for that date]';
const rupeeFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

let cache = null;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function unquote(value) {
  const text = String(value).trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1);
  return text;
}

export function parseFrontmatter(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  if (!source.startsWith('---\n')) return { ok: false, problems: ['FRONTMATTER_MISSING'] };
  const end = source.indexOf('\n---\n', 4);
  if (end < 0) return { ok: false, problems: ['FRONTMATTER_UNTERMINATED'] };
  const lines = source.slice(4, end).split('\n');
  const fields = {};
  const problems = [];
  let inMetadata = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const nested = /^ {2}([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (nested && inMetadata) {
      fields.metadata[nested[1]] = unquote(nested[2]);
      continue;
    }
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!top) {
      problems.push(`FRONTMATTER_LINE_UNREADABLE:${line.trim().slice(0, 40)}`);
      inMetadata = false;
      continue;
    }
    const [, key, value] = top;
    if (key in fields) problems.push(`FRONTMATTER_DUPLICATE:${key}`);
    if (key === 'metadata' && !value.trim()) {
      fields.metadata = {};
      inMetadata = true;
      continue;
    }
    inMetadata = false;
    fields[key] = unquote(value);
  }
  return { ok: problems.length === 0, fields, body: source.slice(end + 5), problems };
}

export function frontmatterProblems(fields, folder) {
  const problems = [];
  for (const key of Object.keys(fields)) if (!FRONTMATTER_KEYS.has(key)) problems.push(`FIELD_UNKNOWN:${key}`);
  const name = fields.name;
  if (typeof name !== 'string' || !name) problems.push('NAME_REQUIRED');
  else {
    if (name.length > 64) problems.push('NAME_TOO_LONG');
    if (!NAME.test(name)) problems.push('NAME_INVALID');
    if (folder !== undefined && name !== folder) problems.push('NAME_NOT_FOLDER');
  }
  const description = fields.description;
  if (typeof description !== 'string' || !description.trim()) problems.push('DESCRIPTION_REQUIRED');
  else if (description.length > 1024) problems.push('DESCRIPTION_TOO_LONG');
  if ('compatibility' in fields && (typeof fields.compatibility !== 'string' || !fields.compatibility || fields.compatibility.length > 500)) problems.push('COMPATIBILITY_INVALID');
  if ('metadata' in fields && (fields.metadata === null || typeof fields.metadata !== 'object' || Object.values(fields.metadata).some((value) => typeof value !== 'string'))) problems.push('METADATA_INVALID');
  if ('allowed-tools' in fields && typeof fields['allowed-tools'] !== 'string') problems.push('ALLOWED_TOOLS_INVALID');
  return problems;
}

function listOf(line) {
  return String(line || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function parseSections(body) {
  const chunks = String(body || '').split(/^## /m);
  const intro = chunks.shift().replace(/^# .*\n/, '').trim();
  const sections = [];
  const problems = [];
  for (const chunk of chunks) {
    const [headingLine, ...rest] = chunk.split('\n');
    const heading = /^([^:]+):\s*(.+)$/.exec(headingLine.trim());
    if (!heading || !SECTION_ID.test(heading[1].trim())) {
      problems.push(`SECTION_HEADING_INVALID:${headingLine.trim().slice(0, 40)}`);
      continue;
    }
    const section = { id: heading[1].trim(), title: heading[2].trim(), keywords: [], source: '', rules: [], text: '' };
    const textLines = [];
    let header = true;
    for (const line of rest) {
      const field = header ? /^(Keywords|Source|Rules):\s*(.*)$/.exec(line) : null;
      if (field) {
        if (field[1] === 'Keywords') section.keywords = listOf(field[2]).map((word) => word.toLowerCase());
        if (field[1] === 'Source') section.source = field[2].trim();
        if (field[1] === 'Rules') section.rules = listOf(field[2]);
        continue;
      }
      header = false;
      textLines.push(line);
    }
    section.text = textLines.join('\n').trim();
    sections.push(section);
  }
  return { intro, sections, problems };
}

function placeholdersIn(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((match) => ({ token: match[0], id: match[1], path: match[2] || '' }));
}

function sectionProblems(section, seen) {
  const problems = [];
  const where = (code) => `${code}:${section.id}`;
  if (seen.has(section.id)) problems.push(where('SECTION_DUPLICATE'));
  seen.add(section.id);
  if (!section.source) problems.push(where('SECTION_SOURCE_MISSING'));
  if (!section.keywords.length) problems.push(where('SECTION_KEYWORDS_MISSING'));
  if (!section.text) problems.push(where('SECTION_EMPTY'));
  const declared = new Set(section.rules);
  for (const id of section.rules) {
    const found = rules.RULES.some((record) => record.id === id);
    if (!found) problems.push(where(`RULE_UNKNOWN:${id}`));
  }
  for (const placeholder of placeholdersIn(section.text)) {
    if (!declared.has(placeholder.id)) problems.push(where(`RULE_NOT_DECLARED:${placeholder.id}`));
  }
  if (/\{\{|\}\}/.test(section.text.replace(PLACEHOLDER, ''))) problems.push(where('PLACEHOLDER_MALFORMED'));
  return problems;
}

export function readTaxModule(folderPath, folder) {
  const file = join(folderPath, 'SKILL.md');
  if (!existsSync(file)) return { ok: false, folder, problems: ['SKILL_MD_MISSING'] };
  const parsed = parseFrontmatter(readFileSync(file, 'utf8'));
  if (!parsed.fields) return { ok: false, folder, problems: parsed.problems };
  const problems = [...parsed.problems, ...frontmatterProblems(parsed.fields, folder)];
  const body = parseSections(parsed.body);
  problems.push(...body.problems);
  if (!body.sections.length) problems.push('SECTIONS_MISSING');
  const seen = new Set();
  for (const section of body.sections) problems.push(...sectionProblems(section, seen));
  const fields = parsed.fields;
  return {
    ok: problems.length === 0,
    folder,
    problems,
    module: {
      name: fields.name,
      description: fields.description,
      license: fields.license || '',
      compatibility: fields.compatibility || '',
      metadata: { ...(fields.metadata || {}) },
      allowedTools: String(fields['allowed-tools'] || '').split(/\s+/).filter(Boolean),
      intro: body.intro,
      sections: body.sections.map((section) => ({ ...section, module: fields.name })),
    },
  };
}

export function loadTaxModules(directory = TAX_MODULES_DIR) {
  const folders = existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [];
  const read = folders.map((folder) => readTaxModule(join(directory, folder), folder));
  const problems = read.flatMap((item) => item.problems.map((problem) => `${item.folder}: ${problem}`));
  return { ok: problems.length === 0 && read.length > 0, problems, modules: read.filter((item) => item.ok).map((item) => item.module) };
}

function registry() {
  if (!cache) cache = loadTaxModules();
  return cache;
}

export function validateTaxModules() {
  const { ok, problems, modules } = registry();
  return { ok, problems, modules: modules.length };
}

function ordinal(day) {
  const n = Number(day);
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
}

function monthAfter(endMonth, months) {
  return MONTHS[(endMonth - 1 + months) % 12];
}

export function rupees(paise) {
  return `₹${rupeeFormat.format(Number(paise) / 100)}`;
}

function joinWords(items, last = 'and') {
  const list = items.map(String);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} ${last} ${list.at(-1)}`;
}

function slabWords(slabs) {
  return slabs.map((slab) => {
    const rate = slab.ratePercent === 0 ? 'nil' : `${slab.ratePercent}%`;
    if (slab.toPaise === null) return `above ${rupees(slab.fromPaise)} ${rate}`;
    if (slab.fromPaise === 0) return `up to ${rupees(slab.toPaise)} ${rate}`;
    return `${rupees(slab.fromPaise)} to ${rupees(slab.toPaise)} ${rate}`;
  }).join('; ');
}

function dueWords(value) {
  if (Array.isArray(value.instalments)) {
    if (value.instalments.length === 1) return `${value.instalments[0].day} ${MONTHS[value.instalments[0].month - 1]}`;
    return value.instalments.map((item) => `${item.day} ${MONTHS[item.month - 1]} (${item.cumulativePercent}% of the year's tax by then)`).join(', ');
  }
  const after = Number(value.monthsAfterPeriodEnd);
  const overrides = (value.overrides || []).map((item) => `${item.day} ${monthAfter(item.periodEndMonth, item.monthsAfterPeriodEnd)} for the ${value.period === 'quarter' ? 'quarter ending' : 'month of'} ${MONTHS[item.periodEndMonth - 1]}`);
  const tail = overrides.length ? ` (${joinWords(overrides)})` : '';
  if (value.period === 'year') return `${value.day} ${monthAfter(3, after)} after the financial year`;
  if (Array.isArray(value.dayByState)) return `the ${joinWords([...new Set(value.dayByState.map((item) => ordinal(item.day)))], 'or')} of the month after the quarter, by state`;
  const unit = value.period === 'quarter' ? 'the quarter' : 'the month';
  if (after === 1) return `the ${ordinal(value.day)} of the month after ${unit}${tail}`;
  return `the ${ordinal(value.day)} of the ${ordinal(after)} month after ${unit}${tail}`;
}

export function formatFigure(value, key = '', unit = '') {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (unit === 'paise' || /Paise(?:\.|$)/.test(key) || key === 'paise') return rupees(value);
    if (unit === 'percent' || /Percent$|^percent/.test(key)) return `${value}%`;
    if (unit === 'days') return `${value}`;
    if (/BasisPoints$/.test(key) || key === 'basisPoints') return `${value / 100}%`;
    if (/Days$/.test(key)) return `${value}`;
    return rupeeFormat.format(value);
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => item && typeof item === 'object' && 'fromPaise' in item && 'ratePercent' in item)) return slabWords(value);
    if (value.length && value.every((item) => item && typeof item === 'object' && 'aboveTotalIncomePaise' in item)) return joinWords(value.map((item) => `${item.ratePercent}% above ${rupees(item.aboveTotalIncomePaise)}`));
    if (value.every((item) => typeof item === 'string')) return joinWords(value, 'or');
    return null;
  }
  if (typeof value === 'object') {
    if (Number.isInteger(value.month) && Number.isInteger(value.day) && Object.keys(value).length === 2) return `${value.day} ${MONTHS[value.month - 1]}`;
    if ('period' in value && ('day' in value || 'instalments' in value || 'dayByState' in value)) return dueWords(value);
    if ('amountPaise' in value && Object.keys(value).length === 1) return rupees(value.amountPaise);
    if ('basisPoints' in value && Object.keys(value).length === 1) return `${value.basisPoints / 100}%`;
  }
  return null;
}

function pick(value, path) {
  if (!path) return { value, key: '' };
  let current = value;
  const keys = path.split('.');
  for (const key of keys) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return { value: undefined, key };
    current = current[key];
  }
  const paiseParent = keys.slice(0, -1).some((key) => /Paise$/.test(key));
  return { value: current, key: paiseParent ? `${keys.at(-1)}Paise` : keys.at(-1) };
}

function citationOf(record) {
  return { id: record.id, effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo, act: record.act, section: record.section, source: record.source, attested: (record.attestations || []).some((item) => item.verdict === 'verified') };
}

export function resolveSection(section, onDate) {
  const used = new Map();
  const unresolved = [];
  for (const id of section.rules) {
    const found = rules.rule(id, onDate);
    if (found.ok) used.set(id, found);
  }
  const text = section.text.replace(PLACEHOLDER, (token, id, path, unit) => {
    const found = used.get(id);
    if (!found) {
      unresolved.push({ token, id, path: path || '', reason: 'RULE_NOT_IN_FORCE' });
      return UNRESOLVED_TEXT;
    }
    const picked = pick(found.value, path || '');
    const words = formatFigure(picked.value, picked.key, unit || '');
    if (words === null) {
      unresolved.push({ token, id, path: path || '', reason: 'FIGURE_UNREADABLE' });
      return UNRESOLVED_TEXT;
    }
    return words;
  });
  const citations = [...used.values()].map((found) => citationOf(found.record));
  return {
    module: section.module,
    id: section.id,
    ref: `${section.module}/${section.id}`,
    title: section.title,
    source: section.source,
    keywords: section.keywords,
    onDate,
    text,
    rules: citations,
    unresolved,
    attested: citations.length > 0 && citations.every((item) => item.attested),
  };
}

function dateOr(onDate) {
  return ISO_DATE.test(String(onDate || '')) ? String(onDate) : localToday();
}

export function taxModuleCatalog() {
  return registry().modules.map((module) => ({ name: module.name, description: module.description, domain: module.metadata.domain || '', jurisdiction: module.metadata.jurisdiction || '', version: module.metadata.version || '', reviewStatus: module.metadata['review-status'] || '', sections: module.sections.map((section) => ({ id: section.id, title: section.title })), tools: module.allowedTools }));
}

export function loadTaxModule(name, onDate) {
  const module = registry().modules.find((item) => item.name === String(name || '').trim().toLowerCase());
  if (!module) return fail('TAX_MODULE_UNKNOWN', { name, known: registry().modules.map((item) => item.name) });
  const date = dateOr(onDate);
  return { ok: true, name: module.name, description: module.description, metadata: module.metadata, tools: module.allowedTools, intro: module.intro, onDate: date, sections: module.sections.map((section) => resolveSection(section, date)) };
}

function normalise(text) {
  return String(text || '').toLowerCase().replace(/(\d)\s*\(\s*([0-9a-z]+)\s*\)/g, '$1$2').replace(/gstr\s*-\s*/g, 'gstr').replace(/[^a-z0-9\s]/g, ' ');
}

export function tokensOf(text) {
  return normalise(text).split(/\s+/).filter((word) => word && (word.length >= 3 || /\d/.test(word)) && !STOP.has(word));
}

function stem(word) {
  return word.length > 4 ? word.replace(/(?:ing|es|s)$/, '') : word;
}

function keywordRarity(modules) {
  const counts = new Map();
  let total = 0;
  for (const module of modules) {
    for (const section of module.sections) {
      total += 1;
      const seen = new Set(section.keywords.flatMap((phrase) => tokensOf(phrase).map(stem)));
      for (const word of seen) counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return (word) => Math.log2(1 + total / (counts.get(word) || 1));
}

function scoreSection(section, module, asked, rarity) {
  const words = new Set(asked.map(stem));
  let score = 0;
  const matched = [];
  for (const phrase of section.keywords) {
    const parts = tokensOf(phrase).map(stem);
    if (parts.length && parts.every((part) => words.has(part))) {
      score += parts.reduce((sum, part) => sum + (rarity(part) ** 2) / 2, 0) + parts.length;
      matched.push(phrase);
    }
  }
  const titleWords = new Set(tokensOf(section.title).map(stem));
  for (const word of words) if (titleWords.has(word)) score += 2;
  const bodyWords = new Set(tokensOf(section.text.replace(PLACEHOLDER, ' ')).map(stem));
  let bodyHits = 0;
  for (const word of words) if (bodyWords.has(word)) bodyHits += 1;
  score += Math.min(bodyHits, 6) * 0.5;
  const describe = new Set(tokensOf(module.description).map(stem));
  for (const word of words) if (describe.has(word)) score += 0.25;
  return { score, matched };
}

export function findTaxGuidance(question, { onDate, limit = 3, module } = {}) {
  const asked = tokensOf(question);
  if (!asked.length) return [];
  const date = dateOr(onDate);
  const pool = registry().modules.filter((item) => !module || item.name === module);
  const rarity = keywordRarity(registry().modules);
  const scored = [];
  for (const item of pool) {
    for (const section of item.sections) {
      const { score, matched } = scoreSection(section, item, asked, rarity);
      if (score >= 3) scored.push({ score, matched, section });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.section.module.localeCompare(b.section.module) || a.section.id.localeCompare(b.section.id));
  const top = scored[0]?.score || 0;
  return scored.filter((hit) => hit.score >= top / 3).slice(0, Math.max(1, Math.min(Number(limit) || 3, 6))).map((hit) => ({ ...resolveSection(hit.section, date), score: Math.round(hit.score * 100) / 100, matched: hit.matched }));
}

export function resetTaxModuleCache() {
  cache = null;
}
