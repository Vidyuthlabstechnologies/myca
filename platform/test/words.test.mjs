import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inWords, spoken } from '../src/words.mjs';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { chat, propose } from '../src/router.mjs';
import { runTool } from '../src/tools.mjs';

test('dates and months read as words; ids, files, timestamps and financial years are left alone', () => {
  assert.equal(inWords('due on 2026-10-07, for 2026-09.'), 'due on 7 October 2026, for September 2026.');
  assert.equal(inWords('INV-0001 GSTR2B_2026-10.csv 2026-10-07T12:00:00Z FY 2026-27 Q2 2026-27 confirm 503000514c47'), 'INV-0001 GSTR2B_2026-10.csv 2026-10-07T12:00:00Z FY 2026-27 Q2 2026-27 confirm 503000514c47');
  assert.equal(inWords('2026-13 and 2026-02-30x'), '2026-13 and 2026-02-30x');
  assert.equal(inWords(undefined), undefined);
});

test('only the words change, never the data', () => {
  const out = spoken({ reply: 'On 2026-10-08.', preview: { summary: 'Due 2026-11-04.', effects: ['For 2026-10.'], figures: { date: '2026-10-08' } }, tools: [{ result: { date: '2026-10-08' } }] });
  assert.equal(out.reply, 'On 8 October 2026.');
  assert.equal(out.preview.summary, 'Due 4 November 2026.');
  assert.deepEqual(out.preview.effects, ['For October 2026.']);
  assert.equal(out.preview.figures.date, '2026-10-08');
  assert.equal(out.tools[0].result.date, '2026-10-08');
});

const JARGON = /\b20\d{2}-(0[1-9]|1[0-2])-\d{2}\b|\bDebit\b|\bcredit (cash|bank|sales)\b|\bfolio\b|\bITC\b|Tool \w+ (failed|blocked)/;

test('everyday chat replies and previews read as plain words', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'Kiran Stores', lines: [{ description: 'Supply', rate: 50000, gstRate: 18 }] });
  createPurchase(state, { id: 'BILL-0001', date: '2026-09-02', partyName: 'Fabric Co', lines: [{ description: 'Cloth', rate: 10000, gstRate: 5 }] });
  const said = [];
  for (const message of [
    'invoice Retail Mart 8000 GST 18%', 'no',
    'received 20000 from Kiran Stores', 'yes',
    'bill from Fabric Co 10000 GST 5%', 'yes',
    'paid Fabric Co 4000', 'yes',
    'paid 12000 rent', 'no',
    'credit note INV-0001 5000 damaged goods', 'no',
    'who owes me?', 'how much do I owe Fabric Co?',
    'remind me to call Kiran tomorrow', 'yes', 'my reminders',
    'quote Retail Mart 25000 for design GST 18%', 'no',
    'cash forecast', 'help', 'please dance',
  ]) {
    const out = await chat(state, message);
    said.push([message, out.reply, ...(out.preview?.effects || [])]);
  }
  said.push(['bad receipt', (await propose(state, 'record_receipt', { invoiceId: 'INV-9999' })).reply]);
  said.push(['locked', (await chat(state, 'invoice Retail Mart 8000 GST 18% on 2019-01-01')).reply]);
  const check = await runTool(state, 'books_check', {});
  for (const finding of check.data.findings) said.push(['books check', finding.title, finding.detail]);
  for (const [message, ...texts] of said) {
    for (const text of texts) assert.doesNotMatch(String(text), JARGON, `${message}: ${text}`);
  }
});
