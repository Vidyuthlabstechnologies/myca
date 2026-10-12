import { tdsMonitor, rules } from './sprint-load.mjs';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { createTransfers, paise } from './ledger.mjs';
import { deadlineRun } from './deadline-run.mjs';

export const TDS_SECTIONS = ['194A', '194C', '194I', '194J'];
const PAN = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const CHALLAN = /^[A-Z0-9]{5,30}$/;
const CATEGORY = { professional: 'professional services', technical: 'technical services', director: 'director remuneration' };
const ASSET = { building: 'land, building or furniture', plant: 'plant, machinery or equipment' };
const TDS_PAYABLE = 2200;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function payeeTypeOf(pan) {
  const kind = pan.charAt(3);
  if (kind === 'P') return 'individual';
  if (kind === 'H') return 'huf';
  return 'other';
}

export function wantsTds(args = {}) {
  return args.tdsSection != null && args.tdsSection !== '';
}

function terms(args) {
  const section = String(args.tdsSection || '').trim().toUpperCase();
  if (!TDS_SECTIONS.includes(section)) return fail('BAD_TDS_SECTION', { section });
  const category = String(args.tdsCategory || '').trim().toLowerCase();
  const asset = String(args.tdsAsset || '').trim().toLowerCase();
  if (section === '194J' && !CATEGORY[category]) return fail('TDS_CATEGORY_REQUIRED');
  if (section === '194I' && !ASSET[asset]) return fail('TDS_ASSET_REQUIRED');
  const pan = String(args.payeePan || '').replace(/\s+/g, '').toUpperCase();
  if (!pan) return fail('PAN_REQUIRED');
  if (!PAN.test(pan)) return fail('BAD_PAN', { pan });
  return { ok: true, section, category: section === '194J' ? category : '', asset: section === '194I' ? asset : '', pan };
}

function unreviewed(used) {
  return used.some((key) => {
    const [id, from] = key.split('@');
    const found = rules.rule(id, from);
    return !found.ok || !(found.record.attestations || []).length;
  });
}

function depositByFor(state, date) {
  const row = (deadlineRun(state, { asOfDate: date }).deadlines || []).find((item) => item.clientId === 'SELF' && item.returnType === 'TDS_DEPOSIT' && item.period === date.slice(0, 7));
  return row ? row.dueDate : '';
}

export function planTds(state, args = {}, { date, basis, payable, payee, beforeGst = false }) {
  if (!state.company?.tdsDeductor) return fail('NOT_A_DEDUCTOR');
  const t = terms(args);
  if (!t.ok) return t;
  const fy = rules.fyOf(date);
  if (!fy) return fail('INVALID_DATE');
  const same = (entry) => entry.pan === t.pan && entry.section === t.section && entry.category === t.category && entry.fy === fy;
  const priors = (state.tdsEntries || []).filter(same);
  const payeeType = payeeTypeOf(t.pan);
  const payment = (entry) => ({ fy, payee: t.pan, section: t.section, date: entry.date, amount: entry.basis, payeeType, payerType: '', asset: t.asset, category: t.category });
  const flags = tdsMonitor.monitorTds({ payments: [...priors.map(payment), payment({ date, basis })], fy });
  if (flags.errors?.length) return fail('TDS_RULE_MISSING', { ruleId: flags.errors[0].ruleId || '', detail: flags.errors[0].error });
  const flag = flags.find((item) => item.payee === t.pan && item.section === t.section);
  const already = round2(priors.reduce((sum, entry) => sum + entry.tds, 0));
  const due = flag ? round2(flag.assumedTds - already) : 0;
  const tds = Math.max(0, Math.min(due, round2(payable)));
  const shortfall = round2(Math.max(0, due - tds));
  const used = flag ? flag.rulesUsed : [];
  return {
    ok: true,
    tds: {
      section: t.section,
      category: t.category,
      asset: t.asset,
      pan: t.pan,
      payee,
      fy,
      date,
      basis: round2(basis),
      beforeGst,
      tds,
      shortfall,
      rate: flag ? round2(flag.rate * 100) : 0,
      threshold: flag ? flag.threshold : null,
      crossed: Boolean(flag),
      kind: flag ? flag.kind : '',
      rulesUsed: used,
      unreviewed: used.length ? unreviewed(used) : false,
      depositBy: tds > 0 ? depositByFor(state, date) : '',
    },
  };
}

export function recordTdsEntry(state, tds, source) {
  state.tdsEntries = state.tdsEntries || [];
  const entry = { ...tds, source };
  delete entry.depositBy;
  state.tdsEntries.push(entry);
  return entry;
}

export function tdsWords(tds, net, who) {
  if (!tds.crossed || tds.tds <= 0) {
    return `No TDS yet under ${tds.section}: payments to ${tds.payee} this year are within the limit.`;
  }
  const lines = [`Deduct ${money(tds.tds)} TDS under ${tds.section} at ${tds.rate}% on ${money(tds.basis)}${tds.beforeGst ? ' before GST' : ''}; ${who} ${money(net)}.`];
  if (tds.kind === 'aggregate' && tds.tds > round2(tds.basis * tds.rate / 100) + 0.005) lines.push('This includes TDS on earlier payments this year, now that the yearly limit is crossed.');
  if (tds.shortfall > 0) lines.push(`${money(tds.shortfall)} more TDS is due on earlier payments; it will be taken from the next one.`);
  if (tds.depositBy) lines.push(`Deposit it with the government by ${tds.depositBy}.`);
  if (tds.unreviewed) lines.push('The TDS rates and limits come from MyCA\'s dated rules, which your CA has not reviewed yet.');
  return lines.join(' ');
}

function money(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function tdsPayableAccountId() {
  return TDS_PAYABLE;
}

export function planDeductor(state, args = {}) {
  const tan = String(args.tan || '').replace(/\s+/g, '').toUpperCase();
  if (!TAN.test(tan)) return fail('BAD_TAN', { tan });
  return { ok: true, tan, was: state.company?.tan || '' };
}

export function setDeductor(state, args = {}) {
  const plan = planDeductor(state, args);
  if (!plan.ok) return plan;
  state.company = { ...state.company, tdsDeductor: true, tan: plan.tan };
  return { ok: true, tan: plan.tan };
}

function balances(state) {
  const deducted = round2((state.tdsEntries || []).reduce((sum, entry) => sum + entry.tds, 0));
  const deposited = round2((state.tdsDeposits || []).reduce((sum, item) => sum + item.amount, 0));
  return { deducted, deposited, due: round2(deducted - deposited) };
}

export function planTdsDeposit(state, args = {}) {
  if (!state.company?.tdsDeductor) return fail('NOT_A_DEDUCTOR');
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  if (date > localToday()) return fail('FUTURE_DATE', { date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  const challan = String(args.challan || '').replace(/[\s/-]+/g, '').toUpperCase();
  if (!CHALLAN.test(challan)) return fail('BAD_CHALLAN');
  if ((state.tdsDeposits || []).some((item) => item.challan === challan)) return fail('CHALLAN_USED', { challan });
  const { due } = balances(state);
  if (due <= 0.005) return fail('NOTHING_DUE');
  const amount = args.amount == null || args.amount === '' ? due : round2(args.amount);
  if (!(amount > 0)) return fail('BAD_AMOUNT');
  if (amount > due + 0.005) return fail('MORE_THAN_DUE', { due });
  const mode = args.mode === 'cash' ? 'cash' : 'bank';
  return { ok: true, deposit: { date, amount, challan, mode }, due };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

export function recordTdsDeposit(state, args = {}) {
  const plan = planTdsDeposit(state, args);
  if (!plan.ok) return plan;
  const { deposit } = plan;
  const id = `TDSD-${String((state.tdsDeposits || []).length + 1).padStart(4, '0')}`;
  const posted = createTransfers(state.ledger, [
    { id: nextTransferId(state), debitAccountId: TDS_PAYABLE, creditAccountId: deposit.mode === 'cash' ? 1001 : 1002, amount: paise(deposit.amount), code: 'TDS-DEPOSIT', userData: deposit.date, invoiceId: id },
  ]);
  if (posted.some((result) => !result.ok)) return fail('LEDGER_REJECT', { posted });
  const record = { id, ...deposit, transferIds: posted.map((result) => result.id) };
  state.tdsDeposits = state.tdsDeposits || [];
  state.tdsDeposits.push(record);
  return { ok: true, deposit: record, left: round2(plan.due - deposit.amount) };
}

export function tdsSummary(state) {
  const totals = balances(state);
  const byMonth = new Map();
  for (const entry of state.tdsEntries || []) {
    if (entry.tds <= 0) continue;
    const month = entry.date.slice(0, 7);
    const row = byMonth.get(month) || { month, deducted: 0, depositBy: depositByFor(state, entry.date) };
    row.deducted = round2(row.deducted + entry.tds);
    byMonth.set(month, row);
  }
  return {
    ok: true,
    data: {
      deductor: Boolean(state.company?.tdsDeductor),
      tan: state.company?.tan || '',
      ...totals,
      months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
      entries: [...(state.tdsEntries || [])].reverse().slice(0, 50),
      deposits: [...(state.tdsDeposits || [])].reverse(),
    },
  };
}
