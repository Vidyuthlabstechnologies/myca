import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-supbank-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { openSession } from '../src/session.mjs';
import { weeklyBrief } from '../src/weekly-brief.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
function shift(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}
const bill = (state, party, date, rate, extra = {}) => runTool(state, 'create_purchase', { partyName: party, lines: [{ description: 'Yarn', qty: 1, rate, gstRate: 5 }], date, ...extra });
const OWNER = { actor: { userId: 'owner1', role: 'admin', name: 'Owner' } };
const STAFF = { actor: { userId: 'staff1', role: 'staff', name: 'Staff' } };

test('a supplier\'s bank details are recorded by the owner only, a change is shown old against new, and the payout file names who is missing', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Ravi Packaging', days: 10 });
  await runTool(state, 'set_supplier_terms', { partyName: 'Mehta Fabrics', days: 10 });
  await bill(state, 'Ravi Packaging', shift(-12), 50000, { supplierInvoiceNo: 'RP/31' });
  await bill(state, 'Mehta Fabrics', shift(-12), 90000, { supplierInvoiceNo: 'MF/27' });
  await runTool(state, 'set_cash_balance', { bank: 500000, cash: 0, on: TODAY });

  const held = await chat(state, 'Ravi Packaging is paid to account 5010 0123 4567 89 IFSC hdfc0001234');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Ravi Packaging is paid to account 50100123456789 at HDFC0001234\./, held.reply);
  assert.match(held.reply, /calling the number you already have for them/);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /Confirm it on the phone number you have on file/);
  const stored = state.supplierTerms[Object.keys(state.supplierTerms).find((k) => /ravi/.test(k))];
  assert.equal(stored.bank.account, '50100123456789');
  assert.equal(stored.days, 10, 'the terms already recorded are kept');

  const changed = await chat(state, 'Ravi Packaging is paid to UPI ravi@okaxis');
  assert.match(changed.reply, /This replaces account 50100123456789 at HDFC0001234\./, changed.reply);
  assert.match(changed.reply, /commonest invoice fraud/);
  await chat(state, 'yes');
  const after = state.supplierTerms[Object.keys(state.supplierTerms).find((k) => /ravi/.test(k))];
  assert.equal(after.bank.upi, 'ravi@okaxis');
  assert.equal(after.bank.changedFrom.account, 'xxxx6789');

  const file = await chat(state, 'payout file');
  assert.match(file.reply, /supplier-payouts-.*\.csv: 1 supplier, ₹52,500\.00: Ravi Packaging ₹52,500\.00 to ravi@okaxis \(bank details changed recently\)\./, file.reply);
  assert.match(file.reply, /No bank details on record for Mehta Fabrics \(₹94,500\.00\)\. Say "Mehta Fabrics is paid to account 1234567890 IFSC HDFC0001234"/);
  assert.match(file.reply, /changed recently; confirm them on the phone number you have on file/);
  const raw = await runTool(state, 'supplier_payout_file', {});
  assert.match(raw.data.csv, /^Beneficiary name,Account number,IFSC,UPI,Amount,Narration\r?\n/);
  assert.match(raw.data.csv, /Ravi Packaging,,,ravi@okaxis,52500\.00,MyCA RP\/31/);

  const bad = await chat(state, 'Mehta Fabrics is paid to account 123 IFSC HDFC0001234');
  assert.match(bad.reply, /6 to 20 digits/, bad.reply);
  assert.equal((await chat(state, 'Nobody Co is paid to account 1234567890 IFSC HDFC0001234')).awaitingConfirmation, undefined);

  const session = openSession(join(process.env.APPDATA, 'owner', 'state.json'));
  await session.updateCompany({ name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN' });
  await session.tool('create_purchase', { partyName: 'Mehta Fabrics', lines: [{ description: 'Yarn', qty: 1, rate: 1000, gstRate: 5 }], date: shift(-3) }, OWNER);
  const staff = await session.tool('set_supplier_bank', { partyName: 'Mehta Fabrics', account: '1234567890', ifsc: 'HDFC0001234' }, STAFF);
  assert.equal(staff.error, 'OWNER_ONLY');
  const staffFile = await session.tool('supplier_payout_file', {}, STAFF);
  assert.equal(staffFile.error, 'OWNER_ONLY');
  const owner = await session.tool('set_supplier_bank', { partyName: 'Mehta Fabrics', account: '1234567890', ifsc: 'HDFC0001234' }, OWNER);
  assert.equal(owner.ok, true, JSON.stringify(owner));
  assert.equal(owner.bank.account, 'xxxx7890', 'the account is masked in the result');
});

test('the Monday brief names customers who have gone quiet', async () => {
  const state = books();
  const sale = (party, date) => runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }], date });
  await sale('Quiet One', shift(-200));
  await sale('Quiet One', shift(-150));
  await sale('Still Buying', shift(-200));
  await sale('Still Buying', shift(-20));
  await sale('Long Gone', shift(-400));
  const d = weeklyBrief(state).data;
  assert.deepEqual(d.quiet.map((q) => [q.customer, q.daysSince]), [['Quiet One', 150]]);
  const words = await chat(state, 'how is business?');
  assert.match(words.reply, /Gone quiet: Quiet One \(last sale 150 days ago\)\. A call may be worth more than a reminder\./, words.reply);
});
