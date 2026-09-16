import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Attachment bytes live on disk next to the books, content-addressed by sha256,
// so state.json stays small and never carries raw file contents.
export function documentsDir(baseDir) {
  return join(baseDir || tmpdir(), 'documents');
}

export function putDocument(baseDir, content) {
  const text = String(content ?? '');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  const dir = documentsDir(baseDir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sha256}.txt`);
  if (!existsSync(path)) writeFileSync(path, text, 'utf8');
  return { sha256, bytes: Buffer.byteLength(text, 'utf8'), path };
}

export function readDocument(baseDir, sha256) {
  if (!sha256) return null;
  const path = join(documentsDir(baseDir), `${sha256}.txt`);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function documentExists(baseDir, sha256) {
  return Boolean(sha256) && existsSync(join(documentsDir(baseDir), `${sha256}.txt`));
}
