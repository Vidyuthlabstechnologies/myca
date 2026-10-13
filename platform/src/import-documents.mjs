import { documentsOf, isSha256 } from './document-store.mjs';

export const IMPORT_CONTENT_ARG = Object.freeze({
  import_tally: 'csv',
  import_tally_xml: 'xml',
  import_zoho: 'csv',
  import_us_invoices: 'csv',
  import_bank: 'content',
  import_gstr2b: 'csv',
});

export function isImport(name) {
  return Object.hasOwn(IMPORT_CONTENT_ARG, String(name));
}

// A waiting import is held by the hash of its file, never by the file itself, so a
// preview is small enough to save with the books and the bytes stay in the document store.
export function referenceImportContent(state, name, args = {}) {
  if (!isImport(name)) return args;
  const key = IMPORT_CONTENT_ARG[name];
  if (typeof args[key] !== 'string' || !args[key]) return args;
  const { [key]: content, ...rest } = args;
  return { ...rest, documentSha256: documentsOf(state).put(content).sha256 };
}

export function resolveImportContent(state, name, args = {}) {
  if (!isImport(name) || args.documentSha256 == null) return { ok: true, args };
  if (!isSha256(args.documentSha256)) return { ok: false, error: 'INVALID_SHA256' };
  const read = documentsOf(state).readVerified(args.documentSha256);
  if (!read.ok) return { ok: false, error: read.error };
  const { documentSha256, ...rest } = args;
  return { ok: true, args: { ...rest, [IMPORT_CONTENT_ARG[name]]: read.content } };
}
