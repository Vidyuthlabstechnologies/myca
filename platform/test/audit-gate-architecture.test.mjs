import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const SPRINTS = resolve(HERE, '../../sprints');
const GATE = 'action-gate.mjs';
const TRANSPORT_MODULES = new Set(['sandbox-client.mjs', 'nic-client.mjs', 'nim-client.mjs', 'channel-client.mjs', 'tally-client.mjs', 'model-adapter.mjs', 'notifications.mjs', 'govt.mjs', 'reachability.mjs']);
const PENDING_LATER_SLICES = new Set([
  'document-reader.mjs -> model-adapter.mjs',
  'expense-head-model.mjs -> model-adapter.mjs',
  'chat-language.mjs -> model-adapter.mjs',
  'router.mjs -> model-adapter.mjs',
  'govt.mjs -> nic-client.mjs',
  'govt.mjs -> reachability.mjs',
  'provider-doctor.mjs -> nim-client.mjs',
  'provider-doctor.mjs -> reachability.mjs',
  'provider-doctor.mjs -> sandbox-client.mjs',
  'tools.mjs -> nim-client.mjs',
  'tools.mjs -> notifications.mjs',
  'tools.mjs -> sandbox-client.mjs',
]);

const FETCH_REFERENCE = /(?<![\w$])fetch(?![\w$])/;
const BUILTIN_IMPORT = /\bimport\s+([\w$*{}\s,]+?)\s+from\s+['"](?:node:)?(net|tls|dgram|http|https|http2|undici)['"]|\bimport\(\s*['"](?:node:)?(net|tls|dgram|http|https|http2|undici)['"]\s*\)/g;
const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const IMPORT_FROM = /(?:^|[\s;])import\s+([\w$*{}\s,]+?)\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT = /(?:^|[\s;])import\s+['"]([^'"]+)['"]/g;
const EXPORT_FROM = /(?:^|[\s;])export\s+(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_LIST = /(?:^|[\s;])export\s+\{([^}]*)\}(?!\s*from\b)/g;
const LOCAL_EXPORT = /(?:^|[\s;])export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s*([\w$]+)/g;

const REQUEST_HEADER_NAME = /sec-fetch-[a-z-]+/gi;

function usesNetwork(text) {
  if (FETCH_REFERENCE.test(text.replace(REQUEST_HEADER_NAME, 'sec-header'))) return true;
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
  return graphFromSources(new Map(files.map((full) => [name(full), readFileSync(full, 'utf8')])));
}

function resolveSpecifier(from, spec) {
  if (!spec.startsWith('.')) return null;
  return posix.normalize(posix.join(posix.dirname(from), spec));
}

function parseNameList(list) {
  return list.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, alias = name] = part.split(/\s+as\s+/);
    return { name, alias };
  });
}

function parseImportClause(clause) {
  const braces = clause.match(/\{([^}]*)\}/);
  const bindings = braces ? parseNameList(braces[1]).map(({ name, alias }) => ({ imported: name, local: alias })) : [];
  const namespace = clause.match(/\*\s+as\s+([\w$]+)/);
  if (namespace) bindings.push({ imported: '*', local: namespace[1] });
  const rest = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '');
  for (const name of rest.split(',').map((part) => part.trim()).filter(Boolean)) bindings.push({ imported: 'default', local: name });
  return bindings;
}

function moduleInfo(mod, source, exists) {
  const resolveTarget = (spec) => {
    const target = resolveSpecifier(mod, spec);
    return target && exists(target) ? target : null;
  };
  const uses = [];
  const imported = new Map();
  const reexports = new Map();
  const stars = [];
  const locals = new Set([...source.matchAll(LOCAL_EXPORT)].map((match) => match[1]));
  for (const [, clause, spec] of source.matchAll(IMPORT_FROM)) {
    const target = resolveTarget(spec);
    if (!target) continue;
    const bindings = parseImportClause(clause);
    uses.push({ target, names: bindings.map((binding) => binding.imported) });
    for (const binding of bindings) imported.set(binding.local, { target, name: binding.imported });
  }
  for (const [, spec] of [...source.matchAll(SIDE_EFFECT_IMPORT), ...source.matchAll(DYNAMIC_IMPORT)]) {
    const target = resolveTarget(spec);
    if (target) uses.push({ target, names: ['*'] });
  }
  for (const [, clause, spec] of source.matchAll(EXPORT_FROM)) {
    const target = resolveTarget(spec);
    if (!target) continue;
    if (clause.startsWith('*')) {
      const namespace = clause.match(/as\s+([\w$]+)/);
      if (namespace) reexports.set(namespace[1], { target, name: '*' });
      else stars.push(target);
      uses.push({ target, names: ['*'] });
      continue;
    }
    const names = parseNameList(clause.slice(1, -1));
    for (const { name, alias } of names) reexports.set(alias, { target, name });
    uses.push({ target, names: names.map(({ name }) => name) });
  }
  for (const [, list] of source.matchAll(EXPORT_LIST)) {
    for (const { name, alias } of parseNameList(list)) {
      if (imported.has(name)) reexports.set(alias, imported.get(name));
      else locals.add(alias);
    }
  }
  return { uses, reexports, stars, locals };
}

function graphFromSources(text) {
  const imports = new Map();
  const infos = new Map();
  for (const [mod, source] of text) {
    const targets = new Set();
    for (const spec of importSpecifiers(source)) {
      const target = resolveSpecifier(mod, spec);
      if (target && text.has(target)) targets.add(target);
    }
    imports.set(mod, targets);
    infos.set(mod, moduleInfo(mod, source, (target) => text.has(target)));
  }
  return { text, imports, infos };
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

function transportBindings(graph) {
  const network = new Set(networkModules(graph));
  const isTransport = (mod, name, seen = new Set()) => {
    if (network.has(mod)) return true;
    const key = `${mod}#${name}`;
    const info = graph.infos.get(mod);
    if (!info || seen.has(key)) return false;
    seen.add(key);
    if (name === '*') {
      return [...info.reexports.values()].some((origin) => isTransport(origin.target, origin.name, seen))
        || info.stars.some((target) => isTransport(target, '*', seen));
    }
    const origin = info.reexports.get(name);
    if (origin) return isTransport(origin.target, origin.name, seen);
    if (info.locals.has(name)) return false;
    return info.stars.some((target) => isTransport(target, name, seen));
  };
  return isTransport;
}

function transportImportViolations(graph) {
  const allowed = new Set([GATE, ...gatePrivateModules(graph)]);
  const isTransport = transportBindings(graph);
  const edges = new Set();
  for (const [from, info] of graph.infos) {
    if (allowed.has(from)) continue;
    for (const use of info.uses) {
      if (use.names.some((name) => isTransport(use.target, name))) edges.add(`${from} -> ${use.target}`);
    }
  }
  return [...edges].sort();
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
  assert.equal(usesNetwork("const site = req.headers['sec-fetch-site'];"), false, 'a request header name is not a fetch call');
  assert.equal(usesNetwork("import fetch from 'node-fetch';"), true, 'a fetch polyfill is still network');
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

test('architecture detector: a transport re-exported through another module is still a transport', () => {
  const graph = graphFromSources(new Map([
    ['nic.mjs', "export const HOSTS = {};\nexport async function gen(url) { return fetch(url); }"],
    ['hub.mjs', "export { gen, HOSTS as hosts } from './nic.mjs';\nexport function local() {}"],
    ['relay.mjs', "import { gen } from './nic.mjs';\nimport { local } from './hub.mjs';\nexport { gen as send, local };"],
    ['star.mjs', "export * from './relay.mjs';\nexport const own = 1;"],
    ['action-gate.mjs', "import { gen } from './nic.mjs';\nexport { gen as rawGen };\nexport function performExternalAction() {}"],
    ['user.mjs', "import { gen } from './hub.mjs';"],
    ['alias.mjs', "import { send as s } from './relay.mjs';"],
    ['viaStar.mjs', "import { send } from './star.mjs';"],
    ['ns.mjs', "import * as hub from './hub.mjs';"],
    ['dyn.mjs', "const hub = await import('./hub.mjs');"],
    ['viaGate.mjs', "import { rawGen } from './action-gate.mjs';"],
    ['safe.mjs', "import { local } from './hub.mjs';\nimport { own } from './star.mjs';\nimport { performExternalAction } from './action-gate.mjs';"],
  ]));
  assert.deepEqual(transportImportViolations(graph), [
    'alias.mjs -> relay.mjs',
    'dyn.mjs -> hub.mjs',
    'hub.mjs -> nic.mjs',
    'ns.mjs -> hub.mjs',
    'relay.mjs -> nic.mjs',
    'star.mjs -> relay.mjs',
    'user.mjs -> hub.mjs',
    'viaGate.mjs -> action-gate.mjs',
    'viaStar.mjs -> star.mjs',
  ]);
});

test('architecture: fetch and sockets appear only in the named transport modules', () => {
  const graph = moduleGraph();
  assert.ok(graph.text.has(GATE));
  const outside = networkModules(graph).filter((mod) => !TRANSPORT_MODULES.has(mod));
  assert.deepEqual(outside, []);
  assert.ok(networkModules(graph).includes('sandbox-client.mjs'));
});

const NETWORK_REFUSAL_GUARD = /^\s*(?:const originalFetch = globalThis\.fetch;|globalThis\.fetch = (?:refuseNetwork|originalFetch);)\s*$/gm;

test('architecture: sprint engines make no network calls', () => {
  const offenders = listModules(SPRINTS)
    .filter((full) => /[\\/]src[\\/]/.test(full))
    .filter((full) => usesNetwork(readFileSync(full, 'utf8').replace(NETWORK_REFUSAL_GUARD, '')))
    .map((full) => relative(SPRINTS, full));
  assert.deepEqual(offenders, []);
});

test('architecture: only the action gate imports a transport, apart from the listed edges that later Plan 2a slices remove', () => {
  assert.deepEqual(transportImportViolations(moduleGraph()), [...PENDING_LATER_SLICES].sort());
});
