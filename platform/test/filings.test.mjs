import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { runTool } from '../src/tools.mjs';
import { localToday } from '../src/dates.mjs';
import { monthsBack } from '../src/filings.mjs';
import { planFilingFromChat } from '../src/filing-intent.mjs';
import { inWords } from '../src/words.mjs';

function shiftMonth(ym, by) {
  const [y, m] = ym.split('-').map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const lastMonth = shiftMonth(localToday().slice(0, 7), -1);
const twoBack = shiftMonth(localToday().slice(0, 7), -2);

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

async function rowFor(state, returnType, period) {
  const out = await runTool(state, 'deadlines', {});
  return out.data.deadlines.find((row) => row.returnType === returnType && row.period === period);
}

test('a filing said in chat is previewed, recorded on yes, and the return shows as filed', async () => {
  const state = books();
  const before = await rowFor(state, 'GSTR-1', twoBack);
  assert.equal(before.level, 'overdue');
  const held = await chat(state, `filed GSTR-1 for ${twoBack}, ARN AA2708261234567`);
  assert.equal(held.preview?.tool, 'record_filing', held.reply);
  assert.match(held.preview.summary, new RegExp(`^Record GSTR-1 \\(monthly\\) for ${inWords(twoBack)} as filed on ${inWords(localToday())}, ARN AA2708261234567\\. It was due on ${inWords(before.dueDate)}\\. That is after the due date\\.$`));
  assert.equal(state.filings.length, 0, 'nothing before yes');
  const done = await chat(state, 'yes');
  assert.match(done.reply, /^Recorded GSTR-1 \(monthly\) for .* MyCA did not file anything\.$/);
  const after = await rowFor(state, 'GSTR-1', twoBack);
  assert.equal(after.level, 'filed');
  assert.deepEqual(after.filed, { arn: 'AA2708261234567', filedOn: localToday(), late: true });
});

test('a recorded filing clears the overdue item and the books check stops listing it', async () => {
  const state = books();
  const open = async () => (await runTool(state, 'exceptions', {})).data.exceptions.map((item) => item.title);
  assert.ok((await open()).includes(`GSTR-1 for ${inWords(twoBack)} has no filing recorded`));
  await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: twoBack, arn: 'AA2708261234567' });
  assert.equal((await open()).includes(`GSTR-1 for ${inWords(twoBack)} has no filing recorded`), false);
  const check = await runTool(state, 'books_check', {});
  const due = check.data.findings.find((item) => item.id === 'due');
  assert.doesNotMatch(due.detail, new RegExp(`GSTR-1 ${inWords(twoBack)}`));
});

test('an on-time filing is not called late, and the record survives saving', async () => {
  const state = books();
  const row = await rowFor(state, 'GSTR-1', twoBack);
  const out = await runTool(state, 'record_filing', { returnType: 'gstr-1', period: twoBack, arn: 'aa 2708 2612 3456 8', filedOn: row.dueDate, filedBy: 'the CA' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.filing.late, false);
  assert.equal(out.filing.arn, 'AA2708261234568');
  const loaded = deserialize(serialize(state));
  assert.deepEqual(loaded.filings, state.filings);
});

test('refusals: an unknown return, a bad ARN, a future date, twice, or a reused ARN', async () => {
  const state = books();
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: '2019-01', arn: 'AA2701191234567' })).error, 'UNKNOWN_RETURN');
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: twoBack, arn: 'short' })).error, 'BAD_ARN');
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: twoBack, arn: 'AA2708261234567', filedOn: '2099-01-01' })).error, 'FUTURE_DATE');
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: twoBack, arn: 'AA2708261234567' })).ok, true);
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: twoBack, arn: 'AA2708269999999' })).error, 'ALREADY_RECORDED');
  assert.equal((await runTool(state, 'record_filing', { returnType: 'GSTR-3B', period: twoBack, arn: 'AA2708261234567' })).error, 'ARN_USED');
  assert.equal(state.filings.length, 1);
  const blocked = await chat(state, 'filed GSTR-1 for 2019-01, ARN AA2701191234567');
  assert.match(blocked.reply, /MyCA does not list GSTR-1 for January 2019 for this business/);
});

test('chat needs the period and the ARN, and reads month names as the most recent past month', () => {
  assert.match(planFilingFromChat('filed GSTR-3B').reply, /say the period and the acknowledgement number/);
  assert.equal(planFilingFromChat('did I file GSTR-1?'), null);
  assert.equal(planFilingFromChat('I have not filed GSTR-1 for September'), null);
  const named = planFilingFromChat(`GSTR 3B for ${['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][Number(lastMonth.slice(5)) - 1]} filed by my CA, ack no AB1234567890`);
  assert.deepEqual(named.args, { returnType: 'GSTR-3B', period: lastMonth, arn: 'AB1234567890', filedOn: localToday(), filedBy: 'the CA' });
  assert.equal(monthsBack('2026-10-07', 2, 1).join(','), '2026-08,2026-09,2026-10,2026-11');
});

test('filings are listed newest first, in chat and for the app', async () => {
  const state = books();
  assert.match((await chat(state, 'my filings')).reply, /^No filing is recorded yet/);
  await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: twoBack, arn: 'AA2708261234567', filedOn: shiftMonth(localToday().slice(0, 7), -1) + '-10' });
  await runTool(state, 'record_filing', { returnType: 'GSTR-3B', period: twoBack, arn: 'AA2708267654321' });
  const listed = await runTool(state, 'list_filings', {});
  assert.deepEqual(listed.data.map((f) => f.returnType), ['GSTR-3B', 'GSTR-1']);
  assert.match((await chat(state, 'show filed returns')).reply, /^Recorded as filed:\n· GSTR-3B/);
});
