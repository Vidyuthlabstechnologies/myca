const ALIASES = {
  date: ['date', 'posted date', 'posting date', 'transaction date', 'post date', 'trans date', 'effective date'],
  description: ['description', 'memo', 'details', 'payee', 'transaction', 'narrative', 'name'],
  amount: ['amount', 'transaction amount', 'amt'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'charges'],
  credit: ['credit', 'deposit', 'deposits', 'money in', 'payments'],
  balance: ['balance', 'running balance', 'running bal.', 'ending balance'],
  ref: ['reference', 'ref', 'check number', 'check no', 'check #', 'transaction id', 'id'],
  type: ['type', 'transaction type', 'credit debit indicator', 'cr/dr'],
};

function split(text) {
  return String(text).replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

function columns(header) {
  const idx = {};
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const [canon, names] of Object.entries(ALIASES)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i >= 0) idx[canon] = i;
  }
  return idx;
}

function money(cell) {
  const raw = String(cell == null ? '' : cell).replace(/[$,\s]/g, '');
  if (raw === '') return null;
  const n = Number(raw.replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
}

export function usBankDate(value) {
  const text = String(value == null ? '' : value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    if (Number(us[1]) > 12 || Number(us[2]) > 31) return '';
    return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  return '';
}

export function usBankMatrix(csv) {
  const rows = split(csv);
  if (rows.length < 2) return { ok: false, error: 'EMPTY' };
  let headerIndex = -1;
  let idx = {};
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const found = columns(rows[i]);
    if (found.date != null && found.description != null && (found.amount != null || found.debit != null || found.credit != null)) { headerIndex = i; idx = found; break; }
  }
  if (headerIndex < 0) return { ok: false, error: 'NO_HEADER', need: 'date, description and either an amount column or debit and credit columns' };
  const matrix = [['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance', 'Ref No']];
  const held = [];
  for (const [n, cells] of rows.slice(headerIndex + 1).entries()) {
    const date = usBankDate(cells[idx.date]);
    if (!date) { held.push({ row: headerIndex + n + 2, reason: 'INVALID_DATE', value: cells[idx.date] }); continue; }
    let withdrawal = idx.debit == null ? null : money(cells[idx.debit]);
    let deposit = idx.credit == null ? null : money(cells[idx.credit]);
    if (idx.amount != null && withdrawal == null && deposit == null) {
      const amount = money(cells[idx.amount]);
      if (amount == null) { held.push({ row: headerIndex + n + 2, reason: 'BAD_AMOUNT' }); continue; }
      const kind = idx.type == null ? '' : String(cells[idx.type] || '').trim().toLowerCase();
      const out = amount < 0 || /^(debit|dr|withdrawal|d)$/.test(kind);
      if (out) withdrawal = Math.abs(amount); else deposit = Math.abs(amount);
    }
    if (withdrawal != null && withdrawal < 0) { deposit = Math.abs(withdrawal); withdrawal = null; }
    if (deposit != null && deposit < 0) { withdrawal = Math.abs(deposit); deposit = null; }
    const balance = idx.balance == null ? null : money(cells[idx.balance]);
    matrix.push([date, String(cells[idx.description] || '').trim(), withdrawal == null || withdrawal === 0 ? '' : withdrawal.toFixed(2), deposit == null || deposit === 0 ? '' : deposit.toFixed(2), balance == null ? '' : balance.toFixed(2), idx.ref == null ? '' : String(cells[idx.ref] || '').trim()]);
  }
  return { ok: true, rows: matrix, held, count: matrix.length - 1 };
}
