import { MANIFEST as SHARED } from './shared/manifest.mjs';
import { MANIFEST as MALAYSIA } from './malaysia/manifest.mjs';

export const EVERY_COUNTRY = '*';
export const TOOL_ACCESS = Object.freeze(['read', 'write']);
export const CAPABILITY_STATUSES = Object.freeze(['building', 'beta', 'live']);
export const CAPABILITIES = Object.freeze({
  'income-tax': Object.freeze(['profile', 'forms', 'interview', 'estimate', 'review', 'document']),
  'indirect-tax': Object.freeze(['summary', 'return', 'payment']),
  'e-invoice': Object.freeze(['issue', 'cancel', 'status']),
  'payroll': Object.freeze(['run', 'payslip', 'statutory-file']),
  'filing': Object.freeze(['submit', 'status']),
  'identity': Object.freeze(['validate']),
  'profile': Object.freeze(['country']),
});

export const MANIFESTS = Object.freeze([
  SHARED,
  MALAYSIA,
]);

const TOOL_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const FAMILY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toolsOf(manifests) {
  return manifests.flatMap((manifest) => manifest.tools.map((tool) => ({ ...tool, country: manifest.country })));
}

function argNames(tool) {
  return Object.keys(tool.schema?.properties || {});
}

export function engineTables(manifests) {
  const tools = toolsOf(manifests);
  return Object.freeze({
    toolDefs: Object.freeze(tools.map((tool) => Object.freeze({ name: tool.name, title: tool.title, description: tool.description, args: Object.freeze(argNames(tool)), access: tool.access, country: tool.country }))),
    argSchemas: Object.freeze(Object.fromEntries(tools.map((tool) => [tool.name, tool.schema]))),
    risk: Object.freeze(Object.fromEntries(tools.map((tool) => [tool.name, tool.access === 'write' ? 'writes_books' : 'read_only']))),
    readTools: Object.freeze(tools.filter((tool) => tool.access === 'read').map((tool) => tool.name)),
    writeTools: Object.freeze(tools.filter((tool) => tool.access === 'write').map((tool) => tool.name)),
    ruleFamilies: Object.freeze(manifests.flatMap((manifest) => (manifest.ruleFamilies || []).map((family) => Object.freeze({ ...family, country: manifest.country })))),
    owners: new Map(tools.map((tool) => [tool.name, tool.country])),
  });
}

const TABLES = engineTables(MANIFESTS);

export const ENGINE_TOOL_DEFS = TABLES.toolDefs;
export const ENGINE_ARG_SCHEMAS = TABLES.argSchemas;
export const ENGINE_TOOL_RISK = TABLES.risk;
export const ENGINE_READ_TOOLS = TABLES.readTools;
export const ENGINE_WRITE_TOOLS = TABLES.writeTools;
export const ENGINE_RULE_FAMILIES = TABLES.ruleFamilies;

export function engineToolOwner(toolName) {
  return TABLES.owners.get(String(toolName || '')) || '';
}

export function manifestFor(code) {
  const wanted = String(code || '').trim().toUpperCase();
  return MANIFESTS.find((manifest) => manifest.country === wanted) || null;
}

export function countryCapabilities(code) {
  const wanted = String(code || '').trim().toUpperCase();
  const out = {};
  for (const manifest of MANIFESTS) {
    if (manifest.country !== wanted && manifest.country !== EVERY_COUNTRY) continue;
    for (const [name, capability] of Object.entries(manifest.capabilities || {})) out[name] = { status: capability.status, roles: { ...capability.roles } };
  }
  return out;
}

export function capabilityTool(code, capability, role) {
  return countryCapabilities(code)[capability]?.roles?.[role] || '';
}

export function manifestProblems(manifests = MANIFESTS, countryCodes = []) {
  const problems = [];
  const known = new Set(countryCodes);
  const seenCountry = new Set();
  const seenTool = new Map();
  const seenFamily = new Set();
  for (const manifest of manifests) {
    const code = manifest.country;
    if (code !== EVERY_COUNTRY && !/^[A-Z]{2}$/.test(String(code))) problems.push(`${code}: a manifest names one ISO country code, or ${EVERY_COUNTRY} for every country.`);
    if (code !== EVERY_COUNTRY && known.size && !known.has(code)) problems.push(`${code}: there is no country pack with this code.`);
    if (seenCountry.has(code)) problems.push(`${code}: only one manifest per country.`);
    seenCountry.add(code);
    const names = new Set();
    for (const tool of manifest.tools || []) {
      const at = `${code} ${tool.name}`;
      if (!TOOL_NAME.test(String(tool.name || ''))) problems.push(`${at}: a tool name is lower case words joined by underscores.`);
      if (code !== EVERY_COUNTRY && !String(tool.name || '').split('_').includes(code.toLowerCase())) problems.push(`${at}: a country's tool carries its code as one word of the name (for example ${code.toLowerCase()}_tax_estimate), so two countries never collide.`);
      if (seenTool.has(tool.name)) problems.push(`${at}: ${seenTool.get(tool.name)} already has a tool with this name.`);
      seenTool.set(tool.name, code);
      names.add(tool.name);
      if (typeof tool.title !== 'string' || !tool.title.trim()) problems.push(`${at}: a title is required.`);
      if (typeof tool.description !== 'string' || tool.description.trim().length < 20) problems.push(`${at}: a description the assistant can choose by is required.`);
      if (!TOOL_ACCESS.includes(tool.access)) problems.push(`${at}: access is read or write.`);
      if (!tool.schema || tool.schema.type !== 'object' || tool.schema.additionalProperties !== false || typeof tool.schema.properties !== 'object') problems.push(`${at}: the schema is an object schema with additionalProperties false and its properties listed.`);
      else for (const key of tool.schema.required || []) if (!Object.hasOwn(tool.schema.properties, key)) problems.push(`${at}: required argument ${key} is not among the properties.`);
    }
    const sorted = (manifest.tools || []).map((tool) => tool.name);
    if (!sorted.every((name, index) => index === 0 || sorted[index - 1] < name)) problems.push(`${code}: keep tools sorted by name, so that parallel branches merge cleanly.`);
    for (const [name, capability] of Object.entries(manifest.capabilities || {})) {
      const roles = CAPABILITIES[name];
      if (!roles) {
        problems.push(`${code}: ${name} is not a capability. Use one of ${Object.keys(CAPABILITIES).join(', ')}.`);
        continue;
      }
      if (!CAPABILITY_STATUSES.includes(capability.status)) problems.push(`${code} ${name}: status is one of ${CAPABILITY_STATUSES.join(', ')}.`);
      for (const [role, tool] of Object.entries(capability.roles || {})) {
        if (!roles.includes(role)) problems.push(`${code} ${name}: ${role} is not a role of this capability. Use one of ${roles.join(', ')}.`);
        if (!names.has(tool)) problems.push(`${code} ${name}: role ${role} names ${tool}, which is not one of this manifest's tools.`);
      }
    }
    for (const family of manifest.ruleFamilies || []) {
      const at = `${code} ${family.key}`;
      if (!FAMILY_KEY.test(String(family.key || ''))) problems.push(`${at}: a rule family key is lower case words joined by hyphens.`);
      if (seenFamily.has(family.key)) problems.push(`${at}: another manifest already has this rule family.`);
      seenFamily.add(family.key);
      if (typeof family.title !== 'string' || !family.title.trim()) problems.push(`${at}: a title is required.`);
      if (typeof family.prefix !== 'string' || !family.prefix.endsWith('.')) problems.push(`${at}: prefix is the start of the rule ids it covers, ending in a dot.`);
      if (code !== EVERY_COUNTRY && typeof family.prefix === 'string' && !family.prefix.startsWith(`${code.toLowerCase()}.`)) problems.push(`${at}: a country's rule ids start with its code (${code.toLowerCase()}.).`);
      if (!Array.isArray(family.watch) || !family.watch.length) problems.push(`${at}: say what to watch for a change in law.`);
    }
  }
  return problems;
}
