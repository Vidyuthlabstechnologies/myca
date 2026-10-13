import { splitCsvLine } from './csv.mjs';
import { escalationLevel } from './calendar.mjs';

const REQUIRED_DOCS_MAP = {
  'GSTR-1': ['sales_register', 'credit_notes', 'debit_notes', 'e_invoice_json'],
  'GSTR-3B': ['gstr2b', 'purchase_register', 'sales_register'],
  'GSTR-7': ['tds_challans', 'deductor_ledger'],
  'TDS_QUARTERLY': ['24q_working', 'challan_register', 'deductor_ledger'],
  'ITR': ['bank_statements', '26as', 'ais', 'tally_export'],
  'GSTR-9': ['gstr9_working', 'reconciliation'],
  'PF': ['pf_challan'],
  'ESI': ['esi_challan'],
  'ADVANCE_TAX': ['advance_tax_challan'],
};


export function parseDocs(text) {
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
    rows.push(row);
  }
  return { rows, errors };
}

export function requiredDocs(returnType) {
  return REQUIRED_DOCS_MAP[returnType] || [];
}

export function collectionStatus({ docs }) {
  const map = new Map();
  for (const doc of docs) {
    const key = `${doc.clientId}|${doc.returnType}|${doc.period}`;
    if (!map.has(key)) {
      const req = requiredDocs(doc.returnType);
      map.set(key, {
        clientId: doc.clientId,
        returnType: doc.returnType,
        period: doc.period,
        required: [...req],
        received: [],
        missing: [],
        completeness: 0,
      });
    }
    const entry = map.get(key);
    if (doc.status === 'received' && !entry.received.includes(doc.docType)) {
      entry.received.push(doc.docType);
    }
  }
  for (const [, entry] of map) {
    entry.missing = entry.required.filter(r => !entry.received.includes(r));
    entry.completeness = entry.required.length > 0 ? entry.received.length / entry.required.length : 0;
  }
  return map;
}

export function chasePlan({ clients, scope, docs, dueInfo = {} }) {
  const result = [];
  const clientNames = {};
  for (const c of clients) {
    clientNames[c.clientId] = c.name;
  }
  const receivedMap = new Map();
  for (const doc of docs) {
    if (doc.status === 'received') {
      const key = `${doc.clientId}|${doc.returnType}|${doc.period}`;
      if (!receivedMap.has(key)) receivedMap.set(key, new Set());
      receivedMap.get(key).add(doc.docType);
    }
  }
  const seen = new Set();
  for (const item of scope) {
    const key = `${item.clientId}|${item.returnType}|${item.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reqDocs = requiredDocs(item.returnType);
    const received = receivedMap.get(key) || new Set();
    const info = dueInfo[key] || {};
    for (const docType of reqDocs) {
      if (received.has(docType)) continue;
      const dueDate = info.dueDate || null;
      const daysUntilVal = info.daysUntil !== undefined ? info.daysUntil : null;
      const level = daysUntilVal !== null ? escalationLevel(daysUntilVal) : 'due_soon';
      const name = clientNames[item.clientId] || item.clientId;
      const dv = dueDate || '2026-09-07';
      let message;
      switch (level) {
        case 'overdue':
          message = `ACTION REQUIRED — ${name}: provide ${docType} for ${item.returnType} ${item.period}; due ${dv}`;
          break;
        case 'urgent':
          message = `URGENT — ${name}: provide ${docType} for ${item.returnType} ${item.period} by ${dv}`;
          break;
        case 'due_soon':
          message = `Reminder — ${name}: ${docType} for ${item.returnType} ${item.period} needed ahead of ${dv}`;
          break;
        case 'on_track':
          message = `On track — ${name}: send ${docType} for ${item.returnType} ${item.period} in time for ${dv}`;
          break;
      }
      result.push({
        clientId: item.clientId,
        clientName: name,
        returnType: item.returnType,
        period: item.period,
        docType,
        dueDate,
        daysUntil: daysUntilVal,
        level,
        message,
      });
    }
  }
  return result;
}
