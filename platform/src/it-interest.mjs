import { tdsReturnDraft } from './tds-return.mjs';
import { localToday } from './dates.mjs';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const FY = /^(\d{4})-(\d{2})$/;
const DAY_MS = 86400000;
const HUNDRED_RUPEES = 10000;
const ADVANCE_TAX_THRESHOLD_PAISE = 1000000;
const FEE_234E_PER_DAY_PAISE = 20000;
const MAX_PAISE = 1e14;
const BASES = new Set(['period', 'calendar']);
const EXCLUDED_KINDS = new Set(['capital-gains', 'lottery', 'new-business', 'dividend']);
const MONTHLY_BASIS_POINTS = { s234A: 100, s234B: 100, s234C: 100, notDeducted: 100, notPaid: 150 };
const INSTALMENTS = [
  { month: 6, day: 15, percent: 15, relaxPercent: 12, months: 3 },
  { month: 9, day: 15, percent: 45, relaxPercent: 36, months: 3 },
  { month: 12, day: 15, percent: 75, relaxPercent: 0, months: 3 },
  { month: 3, day: 15, percent: 100, relaxPercent: 0, months: 1 },
];
const SOURCES = {
  rule119A: 'Income-tax Rules 1962 r.119A: a part of a month is a full month, and the amount on which interest is charged is rounded down to a multiple of one hundred rupees',
  s234A: 'Income-tax Act 1961 s.234A(1): 1% for every month or part from the day after the due date to the date of furnishing the return, on tax as reduced by advance tax, TDS, TCS and relief; tax paid by the due date is not charged (CIT v Prannoy Roy, Supreme Court, 2009)',
  s234B: 'Income-tax Act 1961 s.234B(1) and (2): where advance tax paid is less than 90% of the assessed tax, 1% for every month or part from 1 April of the assessment year to the date of determination on the shortfall; after tax paid under s.140A, on the reduced shortfall',
  s234C: 'Income-tax Act 1961 s.234C(1): 1% a month for three months on the shortfall against 15%, 45% and 75% of tax due on returned income by 15 June, 15 September and 15 December and one month against 100% by 15 March, none for June at 12% or September at 36%; for s.44AD or s.44ADA only the 15 March instalment; second proviso for capital gains, lottery, new business and dividend income',
  s140A: 'Income-tax Act 1961 s.140A(1) Explanation: self-assessment tax goes first to the fee and interest payable and the balance to tax',
  s208: 'Income-tax Act 1961 s.208 and s.207(2): no advance tax, so no s.234B or s.234C, when the tax is under ten thousand rupees, or for a resident senior citizen with no business or professional income',
  s234E: 'Income-tax Act 1961 s.234E(1) and (2): two hundred rupees for every day the TDS or TCS statement is late, not more than the tax deductible or collectible for it',
  s201: 'Income-tax Act 1961 s.201(1A): 1% for every month or part from the date tax was deductible to the date deducted, and 1.5% from the date deducted to the date paid; Income-tax Rules 1962 r.30(2) for the deposit due date (7th of the next month, 30 April for March)',
};
const ITA_2025_NOTE = 'From the tax year 2026-27 the Income-tax Act, 2025 carries these charges under its own section numbers; the method here follows the 1961 Act and is for your CA to confirm against the 2025 Act.';

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function parts(iso) {
  const match = ISO.exec(String(iso || ''));
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dayNumber(iso) {
  const p = parts(iso);
  return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS;
}

function fromDayNumber(n) {
  const date = new Date(n * DAY_MS);
  return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isoOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(iso, days) {
  return fromDayNumber(dayNumber(iso) + days);
}

function shiftMonth(y, m, n) {
  const index = y * 12 + (m - 1) + n;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

function lastDayOfPeriod(start, n) {
  const target = shiftMonth(start.y, start.m, n);
  if (start.d <= daysInMonth(target.y, target.m)) return addDays(isoOf(target.y, target.m, start.d), -1);
  return isoOf(target.y, target.m, daysInMonth(target.y, target.m));
}

function firstOfMonthAfter(iso, months) {
  const p = parts(iso);
  const next = shiftMonth(p.y, p.m, months);
  return isoOf(next.y, next.m, 1);
}

export function monthsOrPart(from, to, { basis = 'period' } = {}) {
  const start = parts(from);
  const end = parts(to);
  if (!start || !end || !BASES.has(basis)) return null;
  if (to < from) return 0;
  const calendar = (end.y - start.y) * 12 + (end.m - start.m) + 1;
  if (basis === 'calendar') return calendar;
  let n = Math.max(1, calendar - 1);
  while (lastDayOfPeriod(start, n) < to) n += 1;
  return n;
}

export function roundDownToHundredRupees(paise) {
  const value = Math.max(0, Math.trunc(Number(paise) || 0));
  return value - (value % HUNDRED_RUPEES);
}

function interestOn(basePaise, monthlyBasisPoints, months) {
  return Math.round((roundDownToHundredRupees(basePaise) * monthlyBasisPoints * months) / 10000);
}

function validPaise(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_PAISE;
}

function badAmounts(values) {
  const bad = Object.entries(values).find(([, value]) => !validPaise(value));
  return bad ? fail('BAD_AMOUNT', { field: bad[0] }) : null;
}

function badDates(values) {
  const bad = Object.entries(values).find(([, value]) => !parts(value));
  return bad ? fail('INVALID_DATE', { field: bad[0], value: bad[1] ?? null }) : null;
}

function fyYears(fy) {
  const match = FY.exec(String(fy || ''));
  if (!match) return null;
  const start = Number(match[1]);
  if ((start + 1) % 100 !== Number(match[2])) return null;
  return { start, label: fy, from: `${start}-04-01`, to: `${start + 1}-03-31`, ayStart: `${start + 1}-04-01` };
}

export function interest234A({ dueDate, filedOn, taxPaise, advanceTaxPaise = 0, tdsTcsPaise = 0, reliefPaise = 0, paidBeforeDuePaise = 0 } = {}) {
  const dates = badDates({ dueDate, filedOn });
  if (dates) return dates;
  const amounts = badAmounts({ taxPaise, advanceTaxPaise, tdsTcsPaise, reliefPaise, paidBeforeDuePaise });
  if (amounts) return amounts;
  const from = addDays(dueDate, 1);
  const unpaidPaise = Math.max(0, taxPaise - advanceTaxPaise - tdsTcsPaise - reliefPaise - paidBeforeDuePaise);
  const months = filedOn > dueDate ? monthsOrPart(from, filedOn) : 0;
  const basePaise = roundDownToHundredRupees(unpaidPaise);
  return { ok: true, data: { section: '234A', from, to: filedOn, months, unpaidPaise, basePaise, interestPaise: interestOn(basePaise, MONTHLY_BASIS_POINTS.s234A, months) } };
}

function sortedPayments(rows) {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

function checkPayments(rows, amountKey, field) {
  if (!Array.isArray(rows)) return fail('BAD_PAYMENTS', { field });
  for (const [index, row] of rows.entries()) {
    if (!row || !parts(row.date)) return fail('INVALID_DATE', { field: `${field}[${index}].date`, value: row?.date ?? null });
    if (!validPaise(row[amountKey])) return fail('BAD_AMOUNT', { field: `${field}[${index}].${amountKey}` });
  }
  return null;
}

function outsideAdvanceTax(taxPaise, seniorNoBusiness) {
  if (seniorNoBusiness) return 'resident senior citizen with no business or professional income (s.207(2))';
  if (taxPaise < ADVANCE_TAX_THRESHOLD_PAISE) return 'tax under ten thousand rupees (s.208)';
  return '';
}

function run234B({ year, assessedTaxPaise, advanceTaxPaise, determinedOn, payments, towardsTax }) {
  const legs = [];
  let shortfall = Math.max(0, assessedTaxPaise - advanceTaxPaise);
  let legStart = year.ayStart;
  let accrued = 0;
  const split = [];
  for (const payment of payments) {
    if (shortfall > 0 && payment.date >= legStart) {
      const months = monthsOrPart(legStart, payment.date);
      const basePaise = roundDownToHundredRupees(shortfall);
      const interestPaise = interestOn(basePaise, MONTHLY_BASIS_POINTS.s234B, months);
      if (basePaise > 0) legs.push({ from: legStart, to: payment.date, months, basePaise, interestPaise });
      accrued += interestPaise;
      legStart = firstOfMonthAfter(legStart, months);
    }
    const taxPart = towardsTax(payment, accrued);
    split.push({ ...payment, towardsTaxPaise: taxPart });
    shortfall = Math.max(0, shortfall - taxPart);
  }
  if (shortfall > 0 && determinedOn >= legStart) {
    const months = monthsOrPart(legStart, determinedOn);
    const basePaise = roundDownToHundredRupees(shortfall);
    const interestPaise = interestOn(basePaise, MONTHLY_BASIS_POINTS.s234B, months);
    if (basePaise > 0) legs.push({ from: legStart, to: determinedOn, months, basePaise, interestPaise });
    accrued += interestPaise;
  }
  return { legs, interestPaise: accrued, split, shortfallPaise: shortfall };
}

export function interest234B({ fy, assessedTaxPaise, advanceTaxPaise = 0, determinedOn, selfAssessment = [], seniorNoBusiness = false } = {}) {
  const year = fyYears(fy);
  if (!year) return fail('INVALID_FY', { fy: fy ?? null });
  const dates = badDates({ determinedOn });
  if (dates) return dates;
  const amounts = badAmounts({ assessedTaxPaise, advanceTaxPaise });
  if (amounts) return amounts;
  const badRows = checkPayments(selfAssessment, 'taxPaise', 'selfAssessment');
  if (badRows) return badRows;
  const outside = outsideAdvanceTax(assessedTaxPaise, seniorNoBusiness);
  const applies = !outside && advanceTaxPaise * 100 < assessedTaxPaise * 90;
  const base = { section: '234B', from: year.ayStart, to: determinedOn, assessedTaxPaise, advanceTaxPaise, ninetyPercentPaise: Math.ceil((assessedTaxPaise * 90) / 100), applies, outside };
  if (!applies) return { ok: true, data: { ...base, legs: [], interestPaise: 0 } };
  const run = run234B({ year, assessedTaxPaise, advanceTaxPaise, determinedOn, payments: sortedPayments(selfAssessment), towardsTax: (payment) => payment.taxPaise });
  return { ok: true, data: { ...base, legs: run.legs, interestPaise: run.interestPaise } };
}

export function interest234C({ fy, taxDuePaise, advancePayments = [], presumptive = false, excludedIncome = [], seniorNoBusiness = false } = {}) {
  const year = fyYears(fy);
  if (!year) return fail('INVALID_FY', { fy: fy ?? null });
  const amounts = badAmounts({ taxDuePaise });
  if (amounts) return amounts;
  const badRows = checkPayments(advancePayments, 'amountPaise', 'advancePayments');
  if (badRows) return badRows;
  if (!Array.isArray(excludedIncome)) return fail('BAD_EXCLUDED_INCOME');
  for (const [index, row] of excludedIncome.entries()) {
    if (!row || !EXCLUDED_KINDS.has(row.kind)) return fail('BAD_EXCLUDED_KIND', { field: `excludedIncome[${index}].kind`, kinds: [...EXCLUDED_KINDS] });
    if (!parts(row.arisedOn)) return fail('INVALID_DATE', { field: `excludedIncome[${index}].arisedOn`, value: row.arisedOn ?? null });
    if (!validPaise(row.taxPaise)) return fail('BAD_AMOUNT', { field: `excludedIncome[${index}].taxPaise` });
  }
  const notes = [];
  const outside = outsideAdvanceTax(taxDuePaise, seniorNoBusiness);
  const schedule = presumptive ? INSTALMENTS.slice(3) : INSTALMENTS;
  const claimed = excludedIncome.filter((row) => row.paidInRemainingInstalments === true);
  if (claimed.length < excludedIncome.length) notes.push('Income listed under the second proviso to s.234C is left in every instalment unless the tax on it was paid in the remaining instalments (or by 31 March); say so with paidInRemainingInstalments.');
  const instalments = schedule.map((row) => {
    const dueDate = isoOf(row.month >= 4 ? year.start : year.start + 1, row.month, row.day);
    const laterTax = claimed.filter((item) => item.arisedOn > dueDate).reduce((sum, item) => sum + item.taxPaise, 0);
    const instalmentBase = Math.max(0, taxDuePaise - laterTax);
    const requiredPaise = Math.round((instalmentBase * row.percent) / 100);
    const paidPaise = advancePayments.filter((p) => p.date <= dueDate).reduce((sum, p) => sum + p.amountPaise, 0);
    const relaxed = row.relaxPercent > 0 && paidPaise * 100 >= instalmentBase * row.relaxPercent;
    const shortPaise = Math.max(0, requiredPaise - paidPaise);
    const basePaise = outside || relaxed ? 0 : roundDownToHundredRupees(shortPaise);
    const months = presumptive ? 1 : row.months;
    return { dueDate, percent: row.percent, requiredPaise, paidPaise, shortPaise, relaxed, basePaise, months, interestPaise: interestOn(basePaise, MONTHLY_BASIS_POINTS.s234C, months) };
  });
  return { ok: true, data: { section: '234C', presumptive, taxDuePaise, outside, instalments, interestPaise: instalments.reduce((sum, row) => sum + row.interestPaise, 0), notes } };
}

export function fee234E({ dueDate, filedOn, tdsPaise } = {}) {
  const dates = badDates({ dueDate, filedOn });
  if (dates) return dates;
  const amounts = badAmounts({ tdsPaise });
  if (amounts) return amounts;
  const days = Math.max(0, dayNumber(filedOn) - dayNumber(dueDate));
  const uncappedPaise = days * FEE_234E_PER_DAY_PAISE;
  const feePaise = Math.min(uncappedPaise, tdsPaise);
  return { ok: true, data: { section: '234E', dueDate, filedOn, days, uncappedPaise, capPaise: tdsPaise, feePaise, capped: uncappedPaise > tdsPaise } };
}

export function tdsDepositDueDate(deductedOn) {
  const p = parts(deductedOn);
  if (!p) return null;
  if (p.m === 3) return isoOf(p.y, 4, 30);
  const next = shiftMonth(p.y, p.m, 1);
  return isoOf(next.y, next.m, 7);
}

export function interest201({ amountPaise, deductibleOn, deductedOn = null, paidOn = null, depositDueDate = null, asOf = null, basis = 'calendar' } = {}) {
  if (!BASES.has(basis)) return fail('BAD_BASIS', { basis, bases: [...BASES] });
  const amounts = badAmounts({ amountPaise });
  if (amounts) return amounts;
  const given = { deductibleOn };
  if (deductedOn != null) given.deductedOn = deductedOn;
  if (paidOn != null) given.paidOn = paidOn;
  if (depositDueDate != null) given.depositDueDate = depositDueDate;
  if (asOf != null) given.asOf = asOf;
  const dates = badDates(given);
  if (dates) return dates;
  if (deductedOn && deductedOn < deductibleOn) return fail('DATES_OUT_OF_ORDER', { deductibleOn, deductedOn });
  if (deductedOn && paidOn && paidOn < deductedOn) return fail('DATES_OUT_OF_ORDER', { deductedOn, paidOn });
  if (paidOn && !deductedOn) return fail('DATE_NEEDED', { field: 'deductedOn' });
  const notDeductedTo = deductedOn || asOf;
  if (!notDeductedTo) return fail('DATE_NEEDED', { field: 'deductedOn or asOf' });
  const basePaise = roundDownToHundredRupees(amountPaise);
  const notDeductedMonths = notDeductedTo > deductibleOn ? monthsOrPart(deductibleOn, notDeductedTo, { basis }) : 0;
  const notDeducted = { from: deductibleOn, to: notDeductedTo, deducted: Boolean(deductedOn), months: notDeductedMonths, basePaise, ratePerMonth: 1, interestPaise: interestOn(basePaise, MONTHLY_BASIS_POINTS.notDeducted, notDeductedMonths) };
  let notPaid = null;
  if (deductedOn) {
    const due = depositDueDate || tdsDepositDueDate(deductedOn);
    const paidTo = paidOn || asOf;
    if (!paidTo) return fail('DATE_NEEDED', { field: 'paidOn or asOf' });
    const months = paidTo > due ? monthsOrPart(deductedOn, paidTo, { basis }) : 0;
    notPaid = { from: deductedOn, to: paidTo, paid: Boolean(paidOn), depositDueDate: due, months, basePaise, ratePerMonth: 1.5, interestPaise: interestOn(basePaise, MONTHLY_BASIS_POINTS.notPaid, months) };
  }
  return { ok: true, data: { section: '201(1A)', basis, amountPaise, notDeducted, notPaid, interestPaise: notDeducted.interestPaise + (notPaid ? notPaid.interestPaise : 0) } };
}

function toPaise(value, field, { optional = true } = {}) {
  if (value == null || value === '') return optional ? { paise: 0 } : { error: fail('BAD_AMOUNT', { field }) };
  const number = Number(value);
  if (typeof value === 'boolean' || !Number.isFinite(number) || number < 0 || number * 100 > MAX_PAISE) return { error: fail('BAD_AMOUNT', { field }) };
  return { paise: Math.round(number * 100) };
}

const rupees = (paise) => Math.round(paise) / 100;

function rupeeRows(rows, field) {
  if (rows == null) return { rows: [] };
  if (!Array.isArray(rows)) return { error: fail('BAD_PAYMENTS', { field }) };
  const out = [];
  for (const [index, row] of rows.entries()) {
    if (!row || !parts(row.date)) return { error: fail('INVALID_DATE', { field: `${field}[${index}].date`, value: row?.date ?? null }) };
    const amount = toPaise(row.amount, `${field}[${index}].amount`, { optional: false });
    if (amount.error) return amount;
    out.push({ date: row.date, amountPaise: amount.paise });
  }
  return { rows: out };
}

function yearNotes(year) {
  return year.start >= 2026 ? [ITA_2025_NOTE] : [];
}

export function incomeTaxInterest(args = {}) {
  const year = fyYears(args.fy);
  if (!year) return fail('INVALID_FY', { fy: args.fy ?? null });
  const dates = badDates({ dueDate: args.dueDate, filedOn: args.filedOn });
  if (dates) return dates;
  const determinedOn = args.determinedOn == null || args.determinedOn === '' ? args.filedOn : args.determinedOn;
  if (!parts(determinedOn)) return fail('INVALID_DATE', { field: 'determinedOn', value: determinedOn });
  if (args.dueDate <= year.to) return fail('DUE_DATE_BEFORE_YEAR_END', { dueDate: args.dueDate, yearEnd: year.to });
  const money = {};
  for (const field of ['taxOnTotalIncome', 'tdsTcs', 'relief', 'lateFee']) {
    const parsed = toPaise(args[field], field, { optional: field !== 'taxOnTotalIncome' });
    if (parsed.error) return parsed.error;
    money[field] = parsed.paise;
  }
  const returned = toPaise(args.taxOnReturnedIncome ?? args.taxOnTotalIncome, 'taxOnReturnedIncome', { optional: false });
  if (returned.error) return returned.error;
  const advanceRows = rupeeRows(args.advanceTaxPayments, 'advanceTaxPayments');
  if (advanceRows.error) return advanceRows.error;
  const selfRows = rupeeRows(args.selfAssessmentPayments, 'selfAssessmentPayments');
  if (selfRows.error) return selfRows.error;
  const excluded = [];
  for (const [index, row] of (Array.isArray(args.excludedIncome) ? args.excludedIncome : []).entries()) {
    const tax = toPaise(row?.tax, `excludedIncome[${index}].tax`, { optional: false });
    if (tax.error) return tax.error;
    excluded.push({ kind: row.kind, arisedOn: row.arisedOn, taxPaise: tax.paise, paidInRemainingInstalments: row.paidInRemainingInstalments === true });
  }
  const notes = [...yearNotes(year)];
  const advance = advanceRows.rows.filter((row) => row.date <= year.to);
  const moved = advanceRows.rows.filter((row) => row.date > year.to);
  if (moved.length) notes.push(`${moved.length === 1 ? 'A payment' : `${moved.length} payments`} entered as advance tax but dated after 31 March ${year.start + 1} ${moved.length === 1 ? 'is' : 'are'} self-assessment tax for interest.`);
  const early = selfRows.rows.filter((row) => row.date <= year.to);
  if (early.length) notes.push(`Self-assessment tax dated on or before 31 March ${year.start + 1} is advance tax for interest.`);
  const advancePaid = [...advance, ...early].sort((a, b) => a.date.localeCompare(b.date));
  const selfPaid = [...selfRows.rows.filter((row) => row.date > year.to), ...moved].sort((a, b) => a.date.localeCompare(b.date));
  const advanceTaxPaise = advancePaid.reduce((sum, row) => sum + row.amountPaise, 0);
  const assessedTaxPaise = Math.max(0, money.taxOnTotalIncome - money.tdsTcs - money.relief);
  const taxDuePaise = Math.max(0, returned.paise - money.tdsTcs - money.relief);
  const seniorNoBusiness = args.seniorNoBusiness === true;
  const c = interest234C({ fy: year.label, taxDuePaise, advancePayments: advancePaid, presumptive: args.presumptive === true, excludedIncome: excluded, seniorNoBusiness });
  if (!c.ok) return c;
  notes.push(...c.data.notes);
  const outside = outsideAdvanceTax(assessedTaxPaise, seniorNoBusiness);
  const bApplies = !outside && advanceTaxPaise * 100 < assessedTaxPaise * 90;
  let absorbed = 0;
  let paidBeforeDuePaise = 0;
  const unpaidAtDue = () => Math.max(0, assessedTaxPaise - advanceTaxPaise - paidBeforeDuePaise);
  const accrued234A = (date) => (date > args.dueDate ? interestOn(unpaidAtDue(), MONTHLY_BASIS_POINTS.s234A, monthsOrPart(addDays(args.dueDate, 1), date)) : 0);
  const towardsTax = (payment, accruedB) => {
    const pool = c.data.interestPaise + (bApplies ? accruedB : 0) + accrued234A(payment.date) + (payment.date > args.dueDate ? money.lateFee : 0) - absorbed;
    const toInterest = Math.min(payment.amountPaise, Math.max(0, pool));
    absorbed += toInterest;
    const taxPart = payment.amountPaise - toInterest;
    if (payment.date <= args.dueDate) paidBeforeDuePaise += taxPart;
    return taxPart;
  };
  const b = run234B({ year, assessedTaxPaise, advanceTaxPaise, determinedOn, payments: selfPaid, towardsTax });
  const a = interest234A({ dueDate: args.dueDate, filedOn: args.filedOn, taxPaise: assessedTaxPaise, advanceTaxPaise, paidBeforeDuePaise });
  if (!a.ok) return a;
  const bInterest = bApplies ? b.interestPaise : 0;
  const totalPaise = a.data.interestPaise + bInterest + c.data.interestPaise;
  const selfTaxPaise = b.split.reduce((sum, row) => sum + row.towardsTaxPaise, 0);
  const feeAbsorbed = Math.min(money.lateFee, absorbed);
  const interestPaidPaise = absorbed - feeAbsorbed;
  return {
    ok: true,
    data: {
      forCA: true,
      fy: year.label,
      assessmentYear: `${year.start + 1}-${String((year.start + 2) % 100).padStart(2, '0')}`,
      dueDate: args.dueDate,
      filedOn: args.filedOn,
      determinedOn,
      assessedTax: rupees(assessedTaxPaise),
      taxDueOnReturnedIncome: rupees(taxDuePaise),
      advanceTax: rupees(advanceTaxPaise),
      selfAssessment: b.split.map((row) => ({ date: row.date, amount: rupees(row.amountPaise), towardsInterest: rupees(row.amountPaise - row.towardsTaxPaise), towardsTax: rupees(row.towardsTaxPaise) })),
      s234A: { from: a.data.from, to: a.data.to, months: a.data.months, base: rupees(a.data.basePaise), interest: rupees(a.data.interestPaise) },
      s234B: { applies: bApplies, outside, ninetyPercent: rupees(Math.ceil((assessedTaxPaise * 90) / 100)), legs: bApplies ? b.legs.map((leg) => ({ from: leg.from, to: leg.to, months: leg.months, base: rupees(leg.basePaise), interest: rupees(leg.interestPaise) })) : [], interest: rupees(bInterest) },
      s234C: { presumptive: c.data.presumptive, outside: c.data.outside, instalments: c.data.instalments.map((row) => ({ dueDate: row.dueDate, percent: row.percent, required: rupees(row.requiredPaise), paid: rupees(row.paidPaise), short: rupees(row.shortPaise), relaxed: row.relaxed, base: rupees(row.basePaise), months: row.months, interest: rupees(row.interestPaise) })), interest: rupees(c.data.interestPaise) },
      totalInterest: rupees(totalPaise),
      lateFee: rupees(money.lateFee),
      interestPaid: rupees(interestPaidPaise),
      feePaid: rupees(feeAbsorbed),
      interestStillDue: rupees(Math.max(0, totalPaise - interestPaidPaise)),
      taxStillDue: rupees(Math.max(0, assessedTaxPaise - advanceTaxPaise - selfTaxPaise)),
      notes,
      sources: [SOURCES.s234A, SOURCES.s234B, SOURCES.s234C, SOURCES.s140A, SOURCES.s208, SOURCES.rule119A],
    },
  };
}

export function tdsInterest(args = {}) {
  const out = { forCA: true, s234E: null, s201: null, total: 0, notes: [], sources: [] };
  if (args.dueDate || args.filedOn || args.tds != null) {
    const tds = toPaise(args.tds, 'tds', { optional: false });
    if (tds.error) return tds.error;
    const fee = fee234E({ dueDate: args.dueDate, filedOn: args.filedOn, tdsPaise: tds.paise });
    if (!fee.ok) return fee;
    out.s234E = { dueDate: fee.data.dueDate, filedOn: fee.data.filedOn, days: fee.data.days, uncapped: rupees(fee.data.uncappedPaise), cap: rupees(fee.data.capPaise), fee: rupees(fee.data.feePaise), capped: fee.data.capped };
    out.sources.push(SOURCES.s234E);
  }
  const late = Array.isArray(args.late) ? args.late : [];
  if (args.late != null && !Array.isArray(args.late)) return fail('BAD_LATE_ROWS');
  if (late.length) {
    const rows = [];
    for (const [index, row] of late.entries()) {
      const amount = toPaise(row?.amount, `late[${index}].amount`, { optional: false });
      if (amount.error) return amount.error;
      const result = interest201({ amountPaise: amount.paise, deductibleOn: row.deductibleOn, deductedOn: row.deductedOn || null, paidOn: row.paidOn || null, depositDueDate: row.depositDueDate || null, asOf: row.paidOn ? null : args.asOf || null, basis: args.basis || 'calendar' });
      if (!result.ok) return { ...result, row: index };
      const d = result.data;
      rows.push({ amount: rupees(d.amountPaise), notDeducted: { from: d.notDeducted.from, to: d.notDeducted.to, deducted: d.notDeducted.deducted, months: d.notDeducted.months, base: rupees(d.notDeducted.basePaise), interest: rupees(d.notDeducted.interestPaise) }, notPaid: d.notPaid ? { from: d.notPaid.from, to: d.notPaid.to, paid: d.notPaid.paid, depositDueDate: d.notPaid.depositDueDate, months: d.notPaid.months, base: rupees(d.notPaid.basePaise), interest: rupees(d.notPaid.interestPaise) } : null, interest: rupees(d.interestPaise) });
    }
    const basis = args.basis || 'calendar';
    out.s201 = { basis, rows, interest: rupees(rows.reduce((sum, row) => sum + Math.round(row.interest * 100), 0)) };
    out.sources.push(SOURCES.s201, SOURCES.rule119A);
    out.notes.push(basis === 'calendar' ? 'Months under s.201(1A) are counted by calendar month, as TRACES does; some tribunals count a month from the date instead (basis "period"), which can be a month less.' : 'Months under s.201(1A) are counted from the date (basis "period"); TRACES counts calendar months and may show a month more.');
  }
  if (!out.s234E && !out.s201) return fail('NOTHING_TO_COMPUTE', { hint: 'Give the statement due date, filing date and TDS for s.234E, or rows in late for s.201(1A).' });
  out.total = rupees(Math.round(((out.s234E?.fee || 0) + (out.s201?.interest || 0)) * 100));
  return { ok: true, data: out };
}

export function tdsInterestFor(state, args = {}) {
  if (!args.quarter) return tdsInterest(args);
  const draft = tdsReturnDraft(state, args.quarter, { form: args.form || 'other' });
  if (!draft.ok) return draft;
  const d = draft.data;
  const dueDate = args.dueDate || d.dueDate;
  if (!dueDate) return fail('DUE_DATE_NEEDED', { quarter: d.quarter });
  const filedOn = args.filedOn || d.filed?.filedOn || args.asOf || localToday();
  const result = tdsInterest({ ...args, dueDate, filedOn, tds: args.tds ?? d.deducted });
  if (!result.ok) return result;
  return { ok: true, data: { ...result.data, quarter: d.quarter, kind: d.kind, form: d.form, filed: d.filed } };
}

export function advanceTax234C({ fy, netTaxPaise, payments, presumptive, asOf }) {
  const result = interest234C({ fy, taxDuePaise: netTaxPaise, advancePayments: payments, presumptive });
  if (!result.ok) return result;
  const passed = result.data.instalments.filter((row) => row.dueDate < asOf);
  return { ok: true, data: { instalments: passed, interestPaise: passed.reduce((sum, row) => sum + row.interestPaise, 0) } };
}

export function incomeTaxInterestWords(d, money) {
  const lines = [`For your CA to confirm. Interest for ${d.fy} (assessment year ${d.assessmentYear}), return due ${d.dueDate}, filed ${d.filedOn}.`];
  lines.push(`Assessed tax after TDS and relief ${money(d.assessedTax)}; advance tax ${money(d.advanceTax)}.`);
  lines.push(`· 234A: ${d.s234A.months ? `${d.s234A.months} ${d.s234A.months === 1 ? 'month' : 'months'} on ${money(d.s234A.base)}, ${money(d.s234A.interest)}` : 'nil, the return is on time or nothing was unpaid'}.`);
  lines.push(`· 234B: ${d.s234B.applies ? d.s234B.legs.map((leg) => `${leg.months} ${leg.months === 1 ? 'month' : 'months'} on ${money(leg.base)}`).join(', then ') + `, ${money(d.s234B.interest)}` : d.s234B.outside ? `nil, ${d.s234B.outside}` : `nil, advance tax is at least 90% (${money(d.s234B.ninetyPercent)})`}.`);
  const charged = d.s234C.instalments.filter((row) => row.interest > 0);
  lines.push(`· 234C: ${charged.length ? charged.map((row) => `${row.dueDate} short ${money(row.base)} for ${row.months} ${row.months === 1 ? 'month' : 'months'}`).join('; ') + `, ${money(d.s234C.interest)}` : d.s234C.outside ? `nil, ${d.s234C.outside}` : 'nil'}.`);
  lines.push(`Total interest ${money(d.totalInterest)}${d.interestPaid ? `, of which ${money(d.interestPaid)} is covered by self-assessment tax already paid` : ''}; still to pay ${money(d.interestStillDue)} interest and ${money(d.taxStillDue)} tax.`);
  for (const note of d.notes) lines.push(note);
  return lines.join('\n');
}

export function tdsInterestWords(d, money) {
  const lines = [`For your CA to confirm.${d.quarter ? ` TDS statement ${d.quarter}.` : ''}`];
  if (d.s234E) lines.push(`· 234E late fee: ${d.s234E.days} ${d.s234E.days === 1 ? 'day' : 'days'} after ${d.s234E.dueDate}, ${money(d.s234E.fee)}${d.s234E.capped ? ` (capped at the TDS of ${money(d.s234E.cap)})` : ''}.`);
  if (d.s201) lines.push(`· 201(1A) interest: ${money(d.s201.interest)} on ${d.s201.rows.length} ${d.s201.rows.length === 1 ? 'amount' : 'amounts'}.`);
  lines.push(`Total ${money(d.total)}.`);
  for (const note of d.notes) lines.push(note);
  return lines.join('\n');
}
