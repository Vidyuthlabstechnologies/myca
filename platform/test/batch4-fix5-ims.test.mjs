import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { propose, confirmPending, chat, fmtToolResult } from '../src/router.mjs';
import { IMS_MAX_ROWS, imsDecidedWords, imsReview, planImsDecision } from '../src/ims.mjs';

const PERIOD = '2026-10';
const GSTIN = '27AABCT1332L1ZE';
const NEWCOMER_GSTIN = '27AAACD1111A1Z5';
const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const BASE = 'Nothing is posted. Take the same decisions on the GST portal\'s IMS; the Excel sheet lists them.';
const ACCEPT_MATCHED = { period: PERIOD, select: 'matched', decision: 'accept' };
const ALREADY_ACCEPTED = 'Every invoice you asked for is already accepted, so nothing was marked.';
const ALREADY_NOT_DECIDED = 'Every invoice you asked for is already not decided, so nothing was marked.';
const TOO_MANY = 'IMS takes up to 500 invoices in one go; pick fewer, or decide in parts.';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const numberOf = (i) => `S-${String(i).padStart(4, '0')}`;
const keyOf = (i) => `${PERIOD}|${GSTIN}|S${String(i).padStart(4, '0')}|B2B`;
const rowOf = (i) => `B2B,${GSTIN},FABRIC CO,${numberOf(i)},05-10-2026,1000,25,25,0,0,1050,Y`;
const newcomerKey = (i) => `${PERIOD}|${NEWCOMER_GSTIN}|N${i}|B2B`;
const newcomerRow = (i) => `B2B,${NEWCOMER_GSTIN},AAA CO,N-${i},06-10-2026,1000,25,25,0,0,1050,Y`;
const review = (state) => imsReview(state, { period: PERIOD }).data;
const keysOf = (plan) => plan.rows.map((row) => row.key);
const undecidedKeys = (state) => review(state).rows.filter((row) => !row.decision).map((row) => row.key);

function bill(state, partyName, partyGstin, supplierInvoiceNo, date) {
  const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
}

async function month(count, { booked = count } = {}) {
  const state = createState();
  const added = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, ...range(1, count).map(rowOf)].join('\n'), fileName: 'many.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  for (const i of range(1, booked)) bill(state, 'Fabric Co', GSTIN, numberOf(i), '2026-10-05');
  return state;
}

async function decideKeys(state, keys, decision) {
  for (let from = 0; from < keys.length; from += IMS_MAX_ROWS) {
    const out = await runTool(state, 'ims_decide', { period: PERIOD, keys: keys.slice(from, from + IMS_MAX_ROWS), decision });
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  }
}

test('APP-IMS-1: 620 matched invoices are accepted in a round of 500 and a round of 120, and a third ask says every one already has the decision', async () => {
  const state = await month(620);
  assert.deepEqual(review(state).counts, { total: 620, accept: 0, reject: 0, pending: 0, undecided: 620 });
  assert.equal(review(state).rows.filter((row) => row.match === 'matched').length, 620);

  const first = planImsDecision(state, ACCEPT_MATCHED);
  assert.equal(first.ok, true, JSON.stringify(first).slice(0, 300));
  assert.deepEqual(keysOf(first), range(1, 500).map(keyOf));
  assert.equal(first.left, 120);
  assert.equal(first.credit, 25000);

  const preview = previewOf(state, 'ims_decide', ACCEPT_MATCHED);
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.summary, 'Mark 500 invoices in IMS for 2026-10 as accepted (credit ₹25,000.00).');
  assert.deepEqual(preview.effects, [BASE, '120 more matched invoices are left; ask again after this to do them.']);
  assert.deepEqual(preview.figures, { count: 500, credit: 25000 });
  assert.deepEqual(preview.pinned, { period: PERIOD, decision: 'accept', keys: range(1, 500).map(keyOf) });
  assert.deepEqual(state.imsDecisions, {}, 'a preview changes nothing');

  const held = propose(state, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.summary, 'Mark 500 invoices in IMS for October 2026 as accepted (credit ₹25,000.00).');
  assert.deepEqual(held.preview.effects, [BASE, '120 more matched invoices are left; ask again after this to do them.']);
  assert.deepEqual(state.pendingChatAction.args.keys, range(1, 500).map(keyOf));
  assert.equal(state.pendingChatAction.args.select, undefined);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.reply, 'Marked 500 rows accepted in IMS for October 2026.');
  const afterFirst = review(state);
  assert.deepEqual(afterFirst.counts, { total: 620, accept: 500, reject: 0, pending: 0, undecided: 120 });
  assert.deepEqual(undecidedKeys(state), range(501, 620).map(keyOf));
  assert.equal(afterFirst.rows.filter((row) => !row.decision && row.match === 'matched').length, 120, 'the first round leaves 120 undecided matched invoices');

  const second = planImsDecision(state, ACCEPT_MATCHED);
  assert.equal(second.ok, true, JSON.stringify(second).slice(0, 300));
  assert.deepEqual(keysOf(second), range(501, 620).map(keyOf));
  assert.equal('left' in second, false, 'nothing is left after the second round');
  const heldTwo = propose(state, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(heldTwo.awaitingConfirmation, true, heldTwo.reply);
  assert.equal(heldTwo.preview.summary, 'Mark 120 invoices in IMS for October 2026 as accepted (credit ₹6,000.00).');
  assert.deepEqual(heldTwo.preview.effects, [BASE]);
  const doneTwo = await confirmPending(state, heldTwo.preview.token);
  assert.equal(doneTwo.posted, true, doneTwo.reply);
  assert.equal(doneTwo.reply, 'Marked 120 rows accepted in IMS for October 2026.');
  assert.deepEqual(review(state).counts, { total: 620, accept: 620, reject: 0, pending: 0, undecided: 0 });

  const third = planImsDecision(state, ACCEPT_MATCHED);
  assert.equal(third.ok, false);
  assert.equal(third.error, 'NO_MATCH');
  assert.equal(third.hint, ALREADY_ACCEPTED);
  assert.deepEqual(previewOf(state, 'ims_decide', ACCEPT_MATCHED).blockers, [ALREADY_ACCEPTED]);
  const blocked = propose(state, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reply, `I did not post anything, because:\n· ${ALREADY_ACCEPTED}`);
  assert.equal(Object.keys(state.imsDecisions).length, 620, 'the third ask changes nothing');
});

test('APP-IMS-1: the tool run on its own decides one round at a time and answers in the shape it always had', async () => {
  const state = await month(620);
  const one = await runTool(state, 'ims_decide', ACCEPT_MATCHED);
  assert.deepEqual(one, { ok: true, period: PERIOD, decision: 'accept', count: 500, credit: 25000, keys: range(1, 500).map(keyOf) });
  assert.equal(imsDecidedWords(one), 'Marked 500 rows accepted in IMS for 2026-10.');
  const two = await runTool(state, 'ims_decide', ACCEPT_MATCHED);
  assert.deepEqual(two, { ok: true, period: PERIOD, decision: 'accept', count: 120, credit: 6000, keys: range(501, 620).map(keyOf) });
  const three = await runTool(state, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(three.ok, false);
  assert.equal(three.error, 'NO_MATCH');
  assert.equal(fmtToolResult('ims_decide', three), ALREADY_ACCEPTED);
  assert.equal(Object.keys(state.imsDecisions).length, 620);
});

test('APP-IMS-1: 520 matched invoices with 30 already accepted are one round of 490, not a refusal', async () => {
  const state = await month(520);
  await decideKeys(state, range(101, 130).map(keyOf), 'accept');
  assert.deepEqual(review(state).counts, { total: 520, accept: 30, reject: 0, pending: 0, undecided: 490 });
  const plan = planImsDecision(state, ACCEPT_MATCHED);
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
  assert.deepEqual(keysOf(plan), [...range(1, 100), ...range(131, 520)].map(keyOf));
  assert.equal('left' in plan, false);
  assert.equal(plan.credit, 24500);
  const held = propose(state, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.summary, 'Mark 490 invoices in IMS for October 2026 as accepted (credit ₹24,500.00).');
  assert.deepEqual(held.preview.effects, [BASE]);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.reply, 'Marked 490 rows accepted in IMS for October 2026.');
  assert.deepEqual(review(state).counts, { total: 520, accept: 520, reject: 0, pending: 0, undecided: 0 });
  assert.equal(planImsDecision(state, ACCEPT_MATCHED).hint, ALREADY_ACCEPTED);
});

test('APP-IMS-1: the words all, undecided, suggested and matched follow one rule: drop what already has the decision, plan the first 500, say how many are left', async () => {
  const cases = [
    ['all', 620, 'invoices', ALREADY_ACCEPTED],
    ['undecided', 620, 'undecided invoices', 'No invoice in that month is undecided, so nothing was marked.'],
    ['suggested', 600, 'suggested invoices', ALREADY_ACCEPTED],
    ['matched', 600, 'matched invoices', ALREADY_ACCEPTED],
  ];
  for (const [select, picked, noun, ending] of cases) {
    const state = await month(620, { booked: 600 });
    const args = { period: PERIOD, select, decision: 'accept' };
    const plan = planImsDecision(state, args);
    assert.equal(plan.ok, true, `${select}: ${JSON.stringify(plan).slice(0, 200)}`);
    assert.deepEqual(keysOf(plan), range(1, 500).map(keyOf), select);
    assert.equal(plan.left, picked - 500, select);
    assert.deepEqual(previewOf(state, 'ims_decide', args).effects, [BASE, `${picked - 500} more ${noun} are left; ask again after this to do them.`], select);
    const one = await runTool(state, 'ims_decide', args);
    assert.equal(one.count, 500, select);
    const two = await runTool(state, 'ims_decide', args);
    assert.equal(two.count, picked - 500, `${select}: the second round is what the first left`);
    assert.deepEqual(two.keys, range(501, picked).map(keyOf), select);
    assert.equal(review(state).counts.accept, picked, select);
    const three = await runTool(state, 'ims_decide', args);
    assert.equal(three.ok, false, select);
    assert.equal(three.error, 'NO_MATCH', select);
    assert.equal(three.hint, ending, select);
  }
});

test('APP-IMS-1: clearing decisions follows the same rule, with the rows that carry a decision as the rows still to do', async () => {
  const state = await month(620, { booked: 0 });
  await decideKeys(state, range(1, 620).map(keyOf), 'pending');
  assert.deepEqual(review(state).counts, { total: 620, accept: 0, reject: 0, pending: 620, undecided: 0 });
  const args = { period: PERIOD, select: 'all', decision: 'clear' };
  const plan = planImsDecision(state, args);
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
  assert.deepEqual(keysOf(plan), range(1, 500).map(keyOf));
  assert.equal(plan.left, 120);
  const preview = previewOf(state, 'ims_decide', args);
  assert.equal(preview.summary, 'Mark 500 invoices in IMS for 2026-10 as not decided (credit ₹25,000.00).');
  assert.deepEqual(preview.effects, [BASE, '120 more invoices are left; ask again after this to do them.']);
  const one = await runTool(state, 'ims_decide', args);
  assert.equal(imsDecidedWords(one), 'Cleared the decision on 500 rows in IMS for 2026-10; they are not decided again.');
  assert.deepEqual(review(state).counts, { total: 620, accept: 0, reject: 0, pending: 120, undecided: 500 });
  const second = planImsDecision(state, args);
  assert.deepEqual(keysOf(second), range(501, 620).map(keyOf));
  assert.equal('left' in second, false);
  const two = await runTool(state, 'ims_decide', args);
  assert.equal(two.count, 120);
  assert.deepEqual(review(state).counts, { total: 620, accept: 0, reject: 0, pending: 0, undecided: 620 });
  const third = planImsDecision(state, args);
  assert.equal(third.error, 'NO_MATCH');
  assert.equal(third.hint, ALREADY_NOT_DECIDED);
  assert.deepEqual(previewOf(state, 'ims_decide', args).blockers, [ALREADY_NOT_DECIDED]);

  const some = await month(620, { booked: 0 });
  await decideKeys(some, range(301, 500).map(keyOf), 'reject');
  const only = planImsDecision(some, args);
  assert.equal(only.ok, true, JSON.stringify(only).slice(0, 300));
  assert.deepEqual(keysOf(only), range(301, 500).map(keyOf), 'only the rows that carry a decision are cleared');
  assert.equal('left' in only, false);
  assert.deepEqual(previewOf(some, 'ims_decide', args).effects, [BASE]);
  assert.equal(previewOf(some, 'ims_decide', args).summary, 'Mark 200 invoices in IMS for 2026-10 as not decided (credit ₹10,000.00).');
});

test('APP-IMS-1: exactly 500 invoices behave as before with no words about rows left; 501 is where the rule starts', async () => {
  const exact = await month(500);
  await decideKeys(exact, range(1, 5).map(keyOf), 'accept');
  const plan = planImsDecision(exact, ACCEPT_MATCHED);
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
  assert.equal(plan.rows.length, 500, 'the five already accepted stay in the plan, as they always did');
  assert.equal('left' in plan, false);
  const preview = previewOf(exact, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(preview.summary, 'Mark 500 invoices in IMS for 2026-10 as accepted (credit ₹25,000.00).');
  assert.deepEqual(preview.effects, [BASE]);
  assert.deepEqual(preview.figures, { count: 500, credit: 25000 });

  const over = await month(501);
  const oneLeft = planImsDecision(over, ACCEPT_MATCHED);
  assert.equal(oneLeft.ok, true, JSON.stringify(oneLeft).slice(0, 300));
  assert.equal(oneLeft.rows.length, 500);
  assert.equal(oneLeft.left, 1);
  assert.deepEqual(previewOf(over, 'ims_decide', ACCEPT_MATCHED).effects, [BASE, '1 more matched invoice is left; ask again after this to do it.']);

  await decideKeys(over, [keyOf(7)], 'accept');
  const fits = planImsDecision(over, ACCEPT_MATCHED);
  assert.equal(fits.rows.length, 500, 'one already accepted brings 501 down to a single round');
  assert.equal('left' in fits, false);
  assert.equal(keysOf(fits).includes(keyOf(7)), false);
  assert.deepEqual(previewOf(over, 'ims_decide', ACCEPT_MATCHED).effects, [BASE]);
  await decideKeys(over, [keyOf(8)], 'accept');
  assert.equal(planImsDecision(over, ACCEPT_MATCHED).rows.length, 499);
});

test('APP-IMS-1: more than 500 keys still fail with their own sentence, while the word finishes the job in rounds', async () => {
  const state = await month(620);
  const keys = range(1, 501).map(keyOf);
  const plan = planImsDecision(state, { period: PERIOD, keys, decision: 'accept' });
  assert.equal(plan.ok, false);
  assert.equal(plan.error, 'TOO_MANY_ROWS');
  assert.equal(plan.limit, 500);
  assert.deepEqual(previewOf(state, 'ims_decide', { period: PERIOD, keys, decision: 'accept' }).blockers, [TOO_MANY]);
  assert.equal(planImsDecision(state, { period: PERIOD, keys, select: 'matched', decision: 'accept' }).error, 'TOO_MANY_ROWS', 'keys win over a word');
  const refused = await runTool(state, 'ims_decide', { period: PERIOD, keys, decision: 'accept' });
  assert.equal(refused.error, 'TOO_MANY_ROWS');
  assert.equal(fmtToolResult('ims_decide', refused), TOO_MANY);
  assert.deepEqual(state.imsDecisions, {}, 'a refused decision changes nothing');
  assert.equal(planImsDecision(state, { period: PERIOD, keys: keys.slice(0, 500), decision: 'accept' }).rows.length, 500);
  const word = planImsDecision(state, ACCEPT_MATCHED);
  assert.equal(word.ok, true, JSON.stringify(word).slice(0, 300));
  assert.equal(word.rows.length, 500);
  assert.equal(word.left, 120);
});

test('APP-IMS-1: in chat the yes marks exactly the 500 invoices the preview showed, even when the book changes before it', async () => {
  const state = await month(620);
  const asked = await chat(state, 'accept all matched invoices in ims for 2026-10');
  assert.equal(asked.awaitingConfirmation, true, asked.reply);
  assert.match(asked.reply, /^Mark 500 invoices in IMS for October 2026 as accepted \(credit ₹25,000\.00\)\./);
  assert.match(asked.reply, /\n· 120 more matched invoices are left; ask again after this to do them\./);
  const previewed = [...state.pendingChatAction.args.keys];
  assert.deepEqual(previewed, range(1, 500).map(keyOf));
  assert.equal(state.pendingChatAction.args.select, undefined);

  const added = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, ...range(1, 5).map(newcomerRow), ...range(1, 620).map(rowOf)].join('\n'), fileName: 'again.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  for (const i of range(1, 5)) bill(state, 'Aaa Co', NEWCOMER_GSTIN, `N-${i}`, '2026-10-06');
  const fresh = planImsDecision(state, ACCEPT_MATCHED);
  assert.deepEqual(keysOf(fresh).slice(0, 5), range(1, 5).map(newcomerKey), 'a pick made now would start with the five new invoices');
  assert.notDeepEqual(keysOf(fresh), previewed);

  const yes = await chat(state, 'yes');
  assert.equal(yes.posted, true, yes.reply);
  assert.equal(yes.reply, 'Marked 500 rows accepted in IMS for October 2026.');
  assert.deepEqual(Object.keys(state.imsDecisions).sort(), [...previewed].sort(), 'exactly the previewed rows, no others');

  const again = await chat(state, 'accept all matched invoices in ims for 2026-10');
  assert.equal(again.awaitingConfirmation, true, again.reply);
  assert.match(again.reply, /^Mark 125 invoices in IMS for October 2026 as accepted \(credit ₹6,250\.00\)\./);
  assert.doesNotMatch(again.reply, /left/);
  assert.deepEqual(state.pendingChatAction.args.keys, [...range(1, 5).map(newcomerKey), ...range(501, 620).map(keyOf)]);
  const doneAgain = await chat(state, 'yes');
  assert.equal(doneAgain.reply, 'Marked 125 rows accepted in IMS for October 2026.');
  assert.equal(Object.keys(state.imsDecisions).length, 625);

  const last = await chat(state, 'accept all matched invoices in ims for 2026-10');
  assert.equal(last.blocked, true, last.reply);
  assert.equal(last.reply, `I did not post anything, because:\n· ${ALREADY_ACCEPTED}`);
  assert.equal(state.pendingChatAction, null);
});

test('APP-IMS-1: a round held before the books are saved and loaded again is still the same 500 invoices at the yes', async () => {
  const state = await month(620);
  const held = propose(state, 'ims_decide', ACCEPT_MATCHED);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(back.pendingChatAction.args.keys, range(1, 500).map(keyOf));
  assert.equal(back.pendingChatAction.args.select, undefined);
  const done = await confirmPending(back, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.reply, 'Marked 500 rows accepted in IMS for October 2026.');
  assert.deepEqual(undecidedKeys(back), range(501, 620).map(keyOf));
});

test('APP-IMS-1: when one key is too long to travel in the call, the word is kept and the yes still marks one round', async () => {
  const state = createState();
  const long = 'L'.repeat(110);
  const csv = [HEADER, `B2B,${GSTIN},FABRIC CO,${long},05-10-2026,1000,25,25,0,0,1050,Y`, ...range(1, 500).map(rowOf)].join('\n');
  const added = await runTool(state, 'import_gstr2b', { period: PERIOD, csv, fileName: 'long.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.ok(review(state).rows.some((row) => row.key.length > 120));
  const held = propose(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.deepEqual(held.preview.effects, [BASE, '1 more invoice is left; ask again after this to do it.']);
  assert.equal(state.pendingChatAction.args.select, 'all');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.reply, 'Marked 500 rows accepted in IMS for October 2026.');
  const rest = undecidedKeys(state);
  assert.equal(rest.length, 1);
  const next = planImsDecision(state, { period: PERIOD, select: 'all', decision: 'accept' });
  assert.deepEqual(keysOf(next), rest);
  assert.equal('left' in next, false);
});

test('APP-IMS-1: the words about rows left come after the warning about decisions that are replaced', async () => {
  const state = await month(620);
  await decideKeys(state, range(1, 100).map(keyOf), 'reject');
  const args = { period: PERIOD, select: 'all', decision: 'accept' };
  const preview = previewOf(state, 'ims_decide', args);
  assert.equal(preview.summary, 'Mark 500 invoices in IMS for 2026-10 as accepted (credit ₹25,000.00).');
  assert.deepEqual(preview.effects, [BASE, '100 of them already have a different decision, which this replaces.', '120 more invoices are left; ask again after this to do them.']);
  const held = propose(state, 'ims_decide', { ...args, note: 'checked against the portal' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(state.pendingChatAction.args.note, 'checked against the portal');
  assert.equal(state.pendingChatAction.args.keys.length, 500);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.imsDecisions[keyOf(1)].decision, 'accept');
  assert.equal(state.imsDecisions[keyOf(1)].note, 'checked against the portal');
  assert.deepEqual(review(state).counts, { total: 620, accept: 500, reject: 0, pending: 0, undecided: 120 });
});

test('APP-IMS-1: the phone path, propose then confirm in a signed-in session, finishes 620 invoices in two taps and answers a third in words', async () => {
  const s = openSession(createMemoryStores(), { seed: false });
  const signed = await s.signIn('USR-ADMIN', '1234');
  assert.equal(signed.ok, true);
  s.state.company = { ...s.state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  for (const i of range(1, 620)) bill(s.state, 'Fabric Co', GSTIN, numberOf(i), '2026-10-05');
  const added = await s.tool('import_gstr2b', { period: PERIOD, csv: [HEADER, ...range(1, 620).map(rowOf)].join('\n'), fileName: 'many.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));

  const first = await s.propose('ims_decide', ACCEPT_MATCHED);
  assert.equal(first.awaitingConfirmation, true, first.reply);
  assert.equal(first.preview.summary, 'Mark 500 invoices in IMS for October 2026 as accepted (credit ₹25,000.00).');
  assert.deepEqual(first.preview.effects, [BASE, '120 more matched invoices are left; ask again after this to do them.']);
  const doneOne = await s.confirm(first.preview.token);
  assert.equal(doneOne.posted, true, doneOne.reply);
  assert.equal(Object.keys(s.state.imsDecisions).length, 500);

  const second = await s.propose('ims_decide', ACCEPT_MATCHED);
  assert.equal(second.awaitingConfirmation, true, second.reply);
  assert.equal(second.preview.summary, 'Mark 120 invoices in IMS for October 2026 as accepted (credit ₹6,000.00).');
  assert.deepEqual(second.preview.effects, [BASE]);
  const doneTwo = await s.confirm(second.preview.token);
  assert.equal(doneTwo.posted, true, doneTwo.reply);
  assert.equal(Object.keys(s.state.imsDecisions).length, 620);

  const third = await s.propose('ims_decide', ACCEPT_MATCHED);
  assert.equal(third.blocked, true, third.reply);
  assert.equal(third.reply, `I did not post anything, because:\n· ${ALREADY_ACCEPTED}`);
});

test('APP-IMS-1: a month of 5,000 invoices is finished in ten rounds, and planning a round takes well under a second', async () => {
  const state = await month(5000, { booked: 0 });
  const args = { period: PERIOD, select: 'all', decision: 'accept' };
  const started = performance.now();
  const plan = planImsDecision(state, args);
  const elapsed = performance.now() - started;
  assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 300));
  assert.equal(plan.rows.length, 500);
  assert.equal(plan.left, 4500);
  assert.ok(elapsed < 1000, `planning one round took ${elapsed.toFixed(0)} ms`);
  let rounds = 0;
  let marked = 0;
  let ending = null;
  for (let i = 0; i < 20 && !ending; i += 1) {
    const out = await runTool(state, 'ims_decide', args);
    if (out.ok) {
      rounds += 1;
      marked += out.count;
    } else ending = out;
  }
  assert.equal(rounds, 10);
  assert.equal(marked, 5000);
  assert.equal(ending.error, 'NO_MATCH');
  assert.equal(ending.hint, ALREADY_ACCEPTED);
  assert.equal(Object.keys(state.imsDecisions).length, 5000);
});
