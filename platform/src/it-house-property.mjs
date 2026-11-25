import { rupees } from './itr-util.mjs';

export function houseProperty(input = {}, regime) {
  const type = ['S', 'L', 'D'].includes(input.type) ? input.type : '';
  if (!type) return { type: '', gross: 0, taxPaid: 0, annualValue: 0, standardDeduction: 0, interest: 0, arrears: 0, income: 0, loss: 0 };
  const gross = rupees(input.rentReceived);
  const taxPaid = rupees(input.municipalTax);
  const interestRaw = rupees(input.interest);
  const arrears = rupees(input.arrearsRent);
  if (type === 'S') {
    const interest = regime === 'old' ? Math.min(interestRaw, 200000) : 0;
    return { type, gross: 0, taxPaid: 0, annualValue: 0, standardDeduction: 0, interest, arrears: 0, income: -interest, loss: interest };
  }
  const annualValue = Math.max(0, gross - taxPaid);
  const standardDeduction = Math.round(annualValue * 0.3);
  const arrearsNet = arrears - Math.round(arrears * 0.3);
  const raw = annualValue - standardDeduction - interestRaw + arrearsNet;
  return { type, gross, taxPaid, annualValue, standardDeduction, interest: interestRaw, arrears, income: raw, loss: Math.max(0, -raw) };
}

export function houseBlocks(list, regime) {
  return (Array.isArray(list) ? list : []).map((input, index) => {
    const share = Math.min(100, Math.max(0, Number(input.sharePercent ?? 100)));
    const scaled = { ...input, rentReceived: Math.round(rupees(input.rentReceived) * share / 100), municipalTax: Math.round(rupees(input.municipalTax) * share / 100), arrearsRent: rupees(input.arrearsRent) };
    return { index, input, share, h: houseProperty(scaled, regime) };
  });
}
