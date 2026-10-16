import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-aa-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { parseAaFiData, looksLikeAaJson } from '../src/aa-import.mjs';
import { keywordsOf, gatherNotes, knowledgePrompt } from '../src/knowledge.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const FI = JSON.stringify({
  fiObjects: [{
    fipId: 'HDFC-FIP',
    maskedAccNumber: 'XXXXXXXX4321',
    type: 'deposit',
    Profile: { Holders: { Holder: [{ name: 'Nalanda Textiles' }] } },
    Summary: { currentBalance: '151200.00', currency: 'INR', type: 'CURRENT' },
    Transactions: {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      Transaction: [
        { type: 'CREDIT', mode: 'UPI', amount: '12000.00', currentBalance: '162000.00', transactionTimestamp: '2026-09-03T10:12:00+05:30', valueDate: '2026-09-03', txnId: 'T1', narration: 'UPI/Kiran Stores/INV-0001', reference: 'UPI123' },
        { type: 'DEBIT', mode: 'NEFT', amount: '10800.00', currentBalance: '151200.00', transactionTimestamp: '2026-09-05T15:00:00+05:30', valueDate: '2026-09-05', txnId: 'T2', narration: 'NEFT/Bharat Yarns/BILL-77', reference: 'N0077' },
        { type: 'DEBIT', mode: 'ATM', currentBalance: '151200.00', valueDate: '2026-09-06', narration: 'Missing amount' },
      ],
    },
  }],
});

test('Account Aggregator FI data becomes bank rows: credits and debits by value date, a transaction without an amount is skipped', () => {
  assert.equal(looksLikeAaJson(FI), true);
  assert.equal(looksLikeAaJson('Date,Narration\n2026-09-01,x'), false);
  const parsed = parseAaFiData(FI);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.rows[1], ['2026-09-03', 'UPI/Kiran Stores/INV-0001', '', '12000.00', '162000.00', 'UPI123']);
  assert.deepEqual(parsed.rows[2], ['2026-09-05', 'NEFT/Bharat Yarns/BILL-77', '10800.00', '', '151200.00', 'N0077']);
  assert.equal(parsed.skipped, 1);
  assert.deepEqual(parsed.accounts, [{ maskedAccNumber: 'XXXXXXXX4321', fipId: 'HDFC-FIP', accountType: 'CURRENT', currentBalance: 151200, transactions: 2 }]);
  assert.equal(parseAaFiData('{"nothing":1}').error, 'NO_TRANSACTIONS');
  assert.equal(parseAaFiData('not json').error, 'NOT_JSON');
});

test('chat: an attached FI data JSON imports as a bank statement after the preview, and the bank balance is read from it', async () => {
  const state = createState();
  state.pendingFile = { name: 'fi-data.json', content: FI };
  const preview = await chat(state, 'import account aggregator data');
  assert.match(preview.reply, /Account Aggregator data \(XXXXXXXX4321\): 2 rows parsed/, preview.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Account Aggregator data brought in for XXXXXXXX4321 at HDFC-FIP: 2 transactions read, 2 posted to your books, 1 without a date or amount skipped\./, done.reply);
  assert.equal(state.imports.at(-1).posted, 2);
  const direct = await runTool(createState(), 'import_bank', { content: FI });
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(direct.data.bankBalance.balance, 151200);
  assert.equal(direct.data.aa.accounts[0].fipId, 'HDFC-FIP');
});

test('knowledge: the question is answered from the notes through the gate; no notes means no model call; a dry run still shows the notes', async () => {
  assert.deepEqual(keywordsOf('What do our notes say about the audit fee for Kiran?'), ['audit', 'fee', 'kiran']);
  const state = createState();
  const empty = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'what do our notes say about the audit fee'));
  assert.match(empty.reply, /Nothing in the firm's notes mentions that/, empty.reply);
  state.reminders = [{ id: 'REM-0001', text: 'Audit fee for Kiran Stores agreed at the September meeting; bill after the GSTR-9', due: '2026-10-20', createdOn: '2026-10-01', createdBy: '', done: null }];
  const notes = gatherNotes(state, 'what do our notes say about the audit fee for Kiran?');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].matched, 3);
  const prompt = knowledgePrompt('audit fee?', notes);
  assert.match(prompt.systemPrompt, /Never state an amount/);
  assert.match(prompt.prompt, /\[reminder REM-0001 2026-10-20\]/);
  const mock = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'ask the notes about the audit fee for Kiran'));
  assert.match(mock.reply, /^Simulated: Simulated answer from 1 note: \[reminder REM-0001\]/, mock.reply);
  assert.match(mock.reply, /From 1 note found:\n· reminder REM-0001/);
  const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'ask_knowledge', { question: 'audit fee for Kiran' }));
  assert.equal(dry.ok, true);
  assert.equal(dry.blocked, 'LIVE_CALLS_DISABLED');
  assert.equal(dry.notes.length, 1);
  const dryWords = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => chat(state, 'from our notes, audit fee for Kiran'));
  assert.match(dryWords.reply, /I could not ask the model \(LIVE_CALLS_DISABLED/, dryWords.reply);
  assert.match(dryWords.reply, /· reminder REM-0001/);
});
