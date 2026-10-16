import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadState, saveState, safeStatePath, serialize, deserialize, createState } from './store.mjs';
import { createFileDocumentStore, documentsOf, isSha256 } from './document-store.mjs';
import { pinRecords, applyPinRecords } from './identity.mjs';
import { rotateBackups, latestGoodBackup, setAsideCorruptFile, backupSummary } from './backup-rotation.mjs';

// The session reads and writes books and document bytes only through these two
// shapes. On a desktop they are the files beside the app; a hosted service supplies
// its own pair without the engines knowing.
//
//   BooksStore     load() -> { state, version }
//                  save(state, expectedVersion) -> { ok, version } | { ok: false, error: 'VERSION_CONFLICT', version }
//   DocumentStore  put(content) -> { sha256, bytes }
//                  read(sha256) -> content | null
//                  readVerified(sha256) -> { ok, content } | { ok: false, error }
//                  exists(sha256) -> boolean

export const VERSION_CONFLICT = 'VERSION_CONFLICT';

function sha256Of(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function moved(expectedVersion, current) {
  return expectedVersion != null && expectedVersion !== current;
}

export function createFileBooksStore(path) {
  const safePath = safeStatePath(path);
  let known = null;
  const stamp = () => {
    try {
      const info = statSync(safePath);
      return `${info.size}:${info.mtimeMs}`;
    } catch {
      return '';
    }
  };
  const remember = (version) => { known = { version, stamp: stamp() }; return version; };
  const versionOnDisk = () => {
    if (!existsSync(safePath)) { known = null; return ''; }
    const current = stamp();
    if (known && known.stamp === current) return known.version;
    return remember(sha256Of(readFileSync(safePath, 'utf8')));
  };
  let recovered = null;
  let lastBackup = null;
  const health = () => ({ recovered, lastBackup, backups: backupSummary(safePath) });
  return {
    kind: 'file',
    path: safePath,
    health,
    load() {
      try {
        return { state: loadState(safePath), version: versionOnDisk(), recovered };
      } catch (err) {
        const good = latestGoodBackup(safePath);
        if (!good) throw err;
        const aside = setAsideCorruptFile(safePath);
        writeFileSync(safePath, good.text, 'utf8');
        recovered = { from: good.day, setAside: aside, reason: String(err && err.message ? err.message : err) };
        return { state: loadState(safePath), version: versionOnDisk(), recovered };
      }
    },
    save(state, expectedVersion) {
      const current = versionOnDisk();
      if (moved(expectedVersion, current)) return { ok: false, error: VERSION_CONFLICT, version: current };
      const text = saveState(safePath, state);
      const version = remember(sha256Of(text));
      try {
        lastBackup = rotateBackups(safePath, text);
      } catch (err) {
        lastBackup = { written: false, error: String(err && err.message ? err.message : err) };
      }
      return { ok: true, version };
    },
  };
}

export { createFileDocumentStore, documentsOf };

export function createFileStores(path) {
  const books = createFileBooksStore(path);
  return { books, documents: createFileDocumentStore(dirname(books.path)), path: books.path };
}

export function createMemoryBooksStore({ text: initialText = '', version: initialVersion = 0 } = {}) {
  let text = initialText;
  let pins = {};
  let version = initialVersion;
  return {
    kind: 'memory',
    load() {
      if (!text) return { state: createState(), version };
      return { state: applyPinRecords(deserialize(JSON.parse(text)), pins), version };
    },
    save(state, expectedVersion) {
      if (moved(expectedVersion, version)) return { ok: false, error: VERSION_CONFLICT, version };
      text = JSON.stringify(serialize(state));
      pins = pinRecords(state);
      version += 1;
      return { ok: true, version };
    },
    stored: () => text,
  };
}

export function createMemoryDocumentStore(initial = []) {
  const byHash = new Map();
  const added = new Set();
  for (const content of initial) byHash.set(sha256Of(String(content ?? '')), String(content ?? ''));
  const readVerified = (sha256) => {
    if (!isSha256(sha256)) return { ok: false, error: 'INVALID_SHA256' };
    if (!byHash.has(sha256)) return { ok: false, error: 'DOCUMENT_BYTES_MISSING' };
    const content = byHash.get(sha256);
    if (sha256Of(content) !== sha256) return { ok: false, error: 'DOCUMENT_INTEGRITY_FAILED' };
    return { ok: true, content };
  };
  return {
    kind: 'memory',
    put(content) {
      const text = String(content ?? '');
      const sha256 = sha256Of(text);
      if (!byHash.has(sha256)) added.add(sha256);
      byHash.set(sha256, text);
      return { sha256, bytes: Buffer.byteLength(text, 'utf8') };
    },
    read(sha256) {
      const out = readVerified(sha256);
      return out.ok ? out.content : null;
    },
    readVerified,
    exists: (sha256) => isSha256(sha256) && byHash.has(sha256),
    size: () => byHash.size,
    added: () => [...added].map((sha256) => ({ sha256, content: byHash.get(sha256) })),
  };
}

export function createMemoryStores() {
  return { books: createMemoryBooksStore(), documents: createMemoryDocumentStore(), path: '' };
}
