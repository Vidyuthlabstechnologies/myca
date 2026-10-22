import { createTransfers, TRANSFER_FLAGS } from './ledger.mjs';
import { ensureUsPayrollAccounts } from './us-payroll.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { isoDate, localToday } from './dates.mjs';
import { countryOf } from './country.mjs';

const CENTS = 100;
const BANK = 1002;
const WAGES = 5120;
const EMPLOYER_TAXES = 5125;
const OTHER_EXPENSE = 5100;
const NET_PAYABLE = 2300;
const PAYROLL_TAXES_PAYABLE = 2340;
const MAX_ROWS = 200;

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function split(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function cents(value) {
  const raw = String(value == null ? '' : value).replace(/[$,\s]/g, '');
  if (raw === '') return 0;
  const n = Number(raw.replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? Math.round(n * CENTS) : null;
}

const COLUMNS = {
  checkDate: ['check date', 'pay date', 'check_date'],
  periodStart: ['period start', 'pay period start', 'start date'],
  periodEnd: ['period end', 'pay period end', 'end date'],
  gross: ['gross pay', 'gross', 'total gross'],
  net: ['net pay', 'net', 'total net'],
  employeeTaxes: ['employee taxes', 'employee tax', 'taxes withheld'],
  employerTaxes: ['employer taxes', 'employer tax', 'company taxes'],
  reimbursements: ['reimbursements', 'reimbursement'],
  payrollId: ['payroll id', 'payroll uuid', 'payroll_uuid', 'id'],
};

export function parsePayrollSummary(csv) {
  const lines = String(csv || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return fail('EMPTY');
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) idx[key] = i;
  }
  if (idx.checkDate == null || idx.gross == null || idx.net == null) return fail('NO_HEADER', { need: 'check date, gross pay and net pay columns (employee taxes, employer taxes and reimbursements when the provider gives them)' });
  const rows = [];
  const held = [];
  for (const [n, line] of lines.slice(1).entries()) {
    const cells = split(line);
    const checkDate = isoDate(cells[idx.checkDate]);
    const gross = cents(cells[idx.gross]);
    const net = cents(cells[idx.net]);
    if (!checkDate) { held.push({ row: n + 2, reason: 'INVALID_DATE' }); continue; }
    if (gross == null || net == null || gross < 0 || net < 0) { held.push({ row: n + 2, reason: 'BAD_AMOUNT' }); continue; }
    const employeeTaxes = idx.employeeTaxes == null ? 0 : cents(cells[idx.employeeTaxes]) || 0;
    const employerTaxes = idx.employerTaxes == null ? 0 : cents(cells[idx.employerTaxes]) || 0;
    const reimbursements = idx.reimbursements == null ? 0 : cents(cells[idx.reimbursements]) || 0;
    if (net + employeeTaxes > gross + 1) { held.push({ row: n + 2, reason: 'NET_EXCEEDS_GROSS' }); continue; }
    rows.push({
      payrollId: idx.payrollId == null ? '' : String(cells[idx.payrollId] || ''),
      checkDate,
      periodStart: idx.periodStart == null ? '' : isoDate(cells[idx.periodStart]) || '',
      periodEnd: idx.periodEnd == null ? '' : isoDate(cells[idx.periodEnd]) || '',
      grossCents: gross,
      netCents: net,
      employeeTaxesCents: employeeTaxes,
      employerTaxesCents: employerTaxes,
      reimbursementsCents: reimbursements,
      otherDeductionsCents: Math.max(0, gross - net - employeeTaxes),
    });
    if (rows.length >= MAX_ROWS) break;
  }
  if (!rows.length) return fail('NO_ROWS', { held });
  return { ok: true, rows, held };
}

function importsOf(state) {
  state.payrollImports = Array.isArray(state.payrollImports) ? state.payrollImports : [];
  return state.payrollImports;
}

function keyOf(row) {
  return row.payrollId || `${row.checkDate}:${row.grossCents}:${row.netCents}`;
}

export function planPayrollImport(state, args = {}) {
  if (countryOf(state) !== 'US') return fail('NOT_FOR_COUNTRY');
  const parsed = parsePayrollSummary(args.csv);
  if (!parsed.ok) return parsed;
  const settle = args.settle !== false;
  const known = new Set(importsOf(state).map((r) => r.key));
  const fresh = [];
  const duplicates = [];
  for (const row of parsed.rows) {
    const key = keyOf(row);
    if (known.has(key)) duplicates.push(key);
    else if (isPeriodLocked(state, row.checkDate)) return fail('PERIOD_LOCKED', { date: row.checkDate, lockThrough: state.lockThrough });
    else fresh.push({ ...row, key });
  }
  if (!fresh.length) return fail('ALREADY_IMPORTED', { duplicates });
  const sum = (k) => fresh.reduce((s, r) => s + r[k], 0);
  return {
    ok: true,
    plan: {
      provider: String(args.provider || 'gusto').toLowerCase(),
      settle,
      rows: fresh,
      duplicates,
      held: parsed.held,
      totals: { grossCents: sum('grossCents'), netCents: sum('netCents'), employeeTaxesCents: sum('employeeTaxesCents'), employerTaxesCents: sum('employerTaxesCents'), reimbursementsCents: sum('reimbursementsCents'), otherDeductionsCents: sum('otherDeductionsCents') },
    },
  };
}

export function postPayrollImport(state, args = {}) {
  const planned = planPayrollImport(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureUsPayrollAccounts(state.ledger);
  const seqBefore = state.transferSeq;
  const bundle = [];
  const linked = TRANSFER_FLAGS.LINKED;
  const posted = [];
  for (const row of plan.rows) {
    const id = `PAY-${plan.provider.toUpperCase()}-${row.key.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)}`;
    const post = (debit, credit, amount, code) => { if (amount > 0) bundle.push({ id: nextTransferId(state), debitAccountId: debit, creditAccountId: credit, amount: BigInt(amount), flags: linked, invoiceId: id, code, userData: row.checkDate }); };
    post(WAGES, NET_PAYABLE, row.netCents, 'SALARY-NET');
    post(WAGES, PAYROLL_TAXES_PAYABLE, row.employeeTaxesCents, 'SALARY-TAXES');
    post(WAGES, NET_PAYABLE, row.otherDeductionsCents, 'SALARY-DEDUCTIONS');
    post(EMPLOYER_TAXES, PAYROLL_TAXES_PAYABLE, row.employerTaxesCents, 'EMPLOYER-TAXES');
    post(OTHER_EXPENSE, NET_PAYABLE, row.reimbursementsCents, 'REIMBURSEMENTS');
    if (plan.settle) {
      post(NET_PAYABLE, BANK, row.netCents + row.otherDeductionsCents + row.reimbursementsCents, 'PAYROLL-DEBIT-NET');
      post(PAYROLL_TAXES_PAYABLE, BANK, row.employeeTaxesCents + row.employerTaxesCents, 'PAYROLL-DEBIT-TAXES');
    }
    posted.push({ id, ...row });
  }
  const results = createTransfers(state.ledger, bundle);
  if (results.some((r) => !r.ok)) {
    state.transferSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted: results });
  }
  const on = localToday();
  const records = posted.map((row) => ({ id: row.id, key: row.key, provider: plan.provider, payrollId: row.payrollId, checkDate: row.checkDate, periodStart: row.periodStart, periodEnd: row.periodEnd, grossCents: row.grossCents, netCents: row.netCents, employeeTaxesCents: row.employeeTaxesCents, employerTaxesCents: row.employerTaxesCents, reimbursementsCents: row.reimbursementsCents, otherDeductionsCents: row.otherDeductionsCents, settled: plan.settle, importedOn: on, importedBy: String(state.__actor?.userId || args.actorId || '') }));
  importsOf(state).push(...records);
  const dollars = (c) => Math.round(c) / CENTS;
  return {
    ok: true,
    data: {
      provider: plan.provider,
      imported: records.length,
      skipped: plan.duplicates.length,
      held: plan.held,
      settled: plan.settle,
      totals: { gross: dollars(plan.totals.grossCents), net: dollars(plan.totals.netCents), employeeTaxes: dollars(plan.totals.employeeTaxesCents), employerTaxes: dollars(plan.totals.employerTaxesCents), reimbursements: dollars(plan.totals.reimbursementsCents), otherDeductions: dollars(plan.totals.otherDeductionsCents) },
      payrolls: records.map((r) => ({ id: r.id, checkDate: r.checkDate, gross: dollars(r.grossCents), net: dollars(r.netCents) })),
      note: `${plan.provider === 'gusto' ? 'Gusto' : 'The provider'} runs and files these payrolls (941, state returns, W-2), so they are posted as wages, employer taxes and the bank debits, and left out of MyCA's own 941 draft.`,
    },
  };
}

export function listPayrollImports(state) {
  const dollars = (c) => Math.round(c) / CENTS;
  return { ok: true, data: { payrolls: importsOf(state).map((r) => ({ id: r.id, provider: r.provider, checkDate: r.checkDate, periodStart: r.periodStart, periodEnd: r.periodEnd, gross: dollars(r.grossCents), net: dollars(r.netCents), employeeTaxes: dollars(r.employeeTaxesCents), employerTaxes: dollars(r.employerTaxesCents), settled: r.settled, importedOn: r.importedOn })) } };
}

export function payrollImportWords(result, money) {
  const d = result.data;
  return `Posted ${d.imported} ${d.provider === 'gusto' ? 'Gusto' : d.provider} ${d.imported === 1 ? 'payroll' : 'payrolls'}: wages ${money(d.totals.gross)}, employer taxes ${money(d.totals.employerTaxes)}${d.totals.reimbursements ? `, reimbursements ${money(d.totals.reimbursements)}` : ''}${d.settled ? `; ${money(d.totals.net + d.totals.otherDeductions + d.totals.reimbursements + d.totals.employeeTaxes + d.totals.employerTaxes)} left the bank on the check dates` : '; the net pay and taxes stay payable until the bank debits are recorded'}.${d.skipped ? ` ${d.skipped} already in the books were skipped.` : ''}${d.held.length ? ` ${d.held.length} rows could not be read.` : ''} ${d.note}`;
}
