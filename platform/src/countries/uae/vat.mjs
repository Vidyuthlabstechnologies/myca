import { EMIRATES, emirateOf, fail, toFils, toDirhams, isIsoDate, iso, lastDayOf, addDays, monthsBetween, ruleOn, ruleNote, percentOf } from './common.mjs';

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])\/(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER = /^(\d{4})-Q([1-4])$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FULL_RECOVERY = 10000;

export const SUPPLY_TREATMENTS = Object.freeze(['standard', 'zero-rated', 'exempt', 'out-of-scope']);
export const EXPENSE_TREATMENTS = Object.freeze(['standard', 'reverse-charge', 'import', 'import-adjustment', 'zero-rated', 'exempt', 'out-of-scope']);

export function parseVatPeriod(text) {
  const value = String(text || '').trim();
  let startYear;
  let startMonth;
  let endYear;
  let endMonth;
  if (PERIOD.test(value)) {
    const match = value.match(PERIOD);
    [startYear, startMonth, endYear, endMonth] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  } else if (QUARTER.test(value)) {
    const match = value.match(QUARTER);
    startYear = Number(match[1]);
    endYear = startYear;
    startMonth = (Number(match[2]) - 1) * 3 + 1;
    endMonth = startMonth + 2;
  } else if (MONTH.test(value)) {
    const match = value.match(MONTH);
    [startYear, startMonth] = [Number(match[1]), Number(match[2])];
    [endYear, endMonth] = [startYear, startMonth];
  } else {
    return fail('BAD_PERIOD', { period: value, hint: 'Write the tax period as 2026-01/2026-03, 2026-Q1 or 2026-01 for a monthly period.' });
  }
  const start = iso(startYear, startMonth, 1);
  const end = iso(endYear, endMonth, lastDayOf(endYear, endMonth));
  const months = monthsBetween(start, end) + 1;
  if (months < 1) return fail('BAD_PERIOD', { period: value, hint: 'The period ends before it starts.' });
  if (months > 12) return fail('BAD_PERIOD', { period: value, hint: 'A VAT tax period is at most twelve months.' });
  const rule = ruleOn('ae.vat.return-period', end);
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.vat.return-period', date: end, hint: 'UAE VAT started on 1 January 2018.' });
  const warnings = [];
  if (months !== 1 && months !== 3) warnings.push(`This is a ${months}-month period. The FTA assigns quarters or months; use another length only if your FTA certificate says so.`);
  const label = `${iso(startYear, startMonth, 1).slice(0, 7)}/${iso(endYear, endMonth, 1).slice(0, 7)}`;
  return { ok: true, start, end, months, label, due: addDays(end, rule.value.dueDaysAfterPeriodEnd), rule, warnings };
}

export function expectedVatPeriodMonths(annualTurnover, date) {
  const rule = ruleOn('ae.vat.return-period', date);
  if (!rule) return null;
  const turnover = toFils(annualTurnover);
  if (turnover === null) return null;
  return turnover >= rule.value.quarterlyBelowFils ? rule.value.monthlyMonths : rule.value.months;
}

function emptyBox() {
  return { net: 0, vat: 0, adjustment: 0 };
}

function boxOut(box) {
  return { net: toDirhams(box.net), vat: toDirhams(box.vat), adjustment: toDirhams(box.adjustment) };
}

function money(value, field, at, problems, { allowNegative = true } = {}) {
  if (value === undefined || value === null || value === '') return 0;
  const fils = toFils(value);
  if (fils === null) {
    problems.push({ line: at, field, why: 'Not a number.' });
    return 0;
  }
  if (!allowNegative && fils < 0) {
    problems.push({ line: at, field, why: 'Cannot be negative.' });
    return 0;
  }
  return fils;
}

function recoveryOf(line, at, problems) {
  if (line.blocked === true) return 0;
  if (line.recoveryBasisPoints === undefined || line.recoveryBasisPoints === null) return FULL_RECOVERY;
  const bp = Number(line.recoveryBasisPoints);
  if (!Number.isInteger(bp) || bp < 0 || bp > FULL_RECOVERY) {
    problems.push({ line: at, field: 'recoveryBasisPoints', why: 'The recoverable share is a whole number of basis points from 0 to 10000.' });
    return FULL_RECOVERY;
  }
  return bp;
}

function taxOn(line, net, rate, at, problems, warnings, field = 'vat') {
  const expected = percentOf(net, rate);
  if (line[field] === undefined || line[field] === null || line[field] === '') return expected;
  const given = money(line[field], field, at, problems);
  if (Math.abs(given - expected) > 1 + Math.ceil(Math.abs(net) / 1000000)) warnings.push(`Line ${at + 1}: VAT of AED ${toDirhams(given).toFixed(2)} is not 5% of AED ${toDirhams(net).toFixed(2)} (expected AED ${toDirhams(expected).toFixed(2)}). The return uses the invoice figure; check it.`);
  return given;
}

export function vatReturn(args = {}) {
  const period = parseVatPeriod(args.period);
  if (!period.ok) return period;
  const lines = Array.isArray(args.lines) ? args.lines : null;
  if (!lines) return fail('BAD_LINES', { hint: 'Give the period\'s sales and purchases as a list of lines.' });
  const rate = ruleOn('ae.vat.rate', period.end);
  if (!rate) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.vat.rate', date: period.end });
  const standard = rate.value.standardBasisPoints;
  const problems = [];
  const warnings = [...period.warnings];
  const byEmirate = Object.fromEntries(EMIRATES.map((emirate) => [emirate.box, emptyBox()]));
  const boxes = { '2': emptyBox(), '3': emptyBox(), '4': emptyBox(), '5': emptyBox(), '6': emptyBox(), '7': emptyBox(), '9': emptyBox(), '10': emptyBox() };
  const importsFromLines = emptyBox();
  let blockedVat = 0;
  let outsidePeriod = 0;
  let ignored = 0;

  lines.forEach((line, at) => {
    if (!line || typeof line !== 'object') {
      problems.push({ line: at, field: 'line', why: 'Each line is an object.' });
      return;
    }
    const kind = line.kind;
    const treatment = String(line.treatment || 'standard');
    if (line.date !== undefined && line.date !== null && line.date !== '') {
      if (!isIsoDate(line.date)) problems.push({ line: at, field: 'date', why: 'Write the date as YYYY-MM-DD.' });
      else if (line.date < period.start || line.date > period.end) outsidePeriod += 1;
    }
    const net = money(line.net, 'net', at, problems);
    const adjustment = money(line.adjustment, 'adjustment', at, problems);
    if (kind === 'supply') {
      if (!SUPPLY_TREATMENTS.includes(treatment)) {
        problems.push({ line: at, field: 'treatment', why: treatment === 'reverse-charge' ? 'A supply under the domestic reverse charge is accounted for by the buyer; record it as zero VAT out of scope of your boxes and keep the invoice narrative.' : `A sale is one of ${SUPPLY_TREATMENTS.join(', ')}.` });
        return;
      }
      if (treatment === 'standard') {
        const emirate = emirateOf(line.emirate);
        if (!emirate) {
          problems.push({ line: at, field: 'emirate', why: 'A standard-rated sale is reported by the emirate of the establishment that made it: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.' });
          return;
        }
        const box = byEmirate[emirate.box];
        box.net += net;
        box.vat += taxOn(line, net, standard, at, problems, warnings);
        box.adjustment += adjustment;
      } else if (treatment === 'zero-rated') {
        boxes['4'].net += net;
      } else if (treatment === 'exempt') {
        boxes['5'].net += net;
      } else {
        ignored += 1;
      }
      if (adjustment && treatment !== 'standard') problems.push({ line: at, field: 'adjustment', why: 'Only standard-rated sales (box 1) and expenses (box 9) carry an adjustment.' });
      return;
    }
    if (kind === 'expense') {
      if (!EXPENSE_TREATMENTS.includes(treatment)) {
        problems.push({ line: at, field: 'treatment', why: `A purchase is one of ${EXPENSE_TREATMENTS.join(', ')}.` });
        return;
      }
      const recovery = recoveryOf(line, at, problems);
      if (treatment === 'standard') {
        const vat = taxOn(line, net, standard, at, problems, warnings);
        const recoverable = percentOf(vat, recovery);
        if (line.blocked === true) blockedVat += vat;
        boxes['9'].net += net;
        boxes['9'].vat += recoverable;
        boxes['9'].adjustment += adjustment;
      } else if (treatment === 'reverse-charge' || treatment === 'import' || treatment === 'import-adjustment') {
        const vat = taxOn(line, net, standard, at, problems, warnings);
        const target = treatment === 'reverse-charge' ? boxes['3'] : treatment === 'import' ? importsFromLines : boxes['7'];
        target.net += net;
        target.vat += vat;
        const recoverable = percentOf(vat, recovery);
        if (line.blocked === true) blockedVat += vat;
        boxes['10'].net += net;
        boxes['10'].vat += recoverable;
        if (adjustment) problems.push({ line: at, field: 'adjustment', why: 'Only standard-rated sales (box 1) and expenses (box 9) carry an adjustment.' });
      } else {
        ignored += 1;
        if (adjustment) problems.push({ line: at, field: 'adjustment', why: 'Only standard-rated sales (box 1) and expenses (box 9) carry an adjustment.' });
      }
      return;
    }
    problems.push({ line: at, field: 'kind', why: 'Each line is a supply (a sale) or an expense (a purchase).' });
  });

  const refunds = args.touristRefunds || null;
  if (refunds) {
    boxes['2'].net = -Math.abs(money(refunds.net, 'touristRefunds.net', -1, problems));
    boxes['2'].vat = -Math.abs(money(refunds.vat, 'touristRefunds.vat', -1, problems));
  }
  const customs = args.customsImports || null;
  if (customs) {
    boxes['6'].net = money(customs.net, 'customsImports.net', -1, problems);
    boxes['6'].vat = money(customs.vat, 'customsImports.vat', -1, problems);
    if (importsFromLines.vat && Math.abs(importsFromLines.vat - boxes['6'].vat) > 100) warnings.push(`Import VAT on your purchase lines (AED ${toDirhams(importsFromLines.vat).toFixed(2)}) differs from the customs figure (AED ${toDirhams(boxes['6'].vat).toFixed(2)}). Box 6 uses the customs figure that EmaraTax fills in; recover only what customs shows.`);
  } else {
    boxes['6'].net = importsFromLines.net;
    boxes['6'].vat = importsFromLines.vat;
    if (importsFromLines.net) warnings.push('Box 6 is filled by EmaraTax from customs declarations; check it matches the import VAT shown there.');
  }

  if (problems.length) return fail('VAT_RETURN_LINES_INVALID', { problems, hint: 'Fix these lines; nothing was totalled.' });

  if (outsidePeriod) warnings.push(`${outsidePeriod} line${outsidePeriod === 1 ? ' is' : 's are'} dated outside ${period.label}. VAT is reported in the period of the tax point; move them if they belong elsewhere.`);
  if (ignored) warnings.push(`${ignored} out-of-scope or non-recoverable line${ignored === 1 ? ' was' : 's were'} left out of the boxes.`);
  if (blockedVat) warnings.push(`AED ${toDirhams(blockedVat).toFixed(2)} of input VAT is blocked (for example entertainment or private motor vehicles) and is not recovered.`);

  const box1 = Object.values(byEmirate).reduce((sum, box) => ({ net: sum.net + box.net, vat: sum.vat + box.vat, adjustment: sum.adjustment + box.adjustment }), emptyBox());
  const box8 = {
    net: box1.net + boxes['2'].net + boxes['3'].net + boxes['4'].net + boxes['5'].net + boxes['6'].net + boxes['7'].net,
    vat: box1.vat + box1.adjustment + boxes['2'].vat + boxes['3'].vat + boxes['6'].vat + boxes['7'].vat,
    adjustment: box1.adjustment,
  };
  const box11 = { net: boxes['9'].net + boxes['10'].net, vat: boxes['9'].vat + boxes['9'].adjustment + boxes['10'].vat, adjustment: boxes['9'].adjustment };
  const totalDue = box8.vat;
  const totalRecoverable = box11.vat;
  const payable = totalDue - totalRecoverable;
  const turnoverMonths = args.annualTurnover !== undefined ? expectedVatPeriodMonths(args.annualTurnover, period.end) : null;
  if (turnoverMonths && turnoverMonths !== period.months) warnings.push(`With annual turnover of AED ${Number(args.annualTurnover).toLocaleString('en-AE')} the FTA normally assigns ${turnoverMonths === 1 ? 'monthly' : 'quarterly'} periods.`);
  if (payable < 0) warnings.push('Box 14 is a refund position. Choose in box 15 whether to claim it now (a refund request on EmaraTax) or carry it forward.');

  const out = Object.fromEntries(Object.entries(byEmirate).map(([key, box]) => [key, boxOut(box)]));
  for (const key of ['2', '3', '4', '5', '6', '7']) out[key] = boxOut(boxes[key]);
  out['8'] = boxOut(box8);
  out['9'] = boxOut(boxes['9']);
  out['10'] = boxOut(boxes['10']);
  out['11'] = boxOut(box11);
  return {
    ok: true,
    data: {
      form: 'VAT201',
      period: period.label,
      start: period.start,
      end: period.end,
      due: period.due,
      boxes: out,
      totalDue: toDirhams(totalDue),
      totalRecoverable: toDirhams(totalRecoverable),
      payable: toDirhams(payable),
      refund: payable < 0,
      emirates: EMIRATES.map((emirate) => ({ box: emirate.box, code: emirate.code, en: emirate.en, ar: emirate.ar })),
      warnings,
      filedBy: 'The business or its registered tax agent files this on EmaraTax; MyCA prepares it.',
      ...ruleNote(rate),
    },
  };
}

export function vatRegistrationCheck(args = {}) {
  const date = args.date || new Date().toISOString().slice(0, 10);
  if (!isIsoDate(date)) return fail('BAD_DATE', { date });
  const rule = ruleOn('ae.vat.registration', date);
  if (!rule) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.vat.registration', date });
  const problems = [];
  const last12 = money(args.taxableSuppliesLast12Months, 'taxableSuppliesLast12Months', -1, problems, { allowNegative: false });
  const next30 = money(args.expectedNext30Days, 'expectedNext30Days', -1, problems, { allowNegative: false });
  const expenses = money(args.taxableExpensesLast12Months, 'taxableExpensesLast12Months', -1, problems, { allowNegative: false });
  if (problems.length) return fail('BAD_AMOUNTS', { problems });
  const { mandatoryFils, voluntaryFils, registerWithinDays } = rule.value;
  let status = 'not-required';
  let why = `Taxable supplies are below the voluntary threshold of AED ${toDirhams(voluntaryFils).toLocaleString('en-AE')}.`;
  if (last12 > mandatoryFils || next30 > mandatoryFils) {
    status = 'must-register';
    why = last12 > mandatoryFils
      ? `Taxable supplies of the last 12 months passed AED ${toDirhams(mandatoryFils).toLocaleString('en-AE')}. Apply on EmaraTax within ${registerWithinDays} days of passing it.`
      : `Supplies expected in the next 30 days pass AED ${toDirhams(mandatoryFils).toLocaleString('en-AE')}. Apply on EmaraTax before the end of those 30 days.`;
  } else if (last12 > voluntaryFils || next30 > voluntaryFils || expenses > voluntaryFils) {
    status = 'may-register';
    why = `Taxable supplies or expenses pass AED ${toDirhams(voluntaryFils).toLocaleString('en-AE')}, so voluntary registration is open; it lets the business recover input VAT.`;
  }
  return { ok: true, data: { status, why, mandatoryThreshold: toDirhams(mandatoryFils), voluntaryThreshold: toDirhams(voluntaryFils), lateRegistrationPenalty: 10000, ...ruleNote(rule) } };
}
