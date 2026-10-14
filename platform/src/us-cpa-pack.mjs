import { localToday } from './dates.mjs';
import { htmlEscape } from './text-safe.mjs';
import { formatMoney } from './country.mjs';
import { scheduleCSummary, estimatedTaxDates } from './us-owner-tax.mjs';
import { scheduleSe } from './us-se-tax.mjs';
import { usPayrollFilings } from './us-payroll.mjs';
import { contractor1099File } from './us-1099.mjs';
import { listNexus, periodsOf, salesTaxReturn } from './us-sales-tax.mjs';
import { exportTrialBalance } from './trial-balance-export.mjs';

function yearOf(args) {
  const year = String(args.year || localToday().slice(0, 4)).trim();
  return /^\d{4}$/.test(year) ? year : null;
}

function money(value) {
  return formatMoney({ country: 'US' }, value);
}

function table(rows) {
  return `<table>${rows.map((row) => `<tr>${row.map((cell, index) => `<${index === 0 ? 'th' : 'td'}>${htmlEscape(cell)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
}

export function scheduleCDocument(state, args = {}) {
  const year = yearOf(args);
  if (!year) return { ok: false, error: 'BAD_YEAR', year: args.year };
  const c = scheduleCSummary(state, { year });
  if (!c.ok) return c;
  const se = scheduleSe(state, { year, filingStatus: args.filingStatus, otherSocialSecurityWages: args.otherSocialSecurityWages });
  const company = state.company || {};
  const d = c.data;
  const sections = [
    `<h1>${htmlEscape(company.name || 'Business')}: Schedule C summary ${htmlEscape(year)}</h1>`,
    `<p class="muted">Prepared ${htmlEscape(localToday())} from the books in MyCA for the CPA. ${htmlEscape(d.lineNumbers)}. Not a tax return.</p>`,
    '<h2>Part I Income</h2>',
    table([['Line 1 Gross receipts', money(d.grossReceipts)], ['Line 2 Returns and allowances', money(d.returnsAndAllowances)], ['Line 4 Cost of goods sold', money(d.costOfGoodsSold)], ['Line 7 Gross income', money(d.grossIncome)]]),
    '<h2>Part II Expenses</h2>',
    table(d.expenses.map((row) => [`Line ${row.line || '—'} ${row.label}`, money(row.amount), row.deductible ? '' : 'excluded'])),
    table([['Line 28 Total expenses', money(d.totalExpenses)], ['Line 31 Net profit or loss', money(d.netProfit)]]),
    ...(se.ok ? ['<h2>Schedule SE draft</h2>', table(se.data.lines.map((row) => [`Line ${row.line} ${row.label}`, money(row.amount)])), `<p class="muted">${htmlEscape(se.data.notes.join(' '))}</p>`] : []),
    '<h2>Notes</h2>',
    `<ul>${d.notes.map((note) => `<li>${htmlEscape(note)}</li>`).join('')}</ul>`,
  ];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Schedule C ${htmlEscape(year)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:800px;margin:32px auto;padding:0 16px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}td{text-align:right}th{font-weight:500}.muted{color:#555}@media print{body{margin:0}}</style></head><body>${sections.join('')}</body></html>`;
  return { ok: true, data: { year, fileName: `schedule_c_${year}.html`, html, netProfit: d.netProfit, selfEmploymentTax: se.ok ? se.data.selfEmploymentTax : null } };
}

export function cpaPack(state, args = {}) {
  const year = yearOf(args);
  if (!year) return { ok: false, error: 'BAD_YEAR', year: args.year };
  const scheduleC = scheduleCSummary(state, { year });
  if (!scheduleC.ok) return scheduleC;
  const se = scheduleSe(state, { year });
  const estimated = estimatedTaxDates(state, { year });
  const payroll = usPayrollFilings(state, { year });
  const contractors = contractor1099File(state, { year });
  const trialBalance = exportTrialBalance(state);
  const today = localToday();
  const salesTax = [];
  for (const nexus of listNexus(state).data.states || []) {
    for (const period of periodsOf(nexus.frequency, nexus.from, today).filter((item) => item.startsWith(year))) {
      const drafted = salesTaxReturn(state, { state: nexus.state, period });
      if (drafted.ok && !drafted.data.empty) salesTax.push(drafted.data);
    }
  }
  const notes = [
    'Every figure comes from the books in MyCA; nothing is computed from tax tables except where a dated rule is named, and those rules say whether a CPA has reviewed them.',
    ...(payroll.ok ? [] : ['Payroll filings are left out: salaries are private or no payroll was run.']),
    ...(contractors.ok ? [] : ['The 1099-NEC list is left out.']),
  ];
  const pack = {
    year,
    preparedOn: today,
    business: { name: state.company?.name || '', ein: state.company?.ein || '', address: state.company?.address || '' },
    scheduleC: scheduleC.data,
    scheduleSE: se.ok ? se.data : null,
    estimatedTax: estimated.ok ? estimated.data : null,
    payroll: payroll.ok ? payroll.data : null,
    contractors1099: contractors.ok ? { payees: contractors.data.payees, threshold: contractors.data.threshold, dueDate: contractors.data.dueDate, missingW9: contractors.data.missingW9 } : null,
    salesTaxReturns: salesTax,
    trialBalance: trialBalance.ok ? { asOf: trialBalance.data.asOf, accounts: trialBalance.data.accounts, csv: trialBalance.data.csv } : null,
    notes,
  };
  return { ok: true, data: { year, fileName: `cpa_pack_${year}.json`, pack, sections: Object.entries(pack).filter(([key, value]) => value && typeof value === 'object' && !['business'].includes(key)).map(([key]) => key) } };
}

export function cpaPackWords(data, moneyFn) {
  const p = data.pack;
  return `CPA pack ${data.year}: Schedule C net ${moneyFn(p.scheduleC.netProfit)}${p.scheduleSE ? `, self-employment tax ${moneyFn(p.scheduleSE.selfEmploymentTax)}` : ''}${p.payroll ? `, ${p.payroll.w2.length} W-2${p.payroll.w2.length === 1 ? '' : 's'}` : ''}${p.contractors1099 ? `, ${p.contractors1099.payees.length} contractor${p.contractors1099.payees.length === 1 ? '' : 's'}` : ''}, ${p.salesTaxReturns.length} sales tax return${p.salesTaxReturns.length === 1 ? '' : 's'}. Saved as ${data.fileName} from the Federal and owner taxes screen.`;
}
