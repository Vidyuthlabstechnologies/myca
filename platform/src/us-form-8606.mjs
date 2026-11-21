const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};

export function proRataRatio(basis, total) {
  if (total <= 0) return 1;
  return Math.min(1, Math.round((basis / total) * 1000) / 1000);
}

export function computeForm8606(input = {}) {
  const line1 = whole(input.nondeductibleContributions);
  const line2 = whole(input.priorBasis);
  const line3 = line1 + line2;
  const distributions = whole(input.distributions);
  const conversions = whole(input.conversions);
  const moved = distributions + conversions > 0;
  const partI = line3 > 0;
  const lines = {};
  let nontaxableConversion = 0;
  let taxableDistributions = null;
  let ratio = null;
  if (partI) {
    Object.assign(lines, { 1: line1, 2: line2, 3: line3 });
    if (!moved) lines[14] = line3;
    else {
      const line4 = Math.min(line1, whole(input.contributionsAfterYearEnd));
      const line5 = line3 - line4;
      const line6 = whole(input.yearEndValue);
      const line9 = line6 + distributions + conversions;
      ratio = proRataRatio(line5, line9);
      const line11 = Math.round(conversions * ratio);
      const line12 = Math.round(distributions * ratio);
      const line13 = line11 + line12;
      const line15a = distributions - line12;
      nontaxableConversion = line11;
      taxableDistributions = line15a;
      Object.assign(lines, { 4: line4, 5: line5, 6: line6, 7: distributions, 8: conversions, 9: line9, 10: ratio, 11: line11, 12: line12, 13: line13, 14: Math.max(0, line3 - line13), '15a': line15a, '15b': 0, '15c': line15a });
    }
  }
  const partII = conversions > 0;
  const taxableConversion = partII ? conversions - nontaxableConversion : 0;
  if (partII) Object.assign(lines, { 16: conversions, 17: nontaxableConversion, 18: taxableConversion });
  const rothDistributions = whole(input.rothDistributions);
  const partIII = rothDistributions > 0;
  let taxableRoth = 0;
  let fromConversions = 0;
  let rothBasisLeft = null;
  if (partIII) {
    const line20 = Math.min(whole(input.firstHomeExpenses), whole(input.firstHomeLimit), rothDistributions);
    const line21 = Math.max(0, rothDistributions - line20);
    const line22 = whole(input.rothContributionBasis);
    const line23 = Math.max(0, line21 - line22);
    Object.assign(lines, { 19: rothDistributions, 20: line20, 21: line21, 22: line22, 23: line23 });
    const line24 = whole(input.rothConversionBasis);
    if (line23 > 0) {
      const line25a = Math.max(0, line23 - line24);
      taxableRoth = line25a;
      fromConversions = Math.min(line23, line24);
      Object.assign(lines, { 24: line24, '25a': line25a, '25b': 0, '25c': line25a });
    }
    rothBasisLeft = { contributions: Math.max(0, line22 - line21), conversions: Math.max(0, line24 - line23) };
  }
  const basisCarryforward = partI ? lines[14] : line3;
  return { required: line1 > 0 || (partI && moved) || partII || partIII, partI, partII, partIII, lines, ratio, taxableDistributions, taxableConversion, taxableRoth, fromConversions, basisCarryforward, rothBasisLeft };
}
