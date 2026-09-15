import { createState, loadState, saveState, seedDemo, defaultDataPath } from './store.mjs';
import { chat } from './router.mjs';
import { runTool, TOOLS } from './tools.mjs';
import { OSS_CATALOG } from './oss-catalog.mjs';
import { publicGovtConfig } from './govt.mjs';
import { integrationReadiness } from './integration-contract.mjs';
import { appendAuditEvent, handleCaApi, stateDigest } from './ca-api.mjs';
import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';

export function openSession(path = defaultDataPath()) {
  const state = seedDemo(loadState(path));
  saveState(path, state);
  let gate = Promise.resolve();
  const exclusive = (fn) => {
    const run = gate.then(fn, fn);
    gate = run.catch(() => {});
    return run;
  };
  return {
    path,
    state,
    persist() { saveState(path, state); },
    chat(message) {
      return exclusive(async () => {
        const beforeHash = stateDigest(state);
        const out = await chat(state, message);
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId: 'SELF',
          action: 'chat.run',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: {
            messageLength: String(message || '').length,
            tools: (out.tools || []).map((tool) => tool.name),
            blocked: Boolean(out.blocked),
          },
        });
        saveState(path, state);
        return out;
      });
    },
    tool(name, args) {
      return exclusive(async () => {
        const beforeHash = stateDigest(state);
        const out = await runTool(state, name, args);
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId: 'SELF',
          action: `tool.${name}`,
          beforeHash,
          afterHash: stateDigest(state),
          metadata: {
            ok: out.ok !== false,
            args: Object.keys(args || {}),
          },
        });
        saveState(path, state);
        return out;
      });
    },
    caApi(method, pathname, body = {}) {
      return exclusive(async () => {
        const out = handleCaApi(state, method, pathname, body);
        saveState(path, state);
        return out;
      });
    },
    snapshot() {
      return {
        company: state.company,
        invoices: state.invoices,
        purchases: state.purchases || [],
        tools: TOOLS.map(({ name, title, description }) => ({ name, title, description })),
        oss: OSS_CATALOG,
        govt: publicGovtConfig(),
        integrationReadiness: integrationReadiness(state.integrationConnections || {}),
        providerCatalog: {
          sandbox: {
            ...providerCatalog('sandbox'),
            requirements: providerRequirementMap('sandbox'),
          },
        },
        caApi: {
          clients: 1,
          documents: state.documents?.length || 0,
          auditEvents: state.auditEvents?.length || 0,
        },
      };
    },
    attachFile(kind, name, content) {
      return exclusive(async () => {
        const beforeHash = stateDigest(state);
        state.pendingFile = { kind, name, content };
        state.files[kind] = content;
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId: 'SELF',
          action: 'file.attach',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: { kind, name, bytes: content.length },
        });
        saveState(path, state);
        return { ok: true, kind, name, bytes: content.length };
      });
    },
  };
}

export { createState };
