import { MANIFESTS } from './manifests.mjs';
import { ENGINE as SHARED } from './shared/engine.mjs';
import { ENGINE as MALAYSIA } from './malaysia/engine.mjs';

const KINDS = Object.freeze(['run', 'preview', 'words']);

function engines() {
  return [
    SHARED,
    MALAYSIA,
  ];
}

function behaviour(kind, name) {
  const wanted = String(name || '');
  for (const engine of engines()) {
    const table = engine[kind];
    if (table && Object.hasOwn(table, wanted)) return table[wanted];
  }
  return null;
}

export function engineRun(name) {
  return behaviour('run', name);
}

export function enginePreview(name) {
  return behaviour('preview', name);
}

export function engineWords(name) {
  return behaviour('words', name);
}

export function runEngineTool(name, state, args = {}) {
  const run = engineRun(name);
  return run ? run(state, args) : { ok: false, error: 'ENGINE_TOOL_NOT_BUILT', tool: String(name) };
}

export function engineProblems(manifests = MANIFESTS, list = engines()) {
  const problems = [];
  const byCountry = new Map(list.map((engine) => [engine.country, engine]));
  if (byCountry.size !== list.length) problems.push('Only one engine per country.');
  for (const engine of list) if (!manifests.some((manifest) => manifest.country === engine.country)) problems.push(`${engine.country}: this engine has no manifest.`);
  for (const manifest of manifests) {
    const engine = byCountry.get(manifest.country);
    if (!engine) {
      problems.push(`${manifest.country}: this manifest has no engine.`);
      continue;
    }
    const tools = new Map(manifest.tools.map((tool) => [tool.name, tool]));
    for (const tool of manifest.tools) {
      if (typeof engine.run?.[tool.name] !== 'function') problems.push(`${manifest.country} ${tool.name}: the engine has no run function for this tool.`);
      if (tool.access === 'write' && typeof engine.preview?.[tool.name] !== 'function') problems.push(`${manifest.country} ${tool.name}: a tool that writes needs a preview, so the owner confirms before anything is posted.`);
      if (tool.access === 'read' && engine.preview?.[tool.name]) problems.push(`${manifest.country} ${tool.name}: a read-only tool has no preview.`);
    }
    for (const kind of KINDS) {
      for (const name of Object.keys(engine[kind] || {})) {
        if (!tools.has(name)) problems.push(`${manifest.country} ${name}: the engine has a ${kind} function for a tool its manifest does not list.`);
        else if (typeof engine[kind][name] !== 'function') problems.push(`${manifest.country} ${name}: ${kind} must be a function.`);
      }
    }
  }
  return problems;
}
