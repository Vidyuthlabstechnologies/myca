import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Attachment bytes live on disk next to the books, content-addressed by sha256,
// so state.json stays small and never carries raw file contents.
const SHA256_HEX = /^[a-f0-9]{64}$/;

function sha256Of(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function isSha256(value) {
  return SHA256_HEX.test(String(value ?? ''));
}

export function documentsDir(baseDir) {
  return join(baseDir || tmpdir(), 'documents');
}

function documentPath(baseDir, sha256) {
  return join(documentsDir(baseDir), `${sha256}.txt`);
}

export function putDocument(baseDir, content) {
  const text = String(content ?? '');
  const sha256 = sha256Of(text);
  mkdirSync(documentsDir(baseDir), { recursive: true });
  const path = documentPath(baseDir, sha256);
  if (!existsSync(path) || sha256Of(readFileSync(path, 'utf8')) !== sha256) writeFileSync(path, text, 'utf8');
  return { sha256, bytes: Buffer.byteLength(text, 'utf8'), path };
}

export function readVerifiedDocument(baseDir, sha256) {
  if (!isSha256(sha256)) return { ok: false, error: 'INVALID_SHA256' };
  const path = documentPath(baseDir, sha256);
  if (!existsSync(path)) return { ok: false, error: 'DOCUMENT_BYTES_MISSING' };
  const content = readFileSync(path, 'utf8');
  if (sha256Of(content) !== sha256) return { ok: false, error: 'DOCUMENT_INTEGRITY_FAILED' };
  return { ok: true, content };
}

export function readDocument(baseDir, sha256) {
  const read = readVerifiedDocument(baseDir, sha256);
  return read.ok ? read.content : null;
}

export function documentExists(baseDir, sha256) {
  return isSha256(sha256) && existsSync(documentPath(baseDir, sha256));
}

export function createFileDocumentStore(baseDir) {
  return {
    kind: 'file',
    put(content) {
      const { sha256, bytes } = putDocument(baseDir, content);
      return { sha256, bytes };
    },
    read: (sha256) => readDocument(baseDir, sha256),
    readVerified: (sha256) => readVerifiedDocument(baseDir, sha256),
    exists: (sha256) => documentExists(baseDir, sha256),
  };
}

export function documentsOf(state) {
  const root = state && state.__root ? state.__root : state;
  return (root && root._documents) || createFileDocumentStore(root && root._dataDir);
}
