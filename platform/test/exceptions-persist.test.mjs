import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { newBook, serializeBook, deserializeBook } from '../src/books.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { refreshExceptions, decideException } from '../src/exceptions.mjs';

function withAnException(book) {
  createInvoice(book, { date: '2026-10-03', partyName: 'Bad GSTIN Co', partyGstin: '27ZZZZZ0000Z9ZZ', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }] });
  refreshExceptions(book, {}, { now: '2026-10-06T00:00:00Z' });
  assert.ok(book.exceptions.length > 0, 'an exception was expected for the bad GSTIN');
  return book;
}

test('the exception queue and its sequence survive a save of the root books', () => {
  const state = withAnException(createState());
  const first = state.exceptions[0];
  const decided = decideException(state, state, { id: first.id, decision: 'waive', note: 'Known test party', actorId: 'USR-ADMIN' });
  assert.equal(decided.ok, true, JSON.stringify(decided));
  assert.equal(state.exceptions[0].status, 'waived');
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.exceptions.length, state.exceptions.length);
  assert.equal(back.exceptionSeq, state.exceptionSeq);
  assert.equal(back.exceptions[0].id, first.id);
  assert.equal(back.exceptions[0].status, state.exceptions[0].status);
  refreshExceptions(back, {}, { now: '2026-10-07T00:00:00Z' });
  assert.equal(back.exceptions[0].status, state.exceptions[0].status, 'a waiver is not undone by the next refresh after a reload');
  assert.equal(back.exceptions.filter((e) => e.id === first.id).length, 1, 'no duplicate after a reload');
});

test('a client book keeps its queue across a save too', () => {
  const book = withAnException(newBook({ name: 'Client', gstin: '27AABCU9603R1ZN', state: '27' }));
  const back = deserializeBook(JSON.parse(JSON.stringify(serializeBook(book))));
  assert.equal(back.exceptions.length, book.exceptions.length);
  assert.equal(back.exceptionSeq, book.exceptionSeq);
});
