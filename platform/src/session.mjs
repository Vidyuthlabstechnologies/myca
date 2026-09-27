import { createState, loadState, saveState, seedDemo, defaultDataPath, serialize, deserialize } from './store.mjs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { chat } from './router.mjs';
import { runTool, TOOLS } from './tools.mjs';
import { OSS_CATALOG } from './oss-catalog.mjs';
import { publicGovtConfig } from './govt.mjs';
import { integrationReadiness } from './integration-contract.mjs';
import { appendAuditEvent, handleCaApi, stateDigest, listClients, listDocuments } from './ca-api.mjs';
import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { putDocument, readDocument, documentExists } from './document-store.mjs';
import { getBook } from './books.mjs';
import { approvalStatus } from './approvals.mjs';
import { bookView } from './book-view.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';

function hydrateAttachments(book, dataDir) {
  book.attachments = book.attachments && typeof book.attachments === 'object' ? book.attachments : {};
  book.files = book.files && typeof book.files === 'object' ? book.files : {};
  for (const [key, attachment] of Object.entries(book.attachments)) {
    if (book.files[key] != null || !attachment?.sha256) continue;
    const content = readDocument(dataDir, attachment.sha256);
    if (content != null) book.files[key] = content;
  }
}

function allBooks(state) {
  return [state, ...Object.values(state.extraBooks || {})];
}

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
  for (const book of allBooks(state)) hydrateAttachments(book, state._dataDir);
  for (const doc of state.documents || []) {
    if (!doc || typeof doc !== 'object' || documentExists(state._dataDir, doc.sha256)) continue;
    const content = recoveredDocumentContent(state, legacy, doc);
    if (content == null) continue;
    const stored = putDocument(state._dataDir, content);
    doc.sha256 = stored.sha256;
    doc.bytes = stored.bytes;
  }
  delete state._legacyFiles;
}

function legacyDocumentHash(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function recoveredDocumentContent(state, legacy, doc) {
  const key = String(doc.legacyDocumentId ?? doc.documentId ?? '');
  const attached = Object.hasOwn(state.attachments, key) ? state.attachments[key]?.sha256 : null;
  const candidates = [Object.hasOwn(legacy, key) ? legacy[key] : null, attached ? readDocument(state._dataDir, attached) : null];
  return candidates.find((content) => typeof content === 'string' && (!doc.sha256 || doc.sha256 === legacyDocumentHash(content)));
}

function toolState(state) {
  const id = String(state.activeClientId || 'SELF');
  return bookView(state, id === 'SELF' ? state : getBook(state, id));
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
            awaitingConfirmation: Boolean(out.awaitingConfirmation),
            confirmed: Boolean(out.confirmed),
            posted: out.posted === true,
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
      for (const book of allBooks(state)) {
        for (const att of Object.values(book.attachments || {})) if (att?.sha256) hashes.add(att.sha256);
      }
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
        outbox: state.outbox || [],
        approvals: (state.approvals || []).map((a) => ({ ...a, status: approvalStatus(a) })),
        dataPath: path,
        liveCallsEnabled: liveCallsEnabled(),
        mockMode: mockModeEnabled(),
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
        const clientId = String(state.activeClientId || 'SELF');
        const book = getBook(state, clientId);
        const stored = putDocument(state._dataDir, content);
        book.attachments[kind] = {
          kind,
          name: String(name || kind),
          sha256: stored.sha256,
          bytes: stored.bytes,
          at: new Date().toISOString(),
        };
        book.files[kind] = String(content ?? '');
        book.pendingFile = { kind, name, sha256: stored.sha256 };
        appendAuditEvent(state, {
          actorId: 'renderer',
          clientId,
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
