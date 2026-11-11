import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPECS = [
  'api-reference/openapi.json',
  'api-reference/kyc/openapi.json',
  'api-reference/kyc/pan/openapi.json',
  'api-reference/it/calculator/openapi.json',
  'api-reference/it/compliance/openapi.json',
  'api-reference/it/ocr/openapi.json',
  'api-reference/it/report/openapi.json',
  'api-reference/gst/analytics/openapi.json',
  'api-reference/gst/compliance/openapi.json',
  'api-reference/tds/analytics/openapi.json',
  'api-reference/tds/calculator/openapi.json',
  'api-reference/tds/compliance/openapi.json',
  'api-reference/tds/reports/openapi.json',
  'api-reference/bank/virtual-account/openapi.json',
  'api-reference/it/openapi.json',
];

const DOCS = 'https://developer.sandbox.co.in/';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', '..', 'src', 'sandbox-catalog.mjs');

function specFile(dir, spec) {
  return join(dir, spec.replace(/^api-reference\//, '').replace(/\/openapi\.json$|openapi\.json$/, '').replace(/\//g, '_') || 'auth') + '.json';
}

async function download(dir) {
  mkdirSync(dir, { recursive: true });
  for (const spec of SPECS) {
    const file = specFile(dir, spec);
    if (existsSync(file)) continue;
    const res = await fetch(DOCS + spec);
    if (!res.ok) throw new Error(`${spec}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
}

function deref(doc, node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return node;
  if (node.$ref) {
    let value = doc;
    for (const part of node.$ref.replace(/^#\//, '').split('/')) value = value?.[part];
    return deref(doc, value, depth + 1);
  }
  return node;
}

function schemaOf(doc, operation) {
  const body = deref(doc, operation.requestBody);
  if (!body?.content) return { body: null, schema: null };
  if (body.content['multipart/form-data']) return { body: 'multipart', schema: deref(doc, body.content['multipart/form-data'].schema) };
  const json = body.content['application/json'] || Object.values(body.content)[0];
  return { body: 'json', schema: deref(doc, json?.schema) };
}

function entityOf(doc, schema) {
  const prop = deref(doc, schema?.properties?.['@entity']);
  if (!prop) return null;
  if (typeof prop.const === 'string') return prop.const;
  if (Array.isArray(prop.enum) && prop.enum.length === 1 && typeof prop.enum[0] === 'string') return prop.enum[0];
  return null;
}

function slug(path) {
  return path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function collect(dir) {
  const seen = new Map();
  for (const spec of SPECS) {
    const doc = JSON.parse(readFileSync(specFile(dir, spec), 'utf8'));
    for (const [path, item] of Object.entries(doc.paths || {})) {
      if (path === '/' || !path.startsWith('/')) continue;
      const cleanPath = path.replace(/\/+$/, '');
      for (const method of METHODS) {
        const operation = item[method];
        if (!operation) continue;
        const key = `${method.toUpperCase()} ${cleanPath}`;
        if (seen.has(key)) continue;
        const params = [...(item.parameters || []), ...(operation.parameters || [])].map((p) => deref(doc, p)).filter(Boolean);
        const { body, schema } = schemaOf(doc, operation);
        seen.set(key, {
          method: method.toUpperCase(),
          path: cleanPath,
          title: String(operation.summary || '').trim().replace(/\s+/g, ' ') || cleanPath,
          spec,
          pathParams: [...cleanPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]),
          query: params.filter((p) => p.in === 'query').map((p) => ({ name: p.name, required: p.required === true })),
          body,
          bodyRequired: Array.isArray(schema?.required) ? schema.required.filter((name) => name !== '@entity') : [],
          entity: entityOf(doc, schema),
        });
      }
    }
  }
  return [...seen.values()];
}

function withIds(endpoints) {
  const counts = new Map();
  for (const e of endpoints) counts.set(slug(e.path), (counts.get(slug(e.path)) || 0) + 1);
  return endpoints
    .map((e) => ({ id: `quicko_${slug(e.path)}${counts.get(slug(e.path)) > 1 ? `_${e.method.toLowerCase()}` : ''}`, ...e }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const dir = process.argv[2] || join(here, '.specs');
await download(dir);
const endpoints = withIds(collect(dir));
const ids = new Set(endpoints.map((e) => e.id));
if (ids.size !== endpoints.length) throw new Error('DUPLICATE_ENDPOINT_ID');
writeFileSync(target, `export const SANDBOX_CATALOG_SOURCE = ${JSON.stringify({ docs: DOCS, specs: SPECS, builtOn: new Date().toISOString().slice(0, 10) }, null, 2)};\n\nexport const SANDBOX_ENDPOINTS = Object.freeze([\n${endpoints.map((e) => `  ${JSON.stringify(e)},`).join('\n')}\n].map((endpoint) => Object.freeze(endpoint)));\n`);
console.log(`${endpoints.length} endpoints -> ${target}`);
