import { openSession } from '../../platform/src/session.mjs';
import { createMemoryBooksStore, createMemoryDocumentStore } from '../../platform/src/store-ports.mjs';
import { refreshIfDue, shareNow } from './ca-sync.mjs';
import { redactTinsDeepFor } from '../../platform/src/us-identity.mjs';
import { countryOf } from '../../platform/src/country.mjs';
import { storeWatch, settleStore } from './store-front.mjs';
import { withProviderJournal } from '../../platform/src/provider-journal.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const CLAIM_SEQ = 0;
const CLAIM_MS = 2 * 60 * 1000;
export const JOURNAL_REPLAY_MS = 30 * 60 * 1000;
export const JOURNAL_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const COMMIT_ATTEMPTS = 3;

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

function identityOf(state) {
  const company = state?.company || {};
  const registrations = (company.registrations || []).map((reg) => String(reg?.gstin || '')).sort();
  return JSON.stringify([company.name || '', company.gstin || '', company.pan || '', company.country || '', registrations]);
}

function demoIdentityFixed() {
  const err = fail(403, 'DEMO_BUSINESS');
  err.body = { ok: false, error: 'DEMO_BUSINESS', hint: 'This is a demo business with fictional data, so its name, GSTIN and registrations stay as they are. Create your own business to keep real books.' };
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

  async function audit(q, businessId, context, events, state) {
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
          JSON.stringify(redactTinsDeepFor(countryOf(state), event.metadata || {})),
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
      const demo = (await q('select demo from businesses where id = $1', [businessId])).rows[0]?.demo === true;
      const identity = demo ? identityOf(session.state) : '';
      const watched = storeWatch(session.state);
      const out = await run(session, q);
      if (demo && identityOf(session.state) !== identity) throw demoIdentityFixed();
      await settleStore(q, businessId, session, watched);
      await q('update books set state = $2::jsonb, version = version + 1, updated_at = now() where business_id = $1', [
        businessId,
        storedState(booksKey, businessId, books.stored()),
      ]);
      for (const doc of documents.added()) await vault.write(q, businessId, doc);
      await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore), session.state);
      await stillSignedIn(q, context);
      return out;
    });
  }

  async function replaceBooks(businessId, context, payload, { q: given = null } = {}) {
    return inside(given, async (q) => {
      const row = await lockLive(q, businessId, context);
      const { books, documents, session } = await open(q, businessId, row.state, row.version);
      const before = { invoices: session.state.invoices.length, version: Number(row.version) };
      const watched = storeWatch(session.state) || { snapshot: '', chosen: '', statuses: new Map() };
      const out = await session.restore({ ...payload, confirm: true });
      if (out.ok === false) return out;
      await settleStore(q, businessId, session, watched);
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
      await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore), session.state);
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
      await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore), session.state);
      return out;
    });
  }

  async function share(businessId, userId) {
    return db.tx(async (q) => {
      const row = await lockLive(q, businessId);
      return shareNow(q, businessId, row, userId, now());
    });
  }

  function journalFor(businessId, key, replayMs, log) {
    const seen = new Map();
    return {
      async load() {
        const found = await db.query('select seq, fingerprint, response from provider_journal where business_id = $1 and key = $2 and seq > $3 and created_at > $4', [businessId, key, CLAIM_SEQ, new Date(now() - replayMs)]);
        for (const row of found.rows) {
          try {
            seen.set(row.seq, { fingerprint: row.fingerprint, response: openState(booksKey, businessId, row.response) });
          } catch {
            continue;
          }
        }
      },
      lookup(seq, fingerprint) {
        const hit = seen.get(seq);
        return hit && hit.fingerprint === fingerprint ? hit.response : null;
      },
      async record(seq, fingerprint, response) {
        seen.set(seq, { fingerprint, response });
        try {
          await db.query(
            `insert into provider_journal (business_id, key, seq, fingerprint, response) values ($1, $2, $3, $4, $5::jsonb)
             on conflict (business_id, key, seq) do update set fingerprint = excluded.fingerprint, response = excluded.response, created_at = now()`,
            [businessId, key, seq, fingerprint, storedState(booksKey, businessId, JSON.stringify(response))],
          );
        } catch (err) {
          log({ providerJournal: 'could not record a provider answer', error: String(err && err.message ? err.message : err) });
        }
      },
    };
  }

  async function claim(businessId, key) {
    const taken = await db.query(
      `insert into provider_journal (business_id, key, seq, fingerprint, response) values ($1, $2, $3, 'claim', '{}'::jsonb)
       on conflict (business_id, key, seq) do update set created_at = now() where provider_journal.created_at < $4
       returning seq`,
      [businessId, key, CLAIM_SEQ, new Date(now() - CLAIM_MS)],
    );
    return taken.rowCount > 0;
  }

  async function release(businessId, key) {
    await db.query('delete from provider_journal where business_id = $1 and key = $2 and seq = $3', [businessId, key, CLAIM_SEQ]).catch(() => {});
  }

  // For work that calls a government or other provider. The books are read without a lock,
  // the work runs in memory with no transaction open, and a short transaction then writes the
  // result only if nobody else changed the books meanwhile. Every provider answer is recorded
  // the moment it arrives, so a retry after a failed commit, a crash or a changed book replays
  // the answer and never calls the provider a second time.
  async function withProviderBooks(businessId, context, run, { key = '', hashes: wanted = [], replayMs = JOURNAL_REPLAY_MS, log = () => {} } = {}) {
    const keyed = String(key || '');
    if (keyed && !(await claim(businessId, keyed))) {
      const err = fail(409, 'PROVIDER_CALL_IN_PROGRESS');
      err.body = { ok: false, error: 'PROVIDER_CALL_IN_PROGRESS', hint: 'The same request is already being sent. Wait a moment and look again before sending it twice.' };
      throw err;
    }
    try {
      const journal = keyed ? journalFor(businessId, keyed, replayMs, log) : null;
      for (let attempt = 1; attempt <= COMMIT_ATTEMPTS; attempt += 1) {
        if (journal) await journal.load();
        const found = await db.query('select version, state from books where business_id = $1', [businessId]);
        const row = found.rows[0];
        if (!row) throw fail(404, 'BUSINESS_NOT_FOUND');
        await stillSignedIn(db.query, context);
        const { books, documents, session } = await open(db.query, businessId, row.state, row.version, wanted);
        const auditedBefore = session.state.auditEvents.length;
        const demo = (await db.query('select demo from businesses where id = $1', [businessId])).rows[0]?.demo === true;
        const identity = demo ? identityOf(session.state) : '';
        const watched = storeWatch(session.state);
        const out = journal ? await withProviderJournal(journal, () => run(session, db.query)) : await run(session, db.query);
        const committed = await db.tx(async (q) => {
          const locked = await q('select version, state from books where business_id = $1 for update', [businessId]);
          const current = locked.rows[0];
          if (!current) throw fail(404, 'BUSINESS_NOT_FOUND');
          if (Number(current.version) !== Number(row.version)) return { changed: true };
          await stillSignedIn(q, context);
          await refreshIfDue(q, businessId, current, now());
          if (demo && identityOf(session.state) !== identity) throw demoIdentityFixed();
          await settleStore(q, businessId, session, watched);
          await q('update books set state = $2::jsonb, version = version + 1, updated_at = now() where business_id = $1', [businessId, storedState(booksKey, businessId, books.stored())]);
          for (const doc of documents.added()) await vault.write(q, businessId, doc);
          await audit(q, businessId, context, session.state.auditEvents.slice(auditedBefore), session.state);
          return { changed: false };
        });
        if (!committed.changed) return out;
      }
      const err = fail(409, 'BOOKS_CHANGED');
      err.body = { ok: false, error: 'BOOKS_CHANGED', hint: 'The books were changed by someone else while this was being sent. Nothing was sent twice; look at the books and try again.' };
      throw err;
    } finally {
      if (keyed) await release(businessId, keyed);
    }
  }

  async function pendingToolName(businessId) {
    const found = await db.query('select state from books where business_id = $1', [businessId]);
    if (!found.rows[0]) return '';
    const state = openState(booksKey, businessId, found.rows[0].state);
    return String(state?.pendingChatAction?.name || '');
  }

  return { withBooks, withProviderBooks, pendingToolName, withReadOnlyBooks, withSharedBooks, share, replaceBooks };
}
