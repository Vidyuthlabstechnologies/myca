import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || join(root, 'docs', 'release', 'PLAY-LISTING.md');
const LIMITS = { 'listing-title': 30, 'listing-short': 80, 'listing-full': 4000 };

export function listingFields(text) {
  const fields = {};
  for (const match of text.matchAll(/^```(listing-[a-z]+)\n([\s\S]*?)\n```$/gm)) fields[match[1]] = match[2];
  return fields;
}

export function listingProblems(text) {
  const fields = listingFields(text);
  const problems = [];
  for (const [name, limit] of Object.entries(LIMITS)) {
    const value = fields[name];
    if (value === undefined) problems.push(`${name}: missing`);
    else if ([...value].length > limit) problems.push(`${name}: ${[...value].length} characters, the limit is ${limit}`);
    else if (!value.trim()) problems.push(`${name}: empty`);
  }
  return { fields, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { fields, problems } = listingProblems(readFileSync(file, 'utf8'));
  for (const [name, limit] of Object.entries(LIMITS)) if (fields[name] !== undefined) process.stdout.write(`${name}: ${[...fields[name]].length}/${limit}\n`);
  if (problems.length) {
    process.stdout.write(`${problems.join('\n')}\n`);
    process.exit(1);
  }
}
