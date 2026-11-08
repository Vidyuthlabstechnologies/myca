import { localToday } from './dates.mjs';
import { refreshExceptions, listExceptions, summarise } from './exceptions.mjs';
import { cashStart, latestReading } from './cash-forecast.mjs';
import { marketplaceCredits } from './marketplace-credits.mjs';
import { skuMargins } from './sku-margins.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { listInventoryValuations } from './inventory.mjs';
import { countryOf } from './country.mjs';
import { supplierDues } from './supplier-dues.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const BANK_FRESH_DAYS = 3;

function dayNumber(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function postedOn(rows, day, month) {
  const today = rows.filter((row) => row.status !== 'cancelled' && String(row.date || '') === day);
  const mtd = rows.filter((row) => row.status !== 'cancelled' && String(row.date || '').slice(0, 7) === month);
  const total = (list) => round2(list.reduce((sum, row) => sum + Number(row.total ?? row.amount ?? 0), 0));
  return { today: today.length, todayTotal: total(today), month: mtd.length, monthTotal: total(mtd) };
}

export function dailyClose(state, { asOf, clientId = 'SELF', chain = null } = {}) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(asOf || '')) ? asOf : localToday();
  const month = day.slice(0, 7);
  const sales = postedOn(state.invoices || [], day, month);
  const purchases = postedOn(state.purchases || [], day, month);
  const expenses = postedOn(state.expenses || [], day, month);
  const reading = latestReading(state);
  const bankAge = reading ? dayNumber(day) - dayNumber(reading.on) : null;
  const cash = cashStart(state, day);
  refreshExceptions(state, chain ? { chain } : {}, { asOfDate: day, clientId });
  const open = listExceptions(state, { status: 'open' });
  const exceptions = summarise(open);
  const settlements = (state.settlements || []);
  const unmatched = settlements.filter((item) => item.status === 'unmatched');
  const short = settlements.filter((item) => item.status === 'short');
  const latestSettlement = settlements.map((item) => item.to).sort().at(-1) || '';
  const receivable = round2((state.invoices || []).filter((inv) => inv.status !== 'cancelled').reduce((sum, inv) => sum + Math.max(0, outstandingOf(state, inv)), 0));
  const credits = marketplaceCredits(state).data;
  const creditGaps = credits.tcs.filter((row) => row.status === 'short in statement').length + credits.tds.filter((row) => row.status === 'short in 26AS').length;
  const marketplaceMonth = (state.invoices || []).filter((inv) => inv.source === 'marketplace').map((inv) => inv.date.slice(0, 7)).sort().at(-1) || '';
  const margins = marketplaceMonth ? skuMargins(state, { period: marketplaceMonth }).data : null;
  const inventory = (state.stockMoves || []).length ? listInventoryValuations(state).data : null;
  const bankLines = state.bankLines || [];
  const openLines = bankLines.filter((line) => line.status === 'unmatched');
  const staleLines = openLines.filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(String(line.date || '')) && dayNumber(day) - dayNumber(line.date) > BANK_FRESH_DAYS);
  const msme = countryOf(state) === 'IN' ? supplierDues(state, { asOf: day }).data.msme : null;
  const checklist = [
    { item: 'Sales posted', ok: true, detail: `${sales.today} today, ${sales.month} this month` },
    { item: 'Purchases and expenses posted', ok: true, detail: `${purchases.today + expenses.today} today, ${purchases.month + expenses.month} this month` },
    { item: 'Bank statement current', ok: bankAge != null && bankAge <= BANK_FRESH_DAYS, detail: reading ? `last balance ${reading.on}, ${bankAge === 0 ? 'today' : `${bankAge} ${bankAge === 1 ? 'day' : 'days'} ago`}` : 'no bank balance recorded yet' },
    { item: 'Settlements matched to the bank', ok: !unmatched.length && !short.length, detail: settlements.length ? `${settlements.length} imported${unmatched.length ? `, ${unmatched.length} not in the bank` : ''}${short.length ? `, ${short.length} short` : ''}` : 'none imported' },
    { item: 'Bank lines matched', ok: staleLines.length === 0, detail: openLines.length ? `${openLines.length} not matched yet${staleLines.length ? `, ${staleLines.length} older than ${BANK_FRESH_DAYS} days` : ''}` : bankLines.length ? 'all matched' : 'no statement lines yet' },
    ...(msme ? [{ item: 'MSME bills inside their limit', ok: msme.overdue === 0, detail: msme.count ? `${msme.count} open, ${msme.overdue} past the limit` : 'none open' }] : []),
    { item: 'TCS and TDS 194-O confirmed', ok: creditGaps === 0, detail: creditGaps ? `${creditGaps} ${creditGaps === 1 ? 'gap' : 'gaps'} against the statements` : credits.tcs.length || credits.tds.length ? 'no gaps' : 'nothing deducted yet' },
    { item: 'Margins positive', ok: !margins || margins.negative.length === 0, detail: margins ? `${margins.negative.length} ${margins.negative.length === 1 ? 'SKU' : 'SKUs'} losing money in ${marketplaceMonth}` : 'no marketplace orders' },
    ...(inventory ? [{ item: 'Inventory valued', ok: Boolean(inventory.latest) && inventory.latest.asOf.slice(0, 7) >= day.slice(0, 7), detail: inventory.latest ? `last valued ${inventory.latest.asOf} at ${inventory.latest.value}${Math.abs(inventory.unposted) >= 0.005 ? `, ${Math.abs(inventory.unposted)} ${inventory.unposted > 0 ? 'more' : 'less'} on hand now` : ''}` : 'never valued; say "value inventory"' }] : []),
    { item: 'Nothing high-severity open', ok: (exceptions.bySeverity.high || 0) === 0 && (exceptions.bySeverity.critical || 0) === 0, detail: `${exceptions.count} open, ${(exceptions.bySeverity.high || 0) + (exceptions.bySeverity.critical || 0)} high` },
  ];
  const needsYou = checklist.filter((row) => !row.ok);
  return {
    ok: true,
    data: {
      day,
      status: needsYou.length ? 'needs you' : 'closed',
      checklist,
      needsYou: needsYou.map((row) => row.item),
      sales,
      purchases,
      expenses,
      cash: { bank: cash.bank, cash: cash.cash, source: cash.source, readingOn: cash.readingOn },
      receivable,
      exceptions,
      settlements: { imported: settlements.length, unmatched: unmatched.length, short: short.length, latest: latestSettlement },
      credits: { gaps: creditGaps, tcsAvailable: credits.totals.tcsAvailable },
      margins: margins ? { month: marketplaceMonth, net: margins.totals.net, margin: margins.totals.margin, negative: margins.negative.length } : null,
    },
  };
}

export function closeWords(data, money) {
  const lines = [`Books for ${data.day}: ${data.status === 'closed' ? 'closed, nothing needs you' : `${data.needsYou.length} ${data.needsYou.length === 1 ? 'item needs' : 'items need'} you`}.`];
  for (const row of data.checklist) lines.push(`${row.ok ? '✓' : '!'} ${row.item}: ${row.detail}`);
  lines.push(`Sales this month ${money(data.sales.monthTotal)}; purchases and expenses ${money(round2(data.purchases.monthTotal + data.expenses.monthTotal))}; customers owe ${money(data.receivable)}; bank ${money(data.cash.bank)} and cash ${money(data.cash.cash)}${data.cash.source === 'recorded' ? ' as recorded (no bank balance given yet)' : ''}.`);
  if (data.margins) lines.push(`Marketplace margin for ${data.margins.month}: ${money(data.margins.margin)} on net sales ${money(data.margins.net)}.`);
  if (data.exceptions.count) lines.push(`${data.exceptions.count} open ${data.exceptions.count === 1 ? 'exception' : 'exceptions'}, ${money(data.exceptions.moneyAtRisk)} at risk.`);
  return lines.join('\n');
}
