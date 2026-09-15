import { parseAmount, r2 } from './core.mjs';

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

const THRESHOLDS = {
  '194A': { single: 40000 },
  '194C': { single: 30000, annual: 100000, rate: 0.01 },
  '194I': { annual: 240000, rate: 0.10 },
  '194J': { single: 30000, rate: 0.10 },
};

const DEFAULT_RATES = { '194A': 0.10, '194I': 0.10, '194J': 0.10 };

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
    });
  });
  return { rows, errors };
}

export function monitorTds({ payments = [], fy } = {}) {
  const filtered = payments.filter(p => !fy || p.fy === fy);
  const groups = {};
  for (const p of filtered) {
    const key = p.payee + '|' + p.section;
    if (!groups[key]) groups[key] = { payee: p.payee, section: p.section, payments: [] };
    groups[key].payments.push(p.amount);
  }

  const flags = [];
  for (const g of Object.values(groups)) {
    const cfg = THRESHOLDS[g.section];
    if (!cfg) continue;
    const cumulative = g.payments.reduce((a, b) => a + b, 0);
    const maxPay = Math.max(...g.payments);
    let kind = '';
    let basis = 0;
    if (cfg.annual && cumulative > cfg.annual) {
      kind = 'annual';
      basis = cumulative;
    } else if (cfg.single && maxPay > cfg.single) {
      kind = 'single';
      basis = maxPay;
    }
    if (!kind) continue;
    const rate = cfg.rate !== undefined ? cfg.rate : (DEFAULT_RATES[g.section] || 0);
    flags.push({
      payee: g.payee,
      section: g.section,
      kind,
      basis,
      rate,
      assumedTds: r2(basis * rate),
    });
  }

  flags.sort((a, b) => a.payee < b.payee ? -1 : a.payee > b.payee ? 1 : a.section < b.section ? -1 : a.section > b.section ? 1 : 0);
  return flags;
}
