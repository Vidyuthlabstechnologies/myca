import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-payroll-import-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';
process.env.MYCA_ENABLE_CHANNEL_PULLS = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose } from '../src/router.mjs';
import { trialBalance, listAccounts } from '../src/ledger.mjs';
import { parsePayrollSummary } from '../src/us-payroll-import.mjs';
import { gustoPayrollsToCsv as gustoCsv } from '../src/us-connectors.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { documentsOf } from '../src/document-store.mjs';

function usBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Luna Bakery LLC', country: 'US', state: 'TX', gstin: '' };
  state._documents = createMemoryDocumentStore();
  return state;
}
const balance = (state, code) => { const a = listAccounts(state.ledger).find((x) => x.code === code); if (!a) return 0; const net = a.type === 'asset' || a.type === 'expense' ? Number(a.debitsPosted) - Number(a.creditsPosted) : Number(a.creditsPosted) - Number(a.debitsPosted); return Math.round(net * 100) / 100; };

const CSV = gustoCsv([
  { payroll_uuid: 'pr-1', check_date: '2026-10-15', pay_period: { start_date: '2026-10-01', end_date: '2026-10-15' }, totals: { gross_pay: '8200.00', net_pay: '6410.50', employee_taxes: '1689.50', employer_taxes: '627.30', reimbursements: '100.00' } },
  { payroll_uuid: 'pr-2', check_date: '2026-10-31', pay_period: { start_date: '2026-10-16', end_date: '2026-10-31' }, totals: { gross_pay: '8200.00', net_pay: '6410.50', employee_taxes: '1789.50', employer_taxes: '627.30', reimbursements: '0' } },
]);

test('a Gusto payroll summary posts wages, employer taxes, the payables and the bank debits, balanced, skips payrolls already posted, and stays out of the 941 draft', async () => {
  const state = usBooks();
  await runTool(state, 'set_cash_balance', { bank: 50000, cash: 0, on: '2026-10-01' });
  const parsed = parsePayrollSummary(CSV);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].otherDeductionsCents, 10000, 'gross minus net minus employee taxes is a deduction (benefits, garnishments)');
  assert.equal(parsed.rows[1].otherDeductionsCents, 0);

  const bankBefore = balance(state, '1002');
  const held = propose(state, 'import_payroll_summary', { csv: CSV });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Post 2 Gusto payrolls \(.* to .*\): wages \$16,400\.00, employer taxes \$1,254\.60, net pay \$12,821\.00\./, held.reply);
  assert.match(held.reply, /leaves the bank on the check dates/);
  assert.match(held.reply, /leaves them out of its own 941 draft/);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^Posted 2 Gusto payrolls: wages \$16,400\.00, employer taxes \$1,254\.60, reimbursements \$100\.00; \$17,754\.60 left the bank on the check dates\./, done.reply);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(balance(state, '5120'), 16400, 'wages expense is the gross');
  assert.equal(balance(state, '5125'), 1254.6);
  assert.equal(balance(state, '5100'), 100, 'reimbursements are not wages');
  assert.equal(balance(state, '2300'), 0, 'net pay settled');
  assert.equal(balance(state, '2340'), 0, 'taxes settled');
  assert.equal(Math.round((bankBefore - balance(state, '1002')) * 100) / 100, 17754.6, 'the provider debited the bank');
  assert.equal(state.payrollImports.length, 2);
  assert.equal(state.payrollImports[0].id, 'PAY-GUSTO-pr-1');

  const again = propose(state, 'import_payroll_summary', { csv: CSV });
  assert.match(again.reply, /already in the books/, again.reply);
  assert.equal(again.awaitingConfirmation, undefined);
  const listed = await runTool(state, 'list_payroll_imports', {});
  assert.equal(listed.data.payrolls.length, 2);
  assert.equal(listed.data.payrolls[1].employeeTaxes, 1789.5);
  const filings = await runTool(state, 'us_payroll_filings', { year: '2026' });
  assert.equal(filings.ok, true, JSON.stringify(filings));
  assert.ok(!JSON.stringify(filings.data).includes('16400'), 'provider payrolls stay out of the 941 draft');

  const unsettled = usBooks();
  const one = gustoCsv([{ payroll_uuid: 'pr-9', check_date: '2026-11-15', pay_period: { start_date: '2026-11-01', end_date: '2026-11-15' }, totals: { gross_pay: '1000', net_pay: '800', employee_taxes: '200', employer_taxes: '76.5', reimbursements: '0' } }]);
  const kept = await runTool(unsettled, 'import_payroll_summary', { csv: one, settle: false });
  assert.equal(kept.ok, true, JSON.stringify(kept));
  assert.equal(balance(unsettled, '2300'), 800, 'net pay stays payable');
  assert.equal(balance(unsettled, '2340'), 276.5);
  assert.equal(trialBalance(unsettled.ledger).balanced, true);
  assert.equal((await runTool(createState(), 'import_payroll_summary', { csv: one })).error, 'NOT_FOR_COUNTRY');
  assert.equal(parsePayrollSummary('a,b\n1,2').error, 'NO_HEADER');
});

test('a Gusto pull now points at the payroll import, and the stored file posts by its hash through preview and confirm', async () => {
  const state = usBooks();
  await runTool(state, 'set_cash_balance', { bank: 50000, cash: 0, on: '2026-10-01' });
  await runTool(state, 'set_channel_connector', { channel: 'gusto', clientId: 'gusto-client-1', clientSecret: 'gusto-secret-1', environment: 'demo', accessToken: 'tok', refreshToken: 'ref', companyUuid: 'company-uuid-9' });
  const pulled = await runTool(state, 'fetch_channel_report', { channel: 'gusto', kind: 'payroll', from: '2026-10-01', to: '2026-10-31' });
  assert.equal(pulled.ok, true, JSON.stringify(pulled));
  assert.equal(pulled.data.importTool, 'import_payroll_summary');
  assert.ok(state.reminders.some((r) => /payroll summary report.*Import it to post/.test(r.text)), JSON.stringify(state.reminders));
  const held = propose(state, 'import_payroll_summary', { documentSha256: pulled.data.documentSha256 });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Post 1 Gusto payroll/, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.payrollImports.length, 1);
  assert.ok(documentsOf(state).exists(pulled.data.documentSha256));
});
