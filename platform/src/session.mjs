import { createState, loadState, saveState, seedDemo, defaultDataPath, serialize, deserialize } from './store.mjs';
import { dirname } from 'node:path';
import { chat } from './router.mjs';
import { runTool, TOOLS } from './tools.mjs';
import { OSS_CATALOG } from './oss-catalog.mjs';
import { publicGovtConfig } from './govt.mjs';
import { integrationReadiness } from './integration-contract.mjs';
import { appendAuditEvent, handleCaApi, stateDigest, listClients, listDocuments } from './ca-api.mjs';
import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { putDocument, readDocument } from './document-store.mjs';
import { getBook } from './books.mjs';
import { approvalStatus } from './approvals.mjs';
import { liveCallsEnabled } from './runtime-config.mjs';

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

// Tools receive a book-shaped view: the active client's ledger and invoices sit on top
// of the root infra state (audit, attachments, integration registry, approvals).
function toolState(state) {
  const id = String(state.activeClientId || 'SELF');
  if (id === 'SELF') return state;
  const book = getBook(state, id);
  return { ...state, ...book, __book: book };
}

function syncView(view, state) {
  if (!view || view === state) return;
  if (view.__book) {
    view.__book.invoiceSeq = view.invoiceSeq;
    view.__book.billSeq = view.billSeq;
    view.__book.transferSeq = view.transferSeq;
  }
  state.activeClientId = view.activeClientId;
  state.pendingFile = view.pendingFile;
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
        const view = toolState(state);
        const out = await chat(view, message);
        syncView(view, state);
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
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
        const view = toolState(state);
        const out = await runTool(view, name, args);
        syncView(view, state);
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
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
    backup() {
      const documents = {};
      const hashes = new Set();
      for (const doc of state.documents || []) if (doc.sha256) hashes.add(doc.sha256);
      for (const att of Object.values(state.attachments || {})) if (att?.sha256) hashes.add(att.sha256);
      for (const sha of hashes) {
        const content = readDocument(state._dataDir, sha);
        if (content != null) documents[sha] = content;
      }
      return {
        version: 1,
        app: 'MyCA',
        exportedAt: new Date().toISOString(),
        // Deep clone: serialize() hands back live array references, so without this
        // the "snapshot" would keep mutating alongside the open books.
        state: JSON.parse(JSON.stringify(serialize(state))),
        documents,
      };
    },
    restore(payload) {
      return exclusive(async () => {
        if (!payload || payload.version !== 1 || !payload.state || typeof payload.state !== 'object') {
          return { ok: false, error: 'INVALID_BACKUP' };
        }
        if (payload.confirm !== true) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
        let next;
        try {
          next = deserialize(payload.state);
        } catch {
          return { ok: false, error: 'INVALID_BACKUP' };
        }
        if (!next.ledger || !Array.isArray(next.invoices)) return { ok: false, error: 'INVALID_BACKUP' };
        for (const content of Object.values(payload.documents || {})) {
          if (typeof content === 'string') putDocument(state._dataDir, content);
        }
        next._dataDir = state._dataDir;
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, next);
        hydrateDocuments(state);
        saveState(path, state);
        return {
          ok: true,
          restored: {
            invoices: state.invoices.length,
            clients: (state.clients || []).length,
            documents: (state.documents || []).length,
          },
        };
      });
    },
    snapshot() {
      const view = toolState(state);
      const active = listClients(state);
      return {
        company: view.company,
        invoices: view.invoices || [],
        purchases: view.purchases || [],
        activeClientId: active.activeClientId,
        clients: active.clients,
        documents: listDocuments(state, active.activeClientId).data?.documents || [],
        approvals: (state.approvals || []).map((a) => ({ ...a, status: approvalStatus(a) })),
        dataPath: path,
        liveCallsEnabled: liveCallsEnabled(),
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
          clients: active.clients.length,
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
