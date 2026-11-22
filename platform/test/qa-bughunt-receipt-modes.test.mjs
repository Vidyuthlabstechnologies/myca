import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-receipt-modes-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { propose, confirmPending } from '../src/router.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Sharma Kirana', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

for (const mode of ['upi', 'card']) {
  test(`a counter bill paid by ${mode} from the phone records the receipt into the bank`, async () => {
    const state = books();
    const sale = await runTool(state, 'create_invoice', { partyName: 'Walk-in customer', lines: [{ description: 'Soap', qty: 1, rate: 100, gstRate: 18 }] });
    assert.equal(sale.ok, true, JSON.stringify(sale));
    const held = await propose(state, 'record_receipt', { invoiceId: sale.invoice.id, amount: 118, mode, date: sale.invoice.date });
    assert.equal(held.awaitingConfirmation, true, held.reply);
    assert.doesNotMatch(held.reply, /into your cash/);
    const done = await confirmPending(state, held.preview.token);
    assert.equal(done.posted, true, done.reply);
    const invoice = state.invoices.find((inv) => inv.id === sale.invoice.id);
    assert.equal(invoice.status, 'paid');
    assert.equal(invoice.receipts[0].mode, mode);
  });
}
