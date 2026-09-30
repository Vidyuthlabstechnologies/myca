import { parseAmount, r2 } from './core.mjs';
import { computeIncomeTax } from './income-tax.mjs';

const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const toRupees = (paise) => r2(paise / 100);

function splitCsvLine(line) {
  const parts = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  parts.push(cur);
  return parts;
}

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], data: [] };
  return { headers: splitCsvLine(lines[0]).map(h => h.trim()), data: lines.slice(1) };
}

function toNum(v) {
  const n = parseAmount(v);
  return Number.isNaN(n) ? 0 : n;
}

function makeErr(code, row, field, message) {
  return { code, row, field, message };
}

export function parseAis(text) {
  if (!text || !text.trim()) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No data')] };
  const { headers, data } = csvRows(text);
  if (!headers.length) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No header')] };
  const rows = [];
  const errors = [];
  data.forEach((line, i) => {
    const vals = splitCsvLine(line);
    if (vals.length < headers.length || vals.every(v => !v.trim())) return;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] !== undefined ? vals[j].trim() : ''; });
    const amt = parseAmount(obj.amount);
    const tds = parseAmount(obj.tds);
    if (Number.isNaN(amt)) { errors.push(makeErr('BAD_AMOUNT', i + 1, 'amount', 'Invalid')); }
    if (Number.isNaN(tds)) { errors.push(makeErr('BAD_AMOUNT', i + 1, 'tds', 'Invalid')); }
    rows.push({
      assessmentYear: obj.assessmentYear || '',
      informationType: obj.informationType || '',
      sectionDescription: obj.sectionDescription || '',
      incomeType: obj.incomeType || '',
      transactingEntity: obj.transactingEntity || '',
      amount: Number.isNaN(amt) ? 0 : amt,
      tds: Number.isNaN(tds) ? 0 : tds,
      periodStart: obj.periodStart || '',
      periodEnd: obj.periodEnd || '',
    });
  });
  return { rows, errors };
}

export function parseForm26as(text) {
  if (!text || !text.trim()) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No data')] };
  const { headers, data } = csvRows(text);
  if (!headers.length) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No header')] };
  const rows = [];
  const errors = [];
  data.forEach((line, i) => {
    const vals = splitCsvLine(line);
    if (vals.length < headers.length || vals.every(v => !v.trim())) return;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] !== undefined ? vals[j].trim() : ''; });
    const amt = parseAmount(obj.amount);
    const tds = parseAmount(obj.tds);
    if (Number.isNaN(amt)) { errors.push(makeErr('BAD_AMOUNT', i + 1, 'amount', 'Invalid')); }
    if (Number.isNaN(tds)) { errors.push(makeErr('BAD_AMOUNT', i + 1, 'tds', 'Invalid')); }
    rows.push({
      fy: obj.fy || '',
      deductor: obj.deductor || '',
      tan: obj.tan || '',
      section: obj.section || '',
      period: obj.period || '',
      amount: Number.isNaN(amt) ? 0 : amt,
      tds: Number.isNaN(tds) ? 0 : tds,
    });
  });
  return { rows, errors };
}

export function parseIncome(text) {
  if (!text || !text.trim()) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No data')] };
  const { headers, data } = csvRows(text);
  if (!headers.length) return { rows: [], errors: [makeErr('NO_HEADER_ROW', 0, '', 'No header')] };
  const rows = [];
  const errors = [];
  data.forEach((line, i) => {
    const vals = splitCsvLine(line);
    if (vals.length < headers.length || vals.every(v => !v.trim())) return;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] !== undefined ? vals[j].trim() : ''; });
    const val = parseAmount(obj.value);
    if (Number.isNaN(val)) { errors.push(makeErr('BAD_AMOUNT', i + 1, 'value', 'Invalid')); }
    rows.push({
      nature: obj.nature || '',
      value: Number.isNaN(val) ? 0 : val,
      note: obj.note || '',
    });
  });
  return { rows, errors };
}

export function buildItr({ ais = [], tds26 = [], income = [], fy = '2025-26', ageBand = 'below-60' } = {}) {
  const iv = {};
  income.forEach(r => { iv[r.nature] = r.value; });

  const salary = iv.salary || 0;
  const businessProfit = iv.business_profit || 0;
  const otherInterest = iv.other_interest || 0;
  const deduction80c = iv.deduction_80c || 0;
  const deduction80d = iv.deduction_80d || 0;

  const gti = salary + businessProfit + otherInterest;
  const common = {
    fy,
    ageBand,
    residentIndividual: iv.non_resident ? false : true,
    salaryPaise: toPaise(salary),
    otherIncomePaise: toPaise(businessProfit + otherInterest),
    claims: {
      section80CPaise: toPaise(deduction80c),
      healthInsuranceSelfAndFamilyPaise: toPaise(deduction80d),
      healthInsuranceParentsPaise: toPaise(iv.deduction_80d_parents || 0),
      selfAndFamilyIncludesSenior: Boolean(iv.senior_self),
      parentsIncludeSenior: Boolean(iv.senior_parents),
    },
  };
  const newCalc = computeIncomeTax({ ...common, regime: 'new' });
  const oldCalc = computeIncomeTax({ ...common, regime: 'old' });
  if (newCalc.error || oldCalc.error) {
    return { ok: false, error: newCalc.error || oldCalc.error, fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' };
  }
  const newTax = { total: toRupees(newCalc.taxPayablePaise) };
  const oldTax = { total: toRupees(oldCalc.taxPayablePaise) };
  const newRegimeTaxable = toRupees(newCalc.totalIncomePaise);
  const oldRegimeTaxable = toRupees(oldCalc.totalIncomePaise);

  const recommended = newTax.total <= oldTax.total ? 'new' : 'old';
  const recommendedTotal = recommended === 'new' ? newTax.total : oldTax.total;
  const savings = r2(Math.abs(newTax.total - oldTax.total));

  let tdsSalary = 0;
  let tdsOther = 0;
  let tds26Total = 0;
  for (const r of tds26) {
    tds26Total += r.tds;
    if (r.section === '192') {
      tdsSalary += r.tds;
    } else {
      tdsOther += r.tds;
    }
  }

  const tdsCredit = { salary: tdsSalary, other: tdsOther, total: tds26Total };
  const payable = r2(Math.max(recommendedTotal - tdsCredit.total, 0));
  const refund = r2(Math.max(tdsCredit.total - recommendedTotal, 0));

  const salaryDeclared = iv.salary || 0;
  const interestDeclared = iv.other_interest || 0;

  const declaredMap = {
    salary: salaryDeclared,
    dividend: 0,
    rent: 0,
    capital: 0,
    interest: interestDeclared,
  };

  const aisAmounts = {};
  ais.forEach(r => {
    aisAmounts[r.incomeType] = (aisAmounts[r.incomeType] || 0) + r.amount;
  });

  const allTypes = [...new Set(ais.map(r => r.incomeType))].sort();
  const aisVsReturn = [];
  let unexplainedAis = 0;
  for (const t of allTypes) {
    const aisAmt = aisAmounts[t] || 0;
    const decAmt = declaredMap[t] !== undefined ? declaredMap[t] : 0;
    const diff = aisAmt - decAmt;
    if (diff !== 0) {
      aisVsReturn.push({ incomeType: t, ais: aisAmt, declared: decAmt, diff });
      unexplainedAis += diff;
    }
  }

  return {
    fy,
    gti,
    deduction80c: toRupees(oldCalc.section80CPaise),
    deduction80d: toRupees(oldCalc.section80DPaise),
    claimed: { deduction80c, deduction80d },
    taxable: { newRegime: newRegimeTaxable, oldRegime: oldRegimeTaxable },
    tax: { newTotal: newTax.total, oldTotal: oldTax.total },
    recommended,
    savings,
    tdsCredit,
    advanceTax: 0,
    payable,
    refund,
    breakdown: { newRegime: newCalc, oldRegime: oldCalc },
    reconciliations: { aisVsReturn, unexplainedAis: r2(unexplainedAis), tds26Total },
    ok: unexplainedAis === 0,
  };
}
