export const BOOK_KEYS = new Set([
  'company', 'ledger', 'parties', 'vendors', 'invoices', 'purchases',
  'invoiceSeq', 'billSeq', 'transferSeq', 'imports', 'lockThrough',
]);

export const FIRM_KEYS = new Set([
  'files', 'attachments', 'pendingFile',
  'integrationConnections', 'documents', 'documentSeq', 'firmUsers',
  'auditEvents', 'auditSeq', 'clients', 'extraBooks',
  'approvals', 'approvalSeq', 'activeClientId',
  'outbox', 'outboxSeq', '_dataDir', '_legacyFiles',
]);

function ownerOf(root, book, key) {
  if (typeof key !== 'string') return null;
  if (BOOK_KEYS.has(key)) return book;
  if (FIRM_KEYS.has(key)) return root;
  return null;
}

export function bookView(root, book) {
  return new Proxy(root, {
    get(target, key) {
      if (key === '__root') return target;
      if (key === '__book') return book;
      const owner = ownerOf(target, book, key);
      return owner ? owner[key] : Reflect.get(target, key);
    },
    set(target, key, value) {
      const owner = ownerOf(target, book, key);
      if (!owner) throw new Error(`VIEW_WRITE_UNKNOWN_KEY:${String(key)}`);
      owner[key] = value;
      return true;
    },
    deleteProperty(target, key) {
      const owner = ownerOf(target, book, key);
      if (!owner) throw new Error(`VIEW_WRITE_UNKNOWN_KEY:${String(key)}`);
      delete owner[key];
      return true;
    },
    has(target, key) {
      const owner = ownerOf(target, book, key);
      return owner ? key in owner : key in target;
    },
  });
}
