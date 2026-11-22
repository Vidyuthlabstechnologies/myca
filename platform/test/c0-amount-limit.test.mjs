import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_EXACT_AMOUNT, validateAssistantToolCall } from '../src/assistant-tools.mjs';
import { openSession } from '../src/session.mjs';

const OWNER = { userId: 'USR-OWNER', role: 'admin', name: 'Asha' };
const sale = (lines) => ({ partyName: 'Kiran Stores', lines });
const line = (qty, rate) => ({ description: 'Supply', qty, rate, gstRate: 18 });

function session() {
  return openSession(join(mkdtempSync(join(tmpdir(), 'myca-amount-')), 'state.json'));
}

test('a number no schema bounds is refused once it is too large to keep exactly', () => {
  assert.equal(validateAssistantToolCall('create_invoice', sale([line(1, MAX_EXACT_AMOUNT)])).ok, true);
  for (const lines of [[line(1, MAX_EXACT_AMOUNT + 1)], [line(MAX_EXACT_AMOUNT + 1, 1)], [line(1e6, 1e6)], [line(1, MAX_EXACT_AMOUNT), line(1, 0.01)], [line(1, Number.MAX_VALUE)]]) {
    const out = validateAssistantToolCall('create_invoice', sale(lines));
    assert.equal(out.ok, false, JSON.stringify(lines));
    assert.match(out.error, /is too large$/);
  }
  assert.match(validateAssistantToolCall('post_expense', { amount: MAX_EXACT_AMOUNT * 2, narration: 'Rent' }).error, /is too large$/);
  assert.match(validateAssistantToolCall('create_purchase', { ...sale([line(3, MAX_EXACT_AMOUNT)]), supplierInvoiceNo: 'B-1' }).error, /is too large$/);
  assert.match(validateAssistantToolCall('create_invoice', sale([{ ...line(1, 100), gstRate: 99 }])).error, /must be <= 28/);
});

test('a document at the limit posts with the figures its preview showed, and one over it posts nothing', async () => {
  const s = session();
  assert.equal((await s.updateCompany({ name: 'Asha Traders', state: '29' }, { actor: OWNER })).ok, true);
  const over = await s.propose('create_invoice', sale([line(1e12, 1e12)]), { actor: OWNER });
  assert.equal(over.blocked, true);
  assert.match(over.reply, /too large to keep exactly/);
  assert.equal(over.preview, undefined);
  const held = await s.propose('create_invoice', sale([line(1, MAX_EXACT_AMOUNT)]), { actor: OWNER });
  const done = await s.confirm(held.preview.token, { actor: OWNER });
  assert.equal(done.posted, true, done.reply);
  const invoice = done.tools[0].result.invoice;
  assert.equal(invoice.taxable, MAX_EXACT_AMOUNT);
  assert.equal(invoice.total, held.preview.figures.total);
  assert.equal(invoice.total, MAX_EXACT_AMOUNT * 1.18);
  assert.ok(Number.isSafeInteger(Math.round(invoice.total * 100)));
  assert.equal(s.state.invoices.length, 1);
});
