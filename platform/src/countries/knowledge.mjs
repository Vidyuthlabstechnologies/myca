import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countryPack } from './index.mjs';

export const KNOWLEDGE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'knowledge');
const cache = new Map();

function parse(code, text) {
  const header = text.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (header) for (const line of header[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  const body = header ? text.slice(header[0].length) : text;
  const sections = [];
  let current = null;
  for (const line of body.split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = { heading: heading[1].trim(), text: '' };
      sections.push(current);
    } else if (current) current.text += `${line}\n`;
  }
  for (const section of sections) {
    section.text = section.text.trim();
    section.sources = [...section.text.matchAll(/https?:\/\/[^\s)]+/g)].map((hit) => hit[0].replace(/[.,;]$/, ''));
  }
  return { country: code, checked: meta.checked || '', recheckBy: meta['recheck-by'] || '', attested: meta.attested === 'true', sections };
}

export function countryKnowledge(code) {
  const pack = countryPack(code);
  if (!pack) return null;
  if (cache.has(pack.code)) return cache.get(pack.code);
  const file = join(KNOWLEDGE_DIR, `${pack.code.toLowerCase()}.md`);
  const parsed = existsSync(file) ? parse(pack.code, readFileSync(file, 'utf8')) : null;
  cache.set(pack.code, parsed);
  return parsed;
}

export function searchCountryKnowledge(code, question, { limit = 3 } = {}) {
  const knowledge = countryKnowledge(code);
  if (!knowledge) return [];
  const words = [...new Set(String(question || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3))];
  if (!words.length) return [];
  return knowledge.sections
    .map((section) => {
      const heading = section.heading.toLowerCase();
      const haystack = `${heading}\n${section.text}`.toLowerCase();
      const matched = words.filter((word) => haystack.includes(word)).length + words.filter((word) => heading.includes(word)).length;
      return { ...section, country: knowledge.country, checked: knowledge.checked, attested: knowledge.attested, matched };
    })
    .filter((section) => section.matched > 0)
    .sort((a, b) => b.matched - a.matched || Number(a.heading === 'Summary') - Number(b.heading === 'Summary'))
    .slice(0, limit);
}

export function knowledgeProblems(packs, today) {
  const problems = [];
  for (const pack of packs) {
    const knowledge = countryKnowledge(pack.code);
    if (!knowledge) {
      problems.push(`${pack.code}: no knowledge file at countries/knowledge/${pack.code.toLowerCase()}.md.`);
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(knowledge.checked)) problems.push(`${pack.code}: the knowledge file needs a checked date.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(knowledge.recheckBy)) problems.push(`${pack.code}: the knowledge file needs a recheck-by date.`);
    else if (today && knowledge.recheckBy < today) problems.push(`${pack.code}: the knowledge file was due a recheck by ${knowledge.recheckBy}.`);
    for (const wanted of ['Summary', 'Tax year and calendar', 'Data', 'Payments', 'Open questions']) {
      if (!knowledge.sections.some((section) => section.heading.startsWith(wanted))) problems.push(`${pack.code}: the knowledge file has no "${wanted}" section.`);
    }
    if (!/Source:/.test(knowledge.sections.map((section) => section.text).join('\n'))) problems.push(`${pack.code}: the knowledge file cites no source.`);
  }
  return problems;
}
