import { createState, seedDemo, defaultDataPath, serialize, deserialize } from './store.mjs';
import { createFileStores } from './store-ports.mjs';
import { createHash } from 'node:crypto';
import { chat, propose, confirmPending, discardPending } from './router.mjs';
import { isRemoteQuery, companyProfilePatch } from './remote-contract.mjs';
import { runTool, TOOLS } from './tools.mjs';
import { OSS_CATALOG } from './oss-catalog.mjs';
import { publicGovtConfig } from './govt.mjs';
import { integrationReadiness } from './integration-contract.mjs';
import { appendAuditEvent, handleCaApi, stateDigest, listClients, listDocuments } from './ca-api.mjs';
import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { getBook } from './books.mjs';
import { approvalStatus } from './approvals.mjs';
import { bookView } from './book-view.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { findUser, verifyUserPin, listUsers, withoutPin, pinRecords, applyPinRecords } from './identity.mjs';

function hydrateAttachments(book, documents) {
  book.attachments = book.attachments && typeof book.attachments === 'object' ? book.attachments : {};
  book.files = book.files && typeof book.files === 'object' ? book.files : {};
  for (const [key, attachment] of Object.entries(book.attachments)) {
    if (book.files[key] != null || !attachment?.sha256) continue;
    const content = documents.read(attachment.sha256);
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
    const stored = state._documents.put(content);
    state.files[key] = content;
    state.attachments[key] = {
      kind: key,
      name: state.attachments[key]?.name || key,
      sha256: stored.sha256,
      bytes: stored.bytes,
      at: state.attachments[key]?.at || new Date().toISOString(),
    };
  }
  for (const book of allBooks(state)) hydrateAttachments(book, state._documents);
  for (const doc of state.documents || []) {
    if (!doc || typeof doc !== 'object' || state._documents.exists(doc.sha256)) continue;
    const content = recoveredDocumentContent(state, legacy, doc);
    if (content == null) continue;
    const stored = state._documents.put(content);
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
  const candidates = [Object.hasOwn(legacy, key) ? legacy[key] : null, attached ? state._documents.read(attached) : null];
  return candidates.find((content) => typeof content === 'string' && (!doc.sha256 || doc.sha256 === legacyDocumentHash(content)));
}

function toolState(state, actor = null) {
  const id = String(state.activeClientId || 'SELF');
  return bookView(state, id === 'SELF' ? state : getBook(state, id), { actor });
}

function trustedActor(options) {
  const actor = options && options.actor;
  if (!actor || typeof actor !== 'object' || !actor.userId) return null;
  return { userId: String(actor.userId), role: String(actor.role || ''), name: String(actor.name || actor.userId) };
}

function conflict(error) {
  const err = new Error(error);
  err.statusCode = 409;
  return err;
}

export function openSession(target = defaultDataPath(), { seed = true } = {}) {
  const stores = typeof target === 'string' ? createFileStores(target) : target;
  const path = stores.path || '';
  const loaded = stores.books.load();
  const state = seed ? seedDemo(loaded.state) : loaded.state;
  let version = loaded.version;
  const saveBooks = () => {
    const saved = stores.books.save(state, version);
    if (!saved.ok) throw conflict(saved.error);
    version = saved.version;
  };
  state._documents = stores.documents;
  hydrateDocuments(state);
  saveBooks();
  let activeUser = null;
  let sessionExpiresAt = 0;
  const currentActor = () => {
    if (activeUser && sessionExpiresAt > Date.now()) {
      sessionExpiresAt = Date.now() + 30 * 60 * 1000;
      return activeUser;
    }
    activeUser = null;
    return null;
  };
  const actorOf = (options) => trustedActor(options) || currentActor();
  let gate = Promise.resolve();
  const exclusive = (fn) => {
    const run = gate.then(fn, fn);
    gate = run.catch(() => {});
    return run;
  };
  return {
    path,
    state,
    persist() { saveBooks(); },
    signIn(userId, pin) {
      return exclusive(async () => {
        const user = findUser(state, userId);
        const verified = verifyUserPin(user, pin);
        if (!verified.ok) return verified;
        activeUser = verified.user;
        sessionExpiresAt = Date.now() + 30 * 60 * 1000;
        appendAuditEvent(state, {
          actorId: activeUser.userId,
          clientId: String(state.activeClientId || 'SELF'),
          action: 'session.login',
          beforeHash: stateDigest(state),
          afterHash: stateDigest(state),
          metadata: { userId: activeUser.userId, role: activeUser.role },
        });
        saveBooks();
        return { ok: true, user: activeUser };
      });
    },
    signOut() {
      return exclusive(async () => {
        const prev = activeUser?.userId || 'none';
        activeUser = null;
        sessionExpiresAt = 0;
        appendAuditEvent(state, {
          actorId: prev,
          clientId: String(state.activeClientId || 'SELF'),
          action: 'session.logout',
          beforeHash: stateDigest(state),
          afterHash: stateDigest(state),
          metadata: { prevUser: prev },
        });
        saveBooks();
        return { ok: true };
      });
    },
    activeUser() {
      return currentActor();
    },
    chat(message, options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const beforeHash = stateDigest(state);
        const view = toolState(state, trustedActor(options));
        const out = await chat(view, message);
        appendAuditEvent(state, {
          actorId: actor?.userId || 'renderer',
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
        saveBooks();
        return out;
      });
    },
    propose(name, args, options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const beforeHash = stateDigest(state);
        const out = propose(toolState(state, trustedActor(options)), name, args);
        appendAuditEvent(state, {
          actorId: actor?.userId || 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
          action: 'chat.propose',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: {
            tool: String(name || ''),
            args: Object.keys(args || {}),
            blocked: Boolean(out.blocked),
            awaitingConfirmation: Boolean(out.awaitingConfirmation),
          },
        });
        saveBooks();
        return out;
      });
    },
    confirm(token, options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const beforeHash = stateDigest(state);
        const out = await confirmPending(toolState(state, trustedActor(options)), token);
        appendAuditEvent(state, {
          actorId: actor?.userId || 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
          action: 'chat.confirm',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: {
            tools: (out.tools || []).map((tool) => tool.name),
            posted: out.posted === true,
            replayed: out.replayed === true,
            error: out.error || '',
          },
        });
        saveBooks();
        return out;
      });
    },
    discard(options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const beforeHash = stateDigest(state);
        const out = discardPending(toolState(state, trustedActor(options)));
        appendAuditEvent(state, {
          actorId: actor?.userId || 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
          action: 'chat.discard',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: {},
        });
        saveBooks();
        return out;
      });
    },
    query(name, args, options) {
      if (!isRemoteQuery(name)) return Promise.resolve({ ok: false, error: 'NOT_QUERYABLE', tool: String(name || '') });
      return this.tool(name, args || {}, options);
    },
    updateCompany(fields, options) {
      return this.tool('set_company', companyProfilePatch(fields), options);
    },
    tool(name, args, options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const beforeHash = stateDigest(state);
        const view = toolState(state, trustedActor(options));
        const out = await runTool(view, name, args);
        appendAuditEvent(state, {
          actorId: actor?.userId || 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
          action: `tool.${name}`,
          beforeHash,
          afterHash: stateDigest(state),
          metadata: {
            ok: out.ok !== false,
            args: Object.keys(args || {}),
          },
        });
        saveBooks();
        return out;
      });
    },
    caApi(method, pathname, body = {}) {
      return exclusive(async () => {
        const out = handleCaApi(state, method, pathname, body);
        saveBooks();
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
        const content = stores.documents.read(sha);
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
          if (typeof content === 'string') stores.documents.put(content);
        }
        next._dataDir = state._dataDir;
        next._documents = stores.documents;
        next.firmUsers = (next.firmUsers || []).map(withoutPin);
        applyPinRecords(next, pinRecords(state));
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, next);
        hydrateDocuments(state);
        saveBooks();
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
        expenses: view.expenses || [],
        creditNotes: view.creditNotes || [],
        customerTerms: view.customerTerms || {},
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
        activeUser: currentActor(),
        users: listUsers(state),
      };
    },
    uploadDocument(name, content, options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const text = typeof content === 'string' ? content : '';
        if (!text) return { ok: false, error: 'EMPTY_FILE' };
        const beforeHash = stateDigest(state);
        const stored = stores.documents.put(text);
        appendAuditEvent(state, {
          actorId: actor?.userId || 'renderer',
          clientId: String(state.activeClientId || 'SELF'),
          action: 'file.upload',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: { name: String(name || '').slice(0, 120), bytes: stored.bytes, sha256: stored.sha256 },
        });
        saveBooks();
        return { ok: true, sha256: stored.sha256, bytes: stored.bytes };
      });
    },
    attachFile(kind, name, content, options) {
      return exclusive(async () => {
        const actor = actorOf(options);
        const beforeHash = stateDigest(state);
        const clientId = String(state.activeClientId || 'SELF');
        const book = getBook(state, clientId);
        const stored = stores.documents.put(content);
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
          actorId: actor?.userId || 'renderer',
          clientId,
          action: 'file.attach',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: { kind, name, bytes: stored.bytes, sha256: stored.sha256 },
        });
        saveBooks();
        return { ok: true, kind, name, bytes: stored.bytes, sha256: stored.sha256 };
      });
    },
  };
}

export { createState };
