import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE } from '../src/countries/uae/engine.mjs';
import { VAT_INPUT, VAT_OUTPUT } from '../src/countries/uae/books.mjs';
import { toArabic, ERROR_HINTS } from '../src/countries/uae/messages.mjs';
import { runTool } from '../src/tools.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { createState } from '../src/store.mjs';
import { trialBalance } from '../src/ledger.mjs';
import { recordReceipt } from '../src/invoice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARABIC = /[؀-ۿ]/;

function aeState({ emirate = 'DXB', trn = '100123456700003' } = {}) {
  const state = createState();
  state.company = { ...state.company, country: 'AE' };
  if (emirate) ENGINE.run.set_ae_business_profile(state, { name: 'Falcon Trading LLC', emirate, trn });
  return state;
}

function balance(state, id) {
  const account = state.ledger.accounts.get(BigInt(id));
  if (!account) return 0;
  return Number(account.creditsPosted - account.debitsPosted) / 100;
}

const run = ENGINE.run;

test('a UAE sale posts net to sales and 5% VAT to output VAT, in the emirate of the profile', () => {
  const state = aeState();
  const result = run.create_ae_invoice(state, { partyName: 'Oasis Contracting', buyerTrn: '100987654300003', date: '2027-02-10', lines: [{ description: 'Consulting', qty: 10, rate: 1500 }, { description: 'Export freight', qty: 1, rate: 2000, treatment: 'zero-rated' }] });
  assert.equal(result.ok, true);
  const invoice = result.invoice;
  assert.equal(invoice.id, 'INV-0001');
  assert.equal(invoice.country, 'AE');
  assert.equal(invoice.emirate, 'DXB');
  assert.equal(invoice.subtotal, 17000);
  assert.equal(invoice.vat, 750);
  assert.equal(invoice.total, 17750);
  assert.deepEqual(invoice.lines.map((line) => line.vat), [750, 0]);
  assert.equal(balance(state, 4000), 17000);
  assert.equal(balance(state, VAT_OUTPUT), 750);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(state.parties.find((party) => party.name === 'Oasis Contracting').trn, '100987654300003');
});

test('a UAE sale refuses bad input with a reason and posts nothing', () => {
  const state = aeState();
  assert.equal(run.create_ae_invoice(state, { lines: [] }).error, 'NO_LINES');
  const bad = run.create_ae_invoice(state, { lines: [{ qty: 0, rate: -1, treatment: 'reverse-charge' }] });
  assert.equal(bad.error, 'BAD_LINES');
  assert.deepEqual(bad.problems.map((problem) => problem.field), ['qty', 'rate', 'treatment']);
  assert.equal(run.create_ae_invoice(state, { lines: [{ rate: 0 }] }).error, 'ZERO_AMOUNT');
  assert.equal(run.create_ae_invoice(state, { emirate: 'Mars', lines: [{ rate: 10 }] }).error, 'BAD_EMIRATE');
  assert.equal(run.create_ae_invoice(state, { buyerTrn: '123', lines: [{ rate: 10 }] }).error, 'BAD_TRN');
  assert.equal(run.create_ae_invoice(state, { currency: 'USD', lines: [{ rate: 10 }] }).error, 'EXCHANGE_RATE_REQUIRED');
  assert.equal(run.create_ae_invoice(state, { currency: 'dollars', lines: [{ rate: 10 }] }).error, 'BAD_CURRENCY');
  assert.equal(run.create_ae_invoice(state, { date: '2027-02-30', lines: [{ rate: 10 }] }).error, 'INVALID_DATE');
  assert.equal(run.create_ae_invoice(state, { date: '2017-12-31', lines: [{ rate: 10 }] }).error, 'RULE_NOT_IN_FORCE');
  assert.equal((state.invoices || []).length, 0);
  assert.equal(state.invoiceSeq || 0, 0);
  const noProfile = aeState({ emirate: null });
  const missing = run.create_ae_invoice(noProfile, { lines: [{ rate: 10 }] });
  assert.equal(missing.error, 'EMIRATE_REQUIRED');
  assert.equal(run.create_ae_invoice(noProfile, { lines: [{ rate: 10, treatment: 'exempt' }] }).ok, true, 'an exempt sale needs no emirate');
});

test('a foreign-currency sale is booked in AED at the given rate', () => {
  const state = aeState();
  const result = run.create_ae_invoice(state, { partyName: 'Gulf Buyer', currency: 'usd', exchangeRate: 3.6725, date: '2027-03-01', lines: [{ description: 'Design', qty: 3, rate: 333.33 }] });
  assert.equal(result.ok, true);
  assert.equal(result.invoice.currency, 'USD');
  assert.equal(result.invoice.subtotal, 3672.46);
  assert.equal(result.invoice.vat, 183.62);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a duplicate number or a locked period is refused', () => {
  const state = aeState();
  assert.equal(run.create_ae_invoice(state, { id: 'A-1', lines: [{ rate: 100 }] }).ok, true);
  assert.equal(run.create_ae_invoice(state, { id: 'A-1', lines: [{ rate: 100 }] }).error, 'DUPLICATE_ID');
  state.lockThrough = '2027-01-31';
  assert.equal(run.create_ae_invoice(state, { date: '2027-01-15', lines: [{ rate: 100 }] }).error, 'PERIOD_LOCKED');
});

test('receipts against a UAE invoice settle it', () => {
  const state = aeState();
  const { invoice } = run.create_ae_invoice(state, { partyName: 'Oasis', date: '2027-02-10', lines: [{ rate: 1000 }] });
  const paid = recordReceipt(state, { invoiceId: invoice.id, date: '2027-02-20' });
  assert.equal(paid.ok, true);
  assert.equal(paid.invoice.status, 'paid');
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a purchase bill splits recoverable, blocked and reverse-charge VAT', () => {
  const state = aeState();
  const result = run.create_ae_purchase(state, {
    partyName: 'Emirates Supplies', supplierTrn: '100555555500003', supplierInvoiceNo: 'ES-77', date: '2027-02-12',
    lines: [
      { description: 'Stock', qty: 2, rate: 5000 },
      { description: 'Team dinner', rate: 1000, blocked: true },
      { description: 'Software from abroad', rate: 4000, treatment: 'reverse-charge' },
      { description: 'Mixed-use rent', rate: 2000, recoveryBasisPoints: 5000 },
    ],
  });
  assert.equal(result.ok, true);
  const bill = result.invoice;
  assert.equal(bill.id, 'BILL-0001');
  assert.equal(bill.subtotal, 17000);
  assert.equal(bill.vat, 650);
  assert.equal(bill.selfAccountedVat, 200);
  assert.equal(bill.recoverableVat, 500 + 200 + 50);
  assert.equal(bill.total, 17650);
  assert.equal(-balance(state, VAT_INPUT), 750);
  assert.equal(balance(state, VAT_OUTPUT), 200);
  assert.equal(-balance(state, 5000), 17000 + 50 + 50);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a bill with a different VAT figure uses it and warns; a bill without supplier TRN warns', () => {
  const state = aeState();
  const result = run.create_ae_purchase(state, { partyName: 'Shop', lines: [{ rate: 100, vat: 7 }] });
  assert.equal(result.ok, true);
  assert.equal(result.invoice.vat, 7);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /not 5%/);
  assert.match(result.warnings[1], /TRN/);
  const bad = run.create_ae_purchase(state, { lines: [{ rate: 100, vat: -1, recoveryBasisPoints: 20000 }] });
  assert.equal(bad.error, 'BAD_LINES');
  assert.deepEqual(bad.problems.map((problem) => problem.field).sort(), ['recoveryBasisPoints', 'vat']);
});

test('a credit note reverses sales and VAT in proportion and can cancel the invoice', () => {
  const state = aeState();
  const { invoice } = run.create_ae_invoice(state, { partyName: 'Oasis', date: '2027-02-10', lines: [{ rate: 1000 }, { rate: 1000, treatment: 'zero-rated' }] });
  assert.equal(invoice.total, 2050);
  assert.equal(run.create_ae_credit_note(state, { invoiceId: invoice.id, amount: 100, date: '2027-04-01' }).error, 'REASON_REQUIRED');
  assert.equal(run.create_ae_credit_note(state, { invoiceId: 'nope', reason: 'x' }).error, 'INVOICE_NOT_FOUND');
  assert.equal(run.create_ae_credit_note(state, { invoiceId: invoice.id, amount: 5000, date: '2027-04-01', reason: 'x' }).error, 'MORE_THAN_INVOICE');
  assert.equal(run.create_ae_credit_note(state, { invoiceId: invoice.id, date: '2027-02-01', reason: 'x' }).error, 'CREDIT_BEFORE_INVOICE');
  const part = run.create_ae_credit_note(state, { invoiceId: invoice.id, amount: 1025, date: '2027-04-02', reason: 'Half returned' });
  assert.equal(part.ok, true);
  assert.equal(part.creditNote.total, 1025);
  assert.equal(part.creditNote.vat, 25);
  assert.equal(part.creditNote.taxable, 1000);
  assert.equal(part.invoice.status, 'posted');
  const rest = run.create_ae_credit_note(state, { invoiceId: invoice.id, date: '2027-04-03', reason: 'Rest returned' });
  assert.equal(rest.creditNote.total, 1025);
  assert.equal(rest.invoice.status, 'settled');
  assert.equal(run.create_ae_credit_note(state, { invoiceId: invoice.id, date: '2027-04-04', reason: 'again' }).error, 'ALREADY_CREDITED');
  assert.equal(balance(state, VAT_OUTPUT), 0);
  assert.equal(balance(state, 4000), 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const whole = run.create_ae_invoice(state, { partyName: 'Oasis', date: '2027-02-11', lines: [{ rate: 300 }] }).invoice;
  const cancelled = run.create_ae_credit_note(state, { invoiceId: whole.id, date: '2027-02-12', reason: 'Wrong customer' });
  assert.equal(cancelled.invoice.status, 'cancelled');
  assert.equal(run.create_ae_credit_note(state, { invoiceId: whole.id, reason: 'again' }).error, 'INVOICE_CANCELLED');
});

test('the VAT 201 is filled from the books: sales by emirate, credit notes, purchases and reverse charge', () => {
  const state = aeState();
  run.create_ae_invoice(state, { partyName: 'A', date: '2027-01-10', lines: [{ rate: 10000 }] });
  run.create_ae_invoice(state, { partyName: 'B', emirate: 'AUH', date: '2027-02-10', lines: [{ rate: 4000 }, { rate: 3000, treatment: 'zero-rated' }, { rate: 500, treatment: 'exempt' }] });
  const late = run.create_ae_invoice(state, { partyName: 'C', date: '2027-04-01', lines: [{ rate: 999 }] });
  const first = state.invoices[0];
  run.create_ae_credit_note(state, { invoiceId: first.id, amount: 1050, date: '2027-03-05', reason: 'Discount' });
  run.create_ae_purchase(state, { partyName: 'S', supplierTrn: '100555555500003', date: '2027-02-15', lines: [{ rate: 6000 }, { rate: 2000, treatment: 'reverse-charge' }, { rate: 400, blocked: true }] });
  const lines = run.ae_vat_lines(state, { period: '2027-Q1' });
  assert.equal(lines.ok, true);
  assert.deepEqual(lines.data.counts, { invoices: 2, creditNotes: 1, purchases: 1 });
  assert.ok(lines.data.lines.every((line) => line.source));
  assert.ok(!lines.data.lines.some((line) => line.source === late.invoice.id));
  const filed = run.ae_vat_return(state, { period: '2027-Q1', fromBooks: true });
  assert.equal(filed.ok, true);
  const boxes = filed.data.boxes;
  assert.deepEqual(boxes['1b'], { net: 9000, vat: 450, adjustment: 0 });
  assert.deepEqual(boxes['1a'], { net: 4000, vat: 200, adjustment: 0 });
  assert.equal(boxes['3'].vat, 100);
  assert.equal(boxes['4'].net, 3000);
  assert.equal(boxes['5'].net, 500);
  assert.equal(boxes['9'].net, 6400);
  assert.equal(boxes['9'].vat, 300);
  assert.equal(boxes['10'].vat, 100);
  assert.equal(filed.data.totalDue, 750);
  assert.equal(filed.data.totalRecoverable, 400);
  assert.equal(filed.data.payable, 350);
  assert.deepEqual(filed.data.fromBooks, { invoices: 2, creditNotes: 1, purchases: 1 });
  assert.ok(filed.data.warnings.some((warning) => /blocked/.test(warning)));
  const vatAccounts = balance(state, VAT_OUTPUT) - -balance(state, VAT_INPUT);
  assert.ok(Math.abs(vatAccounts - (filed.data.payable + 999 * 0.05)) < 0.005, 'the VAT accounts agree with the return plus the April sale');
  const plusManual = run.ae_vat_return(state, { period: '2027-Q1', fromBooks: true, lines: [{ kind: 'supply', emirate: 'SHJ', net: 1000 }] });
  assert.equal(plusManual.data.boxes['1c'].vat, 50);
  assert.equal(run.ae_vat_return(state, { period: '2027-Q1' }).error, 'BAD_LINES');
  assert.equal(run.ae_vat_return(state, { period: 'Q1', fromBooks: true }).error, 'BAD_PERIOD');
});

test('entries made outside the UAE tools are flagged, not silently counted', () => {
  const state = aeState();
  state.invoices = [{ id: 'OLD-1', date: '2027-01-05', country: 'IN', lines: [] }];
  const lines = run.ae_vat_lines(state, { period: '2027-01' });
  assert.equal(lines.data.lines.length, 0);
  assert.match(lines.data.warnings[0], /^1 entry in 2027-01\/2027-01/);
});

test('in the UAE the shared create_invoice and create_purchase use VAT, and their confirmation preview speaks VAT', async () => {
  const state = aeState();
  const preview = previewOf(state, 'create_invoice', { partyName: 'Oasis', lines: [{ description: 'Work', qty: 1, rate: 200 }] });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /AED 200\.00 plus AED 10\.00 VAT/);
  assert.doesNotMatch(JSON.stringify(preview), /GST/);
  const made = await runTool(state, 'create_invoice', { partyName: 'Oasis', lines: [{ description: 'Work', qty: 1, rate: 200 }] });
  assert.equal(made.ok, true);
  assert.equal(made.invoice.country, 'AE');
  assert.equal(made.invoice.vat, 10);
  const bill = await runTool(state, 'create_purchase', { partyName: 'Supplier', lines: [{ description: 'Paper', qty: 1, rate: 100 }] });
  assert.equal(bill.ok, true);
  assert.equal(bill.invoice.country, 'AE');
  assert.equal(bill.invoice.recoverableVat, 5);
  const direct = await runTool(state, 'create_ae_invoice', { partyName: 'Oasis', emirate: 'SHJ', lines: [{ rate: 100 }] });
  assert.equal(direct.invoice.emirate, 'SHJ');
  const indian = await runTool(createState(), 'create_ae_invoice', { lines: [{ rate: 100 }] });
  assert.equal(indian.error, 'NOT_FOR_COUNTRY');
});

test('write previews block bad input and describe the posting', () => {
  const state = aeState();
  const blocked = ENGINE.preview.create_ae_invoice(state, { lines: [{ qty: 0, rate: 5 }] });
  assert.equal(blocked.blockers[0], 'Line 1 qty: The quantity is a number above zero.');
  const bill = ENGINE.preview.create_ae_purchase(state, { partyName: 'S', lines: [{ rate: 1000, treatment: 'import' }] });
  assert.deepEqual(bill.figures, { net: 1000, vat: 0, selfAccountedVat: 50, recoverableVat: 50, total: 1000 });
  assert.ok(bill.effects.some((effect) => /Reverse charge/.test(effect)));
  run.create_ae_invoice(state, { partyName: 'Oasis', date: '2027-02-10', lines: [{ rate: 1000 }] });
  const note = ENGINE.preview.create_ae_credit_note(state, { invoiceId: 'INV-0001', amount: 105, reason: 'Discount', date: '2027-02-11' });
  assert.equal(note.summary, 'Credit note on INV-0001 to Oasis for AED 105.00, of which AED 5.00 VAT.');
  const missing = ENGINE.preview.create_ae_credit_note(state, { invoiceId: 'INV-0001', date: '2027-02-11' });
  assert.match(missing.blockers[0], /Say why/);
});

test('every UAE tool answers in Arabic when asked: words, warnings, problems, hints and previews', () => {
  const state = aeState();
  const ar = { lang: 'ar' };
  const sale = run.create_ae_invoice(state, { ...ar, partyName: 'واحة', date: '2027-02-10', lines: [{ rate: 20000 }] });
  assert.equal(sale.lang, 'ar');
  assert.match(sale.warnings[0], ARABIC);
  assert.match(ENGINE.words.create_ae_invoice(sale, null, ar), /درهم/);
  const problems = run.create_ae_invoice(state, { ...ar, lines: [{ qty: 0, rate: -1 }] });
  assert.ok(problems.problems.every((problem) => ARABIC.test(problem.why)));
  assert.match(problems.hint, ARABIC);
  assert.match(run.create_ae_invoice(state, { ...ar, lines: [] }).hint, ARABIC);
  const ret = run.ae_vat_return(state, { ...ar, period: '2027-01/2027-04', fromBooks: true, annualTurnover: 200000000 });
  assert.ok(ret.data.warnings.length >= 2);
  for (const warning of ret.data.warnings) assert.match(warning, ARABIC, warning);
  assert.match(ret.data.filedBy, ARABIC);
  assert.match(ENGINE.words.ae_vat_return(ret, null, ar), /إقرار VAT 201/);
  const ct = run.ae_ct_estimate(state, { ...ar, periodStart: '2030-01-01', periodEnd: '2030-12-31', revenue: 5000000, accountingProfit: 1000000, electSmallBusinessRelief: true, lossesBroughtForward: 5000000, foreignTaxCredit: 900000 });
  for (const warning of ct.data.warnings) assert.match(warning, ARABIC, warning);
  for (const reason of ct.data.smallBusinessReliefReasons) assert.match(reason, ARABIC, reason);
  const zone = run.ae_ct_estimate(state, { ...ar, periodStart: '2027-01-01', periodEnd: '2027-12-31', revenue: 200000000, accountingProfit: 10000000, qualifyingFreeZonePerson: true, qualifyingIncome: 20000000, nonQualifyingRevenue: 20000000 });
  for (const warning of zone.data.warnings) assert.match(warning, ARABIC, warning);
  const penalty = run.ae_penalty_estimate(state, { ...ar, kind: 'ct-late-return', dueDate: '2026-05-01', doneOn: '2027-08-01' });
  assert.match(penalty.data.why, ARABIC);
  assert.match(run.ae_penalty_estimate(state, { ...ar, kind: 'vat-late-payment', dueDate: '2026-05-01', doneOn: '2026-06-15', taxUnpaid: 1000 }).data.why, ARABIC);
  for (const amount of [0, 200000, 400000]) assert.match(run.ae_vat_registration(state, { ...ar, taxableSuppliesLast12Months: amount }).data.why, ARABIC);
  for (const trn of ['', 'abc', '123', '000000000000000']) assert.match(run.validate_ae_trn(state, { ...ar, trn }).data.why, ARABIC);
  assert.match(run.validate_ae_trn(state, { ...ar, trn: '200123456700003' }).data.warnings[0], ARABIC);
  const dates = run.ae_deadlines(state, { ...ar, today: '2026-11-14', vatPeriodEnd: '2026-12-31', ctPeriodEnd: '2026-12-31', revenue: 60000000 });
  for (const item of dates.data.items) assert.match(item.what, ARABIC, item.what);
  const check = run.ae_einvoice_check(state, { ...ar, number: '', issueDate: 'x', currency: 'usd', buyer: { name: '' }, lines: [{ quantity: 0, unitPrice: -1, taxCategory: 'Q', itemType: 'X' }] });
  for (const problem of check.problems) assert.match(problem.why, ARABIC, problem.why);
  const profile = run.set_ae_business_profile(state, { ...ar, name: '', emirate: 'X', trn: '12', financialYearEnd: '31-12', freeZone: true });
  for (const problem of profile.problems) assert.match(problem.why, ARABIC, problem.why);
  const preview = ENGINE.preview.create_ae_invoice(state, { ...ar, partyName: 'واحة', lines: [{ rate: 100 }] });
  assert.match(preview.summary, ARABIC);
  assert.ok(preview.effects.every((effect) => ARABIC.test(effect)));
  const profilePreview = ENGINE.preview.set_ae_business_profile(state, { ...ar, name: '', emirate: 'X' });
  assert.ok(profilePreview.blockers.every((blocker) => ARABIC.test(blocker)));
  for (const name of Object.keys(ENGINE.words)) assert.equal(typeof ENGINE.words[name], 'function');
  const english = run.create_ae_invoice(state, { lines: [] });
  assert.equal(english.lang, undefined);
  assert.equal(english.hint, 'Add at least one line.');
});

test('every English message written in the UAE files has an Arabic translation', () => {
  const folder = join(HERE, '../src/countries/uae');
  const literal = /(?:why|hint|warnings\.push\(|reasons\.push\(|why =)\s*:?\s*'((?:[^'\\]|\\.)+)'/g;
  const missing = [];
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.mjs') && name !== 'messages.mjs')) {
    const source = readFileSync(join(folder, file), 'utf8');
    for (const match of source.matchAll(literal)) {
      const text = match[1].replace(/\\'/g, '\'');
      if (/^[A-Z_]+$/.test(text) || text === 'Not ready.') continue;
      if (!ARABIC.test(toArabic(text))) missing.push(`${file}: ${text}`);
    }
  }
  assert.deepEqual(missing, []);
  for (const [code, hint] of Object.entries(ERROR_HINTS)) {
    assert.ok(hint.en && ARABIC.test(hint.ar), code);
  }
});
