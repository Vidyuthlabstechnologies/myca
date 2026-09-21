import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { bookView, BOOK_KEYS, FIRM_KEYS } from '../src/book-view.mjs';
import { createState, serialize } from '../src/store.mjs';
import { newBook } from '../src/books.mjs';

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

test('every top-level state write in src is classified as a book or firm key', () => {
  const dir = new URL('../src/', import.meta.url);
  const write = /(?:\+\+|--)\s*state\.([A-Za-z_$][\w$]*)|\bstate\.([A-Za-z_$][\w$]*)\s*(?:(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])?=(?!=)|\+\+|--)|\bdelete\s+state\.([A-Za-z_$][\w$]*)/g;
  const unclassified = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.mjs'))) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    for (const match of text.matchAll(write)) {
      const key = match[1] || match[2] || match[3];
      if (!BOOK_KEYS.has(key) && !FIRM_KEYS.has(key)) unclassified.push(`${name}: state.${key}`);
    }
  }
  assert.deepEqual(unclassified, []);
});

test('every key the state and books actually carry is classified, and every book key has a home on a new book', () => {
  const classified = (key) => BOOK_KEYS.has(key) || FIRM_KEYS.has(key);
  const bookKeys = Object.keys(newBook());
  assert.deepEqual(bookKeys.filter((key) => !BOOK_KEYS.has(key)), []);
  assert.deepEqual([...BOOK_KEYS].filter((key) => !bookKeys.includes(key)), []);
  const rootKeys = [...Object.keys(createState()), ...Object.keys(serialize(createState()))];
  assert.deepEqual(rootKeys.filter((key) => !classified(key)), []);
});

test('bookView deletes, membership, defineProperty and reserved names follow the same routing', () => {
  const root = { invoices: ['root'], approvals: [] };
  const book = { invoices: ['book'] };
  const view = bookView(root, book);
  Object.defineProperty(view, 'invoiceSeq', { value: 7, writable: true, enumerable: true, configurable: true });
  assert.equal(book.invoiceSeq, 7);
  assert.equal(Object.hasOwn(root, 'invoiceSeq'), false);
  assert.throws(() => Object.defineProperty(view, 'mystery', { value: 1, configurable: true }), /VIEW_WRITE_UNKNOWN_KEY:mystery/);
  delete view.invoices;
  assert.equal(Object.hasOwn(book, 'invoices'), false);
  assert.deepEqual(root.invoices, ['root']);
  assert.equal('invoices' in view, false);
  assert.equal('approvals' in view, true);
  assert.throws(() => { view.__root = {}; }, /VIEW_WRITE_UNKNOWN_KEY:__root/);
  assert.throws(() => { view[Symbol('s')] = 1; }, /VIEW_WRITE_UNKNOWN_KEY:Symbol\(s\)/);
});
