import { createState, loadState, saveState, seedDemo, defaultDataPath } from './store.mjs';
import { dirname } from 'node:path';
import { chat } from './router.mjs';
import { runTool, TOOLS } from './tools.mjs';
import { OSS_CATALOG } from './oss-catalog.mjs';
import { publicGovtConfig } from './govt.mjs';
import { integrationReadiness } from './integration-contract.mjs';
import { appendAuditEvent, handleCaApi, stateDigest } from './ca-api.mjs';
import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { putDocument, readDocument } from './document-store.mjs';

function hydrateDocuments(state) {
  state.attachments = state.attachments && typeof state.attachments === 'object' ? state.attachments : {};
  state.files = state.files && typeof state.files === 'object' ? state.files : {};
  const legacy = state._legacyFiles && typeof state._legacyFiles === 'object' ? state._legacyFiles : {};
  for (const [key, content] of Object.entries(legacy)) {
    if (typeof content !== 'string') continue;
    const stored = putDocument(state._dataDir, content);
    state.files[key] = content;
    state.attachments[key] = {
      kind: key,
      name: state.attachments[key]?.name || key,
      sha256: stored.sha256,
      bytes: stored.bytes,
      at: state.attachments[key]?.at || new Date().toISOString(),
    };
  }
  for (const [key, attachment] of Object.entries(state.attachments)) {
    if (state.files[key] != null || !attachment?.sha256) continue;
    const content = readDocument(state._dataDir, attachment.sha256);
    if (content != null) state.files[key] = content;
  }
  for (const doc of state.documents || []) {
    if (doc.sha256) continue;
    const content = legacy[doc.documentId];
    if (typeof content !== 'string') continue;
    const stored = putDocument(state._dataDir, content);
    doc.sha256 = stored.sha256;
    doc.bytes = stored.bytes;
  }
  delete state._legacyFiles;
}

export function openSession(path = defaultDataPath()) {
  const state = seedDemo(loadState(path));
  state._dataDir = dirname(path);
  hydrateDocuments(state);
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
        const stored = putDocument(state._dataDir, content);
        state.attachments[kind] = {
          kind,
          name: String(name || kind),
          sha256: stored.sha256,
          bytes: stored.bytes,
          at: new Date().toISOString(),
        };
        state.files[kind] = String(content ?? '');
        state.pendingFile = { kind, name, sha256: stored.sha256 };
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId: 'SELF',
          action: 'file.attach',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: { kind, name, bytes: stored.bytes, sha256: stored.sha256 },
        });
        saveState(path, state);
        return { ok: true, kind, name, bytes: stored.bytes, sha256: stored.sha256 };
      });
    },
  };
}

export { createState };
