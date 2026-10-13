import { csvRows } from './text-safe.mjs';
import { listAccounts } from './ledger.mjs';
import { localToday } from './dates.mjs';
import { countryOf } from './country.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export function exportTrialBalance(state) {
  const accounts = listAccounts(state.ledger).filter((account) => account.debitsPosted || account.creditsPosted);
  const rows = accounts.map((account) => {
    const net = round2(account.debitsPosted - account.creditsPosted);
    return [account.code, account.name, account.type, round2(account.debitsPosted), round2(account.creditsPosted), net > 0 ? net : 0, net < 0 ? -net : 0];
  });
  const debit = round2(rows.reduce((sum, row) => sum + row[3], 0));
  const credit = round2(rows.reduce((sum, row) => sum + row[4], 0));
  const closingDebit = round2(rows.reduce((sum, row) => sum + row[5], 0));
  const closingCredit = round2(rows.reduce((sum, row) => sum + row[6], 0));
  const asOf = localToday();
  const tag = String(state.company?.gstin || state.company?.ein || 'books').replace(/[^A-Za-z0-9-]/g, '');
  const currency = countryOf(state) === 'US' ? 'USD' : 'INR';
  return {
    ok: true,
    data: {
      asOf,
      currency,
      accounts: rows.length,
      debit,
      credit,
      balanced: Math.abs(debit - credit) < 0.001,
      fileName: `trial_balance_${tag}_${asOf}.csv`,
      csv: csvRows([
        ['code', 'account', 'type', 'debits_posted', 'credits_posted', 'closing_debit', 'closing_credit'],
        ...rows,
        ['', 'Total', '', debit, credit, closingDebit, closingCredit],
      ]),
    },
  };
}
