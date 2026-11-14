import { rules } from '../../sprint-load.mjs';
import { progressiveTax } from '../kit/index.mjs';

const CATEGORIES = new Set([1, 2, 3]);

function ruleOn(id, date) {
  const found = rules.rule(id, date);
  return found.ok ? found.record : null;
}

export function pcbRules(date) {
  const pcb = ruleOn('my.payroll.pcb', date);
  if (!pcb) return null;
  const bands = ruleOn(pcb.value.bands, date);
  const rebate = ruleOn(pcb.value.rebate, date);
  const nonResident = ruleOn(pcb.value.nonResidentRate, date);
  if (!bands || !rebate || !nonResident) return null;
  return { pcb, bands, rebate, nonResident };
}

function bandTax(sen, bands) {
  const out = progressiveTax(sen, bands.map((band) => ({ over: band.fromSen, rateBp: band.basisPoints })));
  return out.ok ? out.tax : 0;
}

export function yearlyTaxSen(chargeableSen, category, used) {
  const bands = used.bands.value.bands;
  const P = Math.max(0, chargeableSen);
  const band = [...bands].reverse().find((row) => P > row.fromSen) || bands[0];
  const M = band.fromSen;
  const r = used.rebate.value;
  const rebateSen = P <= r.chargeableIncomeAtMostSen ? r.selfSen + (category === 2 ? r.spouseSen : 0) : 0;
  const B = bandTax(M, bands) - rebateSen;
  return { P, M, R: band.basisPoints, B, taxSen: ((P - M) * band.basisPoints) / 10000 + B };
}

function roundPcb(sen, step) {
  if (!(sen > 0)) return 0;
  return Math.ceil(Math.floor(sen + 1e-9) / step) * step;
}

function reliefsSen(input, value) {
  return value.individualReliefSen + (input.category === 2 ? value.spouseReliefSen : 0) + value.childReliefSen * input.children + input.ytd.deductionsSen + input.deductionsSen;
}

function chargeable(input, value, withBonus) {
  const n = 12 - input.month;
  const cap = value.epfReliefCapSen;
  const K = Math.min(input.ytd.epfSen, cap);
  const K1 = Math.min(input.epfSen, Math.max(0, cap - K));
  const Kt = withBonus ? Math.min(input.bonusEpfSen, Math.max(0, cap - K - K1)) : 0;
  const K2 = n > 0 ? Math.min(K1, Math.max(0, cap - (K + K1 + Kt)) / n) : 0;
  const income = (input.ytd.incomeSen - K) + (input.wageSen - K1) + (input.wageSen - K2) * n + (withBonus ? input.bonusSen - Kt : 0);
  return income - reliefsSen(input, value);
}

function oneMonth(input, used) {
  const value = used.pcb.value;
  const step = value.roundUpToSen;
  if (!input.resident) {
    const total = roundPcb(((input.wageSen + input.bonusSen) * used.nonResident.value.basisPoints) / 10000, step);
    return { normalSen: total, bonusSen: 0, chargeableSen: null, yearlyTaxSen: null };
  }
  const n = 12 - input.month;
  const paid = input.ytd.pcbSen + input.ytd.zakatSen;
  const normal = yearlyTaxSen(chargeable(input, value, false), input.category, used);
  const normalSen = roundPcb((normal.taxSen - paid) / (n + 1), step);
  if (!(input.bonusSen > 0)) return { normalSen, bonusSen: 0, chargeableSen: Math.max(0, Math.round(normal.P)), yearlyTaxSen: Math.max(0, Math.round(normal.taxSen)) };
  const whole = yearlyTaxSen(chargeable(input, value, true), input.category, used);
  const bonusSen = roundPcb(whole.taxSen - (paid + normalSen * (n + 1)), step);
  return { normalSen, bonusSen, chargeableSen: Math.max(0, Math.round(whole.P)), yearlyTaxSen: Math.max(0, Math.round(whole.taxSen)) };
}

export function readPcbProfile(employee, toSen) {
  const problems = [];
  const category = employee.pcbCategory === undefined ? 1 : Number(employee.pcbCategory);
  if (!CATEGORIES.has(category)) problems.push({ field: 'pcbCategory', why: 'PCB category is 1 (single), 2 (married, spouse not working) or 3 (married, spouse working, or a single parent).' });
  const children = employee.children === undefined ? 0 : Number(employee.children);
  if (!Number.isInteger(children) || children < 0 || children > 30) problems.push({ field: 'children', why: 'Children is the number of children the employee claims relief for, a whole number.' });
  const amount = (field, raw) => {
    if (raw === undefined || raw === null || raw === '') return 0;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) { problems.push({ field, why: 'This is an amount in ringgit, zero or more.' }); return 0; }
    return toSen(number);
  };
  const ytdRaw = employee.yearToDate && typeof employee.yearToDate === 'object' ? employee.yearToDate : null;
  const ytd = ytdRaw ? {
    incomeSen: amount('yearToDate.income', ytdRaw.income),
    epfSen: amount('yearToDate.epf', ytdRaw.epf),
    pcbSen: amount('yearToDate.pcb', ytdRaw.pcb),
    zakatSen: amount('yearToDate.zakat', ytdRaw.zakat),
    deductionsSen: amount('yearToDate.deductions', ytdRaw.deductions),
  } : null;
  return {
    problems,
    profile: {
      resident: employee.resident !== false,
      category,
      children,
      ytd,
      zakatSen: amount('zakat', employee.zakat),
      deductionsSen: amount('deductions', employee.deductions),
    },
  };
}

export function monthlyPcb({ month, wageSen, epfSen, bonusSen = 0, bonusEpfSen = 0, profile }, used) {
  const value = used.pcb.value;
  const base = { month, wageSen, epfSen, bonusSen, bonusEpfSen, resident: profile.resident, category: profile.category, children: profile.children, deductionsSen: profile.deductionsSen };
  let ytd = profile.ytd;
  let assumed = false;
  if (!ytd) {
    assumed = month > 1;
    ytd = { incomeSen: 0, epfSen: 0, pcbSen: 0, zakatSen: 0, deductionsSen: 0 };
    for (let earlier = 1; earlier < month; earlier += 1) {
      const out = oneMonth({ ...base, month: earlier, bonusSen: 0, bonusEpfSen: 0, ytd }, used);
      ytd = { ...ytd, incomeSen: ytd.incomeSen + wageSen, epfSen: ytd.epfSen + epfSen, pcbSen: ytd.pcbSen + (out.normalSen < value.minimumSen ? 0 : out.normalSen) };
    }
  }
  const out = oneMonth({ ...base, ytd }, used);
  const grossSen = out.normalSen + out.bonusSen;
  const beforeZakat = grossSen < value.minimumSen ? 0 : grossSen;
  const afterZakat = Math.max(0, beforeZakat - profile.zakatSen);
  const pcbSen = afterZakat < value.minimumSen ? 0 : afterZakat;
  return {
    pcbSen,
    normalSen: out.normalSen,
    bonusPcbSen: out.bonusSen,
    zakatOffsetSen: beforeZakat - afterZakat,
    chargeableSen: out.chargeableSen,
    yearlyTaxSen: out.yearlyTaxSen,
    assumedSamePaySinceJanuary: assumed,
    method: profile.resident ? 'computerised' : 'non-resident flat rate',
  };
}
