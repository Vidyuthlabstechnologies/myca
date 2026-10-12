import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { blockedCreditFor, headByWords, expenseHeads } from '../src/expenses.mjs';
import { planRetagFromChat } from '../src/expense-intent.mjs';
import { rules } from '../src/sprint-load.mjs';

const GOLDEN = new URL('../../sprints/statutory-rules/golden/gst-itc-blocked.json', import.meta.url);
const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('the blocked-credit golden cases pass against the dated rule', async () => {
  const result = await rules.runGolden(GOLDEN, ({ category, onDate }) => {
    const out = blockedCreditFor(category, onDate);
    return out.blocked ? { blocked: true, clause: out.clause, ruleUsed: out.ruleUsed } : out.ruleUsed ? { blocked: false, ruleUsed: out.ruleUsed } : { blocked: false };
  });
  assert.deepEqual(result.failures, [], JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
});

test('an expense under a blocked head takes no input credit even with the supplier GSTIN, and says which clause', async () => {
  const state = books();
  const preview = previewOf(state, 'post_expense', { narration: 'Team lunch at Hotel Sagar', amount: 1180, gstRate: 18, supplierGstin: '27AABCT1332L1ZE', date: '2026-10-03' });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.figures.head, '5250');
  assert.equal(preview.figures.inputCredit, false);
  assert.match(preview.summary, /input credit on food and refreshments is blocked \(CGST Act s\.17\(5\)\(b\)\(i\)\)/);
  assert.match(preview.summary, /not been reviewed by your CA yet/);
  const out = await runTool(state, 'post_expense', { narration: 'Team lunch at Hotel Sagar', amount: 1180, gstRate: 18, supplierGstin: '27AABCT1332L1ZE', date: '2026-10-03' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.expense.inputCredit, false);
  assert.deepEqual(out.expense.blockedCredit, { category: 'food-beverages-catering-beauty-health', section: 'CGST Act s.17(5)(b)(i)', ruleUsed: 'gst.itc.blocked@2019-02-01' });
  assert.equal(out.expense.taxable, 1180, 'the whole amount is cost');
  assert.equal(acc(state, '5250').debitsPosted, 1180);
  assert.equal(acc(state, '1200')?.debitsPosted || 0, 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const chosen = await runTool(state, 'post_expense', { narration: 'Diwali gifts for customers', amount: 5900, gstRate: 18, supplierGstin: '27AABCT1332L1ZE', date: '2026-10-20', head: '5260' });
  assert.equal(chosen.expense.inputCredit, false);
  assert.equal(chosen.expense.blockedCredit.section, 'CGST Act s.17(5)(h)');
  const allowed = await runTool(state, 'post_expense', { narration: 'Office rent', amount: 11800, gstRate: 18, supplierGstin: '27AABCT1332L1ZE', date: '2026-10-03' });
  assert.equal(allowed.expense.inputCredit, true);
  assert.equal(allowed.expense.blockedCredit, undefined);
  const heads = expenseHeads();
  assert.equal(heads.find((h) => h.code === '5250').blockedCredit, true);
  assert.equal(heads.find((h) => h.code === '5110').blockedCredit, undefined);
  assert.equal((await runTool(state, 'expense_heads', {})).data.find((h) => h.code === '5280').name, 'Car running and insurance');
});

test('a head is found from plain words: its name, part of its name, or a keyword', () => {
  assert.equal(headByWords('rent').code, '5110');
  assert.equal(headByWords('Rent').code, '5110');
  assert.equal(headByWords('travel').code, '5150');
  assert.equal(headByWords('conveyance').code, '5150');
  assert.equal(headByWords('petrol').code, '5150');
  assert.equal(headByWords('marketing').code, '5200');
  assert.equal(headByWords('food').code, '5250');
  assert.equal(headByWords('staff welfare').code, '5260');
  assert.equal(headByWords('other').code, '5100');
  assert.equal(headByWords('zzz'), null);
});

test('chat: a tag is corrected by typing, for a named expense and for the one just posted, and is remembered', async () => {
  const state = books();
  const posted = await chat(state, 'paid 12000 to Sharma Associates for consultancy');
  assert.equal(posted.preview?.tool, 'post_expense', posted.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /^Posted EXP-0001/);
  assert.equal(state.expenses[0].head, '5170');
  assert.deepEqual(planRetagFromChat(state, 'that was rent'), { kind: 'tool', name: 'set_expense_head', args: { id: 'EXP-0001', head: '5110' } });
  assert.deepEqual(planRetagFromChat(state, 'no, it should be advertising'), { kind: 'tool', name: 'set_expense_head', args: { id: 'EXP-0001', head: '5200' } });
  assert.deepEqual(planRetagFromChat(state, 'tag EXP-0001 as travel'), { kind: 'tool', name: 'set_expense_head', args: { id: 'EXP-0001', head: '5150' } });
  assert.deepEqual(planRetagFromChat(state, 'EXP-0001 is not fees, it is software'), { kind: 'tool', name: 'set_expense_head', args: { id: 'EXP-0001', head: '5230' } });
  assert.match(planRetagFromChat(state, 'move EXP-0001 to zzz').reply, /do not have a head called "zzz"/);
  assert.equal(planRetagFromChat(state, 'what was that?'), null);
  assert.equal(planRetagFromChat(state, 'that was fun'), null);
  const held = await chat(state, 'that was rent');
  assert.equal(held.preview?.tool, 'set_expense_head', held.reply);
  assert.equal(state.expenses[0].head, '5170', 'nothing before yes');
  const moved = await chat(state, 'yes');
  assert.match(moved.reply, /^Moved EXP-0001 to Rent\./);
  assert.equal(state.expenses[0].head, '5110');
  assert.equal(trialBalance(state.ledger).balanced, true);
  const again = await chat(state, 'paid 12000 to Sharma Associates for consultancy');
  assert.match(again.preview.summary, /Rent/);
  const fresh = books();
  assert.match(planRetagFromChat(fresh, 'that was rent').reply, /Say which expense/);
});
