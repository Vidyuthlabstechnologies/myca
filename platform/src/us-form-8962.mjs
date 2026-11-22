export const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const MONTH_KEYS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1));

const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};
const given = (value) => value !== undefined && value !== null && value !== '';

export function povertyLineFor(table, familySize) {
  const size = Math.max(1, Math.floor(Number(familySize) || 1));
  return Math.round((table.firstPersonCents + (size - 1) * table.additionalPersonCents) / 100);
}

export function povertyTableOf(state) {
  const code = String(state || '').toUpperCase();
  return code === 'AK' ? 'alaska' : code === 'HI' ? 'hawaii' : 'contiguous';
}

export function percentOfPovertyLine(householdIncome, povertyLine) {
  if (povertyLine <= 0) return 0;
  if (householdIncome > povertyLine * 4) return 401;
  return Math.floor((Math.max(0, householdIncome) * 100) / povertyLine);
}

export function applicableFigureBasisPoints(percent, bands) {
  const found = bands.find((item) => item.toPercent === null || percent < item.toPercent) || bands[bands.length - 1];
  if (found.initialBasisPoints === found.finalBasisPoints || found.toPercent === null) return found.initialBasisPoints;
  const span = found.toPercent - found.fromPercent;
  const step = Math.min(Math.max(percent - found.fromPercent, 0), span);
  const numerator = found.initialBasisPoints * span + step * (found.finalBasisPoints - found.initialBasisPoints);
  return Math.floor((2 * numerator + span) / (2 * span));
}

export function repaymentLimitFor(percent, filingStatus, limit) {
  if (!limit?.capped) return null;
  const row = limit.bands.find((item) => percent < item.belowPercent);
  if (!row) return null;
  return Math.round((filingStatus === 'single' ? row.singleCents : row.otherCents) / 100);
}

export function statementMonths(fields = {}) {
  const pick = (prefix, month) => (given(fields[`${prefix}${month}`]) ? whole(fields[`${prefix}${month}`]) : null);
  const months = MONTH_KEYS.map((month) => ({ a: pick('enrollmentPremium', month), b: pick('slcspPremium', month), c: pick('advancePayment', month) }));
  const hasMonthly = months.some((row) => row.a !== null || row.b !== null || row.c !== null);
  const annual = { a: whole(fields.enrollmentPremiumAnnual), b: whole(fields.slcspPremiumAnnual), c: whole(fields.advancePaymentAnnual) };
  return { hasMonthly, months: months.map((row) => ({ a: row.a || 0, b: row.b || 0, c: row.c || 0 })), annual };
}

function combine(statements, checks) {
  const monthly = statements.filter((item) => item.hasMonthly);
  const annualOnly = statements.filter((item) => !item.hasMonthly);
  if (monthly.length && annualOnly.length) {
    checks.push({ level: 'error', code: 'FORM_1095A_MONTHLY_NEEDED', message: 'Some Forms 1095-A have monthly amounts and some only annual totals, so the months cannot be combined.', fix: 'Enter lines 21 to 32 (columns A, B and C) on every Form 1095-A.' });
    return null;
  }
  if (!monthly.length) {
    if (annualOnly.length > 1 && new Set(annualOnly.map((item) => item.annual.b).filter(Boolean)).size > 1) checks.push({ level: 'warning', code: 'FORM_1095A_SLCSP_DIFFERS', message: 'The Forms 1095-A show different second lowest cost silver plan premiums; the largest is used, which is right for policies in one state. Policies in different states add their SLCSP premiums.', fix: 'Check column B with your CPA.' });
    checks.push({ level: 'warning', code: 'FORM_1095A_ANNUAL_ONLY', message: 'Only the line 33 totals of the Form 1095-A were entered, so the annual calculation is used. That is right only if coverage, premiums and the SLCSP premium were the same in all 12 months.', fix: 'If coverage started or changed during the year, enter the monthly amounts (lines 21 to 32).' });
    return { method: 'annual', fromTotals: true, annual: { a: annualOnly.reduce((total, item) => total + item.annual.a, 0), b: Math.max(0, ...annualOnly.map((item) => item.annual.b)), c: annualOnly.reduce((total, item) => total + item.annual.c, 0) } };
  }
  let slcspDiffers = false;
  const months = MONTH_KEYS.map((_, index) => {
    const rows = monthly.map((item) => item.months[index]);
    const slcsp = rows.map((row) => row.b).filter(Boolean);
    if (new Set(slcsp).size > 1) slcspDiffers = true;
    return { a: rows.reduce((total, row) => total + row.a, 0), b: Math.max(0, ...slcsp), c: rows.reduce((total, row) => total + row.c, 0) };
  });
  if (slcspDiffers) checks.push({ level: 'warning', code: 'FORM_1095A_SLCSP_DIFFERS', message: 'The Forms 1095-A show different second lowest cost silver plan premiums for the same month; the largest is used, which is right for policies in one state. Policies in different states add their SLCSP premiums.', fix: 'Check column B with your CPA.' });
  const sameAllYear = monthly.every((item) => item.months.every((row) => row.a > 0 && row.a === item.months[0].a && row.b === item.months[0].b)) && months.every((row) => row.a === months[0].a && row.b === months[0].b);
  return { method: sameAllYear ? 'annual' : 'monthly', fromTotals: false, months, annual: { a: months.reduce((total, row) => total + row.a, 0), b: months.reduce((total, row) => total + row.b, 0), c: months.reduce((total, row) => total + row.c, 0) } };
}

export function computeForm8962(input = {}) {
  const { taxYear, filingStatus, familySize, modifiedAgi, dependentsModifiedAgi = 0, state, statements = [], abuseException = false, enrollmentEstimateException = false, lawfullyPresentException = false, povertyLine, applicableFigure, repaymentLimit } = input;
  const checks = [];
  const combined = combine(statements.map((item) => (item.months ? item : statementMonths(item))), checks);
  if (!combined) return { ok: false, lines: null, netCredit: 0, repayment: 0, checks };
  const aptc = combined.annual.c;
  const tableName = povertyTableOf(state);
  const line1 = Math.max(1, Math.floor(Number(familySize) || 1));
  const line2a = whole(modifiedAgi);
  const line2b = whole(dependentsModifiedAgi);
  const line3 = Math.max(0, line2a + line2b);
  const line4 = povertyLineFor(povertyLine[tableName], line1);
  const line5 = percentOfPovertyLine(line3, line4);
  const separate = filingStatus === 'mfs';
  const incomeLimit = applicableFigure.incomeLimitPercent;
  let reason = '';
  if (separate && !abuseException) reason = 'mfs';
  else if (line5 < 100 && !((enrollmentEstimateException && aptc > 0) || (lawfullyPresentException && applicableFigure.belowPovertyLineLawfullyPresentAllowed))) reason = 'below';
  else if (incomeLimit !== null && line5 > incomeLimit) reason = 'above';
  const applicable = !reason;
  const lines = { A: separate && abuseException, 1: line1, '2a': line2a, '2b': line2b, 3: line3, 4: line4, povertyTable: tableName, 5: line5 };
  if (incomeLimit !== null) lines[6] = reason === 'above' || reason === 'below' ? 'yes' : 'no';
  let figure = 0;
  if (applicable) {
    figure = applicableFigureBasisPoints(line5, applicableFigure.bands);
    lines[7] = figure / 10000;
    lines['8a'] = Math.round((line3 * figure) / 10000);
    lines['8b'] = Math.round(lines['8a'] / 12);
  }
  lines[9] = 'no';
  lines[10] = combined.method === 'annual' ? 'yes' : 'no';
  const row = (a, b, c, f) => {
    if (!applicable) return { f };
    const d = Math.max(0, b - c);
    return { a, b, c, d, e: a > 0 ? Math.min(a, d) : 0, f };
  };
  let line24 = 0;
  let line25 = 0;
  if (combined.method === 'annual') {
    lines[11] = row(combined.annual.a, combined.annual.b, applicable ? lines['8a'] : 0, combined.annual.c);
    line24 = lines[11].e || 0;
    line25 = lines[11].f;
  } else {
    combined.months.forEach((month, index) => {
      if (!month.a && !month.b && !month.c) return;
      const entry = row(month.a, month.b, applicable && month.a > 0 ? lines['8b'] : 0, month.c);
      lines[12 + index] = { month: MONTHS[index], ...entry };
      line24 += entry.e || 0;
      line25 += entry.f;
    });
  }
  lines[24] = line24;
  lines[25] = line25;
  const netCredit = Math.max(0, line24 - line25);
  if (line24 >= line25) lines[26] = netCredit;
  const excess = Math.max(0, line25 - line24);
  let repayment = 0;
  if (excess > 0) {
    lines[27] = excess;
    if (repaymentLimit?.capped) {
      const cap = repaymentLimitFor(line5, filingStatus, repaymentLimit);
      if (cap !== null) lines[28] = cap;
      repayment = cap === null ? excess : Math.min(excess, cap);
      lines[29] = repayment;
    } else repayment = excess;
  }
  if (reason === 'mfs') checks.push({ level: 'warning', code: 'PTC_MFS_NOT_ALLOWED', message: `A married couple filing separately cannot take the premium tax credit${aptc > 0 ? ', so the advance payments are repaid' : ''}, unless the spouse filing is a victim of domestic abuse or spousal abandonment (Form 8962 box A).`, fix: 'File jointly, or answer the domestic abuse question if it applies.' });
  if (reason === 'below') checks.push({ level: 'warning', code: 'PTC_BELOW_POVERTY_LINE', message: `Household income is ${line5}% of the poverty line, below 100%, so no premium tax credit is allowed${aptc > 0 ? ' and the advance payments are repaid' : ''}, unless the Marketplace estimated at enrollment that income would be at least 100% and advance payments were made${applicableFigure.belowPovertyLineLawfullyPresentAllowed ? ' (or the person enrolled is a lawfully present alien not eligible for Medicaid because of immigration status)' : ''}.`, fix: 'Answer the enrollment estimate question if the Marketplace estimated higher income.' });
  if (reason === 'above') checks.push({ level: 'warning', code: 'PTC_ABOVE_400_PERCENT', message: `Household income is more than 400% of the poverty line, so for ${taxYear} no premium tax credit is allowed${aptc > 0 ? ' and all advance payments are repaid' : ''}.`, fix: '' });
  return { ok: true, method: combined.method, applicable, reason, figureBasisPoints: figure, lines, netCredit, repayment, advancePayments: aptc, checks };
}
