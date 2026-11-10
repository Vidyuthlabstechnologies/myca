import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['platform/src', 'cloud/src', 'email-relay/src', 'deploy/src'];
const SEARCHED = ['platform', 'cloud', 'email-relay', 'deploy', 'scripts', 'sprints'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out']);
const CODE = /\.(mjs|cjs|js|html)$/;
const warnOnly = process.argv.includes('--warn');

function filesUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...filesUnder(path));
    else if (CODE.test(name)) out.push(path);
  }
  return out;
}

function exportsOf(text) {
  const names = new Set();
  for (const match of text.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name && name !== 'default') names.add(name);
    }
  }
  return names;
}

const searched = SEARCHED.flatMap(filesUnder).map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
const unused = [];
for (const file of SOURCES.flatMap(filesUnder)) {
  const own = readFileSync(join(root, file), 'utf8');
  for (const name of exportsOf(own)) {
    const word = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g');
    const usedHere = (own.match(word) || []).length > 1;
    if (!usedHere && !searched.some((other) => other.path !== file && new RegExp(word.source).test(other.text))) unused.push(`${relative(root, join(root, file))}: ${name}`);
  }
}

if (unused.length) {
  process.stdout.write(`${unused.length} export${unused.length === 1 ? ' is' : 's are'} exported and used nowhere, not even in their own file:\n${unused.map((line) => `  ${line}`).join('\n')}\n`);
  process.exit(warnOnly ? 0 : 1);
}
process.stdout.write('Every export is used somewhere.\n');
