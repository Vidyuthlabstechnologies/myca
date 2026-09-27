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
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
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
      hsn: cells[idx.hsn] || '0000',
      qty: Number(cells[idx.qty] || 1),
      rate: Number(String(cells[idx.rate] || '0').replace(/[,₹]/g, '')),
      gstRate: taxRate(cells[idx.gstRate]),
    });
  }
  const invoices = [...grouped.values()];
  return { invoices, meta: { count: invoices.length } };
}
