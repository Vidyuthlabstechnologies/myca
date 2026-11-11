export const ROUNDINGS = Object.freeze(['half-up', 'down', 'up']);

const BASIS_POINTS = 10000n;

function wholeNumber(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function divide(numerator, rounding) {
  const whole = numerator / BASIS_POINTS;
  const rest = numerator % BASIS_POINTS;
  if (rest === 0n || rounding === 'down') return whole;
  if (rounding === 'up') return whole + 1n;
  return rest * 2n >= BASIS_POINTS ? whole + 1n : whole;
}

export function bandProblems(bands) {
  if (!Array.isArray(bands) || !bands.length) return ['BANDS_REQUIRED'];
  const problems = [];
  if (bands[0].over !== 0) problems.push('FIRST_BAND_STARTS_AT_ZERO');
  bands.forEach((band, index) => {
    if (!wholeNumber(band.over)) problems.push(`BAND_${index}_OVER_NOT_WHOLE`);
    if (!wholeNumber(band.rateBp) || band.rateBp > 10000) problems.push(`BAND_${index}_RATE_NOT_BASIS_POINTS`);
    if (index > 0 && !(band.over > bands[index - 1].over)) problems.push(`BAND_${index}_NOT_ASCENDING`);
  });
  return problems;
}

export function progressiveTax(amount, bands, { rounding = 'half-up' } = {}) {
  if (!wholeNumber(amount)) return { ok: false, error: 'AMOUNT_NOT_WHOLE_MINOR_UNITS' };
  if (!ROUNDINGS.includes(rounding)) return { ok: false, error: 'BAD_ROUNDING', hint: ROUNDINGS.join(', ') };
  const problems = bandProblems(bands);
  if (problems.length) return { ok: false, error: 'BAD_BANDS', problems };
  let total = 0n;
  const rows = bands.map((band, index) => {
    const upTo = index + 1 < bands.length ? bands[index + 1].over : null;
    const taxable = Math.max(0, Math.min(amount, upTo === null ? amount : upTo) - band.over);
    const numerator = BigInt(taxable) * BigInt(band.rateBp);
    total += numerator;
    return { over: band.over, upTo, rateBp: band.rateBp, taxable, tax: Number(divide(numerator, rounding)) };
  });
  const top = rows.filter((row) => row.taxable > 0).pop() || rows[0];
  return { ok: true, tax: Number(divide(total, rounding)), marginalRateBp: top.rateBp, bands: rows };
}

export function flatTax(amount, rateBp, { rounding = 'half-up' } = {}) {
  return progressiveTax(amount, [{ over: 0, rateBp }], { rounding });
}
