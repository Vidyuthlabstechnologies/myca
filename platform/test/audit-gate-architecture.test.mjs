import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const SPRINTS = resolve(HERE, '../../sprints');
const GATE = 'action-gate.mjs';
const TRANSPORT_MODULES = new Set(['sandbox-client.mjs', 'nic-client.mjs', 'nim-client.mjs', 'notifications.mjs', 'govt.mjs', 'reachability.mjs']);
const PENDING_LATER_SLICES = new Set([
  'govt.mjs -> nic-client.mjs',
  'govt.mjs -> reachability.mjs',
  'provider-doctor.mjs -> nim-client.mjs',
  'provider-doctor.mjs -> reachability.mjs',
  'provider-doctor.mjs -> sandbox-client.mjs',
  'tools.mjs -> nic-client.mjs',
  'tools.mjs -> nim-client.mjs',
  'tools.mjs -> notifications.mjs',
  'tools.mjs -> sandbox-client.mjs',
]);

const FETCH_REFERENCE = /(?<![\w$])fetch(?![\w$])/;
const BUILTIN_IMPORT = /\bimport\s+([\w$*{}\s,]+?)\s+from\s+['"](?:node:)?(net|tls|dgram|http|https|http2|undici)['"]|\bimport\(\s*['"](?:node:)?(net|tls|dgram|http|https|http2|undici)['"]\s*\)/g;
const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function usesNetwork(text) {
  if (FETCH_REFERENCE.test(text)) return true;
  for (const match of text.matchAll(BUILTIN_IMPORT)) {
    const [, bindings = '', staticModule, dynamicModule] = match;
    const moduleName = staticModule || dynamicModule;
    if (moduleName === 'http' && /^\{\s*createServer\s*\}$/.test(bindings.trim())) continue;
    return true;
  }
  return false;
}

function importSpecifiers(text) {
  return [...text.matchAll(STATIC_IMPORT), ...text.matchAll(DYNAMIC_IMPORT)].map((match) => match[1]);
}

function listModules(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return listModules(full);
    return /\.(mjs|js|cjs)$/.test(name) ? [full] : [];
  });
}

function moduleGraph() {
  const files = listModules(SRC);
  const name = (full) => relative(SRC, full).split('\\').join('/');
  const text = new Map(files.map((full) => [name(full), readFileSync(full, 'utf8')]));
  const imports = new Map();
  for (const full of files) {
    const targets = new Set();
    for (const spec of importSpecifiers(text.get(name(full)))) {
      if (!spec.startsWith('.')) continue;
      const target = resolve(dirname(full), spec);
      if (target.startsWith(SRC)) targets.add(name(target));
    }
    imports.set(name(full), targets);
  }
  return { text, imports };
}

function importersOf(graph, target) {
  return [...graph.imports].filter(([, targets]) => targets.has(target)).map(([from]) => from);
}

function reachableFrom(graph, start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const next = queue.shift();
    for (const target of graph.imports.get(next) || []) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

function gatePrivateModules(graph) {
  const candidates = reachableFrom(graph, GATE);
  candidates.delete(GATE);
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of [...candidates]) {
      const importers = importersOf(graph, mod);
      if (!importers.length || importers.some((from) => from !== GATE && !candidates.has(from))) {
        candidates.delete(mod);
        changed = true;
      }
    }
  }
  return candidates;
}

function networkModules(graph) {
  return [...graph.text].filter(([, source]) => usesNetwork(source)).map(([mod]) => mod).sort();
}

function transportImportViolations(graph) {
  const allowed = new Set([GATE, ...gatePrivateModules(graph)]);
  return networkModules(graph)
    .flatMap((transport) => importersOf(graph, transport).filter((from) => !allowed.has(from)).map((from) => `${from} -> ${transport}`))
    .sort();
}

test('architecture detector: finds fetch, sockets and imports, and ignores look-alikes', () => {
  assert.equal(usesNetwork('const res = await fetch(url);'), true);
  assert.equal(usesNetwork('this.fetchFn = (...a) => globalThis.fetch(...a);'), true);
  assert.equal(usesNetwork('export async function probe(fetchFn = fetch) {}'), true);
  assert.equal(usesNetwork('const fn = options.fetchFn; prefetchRows(); fn(url);'), false);
  assert.equal(usesNetwork("import { connect } from 'node:net';"), true);
  assert.equal(usesNetwork("import { request } from 'node:https';"), true);
  assert.equal(usesNetwork("import http from 'node:http';"), true);
  assert.equal(usesNetwork("const tls = await import('node:tls');"), true);
  assert.equal(usesNetwork("import { createServer } from 'node:http';"), false);
  assert.deepEqual(importSpecifiers([
    "import { a } from './a.mjs';",
    'export {',
    '  b,',
    "} from './b.mjs';",
    "import * as c from './c.mjs';",
    "export * from './d.mjs';",
    "const e = await import('./e.mjs');",
    "import './f.mjs';",
    "export const g = 'from';",
  ].join('\n')).sort(), ['./a.mjs', './b.mjs', './c.mjs', './d.mjs', './e.mjs', './f.mjs']);
});

test('architecture: fetch and sockets appear only in the named transport modules', () => {
  const graph = moduleGraph();
  assert.ok(graph.text.has(GATE));
  const outside = networkModules(graph).filter((mod) => !TRANSPORT_MODULES.has(mod));
  assert.deepEqual(outside, []);
  assert.ok(networkModules(graph).includes('sandbox-client.mjs'));
});

test('architecture: sprint engines make no network calls', () => {
  const offenders = listModules(SPRINTS)
    .filter((full) => /[\\/]src[\\/]/.test(full))
    .filter((full) => usesNetwork(readFileSync(full, 'utf8')))
    .map((full) => relative(SPRINTS, full));
  assert.deepEqual(offenders, []);
});

test('architecture: no module outside the gate gains a new direct import of a transport', () => {
  const fresh = transportImportViolations(moduleGraph()).filter((pair) => !PENDING_LATER_SLICES.has(pair));
  assert.deepEqual(fresh, []);
});

test('architecture: only the action gate, or a module only it imports, imports a transport', {
  todo: 'tools.mjs, provider-doctor.mjs and govt.mjs still import transports directly; later Plan 2a slices route them through performExternalAction and then remove this todo and PENDING_LATER_SLICES',
}, () => {
  assert.deepEqual(transportImportViolations(moduleGraph()), []);
});
