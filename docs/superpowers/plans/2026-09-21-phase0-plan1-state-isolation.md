# Phase 0 · Plan 1: State Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it structurally impossible for a write made while a client is active to be lost, or to land in another client's books. This closes audit findings C4, H7 and H14, plus the document-swap, path-traversal-read and half-written-document mediums.

**Architecture:** Today each tool gets a *copy* of the state (`{...state, ...book}`), and `syncView` copies back only 6 fields, so every other counter write is lost. This plan replaces the copy with a `Proxy` (`bookView`) that *routes* each top-level key:
- keys in `BOOK_KEYS` go to the active client's book;
- keys in `FIRM_KEYS` go to the firm root;
- any other key throws.

`syncView` is deleted. On top of that routing:
- attachments move onto each book;
- client IDs are validated, upper-cased and stored in a null-prototype map;
- document IDs are always assigned by the server;
- document reads re-verify the file's sha256.

**Tech Stack:** Node 22 ESM, `node:test`, zero runtime dependencies. Run everything from `platform/`.

**Refinement of the spec (§6.1–6.2):** the spec proposed moving firm-level fields under a new `state.firm` object and guarding the copied view with a `Proxy` that throws. A routing `Proxy` meets the same goal without renaming ~30 call sites or migrating `state.json`, and it removes `syncView` completely instead of shrinking it. It keeps the spec's safety property: an unclassified top-level write throws.

**Conventions (from AGENTS.md):** no code comments; ESM named exports; engines return `{ ok: false, error: 'CODE' }` rather than throwing; tests use `node:test` + `node:assert/strict`.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `platform/src/book-view.mjs` | **Create** | `BOOK_KEYS`, `FIRM_KEYS`, `bookView(root, book)`: the only place that decides where a top-level key lives |
| `platform/src/session.mjs` | Modify | Use `bookView`; delete `syncView`; hydrate and back up attachments per book; `attachFile` writes to the active book |
| `platform/src/books.mjs` | Modify | Client-ID rules (`normalizeClientId`, `isValidClientId`, `CLIENT_ID_PATTERN`), null-prototype `extraBooks` (`emptyBooks`, `ensureBooks`), per-book attachments |
| `platform/src/ca-api.mjs` | Modify | Validate and normalise IDs on register/switch/lookup; server-assigned document IDs; verified document reads |
| `platform/src/store.mjs` | Modify | Null-prototype `extraBooks`; normalise client IDs on load and reject invalid ones |
| `platform/src/document-store.mjs` | Modify | `isSha256`, `readVerifiedDocument`, repair of half-written files |
| `platform/test/audit-state-isolation.test.mjs` | **Create** | H7 and H14 regressions |
| `platform/test/book-view.test.mjs` | **Create** | Routing unit tests and a static guard that no write is unclassified |
| `platform/test/audit-client-ids.test.mjs` | **Create** | C4 regressions |
| `platform/test/audit-documents.test.mjs` | **Create** | Document-store regressions |
| `AGENTS.md` | Modify | Replace the stale `syncView` invariant |

Baseline before starting: `npm test` passes 133/133.

---

### Task 1: Failing regression tests for lost firm-level writes (H7)

**Files:**
- Create: `platform/test/audit-state-isolation.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from '../src/session.mjs';

function freshSession() {
  const dir = mkdtempSync(join(tmpdir(), 'myca-isolation-'));
  const path = join(dir, 'MyCA', 'state.json');
  return { sess: openSession(path), path };
}

async function activateClient(sess, clientId) {
  assert.equal((await sess.tool('add_client', { clientId, name: `Client ${clientId}`, state: '29' })).ok, true);
  assert.equal((await sess.tool('set_active_client', { clientId })).ok, true);
}

test('H7: approval ids stay unique while a client book is active', async () => {
  const { sess } = freshSession();
  await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  await activateClient(sess, 'CL-2');
  const a = await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  const b = await sess.tool('approval_request', { operationId: 'einvoice_cancel' });
  assert.notEqual(a.data.approval.approvalId, b.data.approval.approvalId);
  const ids = sess.state.approvals.map((x) => x.approvalId);
  assert.equal(new Set(ids).size, ids.length);
});

test('H7: document ids stay unique and each reads back its own content under a client', async () => {
  const { sess } = freshSession();
  await sess.tool('save_document', { kind: 'k', fileName: 'self.txt', content: 'SELF DOC' });
  await activateClient(sess, 'CL-2');
  const one = await sess.tool('save_document', { kind: 'k', fileName: 'one.txt', content: 'FIRST' });
  const two = await sess.tool('save_document', { kind: 'k', fileName: 'two.txt', content: 'SECOND' });
  assert.notEqual(one.data.documentId, two.data.documentId);
  assert.equal((await sess.tool('get_document', { documentId: one.data.documentId })).data.content, 'FIRST');
});

test('H7: audit event ids stay unique across client switches', async () => {
  const { sess } = freshSession();
  await activateClient(sess, 'CL-2');
  await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  await sess.tool('save_document', { kind: 'k', fileName: 'one.txt', content: 'FIRST' });
  const ids = sess.state.auditEvents.map((e) => e.eventId);
  assert.equal(new Set(ids).size, ids.length);
});

test('H7: integration_connect persists while a client book is active', async () => {
  const { sess, path } = freshSession();
  await activateClient(sess, 'CL-2');
  assert.equal((await sess.tool('integration_connect', { requirementId: 'REQ-CA-006', provider: 'sandbox' })).ok, true);
  assert.equal(sess.state.integrationConnections['REQ-CA-006']?.status, 'connected');
  assert.equal(openSession(path).state.integrationConnections['REQ-CA-006']?.status, 'connected');
});
```

- [ ] **Step 2: Run the tests and confirm all four fail**

Run: `node --env-file=.env.test --test test/audit-state-isolation.test.mjs`

Expected: `# pass 0`, `# fail 4`. Failure reasons:
- approvals: `notEqual` fails on `APR-000002`;
- documents: `notEqual` fails, or the content is `'SECOND'`;
- audit: size mismatch;
- integration: `undefined !== 'connected'`.

Do not commit yet; Task 2 turns these green.

---

### Task 2: Routing book view replaces the copy-and-sync view

**Files:**
- Create: `platform/src/book-view.mjs`
- Create: `platform/test/book-view.test.mjs`
- Modify: `platform/src/session.mjs:1-13` (imports), `:47-66` (`toolState`, `syncView`), `:83-125` (`chat`, `tool`)

- [ ] **Step 1: Write the failing unit tests**

Create `platform/test/book-view.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookView, BOOK_KEYS, FIRM_KEYS } from '../src/book-view.mjs';

test('bookView routes book keys to the book and firm keys to the root', () => {
  const root = { invoices: ['root-inv'], approvalSeq: 1, approvals: [] };
  const book = { invoices: ['book-inv'] };
  const view = bookView(root, book);
  assert.deepEqual(view.invoices, ['book-inv']);
  view.invoiceSeq = 5;
  view.approvalSeq += 1;
  assert.equal(book.invoiceSeq, 5);
  assert.equal(Object.hasOwn(root, 'invoiceSeq'), false);
  assert.equal(root.approvalSeq, 2);
  assert.equal(view.__root, root);
  assert.equal(view.__book, book);
  assert.equal('invoices' in view, true);
});

test('bookView refuses writes and deletes of unclassified keys', () => {
  const view = bookView({}, {});
  assert.throws(() => { view.somethingNew = 1; }, /VIEW_WRITE_UNKNOWN_KEY:somethingNew/);
  assert.throws(() => { delete view.somethingNew; }, /VIEW_WRITE_UNKNOWN_KEY:somethingNew/);
});

test('book and firm key sets never overlap', () => {
  const overlap = [...BOOK_KEYS].filter((key) => FIRM_KEYS.has(key));
  assert.deepEqual(overlap, []);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --env-file=.env.test --test test/book-view.test.mjs`
Expected: FAIL with `Cannot find module '.../src/book-view.mjs'`.

- [ ] **Step 3: Create `platform/src/book-view.mjs`**

```js
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
```

`files`, `attachments` and `pendingFile` start in `FIRM_KEYS`, which keeps today's behaviour. Task 4 moves them to `BOOK_KEYS`.

- [ ] **Step 4: Run the unit tests and confirm they pass**

Run: `node --env-file=.env.test --test test/book-view.test.mjs`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Wire `bookView` into `session.mjs`**

In `platform/src/session.mjs`, add this import after the `approvalStatus` import (line 12):

```js
import { bookView } from './book-view.mjs';
```

Replace lines 47–66 (the comment, `toolState` and `syncView`) with:

```js
function toolState(state) {
  const id = String(state.activeClientId || 'SELF');
  return bookView(state, id === 'SELF' ? state : getBook(state, id));
}
```

In `chat(message)`, delete the line `syncView(view, state);`. The block becomes:

```js
        const view = toolState(state);
        const out = await chat(view, message);
        appendAuditEvent(state, {
```

In `tool(name, args)`, delete the line `syncView(view, state);`. The block becomes:

```js
        const view = toolState(state);
        const out = await runTool(view, name, args);
        appendAuditEvent(state, {
```

- [ ] **Step 6: Run the H7 regressions and confirm they now pass**

Run: `node --env-file=.env.test --test test/audit-state-isolation.test.mjs`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 7: Run the full platform suite**

Run: `npm test`
Expected: `# pass 140`, `# fail 0` (133 existing + 4 + 3).

- [ ] **Step 8: Commit**

```bash
git add platform/src/book-view.mjs platform/src/session.mjs platform/test/book-view.test.mjs platform/test/audit-state-isolation.test.mjs
git commit -m "fix(session): route tool view writes by key instead of copy-and-sync (audit H7)

Tools now receive bookView(root, book): BOOK_KEYS resolve to the active
client's book, FIRM_KEYS to the root, anything else throws. syncView is
gone, so approvalSeq/documentSeq/auditSeq/integrationConnections writes
made while a client is active are no longer lost.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Static guard against unclassified top-level writes

**Files:**
- Modify: `platform/test/book-view.test.mjs` (append)

- [ ] **Step 1: Append the guard test**

Add these imports at the top of `platform/test/book-view.test.mjs`, below the existing imports:

```js
import { readdirSync, readFileSync } from 'node:fs';
```

Append this test:

```js
test('every top-level state write in src is classified as a book or firm key', () => {
  const dir = new URL('../src/', import.meta.url);
  const write = /(?:\+\+|--)\s*state\.([A-Za-z_$][\w$]*)|\bstate\.([A-Za-z_$][\w$]*)\s*(?:[+\-*/]?=(?!=)|\+\+|--)/g;
  const unclassified = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.mjs'))) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    for (const match of text.matchAll(write)) {
      const key = match[1] || match[2];
      if (!BOOK_KEYS.has(key) && !FIRM_KEYS.has(key)) unclassified.push(`${name}: state.${key}`);
    }
  }
  assert.deepEqual(unclassified, []);
});
```

- [ ] **Step 2: Run it**

Run: `node --env-file=.env.test --test test/book-view.test.mjs`
Expected: `# pass 4`, `# fail 0`. Every current write is classified; this was verified during planning. The test exists to fail the day someone adds `state.somethingNew = …` without classifying it.

- [ ] **Step 3: Commit**

```bash
git add platform/test/book-view.test.mjs
git commit -m "test: fail on any unclassified top-level state write

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Attachments belong to each client's book (H14)

**Files:**
- Modify: `platform/test/audit-state-isolation.test.mjs` (append)
- Modify: `platform/src/book-view.mjs` (move three keys)
- Modify: `platform/src/books.mjs:4-52` (`newBook`, `serializeBook`, `deserializeBook`)
- Modify: `platform/src/session.mjs` (`hydrateDocuments`, `backup`, `attachFile`)

- [ ] **Step 1: Append the failing tests**

Add this import to `platform/test/audit-state-isolation.test.mjs`, merging it into the existing `node:fs` import:

```js
import { mkdtempSync, readFileSync } from 'node:fs';
```

Append:

```js
const INWARD = readFileSync(new URL('../../sprints/sprint-5-filing-assistant/test/fixtures/inward.csv', import.meta.url), 'utf8');

test('H14: a firm attachment never feeds a client\'s return', async () => {
  const { sess } = freshSession();
  await sess.attachFile('inward', 'inward.csv', INWARD);
  await activateClient(sess, 'CL-3');
  const gstr3b = await sess.tool('prepare_gstr3b', {});
  assert.equal(gstr3b.data.itc.netItc, 0);
});

test('H14: a client attachment stays on that client, survives reload, and never reaches SELF', async () => {
  const { sess, path } = freshSession();
  const selfBefore = (await sess.tool('prepare_gstr3b', {})).data.itc.netItc;
  await activateClient(sess, 'CL-2');
  await sess.attachFile('inward', 'inward.csv', INWARD);
  assert.equal((await sess.tool('prepare_gstr3b', {})).data.itc.netItc, 130400);
  await sess.tool('set_active_client', { clientId: 'SELF' });
  assert.equal((await sess.tool('prepare_gstr3b', {})).data.itc.netItc, selfBefore);
  const reopened = openSession(path);
  assert.match(reopened.state.extraBooks['CL-2'].attachments.inward.sha256, /^[a-f0-9]{64}$/);
  assert.equal(reopened.state.extraBooks['CL-2'].files.inward, INWARD);
  assert.equal(reopened.state.attachments.inward, undefined);
});
```

- [ ] **Step 2: Run and confirm both new tests fail**

Run: `node --env-file=.env.test --test test/audit-state-isolation.test.mjs`

Expected: `# pass 4`, `# fail 2`. Failure reasons:
- first test: `130400 !== 0`;
- second test: SELF's `netItc` equals `130400` instead of `selfBefore`.

- [ ] **Step 3: Move the three keys to `BOOK_KEYS`**

In `platform/src/book-view.mjs`, replace both sets with:

```js
export const BOOK_KEYS = new Set([
  'company', 'ledger', 'parties', 'vendors', 'invoices', 'purchases',
  'invoiceSeq', 'billSeq', 'transferSeq', 'imports', 'lockThrough',
  'files', 'attachments', 'pendingFile',
]);

export const FIRM_KEYS = new Set([
  'integrationConnections', 'documents', 'documentSeq', 'firmUsers',
  'auditEvents', 'auditSeq', 'clients', 'extraBooks',
  'approvals', 'approvalSeq', 'activeClientId',
  'outbox', 'outboxSeq', '_dataDir', '_legacyFiles',
]);
```

- [ ] **Step 4: Give every book its own attachments**

In `platform/src/books.mjs`, add three fields to `newBook` so the returned object reads:

```js
  return {
    company,
    ledger,
    parties: [],
    vendors: [],
    invoices: [],
    purchases: [],
    invoiceSeq: 0,
    billSeq: 0,
    transferSeq: 100000,
    imports: [],
    lockThrough: '',
    files: {},
    attachments: {},
    pendingFile: null,
  };
```

In `serializeBook`, add after `lockThrough: book.lockThrough || '',`:

```js
    attachments: book.attachments || {},
```

In `deserializeBook`, add after `book.lockThrough = raw.lockThrough || '';`:

```js
  book.attachments = raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {};
```

- [ ] **Step 5: Hydrate, back up and attach per book in `session.mjs`**

Replace `hydrateDocuments` (lines 15–45) with:

```js
function hydrateAttachments(book, dataDir) {
  book.attachments = book.attachments && typeof book.attachments === 'object' ? book.attachments : {};
  book.files = book.files && typeof book.files === 'object' ? book.files : {};
  for (const [key, attachment] of Object.entries(book.attachments)) {
    if (book.files[key] != null || !attachment?.sha256) continue;
    const content = readDocument(dataDir, attachment.sha256);
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
    const stored = putDocument(state._dataDir, content);
    state.files[key] = content;
    state.attachments[key] = {
      kind: key,
      name: state.attachments[key]?.name || key,
      sha256: stored.sha256,
      bytes: stored.bytes,
      at: state.attachments[key]?.at || new Date().toISOString(),
    };
  }
  for (const book of allBooks(state)) hydrateAttachments(book, state._dataDir);
  for (const doc of state.documents || []) {
    if (doc.sha256) continue;
    const content = legacy[doc.documentId];
    if (typeof content !== 'string') continue;
    const stored = putDocument(state._dataDir, content);
    doc.sha256 = stored.sha256;
    doc.bytes = stored.bytes;
  }
  delete state._legacyFiles;
}
```

In `backup()`, replace the line

```js
      for (const att of Object.values(state.attachments || {})) if (att?.sha256) hashes.add(att.sha256);
```

with:

```js
      for (const book of allBooks(state)) {
        for (const att of Object.values(book.attachments || {})) if (att?.sha256) hashes.add(att.sha256);
      }
```

Replace the whole `attachFile(kind, name, content)` method with:

```js
    attachFile(kind, name, content) {
      return exclusive(async () => {
        const beforeHash = stateDigest(state);
        const clientId = String(state.activeClientId || 'SELF');
        const book = getBook(state, clientId);
        const stored = putDocument(state._dataDir, content);
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
          actorId: 'renderer',
          clientId,
          action: 'file.attach',
          beforeHash,
          afterHash: stateDigest(state),
          metadata: { kind, name, bytes: stored.bytes, sha256: stored.sha256 },
        });
        saveState(path, state);
        return { ok: true, kind, name, bytes: stored.bytes, sha256: stored.sha256 };
      });
    },
```

- [ ] **Step 6: Run the isolation tests**

Run: `node --env-file=.env.test --test test/audit-state-isolation.test.mjs`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: `# pass 143`, `# fail 0`. The existing attachment tests in `edges.test.mjs` (around lines 994–1018) attach under SELF and read `state.attachments`, so they still hold.

- [ ] **Step 8: Commit**

```bash
git add platform/src/book-view.mjs platform/src/books.mjs platform/src/session.mjs platform/test/audit-state-isolation.test.mjs
git commit -m "fix(books): keep attachments on each client's book (audit H14)

files/attachments/pendingFile are now book keys: attachFile writes to the
active book, hydration and backup walk every book. One client's inward CSV
can no longer feed another client's GSTR-3B ITC.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Client IDs are validated, normalised and stored in a null-prototype map (C4)

**Files:**
- Create: `platform/test/audit-client-ids.test.mjs`
- Modify: `platform/src/books.mjs` (new helpers; `getBook`)
- Modify: `platform/src/ca-api.mjs:1-5` (imports), `:41-56` (`ensureCaApiState`), `:79-121` (`requireClient`, `registerClient`, `setActiveClient`), `:140-175` (document functions)
- Modify: `platform/src/store.mjs:9` (imports), `:41` (`createState`), `:107-113` (`deserialize`)

- [ ] **Step 1: Write the failing tests**

Create `platform/test/audit-client-ids.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from '../src/session.mjs';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { newBook, serializeBook } from '../src/books.mjs';

function freshSession() {
  return openSession(join(mkdtempSync(join(tmpdir(), 'myca-client-ids-')), 'MyCA', 'state.json'));
}

test('C4: a prototype-named client id gets its own isolated book', async () => {
  const sess = freshSession();
  const selfInvoices = sess.state.invoices.length;
  assert.equal((await sess.tool('add_client', { clientId: 'constructor', name: 'Ctor' })).ok, true);
  assert.equal((await sess.tool('set_active_client', { clientId: 'constructor' })).ok, true);
  const inv = await sess.tool('create_invoice', { partyName: 'X', partyState: '27', lines: [{ description: 's', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(inv.ok, true);
  assert.equal(sess.state.invoices.length, selfInvoices);
  assert.equal(sess.state.extraBooks.CONSTRUCTOR.invoices.length, 1);
  assert.equal(Object.hasOwn(Object, 'invoiceSeq'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'invoiceSeq'), false);
});

test('C4: invalid client ids are rejected by the tool and the CA API', async () => {
  const sess = freshSession();
  for (const clientId of ['__proto__', 'a', 'has space', 'X'.repeat(33), 'SELF', 'self']) {
    const out = await sess.tool('add_client', { clientId, name: 'Bad' });
    assert.equal(out.ok, false, clientId);
  }
  const api = await sess.caApi('POST', '/api/ca/clients', { clientId: '__proto__', name: 'Bad' });
  assert.equal(api.ok, false);
  assert.equal(api.error, 'INVALID_CLIENT_ID');
  assert.equal(Object.hasOwn(Object.prototype, 'invoiceSeq'), false);
});

test('C4: client ids are upper-cased so every lookup is exact', async () => {
  const sess = freshSession();
  const added = await sess.tool('add_client', { clientId: 'cl-9', name: 'Nine' });
  assert.equal(added.data.client.clientId, 'CL-9');
  const switched = await sess.tool('set_active_client', { clientId: 'cl-9' });
  assert.equal(switched.data.activeClientId, 'CL-9');
  const docs = await sess.caApi('GET', '/api/ca/clients/cl-9/documents');
  assert.equal(docs.data.clientId, 'CL-9');
});

test('C4: a backup carrying an invalid client id is refused', async () => {
  const sess = freshSession();
  const backup = sess.backup();
  backup.state.clients = [{ clientId: '__proto__', name: 'Evil' }];
  backup.confirm = true;
  assert.deepEqual(await sess.restore(backup), { ok: false, error: 'INVALID_BACKUP' });
});

test('C4: legacy lower-case client ids are normalised on load into a null-prototype map', () => {
  const raw = serialize(createState());
  raw.clients = [{ clientId: 'cl-3', name: 'Three' }];
  raw.extraBooks = { 'cl-3': serializeBook(newBook({ name: 'Three' })) };
  raw.activeClientId = 'cl-3';
  const state = deserialize(raw);
  assert.equal(state.clients[0].clientId, 'CL-3');
  assert.equal(Object.getPrototypeOf(state.extraBooks), null);
  assert.equal(Object.hasOwn(state.extraBooks, 'CL-3'), true);
  assert.equal(state.activeClientId, 'CL-3');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --env-file=.env.test --test test/audit-client-ids.test.mjs`

Expected: `# fail 5`. Failure reasons:
- the `constructor` test throws reading `.invoices` of `undefined`;
- the invalid IDs are accepted;
- `CL-9` is not normalised;
- the restore succeeds;
- `cl-3` stays lower-case.

- [ ] **Step 3: Add the client-ID rules and a hardened `getBook` in `books.mjs`**

Add below the imports in `platform/src/books.mjs`:

```js
export const CLIENT_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export function normalizeClientId(value) {
  return String(value ?? '').trim().toUpperCase() || 'SELF';
}

export function isValidClientId(id) {
  return id !== 'SELF' && CLIENT_ID_PATTERN.test(id);
}

export function emptyBooks() {
  return Object.create(null);
}

export function ensureBooks(state) {
  if (!state.extraBooks || typeof state.extraBooks !== 'object') state.extraBooks = emptyBooks();
  else if (Object.getPrototypeOf(state.extraBooks) !== null) state.extraBooks = Object.assign(emptyBooks(), state.extraBooks);
  return state.extraBooks;
}
```

Replace `getBook` (and the comment above it) with:

```js
export function getBook(state, clientId) {
  const id = normalizeClientId(clientId);
  if (id === 'SELF') return state;
  const client = (state.clients || []).find((c) => c.clientId === id);
  if (!client || !isValidClientId(id)) {
    const err = new Error('CLIENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  const books = ensureBooks(state);
  if (!Object.hasOwn(books, id)) books[id] = newBook(companyFromClient(client));
  return books[id];
}
```

- [ ] **Step 4: Validate and normalise in `ca-api.mjs`**

Replace the `books.mjs` import (line 4) with:

```js
import { getBook, normalizeClientId, isValidClientId, ensureBooks } from './books.mjs';
```

In `ensureCaApiState`, replace the line

```js
  state.extraBooks = state.extraBooks && typeof state.extraBooks === 'object' ? state.extraBooks : {};
```

with:

```js
  ensureBooks(state);
```

Replace `requireClient`, `registerClient` and `setActiveClient` with:

```js
function requireClient(state, clientId) {
  const id = normalizeClientId(clientId);
  const client = clients(state).find((row) => row.clientId === id);
  if (!client) {
    const err = new Error('CLIENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  return client;
}
```

```js
export function registerClient(state, body = {}) {
  ensureCaApiState(state);
  const raw = String(body.clientId || body.id || '').trim();
  if (!raw) return { ok: false, error: 'CLIENT_ID_REQUIRED' };
  const id = normalizeClientId(raw);
  if (id === 'SELF' || state.clients.some((c) => c.clientId === id)) return { ok: false, error: 'CLIENT_EXISTS' };
  if (!isValidClientId(id)) return { ok: false, error: 'INVALID_CLIENT_ID' };
  const gstin = String(body.gstin || '').trim().toUpperCase();
  const client = {
    clientId: id,
    name: String(body.name || id),
    pan: String(body.pan || (gstin.length >= 12 ? gstin.slice(2, 12) : '')),
    gstin,
    entityType: String(body.entityType || 'proprietor'),
    state: String(body.state || gstin.slice(0, 2) || ''),
    turnover: Number(body.turnover || 0),
    gstFrequency: String(body.gstFrequency || 'monthly'),
    auditRequired: body.auditRequired !== false,
  };
  state.clients.push(client);
  return { ok: true, client };
}
```

```js
export function setActiveClient(state, clientId) {
  ensureCaApiState(state);
  const id = normalizeClientId(clientId);
  if (id !== 'SELF' && !state.clients.some((c) => c.clientId === id)) return { ok: false, error: 'CLIENT_NOT_FOUND' };
  state.activeClientId = id;
  return { ok: true, activeClientId: id };
}
```

Replace `listDocuments`, `uploadDocument` and `getDocumentContent` with versions that use the canonical ID. Task 6 changes the document internals further.

```js
export function listDocuments(state, clientId) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  return { ok: true, data: { clientId: id, documents: state.documents.filter((doc) => doc.clientId === id) } };
}

export function uploadDocument(state, clientId, input = {}) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  const beforeHash = stateDigest(state);
  const { doc, content } = documentPayload(state, id, input);
  const stored = putDocument(state._dataDir, content);
  doc.sha256 = stored.sha256;
  doc.bytes = stored.bytes;
  state.documents.push(doc);
  state.files[doc.documentId] = content;
  appendAuditEvent(state, {
    actorId: input.actorId || 'api',
    clientId: id,
    action: 'documents.upload',
    beforeHash,
    afterHash: stateDigest(state),
    metadata: { documentId: doc.documentId, kind: doc.kind, sha256: doc.sha256, bytes: doc.bytes },
  });
  return { ok: true, data: doc };
}

export function getDocumentContent(state, clientId, documentId) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  const doc = state.documents.find((d) => d.documentId === documentId && d.clientId === id);
  if (!doc) return { ok: false, error: 'DOCUMENT_NOT_FOUND' };
  const content = state.files[documentId] != null ? state.files[documentId] : readDocument(state._dataDir, doc.sha256);
  if (content == null) return { ok: false, error: 'DOCUMENT_BYTES_MISSING' };
  return { ok: true, data: { ...doc, content } };
}
```

- [ ] **Step 5: Normalise and validate on load in `store.mjs`**

Replace the `books.mjs` import (line 9) with:

```js
import { serializeBook, deserializeBook, emptyBooks, normalizeClientId, isValidClientId } from './books.mjs';
```

In `createState`, change `extraBooks: {},` to:

```js
    extraBooks: emptyBooks(),
```

Add this helper above `deserialize`:

```js
function canonicalClientId(value) {
  const id = normalizeClientId(value);
  if (!isValidClientId(id)) throw new Error('INVALID_CLIENT_ID');
  return id;
}
```

In `deserialize`, replace the three lines that set `state.clients`, `state.extraBooks` (the `Object.fromEntries` block) and `state.activeClientId` with:

```js
  state.clients = (raw.clients || []).map((client) => ({ ...client, clientId: canonicalClientId(client?.clientId) }));
  state.extraBooks = Object.assign(emptyBooks(), Object.fromEntries(
    Object.entries(raw.extraBooks || {}).map(([id, book]) => [canonicalClientId(id), deserializeBook(book)]),
  ));
```

```js
  state.activeClientId = normalizeClientId(raw.activeClientId);
```

`session.restore` already wraps `deserialize` in `try/catch` and returns `INVALID_BACKUP`, so a thrown `INVALID_CLIENT_ID` surfaces there correctly.

- [ ] **Step 6: Run the client-ID tests**

Run: `node --env-file=.env.test --test test/audit-client-ids.test.mjs`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: `# pass 148`, `# fail 0`. Existing tests register `CL-7`, `CL-1`, `CL-100` and `C1`, all of which are valid, upper-case, and 2–32 characters.

- [ ] **Step 8: Commit**

```bash
git add platform/src/books.mjs platform/src/ca-api.mjs platform/src/store.mjs platform/test/audit-client-ids.test.mjs
git commit -m "fix(books): validate and normalise client ids; null-prototype book map (audit C4)

Client ids must match ^[A-Z0-9][A-Z0-9_-]{1,31}$, are upper-cased on every
entry point, and books live in a null-prototype map read via Object.hasOwn.
A client named constructor/__proto__ can no longer resolve to a built-in
and post into the firm's own books or pollute Object.prototype.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Server-assigned document IDs and hash-verified reads

**Files:**
- Create: `platform/test/audit-documents.test.mjs`
- Modify: `platform/src/document-store.mjs` (whole file)
- Modify: `platform/src/ca-api.mjs:5` (import), `uploadDocument`, `getDocumentContent`, `documentPayload`

- [ ] **Step 1: Write the failing tests**

Create `platform/test/audit-documents.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { handleCaApi } from '../src/ca-api.mjs';
import { documentsDir, putDocument, readDocument, documentExists } from '../src/document-store.mjs';

function stateIn(prefix) {
  const state = createState();
  state._dataDir = mkdtempSync(join(tmpdir(), prefix));
  return state;
}

test('documents: ids and upload times are always server-assigned', () => {
  const state = stateIn('myca-doc-ids-');
  const up = handleCaApi(state, 'POST', '/api/ca/clients/SELF/documents', {
    documentId: 'DOC-999999', uploadedAt: '2001-01-01T00:00:00.000Z', fileName: 'a.txt', content: 'A',
  });
  assert.equal(up.ok, true);
  assert.notEqual(up.data.documentId, 'DOC-999999');
  assert.notEqual(up.data.uploadedAt, '2001-01-01T00:00:00.000Z');
});

test('documents: one client cannot overwrite another client\'s document content', () => {
  const state = stateIn('myca-doc-swap-');
  handleCaApi(state, 'POST', '/api/ca/clients', { clientId: 'ACME', name: 'Acme' });
  handleCaApi(state, 'POST', '/api/ca/clients', { clientId: 'BETA', name: 'Beta' });
  const acme = handleCaApi(state, 'POST', '/api/ca/clients/ACME/documents', { fileName: 'a.txt', content: 'ACME CONTENT' });
  handleCaApi(state, 'POST', '/api/ca/clients/BETA/documents', { documentId: acme.data.documentId, fileName: 'b.txt', content: 'BETA CONTENT' });
  const read = handleCaApi(state, 'GET', `/api/ca/clients/ACME/documents/${acme.data.documentId}`);
  assert.equal(read.data.content, 'ACME CONTENT');
});

test('documents: a tampered file on disk is reported, never served', () => {
  const state = stateIn('myca-doc-tamper-');
  const up = handleCaApi(state, 'POST', '/api/ca/clients/SELF/documents', { fileName: 'a.txt', content: 'ORIGINAL' });
  writeFileSync(join(documentsDir(state._dataDir), `${up.data.sha256}.txt`), 'TAMPERED', 'utf8');
  const read = handleCaApi(state, 'GET', `/api/ca/clients/SELF/documents/${up.data.documentId}`);
  assert.deepEqual(read, { ok: false, error: 'DOCUMENT_INTEGRITY_FAILED' });
});

test('documents: only a 64-hex sha256 can address the store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-path-'));
  writeFileSync(join(dir, 'secret.txt'), 'SECRET', 'utf8');
  assert.equal(readDocument(dir, '../secret'), null);
  assert.equal(documentExists(dir, '../secret'), false);
});

test('documents: a half-written file is repaired on the next put', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-repair-'));
  const first = putDocument(dir, 'FULL CONTENT');
  writeFileSync(first.path, 'FULL', 'utf8');
  putDocument(dir, 'FULL CONTENT');
  assert.equal(readFileSync(first.path, 'utf8'), 'FULL CONTENT');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --env-file=.env.test --test test/audit-documents.test.mjs`

Expected: `# fail 5`. Failure reasons:
- caller-supplied ID and time are honoured;
- ACME reads `BETA CONTENT`;
- the tampered file is served as `ORIGINAL` from the cache;
- `../secret` reads `SECRET`;
- the half-written file stays `FULL`.

- [ ] **Step 3: Replace `platform/src/document-store.mjs`**

```js
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
```

- [ ] **Step 4: Stop caching by document ID and verify on read in `ca-api.mjs`**

Replace the `document-store.mjs` import (line 5) with:

```js
import { putDocument, readVerifiedDocument } from './document-store.mjs';
```

In `uploadDocument`, delete the line:

```js
  state.files[doc.documentId] = content;
```

Replace `getDocumentContent` with:

```js
export function getDocumentContent(state, clientId, documentId) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  const doc = state.documents.find((d) => d.documentId === documentId && d.clientId === id);
  if (!doc) return { ok: false, error: 'DOCUMENT_NOT_FOUND' };
  const read = readVerifiedDocument(state._dataDir, doc.sha256);
  if (!read.ok) return { ok: false, error: read.error };
  return { ok: true, data: { ...doc, content: read.content } };
}
```

In `documentPayload`, replace the `documentId` and `uploadedAt` lines so the server always assigns both:

```js
    documentId: `DOC-${String(++state.documentSeq).padStart(6, '0')}`,
```

```js
    uploadedAt: new Date().toISOString(),
```

- [ ] **Step 5: Run the document tests**

Run: `node --env-file=.env.test --test test/audit-documents.test.mjs`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: `# pass 153`, `# fail 0`. The existing `ca-api: document content can be read back` and `get_document` tests read from disk through the verified path, and `createState()` without `_dataDir` falls back to `tmpdir()` on both write and read.

- [ ] **Step 7: Commit**

```bash
git add platform/src/document-store.mjs platform/src/ca-api.mjs platform/test/audit-documents.test.mjs
git commit -m "fix(documents): server-assigned ids, sha256-verified reads, no traversal

Document ids/times are never caller-chosen; reads come from the
content-addressed store and re-verify the hash (DOCUMENT_INTEGRITY_FAILED on
mismatch); only 64-hex hashes address the store; a half-written file is
rewritten on the next put.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Update AGENTS.md invariants and verify every suite

**Files:**
- Modify: `AGENTS.md` ("Non-obvious invariants" section)

- [ ] **Step 1: Replace the stale invariants**

In `AGENTS.md`, replace these two bullets:

```markdown
- **Active-client view**: `session.mjs` runs tools/chat against `toolState(state)` — the
  active client's book layered over the root infra state — then `syncView` copies the
  book's sequence counters and `activeClientId` back. Add any new root-level field a tool
  may mutate to `syncView`, or the write will be lost on the view copy.
- **`state.files` is an in-memory cache**, never persisted. Attachment bytes live on disk
  via `document-store.mjs`; `state.json` holds metadata (`sha256`, `bytes`) only.
```

with:

```markdown
- **Active-client view**: `session.mjs` runs tools/chat against `bookView(root, book)`
  (`book-view.mjs`), a Proxy that routes `BOOK_KEYS` to the active client's book and
  `FIRM_KEYS` to the root. Writing any other top-level key throws
  `VIEW_WRITE_UNKNOWN_KEY`. Add a new top-level field to exactly one of the two sets;
  `test/book-view.test.mjs` fails on any unclassified write or on a key that
  `newBook()`/`createState()` carries without classifying it. Never enumerate, inspect or
  clone a view (spread, `Object.keys`, `JSON.stringify`, `util.inspect`, `structuredClone`):
  its key list comes from the root, so book-only fields go missing and inspected values are
  the root's. Read fields by name. The throw is a developer tripwire, not a transaction:
  writes made before it are kept.
- **Client ids** match `^[A-Z0-9][A-Z0-9_-]{1,31}$` and are upper-cased on entry
  (`normalizeClientId`); `SELF` is reserved. `extraBooks` is a null-prototype map; look
  books up with `Object.hasOwn`, never by truthiness or `in`.
- **Attachments are per book.** `book.attachments` (persisted metadata) and `book.files`
  (in-memory cache, never persisted) live on each client's book. Document bytes are
  content-addressed on disk, and every read re-verifies the sha256 (`readVerifiedDocument`).
```

- [ ] **Step 2: Run the platform suite and every sprint suite**

Run from the repo root:

```bash
(cd platform && npm test) && for d in sprints/*/; do (cd "$d" && node --test "test/*.test.mjs") || exit 1; done
```

Expected:
- platform: `# pass 153`, `# fail 0`;
- sprints unchanged: 11 / 11 / 33 / 44 / 58 / 2, all `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document bookView routing, client-id rules, per-book attachments

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- Audit findings C4, H7, H14, the document swap, the traversal read and the half-written document each have a test that failed on `d2416c9` and passes now.
- `syncView` no longer exists. `grep -n syncView platform/src` returns nothing.
- The platform suite passes 153/153 and the sprint suites are unchanged.
