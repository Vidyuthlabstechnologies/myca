import { ruleSet, gbRule, toPence, toPounds, share, monthEndPlus, isIsoDate } from './rules.mjs';

export const VAT_SCHEMES = Object.freeze(['standard', 'flat-rate']);
export const VAT_RATE_NAMES = Object.freeze(['standard', 'reduced', 'zero', 'exempt', 'outside-scope']);
const MAX_MONEY = 9999999999999.99;
const MAX_NET = 99999999999.99;
const PERIOD_KEY = /^[A-Z0-9#]{4}$/;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function rateBasisPoints(rates, line) {
  if (Number.isInteger(line.rateBasisPoints)) return line.rateBasisPoints;
  const name = String(line.rate || 'standard');
  if (name === 'standard') return rates.standardBasisPoints;
  if (name === 'reduced') return rates.reducedBasisPoints;
  if (name === 'zero' || name === 'exempt' || name === 'outside-scope') return 0;
  return null;
}

function lineVat(rates, line) {
  const net = toPence(line.net);
  if (line.vat !== undefined && line.vat !== null) return { net, vat: toPence(line.vat) };
  const bp = rateBasisPoints(rates, line);
  if (bp === null) return null;
  return { net, vat: share(net, bp, 'half-up') };
}

function wholePounds(pence) {
  return Math.trunc(pence / 100);
}

export function vatReturnProblems(body) {
  const problems = [];
  const money = ['vatDueSales', 'vatDueAcquisitions', 'totalVatDue', 'vatReclaimedCurrPeriod'];
  const whole = ['totalValueSalesExVAT', 'totalValuePurchasesExVAT', 'totalValueGoodsSuppliedExVAT', 'totalAcquisitionsExVAT'];
  if (!PERIOD_KEY.test(String(body.periodKey || ''))) problems.push({ field: 'periodKey', why: 'The period key is the four characters HMRC gives with the obligation.' });
  for (const field of money) {
    const value = body[field];
    if (!Number.isFinite(value) || Math.abs(value) > MAX_MONEY || Math.round(value * 100) !== value * 100) problems.push({ field, why: 'An amount in pounds with at most two decimal places.' });
  }
  if (!Number.isFinite(body.netVatDue) || body.netVatDue < 0 || body.netVatDue > MAX_NET || Math.round(body.netVatDue * 100) !== body.netVatDue * 100) problems.push({ field: 'netVatDue', why: 'Box 5 is never negative: it is the difference between box 3 and box 4.' });
  for (const field of whole) if (!Number.isInteger(body[field]) || Math.abs(body[field]) > 9999999999999) problems.push({ field, why: 'Boxes 6 to 9 are whole pounds.' });
  if (Number.isFinite(body.vatDueSales) && Number.isFinite(body.vatDueAcquisitions) && toPence(body.totalVatDue) !== toPence(body.vatDueSales) + toPence(body.vatDueAcquisitions)) problems.push({ field: 'totalVatDue', why: 'Box 3 must equal box 1 plus box 2.' });
  if (Number.isFinite(body.totalVatDue) && Number.isFinite(body.vatReclaimedCurrPeriod) && toPence(body.netVatDue) !== Math.abs(toPence(body.totalVatDue) - toPence(body.vatReclaimedCurrPeriod))) problems.push({ field: 'netVatDue', why: 'Box 5 must equal the difference between box 3 and box 4.' });
  if (body.finalised !== true) problems.push({ field: 'finalised', why: 'The owner must declare the return is true and complete before it is sent.' });
  return problems;
}

export function buildVatReturn(args = {}) {
  const date = isIsoDate(args.to) ? args.to : new Date().toISOString().slice(0, 10);
  const { values, used, missing } = ruleSet({ rates: 'gb.vat.rates', schemes: 'gb.vat.schemes', due: 'gb.vat.return' }, date);
  if (missing.length) return fail('RULES_MISSING', { missing });
  const scheme = String(args.scheme || 'standard');
  if (!VAT_SCHEMES.includes(scheme)) return fail('BAD_VAT_SCHEME', { schemes: VAT_SCHEMES });
  const sales = Array.isArray(args.sales) ? args.sales : [];
  const purchases = Array.isArray(args.purchases) ? args.purchases : [];
  const notes = [];
  const totals = { box1: 0, box2: 0, box4: 0, box6: 0, box7: 0, box8: 0, box9: 0 };
  for (const [index, line] of sales.entries()) {
    const out = lineVat(values.rates, line || {});
    if (!out) return fail('BAD_VAT_RATE', { line: `sales[${index}]`, rates: VAT_RATE_NAMES });
    totals.box6 += out.net;
    if (scheme === 'standard') totals.box1 += out.vat;
    if (line.euGoods) totals.box8 += out.net;
  }
  for (const [index, line] of purchases.entries()) {
    const out = lineVat(values.rates, line || {});
    if (!out) return fail('BAD_VAT_RATE', { line: `purchases[${index}]`, rates: VAT_RATE_NAMES });
    totals.box7 += out.net;
    if (line.euGoods) {
      totals.box9 += out.net;
      totals.box2 += out.vat;
      totals.box4 += out.vat;
      continue;
    }
    if (line.blocked) { notes.push(`purchases[${index}]: VAT on this cost is blocked (for example business entertainment or a car) and is not reclaimed.`); continue; }
    if (scheme === 'standard') totals.box4 += out.vat;
    else if (line.capitalAsset && toPence(line.net) + out.vat >= 200000) totals.box4 += out.vat;
  }
  let flat = null;
  if (scheme === 'flat-rate') {
    const gross = sales.reduce((sum, line) => { const out = lineVat(values.rates, line || {}); return sum + out.net + out.vat; }, 0);
    const goods = purchases.filter((line) => line && line.relevantGoods).reduce((sum, line) => { const out = lineVat(values.rates, line); return sum + out.net + out.vat; }, 0);
    const months = Number.isInteger(args.periodMonths) ? args.periodMonths : 3;
    const limitedCost = goods < share(gross, values.schemes.limitedCostShareBasisPoints) || goods < Math.round(values.schemes.limitedCostYearlyPence * months / 12);
    let rateBp = Number.isInteger(args.flatRateBasisPoints) ? args.flatRateBasisPoints : null;
    if (limitedCost) rateBp = values.schemes.limitedCostTraderBasisPoints;
    if (rateBp === null) return fail('FLAT_RATE_NEEDED', { hint: 'Give the flat rate percentage for the trade sector as basis points (12.5% is 1250).' });
    if (args.firstYearOfRegistration && !limitedCost) rateBp = Math.max(0, rateBp - values.schemes.firstYearDiscountBasisPoints);
    totals.box1 = share(gross, rateBp, 'half-up');
    totals.box6 = gross;
    flat = { grossTurnover: toPounds(gross), relevantGoods: toPounds(goods), limitedCostTrader: limitedCost, ratePercent: rateBp / 100 };
    if (limitedCost) notes.push('Spending on goods is under 2% of turnover (or under £1,000 a year), so the 16.5% limited cost trader rate applies.');
  }
  const box3 = totals.box1 + totals.box2;
  const body = {
    periodKey: String(args.periodKey || '').toUpperCase(),
    vatDueSales: toPounds(totals.box1),
    vatDueAcquisitions: toPounds(totals.box2),
    totalVatDue: toPounds(box3),
    vatReclaimedCurrPeriod: toPounds(totals.box4),
    netVatDue: toPounds(Math.abs(box3 - totals.box4)),
    totalValueSalesExVAT: wholePounds(totals.box6),
    totalValuePurchasesExVAT: wholePounds(totals.box7),
    totalValueGoodsSuppliedExVAT: wholePounds(totals.box8),
    totalAcquisitionsExVAT: wholePounds(totals.box9),
    finalised: args.finalised === true,
  };
  const problems = vatReturnProblems(body).filter((problem) => args.finalised === true || problem.field !== 'finalised');
  const due = isIsoDate(args.to) ? monthEndPlus(args.to, values.due.dueMonthsAndDaysAfterPeriodEnd.months, values.due.dueMonthsAndDaysAfterPeriodEnd.days) : null;
  return {
    ok: true,
    data: {
      scheme,
      body,
      boxes: { 1: body.vatDueSales, 2: body.vatDueAcquisitions, 3: body.totalVatDue, 4: body.vatReclaimedCurrPeriod, 5: body.netVatDue, 6: body.totalValueSalesExVAT, 7: body.totalValuePurchasesExVAT, 8: body.totalValueGoodsSuppliedExVAT, 9: body.totalAcquisitionsExVAT },
      direction: box3 > totals.box4 ? 'pay' : box3 < totals.box4 ? 'refund' : 'nil',
      flatRate: flat,
      dueBy: due,
      problems,
      ready: problems.length === 0,
      notes,
      rulesUsed: used,
      unreviewed: used.some((entry) => entry.unreviewed),
    },
  };
}

export function vatRegistrationCheck(args = {}) {
  const date = isIsoDate(args.date) ? args.date : new Date().toISOString().slice(0, 10);
  const rule = gbRule('gb.vat.registration', date);
  if (!rule) return fail('RULES_MISSING', { missing: ['gb.vat.registration'] });
  const value = rule.value;
  const last12 = toPence(args.last12Months);
  const next30 = toPence(args.next30Days);
  const registered = args.registered === true;
  if (registered) {
    const may = last12 < value.deregisterBelowPence && (args.next12Months === undefined || toPence(args.next12Months) < value.deregisterBelowPence);
    return { ok: true, data: { registered, mayDeregister: may, thresholdToDeregister: toPounds(value.deregisterBelowPence), why: may ? 'Taxable turnover is under the deregistration threshold, so the business may ask to deregister.' : 'Taxable turnover is at or over the deregistration threshold.', ruleId: rule.id } };
  }
  const historic = last12 > value.registerAbovePence;
  const forward = next30 > value.registerAbovePence;
  const must = historic || forward;
  return {
    ok: true,
    data: {
      registered,
      mustRegister: must,
      threshold: toPounds(value.registerAbovePence),
      test: forward ? 'forward-30-days' : historic ? 'rolling-12-months' : 'none',
      headroom: toPounds(Math.max(0, value.registerAbovePence - last12)),
      why: forward ? 'Turnover expected in the next 30 days alone is over the threshold: register by the end of those 30 days, effective from the start of them.' : historic ? 'Turnover in the last 12 months is over the threshold: tell HMRC within 30 days of the end of the month it went over; registration starts on the first day of the second month.' : 'Under the registration threshold; voluntary registration is allowed.',
      ruleId: rule.id,
      unreviewed: !(rule.attestations || []).length,
    },
  };
}
