const MAX_ROWS_PER_FORM = 500;
const MAX_LINES = 20000;

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^﻿/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      if (rows.length > MAX_LINES) break;
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows.map((items) => items.map((value) => value.trim()));
}

const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const SALE_COLUMNS = Object.freeze({
  description: ['description', 'descriptionofproperty', 'security', 'securitydescription', 'symbol', 'asset', 'currencyname', 'name', '1adescriptionofproperty'],
  dateAcquired: ['dateacquired', 'acquired', 'acquireddate', 'opendate', 'purchasedate', 'datepurchased', '1bdateacquired'],
  dateSold: ['datesold', 'sold', 'solddate', 'closedate', 'saledate', 'datesoldordisposed', 'dateofsale', '1cdatesoldordisposed'],
  proceeds: ['proceeds', 'grossproceeds', 'salesproceeds', 'totalproceeds', 'proceedsusd', '1dproceeds'],
  costBasis: ['costbasis', 'cost', 'basis', 'costorotherbasis', 'adjustedcostbasis', 'costbasisusd', '1ecostorotherbasis'],
  washSaleLossDisallowed: ['washsalelossdisallowed', 'washsale', 'washsaledisallowed', 'disallowedloss', '1gwashsalelossdisallowed'],
  term: ['term', 'holdingperiod', 'shortorlongterm', 'type', 'gaintype', 'termtype'],
  box: ['box', '8949box', 'form8949box', 'checkbox'],
  basisReportedToIrs: ['basisreportedtoirs', 'covered', 'coveredsecurity', 'noncovered', 'basisreported'],
  federalWithheld: ['federalincometaxwithheld', 'federalwithheld', 'taxwithheld'],
});

const TRADE_COLUMNS = Object.freeze({
  date: ['timestamp', 'date', 'datetime', 'time', 'transactiondate', 'tradedate'],
  type: ['transactiontype', 'type', 'side', 'action', 'operation'],
  asset: ['asset', 'currency', 'coin', 'symbol', 'pair', 'market'],
  quantity: ['quantitytransacted', 'quantity', 'amount', 'qty', 'size', 'units'],
  price: ['spotpriceattransaction', 'price', 'priceusd', 'unitprice', 'rate'],
  total: ['totalinclusiveoffeesandorspread', 'total', 'totalusd', 'value', 'usdvalue', 'subtotal', 'notional'],
  fee: ['feesandorspread', 'fees', 'fee', 'feeusd', 'commission'],
});

function mapColumns(header, columns) {
  const keys = header.map(key);
  const out = {};
  for (const [field, names] of Object.entries(columns)) {
    const at = names.map((name) => keys.indexOf(name)).find((index) => index >= 0);
    if (at !== undefined) out[field] = at;
  }
  return out;
}

function findHeader(rows, columns, required) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const map = mapColumns(rows[index], columns);
    if (required.every((field) => map[field] !== undefined)) return { index, map };
  }
  return null;
}

function amount(value) {
  if (value === undefined || value === null) return null;
  let text = String(value).trim();
  if (!text || text === '-' || /^n\/?a$/i.test(text) || /^various$/i.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  text = text.replace(/[()$,\s]/g, '').replace(/^-/, '').replace(/USD$/i, '');
  const number = Number(text);
  if (!Number.isFinite(number)) return NaN;
  return Math.round((negative ? -number : number) * 100) / 100;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(value) {
  const text = String(value || '').trim();
  if (!text || /^various$/i.test(text) || /^inherited$/i.test(text)) return '';
  let year;
  let month;
  let day;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (hit) [year, month, day] = [hit[1], hit[2], hit[3]];
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text))) [month, day, year] = [hit[1], hit[2], hit[3].length === 2 ? `20${hit[3]}` : hit[3]];
  else if ((hit = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(text))) [month, day, year] = [MONTHS[hit[1].toLowerCase()], hit[2], hit[3]];
  else return null;
  const out = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const at = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === out ? out : null;
}

function longTerm(acquired, sold) {
  if (!acquired || !sold) return null;
  const [year, month, day] = acquired.split('-').map(Number);
  const anniversary = new Date(Date.UTC(year + 1, month - 1, day));
  return new Date(`${sold}T00:00:00Z`) > anniversary;
}

function termOf(raw, box, acquired, sold) {
  const text = key(raw);
  if (text.startsWith('short') || text === 'st' || text === 's') return 'short';
  if (text.startsWith('long') || text === 'lt' || text === 'l') return 'long';
  const letter = String(box || '').trim().toUpperCase().replace(/^BOX\s*/, '');
  if (['A', 'B', 'C', 'G', 'H', 'I'].includes(letter)) return 'short';
  if (['D', 'E', 'F', 'J', 'K', 'L'].includes(letter)) return 'long';
  const held = longTerm(acquired, sold);
  return held === null ? null : held ? 'long' : 'short';
}

function coveredOf(raw, box, columnName) {
  const letter = String(box || '').trim().toUpperCase().replace(/^BOX\s*/, '');
  if (['A', 'D', 'G', 'J'].includes(letter)) return true;
  if (['B', 'E', 'C', 'F', 'H', 'I', 'K', 'L'].includes(letter)) return false;
  const text = key(raw);
  if (!text) return undefined;
  const yes = ['yes', 'y', 'true', 'covered', '1'].includes(text);
  return columnName === 'noncovered' ? !yes : yes;
}

function chunk(rows) {
  const out = [];
  for (let index = 0; index < rows.length; index += MAX_ROWS_PER_FORM) out.push(rows.slice(index, index + MAX_ROWS_PER_FORM));
  return out;
}

function totals(rows) {
  const sum = (field) => Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
  const gain = (term) => Math.round(rows.filter((row) => row.term === term).reduce((total, row) => total + row.proceeds - row.costBasis + Number(row.washSaleLossDisallowed || 0), 0) * 100) / 100;
  return { sales: rows.length, proceeds: sum('proceeds'), costBasis: sum('costBasis'), washSaleLossDisallowed: sum('washSaleLossDisallowed'), shortTermGain: gain('short'), longTermGain: gain('long') };
}

function salesFromRows(rows, header, problems) {
  const map = header.map;
  const columnNames = rows[header.index].map(key);
  const coveredColumn = map.basisReportedToIrs !== undefined ? columnNames[map.basisReportedToIrs] : '';
  const sales = [];
  for (let index = header.index + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const cell = (field) => (map[field] === undefined ? '' : row[map[field]]);
    const label = `Row ${index + 1}`;
    if (/^(total|subtotal|grand total)/i.test(String(row[0] || '')) || (cell('proceeds') === '' && cell('costBasis') === '')) continue;
    const proceeds = amount(cell('proceeds'));
    const costBasis = amount(cell('costBasis'));
    const wash = map.washSaleLossDisallowed === undefined ? 0 : amount(cell('washSaleLossDisallowed'));
    const withheld = map.federalWithheld === undefined ? 0 : amount(cell('federalWithheld'));
    const acquired = isoDate(cell('dateAcquired'));
    const sold = isoDate(cell('dateSold'));
    if (Number.isNaN(proceeds) || proceeds === null) { problems.push(`${label}: proceeds is not an amount.`); continue; }
    if (Number.isNaN(costBasis)) { problems.push(`${label}: cost basis is not an amount.`); continue; }
    if (costBasis !== null && costBasis < 0) { problems.push(`${label}: cost basis cannot be negative.`); continue; }
    if (Number.isNaN(wash) || Number.isNaN(withheld)) { problems.push(`${label}: wash sale or withholding is not an amount.`); continue; }
    if (acquired === null || sold === null) { problems.push(`${label}: a date is not a date MyCA can read; use YYYY-MM-DD or MM/DD/YYYY.`); continue; }
    const term = termOf(cell('term'), cell('box'), acquired, sold);
    if (!term) { problems.push(`${label}: short or long term is missing and cannot be worked out from the dates.`); continue; }
    const covered = coveredOf(cell('basisReportedToIrs'), cell('box'), coveredColumn);
    sales.push({
      description: String(cell('description') || 'Sale').slice(0, 60),
      ...(acquired ? { dateAcquired: acquired } : {}),
      ...(sold ? { dateSold: sold } : {}),
      proceeds,
      costBasis: costBasis === null ? 0 : costBasis,
      ...(wash ? { washSaleLossDisallowed: Math.abs(wash) } : {}),
      term,
      ...(covered === undefined ? {} : { basisReportedToIrs: covered }),
      ...(withheld ? { federalWithheld: Math.abs(withheld) } : {}),
      ...(costBasis === null ? { basisMissing: true } : {}),
    });
  }
  return sales;
}

const BUY_SIDES = new Set(['buy', 'bought', 'purchase', 'advancedtradebuy']);
const INCOME_SIDES = new Set(['reward', 'rewardsincome', 'staking', 'stakingincome', 'learningreward', 'income', 'airdrop', 'interest']);
const SELL_SIDES = new Set(['sell', 'sold', 'advancedtradesell', 'sale', 'spend']);

function tradeSide(raw) {
  const text = key(raw);
  if (BUY_SIDES.has(text)) return 'buy';
  if (INCOME_SIDES.has(text)) return 'income';
  if (SELL_SIDES.has(text)) return 'sell';
  return null;
}

function cryptoSales(rows, header, problems) {
  const map = header.map;
  const lots = new Map();
  const sales = [];
  const income = [];
  const events = [];
  const unread = new Map();
  for (let index = header.index + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const cell = (field) => (map[field] === undefined ? '' : row[map[field]]);
    const label = `Row ${index + 1}`;
    const side = tradeSide(cell('type'));
    if (!side) {
      const kind = String(cell('type') || '').trim().slice(0, 30);
      if (kind) unread.set(kind, (unread.get(kind) || 0) + 1);
      continue;
    }
    const date = isoDate(cell('date'));
    const asset = String(cell('asset') || '').toUpperCase().split(/[-/]/)[0];
    const quantity = Math.abs(Number(String(cell('quantity')).replace(/,/g, '')));
    const fee = Math.abs(amount(cell('fee')) || 0);
    let value = map.total === undefined ? null : amount(cell('total'));
    const fromTotal = value !== null && !Number.isNaN(value);
    if (!fromTotal) {
      const price = amount(cell('price'));
      value = price === null || Number.isNaN(price) ? NaN : Math.round(price * quantity * 100) / 100;
    }
    value = Math.abs(value);
    if (!date || !asset || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(value)) { problems.push(`${label}: needs a date, asset, quantity and a USD price or total.`); continue; }
    events.push({ row: index + 1, date, side, asset, quantity, value, fee, fromTotal });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row));
  for (const event of events) {
    const queue = lots.get(event.asset) || [];
    lots.set(event.asset, queue);
    if (event.side === 'buy' || event.side === 'income') {
      const cost = event.side === 'buy' && !event.fromTotal ? event.value + event.fee : event.value;
      queue.push({ date: event.date, quantity: event.quantity, cost });
      if (event.side === 'income') income.push({ date: event.date, asset: event.asset, quantity: event.quantity, value: event.value });
      continue;
    }
    let left = event.quantity;
    const proceedsTotal = Math.max(0, event.fromTotal ? event.value : event.value - event.fee);
    while (left > 1e-12) {
      const lot = queue[0];
      if (!lot) {
        problems.push(`Row ${event.row}: sold ${event.asset} that was not bought earlier in this file; the cost basis of ${Math.round(left * 1e8) / 1e8} ${event.asset} is unknown and taken as zero.`);
        sales.push({ description: `${Math.round(left * 1e8) / 1e8} ${event.asset}`, dateSold: event.date, proceeds: Math.round(proceedsTotal * (left / event.quantity) * 100) / 100, costBasis: 0, term: 'short', basisReportedToIrs: false, basisMissing: true });
        break;
      }
      const used = Math.min(left, lot.quantity);
      const share = used / lot.quantity;
      const basis = lot.cost * share;
      sales.push({ description: `${Math.round(used * 1e8) / 1e8} ${event.asset}`, dateAcquired: lot.date, dateSold: event.date, proceeds: Math.round(proceedsTotal * (used / event.quantity) * 100) / 100, costBasis: Math.round(basis * 100) / 100, term: longTerm(lot.date, event.date) ? 'long' : 'short', basisReportedToIrs: false });
      lot.quantity -= used;
      lot.cost -= basis;
      left -= used;
      if (lot.quantity <= 1e-12) queue.shift();
    }
  }
  return { sales, income, unread: [...unread].map(([type, rows]) => ({ type, rows })) };
}

export function usBrokerageCsv(state, args = {}) {
  const text = String(args.csv || '');
  if (!text.trim()) return { ok: false, error: 'CSV_REQUIRED', hint: 'Paste or upload the CSV your broker or exchange exports.' };
  if (text.length > 5_000_000) return { ok: false, error: 'CSV_TOO_LARGE', hint: 'Split the file by year; MyCA reads up to 5 MB at a time.' };
  const rows = parseCsvText(text);
  const problems = [];
  const payer = String(args.payer || '').slice(0, 80);
  const sales = findHeader(rows, SALE_COLUMNS, ['proceeds', 'costBasis']);
  let found;
  let format;
  let income = [];
  let unread = [];
  if (sales) {
    format = 'realized-sales';
    found = salesFromRows(rows, sales, problems);
  } else {
    const trades = findHeader(rows, TRADE_COLUMNS, ['date', 'type', 'asset', 'quantity']);
    if (!trades) return { ok: false, error: 'CSV_COLUMNS_UNKNOWN', hint: 'MyCA reads a broker 1099-B or Form 8949 export (proceeds and cost basis columns) or an exchange trade history (date, type, asset, quantity, price or total).' };
    format = 'crypto-trades';
    const out = cryptoSales(rows, trades, problems);
    found = out.sales;
    income = out.income;
    unread = out.unread;
  }
  const taxYear = String(args.taxYear || '').trim();
  const outside = taxYear ? found.filter((row) => row.dateSold && row.dateSold.slice(0, 4) !== taxYear) : [];
  const kept = taxYear ? found.filter((row) => !row.dateSold || row.dateSold.slice(0, 4) === taxYear) : found;
  const notes = [];
  if (outside.length) notes.push(`${outside.length} sale${outside.length === 1 ? ' was' : 's were'} in another year and left out.`);
  if (format === 'crypto-trades') notes.push('Cost basis is matched first in, first out within this file only; buys made on other exchanges or before the file starts are missing and show as zero basis. Compare with the exchange\'s Form 1099-DA.');
  if (unread.length) notes.push(`Rows of type ${unread.map((item) => `${item.type} (${item.rows})`).join(', ')} were not read. Sends and receives between your own wallets are not sales, but a convert or crypto-to-crypto trade is a sale of the asset given up: add it yourself.`);
  if (income.length) notes.push(`${income.length} reward or staking receipt${income.length === 1 ? ' is' : 's are'} ordinary income at their value when received; add them as other income.`);
  if (kept.some((row) => row.basisMissing)) notes.push('Some sales have no cost basis; enter it from your records or the gain is overstated.');
  const forms = chunk(kept.map(({ basisMissing, ...row }) => row)).map((transactions, index, list) => ({ kind: '1099-B', payer: payer || (format === 'crypto-trades' ? 'Digital asset exchange' : 'Broker'), ...(list.length > 1 ? { part: index + 1 } : {}), fields: { transactions } }));
  return {
    ok: true,
    data: {
      format,
      taxYear: taxYear || null,
      forms,
      totals: totals(kept),
      rewardIncome: Math.round(income.filter((item) => !taxYear || item.date.slice(0, 4) === taxYear).reduce((sum, item) => sum + item.value, 0) * 100) / 100,
      problems: problems.slice(0, 50),
      skippedRows: problems.length,
      notes,
      next: 'Add each form with add_us_tax_form (kind 1099-B, fields.transactions) so the sales flow to Form 8949 and Schedule D.',
    },
  };
}

export function usBrokerageCsvWords(data) {
  const usd = (value) => `${value < 0 ? '-' : ''}$${Math.abs(Math.round(Number(value || 0))).toLocaleString('en-US')}`;
  const t = data.totals;
  return `Read ${t.sales} sale${t.sales === 1 ? '' : 's'} (${data.format === 'crypto-trades' ? 'crypto trades matched first in, first out' : 'broker export'}): short-term gain ${usd(t.shortTermGain)}, long-term gain ${usd(t.longTermGain)}.${data.skippedRows ? ` ${data.skippedRows} row${data.skippedRows === 1 ? '' : 's'} could not be read.` : ''}${data.notes.length ? ` ${data.notes.join(' ')}` : ''}`;
}
