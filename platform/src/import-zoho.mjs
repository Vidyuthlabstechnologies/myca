import { isoDate } from './dates.mjs';

function cellMap(header) {
  const aliases = {
    invoiceNo: ['invoice number', 'invoice no', 'invoice#', 'inv no'],
    date: ['invoice date', 'date'],
    partyName: ['customer name', 'customer', 'party', 'display name'],
    partyGstin: ['gst identification number (gstin)', 'gstin', 'customer gstin'],
    hsn: ['hsn/sac', 'hsn', 'sac'],
    description: ['item name', 'item', 'description', 'product'],
    qty: ['quantity', 'qty'],
    rate: ['item price', 'rate', 'unit price'],
    gstRate: ['tax percentage', 'gst %', 'gst rate', 'tax %'],
    cgst: ['cgst'],
    sgst: ['sgst'],
    igst: ['igst'],
    taxable: ['taxable amount', 'subtotal', 'item total'],
    placeOfSupply: ['place of supply', 'place of supply code', 'destination of supply'],
  };
  const idx = {};
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const [canon, names] of Object.entries(aliases)) {
    const i = lower.findIndex((h) => names.includes(h) || h === canon.toLowerCase());
    if (i >= 0) idx[canon] = i;
  }
  return idx;
}

function split(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  const endRow = () => {
    row.push(cur);
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
    cur = '';
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (q) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch === '\r' && source[i + 1] === '\n' ? '' : ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') endRow();
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) endRow();
  return rows;
}

function quantity(cell) {
  const raw = String(cell == null ? '' : cell).replace(/[,\s]/g, '');
  return raw === '' ? 1 : Number(raw);
}

// Keep an unreadable date as written so the posting step refuses it by name
// instead of silently booking the invoice on today's date.
function invoiceDate(v) {
  return isoDate(v) || String(v == null ? '' : v).trim();
}

function taxRate(cell) {
  const raw = String(cell == null ? '' : cell).replace('%', '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseZohoBooksCsv(text) {
  const rows = split(text);
  if (!rows.length) return { invoices: [], meta: { error: 'EMPTY' } };
  const idx = cellMap(rows[0]);
  if (idx.invoiceNo == null || idx.partyName == null) {
    return { invoices: [], meta: { error: 'NO_HEADER', header: rows[0] } };
  }
  const grouped = new Map();
  for (const cells of rows.slice(1)) {
    const id = cells[idx.invoiceNo]?.trim();
    if (!id) continue;
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        date: invoiceDate(cells[idx.date] || ''),
        partyName: cells[idx.partyName] || '',
        partyGstin: (cells[idx.partyGstin] || '').trim(),
        partyState: /^\d{1,2}$/.test(String(cells[idx.placeOfSupply] || '').trim()) ? String(cells[idx.placeOfSupply]).trim().padStart(2, '0') : '',
        lines: [],
      });
    }
    grouped.get(id).lines.push({
      description: cells[idx.description] || 'Item',
      hsn: String(cells[idx.hsn] || '').trim(),
      qty: quantity(cells[idx.qty]),
      rate: Number(String(cells[idx.rate] || '0').replace(/[,₹]/g, '')),
      gstRate: taxRate(cells[idx.gstRate]),
    });
  }
  const invoices = [...grouped.values()];
  return { invoices, meta: { count: invoices.length } };
}
