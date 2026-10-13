import { rules } from './sprint-load.mjs';
import { localToday } from './dates.mjs';
import { filingFor } from './filings.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const SCHEDULE_C_LINES = {
  5110: { line: '20b', label: 'Rent or lease: other business property' },
  5120: { line: '26', label: 'Wages' },
  5125: { line: '23', label: 'Taxes and licenses (employer payroll taxes)' },
  5130: { line: '25', label: 'Utilities' },
  5140: { line: '25', label: 'Utilities' },
  5150: { line: '24a', label: 'Travel' },
  5160: { line: '21', label: 'Repairs and maintenance' },
  5170: { line: '17', label: 'Legal and professional services' },
  5180: { line: '27a', label: 'Other expenses (bank charges)' },
  5190: { line: '18', label: 'Office expense' },
  5200: { line: '8', label: 'Advertising' },
  5210: { line: '27a', label: 'Other expenses (freight and delivery)' },
  5220: { line: '15', label: 'Insurance (other than health)' },
  5230: { line: '18', label: 'Office expense (software and subscriptions)' },
  5240: { line: '22', label: 'Supplies' },
  5250: { line: '24b', label: 'Deductible meals', note: 'Business meals are generally limited to 50%; the full amount is shown and your CPA applies the limit.' },
  5260: { line: '27a', label: 'Other expenses (gifts and staff welfare)', note: 'Business gifts are limited per recipient; your CPA applies the limit.' },
  5270: { line: '', label: 'Club and fitness memberships', note: 'Club dues are not deductible; shown for completeness and excluded from the total.' },
  5280: { line: '9', label: 'Car and truck expenses', note: 'Only the business-use share is deductible; your CPA decides between actual cost and the standard mileage rate.' },
  5290: { line: '', label: 'Personal and household', note: 'Personal spending is not a business expense; excluded from the total.' },
  5100: { line: '27a', label: 'Other expenses' },
};

export function scheduleCSummary(state, args = {}) {
  const year = String(args.year || localToday().slice(0, 4)).trim();
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'BAD_YEAR', year };
  const inYear = (date) => String(date || '').startsWith(year);
  const invoices = (state.invoices || []).filter((inv) => inv.country === 'US' && inv.status !== 'cancelled' && inYear(inv.date));
  const grossReceipts = round2(invoices.reduce((sum, inv) => sum + Number(inv.subtotal || inv.taxable || 0), 0));
  const invoiceIds = new Set(invoices.map((inv) => inv.id));
  const returns = round2((state.creditNotes || []).filter((note) => inYear(note.date) && invoiceIds.has(note.invoiceId)).reduce((sum, note) => sum + Number(note.taxable || note.total || 0), 0));
  const purchases = (state.purchases || []).filter((bill) => inYear(bill.date) && bill.status !== 'cancelled');
  const costOfGoods = round2(purchases.reduce((sum, bill) => sum + Number(bill.total || 0), 0));
  const byHead = new Map();
  for (const expense of (state.expenses || []).filter((item) => inYear(item.date))) {
    const code = Number(expense.head);
    const entry = SCHEDULE_C_LINES[code] || SCHEDULE_C_LINES[5100];
    const key = `${entry.line}|${entry.label}`;
    const row = byHead.get(key) || { line: entry.line, label: entry.label, amount: 0, heads: new Set(), note: entry.note || '' };
    row.amount = round2(row.amount + Number(expense.amount || 0));
    row.heads.add(expense.headName || String(expense.head));
    byHead.set(key, row);
  }
  const payrollTaxes = round2(Object.values(state.payrollRuns || {}).filter((run) => run.country === 'US' && run.period.startsWith(year)).reduce((sum, run) => sum + (run.totals.employerTaxesCents || 0) / 100, 0));
  if (payrollTaxes > 0) {
    const entry = SCHEDULE_C_LINES[5125];
    const key = `${entry.line}|${entry.label}`;
    const row = byHead.get(key) || { line: entry.line, label: entry.label, amount: 0, heads: new Set(), note: '' };
    row.amount = round2(row.amount + payrollTaxes);
    row.heads.add('Employer payroll taxes');
    byHead.set(key, row);
  }
  const expenses = [...byHead.values()].map((row) => ({ ...row, heads: [...row.heads].sort(), deductible: row.line !== '' })).sort((a, b) => (a.line || 'zz').localeCompare(b.line || 'zz', undefined, { numeric: true }));
  const totalExpenses = round2(expenses.filter((row) => row.deductible).reduce((sum, row) => sum + row.amount, 0));
  const excluded = round2(expenses.filter((row) => !row.deductible).reduce((sum, row) => sum + row.amount, 0));
  const grossIncome = round2(grossReceipts - returns - costOfGoods);
  const netProfit = round2(grossIncome - totalExpenses);
  return {
    ok: true,
    data: {
      year,
      form: 'Schedule C (Form 1040), Profit or Loss From Business',
      lineNumbers: 'as on the 2025 form; your CPA maps them to the year filed',
      grossReceipts,
      returnsAndAllowances: returns,
      costOfGoodsSold: costOfGoods,
      grossIncome,
      expenses,
      totalExpenses,
      excluded,
      netProfit,
      invoices: invoices.length,
      bills: purchases.length,
      notes: [
        'Gross receipts are invoice subtotals; sales tax collected is a liability, not income.',
        'Cost of goods sold is the total of supplier bills in the year, including any sales tax paid on them; MyCA keeps no inventory, so your CPA adjusts for opening and closing stock.',
        'Depreciation, home office, health insurance and the self-employment tax deduction are not in these books.',
        'This is a summary for your CPA. MyCA does not compute federal income tax or self-employment tax.',
        ...expenses.filter((row) => row.note).map((row) => `${row.label}: ${row.note}`),
      ],
    },
  };
}

export function estimatedTaxDates(state, args = {}) {
  const year = String(args.year || localToday().slice(0, 4)).trim();
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'BAD_YEAR', year };
  const found = rules.rule('us.federal.estimated-tax.due', `${year}-01-01`);
  if (!found.ok) return { ok: false, error: 'RULE_NOT_IN_FORCE', ruleId: 'us.federal.estimated-tax.due', year };
  const today = localToday();
  const installments = found.record.value.installments.map((item, index) => {
    const dueYear = item.nextYear ? Number(year) + 1 : Number(year);
    const dueDate = `${dueYear}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
    const returnType = 'FORM_1040-ES';
    const period = `${year}-${index + 1}`;
    const filing = filingFor(state, returnType, period);
    return { installment: index + 1, covers: item.covers, dueDate, past: dueDate < today, paid: filing ? { confirmation: filing.arn, paidOn: filing.filedOn } : null, period, returnType };
  });
  return {
    ok: true,
    data: {
      year,
      installments,
      ruleUsed: `${found.record.id}@${found.record.effectiveFrom}`,
      unreviewed: !(found.record.attestations || []).length,
      notes: [
        'Dates move to the next business day when they fall on a weekend or legal holiday; that shift is not applied here.',
        'The amount is for your CPA to set from last year\'s tax or this year\'s expected income; MyCA does not compute it.',
        ...(!(found.record.attestations || []).length ? ['The dates come from a dated rule a US CPA has not reviewed yet.'] : []),
      ],
    },
  };
}

export function ownerTaxWords(name, data, money) {
  if (name === 'schedule_c_summary') {
    const lines = [`Schedule C summary for ${data.year} (${data.invoices === 1 ? '1 invoice' : `${data.invoices} invoices`}, ${data.bills === 1 ? '1 bill' : `${data.bills} bills`}):`, `· Gross receipts ${money(data.grossReceipts)}${data.returnsAndAllowances > 0 ? `, returns ${money(data.returnsAndAllowances)}` : ''}`, `· Cost of goods sold ${money(data.costOfGoodsSold)}`, `· Gross income ${money(data.grossIncome)}`];
    for (const row of data.expenses) lines.push(`· ${row.line ? `Line ${row.line} ` : ''}${row.label}: ${money(row.amount)}${row.deductible ? '' : ' (excluded)'}`);
    lines.push(`· Total expenses ${money(data.totalExpenses)}`, `· Net profit ${money(data.netProfit)}`, data.notes.slice(0, 2).join(' '));
    return lines.join('\n');
  }
  const rows = data.installments.map((item) => `· ${item.installment}: ${item.covers}, due ${item.dueDate}${item.paid ? ` (paid, ${item.paid.confirmation})` : item.past ? ' (past)' : ''}`);
  return [`Estimated tax instalments for ${data.year}:`, ...rows, data.notes.join(' ')].join('\n');
}
