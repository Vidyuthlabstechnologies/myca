import { rules } from './sprint-load.mjs';

const HEADS = ['igst', 'cgst', 'sgst'];
const SETOFF = 'gst.setoff.order';
const INTEREST = 'gst.interest.rate';
const LATE_FEE = { 'GSTR-3B': 'gst.late-fee.gstr3b', 'GSTR-1': 'gst.late-fee.gstr1' };

const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
const toRupees = (paise) => paise / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function ruleOn(id, date) {
  const found = rules.rule(id, date);
  if (!found.ok) return fail('GST_RULE_MISSING', { ruleId: id, onDate: date, detail: found.error });
  return { ok: true, value: found.record.value, used: `${found.record.id}@${found.record.effectiveFrom}`, attested: (found.record.attestations || []).length > 0 };
}

function headsInPaise(heads) {
  return Object.fromEntries(HEADS.map((head) => [head, Math.max(0, toPaise(heads?.[head]))]));
}

function headsInRupees(heads) {
  const out = Object.fromEntries(HEADS.map((head) => [head, toRupees(heads[head])]));
  out.total = toRupees(HEADS.reduce((sum, head) => sum + heads[head], 0));
  return out;
}

function take(from, need, left) {
  const amount = Math.min(from[left], Math.max(0, need));
  from[left] -= amount;
  return amount;
}

export function setOff({ output, credit, onDate }) {
  const order = ruleOn(SETOFF, onDate);
  if (!order.ok) return order;
  const out = headsInPaise(output);
  const cr = headsInPaise(credit);
  const used = { igst: { igst: 0, cgst: 0, sgst: 0 }, cgst: { cgst: 0, igst: 0 }, sgst: { sgst: 0, igst: 0 } };

  used.igst.igst = take(cr, out.igst, 'igst');
  out.igst -= used.igst.igst;
  if (order.value.igstRemainder === 'cgst-then-sgst') {
    used.igst.cgst = take(cr, out.cgst, 'igst');
    out.cgst -= used.igst.cgst;
    used.igst.sgst = take(cr, out.sgst, 'igst');
    out.sgst -= used.igst.sgst;
  } else {
    used.igst.cgst = take(cr, out.cgst - cr.cgst, 'igst');
    used.igst.sgst = take(cr, out.sgst - cr.sgst, 'igst');
    used.igst.cgst += take(cr, out.cgst - used.igst.cgst, 'igst');
    used.igst.sgst += take(cr, out.sgst - used.igst.sgst, 'igst');
    out.cgst -= used.igst.cgst;
    out.sgst -= used.igst.sgst;
  }
  for (const head of ['cgst', 'sgst']) {
    for (const target of order.value.crossHeads[head]) {
      const amount = take(cr, out[target], head);
      used[head][target] += amount;
      out[target] -= amount;
    }
  }
  const usedTotal = HEADS.reduce((sum, head) => sum + Object.values(used[head]).reduce((inner, value) => inner + value, 0), 0);
  return {
    ok: true,
    used: Object.fromEntries(HEADS.map((head) => [head, Object.fromEntries(Object.entries(used[head]).map(([target, value]) => [target, toRupees(value)]))])),
    creditUsed: toRupees(usedTotal),
    cash: headsInRupees(out),
    carried: headsInRupees(cr),
    ruleUsed: order.used,
    attested: order.attested,
  };
}

export function daysBetween(from, to) {
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86400000);
}

export function interestOn({ cash, dueDate, payOn }) {
  const days = Math.max(0, daysBetween(dueDate, payOn));
  const rate = ruleOn(INTEREST, dueDate);
  if (!rate.ok) return rate;
  const amount = days === 0 ? 0 : Math.round((toPaise(cash) * rate.value.percentPerAnnum * days) / (100 * rate.value.daysInYear));
  return { ok: true, days, ratePercent: rate.value.percentPerAnnum, interest: toRupees(amount), ruleUsed: rate.used, attested: rate.attested };
}

function capFor(caps, turnoverPaise) {
  if (turnoverPaise == null) return { cap: caps[caps.length - 1], assumedTop: caps.length > 1 };
  const cap = caps.find((row) => row.turnoverUpToPaise === null || turnoverPaise <= row.turnoverUpToPaise) || caps[caps.length - 1];
  return { cap, assumedTop: false };
}

export function lateFeeFor({ returnType, period, nil, turnover, dueDate, payOn }) {
  const id = LATE_FEE[returnType];
  if (!id) return fail('UNKNOWN_RETURN', { returnType });
  const fee = ruleOn(id, `${period}-01`);
  if (!fee.ok) return fee;
  const days = Math.max(0, daysBetween(dueDate, payOn));
  const kind = nil ? 'nil' : 'normal';
  const turnoverPaise = turnover == null || turnover === '' || !(Number(turnover) >= 0) ? null : toPaise(turnover);
  const { cap, assumedTop } = capFor(fee.value.capPaise, turnoverPaise);
  const amount = Math.min(days * fee.value.perDayPaise[kind], cap[kind]);
  return { ok: true, days, perDay: toRupees(fee.value.perDayPaise[kind]), cap: toRupees(cap[kind]), lateFee: toRupees(amount), nil: Boolean(nil), turnoverAssumedAboveCaps: assumedTop, ruleUsed: fee.used, attested: fee.attested };
}
