function round2(value) {
  return Math.round(value * 100) / 100;
}

function bucketKey(row) {
  return `${row.rate}% ${row.interState ? 'inter' : 'intra'}`;
}

function parseKey(key) {
  const parts = key.split(' ');
  return {
    rate: Number(parts[0].replace('%', '')),
    interState: parts[1] === 'inter',
  };
}

export function matchGSTR13({ gstr1, gstr3b }) {
  const order = [];
  const gstr1Totals = new Map();
  const gstr3bTotals = new Map();

  for (const row of gstr1 || []) {
    const key = bucketKey(row);
    if (!gstr1Totals.has(key)) {
      gstr1Totals.set(key, 0);
      order.push(key);
    }
    gstr1Totals.set(key, gstr1Totals.get(key) + (row.taxableValue || 0));
  }
  for (const row of gstr3b || []) {
    const key = bucketKey(row);
    if (!gstr3bTotals.has(key)) {
      gstr3bTotals.set(key, 0);
      if (!order.includes(key)) order.push(key);
    }
    gstr3bTotals.set(key, gstr3bTotals.get(key) + (row.taxableValue || 0));
  }

  const buckets = order.map((key) => {
    const gstr1Taxable = round2(gstr1Totals.get(key) || 0);
    const gstr3bTaxable = round2(gstr3bTotals.get(key) || 0);
    const diff = round2(gstr1Taxable - gstr3bTaxable);
    return {
      key,
      ...parseKey(key),
      gstr1Taxable,
      gstr3bTaxable,
      diff,
      ok: Math.abs(diff) <= 1,
    };
  });

  const mismatches = buckets.filter((bucket) => !bucket.ok);
  return {
    ok: mismatches.length === 0,
    buckets,
    mismatches,
    stats: {
      bucketCount: buckets.length,
      mismatchCount: mismatches.length,
    },
  };
}