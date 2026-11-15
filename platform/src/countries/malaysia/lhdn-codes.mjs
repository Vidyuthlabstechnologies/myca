import { readFileSync } from 'node:fs';

const CODES = JSON.parse(readFileSync(new URL('./codes/lhdn-codes.json', import.meta.url), 'utf8'));
const MSIC_FILE = JSON.parse(readFileSync(new URL('./codes/msic-codes.json', import.meta.url), 'utf8'));

const pairs = (rows) => Object.freeze(rows.map(([code, name]) => Object.freeze({ code, name: name || '' })));
const bare = (rows) => Object.freeze(rows.map((code) => Object.freeze({ code, name: '' })));

export const LHDN_CODE_SOURCE = CODES.source;
export const MSIC_SOURCE = MSIC_FILE.source || CODES.source;

export const LHDN_TABLES = Object.freeze({
  states: pairs(CODES.states),
  taxTypes: pairs(CODES.taxTypes),
  documentTypes: pairs(CODES.documentTypes),
  classifications: pairs(CODES.classifications),
  paymentMethods: pairs(CODES.paymentMethods),
  msic: pairs(MSIC_FILE.msic),
  countries: bare(CODES.countries),
  currencies: bare(CODES.currencies),
  units: bare(CODES.units),
});

export const LHDN_TABLE_NAMES = Object.freeze(Object.keys(LHDN_TABLES));

const INDEX = new Map(Object.entries(LHDN_TABLES).map(([table, rows]) => [table, new Map(rows.map((row) => [row.code, row]))]));

export function hasCode(table, code) {
  const rows = INDEX.get(table);
  return Boolean(rows && rows.has(String(code ?? '')));
}

export function codeName(table, code) {
  const row = INDEX.get(table)?.get(String(code ?? ''));
  return row ? row.name : '';
}

export function lookupCodes({ table, code, query, limit = 50 } = {}) {
  const name = String(table || '');
  if (!INDEX.has(name)) return { ok: false, error: 'UNKNOWN_CODE_TABLE', table: name, tables: LHDN_TABLE_NAMES };
  const rows = LHDN_TABLES[name];
  const wanted = Math.min(500, Math.max(1, Math.floor(Number(limit) || 50)));
  if (code !== undefined && code !== null && String(code).trim() !== '') {
    const text = String(code).trim().toUpperCase();
    const row = INDEX.get(name).get(text) || INDEX.get(name).get(String(code).trim());
    return { ok: true, data: { table: name, found: Boolean(row), entries: row ? [row] : [], total: row ? 1 : 0, source: name === 'msic' ? MSIC_SOURCE : LHDN_CODE_SOURCE } };
  }
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched = words.length ? rows.filter((row) => words.every((word) => `${row.code} ${row.name}`.toLowerCase().includes(word))) : rows;
  return { ok: true, data: { table: name, found: matched.length > 0, entries: matched.slice(0, wanted), total: matched.length, source: name === 'msic' ? MSIC_SOURCE : LHDN_CODE_SOURCE } };
}
