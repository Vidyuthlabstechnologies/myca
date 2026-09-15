function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeGstin(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/\s+/g, '');
}

function normalizeInvoiceNo(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isCreditNote(purchase) {
  if (purchase.isCreditNote === true) return true;
  if (typeof purchase.invoiceNo === 'string' && /^CN/i.test(purchase.invoiceNo)) return true;
  return purchase.totalValue < 0;
}

function matchKey(gstin, invoiceNo) {
  return `${normalizeGstin(gstin)}|${normalizeInvoiceNo(invoiceNo)}`;
}

export function flagRule37A({ purchaseRegister, gstr2b }) {
  const blocked = [];
  const unclaimed = [];
  const summary = {
    blockedCount: 0,
    totalBlockedCredit: 0,
    unclaimedCount: 0,
    totalUnclaimedCredit: 0,
  };

  const bookedKeys = new Set();
  const bookedByKey = new Map();
  for (const purchase of purchaseRegister) {
    const key = matchKey(purchase.gstin, purchase.invoiceNo);
    bookedKeys.add(key);
    if (!bookedByKey.has(key)) bookedByKey.set(key, []);
    bookedByKey.get(key).push(purchase);
  }

  const b2bByKey = new Map();
  for (const invoice of gstr2b) {
    if (invoice.section === 'CDNR') continue;
    const key = matchKey(invoice.supplierGstin, invoice.invoiceNo);
    if (!b2bByKey.has(key)) b2bByKey.set(key, []);
    b2bByKey.get(key).push(invoice);
  }

  for (const purchase of purchaseRegister) {
    if (isCreditNote(purchase)) continue;
    const key = matchKey(purchase.gstin, purchase.invoiceNo);
    const matches = b2bByKey.get(key) || [];
    const unavailable = matches.find((invoice) => invoice.itcAvailability !== 'Y');
    if (unavailable) {
      blocked.push({
        purchase,
        invoice: unavailable,
        reason: 'ITC marked unavailable (supplier default) — credit blocked',
        blockedCredit: purchase.totalValue,
      });
    } else if (matches.length === 0) {
      blocked.push({
        purchase,
        invoice: null,
        reason: 'Invoice absent from GSTR-2B — input credit not available',
        blockedCredit: purchase.totalValue,
      });
    }
  }

  for (const invoice of gstr2b) {
    const key = matchKey(invoice.supplierGstin, invoice.invoiceNo);
    if (!bookedKeys.has(key) && invoice.totalValue > 0) {
      unclaimed.push(invoice);
    }
  }

  summary.blockedCount = blocked.length;
  summary.totalBlockedCredit = round2(blocked.reduce((sum, entry) => sum + entry.blockedCredit, 0));
  summary.unclaimedCount = unclaimed.length;
  summary.totalUnclaimedCredit = round2(unclaimed.reduce((sum, entry) => sum + (entry.totalValue || 0), 0));

  return { blocked, unclaimed, summary };
}