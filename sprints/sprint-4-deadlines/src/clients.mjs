import { splitCsvLine } from './csv.mjs';

export function parseClients(text) {
  if (typeof text !== 'string') return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: null, message: 'No header row found' }] };
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleaned) return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: null, message: 'No header row found' }] };
  const lines = cleaned.split('\n').filter(l => l.trim());
  if (!lines.length) return { rows: [], errors: [{ code: 'NO_HEADER_ROW', row: 0, field: null, message: 'No header row found' }] };
  const headers = splitCsvLine(lines[0]);
  const errors = [];
  if (!headers.some(h => h.toLowerCase() === 'clientid')) {
    errors.push({ code: 'MISSING_COLUMN', row: 0, field: 'clientId', message: 'Missing required column: clientId' });
    return { rows: [], errors };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    const turnoverKey = headers.find(h => h.toLowerCase() === 'turnover');
    if (turnoverKey && row[turnoverKey] !== undefined) {
      row[turnoverKey] = Number(row[turnoverKey]);
    }
    rows.push(row);
  }
  return { rows, errors };
}

export function validateClients(rows) {
  const errors = [];
  const seen = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = row.clientId;
    if (!id || !String(id).trim()) {
      errors.push({ code: 'MISSING_CLIENT_ID', row: i + 1, field: 'clientId', message: 'Missing clientId' });
    } else {
      if (seen.has(id)) {
        errors.push({ code: 'DUPLICATE_CLIENT_ID', row: i + 1, field: 'clientId', message: 'Duplicate clientId: ' + id });
      }
      seen.set(id, i);
    }
    if (typeof row.turnover === 'number' && row.turnover < 0) {
      errors.push({ code: 'NEGATIVE_TURNOVER', row: i + 1, field: 'turnover', message: 'Negative turnover' });
    }
  }
  return { ok: errors.length === 0, errors };
}
