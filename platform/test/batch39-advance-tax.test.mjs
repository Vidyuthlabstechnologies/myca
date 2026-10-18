import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-advtax-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { advanceTax } from '../src/advance-tax.mjs';
import { trialBalance } from '../src/ledger.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';

const AS_OF = '2026-10-18';
function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Rao', gstin: '27AABCU9603R1ZN', state: '27', entityType: 'proprietorship' };
  return state;
}
const sale = (state, party, date, rate) => runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], date });

test('advance tax annualises the year to date, applies the regime and credits, splits into dated instalments, and records a payment net of which the next is computed', async () => {
  const state = books();
  for (const month of ['04', '05', '06', '07', '08', '09']) {
    await sale(state, 'Retail Mart', `2026-${month}-10`, 300000);
    await runTool(state, 'create_purchase', { partyName: 'Mills', lines: [{ description: 'Yarn', qty: 1, rate: 100000, gstRate: 5 }], date: `2026-${month}-12` });
    await runTool(state, 'post_expense', { narration: 'rent', amount: 50000, payee: 'Landlord', date: `2026-${month}-01` });
  }
  const est = advanceTax(state, { asOf: AS_OF });
  assert.equal(est.ok, true, JSON.stringify(est));
  const d = est.data;
  assert.equal(d.fy, '2026-27');
  assert.equal(d.monthsElapsed, 6);
  assert.equal(d.toDate.profit, 900000, 'six months of 300000 less 100000 less 50000');
  assert.equal(d.annualisedProfit, 1800000);
  assert.ok(d.tax > 0);
  assert.equal(d.credits.credits, 0);
  assert.equal(d.net, d.tax);
  assert.deepEqual(d.instalments.map((i) => [i.dueDate, i.cumulativePercent, i.status]), [['2026-06-15', 15, 'missed'], ['2026-09-15', 45, 'missed'], ['2026-12-15', 75, 'ahead'], ['2027-03-15', 100, 'ahead']]);
  assert.equal(d.instalments[0].dueNow, Math.round(d.net * 0.15 * 100) / 100);
  assert.equal(d.instalments[1].dueNow, Math.round((d.net * 0.45 - d.net * 0.15) * 100) / 100);
  assert.equal(d.next.dueDate, '2026-12-15');
  assert.match(d.interest, /234B and 234C/);
  assert.ok(d.forCA);
  assert.ok(REMOTE_QUERY_TOOLS.has('advance_tax'));

  const words = await chat(state, 'how much tax should I set aside?');
  assert.match(words.reply, /^For your CA to confirm\. Advance tax for 2026-27 as of .*, new regime\./, words.reply);
  assert.match(words.reply, /Profit so far ₹9,00,000\.00 over \d+ months/);
  assert.match(words.reply, /15 December 2026 \(75% cumulative/);
  assert.match(words.reply, /Assumptions: Profit to date is sales less credit notes/);

  const held = await chat(state, 'paid advance tax 50000 challan 0510001234567');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Record advance tax of ₹50,000\.00 for 2026-27 paid from the bank on .*, challan 0510001234567\./, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.advanceTaxPayments[0].id, 'ADV-0001');
  const after = advanceTax(state, { asOf: AS_OF }).data;
  assert.equal(after.paid, 50000);
  assert.equal(after.instalments[0].dueNow, Math.max(0, Math.round((after.net * 0.15 - 50000) * 100) / 100));
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.ok(trialBalance(state.ledger).rows.some((r) => r.code === '1300' && r.debitsPosted === 50000));
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.advanceTaxPayments.length, 1);
});

test('a company is told advance tax at a flat rate is for the CA; a tiny net is said to be below the threshold; presumptive is one instalment', async () => {
  const company = books();
  company.company.entityType = 'company';
  const refused = await chat(company, 'advance tax');
  assert.match(refused.reply, /individual or a proprietor; this business is a company/, refused.reply);
  const small = books();
  await sale(small, 'Someone', '2026-05-01', 20000);
  const tiny = advanceTax(small, { asOf: AS_OF }).data;
  assert.equal(tiny.liable, false);
  const words = await chat(small, 'tax kitna bachana hai');
  assert.match(words.reply, /Under ₹10,000 net, so no advance tax is due/, words.reply);
  const pres = advanceTax(books(), { asOf: AS_OF, presumptive: true }).data;
  assert.deepEqual(pres.instalments.map((i) => i.dueDate), ['2027-03-15']);
});
