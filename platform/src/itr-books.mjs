import { profitAndLoss, balanceSheet } from './statements.mjs';
import { creditsToDate } from './advance-tax.mjs';
import { assessmentYearOf } from './itr-return-builder.mjs';

const round = (value) => Math.round(Number(value) || 0);
const FIXED_ASSET_NAME = /\b(fixed asset|equipment|furniture|vehicle|machinery|machine|computer|laptop|building|plant|land|software|tools?)\b/i;
const LOAN_NAME = /\b(loan|borrowing|overdraft|od\b|cc\b|debenture)\b/i;
const SECURED_NAME = /\b(bank|overdraft|od\b|cc\b|secured|term loan)\b/i;
const INTEREST_EXPENSE_NAME = /\binterest\b/i;
const DEPRECIATION_NAME = /\bdepreciation\b/i;

function fyWindow(fy) {
  const info = assessmentYearOf(fy);
  return info ? { from: info.fyStart, to: info.fyEnd, label: fy, start: info.ayStart - 1 } : null;
}

function receiptsByMode(state, window) {
  let cash = 0;
  let total = 0;
  for (const invoice of state.invoices || []) {
    for (const receipt of invoice.receipts || []) {
      if (!receipt.date || receipt.date < window.from || receipt.date > window.to) continue;
      const amount = Number(receipt.amount) || 0;
      total += amount;
      if (receipt.mode === 'cash') cash += amount;
    }
  }
  return { cash: round(cash), total: round(total) };
}

export function booksFigures(state, { fy } = {}) {
  const window = fyWindow(fy);
  if (!window) return { ok: false, error: 'FY_INVALID', hint: 'Give the financial year as 2024-25.' };
  const pl = profitAndLoss(state, { from: window.from, to: window.to });
  if (!pl.ok) return pl;
  const bs = balanceSheet(state, { asOf: window.to });
  if (!bs.ok) return bs;
  const notes = [];

  let turnover = 0;
  let interestIncome = 0;
  let otherIncome = 0;
  for (const line of pl.data.income) {
    if (line.code === '4000') turnover += line.amount;
    else if (line.code === '4100') interestIncome += line.amount;
    else otherIncome += line.amount;
  }
  let expenses = 0;
  let depreciationBooks = 0;
  let interestExpense = 0;
  for (const line of pl.data.expenses) {
    if (DEPRECIATION_NAME.test(line.account)) depreciationBooks += line.amount;
    else if (INTEREST_EXPENSE_NAME.test(line.account)) interestExpense += line.amount;
    else expenses += line.amount;
  }

  const balance = { fixedAssetsNet: 0, inventories: 0, debtors: 0, cash: 0, bank: 0, loansAndAdvances: 0, otherCurrentAssets: 0, securedLoans: 0, unsecuredLoans: 0, creditors: 0, otherLiabilities: 0, provisions: 0 };
  for (const line of bs.data.assets) {
    const code = line.code;
    if (code === '1001') balance.cash += line.amount;
    else if (code === '1002') balance.bank += line.amount;
    else if (code === '1100' || /^AR\b/.test(line.account)) balance.debtors += line.amount;
    else if (code === '1300') balance.inventories += line.amount;
    else if (code === '1170' || code === '1150' || code === '1160' || /^12\d\d$/.test(code)) balance.loansAndAdvances += line.amount;
    else if (FIXED_ASSET_NAME.test(line.account)) balance.fixedAssetsNet += line.amount;
    else balance.otherCurrentAssets += line.amount;
  }
  for (const line of bs.data.liabilities) {
    if (line.code === '2000' || /^AP\b/.test(line.account)) balance.creditors += line.amount;
    else if (LOAN_NAME.test(line.account)) {
      if (SECURED_NAME.test(line.account)) balance.securedLoans += line.amount;
      else balance.unsecuredLoans += line.amount;
    } else balance.otherLiabilities += line.amount;
  }
  for (const key of Object.keys(balance)) balance[key] = round(balance[key]);
  const equity = round(bs.data.totalEquity);

  const receipts = receiptsByMode(state, window);
  const sales = round(turnover);
  const cashSales = Math.min(sales, receipts.cash);
  const credits = creditsToDate(state, { from: window.from, to: window.to, label: window.label, start: window.start }, window.to);
  const advance = (state.advanceTaxPayments || []).filter((p) => p.fy === fy).map((p) => ({ date: p.date, amount: round(p.amount) }));

  const statements = (state.tdsCreditStatements || []).filter((row) => row.date >= window.from && row.date <= window.to && row.tan);
  const byDeductor = new Map();
  for (const row of statements) {
    const key = `${row.tan}|${row.section || ''}`;
    const entry = byDeductor.get(key) || { tan: row.tan, name: row.name || '', section: row.section || '194J', gross: 0, tds: 0 };
    entry.gross += Number(row.amountPaid) || 0;
    entry.tds += Number(row.taxDeducted) || 0;
    byDeductor.set(key, entry);
  }
  const tdsOther = [...byDeductor.values()].map((row) => ({ tan: row.tan, section: row.section, gross: round(row.gross), tds: round(row.tds), head: 'BP' }));
  const tdsListed = tdsOther.reduce((total, row) => total + row.tds, 0);
  const tdsTotal = round(credits.credits);

  if (bs.data.undatedEntries) notes.push(`${bs.data.undatedEntries} ledger entries have no date, so they are in the balance sheet but not in the profit and loss for the year.`);
  if (!balance.fixedAssetsNet && !depreciationBooks) notes.push('The books carry no fixed assets or depreciation. If the business owns equipment, vehicles or a building, give the fixed asset list so depreciation is allowed.');
  if (!balance.inventories && (state.skus || []).length) notes.push('Stock items exist but no inventory valuation is posted at year end, so the closing stock is not in the profit or the balance sheet. Run an inventory valuation first.');
  if (credits.source) notes.push(`TDS credit: ${credits.source}.`);
  if (tdsTotal > tdsListed) notes.push(`TDS of Rs ${tdsTotal - tdsListed} is in the books without a deductor TAN, so it is claimed in total but not listed by deductor. Import Form 26AS to list it.`);

  return {
    ok: true,
    data: {
      fy,
      from: window.from,
      to: window.to,
      profitAndLoss: { turnover: sales, otherIncome: round(otherIncome), interestIncome: round(interestIncome), expenses: round(expenses), depreciationBooks: round(depreciationBooks), interestExpense: round(interestExpense), netProfit: round(pl.data.netProfit) },
      balanceSheet: balance,
      booksEquity: equity,
      turnoverSplit: { bank: sales - cashSales, cash: cashSales, receiptsInYear: receipts.total },
      taxesPaid: { advanceTax: advance, tds: Math.max(0, tdsTotal - tdsListed), tdsOther },
      notes,
    },
  };
}
