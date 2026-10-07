import { trialBalance, verifyChain } from './ledger.mjs';
import { periodsWithDocuments } from './return-period.mjs';
import { inWords } from './words.mjs';
import { periodSummary } from './period-summary.mjs';
import { creditAtRisk, supplierNumberOf } from './gstr2b-check.mjs';
import { businessSummary } from './business-summary.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const RECENT_MONTHS = 6;
const SEVERITY_ORDER = { act: 0, check: 1, ok: 2 };

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function money(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function whatCameAcross(state) {
  const dates = [...(state.invoices || []), ...(state.purchases || []), ...(state.expenses || [])].map((doc) => doc.date).filter(Boolean).sort();
  const sales = (state.invoices || []).length;
  const bills = (state.purchases || []).length;
  const expenses = (state.expenses || []).length;
  const customers = new Set((state.invoices || []).map((doc) => String(doc.partyName || '').toLowerCase())).size;
  const suppliers = new Set((state.purchases || []).map((doc) => String(doc.partyName || '').toLowerCase())).size;
  if (!dates.length) {
    return { id: 'books', severity: 'check', title: 'Your books are empty', detail: 'Nothing has been recorded or brought across yet. Add a sale, or bring your books from Tally, Zoho or a bank statement.', action: 'migrate' };
  }
  return {
    id: 'books',
    severity: 'ok',
    title: `${plural(sales, 'sale', 'sales')}, ${plural(bills, 'purchase bill', 'purchase bills')} and ${plural(expenses, 'expense', 'expenses')}`,
    detail: `From ${dates[0]} to ${dates.at(-1)}, with ${plural(customers, 'customer', 'customers')} and ${plural(suppliers, 'supplier', 'suppliers')}.`,
    figures: { sales, bills, expenses, customers, suppliers, from: dates[0], to: dates.at(-1) },
  };
}

function ledgerIntegrity(state) {
  const balance = trialBalance(state.ledger);
  const chain = verifyChain(state.ledger);
  if (balance.balanced && chain.ok) {
    return { id: 'ledger', severity: 'ok', title: 'Your books tie', detail: 'Every entry has a matching debit and credit, and the record of entries has not been altered.' };
  }
  return {
    id: 'ledger',
    severity: 'act',
    title: 'Your books do not tie',
    detail: balance.balanced ? 'The record of entries fails its integrity check. Ask your CA before recording more.' : `Debits ${money(balance.debit)} and credits ${money(balance.credit)} differ. Ask your CA before recording more.`,
  };
}

function heldOut(state, periods) {
  const held = [];
  for (const period of periods) {
    const summary = periodSummary(state, period);
    if (!summary.ok) continue;
    for (const item of summary.data.gstr1.held || []) held.push({ ...item, period });
  }
  if (!held.length) return { id: 'held', severity: 'ok', title: 'Every recent sale can go in its GST return', detail: `Checked ${plural(periods.length, 'month', 'months')}.` };
  const ids = new Set(held.map((item) => item.inum));
  const tax = round2((state.invoices || []).filter((inv) => ids.has(inv.id)).reduce((sum, inv) => sum + Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0), 0));
  return {
    id: 'held',
    severity: 'act',
    title: `${plural(held.length, 'sale', 'sales')} cannot go in the GST return as ${held.length === 1 ? 'it stands' : 'they stand'}`,
    detail: `Tax of ${money(tax)} on ${[...ids].slice(0, 3).join(', ')}${ids.size > 3 ? ` and ${ids.size - 3} more` : ''}. Usually a buyer GSTIN or a rate needs fixing.`,
    amount: tax,
    action: 'taxes',
    figures: { count: held.length },
  };
}

function creditCheck(state, periods) {
  const withStatement = periods.filter((period) => state.gstr2b && Object.hasOwn(state.gstr2b, period));
  if (!withStatement.length) {
    let credit = 0;
    for (const period of periods.slice(-3)) {
      const out = creditAtRisk(state, { period });
      if (out.ok) credit += out.data.creditInBooks;
    }
    credit = round2(credit);
    if (credit <= 0) return { id: 'credit', severity: 'ok', title: 'No input credit to check', detail: 'There are no purchase bills with GST in recent months.' };
    return {
      id: 'credit',
      severity: 'check',
      title: `Check ${money(credit)} of input credit against GSTR-2B`,
      detail: 'Your bills claim this credit, but you only get it if your suppliers report the bills. Add the GSTR-2B for each month on Taxes to see what is at risk.',
      amount: credit,
      action: 'taxes',
    };
  }
  let atRisk = 0;
  const suppliers = new Map();
  for (const period of withStatement) {
    const out = creditAtRisk(state, { period });
    if (!out.ok) continue;
    atRisk += out.data.creditAtRisk;
    for (const supplier of out.data.bySupplier) suppliers.set(supplier.gstin || supplier.supplier, (suppliers.get(supplier.gstin || supplier.supplier) || 0) + supplier.credit);
  }
  atRisk = round2(atRisk);
  if (atRisk <= 0) return { id: 'credit', severity: 'ok', title: 'Your input credit matches GSTR-2B', detail: `Checked ${plural(withStatement.length, 'month', 'months')} of 2B.` };
  return {
    id: 'credit',
    severity: 'act',
    title: `${money(atRisk)} of input credit is at risk`,
    detail: `${plural(suppliers.size, 'supplier has', 'suppliers have')} not reported bills the way your books have them. See which on Taxes.`,
    amount: atRisk,
    action: 'taxes',
  };
}

function dueDates(deadlines, asOfDate) {
  const passed = deadlines.filter((row) => row.daysUntil < 0 && row.daysUntil >= -90 && !row.filed);
  const next = deadlines.filter((row) => row.daysUntil >= 0 && !row.filed).sort((a, b) => a.daysUntil - b.daysUntil)[0];
  const nextLine = next ? `Next: ${next.returnLabel || next.returnType} for ${next.period}, due ${next.dueDate}.` : '';
  if (!passed.length) {
    return { id: 'due', severity: 'ok', title: 'No due date has passed in the last three months', detail: nextLine || `As of ${asOfDate}.` };
  }
  const names = [...new Set(passed.map((row) => `${row.returnType} ${row.period}`))];
  return {
    id: 'due',
    severity: 'check',
    title: `${plural(names.length, 'return has', 'returns have')} no filing recorded`,
    detail: `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}. MyCA has no filing recorded for these. If one was filed, say so with its ARN, for example "filed GSTR-1 for 2026-08, ARN AA2709261234567". ${nextLine}`.trim(),
    action: 'taxes',
  };
}

function owed(state, asOfDate) {
  const summary = businessSummary(state, { period: asOfDate.slice(0, 7) });
  if (!summary.ok) return null;
  const { total, invoices, customers, overdue } = summary.data.owedToYou;
  if (total <= 0) return { id: 'owed', severity: 'ok', title: 'No customer owes you money', detail: 'Every invoice is paid or settled.' };
  const top = customers[0];
  return {
    id: 'owed',
    severity: 'check',
    title: `Customers owe you ${money(total)}`,
    detail: `On ${plural(invoices, 'invoice', 'invoices')}. The largest is ${top.name}, ${money(top.due)}.${overdue && overdue.total > 0 ? ` ${money(overdue.total)} on ${plural(overdue.invoices, 'invoice is', 'invoices are')} past the agreed terms.` : ''}`,
    amount: total,
    action: 'sales',
  };
}

function setup(state) {
  const gaps = [];
  const company = state.company || {};
  if (!String(company.gstin || '').trim()) gaps.push('your GSTIN');
  if (!String(company.address || '').trim()) gaps.push('your business address');
  const noHsn = (state.invoices || []).filter((inv) => (inv.lines || []).some((line) => !String(line.hsn || '').trim())).length;
  const noNumber = (state.purchases || []).filter((bill) => String(bill.partyGstin || '').trim() && !supplierNumberOf(bill)).length;
  if (noHsn) gaps.push(`HSN or SAC codes on ${plural(noHsn, 'invoice', 'invoices')}`);
  if (noNumber) gaps.push(`the supplier's bill number on ${plural(noNumber, 'bill', 'bills')}`);
  if (!gaps.length) return { id: 'setup', severity: 'ok', title: 'Your business details are complete', detail: 'GSTIN, address, HSN codes and supplier bill numbers are in place.' };
  return {
    id: 'setup',
    severity: 'check',
    title: 'Some details are missing',
    detail: `Add ${gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(', ')} and ${gaps.at(-1)}`}.`,
    action: noNumber && gaps.length === 1 ? 'purchases' : 'business',
    figures: { invoicesWithoutHsn: noHsn, billsWithoutNumber: noNumber },
  };
}

function otherExceptions(exceptions) {
  const rest = exceptions.filter((item) => item.status === 'open' && item.source !== 'gstr1' && item.source !== 'deadlines');
  if (!rest.length) return null;
  const money2 = round2(rest.reduce((sum, item) => sum + Number(item.moneyAtRisk || 0), 0));
  return {
    id: 'exceptions',
    severity: 'act',
    title: `${plural(rest.length, 'other item needs', 'other items need')} you`,
    detail: `${rest.slice(0, 2).map((item) => item.title).join('; ')}${rest.length > 2 ? '; and more' : ''}.`,
    amount: money2 || undefined,
    action: 'taxes',
  };
}

export function booksCheck(state, { deadlines = [], exceptions = [], asOfDate }) {
  const periods = periodsWithDocuments(state).slice(-RECENT_MONTHS);
  const findings = [
    whatCameAcross(state),
    ledgerIntegrity(state),
    heldOut(state, periods),
    creditCheck(state, periods),
    dueDates(deadlines, asOfDate),
    owed(state, asOfDate),
    setup(state),
    otherExceptions(exceptions),
  ].filter(Boolean);
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  for (const item of findings) {
    item.title = inWords(item.title);
    item.detail = inWords(item.detail);
  }
  const count = (severity) => findings.filter((item) => item.severity === severity).length;
  const act = count('act');
  const check = count('check');
  return {
    ok: true,
    data: {
      asOfDate,
      months: periods,
      headline: act ? `${plural(act, 'thing needs', 'things need')} you now` : check ? `${plural(check, 'thing', 'things')} to check` : 'Your books look healthy',
      counts: { act, check, ok: count('ok') },
      findings,
    },
  };
}
