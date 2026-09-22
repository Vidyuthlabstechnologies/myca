import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const fetchCalls = [];
globalThis.fetch = (...args) => {
  fetchCalls.push(args);
  throw new Error('network is not allowed in statutory-rules');
};

const sourceRoot = new URL('../src/', import.meta.url);

function sourceFiles(directory = sourceRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, directory));
    return entry.name.endsWith('.mjs') ? [new URL(entry.name, directory)] : [];
  });
}

function read(url) {
  return readFileSync(url, 'utf8');
}

function label(url) {
  return url.pathname.slice(url.pathname.indexOf('/src/'));
}

test('the package declares no runtime or dev dependencies', () => {
  const manifest = JSON.parse(read(new URL('../package.json', import.meta.url)));
  assert.equal(manifest.name, 'statutory-rules');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.scripts.test, 'node --test "test/*.test.mjs"');
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(manifest[field], undefined, field);
  }
});

test('source imports only relative modules and node built-ins', () => {
  for (const file of sourceFiles()) {
    const specifiers = [...read(file).matchAll(/\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'/g)].map((match) => match[1] ?? match[2]);
    for (const specifier of specifiers) {
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('node:'), `${label(file)} imports ${specifier}`);
    }
  }
});

test('source never reads the clock or randomness and never opens a network connection', () => {
  const forbidden = [
    /\bDate\.now\b/,
    /new\s+Date\s*\(\s*\)/,
    /\bMath\.random\b/,
    /\brandom(UUID|Bytes|Int|Fill)\b/,
    /\bgetRandomValues\b/,
    /\bperformance\.now\b/,
    /\bprocess\.hrtime\b/,
    /\bfetch\s*\(/,
    /'node:(http|https|http2|net|tls|dgram|dns|child_process|worker_threads)'/
  ];
  for (const file of sourceFiles()) {
    const text = read(file);
    for (const pattern of forbidden) assert.doesNotMatch(text, pattern, `${label(file)} matches ${pattern}`);
  }
});

test('source carries no comments', () => {
  for (const file of sourceFiles()) {
    assert.doesNotMatch(read(file), /^\s*(\/\/|\/\*)/m, label(file));
  }
});

test('using the public API makes no network call', async () => {
  const api = await import('../src/index.mjs');
  const context = api.createRuleContext();
  context.rule('test.never-registered', '2026-04-01');
  api.rule('test.never-registered', api.fyStart(api.fyOf('2026-09-21')));
  api.isVerifiedFor({ attestations: [] }, 'firm-a');
  api.validateRules(api.RULES);
  await api.runGolden(new URL('./fixtures/golden/passing.json', import.meta.url), (input) => ({ totalPaise: input.aPaise + input.bPaise }));
  assert.deepEqual(fetchCalls, []);
});
