import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { planUsFromChat } from '../src/us-intent.mjs';
import { periodsOf, rangeOf, periodContaining } from '../src/us-sales-tax.mjs';
import { localToday } from '../src/dates.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

async function bakery() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', pan: '', fy: '', address: '12 Maple St, Austin, TX 78701' };
  assert.equal((await runTool(state, 'set_sales_tax_rate', { code: 'TX-AUSTIN', name: 'Austin, Texas', ratePercent: 8.25, from: '2026-01-01' })).ok, true);
  assert.equal((await runTool(state, 'set_sales_tax_rate', { code: 'TX', name: 'Texas', ratePercent: 6.25, from: '2026-01-01' })).ok, true);
  assert.equal((await runTool(state, 'set_sales_tax_rate', { code: 'CA', name: 'California', ratePercent: 7.25, from: '2026-01-01' })).ok, true);
  const nexus = await runTool(state, 'set_sales_tax_nexus', { state: 'tx', frequency: 'quarterly', from: '2026-01-01', permitNo: '3-20000-0000-1' });
  assert.equal(nexus.ok, true, JSON.stringify(nexus));
  await runTool(state, 'create_invoice', { partyName: 'Cafe Luna', lines: [{ description: 'Wedding cake', qty: 1, rate: 500 }, { description: 'Delivery', qty: 1, rate: 40, taxable: false }], date: '2026-07-10', taxJurisdiction: 'TX-AUSTIN' });
  await runTool(state, 'create_invoice', { partyName: 'Hill Country Deli', lines: [{ description: 'Pies', qty: 10, rate: 20 }], date: '2026-08-15', taxJurisdiction: 'TX' });
  await runTool(state, 'create_invoice', { partyName: 'Church Bazaar', lines: [{ description: 'Cookies', qty: 100, rate: 2 }], date: '2026-09-01', taxExempt: true, exemptionReason: 'Exemption certificate on file', taxJurisdiction: 'TX' });
  await runTool(state, 'create_invoice', { partyName: 'LA Buyer', lines: [{ description: 'Cake', qty: 1, rate: 100 }], date: '2026-09-20', taxJurisdiction: 'CA' });
  await runTool(state, 'create_invoice', { partyName: 'Late Buyer', lines: [{ description: 'Cake', qty: 1, rate: 100 }], date: '2026-10-02', taxJurisdiction: 'TX' });
  return state;
}

test('periods follow the filing frequency and end before today', () => {
  assert.deepEqual(rangeOf('quarterly', '2026-Q3'), { from: '2026-07-01', to: '2026-09-30', endMonth: 9, endYear: 2026 });
  assert.deepEqual(rangeOf('monthly', '2026-02'), { from: '2026-02-01', to: '2026-02-28', endMonth: 2, endYear: 2026 });
  assert.deepEqual(rangeOf('annual', '2025'), { from: '2025-01-01', to: '2025-12-31', endMonth: 12, endYear: 2025 });
  assert.equal(rangeOf('quarterly', '2026-10'), null);
  assert.equal(periodContaining('quarterly', '2026-10-13'), '2026-Q4');
  assert.deepEqual(periodsOf('quarterly', '2026-01-01', '2026-10-13'), ['2026-Q1', '2026-Q2', '2026-Q3']);
  assert.deepEqual(periodsOf('monthly', '2026-08-15', '2026-10-13'), ['2026-08', '2026-09']);
  assert.deepEqual(periodsOf('annual', '2025-06-01', '2026-10-13'), ['2025']);
});

test('a state return is drafted from the invoices in its jurisdictions, with the due date from the dated rule and never a guessed one', async () => {
  const state = await bakery();
  const q3 = await runTool(state, 'sales_tax_return', { state: 'TX' });
  assert.equal(q3.ok, true, JSON.stringify(q3));
  const d = q3.data;
  assert.equal(d.period, '2026-Q3');
  assert.deepEqual(d.periods, ['2026-Q1', '2026-Q2', '2026-Q3']);
  assert.equal(d.invoices, 3);
  assert.equal(d.grossSales, 940);
  assert.equal(d.exemptSales, 200);
  assert.equal(d.nonTaxableSales, 40);
  assert.equal(d.taxableSales, 700);
  assert.equal(d.taxCollected, 53.75);
  assert.deepEqual(d.byJurisdiction.map((r) => [r.code, r.ratePercent, r.taxable, r.tax]), [['TX', 6.25, 200, 12.5], ['TX-AUSTIN', 8.25, 500, 41.25]]);
  assert.equal(d.dueDate, '2026-10-20');
  assert.equal(d.ruleUsed, 'us.salestax.due.TX@2020-01-01');
  assert.equal(d.toPay, 53.75);
  assert.equal(d.filed, null);
  assert.equal(d.approved, false);
  assert.match(d.notes.join(' '), /CPA has not reviewed yet/);
  const q4 = await runTool(state, 'sales_tax_return', { state: 'TX', period: '2026-Q4' });
  assert.equal(q4.data.invoices, 1);
  assert.equal(q4.data.ended, false);
  assert.equal((await runTool(state, 'sales_tax_return', { state: 'TX', period: '2026-09' })).error, 'BAD_PERIOD');
  assert.equal((await runTool(state, 'sales_tax_return', { state: 'CA' })).error, 'NO_NEXUS');
  await runTool(state, 'set_sales_tax_nexus', { state: 'NV', frequency: 'monthly', from: '2026-09-01' });
  const nv = await runTool(state, 'sales_tax_return', { state: 'NV', period: '2026-09' });
  assert.equal(nv.data.dueDate, '', 'no rule for Nevada means no date, not a guess');
  assert.match(nv.data.notes[0], /not in MyCA's rules yet; your CPA sets it/);
  await runTool(state, 'set_sales_tax_nexus', { state: 'CA', frequency: 'monthly', from: '2026-09-01' });
  assert.equal((await runTool(state, 'sales_tax_return', { state: 'CA', period: '2026-09' })).data.dueDate, '2026-10-31');
  assert.equal((await runTool(state, 'set_sales_tax_nexus', { state: 'Texas', frequency: 'monthly' })).error, 'BAD_STATE');
  assert.equal((await runTool(state, 'set_sales_tax_nexus', { state: 'TX', frequency: 'weekly' })).error, 'BAD_FREQUENCY');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.salesTaxNexus.length, 3);
  assert.equal((await runTool(createState(), 'sales_tax_return', { state: 'TX' })).error, 'NOT_FOR_COUNTRY');
});

test('the review walks sales, tax and approval, bound to the draft; a payment reduces the liability and a filing is recorded with its confirmation', async () => {
  const state = await bakery();
  const review = await runTool(state, 'sales_tax_review', { state: 'TX' });
  assert.equal(review.ok, true, JSON.stringify(review));
  assert.deepEqual(review.data.steps.map((s) => [s.id, s.status, s.waitingFor]), [['sales', 'open', null], ['tax', 'open', 'sales'], ['approve', 'open', 'sales']]);
  assert.match(review.data.steps[1].lines[0].label, /Texas \(TX\) at 6\.25% on \$200\.00/);
  const hash = review.data.draftHash;
  assert.equal((await runTool(state, 'sales_tax_review_answer', { state: 'TX', period: '2026-Q3', step: 'tax', answer: 'correct', draftHash: hash })).error, 'STEP_NOT_READY');
  assert.equal((await runTool(state, 'sales_tax_review_answer', { state: 'TX', period: '2026-Q3', step: 'sales', answer: 'correct', draftHash: 'f'.repeat(64) })).error, 'DRAFT_CHANGED');
  assert.equal((await runTool(state, 'sales_tax_review_answer', { state: 'TX', period: '2026-Q3', step: 'sales', answer: 'correct', draftHash: hash })).next, 'tax');
  assert.equal((await runTool(state, 'sales_tax_review_answer', { state: 'TX', period: '2026-Q3', step: 'tax', answer: 'correct', draftHash: hash })).next, 'approve');
  const approved = await runTool(state, 'sales_tax_review_answer', { state: 'TX', period: '2026-Q3', step: 'approve', answer: 'approve', draftHash: hash });
  assert.equal(approved.approved, true);
  assert.equal((await runTool(state, 'sales_tax_return', { state: 'TX' })).data.approved, true);

  const blocked = previewOf(state, 'record_sales_tax_payment', { state: 'TX', period: '2026-Q3', amount: 100 });
  assert.match(blocked.blockers[0], /more than is left to pay \(\$53\.75\)/);
  const pay = await runTool(state, 'record_sales_tax_payment', { state: 'TX', period: '2026-Q3', date: '2026-10-12', reference: 'TX-PAY-1' });
  assert.equal(pay.ok, true, JSON.stringify(pay));
  assert.equal(pay.payment.amount, 53.75);
  assert.equal(pay.left, 0);
  assert.equal(acc(state, '2110').debitsPosted, 53.75);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal((await runTool(state, 'sales_tax_return', { state: 'TX' })).data.toPay, 0);
  assert.equal((await runTool(state, 'record_sales_tax_payment', { state: 'TX', period: '2026-Q3' })).error, 'NOTHING_DUE');

  assert.equal((await runTool(state, 'record_sales_tax_filing', { state: 'TX', period: '2026-Q4', confirmation: 'ABC123' })).error, 'PERIOD_NOT_ENDED');
  const filed = await runTool(state, 'record_sales_tax_filing', { state: 'TX', period: '2026-Q3', confirmation: 'tx-2026-q3-778899', filedOn: localToday(), filedBy: 'the owner' });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  assert.equal(filed.filing.returnType, 'SALES_TAX_TX');
  assert.equal(filed.filing.late, false);
  assert.equal((await runTool(state, 'record_sales_tax_filing', { state: 'TX', period: '2026-Q3', confirmation: 'OTHER1' })).error, 'ALREADY_RECORDED');
  assert.equal((await runTool(state, 'list_filings', {})).data[0].arn, 'TX-2026-Q3-778899');
  const after = await runTool(state, 'sales_tax_return', { state: 'TX' });
  assert.equal(after.data.filed.confirmation, 'TX-2026-Q3-778899');
  assert.equal(after.data.paid, 53.75);
  const overview = await runTool(state, 'sales_tax_overview', {});
  assert.equal(overview.data.states[0].lastPeriod.filed.confirmation, 'TX-2026-Q3-778899');
  assert.equal(overview.data.states[0].currentPeriod.period, '2026-Q4');
  assert.equal(overview.data.overdue, 0);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.salesTaxPayments.length, 1);
  assert.equal(Object.keys(copy.salesTaxReviews)[0], 'TX:2026-Q3');
});

test('chat: declare a state, see the return, review it, pay and record the filing', async () => {
  const state = await bakery();
  assert.deepEqual(planUsFromChat(state, 'I collect sales tax in CA, monthly'), { kind: 'tool', name: 'set_sales_tax_nexus', args: { state: 'CA', frequency: 'monthly' } });
  assert.match(planUsFromChat(state, 'I collect sales tax in CA').reply, /how often you file in CA/);
  assert.deepEqual(planUsFromChat(state, 'sales tax return for TX'), { kind: 'tool', name: 'sales_tax_return', args: { state: 'TX' } });
  assert.deepEqual(planUsFromChat(state, 'sales tax return TX Q2 2026').args, { state: 'TX', period: '2026-Q2' });
  assert.deepEqual(planUsFromChat(state, 'what sales tax do I owe?'), { kind: 'tool', name: 'sales_tax_overview', args: {} });
  assert.deepEqual(planUsFromChat(state, 'review sales tax for TX').name, 'sales_tax_review');
  assert.deepEqual(planUsFromChat(state, 'paid sales tax to TX 53.75 for Q3, reference TXPAY1'), { kind: 'tool', name: 'record_sales_tax_payment', args: { state: 'TX', period: '2026-Q3', amount: 53.75, date: localToday(), mode: 'bank', reference: 'TXPAY1' } });
  assert.deepEqual(planUsFromChat(state, 'filed sales tax for TX for Q3, confirmation 778899'), { kind: 'tool', name: 'record_sales_tax_filing', args: { state: 'TX', period: '2026-Q3', confirmation: '778899', filedOn: localToday() } });
  assert.match(planUsFromChat(state, 'filed sales tax for TX for Q3').reply, /confirmation number/);
  const shown = await chat(state, 'sales tax return TX');
  assert.match(shown.reply, /Sales tax return TX for 2026-Q3/);
  assert.match(shown.reply, /Tax collected \$53\.75, to pay \$53\.75/);
  assert.match(shown.reply, /due 20 October 2026/);
  const held = await chat(state, 'I collect sales tax in CA, monthly from 2026-09-01');
  assert.equal(held.preview?.tool, 'set_sales_tax_nexus', held.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /collect sales tax in CA and file monthly from 1 September 2026/);
  const paying = await chat(state, 'paid sales tax to TX for Q3');
  assert.equal(paying.preview?.tool, 'record_sales_tax_payment', paying.reply);
  assert.match(paying.preview.summary, /\$53\.75 on \d{1,2} October 2026 from the bank/);
  const paid = await chat(state, 'yes');
  assert.match(paid.reply, /Recorded \$53\.75 of sales tax paid to TX for 2026-Q3/);
  assert.ok(!/₹|GST/.test(paid.reply), paid.reply);
});
