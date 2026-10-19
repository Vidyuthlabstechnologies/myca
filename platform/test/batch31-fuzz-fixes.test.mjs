import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-fuzzfix-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { parseDocument, saidNonPositiveAmount } from '../src/intent.mjs';
import { trialBalance } from '../src/ledger.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Test Co', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}
const SALE = { partyName: 'Kiran Stores', lines: [{ description: 'Goods', qty: 1, rate: 5000, gstRate: 18 }], date: '2026-09-05' };

test('the trial balance is summed in paise, so very large books still tie', async () => {
  const state = books();
  for (const rate of [99999999999999, 5000, 0.01, 123456.78]) {
    const posted = await runTool(state, 'create_invoice', { ...SALE, lines: [{ description: 'Goods', qty: 1, rate, gstRate: 18 }] });
    assert.equal(posted.ok, true, JSON.stringify(posted));
  }
  await runTool(state, 'post_expense', { narration: 'tea', amount: 0.01, payee: 'Chai', date: '2026-09-06' });
  const tb = trialBalance(state.ledger);
  assert.equal(tb.balanced, true, `debit ${tb.debit} credit ${tb.credit}`);
  const checked = await chat(state, 'check my books');
  assert.doesNotMatch(checked.reply, /do not tie/, checked.reply);
});

test('a chat amount beyond a hundred crore, a negative number or a plus sign is refused with words', async () => {
  const state = books();
  assert.equal(parseDocument('invoice Kiran Stores 99999999999999 GST 18%').problem, 'AMOUNT_TOO_LARGE');
  const huge = await chat(state, 'invoice Kiran Stores 99999999999999 GST 18%');
  assert.match(huge.reply, /larger than I will take/, huge.reply);
  assert.equal(parseDocument('invoice Kiran Stores -3 pcs at 500 gst 18%').problem, 'NEGATIVE_NUMBER');
  assert.equal(parseDocument('invoice Kiran Stores 50000 GST -18%').problem, 'NEGATIVE_NUMBER');
  const negative = await chat(state, 'bill from Fabric Co 10000 GST -5%');
  assert.match(negative.reply, /negative number cannot be part/, negative.reply);
  const plus = parseDocument('invoice Kiran Stores +5000 GST 18%');
  assert.equal(plus.partyName, 'Kiran Stores');
  assert.equal(plus.lines[0].rate, 5000);
  assert.equal(state.invoices.length, 0);
});

test('an impossible date is refused instead of being replaced by today', async () => {
  const state = books();
  assert.equal(parseDocument('invoice Kiran Stores 50000 GST 18% dated 2026-02-30').problem, 'INVALID_DATE');
  const out = await chat(state, 'invoice Kiran Stores 50000 GST 18% dated 2026-02-30');
  assert.match(out.reply, /30 February 2026 is not a date I can read/, out.reply);
  const dmy = await chat(state, 'bill from Fabric Co 10000 GST 5% on 31/13/2026');
  assert.match(dmy.reply, /31\/13\/2026 is not a date I can read/, dmy.reply);
  assert.equal(state.invoices.length + state.purchases.length, 0);
});

test('a year after a month or festival word is not an amount', () => {
  assert.equal(parseDocument('invoice Kiran Stores for Diwali 2026 GST 18%'), null);
  assert.equal(parseDocument('invoice Kiran Stores 2026 GST 18%').lines[0].rate, 2026);
  assert.equal(parseDocument('invoice Kiran Stores 8000 for FY 2026-27 GST 18%').lines[0].rate, 8000);
  assert.equal(parseDocument('invoice Kiran Stores 8000 for Sept 2026 GST 18%').lines[0].rate, 8000);
});

test('a receipt, payment or credit note of zero or less is refused, not turned into the full amount', async () => {
  const state = books();
  await runTool(state, 'create_invoice', SALE);
  assert.equal(saidNonPositiveAmount('received 0 from Kiran Stores'), true);
  assert.equal(saidNonPositiveAmount('received -5000 against INV-0001'), true);
  assert.equal(saidNonPositiveAmount('received 5000 against INV-0001 on 2026-10-01'), false);
  assert.equal(saidNonPositiveAmount('INV-0001 paid by bank'), false);
  const zero = await chat(state, 'received 0 against INV-0001');
  assert.match(zero.reply, /zero or less cannot be received/, zero.reply);
  const neg = await chat(state, 'received -5000 from Kiran Stores');
  assert.match(neg.reply, /zero or less cannot be received/, neg.reply);
  const cn = await chat(state, 'credit note for INV-0001 0 - short delivery');
  assert.match(cn.reply, /positive amount/, cn.reply);
  assert.equal(state.invoices[0].receipts?.length || 0, 0);
  await runTool(state, 'create_purchase', { partyName: 'Fabric Co', lines: [{ description: 'Yarn', qty: 1, rate: 10000, gstRate: 5 }], date: '2026-09-06' });
  const paid = await chat(state, 'paid Fabric Co 0');
  assert.match(paid.reply, /zero or less cannot be paid/, paid.reply);
  const tiny = await chat(state, 'received 0.001 against INV-0001');
  assert.match(tiny.reply, /positive amount/, tiny.reply);
  assert.doesNotMatch(tiny.reply, /Reply "yes"/);
});

test('a buyer or supplier GSTIN that does not check out is blocked at the preview and in the engine', async () => {
  const state = books();
  const held = await chat(state, 'invoice Kiran Stores gstin 27AABCU9603R1ZM 50000 GST 18%');
  assert.match(held.reply, /27AABCU9603R1ZM is not a valid GSTIN: the last character \(the check digit\) is wrong/, held.reply);
  assert.doesNotMatch(held.reply, /Reply "yes"/);
  const engine = await runTool(state, 'create_purchase', { partyName: 'Fabric Co', partyGstin: '00AAAAA0000A1Z0', lines: [{ description: 'Yarn', qty: 1, rate: 10000, gstRate: 5 }], date: '2026-09-06' });
  assert.equal(engine.error, 'INVALID_GSTIN');
  const good = await runTool(state, 'create_invoice', { ...SALE, partyGstin: '27AAACH7409R1Z1' });
  assert.equal(good.ok, true, JSON.stringify(good));
});

test('a pre-GST date, a far-future date and a zero total are blocked at the preview', async () => {
  const state = books();
  const old = await chat(state, 'invoice Kiran Stores 5000 GST 18% dated 2015-01-01');
  assert.match(old.reply, /before GST began on 1 July 2017/, old.reply);
  const far = await chat(state, 'invoice Kiran Stores 5000 GST 18% dated 2099-12-31');
  assert.match(far.reply, /more than a year ahead/, far.reply);
  const nothing = await chat(state, 'invoice Kiran Stores 0.001 GST 18%');
  assert.match(nothing.reply, /comes to nothing/, nothing.reply);
  assert.doesNotMatch(nothing.reply, /Reply "yes"/);
  assert.equal(state.invoices.length, 0);
});

test('failures and plain results come back in words, never as codes or JSON', async () => {
  const state = books();
  const audit = await chat(state, 'audit');
  assert.match(audit.reply, /nothing in the books to audit yet/, audit.reply);
  const print = await chat(state, 'print BILL-9999');
  assert.doesNotMatch(print.reply, /\(NOT_FOUND\)/, print.reply);
  await runTool(state, 'create_invoice', SALE);
  const journal = await chat(state, 'journal');
  assert.match(journal.reply, /^\d+ entries in the journal/, journal.reply);
  assert.match(journal.reply, /INV-0001  Dr .* Cr .* ₹/, journal.reply);
  assert.doesNotMatch(journal.reply, /pendingId|\{|\}/, journal.reply);
  const itr = await chat(state, 'itr');
  assert.doesNotMatch(itr.reply, /^\{|"[a-zA-Z]+":/, itr.reply);
});

test('a GSTR-1 exception names the month and the GSTIN problem in words', async () => {
  const state = books();
  state.invoices.push({ id: 'INV-0099', partyName: 'Bad Buyer', partyGstin: '27AABCU9603R1ZM', partyState: '27', date: '2026-10-03', status: 'open', total: 5900, taxable: 5000, lines: [{ description: 'Goods', qty: 1, rate: 5000, gstRate: 18, taxable: 5000, cgst: 450, sgst: 450, igst: 0 }], cgst: 450, sgst: 450, igst: 0 });
  const out = await runTool(state, 'exceptions', {});
  const row = (out.data.exceptions || []).find((e) => e.key.startsWith('gstr1:'));
  assert.ok(row, JSON.stringify(out.data).slice(0, 300));
  assert.match(row.title, /GSTR-1 for October 2026/);
  assert.match(row.why, /the check digit is wrong/);
});
