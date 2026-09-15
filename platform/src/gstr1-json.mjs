/**
 * GSTN offline-tool GSTR-1 JSON (public schema).
 * Built from posted invoices — same source as GSTR-1 tables. Not uploaded to GSTN.
 */
function fpFromDate(iso) {
  const [y, m] = String(iso || '').split('-');
  return y && m ? `${m}${y}` : '';
}

function ddmmyyyy(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : '';
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function invoicesToGstr1Json(company, invoices = [], periodFp) {
  const gstin = company.gstin || '';
  const dated = (invoices || []).filter((i) => i.date);
  const fp = periodFp || fpFromDate(dated.map((i) => i.date).sort().slice(-1)[0] || '');
  const b2bMap = new Map();
  const b2cs = [];

  for (const inv of dated) {
    const pos = String(inv.partyState || inv.placeOfSupply || gstin.slice(0, 2) || '27').padStart(2, '0');
    const items = (inv.lines || []).map((l, idx) => ({
      num: idx + 1,
      itm_det: {
        rt: Number(l.gstRate || 0),
        txval: round2(l.taxable),
        camt: round2(l.cgst),
        samt: round2(l.sgst),
        iamt: round2(l.igst),
        csamt: 0,
      },
    }));
    const val = round2(inv.total);
    if (inv.partyGstin && String(inv.partyGstin).length === 15) {
      const ctin = String(inv.partyGstin).toUpperCase();
      if (!b2bMap.has(ctin)) b2bMap.set(ctin, []);
      b2bMap.get(ctin).push({
        inum: inv.id,
        idt: ddmmyyyy(inv.date),
        val,
        pos,
        rchrg: 'N',
        inv_typ: 'R',
        itms: items,
      });
    } else {
      const first = inv.lines?.[0] || {};
      b2cs.push({
        sply_ty: pos === gstin.slice(0, 2) ? 'INTRA' : 'INTER',
        rt: Number(first.gstRate || 0),
        typ: 'OE',
        pos,
        txval: round2(inv.taxable),
        camt: round2(inv.cgst),
        samt: round2(inv.sgst),
        iamt: round2(inv.igst),
        csamt: 0,
      });
    }
  }

  const b2b = [...b2bMap.entries()].map(([ctin, inv]) => ({ ctin, inv }));
  return {
    gstin,
    fp,
    gt: 0,
    cur_gt: 0,
    version: 'GST3.1.6',
    hash: 'hash',
    b2b,
    b2cs,
    caveat: 'JSON for GSTN offline utility / CA review. MyCA does not upload this file.',
  };
}
