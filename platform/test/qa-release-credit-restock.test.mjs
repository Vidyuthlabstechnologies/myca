import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-restock-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { creditNotePreview } from '../src/confirm-sales-purchases.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Kale Stores', gstin: '27AABCU9603R1ZN', pan: 'AABPK1234C', state: '27', address: '9 Main Road', city: 'Satara', pin: '415001', entityType: 'proprietorship' };
  return state;
}

const onHand = (state, sku) => (state.stockMoves || []).filter((move) => move.sku === sku).reduce((sum, move) => sum + Number(move.qty), 0);

async function stockedSale(state) {
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'RICE', cost: 40 })).ok, true);
  assert.equal((await runTool(state, 'record_stock', { sku: 'RICE', qty: 100, location: 'own', date: '2026-06-01' })).ok, true);
  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran', lines: [{ description: 'Rice', sku: 'RICE', hsn: '1006', qty: 30, rate: 50, gstRate: 5 }], date: '2026-06-10' });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(onHand(state, 'RICE'), 70);
  return sale.invoice.id;
}

test('cancelling an invoice puts its goods back in stock', async () => {
  const state = books();
  const id = await stockedSale(state);
  const cancelled = await runTool(state, 'cancel_invoice', { invoiceId: id, date: '2026-06-12' });
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal(onHand(state, 'RICE'), 100);
});

test('a whole-invoice credit note for goods returned puts them back in stock when asked, once', async () => {
  const state = books();
  const id = await stockedSale(state);
  const preview = creditNotePreview(state, { invoiceId: id, date: '2026-06-12', reason: 'Goods returned', restock: true });
  assert.deepEqual(preview.blockers, []);
  assert.ok(preview.effects.some((line) => /back into stock/.test(line)));
  const note = await runTool(state, 'create_credit_note', { invoiceId: id, date: '2026-06-12', reason: 'Goods returned', restock: true });
  assert.equal(note.ok, true, JSON.stringify(note));
  assert.equal(note.stockReturned, 1);
  assert.equal(onHand(state, 'RICE'), 100);
  const again = await runTool(state, 'create_credit_note', { invoiceId: id, date: '2026-06-13', reason: 'Goods returned', restock: true });
  assert.equal(again.ok, false);
  assert.equal(onHand(state, 'RICE'), 100);
});

test('a credit note without restock leaves stock alone, and a part credit note refuses to restock', async () => {
  const state = books();
  const id = await stockedSale(state);
  const preview = creditNotePreview(state, { invoiceId: id, date: '2026-06-12', reason: 'Some returned', amount: 500, restock: true });
  assert.equal(preview.blockers.length, 1);
  assert.match(preview.blockers[0], /whole of/);
  const part = await runTool(state, 'create_credit_note', { invoiceId: id, date: '2026-06-12', reason: 'Some returned', amount: 500, restock: true });
  assert.equal(part.ok, false);
  assert.equal(part.error, 'RESTOCK_NEEDS_WHOLE_INVOICE');
  assert.equal(state.creditNotes?.length || 0, 0);
  const plain = await runTool(state, 'create_credit_note', { invoiceId: id, date: '2026-06-12', reason: 'Price reduced' });
  assert.equal(plain.ok, true, JSON.stringify(plain));
  assert.equal(onHand(state, 'RICE'), 70);
});
