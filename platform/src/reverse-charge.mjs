const COUNTRY = /^[A-Z]{2}$/;
const SELF_INVOICE_KINDS = new Set(['import', 'domestic']);
const r2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function rcmAsked(value) {
  if (value === true) return true;
  return ['y', 'yes', 'true', 'rcm', 'reverse', 'reverse charge'].includes(String(value ?? '').trim().toLowerCase());
}

function sacOf(line) {
  return String(line?.hsn ?? '').replace(/\s+/g, '');
}

export function reverseChargeOf(input = {}) {
  const country = String(input.originCountry ?? '').trim().toUpperCase();
  if (!rcmAsked(input.reverseCharge) && !country) return { ok: true, rcm: null };
  if (input.reverseCharge === false) return fail('RCM_CONFLICT', { hint: 'An import of services is always under reverse charge; leave reverseCharge out or set it to true.' });
  const registered = Boolean(String(input.partyGstin ?? '').trim());
  if (!country) return { ok: true, rcm: { kind: registered ? 'notified' : 'domestic' } };
  if (!COUNTRY.test(country)) return fail('ORIGIN_COUNTRY_INVALID', { originCountry: country, hint: 'Give the supplier\'s country as a two-letter code, for example US or SG.' });
  if (country === 'IN') return fail('ORIGIN_COUNTRY_INDIA', { hint: 'An import of services comes from outside India. For an Indian supplier under reverse charge, leave the country out.' });
  if (registered) return fail('IMPORT_SUPPLIER_HAS_GSTIN', { hint: 'A supplier outside India has no GSTIN; leave it out for an import of services.' });
  const goods = (input.lines || []).findIndex((line) => !sacOf(line).startsWith('99'));
  if (goods >= 0) return fail('RCM_IMPORT_SERVICES_ONLY', { line: goods + 1, hint: `Line ${goods + 1} needs a service code (SAC starting 99). Reverse charge imports cover services only; imported goods pay IGST at customs on the bill of entry.` });
  return { ok: true, rcm: { kind: 'import', originCountry: country } };
}

export function needsSelfInvoice(rcm) {
  return Boolean(rcm && SELF_INVOICE_KINDS.has(rcm.kind));
}

export function isSelfInvoice(doc) {
  return doc?.kind === 'purchase' && Boolean(doc.selfInvoiceNo) && needsSelfInvoice(doc.reverseCharge);
}

export function rcmSupplyType(doc) {
  if (!isSelfInvoice(doc)) return '';
  return doc.reverseCharge.kind === 'import' ? 'RCMIMP' : 'RCMDOM';
}

export function selfInvoiceById(state, id) {
  const key = String(id ?? '').trim().toUpperCase();
  if (!key) return null;
  return (state?.purchases || []).find((bill) => isSelfInvoice(bill) && (String(bill.id).toUpperCase() === key || String(bill.selfInvoiceNo).toUpperCase() === key)) || null;
}

export function reverseChargeTotals(purchases) {
  const totals = { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, eligibleImport: { igst: 0 }, eligibleOther: { igst: 0, cgst: 0, sgst: 0 } };
  for (const bill of purchases || []) {
    if (!bill?.reverseCharge || bill.status === 'cancelled') continue;
    totals.count += 1;
    totals.taxable += Number(bill.taxable || 0);
    totals.igst += Number(bill.igst || 0);
    totals.cgst += Number(bill.cgst || 0);
    totals.sgst += Number(bill.sgst || 0);
    if (bill.itcEligible === false) continue;
    if (bill.reverseCharge.kind === 'import') totals.eligibleImport.igst += Number(bill.igst || 0);
    else {
      totals.eligibleOther.igst += Number(bill.igst || 0);
      totals.eligibleOther.cgst += Number(bill.cgst || 0);
      totals.eligibleOther.sgst += Number(bill.sgst || 0);
    }
  }
  return {
    count: totals.count,
    taxable: r2(totals.taxable),
    igst: r2(totals.igst),
    cgst: r2(totals.cgst),
    sgst: r2(totals.sgst),
    total: r2(totals.igst + totals.cgst + totals.sgst),
    eligibleImport: { igst: r2(totals.eligibleImport.igst) },
    eligibleOther: { igst: r2(totals.eligibleOther.igst), cgst: r2(totals.eligibleOther.cgst), sgst: r2(totals.eligibleOther.sgst) },
  };
}
