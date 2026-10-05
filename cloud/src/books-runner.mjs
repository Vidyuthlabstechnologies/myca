import { openSession } from '../../platform/src/session.mjs';
import { createMemoryBooksStore, createMemoryDocumentStore } from '../../platform/src/store-ports.mjs';

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
  }
  return [...hashes];
}

function notFound() {
  const err = new Error('BUSINESS_NOT_FOUND');
  err.statusCode = 404;
  return err;
}

// One request, one transaction. The row lock is what lets any number of server
// instances share a business: the second writer waits, then runs on the first one's
// result, so document numbers and the ledger chain never fork.
export function createBooksRunner({ db }) {
  return async function withBooks(businessId, context, run, { hashes: wanted = [] } = {}) {
    return db.tx(async (q) => {
      const found = await q('select version, state from books where business_id = $1 for update', [businessId]);
      const row = found.rows[0];
      if (!row) throw notFound();
      const hashes = [...new Set([...referencedHashes(row.state), ...wanted.filter((hash) => SHA256.test(String(hash)))])];
      const stored = hashes.length
        ? await q('select content from documents where business_id = $1 and sha256 = any($2)', [businessId, hashes])
        : { rows: [] };
      const books = createMemoryBooksStore({ text: JSON.stringify(row.state), version: row.version });
      const documents = createMemoryDocumentStore(stored.rows.map((doc) => doc.content));
      const session = openSession({ books, documents, path: '' }, { seed: false });
      const auditedBefore = session.state.auditEvents.length;
      const out = await run(session);
      await q('update books set state = $2::jsonb, version = version + 1, updated_at = now() where business_id = $1', [
        businessId,
        books.stored(),
      ]);
      for (const doc of documents.added()) {
        await q(
          'insert into documents (business_id, sha256, content, bytes) values ($1, $2, $3, $4) on conflict do nothing',
          [businessId, doc.sha256, doc.content, Buffer.byteLength(doc.content, 'utf8')],
        );
      }
      for (const event of session.state.auditEvents.slice(auditedBefore)) {
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
            JSON.stringify(event.metadata || {}),
          ],
        );
      }
      return out;
    });
  };
}
