/**
 * TallyPrime XML export (ENVELOPE / TALLYMESSAGE / VOUCHER).
 * Protocol is Tally's published XML interface; this parser is original to Bahikhata.
 */

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

function attr(block, name) {
  const m = block.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function tallyDate(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw;
}

function voucherAmount(block) {
  const amounts = [...block.matchAll(/<(?:AMOUNT)[^>]*>([\d.\-]+)<\//gi)].map((m) => Number(m[1]));
  const partyAmt = [...block.matchAll(/<ALLLEDGERENTRIES\.LIST[\s\S]*?<\/ALLLEDGERENTRIES\.LIST>/gi)]
    .map((m) => Number(tag(m[0], 'AMOUNT')))
    .filter((n) => Number.isFinite(n) && n !== 0);
  const abs = partyAmt.length ? Math.max(...partyAmt.map(Math.abs)) : Math.max(0, ...amounts.map(Math.abs));
  return abs;
}

export function tallyXmlToDayBookCsv(xml) {
  const text = String(xml || '');
  if (!/<ENVELOPE|<VOUCHER/i.test(text)) {
    return { ok: false, error: 'Not a Tally XML envelope (expected <ENVELOPE> or <VOUCHER>).', csv: '', count: 0 };
  }
  const blocks = [...text.matchAll(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi)].map((m) => m[0]);
  const header = 'Date,Voucher Type,Voucher No,Particulars,Amount,GSTIN,Narration';
  const rows = [];
  for (const b of blocks) {
    const type = tag(b, 'VOUCHERTYPENAME') || attr(b, 'VCHTYPE') || 'Journal';
    const date = tallyDate(tag(b, 'DATE'));
    const no = tag(b, 'VOUCHERNUMBER') || tag(b, 'REFERENCE');
    const party = tag(b, 'PARTYLEDGERNAME') || tag(b, 'PARTYNAME') || 'Unknown';
    const gstin = tag(b, 'PARTYGSTIN') || tag(b, 'GSTIN') || tag(b, 'PARTYGSTINNO');
    const narr = tag(b, 'NARRATION');
    const amount = voucherAmount(b);
    if (!date) continue;
    rows.push([date, type, no, party.replace(/,/g, ' ').replace(/\s+/g, ' '), amount || '', gstin, narr.replace(/,/g, ' ').replace(/\s+/g, ' ')].join(','));
  }
  return { ok: true, csv: [header, ...rows].join('\n'), count: rows.length };
}
