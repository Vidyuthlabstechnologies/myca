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

function isoDate(v) {
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
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
        date: isoDate(cells[idx.date] || ''),
        partyName: cells[idx.partyName] || '',
        partyGstin: (cells[idx.partyGstin] || '').trim(),
        lines: [],
      });
    }
    grouped.get(id).lines.push({
      description: cells[idx.description] || 'Item',
      hsn: cells[idx.hsn] || '0000',
      qty: Number(cells[idx.qty] || 1),
      rate: Number(String(cells[idx.rate] || '0').replace(/[,₹]/g, '')),
      gstRate: Number(cells[idx.gstRate] || 18),
    });
  }
  return { invoices: [...grouped.values()], meta: { count: grouped.size } };
}
