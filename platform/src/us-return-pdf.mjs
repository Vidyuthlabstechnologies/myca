import { computedForm1040, usReturnReview, US_RETURN_YEARS } from './us-return.mjs';
import { localToday } from './dates.mjs';

function pdfText(value) {
  return String(value).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
}

export function simplePdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const tree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const lines of pages) {
    const ops = ['BT'];
    let y = 760;
    for (const line of lines) {
      const size = line.size || 10;
      ops.push(`/${line.bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${line.x || 50} ${y} Tm (${pdfText(line.text)}) Tj`);
      if (line.right !== undefined) ops.push(`/F1 ${size} Tf 1 0 0 1 470 ${y} Tm (${pdfText(line.right)}) Tj`);
      y -= size + (line.gap ?? 5);
    }
    ops.push('ET');
    const stream = ops.join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const usd = (amount) => `${amount < 0 ? '-' : ''}$${Math.abs(Number(amount || 0)).toLocaleString('en-US')}`;

export function usReturnPdf(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim() || String(Number(localToday().slice(0, 4)) - 1);
  if (!US_RETURN_YEARS.includes(taxYear)) return { ok: false, error: 'TAX_YEAR_NOT_SUPPORTED', supported: US_RETURN_YEARS };
  const computed = computedForm1040(state, { taxYear });
  if (!computed.ok) return computed;
  const review = usReturnReview(state, { taxYear }).data;
  const d = computed.data;
  const who = (person) => `${person.firstName} ${person.lastName}  SSN ${person.ssn || 'missing'}`;
  const head = [
    { text: `Form 1040 draft, tax year ${taxYear}`, bold: true, size: 16, gap: 8 },
    { text: `${d.taxpayer ? who(d.taxpayer) : 'Taxpayer not entered'}${d.spouse ? `   Spouse: ${who(d.spouse)}` : ''}` },
    { text: `Filing status: ${d.filingStatus}${d.address ? `   ${[d.address.line1, d.address.city, d.address.state, d.address.zip].filter(Boolean).join(', ')}` : ''}` },
    { text: 'A summary of the computed lines for review. It is not the IRS form and is not for mailing.', size: 8, gap: 12 },
  ];
  const rows = [];
  let form = '';
  for (const row of review.lines) {
    if (row.form !== form) {
      form = row.form;
      rows.push({ text: form === '1040' ? 'Form 1040' : form, bold: true, size: 11, gap: 6 });
    }
    rows.push({ text: `${row.line.padEnd(4)}  ${row.label}`, x: 60, right: usd(row.amount), size: 9, gap: 4 });
  }
  const checks = review.checks.length ? [{ text: 'To check', bold: true, size: 11, gap: 6 }, ...review.checks.map((item) => ({ text: `${item.level === 'error' ? 'Error' : 'Warning'}: ${item.message}`.slice(0, 110), x: 60, size: 8, gap: 4 }))] : [];
  const all = [...rows, ...checks, ...(d.unreviewed ? [{ text: 'The rates and limits come from dated rules a US CPA has not reviewed yet.', size: 8 }] : [])];
  const pages = [];
  let page = [...head];
  for (const line of all) {
    if (page.length >= 58) {
      pages.push(page);
      page = [{ text: `Form 1040 draft, tax year ${taxYear} (continued)`, bold: true, size: 11, gap: 8 }];
    }
    page.push(line);
  }
  pages.push(page);
  const bytes = simplePdf(pages);
  return { ok: true, data: { taxYear, fileName: `form-1040-${taxYear}-draft.pdf`, mimeType: 'application/pdf', pages: pages.length, bytes: bytes.length, base64: bytes.toString('base64') } };
}
