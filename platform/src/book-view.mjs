export const BOOK_KEYS = new Set([
  'company', 'ledger', 'parties', 'vendors', 'invoices', 'purchases',
  'invoiceSeq', 'invoiceSeqByFy', 'billSeq', 'transferSeq', 'imports', 'lockThrough',
  'files', 'attachments', 'pendingFile', 'pendingChatAction', 'lastConfirmation',
  'exceptions', 'exceptionSeq',
  'expenses', 'expenseSeq', 'expenseTags',
  'creditNotes', 'creditNoteSeq',
  'debitNotes', 'debitNoteSeq', 'purchaseNotes', 'purchaseNoteSeq',
  'gstReviews', 'gstr2b', 'monthCloses', 'purchaseOrders', 'purchaseOrderSeq', 'advanceTaxPayments', 'reports', 'tallyPushes', 'dscSignatures',
  'reminders', 'reminderSeq',
  'cashReadings', 'customerTerms', 'supplierTerms',
  'caRequests', 'caRequestSeq',
  'quotes', 'quoteSeq',
  'filings',
  'supplierReminders', 'supplierReminderSeq', 'collectionReminders', 'collectionReminderSeq',
  'employees', 'employeeSeq',
  'tdsEntries', 'tdsDeposits',
  'gstCreditOpening', 'tdsReviews', 'payrollRuns', 'salesTaxRates', 'salesTaxNexus', 'salesTaxReviews', 'salesTaxPayments', 'gstPayments', 'sutaRates', 'yearClosings', 'automation', 'amendmentSeq', 'chatRecent',
  'settlements', 'settlementSeq', 'channels', 'tcsStatements', 'tdsCreditStatements', 'skus', 'stockMoves', 'inventoryValuations', 'portalSaves', 'tdsFvuJobs',
]);

export const FIRM_KEYS = new Set([
  'integrationConnections', 'documents', 'documentSeq', 'firmUsers',
  'auditEvents', 'auditSeq', 'clients', 'extraBooks',
  'approvals', 'approvalSeq', 'activeClientId',
  'outbox', 'outboxSeq', '_dataDir', '_documents', '_legacyFiles',
  'dryRuns', 'dryRunSeq',
  'documentRequests', 'documentRequestSeq', 'evalEvents', 'evalEventSeq',
]);

function ownerOf(root, book, key) {
  if (typeof key !== 'string') return null;
  if (BOOK_KEYS.has(key)) return book;
  if (FIRM_KEYS.has(key)) return root;
  return null;
}

export function bookView(root, book, context = {}) {
  const actor = context && context.actor ? Object.freeze({ ...context.actor }) : null;
  return new Proxy(root, {
    get(target, key) {
      if (key === '__root') return target;
      if (key === '__book') return book;
      if (key === '__actor') return actor;
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
    defineProperty(target, key, descriptor) {
      const owner = ownerOf(target, book, key);
      if (!owner) throw new Error(`VIEW_WRITE_UNKNOWN_KEY:${String(key)}`);
      return Reflect.defineProperty(owner, key, descriptor);
    },
    has(target, key) {
      const owner = ownerOf(target, book, key);
      return owner ? key in owner : key in target;
    },
  });
}
