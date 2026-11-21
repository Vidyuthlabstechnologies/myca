const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};
const ofBasis = (amount, basisPoints) => Math.round((amount * basisPoints) / 10000);

function excessPart(prior, applied, distributed, current, yearEndValue, basisPoints) {
  const carried = whole(prior);
  const used = whole(applied) + distributed.reduce((total, value) => total + whole(value), 0);
  const left = Math.max(0, carried - used);
  const total = left + whole(current);
  const value = yearEndValue === null || yearEndValue === undefined || yearEndValue === '' ? total : whole(yearEndValue);
  return { carried, used, left, current: whole(current), total, tax: ofBasis(Math.min(total, value), basisPoints) };
}

export function computeForm5329(input = {}) {
  const rates = input.rates || {};
  const early = Array.isArray(input.early) ? input.early : [];
  const line1 = early.reduce((total, row) => total + whole(row.amount), 0);
  const excluded = early.map((row) => Math.min(whole(row.amount), whole(row.exception)));
  const line2 = excluded.reduce((total, value) => total + value, 0);
  const line3 = line1 - line2;
  const simpleSubject = early.reduce((total, row, index) => total + (row.simple ? whole(row.amount) - excluded[index] : 0), 0);
  const line4 = ofBasis(line3 - simpleSubject, rates.earlyBasisPoints || 0) + ofBasis(simpleSubject, rates.simpleEarlyBasisPoints || 0);
  const codes = [...new Set(early.filter((row, index) => excluded[index] > 0 && row.code).map((row) => row.code))];
  const exceptionNumber = codes.length > 1 ? '99' : codes[0] || '';
  const lines = {};
  if (line1 > 0) Object.assign(lines, { 1: line1, 2: line2, 3: line3, 4: line4 });
  const ira = input.iraExcess || null;
  let iraTax = 0;
  if (ira) {
    const part = excessPart(ira.prior, ira.applied, [ira.distributionsIncluded, ira.priorWithdrawn], ira.current, ira.yearEndValue, rates.excessContributionBasisPoints || 0);
    iraTax = part.tax;
    Object.assign(lines, { 9: part.carried, 10: whole(ira.applied), 11: whole(ira.distributionsIncluded), 12: whole(ira.priorWithdrawn), 13: part.used, 14: part.left, 15: part.current, 16: part.total, 17: part.tax });
  }
  const roth = input.rothExcess || null;
  let rothTax = 0;
  if (roth) {
    const part = excessPart(roth.prior, roth.applied, [roth.distributions], roth.current, roth.yearEndValue, rates.excessContributionBasisPoints || 0);
    rothTax = part.tax;
    Object.assign(lines, { 18: part.carried, 19: whole(roth.applied), 20: whole(roth.distributions), 21: part.used, 22: part.left, 23: part.current, 24: part.total, 25: part.tax });
  }
  const rmd = input.rmd || null;
  let rmdTax = 0;
  let waiver = 0;
  if (rmd) {
    const required = whole(rmd.required);
    const distributed = whole(rmd.distributed);
    const shortfall = Math.max(0, required - distributed);
    waiver = Math.min(shortfall, whole(rmd.waiver));
    const corrected = Boolean(rmd.corrected);
    const a = corrected ? ofBasis(shortfall - waiver, rates.excessAccumulationCorrectedBasisPoints || 0) : 0;
    const b = corrected ? 0 : ofBasis(shortfall - waiver, rates.excessAccumulationBasisPoints || 0);
    rmdTax = a + b;
    Object.assign(lines, { '52a': corrected ? required : 0, '52b': corrected ? 0 : required, '53a': corrected ? distributed : 0, '53b': corrected ? 0 : distributed, '54a': a, '54b': b, 55: rmdTax });
  }
  const total = (line1 > 0 ? line4 : 0) + iraTax + rothTax + rmdTax;
  return { lines, exceptionNumber, earlyTax: line1 > 0 ? line4 : 0, excessTax: iraTax + rothTax, rmdTax, total, waiverRequested: waiver, iraExcessCarryforward: ira ? lines[16] : 0, rothExcessCarryforward: roth ? lines[24] : 0 };
}
