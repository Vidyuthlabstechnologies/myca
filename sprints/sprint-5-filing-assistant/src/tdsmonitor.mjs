import { parseAmount, r2 } from './core.mjs';
import { rule } from '../../statutory-rules/src/index.mjs';

function splitCsvLine(line) {
  const parts = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  parts.push(cur);
  return parts;
}

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], data: [] };
  return { headers: splitCsvLine(lines[0]).map(h => h.trim()), data: lines.slice(1) };
}

function makeErr(code, row, field, message) {
  return { code, row, field, message };
}

export function parsePayments(text) {
  if (!text || !text.trim()) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No data')] };
  const { headers, data } = csvRows(text);
  if (!headers.length) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No header')] };
  const rows = [];
  const errors = [];
  data.forEach((line, i) => {
    const vals = splitCsvLine(line);
    if (vals.length < headers.length || vals.every(v => !v.trim())) return;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] !== undefined ? vals[j].trim() : ''; });
    const amt = parseAmount(obj.amount);
    if (Number.isNaN(amt)) { errors.push(makeErr('BAD_AMOUNT', i + 1, 'amount', 'Invalid')); }
    rows.push({
      fy: obj.fy || '',
      payee: obj.payee || '',
      section: obj.section || '',
      date: obj.date || '',
      amount: Number.isNaN(amt) ? 0 : amt,
      payeeType: obj.payeeType || '',
      payerType: obj.payerType || '',
      senior: obj.senior || '',
      asset: obj.asset || '',
      category: obj.category || '',
    });
  });
  return { rows, errors };
}

const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? '').trim());
const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);

function fyStart(fy, date) {
  const match = /^(\d{4})-\d{2}$/.exec(String(fy || ''));
  if (match) return `${match[1]}-04-01`;
  const d = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  if (!d) return null;
  return Number(d[2]) >= 4 ? `${d[1]}-04-01` : `${Number(d[1]) - 1}-04-01`;
}

function need(id, onDate, used) {
  const found = rule(id, onDate);
  if (!found.ok) throw Object.assign(new Error(found.error), { code: found.error, ruleId: id });
  used.add(`${id}@${found.record.effectiveFrom}`);
  return found;
}

function ratePercent(id, onDate, used) {
  return need(id, onDate, used).value.basisPoints / 10000;
}

function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}

function evaluate(group, onDate) {
  const used = new Set();
  const amounts = group.payments.map((p) => p.amount);
  const total = sum(amounts);
  const first = group.payments[0] || {};
  const assumptions = [];
  let kind = '';
  let basis = 0;
  let threshold = 0;
  let rate = 0;
  if (group.section === '194A') {
    const bank = /^(bank|co-?op|post)/i.test(first.payerType);
    const senior = yes(first.senior);
    if (!first.payerType) assumptions.push('payer is not a bank, co-operative bank or post office');
    const id = bank ? `tds.194A.threshold.bank-coop-post-office.${senior ? 'senior-citizen' : 'other-payee'}` : 'tds.194A.threshold.other-payer';
    threshold = need(id, onDate, used).value.amountPaise;
    rate = ratePercent('tds.194A.rate', onDate, used);
    if (toPaise(total) > threshold) {
      kind = 'aggregate';
      basis = total;
    }
  } else if (group.section === '194C') {
    const single = need('tds.194C.threshold.single-sum', onDate, used).value.amountPaise;
    const aggregate = need('tds.194C.threshold.aggregate', onDate, used).value.amountPaise;
    const individual = /^(individual|huf)$/i.test(first.payeeType);
    if (!first.payeeType) assumptions.push('payee type unknown: the higher non-individual rate is used');
    rate = ratePercent(individual ? 'tds.194C.rate.individual-huf' : 'tds.194C.rate.other-payee', onDate, used);
    if (toPaise(total) > aggregate) {
      kind = 'aggregate';
      basis = total;
      threshold = aggregate;
    } else {
      const large = amounts.filter((a) => toPaise(a) > single);
      if (large.length) {
        kind = 'single';
        basis = sum(large);
        threshold = single;
      }
    }
  } else if (group.section === '194I') {
    const found = need('tds.194I.threshold', onDate, used);
    threshold = found.value.amountPaise;
    const plant = /plant|machin|equip/i.test(first.asset);
    if (!first.asset) assumptions.push('asset type unknown: the land/building rate is used');
    rate = ratePercent(plant ? 'tds.194I.rate.plant-machinery-equipment' : 'tds.194I.rate.land-building-furniture-fittings', onDate, used);
    if (found.record.basis === 'per_payee_per_month_or_part_of_month') {
      const byMonth = new Map();
      for (const p of group.payments) {
        const month = String(p.date || '').slice(0, 7) || 'undated';
        byMonth.set(month, (byMonth.get(month) || 0) + p.amount);
      }
      const over = [...byMonth.values()].filter((v) => toPaise(v) > threshold);
      if (over.length) {
        kind = 'monthly';
        basis = sum(over);
      }
    } else if (toPaise(total) > threshold) {
      kind = 'aggregate';
      basis = total;
    }
  } else if (group.section === '194J') {
    const technical = /tech|royalty|film|call/i.test(first.category);
    const director = /director/i.test(first.category);
    if (!first.category) assumptions.push('service category unknown: the professional-services rate is used');
    threshold = need(director ? 'tds.194J.threshold.director-remuneration' : 'tds.194J.threshold.per-category', onDate, used).value.amountPaise;
    rate = ratePercent(technical ? 'tds.194J.rate.technical-film-royalty-call-centre' : 'tds.194J.rate.other', onDate, used);
    if (toPaise(total) > threshold) {
      kind = 'aggregate';
      basis = total;
    }
  } else {
    return null;
  }
  if (!kind) return null;
  return {
    payee: group.payee,
    section: group.section,
    kind,
    basis,
    rate,
    assumedTds: r2(basis * rate),
    threshold: threshold / 100,
    assumptions,
    rulesUsed: [...used],
  };
}

export function monitorTds({ payments = [], fy } = {}) {
  const filtered = payments.filter((p) => !fy || p.fy === fy);
  const groups = new Map();
  for (const p of filtered) {
    const category = p.section === '194J' ? `|${String(p.category || '').toLowerCase()}` : '';
    const key = `${p.payee}|${p.section}${category}`;
    if (!groups.has(key)) groups.set(key, { payee: p.payee, section: p.section, payments: [] });
    groups.get(key).payments.push(p);
  }
  const flags = [];
  const errors = [];
  for (const group of groups.values()) {
    const onDate = fyStart(fy || group.payments[0]?.fy, group.payments[0]?.date);
    try {
      const flag = onDate ? evaluate(group, onDate) : null;
      if (!onDate) errors.push({ payee: group.payee, section: group.section, error: 'FY_UNKNOWN' });
      if (flag) flags.push(flag);
    } catch (err) {
      errors.push({ payee: group.payee, section: group.section, error: err.code || 'TDS_RULE_FAILED', ruleId: err.ruleId });
    }
  }
  flags.sort((a, b) => (a.payee === b.payee ? a.section.localeCompare(b.section) : a.payee < b.payee ? -1 : 1));
  if (errors.length) flags.errors = errors;
  return flags;
}
