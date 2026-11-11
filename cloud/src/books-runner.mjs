import { openSession } from '../../platform/src/session.mjs';
import { createMemoryBooksStore, createMemoryDocumentStore } from '../../platform/src/store-ports.mjs';
import { refreshIfDue, shareNow } from './ca-sync.mjs';
import { redactTinsDeep } from '../../platform/src/us-identity.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

function referencedHashes(state) {
  const hashes = new Set();
  const note = (value) => {
    if (typeof value === 'string' && SHA256.test(value)) hashes.add(value);
  };
  const books = [state, ...Object.values(state?.extraBooks || {})];
  for (const doc of state?.documents || []) note(doc?.sha256);
  for (const book of books) {
    for (const attachment of Object.values(book?.attachments || {})) note(attachment?.sha256);
    note(book?.pendingChatAction?.args?.documentSha256);
    for (const reminder of book?.reminders || []) note(reminder?.documentSha256);
  }
  return [...hashes];
}

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function signedOut() {
  const err = fail(401, 'UNAUTHENTICATED');
  err.body = { ok: false, error: 'UNAUTHENTICATED', reason: 'DEVICE_REVOKED' };
  return err;
}

// One request, one transaction. The row lock is what lets any number of server
// instances share a business: the second writer waits, then runs on the first one's
// result, so document numbers and the ledger chain never fork.

import { openState, storedState } from './books-seal.mjs';
export function createBooksRunner({ db, now = () => Date.now(), vault, booksKey = '' }) {
  const inside = (given, work) => (given ? work(given) : db.tx(work));

  async function open(q, businessId, sealedState, version, wanted = []) {
    const state = openState(booksKey, businessId, sealedState);
    const hashes = [...new Set([...referencedHashes(state), ...wanted.filter((hash) => SHA256.test(String(hash)))])];
    const stored = await vault.read(q, businessId, hashes);
    const books = createMemoryBooksStore({ text: JSON.stringify(state), version });
    const documents = createMemoryDocumentStore(stored.map((doc) => doc.content));
    const session = openSession({ books, documents, path: '' }, { seed: false });
    return { books, documents, session };
  }

  async function audit(q, businessId, context, events) {
    for (const event of events) {
      await q(
        `insert into audit_log (business_id, user_id, device_id, request_id, action, before_hash, after_hash, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          businessId,
          context.userId || null,
          context.deviceId || null,
          context.requestId || '',
          String(event.action || ''),
          String(event.beforeHash || ''),
          String(event.afterHash || ''),
          JSON.stringify(redactTinsDeep(event.metadata || {})),
        ],
      );
    }
  }

  async function stillSignedIn(q, context) {
    if (!context || !context.deviceId) return;
    const found = await q(
      'select 1 from devices d join users u on u.id = d.user_id where d.id = $1 and d.revoked_at is null and u.deleted_at is null',
      [context.deviceId],
    );
    if (!found.rowCount) throw signedOut();
  }

  async function lockLive(q, businessId, context) {
    const found = await q('select version, state from books where business_id = $1 for update', [businessId]);
    const row = found.rows[0];
    if (!row) throw fail(404, 'BUSINESS_NOT_FOUND');
    await stillSignedIn(q, context);
    await refreshIfDue(q, businessId, row, now());
    return row;
  }

  async function withBooks(businessId, context, run, { hashes: wanted = [], q: given = null } = {}) {
    return inside(given, async (q) => {
      const row = await lockLive(q, businessId, context);
      const { books, documents, session } = await open(q, businessId, row.state, row.version, wanted);
      const auditedBefore = session.state.auditEvents.length;
      const out = await run(session, q);
      await q('update books set state = $2::jsonb, version = version + 1, updated_at = now() where business_id = $1', [
        businessId,
        storedState(booksKey, businessId, books.stored()),
      ]);
      for (const doc of documents.added()) await vault.write(q, businessId, doc);
      await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore));
      await stillSignedIn(q, context);
      return out;
    });
  }

  async function replaceBooks(businessId, context, payload, { q: given = null } = {}) {
    return inside(given, async (q) => {
      const row = await lockLive(q, businessId, context);
      const { books, documents, session } = await open(q, businessId, row.state, row.version);
      const before = { invoices: session.state.invoices.length, version: Number(row.version) };
      const out = await session.restore({ ...payload, confirm: true });
      if (out.ok === false) return out;
      await q('update books set state = $2::jsonb, version = version + 1, updated_at = now() where business_id = $1', [businessId, storedState(booksKey, businessId, books.stored())]);
      let stored = 0;
      for (const doc of documents.added()) {
        await vault.write(q, businessId, doc);
        stored += 1;
      }
      await q(
        `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata) values ($1, $2, $3, $4, 'books.replaced', $5::jsonb)`,
        [businessId, context.userId || null, context.deviceId || null, context.requestId || '', JSON.stringify({ before, after: { invoices: out.restored.invoices, documents: out.restored.documents, documentsStored: stored }, exportedAt: payload.exportedAt || '' })],
      );
      await stillSignedIn(q, context);
      return { ...out, replaced: true, documentsStored: stored };
    });
  }

  async function withReadOnlyBooks(businessId, context, run, { q: given = null } = {}) {
    return inside(given, async (q) => {
      const found = await q('select version, state from books where business_id = $1 for share', [businessId]);
      const row = found.rows[0];
      if (!row) throw fail(404, 'BUSINESS_NOT_FOUND');
      await stillSignedIn(q, context);
      const { session } = await open(q, businessId, row.state, row.version);
      const auditedBefore = session.state.auditEvents.length;
      const out = await run(session, q);
      await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore));
      return out;
    });
  }

  async function withSharedBooks(businessId, context, run, { q: given = null } = {}) {
    return inside(given, async (q) => {
      await lockLive(q, businessId, context);
      const found = await q('select version, state, as_of from shared_books where business_id = $1', [businessId]);
      const shared = found.rows[0];
      if (!shared) throw fail(409, 'NOT_SHARED_YET');
      const { session } = await open(q, businessId, shared.state, shared.version);
      const auditedBefore = session.state.auditEvents.length;
      const out = await run(session, { asOf: shared.as_of }, q);
      await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore));
      return out;
    });
  }

  async function share(businessId, userId) {
    return db.tx(async (q) => {
      const row = await lockLive(q, businessId);
      return shareNow(q, businessId, row, userId, now());
    });
  }

  return { withBooks, withReadOnlyBooks, withSharedBooks, share, replaceBooks };
}
