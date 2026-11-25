// Capital gains for a resident individual or HUF: holding period, grandfathering, the rates that changed on 23 July 2024,
// the Rs 1.25 lakh section 112A exemption, and set-off of the year's and earlier years' losses.
// Whole rupees throughout. Scope and open points are in docs/product/INDIA-ITR-BUILDER.md.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CUTOFF = '2024-07-23'; // transfers on or after this date: new rates and holding periods
const GRANDFATHER_DATE = '2018-02-01';
const SPECIFIED_MF_DATE = '2023-04-01';
const EXEMPT_112A = 125000;

const num = (value) => Math.round(Number(value) || 0);
const KINDS = new Set(['listed-equity', 'equity-mf', 'property', 'unlisted-shares', 'gold', 'debt-mf', 'bond', 'other']);

function monthsHeld(buy, sell) {
  const a = new Date(`${buy}T00:00:00Z`);
  const b = new Date(`${sell}T00:00:00Z`);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

// Long term when held for more than the period: 12 months for listed securities and equity fund units;
// 24 months for property, unlisted shares and the rest after 23 July 2024; 36 months for gold, debt fund units and bonds before it.
export function holdingTest(txn) {
  const after = txn.sellDate >= CUTOFF;
  const listed = txn.kind === 'listed-equity' || txn.kind === 'equity-mf';
  let months;
  if (listed) months = 12;
  else if (txn.kind === 'property' || txn.kind === 'unlisted-shares') months = 24;
  else months = after ? 24 : 36;
  const held = monthsHeld(txn.buyDate, txn.sellDate);
  return { months, held, longTerm: txn.sellDate > addMonths(txn.buyDate, months) };
}

function addMonths(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function classify(txn, index = 0) {
  if (!KINDS.has(txn.kind)) return { error: { path: `transactions[${index}].kind`, message: `kind must be one of ${[...KINDS].join(', ')}.` } };
  if (!ISO.test(String(txn.buyDate || '')) || !ISO.test(String(txn.sellDate || ''))) return { error: { path: `transactions[${index}]`, message: 'buyDate and sellDate (YYYY-MM-DD) are required.' } };
  if (txn.sellDate < txn.buyDate) return { error: { path: `transactions[${index}]`, message: 'The sale date is before the purchase date.' } };
  const sale = num(txn.saleValue);
  const expenses = num(txn.transferExpenses);
  const improvement = num(txn.improvementCost);
  let cost = num(txn.cost);
  const stt = txn.stt !== false && (txn.kind === 'listed-equity' || txn.kind === 'equity-mf');
  const test = holdingTest(txn);
  // Specified mutual funds bought on or after 1 April 2023 and unlisted bonds are deemed short term (section 50AA).
  const deemedShort = (txn.kind === 'debt-mf' && txn.buyDate >= SPECIFIED_MF_DATE) || (txn.kind === 'bond' && txn.listed !== true && txn.sellDate >= CUTOFF);
  const longTerm = deemedShort ? false : test.longTerm;
  const notes = [];
  // Equity bought before 1 Feb 2018: cost is the higher of actual cost and the lower of 31 Jan 2018 value and sale value.
  if (stt && longTerm && txn.buyDate < GRANDFATHER_DATE && txn.fmv31Jan2018 != null) {
    cost = Math.max(cost, Math.min(num(txn.fmv31Jan2018), sale));
  } else if (stt && longTerm && txn.buyDate < GRANDFATHER_DATE) {
    notes.push('Bought before 1 Feb 2018 without the 31 Jan 2018 value, so actual cost was used; the grandfathered cost may be higher.');
  }
  const deductions = cost + improvement + expenses;
  const gain = sale - deductions;
  const after = txn.sellDate >= CUTOFF;
  let bucket;
  if (!longTerm) bucket = stt ? (after ? 'stcg111A_AE' : 'stcg111A_BE') : 'stcgOther';
  else if (stt) bucket = after ? 'ltcg112A_AE' : 'ltcg112A_BE';
  else bucket = after ? 'ltcgOther_AE' : 'ltcgOther_BE';
  return { name: txn.name || txn.kind, kind: txn.kind, buyDate: txn.buyDate, sellDate: txn.sellDate, longTerm, deemedShort, heldMonths: test.held, sale, cost, improvement, expenses, gain, bucket, after, indexedCost: txn.indexedCost == null ? null : num(txn.indexedCost), notes };
}

const SHORT = ['stcg111A_BE', 'stcg111A_AE', 'stcgOther'];
const LONG = ['ltcg112A_BE', 'ltcg112A_AE', 'ltcgOther_BE', 'ltcgOther_AE'];

// transactions: see classify(); broughtForward: { stcl, ltcl } from earlier years (already within the 8-year limit)
export function computeCapitalGains({ transactions = [], broughtForward = {} } = {}) {
  const rows = [];
  const problems = [];
  transactions.forEach((txn, index) => {
    const row = classify(txn, index);
    if (row.error) problems.push(row.error);
    else rows.push(row);
  });
  const buckets = Object.fromEntries([...SHORT, ...LONG].map((key) => [key, 0]));
  for (const row of rows) buckets[row.bucket] += row.gain;

  // Property bought before 23 July 2024 and sold after: the lower of 12.5% without indexation and 20% with indexation.
  let indexationChoice = [];
  for (const row of rows) {
    if (row.bucket === 'ltcgOther_AE' && row.kind === 'property' && row.buyDate < CUTOFF) {
      if (row.indexedCost == null) {
        row.notes.push('Bought before 23 July 2024: you may pick 20% with indexation instead of 12.5%. Give indexedCost (cost after indexation) to compare.');
      } else {
        const flat = Math.max(0, row.gain) * 0.125;
        const indexed = Math.max(0, row.sale - row.indexedCost - row.expenses) * 0.2;
        row.indexationChosen = indexed < flat;
        indexationChoice.push({ name: row.name, flatTax: Math.round(flat), indexedTax: Math.round(indexed), chosen: indexed < flat ? 'indexed' : 'flat' });
        if (indexed < flat) {
          // taxed at 20% on the indexed gain: moved to the 20% bucket
          buckets.ltcgOther_AE -= row.gain;
          buckets.ltcgOther_BE += row.sale - row.indexedCost - row.expenses;
          row.bucket = 'ltcgOther_BE';
          row.gain = row.sale - row.indexedCost - row.expenses;
        }
      }
    }
  }

  const original = { ...buckets };
  const used = { stcl: 0, ltcl: 0, bfStcl: 0, bfLtcl: 0 };
  // Losses of the year: short-term loss against any gain, long-term loss against long-term gains only.
  const order = {
    short: ['stcgOther', 'stcg111A_AE', 'stcg111A_BE', 'ltcgOther_BE', 'ltcgOther_AE', 'ltcg112A_AE', 'ltcg112A_BE'],
    long: ['ltcgOther_BE', 'ltcgOther_AE', 'ltcg112A_AE', 'ltcg112A_BE'],
  };
  const pool = (list) => list.reduce((total, key) => total + Math.max(0, buckets[key]), 0);
  const absorb = (loss, list) => {
    let left = loss;
    for (const key of list) {
      if (left <= 0) break;
      const take = Math.min(left, Math.max(0, buckets[key]));
      buckets[key] -= take;
      left -= take;
    }
    return loss - left;
  };
  const stcl = Math.max(0, -SHORT.reduce((total, key) => total + Math.min(0, buckets[key]), 0));
  const ltcl = Math.max(0, -LONG.reduce((total, key) => total + Math.min(0, buckets[key]), 0));
  for (const key of [...SHORT, ...LONG]) if (buckets[key] < 0) buckets[key] = 0;
  used.stcl = absorb(stcl, order.short);
  used.ltcl = absorb(ltcl, order.long);
  const bfShort = Math.max(0, num(broughtForward.stcl));
  const bfLong = Math.max(0, num(broughtForward.ltcl));
  used.bfStcl = absorb(bfShort, order.short);
  used.bfLtcl = absorb(bfLong, order.long);
  const carryForward = { stcl: stcl - used.stcl + bfShort - used.bfStcl, ltcl: ltcl - used.ltcl + bfLong - used.bfLtcl };

  // Section 112A: the first Rs 1.25 lakh of the year's gains is exempt. Applied to the gains taxed at 10% first (the cautious order).
  let exemption = EXEMPT_112A;
  const exempted = {};
  for (const key of ['ltcg112A_BE', 'ltcg112A_AE']) {
    const take = Math.min(exemption, buckets[key]);
    exempted[key] = take;
    buckets[key] -= take;
    exemption -= take;
  }
  const notes = [];
  if (rows.some((row) => row.bucket.startsWith('ltcg112A') && original.ltcg112A_BE > 0 && original.ltcg112A_AE > 0)) {
    notes.push('The Rs 1.25 lakh section 112A exemption was applied first to gains from transfers before 23 July 2024 (taxed at 10%), which gives the higher tax. A CA should confirm the order the portal applies.');
  }
  const specialIncome = {
    stcg111A_BE: buckets.stcg111A_BE, stcg111A_AE: buckets.stcg111A_AE,
    ltcg112A_BE: buckets.ltcg112A_BE, ltcg112A_AE: buckets.ltcg112A_AE,
    ltcgOther_BE: buckets.ltcgOther_BE, ltcgOther_AE: buckets.ltcgOther_AE,
  };
  return {
    ok: problems.length === 0,
    problems,
    rows,
    original,
    losses: used,
    carryForward,
    exemption112A: EXEMPT_112A - exemption,
    exempted,
    normalRateGain: buckets.stcgOther,
    specialIncome,
    totalTaxableGain: Object.values(specialIncome).reduce((a, b) => a + b, 0) + buckets.stcgOther,
    indexationChoice,
    notes,
  };
}

export const SPECIAL_RATES = { stcg111A_BE: 15, stcg111A_AE: 20, ltcg112A_BE: 10, ltcg112A_AE: 12.5, ltcgOther_BE: 20, ltcgOther_AE: 12.5 };
