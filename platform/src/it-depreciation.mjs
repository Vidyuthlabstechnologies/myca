
export const DEPRECIATION_BLOCKS = {
  'building-residential': { label: 'Residential building', rate: 5 },
  'building-other': { label: 'Other building', rate: 10 },
  'building-temporary': { label: 'Temporary structure (wooden or similar)', rate: 40 },
  'furniture-fittings': { label: 'Furniture and fittings', rate: 10 },
  'plant-machinery': { label: 'Plant and machinery (general)', rate: 15 },
  'motor-vehicle': { label: 'Motor cars and other vehicles (not on hire)', rate: 15 },
  'motor-vehicle-hire': { label: 'Motor vehicles on hire (buses, lorries, taxis)', rate: 30 },
  'computers-software': { label: 'Computers and computer software', rate: 40 },
  'intangible': { label: 'Know-how, patents, copyrights, trademarks, licences, franchises', rate: 25 },
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (value) => Math.max(0, Math.round(Number(value) || 0));

function daysFrom(dateIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${dateIso}T00:00:00Z`)) / 86400000) + 1;
}

export function depreciationSchedule({ blocks = [], fyEnd }) {
  if (!ISO.test(String(fyEnd || ''))) return { ok: false, error: 'FY_END_REQUIRED' };
  const rows = [];
  const notes = [];
  for (const [index, input] of blocks.entries()) {
    const spec = DEPRECIATION_BLOCKS[input.block];
    if (!spec) return { ok: false, error: 'UNKNOWN_BLOCK', hint: `blocks[${index}].block must be one of ${Object.keys(DEPRECIATION_BLOCKS).join(', ')}.` };
    const opening = num(input.openingWdv);
    const sales = num(input.sales);
    let fullYearAdditions = 0;
    let shortYearAdditions = 0;
    for (const addition of input.additions || []) {
      if (!ISO.test(String(addition.date || ''))) return { ok: false, error: 'ADDITION_DATE_REQUIRED', hint: `blocks[${index}] additions need a date.` };
      if (addition.date > fyEnd) return { ok: false, error: 'ADDITION_AFTER_YEAR_END', hint: `blocks[${index}] has an addition after the year end.` };
      const used = daysFrom(addition.date, fyEnd);
      if (used >= 180) fullYearAdditions += num(addition.amount);
      else shortYearAdditions += num(addition.amount);
    }
    const additions = fullYearAdditions + shortYearAdditions;
    const wdvBeforeDepreciation = opening + additions - sales;
    let depreciation = 0;
    let shortTermGain = 0;
    if (wdvBeforeDepreciation < 0) {
      shortTermGain = -wdvBeforeDepreciation;
      notes.push(`${spec.label}: sale proceeds exceed the block value by Rs ${shortTermGain}; that is a short-term capital gain under section 50, not business income.`);
    } else if (wdvBeforeDepreciation > 0) {
      const base = Math.max(0, wdvBeforeDepreciation - shortYearAdditions);
      depreciation = Math.round((base * spec.rate) / 100 + (Math.min(shortYearAdditions, wdvBeforeDepreciation) * spec.rate) / 200);
    }
    rows.push({ block: input.block, label: spec.label, ratePercent: spec.rate, openingWdv: opening, additionsFullYear: fullYearAdditions, additionsHalfYear: shortYearAdditions, sales, depreciation, closingWdv: Math.max(0, wdvBeforeDepreciation - depreciation), shortTermGain });
  }
  const total = rows.reduce((sum, row) => sum + row.depreciation, 0);
  const closing = rows.reduce((sum, row) => sum + row.closingWdv, 0);
  const shortTermGain = rows.reduce((sum, row) => sum + row.shortTermGain, 0);
  return { ok: true, data: { rows, totalDepreciation: total, closingWdv: closing, shortTermGainSection50: shortTermGain, notes } };
}
