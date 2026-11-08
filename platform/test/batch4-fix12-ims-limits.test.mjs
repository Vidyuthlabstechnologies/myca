import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { propose, confirmPending } from '../src/router.mjs';
import { assistantTools, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { IMS_MAX_KEY, imsReview, pinImsRows, planImsDecision } from '../src/ims.mjs';
import { documentKey, import2b, normNumber } from '../src/gstr2b-check.mjs';

const PERIOD = '2026-09';
const GSTIN = '27AABCT1332L1ZE';
const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const sheet = (...lines) => [HEADER, ...lines].join('\n');
const row = (number, { gstin = GSTIN, name = 'FABRIC CO', section = 'B2B', date = '05-09-2026' } = {}) => `${section},${gstin},${name},${number},${date},1000,25,25,0,0,1050,Y`;
const rowsOf = (state, period = PERIOD) => imsReview(state, { period }).data.rows;
const bare = (length) => 'I'.repeat(length);
const keyWith = (length) => `${PERIOD}|${GSTIN}|${bare(length)}|B2B`;

async function statement(csv, period = PERIOD) {
  const state = createState();
  const added = await runTool(state, 'import_gstr2b', { period, csv, fileName: 'GSTR2B.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  return { state, added };
}

function storedRow(state, number, period = PERIOD) {
  state.gstr2b[period].rows.push({ section: 'B2B', supplierGstin: GSTIN, supplierName: 'FABRIC CO', invoiceNo: number, invoiceDate: '2026-09-05', taxableValue: 1000, cgst: 25, sgst: 25, igst: 0, cess: 0, totalValue: 1050, itcAvailability: 'Y', sourceRow: 99 });
}

function schemaLimit() {
  const catalog = Object.fromEntries(assistantTools(TOOLS).map((tool) => [tool.name, tool]));
  return catalog.ims_decide.parameters.properties.keys.items.maxLength;
}

test('E3: the key limit in the engine and in the tool schema is one number, 400', () => {
  assert.equal(IMS_MAX_KEY, 400);
  assert.equal(schemaLimit(), IMS_MAX_KEY);
  const at = (length) => validateAssistantToolCall('ims_decide', { period: PERIOD, decision: 'accept', keys: ['K'.repeat(length)] });
  assert.equal(at(400).ok, true, JSON.stringify(at(400)));
  assert.equal(at(401).ok, false);
  assert.equal(at(120).ok, true);
});

test('E3: a row with a 100-character invoice number can be decided by its key, in a tool call and in a chat proposal', async () => {
  const { state } = await statement(sheet(row(bare(100)), row('F-1')));
  const long = rowsOf(state).find((item) => item.invoiceNo === bare(100));
  assert.equal(long.key, keyWith(100));
  assert.ok(long.key.length > 120 && long.key.length <= IMS_MAX_KEY, String(long.key.length));
  assert.equal(validateAssistantToolCall('ims_decide', { period: PERIOD, decision: 'accept', keys: [long.key] }).ok, true);
  const held = propose(state, 'ims_decide', { period: PERIOD, keys: [long.key], decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.deepEqual(state.pendingChatAction.args.keys, [long.key]);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.equal(state.imsDecisions[long.key].decision, 'accept');
  const direct = await runTool(state, 'ims_decide', { period: PERIOD, keys: [long.key], decision: 'reject' });
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(rowsOf(state).find((item) => item.key === long.key).decision, 'reject');
});

test('E3: a statement row whose key would be longer than the limit is left out, counted, and named in plain words', async () => {
  const edge = 28 + 0;
  const fits = IMS_MAX_KEY - edge;
  assert.equal(keyWith(fits).length, IMS_MAX_KEY);
  const csv = sheet(row('F-1'), row(bare(fits)), row(bare(fits + 1)), row(bare(400)), row('F-2'));
  const { state, added } = await statement(csv);
  assert.equal(added.rows, 3, JSON.stringify(added));
  assert.equal(added.skipped, 2);
  assert.equal(added.errors.length, 2);
  for (const item of added.errors) {
    assert.equal(typeof item.message, 'string');
    assert.match(item.message, /too long to track/);
    assert.match(item.message, new RegExp(`${'I'.repeat(30)}`));
    assert.doesNotMatch(item.message, new RegExp(`${'I'.repeat(31)}`));
    assert.doesNotMatch(item.message, /_|undefined|\[object|null|NaN/);
    assert.match(item.message, /^Row \d+: /);
  }
  assert.deepEqual(added.errors.map((item) => item.row), [3, 4]);
  const keys = rowsOf(state).map((item) => item.key).sort();
  assert.deepEqual(keys, [`${PERIOD}|${GSTIN}|F1|B2B`, `${PERIOD}|${GSTIN}|F2|B2B`, keyWith(fits)].sort());
  for (const key of keys) assert.ok(key.length <= IMS_MAX_KEY);
  assert.equal(state.gstr2b[PERIOD].rows.length, 3);
  assert.equal(state.gstr2b[PERIOD].skipped, 2);
});

test('E3: a statement of only over-long rows reads nothing, and says why', async () => {
  const state = createState();
  const out = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: sheet(row(bare(500))), fileName: 'GSTR2B.csv' });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'NO_ROWS');
  assert.match(out.errors[0].message, /too long to track/);
  assert.equal(Object.hasOwn(state.gstr2b ?? {}, PERIOD), false);
});

test('E3: the preview before the import leaves out the same rows and names them', async () => {
  const state = createState();
  const preview = previewOf(state, 'import_gstr2b', { period: PERIOD, csv: sheet(row('F-1'), row(bare(400)), row(bare(380))) });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.figures.rows, 1);
  assert.equal(preview.figures.skipped, 2);
  assert.match(preview.summary, /1 entry from 1 supplier; 2 rows could not be read and will be left out/);
  assert.equal(preview.effects.filter((line) => /too long to track/.test(line)).length, 2);
  for (const line of preview.effects) assert.doesNotMatch(line, /_|undefined|\[object/);
});

test('E3: a statement with no long rows imports exactly as before: same answer, rows, keys and counts', async () => {
  const csv = sheet(row('F-101'), row('F/102', { name: 'FABRIC CO' }), row('CN-7', { section: 'CDNR' }), row('P-9', { gstin: '29AABCL1234J1ZL', name: 'PACK HOUSE' }), row('N-3', { gstin: '', name: 'NO GSTIN TRADERS' }));
  const first = createState();
  const answer = import2b(first, { period: PERIOD, csv, fileName: 'GSTR2B.csv' });
  assert.deepEqual(answer, { ok: true, period: PERIOD, rows: 5, skipped: 0, replaced: false });
  assert.equal(Object.hasOwn(answer, 'errors'), false);
  assert.deepEqual(rowsOf(first).map((item) => item.key).sort(), [
    `${PERIOD}|${GSTIN}|F101|B2B`,
    `${PERIOD}|${GSTIN}|F102|B2B`,
    `${PERIOD}|${GSTIN}|CN7|CDNR`,
    `${PERIOD}|29AABCL1234J1ZL|P9|B2B`,
    `${PERIOD}|NOGSTINTRADERS|N3|B2B`,
  ].sort());
  const again = import2b(first, { period: PERIOD, csv: sheet(row('F-1'), 'B2B,BAD,X,F-2,not-a-date,1,1,1,1,1,1,Y'), fileName: 'GSTR2B.csv' });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.replaced, true);
  assert.equal(again.rows, 2);
  assert.equal(again.skipped, 1);
  assert.equal(Object.hasOwn(again, 'errors'), false);
});

test('E3: a decision stored under a key of 118 characters still shows after the change', async () => {
  const { state } = await statement(sheet(row(bare(90))));
  const key = keyWith(90);
  assert.equal(key.length, 118);
  state.imsDecisions = { [key]: { decision: 'accept', note: 'seen', by: 'usr-admin', on: '2026-11-01' } };
  const review = imsReview(state, { period: PERIOD }).data;
  assert.equal(review.rows[0].key, key);
  assert.equal(review.rows[0].decision, 'accept');
  assert.equal(review.rows[0].note, 'seen');
  assert.equal(review.orphaned, 0);
});

test('E3: a word-picked decision works for rows of any length, also for a row kept from an older import', async () => {
  const { state } = await statement(sheet(row('F-1'), row(bare(100))));
  storedRow(state, bare(450));
  const plan = planImsDecision(state, { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(plan.rows.length, 3);
  const done = await runTool(state, 'ims_decide', { period: PERIOD, select: 'all', decision: 'accept' });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(done.count, 3);
  assert.equal(Object.keys(state.imsDecisions).length, 3);
  assert.ok(Object.keys(state.imsDecisions).some((key) => key.length > IMS_MAX_KEY));
});

test('E3: rows are pinned to their keys up to the limit, and left as the word above it', async () => {
  const { state } = await statement(sheet(row('F-1'), row(bare(100))));
  const plan = planImsDecision(state, { period: PERIOD, select: 'all', decision: 'accept' });
  const pinned = pinImsRows({ period: PERIOD, select: 'all', decision: 'accept' }, plan);
  assert.equal(pinned.select, undefined);
  assert.equal(pinned.keys.length, 2);
  const top = { rows: [{ key: 'K'.repeat(IMS_MAX_KEY) }] };
  assert.deepEqual(pinImsRows({ select: 'all' }, top).keys, ['K'.repeat(IMS_MAX_KEY)]);
  const over = { rows: [{ key: 'K'.repeat(IMS_MAX_KEY + 1) }] };
  assert.deepEqual(pinImsRows({ select: 'all' }, over), { select: 'all' });
});

test('E3: no row the importer admits can have a key over the limit (invoice numbers of 0 to 500 characters, suppliers with and without GSTIN, sections of 0 to 30 characters)', () => {
  let seed = 20260908;
  const next = (n) => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % n;
  };
  const sections = ['B2B', 'B2BA', 'CDNR', 'CDNRA', 'ISD', 'IMPG', ''];
  let widest = 0;
  let admitted = 0;
  let left = 0;
  for (let round = 0; round < 60; round += 1) {
    const lines = [];
    for (let i = 0; i < 25; i += 1) {
      const number = next(4) === 0 ? bare(360 + next(141)) : bare(next(501));
      const gstin = next(3) === 0 ? '' : GSTIN;
      const name = next(2) === 0 ? 'A'.repeat(1 + next(150)) : 'Fabric Co';
      const section = next(3) === 0 ? 'S'.repeat(next(31)) : sections[next(sections.length)];
      lines.push(row(number, { gstin, name, section }));
    }
    const state = createState();
    const answer = import2b(state, { period: PERIOD, csv: sheet(...lines), fileName: 'GSTR2B.csv' });
    if (!answer.ok) {
      left += 25;
      continue;
    }
    left += answer.skipped;
    const stored = state.gstr2b[PERIOD].rows;
    admitted += stored.length;
    for (const item of stored) {
      const key = documentKey(PERIOD, item);
      widest = Math.max(widest, key.length);
      assert.ok(key.length <= IMS_MAX_KEY, `${key.length}: ${key.slice(0, 80)}`);
    }
    for (const item of imsReview(state, { period: PERIOD }).data.rows) assert.ok(item.key.length <= IMS_MAX_KEY);
  }
  assert.ok(admitted > 300, String(admitted));
  assert.ok(left > 50, String(left));
  assert.ok(widest > 300 && widest <= IMS_MAX_KEY, String(widest));
  assert.equal(normNumber(bare(5)), 'IIIII');
});
