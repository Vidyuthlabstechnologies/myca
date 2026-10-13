import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { planUsFromChat } from '../src/us-intent.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

async function bakery() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789', address: '12 Maple St, Austin, TX 78701' };
  const baker = await runTool(state, 'add_employee', { name: 'Ana Lopez', joinedOn: '2026-01-01', components: [{ name: 'Salary', amount: 5000 }], workState: 'TX', federalWithholding: 400 });
  assert.equal(baker.ok, true, JSON.stringify(baker));
  const manager = await runTool(state, 'add_employee', { name: 'Ben Carter', joinedOn: '2026-01-01', components: [{ name: 'Salary', amount: 20000 }], workState: 'CA' });
  assert.equal(manager.ok, true, JSON.stringify(manager));
  return state;
}

test('a US payroll month withholds Social Security, Medicare and the recorded federal amount, and posts employer taxes', async () => {
  const state = await bakery();
  const run = await runTool(state, 'payroll_run', { period: '2026-01' });
  assert.equal(run.ok, true, JSON.stringify(run));
  const d = run.data;
  assert.equal(d.country, 'US');
  assert.equal(d.employees, 2);
  const ana = d.rows.find((r) => r.name === 'Ana Lopez');
  assert.equal(ana.socialSecurityEmployee, 310);
  assert.equal(ana.medicareEmployee, 72.5);
  assert.equal(ana.federalWithholding, 400);
  assert.equal(ana.stateWithholding, 0);
  assert.equal(ana.deductions, 782.5);
  assert.equal(ana.net, 4217.5);
  assert.equal(ana.socialSecurityEmployer, 310);
  assert.equal(ana.futa, 30, 'FUTA at the net 0.6% on the first $7,000: $5,000 this month');
  const ben = d.rows.find((r) => r.name === 'Ben Carter');
  assert.equal(ben.futa, 42, 'FUTA capped at the $7,000 base');
  assert.match(ben.notes.join(' '), /No federal withholding amount is recorded/);
  assert.match(ben.notes.join(' '), /CA has an income tax; no state withholding amount is recorded/);
  assert.equal(d.totals.federalPayable, 310 + 72.5 + 400 + 1240 + 290 + 310 + 72.5 + 1240 + 290);
  assert.match(d.notes.join(' '), /a US CPA has not reviewed yet/);
  assert.equal(d.rulesUsed.includes('us.federal.fica.social-security@2026-01-01'), true);

  const approved = await runTool(state, 'approve_payroll', { period: '2026-01', draftHash: d.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.equal(acc(state, '5120').debitsPosted, 25000);
  assert.equal(acc(state, '2300').creditsPosted, ana.net + ben.net);
  assert.equal(acc(state, '2340').creditsPosted, d.totals.federalPayable);
  assert.equal(acc(state, '2350').creditsPosted, 72);
  assert.equal(acc(state, '5125').debitsPosted, d.totals.employerTaxes);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const paid = await runTool(state, 'record_salary_payment', { period: '2026-01', date: '2026-02-01' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.amount, ana.net + ben.net);
  const slip = await runTool(state, 'payslip', { period: '2026-01', employeeId: ana.employeeId });
  assert.equal(slip.data.employer.ein, '12-3456789');
  assert.deepEqual(slip.data.deductions.map((x) => x.name), ['Social Security', 'Medicare', 'Federal income tax']);
  assert.equal(slip.data.yearToDate.wages, 5000);
  assert.equal((await runTool(state, 'list_payroll', {})).data.runs[0].net, ana.net + ben.net);
});

test('the wage base caps Social Security across the year, the additional Medicare rate starts above the threshold, and the 941 and W-2 drafts add up', async () => {
  const state = await bakery();
  for (let m = 1; m <= 12; m += 1) {
    const period = `2026-${String(m).padStart(2, '0')}`;
    const out = await runTool(state, 'approve_payroll', { period });
    assert.equal(out.ok, true, `${period} ${JSON.stringify(out)}`);
  }
  const october = await runTool(state, 'payroll_run', { period: '2026-10' });
  const ben = october.data.rows.find((r) => r.name === 'Ben Carter');
  assert.equal(ben.ytdWages, 180000);
  assert.equal(ben.socialSecurityWages, 4500, 'only $4,500 of October fits under the $184,500 base');
  assert.equal(ben.socialSecurityEmployee, 279);
  assert.equal(ben.additionalMedicare, 0);
  const november = await runTool(state, 'payroll_run', { period: '2026-11' });
  const benNov = november.data.rows.find((r) => r.name === 'Ben Carter');
  assert.equal(benNov.socialSecurityEmployee, 0);
  assert.equal(benNov.additionalMedicare, 180, 'YTD reached $200,000 at the end of October, so all of November is above the threshold at 0.9%');
  const december = await runTool(state, 'payroll_run', { period: '2026-12' });
  const benDec = december.data.rows.find((r) => r.name === 'Ben Carter');
  assert.equal(benDec.additionalMedicare, 180);
  const filings = await runTool(state, 'us_payroll_filings', { year: '2026' });
  assert.equal(filings.ok, true, JSON.stringify(filings));
  const f = filings.data;
  assert.equal(f.quarters[0].wages, 75000);
  assert.equal(f.quarters[0].dueDate, '2026-04-30');
  assert.equal(f.quarters[3].dueDate, '2027-01-31');
  assert.equal(f.quarters[0].socialSecurityTax, 9300);
  assert.equal(f.quarters[0].medicareTax, 2175);
  assert.equal(f.w2DueDate, '2027-01-31');
  const w2 = f.w2.find((w) => w.name === 'Ben Carter');
  assert.equal(w2.wages, 240000);
  assert.equal(w2.socialSecurityWages, 184500);
  assert.equal(w2.socialSecurityWithheld, 11439);
  assert.equal(w2.medicareWithheld, 3480 + 360);
  assert.equal(f.futa.total, 84);
  const indian = createState();
  assert.equal((await runTool(indian, 'us_payroll_filings', {})).error, 'NOT_FOR_COUNTRY');
});

test('withholding is recorded, never computed; Schedule C and estimated tax dates read from the books and the dated rule', async () => {
  const state = await bakery();
  assert.deepEqual(planUsFromChat(state, 'withholding for EMP-0002 is 2500, state 900, works in CA'), { kind: 'tool', name: 'set_withholding', args: { id: 'EMP-0002', federalWithholding: 2500, stateWithholding: 900, workState: 'CA' } });
  const held = await chat(state, 'withholding for EMP-0002 is 2500, state 900');
  assert.equal(held.preview?.tool, 'set_withholding', held.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /federal withholding \$2,500\.00 a month, state \$900\.00/);
  const run = await runTool(state, 'payroll_run', { period: '2026-01' });
  const ben = run.data.rows.find((r) => r.name === 'Ben Carter');
  assert.equal(ben.federalWithholding, 2500);
  assert.equal(ben.stateWithholding, 900);
  await runTool(state, 'approve_payroll', { period: '2026-01' });
  assert.equal(acc(state, '2360').creditsPosted, 900);

  await runTool(state, 'set_sales_tax_rate', { code: 'TX', ratePercent: 6.25, from: '2026-01-01' });
  await runTool(state, 'create_invoice', { partyName: 'Cafe Luna', lines: [{ description: 'Cakes', qty: 10, rate: 100 }], date: '2026-02-01', taxJurisdiction: 'TX' });
  await runTool(state, 'create_purchase', { partyName: 'Flour Mill Co', lines: [{ description: 'Flour', qty: 10, rate: 30 }], date: '2026-02-02', salesTaxPaid: 24.75 });
  await runTool(state, 'post_expense', { narration: 'Shop rent', payee: 'Maple Realty', amount: 2000, date: '2026-02-03' });
  await runTool(state, 'post_expense', { narration: 'Team lunch', payee: 'Taco Place', amount: 80, date: '2026-02-04' });
  await runTool(state, 'post_expense', { narration: 'Gym membership', payee: 'Cult Fit', amount: 50, date: '2026-02-05' });
  const c = await runTool(state, 'schedule_c_summary', { year: '2026' });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.data.grossReceipts, 1000);
  assert.equal(c.data.costOfGoodsSold, 324.75);
  assert.equal(c.data.grossIncome, 675.25);
  const rent = c.data.expenses.find((row) => row.line === '20b');
  assert.equal(rent.amount, 2000);
  const meals = c.data.expenses.find((row) => row.line === '24b');
  assert.equal(meals.amount, 80);
  assert.match(meals.note, /50%/);
  const club = c.data.expenses.find((row) => row.label.startsWith('Club'));
  assert.equal(club.deductible, false);
  assert.equal(c.data.excluded, 50);
  const payrollTaxes = c.data.expenses.find((row) => row.line === '23');
  assert.equal(payrollTaxes.amount, run.data.totals.employerTaxes);
  assert.equal(c.data.totalExpenses, 2000 + 80 + run.data.totals.employerTaxes);
  assert.equal(c.data.netProfit, 675.25 - c.data.totalExpenses);
  const reply = await chat(state, 'schedule c for 2026');
  assert.match(reply.reply, /Line 20b Rent or lease: other business property: \$2,000\.00/);
  assert.match(reply.reply, /Club and fitness memberships: \$50\.00 \(excluded\)/);

  const dates = await runTool(state, 'estimated_tax_dates', { year: '2026' });
  assert.deepEqual(dates.data.installments.map((i) => i.dueDate), ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15']);
  assert.equal(dates.data.installments[0].past, true);
  assert.equal(dates.data.unreviewed, true);
  const asked = await chat(state, 'when are my estimated taxes due?');
  assert.match(asked.reply, /Estimated tax instalments for 2026/);
  assert.match(asked.reply, /income from 1 September to 31 December, due 15 January 2027/);
});
