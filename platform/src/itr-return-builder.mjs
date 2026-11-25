// Builds an income tax return JSON (ITR-4 Sugam and ITR-3) for upload to the e-filing portal,
// computes the tax with MyCA's dated rules, and checks the result against the official CBDT
// schema held in itr-knowledge. All amounts in and out are whole rupees (the JSON is in rupees).
import { loadItrForm } from './itr-knowledge.mjs';
import { validateAgainstSchema } from './itr-json-check.mjs';
import { incomeTax, rules } from './sprint-load.mjs';
import { booksFigures } from './itr-books.mjs';
import { depreciationSchedule } from './it-depreciation.mjs';

const PAISE = 100;
const SCHEMA_AY = { 'ITR-3': '2025', 'ITR-4': '2025' };
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_CODES = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '99']);
const ITR4_BUSINESS_CODES = new Set(['01001', '01002', '01003', '01004', '01005']);

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

const rupees = (value) => Math.max(0, Math.round(Number(value) || 0));
const signed = (value) => Math.round(Number(value) || 0);
const sum = (...values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

export function assessmentYearOf(fy) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(fy || ''));
  if (!match) return null;
  const start = Number(match[1]);
  if (Number(match[2]) !== (start + 1) % 100) return null;
  return { fy, ayStart: start + 1, ayLabel: `${start + 1}-${String(start + 2).slice(2)}`, fyStart: `${start}-04-01`, fyEnd: `${start + 1}-03-31` };
}

// ---------------------------------------------------------------------------------------------
// Schema-driven skeleton: every required field filled with a value that satisfies its type/enum.
// ---------------------------------------------------------------------------------------------
const PATTERN_FILL = [
  [/S\]\[W\]/, 'SW00000001'],
  [/A-Z\]\{5\}/, 'AAAAA0000A'],
  [/@/, 'unset@example.invalid'],
  [/\(\[12\]\\d\{3\}/, '2025-01-01'],
];

function skeletonFor(form) {
  const schema = loadItrForm(form, 'schema');
  if (!schema) return null;
  const defs = schema.definitions || {};
  const resolve = (node) => {
    let current = node;
    let guard = 0;
    while (current && current.$ref && guard < 32) {
      const target = defs[current.$ref.replace(/^#\/definitions\//, '')] || {};
      const { $ref, ...rest } = current;
      current = { ...target, ...rest };
      guard += 1;
    }
    return current || {};
  };
  const make = (rawNode) => {
    const node = resolve(rawNode);
    if (node.enum) return node.enum[0];
    const type = Array.isArray(node.type) ? node.type[0] : node.type;
    if (type === 'object' || node.properties) {
      const out = {};
      for (const key of node.required || []) if (node.properties?.[key]) out[key] = make(node.properties[key]);
      return out;
    }
    if (type === 'array') return [];
    if (type === 'integer' || type === 'number') return Math.max(0, Number(node.minimum) || 0);
    if (type === 'boolean') return false;
    if (node.pattern) {
      const hit = PATTERN_FILL.find(([re]) => re.test(node.pattern));
      if (hit) return hit[1];
    }
    return '';
  };
  const root = resolve(schema.properties.ITR).properties;
  const key = Object.keys(root)[0];
  return { schema, key, body: make(root[key]) };
}

// Optional schedules that carry a list must hold at least one entry, so empty ones are removed.
function pruneEmpty(body, paths) {
  for (const [section, listKey] of paths) {
    if (body[section] && Array.isArray(body[section][listKey]) && body[section][listKey].length === 0) delete body[section];
  }
}

function mergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(target, key) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      mergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// ---------------------------------------------------------------------------------------------
// Interest and fee (sections 234A, 234B, 234C, 234F)
// ---------------------------------------------------------------------------------------------
// Months or part of a month from `fromIso` (exclusive) to `toIso`.
function monthsBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (!(to > from)) return 0;
  const whole = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, whole + (to.getUTCDate() > from.getUTCDate() ? 1 : 0));
}

const roundDown100 = (amount) => Math.floor(Math.max(0, amount) / 100) * 100;

// Sections 234A (late filing), 234B (advance tax short), 234C (instalments late), 234F (late fee).
// Shortfalls are rounded down to Rs 100 and interest is 1% a month or part of a month.
export function interestAndFee({ ayStart, dueDate, filingDate, taxLiability, tdsAndTcs, advancePayments = [], presumptive = false, totalIncome = 0, selfAssessment = 0, hasCapitalGainOrLottery = false }) {
  const assessed = Math.max(0, taxLiability - tdsAndTcs);
  const fyEndYear = ayStart - 1;
  const paidBy = (iso) => advancePayments.filter((p) => p.date <= iso).reduce((total, p) => total + p.amount, 0);
  const advanceByYearEnd = paidBy(`${ayStart}-03-31`);
  const out = { us234A: 0, us234B: 0, us234C: 0, fee234F: 0 };
  if (filingDate > dueDate) {
    out.us234A = Math.round(roundDown100(assessed - advanceByYearEnd - selfAssessment) * 0.01 * monthsBetween(dueDate, filingDate));
    out.fee234F = totalIncome <= 500000 ? 1000 : 5000;
  }
  if (assessed >= 10000) {
    if (advanceByYearEnd < assessed * 0.9) {
      out.us234B = Math.round(roundDown100(assessed - advanceByYearEnd) * 0.01 * monthsBetween(`${ayStart}-03-31`, filingDate));
    }
    if (!hasCapitalGainOrLottery) {
      const steps = presumptive
        ? [{ due: `${ayStart}-03-15`, percent: 100, months: 1 }]
        : [
            { due: `${fyEndYear}-06-15`, percent: 15, months: 3, relaxedAt: 12 },
            { due: `${fyEndYear}-09-15`, percent: 45, months: 3, relaxedAt: 36 },
            { due: `${fyEndYear}-12-15`, percent: 75, months: 3 },
            { due: `${ayStart}-03-15`, percent: 100, months: 1 },
          ];
      for (const step of steps) {
        const paid = paidBy(step.due);
        const required = (assessed * step.percent) / 100;
        if (paid >= required) continue;
        // Relief: 12% paid by 15 June, 36% by 15 September(relaxed shortfall) carry no interest for that instalment.
        if (step.relaxedAt && paid >= (assessed * step.relaxedAt) / 100) continue;
        out.us234C += Math.round(roundDown100(required - paid) * 0.01 * step.months);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shared taxpayer input checks
// ---------------------------------------------------------------------------------------------
function personalInfo(taxpayer, notes, problems, form) {
  const t = taxpayer || {};
  const pan = String(t.pan || '').toUpperCase();
  if (!PAN_RE.test(pan)) problems.push({ path: 'taxpayer.pan', message: 'A valid PAN (like ABCDE1234F) is required.' });
  if (!t.name) problems.push({ path: 'taxpayer.name', message: 'The name as on the PAN card is required.' });
  if (!DATE_RE.test(String(t.dob || ''))) problems.push({ path: 'taxpayer.dob', message: 'Date of birth is required (YYYY-MM-DD).' });
  const address = t.address || {};
  const stateCode = String(address.stateCode || '').padStart(2, '0');
  if (!STATE_CODES.has(stateCode)) problems.push({ path: 'taxpayer.address.stateCode', message: 'The state code from the e-filing list (01 to 38) is required, for example 29 for Karnataka.' });
  if (!address.flat || !address.locality || !address.city) problems.push({ path: 'taxpayer.address', message: 'Flat or door number, locality and city are required.' });
  const mobile = String(t.mobile || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(mobile)) problems.push({ path: 'taxpayer.mobile', message: 'A 10-digit mobile number is required.' });
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/.test(String(t.email || ''))) problems.push({ path: 'taxpayer.email', message: 'An email address is required.' });
  if (!t.fatherName) notes.push(`The verification block needs the father's name (${form}); it was left blank.`);
  const name = String(t.name || '').slice(0, 75);
  const info = {
    AssesseeName: { SurNameOrOrgName: name },
    PAN: pan,
    Address: {
      ResidenceNo: String(address.flat || '').slice(0, 50),
      LocalityOrArea: String(address.locality || '').slice(0, 50),
      CityOrTownOrDistrict: String(address.city || '').slice(0, 50),
      StateCode: stateCode,
      CountryCode: '91',
      CountryCodeMobile: 91,
      MobileNo: Number(mobile) || 0,
      EmailAddress: String(t.email || ''),
    },
    DOB: String(t.dob || ''),
    Status: t.status === 'H' ? 'H' : 'I',
  };
  if (address.pin) info.Address.PinCode = Number(String(address.pin).replace(/\D/g, '')) || undefined;
  return info;
}

function bankDetails(bank) {
  if (!bank || !bank.account) return [];
  return [{
    IFSCCode: String(bank.ifsc || '').toUpperCase(),
    BankName: String(bank.name || '').slice(0, 125),
    BankAccountNo: String(bank.account).slice(0, 20),
    AccountType: ['SB', 'CA', 'CC', 'OD', 'NRO'].includes(bank.type) ? bank.type : 'SB',
    UseForRefund: 'true',
  }];
}

function taxPayments(challans, notes) {
  const items = [];
  for (const challan of challans || []) {
    const bsr = String(challan.bsr || '').replace(/\D/g, '');
    if (bsr.length !== 7 || !DATE_RE.test(String(challan.date || '')) || !Number(challan.serial)) {
      notes.push(`A tax challan (${challan.date || 'no date'}, ${rupees(challan.amount)}) is missing its 7-digit BSR code, date or serial number, so it was left out of Schedule IT.`);
      continue;
    }
    items.push({ BSRCode: bsr, DateDep: challan.date, SrlNoOfChaln: Number(challan.serial), Amt: rupees(challan.amount) });
  }
  return items;
}

function readRegime(args) {
  const regime = ['old', 'new', 'auto'].includes(args.regime) ? args.regime : 'new';
  return regime;
}

function runTax({ fy, regime, salary, otherIncome, businessIncome, deductions, ageBand }) {
  const claims = {
    section80CPaise: rupees(deductions.c80) * PAISE,
    healthInsuranceSelfAndFamilyPaise: rupees(deductions.d80Self) * PAISE,
    healthInsuranceParentsPaise: rupees(deductions.d80Parents) * PAISE,
    selfAndFamilyIncludesSenior: deductions.selfSenior === true,
    parentsIncludeSenior: deductions.parentsSenior === true,
  };
  return incomeTax.computeIncomeTax({
    fy,
    regime,
    ageBand,
    residentIndividual: true,
    salaryPaise: rupees(salary) * PAISE,
    otherIncomePaise: (signed(otherIncome) + signed(businessIncome)) * PAISE,
    claims,
  });
}

function pickRegime(args, inputs) {
  const wanted = readRegime(args);
  if (wanted !== 'auto') return { regime: wanted, calc: runTax({ ...inputs, regime: wanted }), compared: null };
  const newCalc = runTax({ ...inputs, regime: 'new' });
  const oldCalc = runTax({ ...inputs, regime: 'old' });
  if (newCalc.error || oldCalc.error) return { regime: 'new', calc: newCalc.error ? newCalc : oldCalc, compared: null };
  const useOld = oldCalc.taxPayablePaise < newCalc.taxPayablePaise;
  return {
    regime: useOld ? 'old' : 'new',
    calc: useOld ? oldCalc : newCalc,
    compared: { newTax: newCalc.taxPayablePaise / PAISE, oldTax: oldCalc.taxPayablePaise / PAISE },
  };
}

function ageBandOf(dob, fyEnd) {
  const born = new Date(`${dob}T00:00:00Z`);
  const end = new Date(`${fyEnd}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return 'below-60';
  let age = end.getUTCFullYear() - born.getUTCFullYear();
  if (end.getUTCMonth() < born.getUTCMonth() || (end.getUTCMonth() === born.getUTCMonth() && end.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 80 ? '80-plus' : age >= 60 ? '60-to-79' : 'below-60';
}

// ---------------------------------------------------------------------------------------------
// Presumptive income (44AD, 44ADA)
// ---------------------------------------------------------------------------------------------
export function presumptiveIncome({ businesses = [], professions = [], fy }) {
  const onDate = assessmentYearOf(fy)?.fyStart;
  const biz = rules.rule('income-tax.presumptive.business', onDate);
  const prof = rules.rule('income-tax.presumptive.profession', onDate);
  if (!biz.ok || !prof.ok) return { error: 'NO_RULES_FOR_FY' };
  const sumOf = (list, fields) => list.reduce((total, item) => total + fields.reduce((inner, field) => inner + rupees(item[field]), 0), 0);
  const bank = sumOf(businesses, ['turnoverBank']);
  const cash = sumOf(businesses, ['turnoverCash']);
  const other = sumOf(businesses, ['turnoverOther']);
  const turnover = bank + cash + other;
  const digitalRate = biz.value.digitalReceiptsRatePercent;
  const otherRate = biz.value.otherReceiptsRatePercent;
  // Bank and electronic receipts earn the lower rate; cash and any other mode earn the higher rate.
  const income6 = Math.round((bank * digitalRate) / 100);
  const income8 = Math.round(((cash + other) * otherRate) / 100);
  const income44ad = income6 + income8;
  const pBank = sumOf(professions, ['receiptsBank']);
  const pCash = sumOf(professions, ['receiptsCash']);
  const pOther = sumOf(professions, ['receiptsOther']);
  const receipts = pBank + pCash + pOther;
  const income44ada = Math.round((receipts * prof.value.ratePercent) / 100);
  const cashShareBiz = turnover ? ((cash + other) * 100) / turnover : 0;
  const cashShareProf = receipts ? ((pCash + pOther) * 100) / receipts : 0;
  const capBiz = cashShareBiz <= biz.value.lowCash.cashReceiptsMaxPercent ? biz.value.lowCash.turnoverCapPaise : biz.value.turnoverCapPaise;
  const capProf = cashShareProf <= prof.value.lowCash.cashReceiptsMaxPercent ? prof.value.lowCash.grossReceiptsCapPaise : prof.value.grossReceiptsCapPaise;
  return {
    bank, cash, other, turnover, income6, income8, income44ad,
    pBank, pCash, pOther, receipts, income44ada,
    businessCapRupees: capBiz / PAISE,
    professionCapRupees: capProf / PAISE,
    overBusinessCap: turnover * PAISE > capBiz,
    overProfessionCap: receipts * PAISE > capProf,
  };
}

// ---------------------------------------------------------------------------------------------
// ITR-4 (Sugam)
// ---------------------------------------------------------------------------------------------
export function buildItr4(args = {}) {
  const info = assessmentYearOf(args.fy || '2024-25');
  if (!info) return fail('FY_INVALID', { hint: 'Give the financial year as 2024-25.' });
  const notes = [];
  const problems = [];
  const warnings = [];
  const taxpayer = args.taxpayer || {};
  const businesses = Array.isArray(args.businesses) ? args.businesses : [];
  const professions = Array.isArray(args.professions) ? args.professions : [];
  if (!businesses.length && !professions.length) problems.push({ path: 'businesses', message: 'ITR-4 is for presumptive income: give at least one business (44AD) or profession (44ADA).' });
  for (const [index, business] of businesses.entries()) {
    if (!business.name) problems.push({ path: `businesses[${index}].name`, message: 'Each business needs a name.' });
    if (!ITR4_BUSINESS_CODES.has(String(business.code || ''))) problems.push({ path: `businesses[${index}].code`, message: 'Business code must be one of 01001 to 01005 (the portal list of 44AD codes).' });
  }
  const skeleton = skeletonFor('ITR-4');
  if (!skeleton) return fail('ITR_SCHEMA_MISSING', { form: 'ITR-4' });

  const personal = personalInfo(taxpayer, notes, problems, 'ITR-4');
  const presume = presumptiveIncome({ businesses, professions, fy: info.fy });
  if (presume.error) return fail(presume.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year.' });
  if (presume.overBusinessCap) problems.push({ path: 'businesses', message: `Turnover ${presume.turnover} is above the 44AD limit of ${presume.businessCapRupees}; ITR-4 cannot be used.` });
  if (presume.overProfessionCap) problems.push({ path: 'professions', message: `Gross receipts ${presume.receipts} are above the 44ADA limit of ${presume.professionCapRupees}; ITR-4 cannot be used.` });

  // The taxpayer may declare a higher profit than the presumptive minimum, never less (less needs books and an audit).
  const declaredBusiness = args.declaredBusinessProfit == null ? presume.income44ad : rupees(args.declaredBusinessProfit);
  const declaredProfession = args.declaredProfessionProfit == null ? presume.income44ada : rupees(args.declaredProfessionProfit);
  if (declaredBusiness < presume.income44ad) problems.push({ path: 'declaredBusinessProfit', message: `Profit under 44AD cannot be below ${presume.income44ad} in ITR-4. Declaring less needs books of account and a tax audit, so use ITR-3.` });
  if (declaredProfession < presume.income44ada) problems.push({ path: 'declaredProfessionProfit', message: `Profit under 44ADA cannot be below ${presume.income44ada} in ITR-4. Declaring less needs books of account and a tax audit, so use ITR-3.` });
  if (taxpayer.status === 'F') problems.push({ path: 'taxpayer.status', message: 'This builder prepares ITR-4 for individuals and HUFs. A firm return is not built here.' });

  const salaryGross = rupees(args.salary?.gross);
  const otherIncome = sum(rupees(args.otherIncome?.savingsInterest), rupees(args.otherIncome?.depositInterest), rupees(args.otherIncome?.dividend), rupees(args.otherIncome?.other));
  const housePropertyIncome = signed(args.houseProperty?.netIncome);
  if (housePropertyIncome < 0) problems.push({ path: 'houseProperty.netIncome', message: 'ITR-4 does not allow a loss under house property to be set off. Use ITR-3.' });
  if (args.capitalGains && Object.values(args.capitalGains).some((value) => Number(value) !== 0)) {
    problems.push({ path: 'capitalGains', message: 'ITR-4 allows only long-term gains under section 112A up to Rs 1.25 lakh. Other capital gains need ITR-2 or ITR-3.' });
  }
  if (args.foreignAssets === true) problems.push({ path: 'foreignAssets', message: 'A taxpayer with foreign assets or income cannot use ITR-4.' });
  if (args.director === true || args.unlistedShares === true) problems.push({ path: 'director', message: 'A company director or a holder of unlisted equity shares cannot use ITR-4.' });

  const ageBand = ageBandOf(personal.DOB, info.fyEnd);
  const businessIncome = declaredBusiness + declaredProfession;
  const deductions = args.deductions || {};
  const tax = pickRegime(args, { fy: info.fy, salary: salaryGross, otherIncome: otherIncome + housePropertyIncome, businessIncome, deductions, ageBand });
  if (tax.calc.error) return fail(tax.calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
  const calc = tax.calc;
  const old = tax.regime === 'old';

  const standardDeduction = calc.standardDeductionPaise / PAISE;
  const netSalary = Math.max(0, salaryGross);
  const incomeFromSalary = Math.max(0, netSalary - standardDeduction);
  const grossTotal = calc.grossTotalIncomePaise / PAISE;
  const totalIncome = calc.totalIncomePaise / PAISE;
  const chapterVia = old ? calc.section80CPaise / PAISE + calc.section80DPaise / PAISE : 0;
  if (!old && (rupees(deductions.c80) || rupees(deductions.d80Self) || rupees(deductions.d80Parents))) {
    warnings.push('Deductions under 80C and 80D are not allowed in the new tax regime, so they were not claimed. Choose the old regime if they should count.');
  }
  const taxPayable = calc.taxPayablePaise / PAISE;
  const slabTax = calc.slabTaxPaise / PAISE;
  const rebate = calc.rebatePaise / PAISE;
  const cess = calc.cessPaise / PAISE;
  if (calc.surchargePaise > 0) problems.push({ path: 'income', message: 'Total income is above Rs 50 lakh, where ITR-4 is not allowed. Use ITR-3.' });
  if (totalIncome > 5000000) problems.push({ path: 'income', message: `Total income ${totalIncome} is above Rs 50 lakh; ITR-4 cannot be used.` });

  const filingDate = DATE_RE.test(String(args.filingDate || '')) ? args.filingDate : info.ayStart + '-07-31';
  const dueDate = `${info.ayStart}-07-31`;
  const advance = (Array.isArray(args.taxesPaid?.advanceTax) ? args.taxesPaid.advanceTax : []).map((p) => ({ date: String(p.date || ''), amount: rupees(p.amount) })).filter((p) => DATE_RE.test(p.date) && p.amount > 0);
  const tdsSalary = (Array.isArray(args.taxesPaid?.tdsSalary) ? args.taxesPaid.tdsSalary : []);
  const tdsOther = (Array.isArray(args.taxesPaid?.tdsOther) ? args.taxesPaid.tdsOther : []);
  const tds = sum(...tdsSalary.map((x) => rupees(x.tds)), ...tdsOther.map((x) => rupees(x.tds)), rupees(args.taxesPaid?.tds));
  const tcs = rupees(args.taxesPaid?.tcs);
  const selfAssessment = rupees(args.taxesPaid?.selfAssessment);
  const challans = Array.isArray(args.taxesPaid?.challans) ? args.taxesPaid.challans : [];
  const advanceTotal = advance.reduce((total, p) => total + p.amount, 0);
  const interest = interestAndFee({
    ayStart: info.ayStart, dueDate, filingDate, taxLiability: taxPayable, tdsAndTcs: tds + tcs, advancePayments: advance,
    presumptive: true, totalIncome, selfAssessment,
  });
  const interestTotal = interest.us234A + interest.us234B + interest.us234C;
  const totalTaxInterest = taxPayable + interestTotal + interest.fee234F;
  const taxesPaid = advanceTotal + tds + tcs + selfAssessment;
  const balance = Math.max(0, totalTaxInterest - taxesPaid);
  const refund = Math.max(0, taxesPaid - totalTaxInterest);
  if (refund > 0 && !args.bank?.account) problems.push({ path: 'bank', message: 'A refund is due: a bank account in your name, pre-validated on the portal, is needed to receive it.' });

  const patch = {
    CreationInfo: {
      SWVersionNo: '1.0',
      SWCreatedBy: 'SW00000001',
      JSONCreatedBy: 'SW00000001',
      JSONCreationDate: filingDate,
      IntermediaryCity: 'Bengaluru',
      Digest: '-',
    },
    Form_ITR4: {
      FormName: 'ITR-4',
      Description: 'For Indls, HUFs and Firms (not LLP): presumptive business income',
      AssessmentYear: String(info.ayStart),
      SchemaVer: 'Ver1.0',
      FormVer: 'Ver1.0',
    },
    PersonalInfo: personal,
    FilingStatus: {
      ReturnFileSec: [11, 12, 13, 14, 16, 17, 18, 20].includes(Number(args.returnSection)) ? Number(args.returnSection) : 11,
      OptOutNewTaxRegime_Form10IEA_AY24_25: old ? 'Y' : 'N',
      AsseseeRepFlg: 'N',
      ItrFilingDueDate: dueDate,
    },
    IncomeDeductions: {
      IncomeFromBusinessProf: businessIncome,
      GrossSalary: salaryGross,
      IncomeNotified89A: 0,
      NetSalary: netSalary,
      DeductionUs16: standardDeduction,
      IncomeFromSal: incomeFromSalary,
      AnnualValue: 0,
      AnnualValue30Percent: 0,
      TotalIncomeOfHP: housePropertyIncome,
      IncomeOthSrc: otherIncome,
      GrossTotIncome: grossTotal,
      GrossTotIncomeIncLTCG112A: grossTotal,
      UsrDeductUndChapVIA: chapterVia === 0 ? {} : { Section80C: calc.section80CPaise / PAISE, Section80D: calc.section80DPaise / PAISE, TotalChapVIADeductions: chapterVia },
      DeductUndChapVIA: chapterVia === 0 ? {} : { Section80C: calc.section80CPaise / PAISE, Section80D: calc.section80DPaise / PAISE, TotalChapVIADeductions: chapterVia },
      TotalIncome: totalIncome,
    },
    TaxComputation: {
      TotalTaxPayable: slabTax,
      Rebate87A: rebate,
      TaxPayableOnRebate: slabTax - rebate,
      EducationCess: cess,
      GrossTaxLiability: taxPayable,
      NetTaxLiability: taxPayable,
      IntrstPay: { IntrstPayUs234A: interest.us234A, IntrstPayUs234B: interest.us234B, IntrstPayUs234C: interest.us234C, LateFilingFee234F: interest.fee234F },
      TotTaxPlusIntrstPay: totalTaxInterest,
    },
    TaxPaid: {
      TaxesPaid: { AdvanceTax: advanceTotal, TDS: tds, TCS: tcs, SelfAssessmentTax: selfAssessment, TotalTaxesPaid: taxesPaid },
      BalTaxPayable: balance,
    },
    Refund: { RefundDue: refund, BankAccountDtls: { AddtnlBankDetails: bankDetails(args.bank) } },
    ScheduleBP: {
      NatOfBus44AD: businesses.map((b) => ({ NameOfBusiness: String(b.name || '').slice(0, 75), CodeAD: String(b.code), Description: String(b.description || b.name || '').slice(0, 75) })),
      PersumptiveInc44AD: {
        GrsTotalTrnOver: presume.turnover,
        GrsTrnOverBank: presume.bank,
        GrsTotalTrnOverInCash: presume.cash,
        GrsTrnOverAnyOthMode: presume.other,
        PersumptiveInc44AD6Per: presume.income6,
        PersumptiveInc44AD8Per: presume.income8,
        TotPersumptiveInc44AD: declaredBusiness,
      },
      NatOfBus44ADA: professions.map((p) => ({ NameOfBusiness: String(p.name || '').slice(0, 75), CodeADA: String(p.code || '14001'), Description: String(p.description || p.name || '').slice(0, 75) })),
      PersumptiveInc44ADA: {
        GrsReceipt: presume.receipts,
        GrsTrnOverBank44ADA: presume.pBank,
        GrsTotalTrnOverInCash44ADA: presume.pCash,
        GrsTrnOverAnyOthMode44ADA: presume.pOther,
        TotPersumptiveInc44ADA: declaredProfession,
      },
    },
    ScheduleIT: { TaxPayment: taxPayments(challans, notes), TotalTaxPayments: challans.length ? taxPayments(challans, []).reduce((total, item) => total + item.Amt, 0) : 0 },
    TDSonSalaries: {
      TDSonSalary: tdsSalary.filter((x) => x.tan).map((x) => ({ EmployerOrDeductorOrCollectDetl: { TAN: String(x.tan).toUpperCase(), EmployerOrDeductorOrCollecterName: String(x.name || '').slice(0, 125) }, IncChrgSal: rupees(x.income), TotalTDSSal: rupees(x.tds) })),
      TotalTDSonSalaries: sum(...tdsSalary.map((x) => rupees(x.tds))),
    },
    TDSonOthThanSals: {
      TDSonOthThanSalDtls: tdsOther.filter((x) => x.tan).map((x) => ({ TANOfDeductor: String(x.tan).toUpperCase(), TDSSection: String(x.section || '193'), TDSClaimed: rupees(x.tds), GrossAmount: rupees(x.gross), HeadOfIncome: ['BP', 'HP', 'OS', 'EI', 'NA'].includes(x.head) ? x.head : 'OS', TDSCreditCarriedFwd: 0 })),
      TotalTDSonOthThanSals: sum(...tdsOther.map((x) => rupees(x.tds))),
    },
    Verification: {
      Declaration: { AssesseeVerName: String(taxpayer.name || '').slice(0, 125), FatherName: String(taxpayer.fatherName || '').slice(0, 125), AssesseeVerPAN: personal.PAN },
      Capacity: 'S',
      Place: String(taxpayer.address?.city || '').slice(0, 50),
    },
  };
  if (old) patch.IncomeDeductions.UsrDeductUndChapVIA = patch.IncomeDeductions.UsrDeductUndChapVIA || {};
  mergeInto(skeleton.body, patch);
  pruneEmpty(skeleton.body, [['ScheduleIT', 'TaxPayment'], ['TDSonSalaries', 'TDSonSalary'], ['TDSonOthThanSals', 'TDSonOthThanSalDtls']]);
  const itr = { ITR: { ITR4: skeleton.body } };

  return finish({ form: 'ITR-4', itr, schema: skeleton.schema, info, notes, problems, warnings, summary: {
    regime: tax.regime,
    comparedRegimes: tax.compared,
    presumptiveBusinessIncome: declaredBusiness,
    presumptiveProfessionIncome: declaredProfession,
    grossTotalIncome: grossTotal,
    totalIncome,
    taxOnTotalIncome: slabTax,
    rebate87A: rebate,
    cess,
    grossTaxLiability: taxPayable,
    interest234A: interest.us234A,
    interest234B: interest.us234B,
    interest234C: interest.us234C,
    lateFee234F: interest.fee234F,
    taxesPaid,
    balanceTaxPayable: balance,
    refundDue: refund,
  }, checks: itr4Checks({ presume, declaredBusiness, declaredProfession, totalIncome, businesses }) });
}

// A handful of the CBDT Category A rules for ITR-4 (ids from the ITR-4 rules file) run on the numbers we built.
function itr4Checks({ presume, declaredBusiness, declaredProfession, totalIncome, businesses }) {
  const found = [];
  const rule = (id, ok, text) => { if (!ok) found.push({ rule: id, category: 'A', text }); };
  rule('ITR-4-A-5', declaredBusiness >= presume.income6 + (presume.income8 ? 0 : 0) || presume.turnover === 0, 'Presumptive income under 44AD must be at least 6% of the turnover received through bank or electronic modes.');
  rule('ITR-4-A-7', declaredBusiness >= presume.income44ad, 'Presumptive income under 44AD must be at least 6% of digital receipts plus 8% of other receipts.');
  rule('ITR-4-A-8', declaredBusiness <= presume.turnover, 'Income under 44AD cannot be more than the turnover.');
  rule('ITR-4-A-9', presume.turnover <= 30000000, 'ITR-4 cannot be filed where 44AD turnover is above Rs 3 crore.');
  rule('ITR-4-A-1', businesses.length > 0 || declaredProfession > 0 || declaredBusiness === 0, 'Income under 44AD, 44ADA or 44AE needs schedule BP to be filled.');
  rule('ITR-4-limit', totalIncome <= 5000000, 'Total income above Rs 50 lakh: ITR-4 is not allowed.');
  return found;
}

// ---------------------------------------------------------------------------------------------
// ITR-3 (business or profession with books of account)
// ---------------------------------------------------------------------------------------------
export function buildItr3(args = {}) {
  const info = assessmentYearOf(args.fy || '2024-25');
  if (!info) return fail('FY_INVALID', { hint: 'Give the financial year as 2024-25.' });
  const notes = [];
  const problems = [];
  const warnings = [];
  const taxpayer = args.taxpayer || {};
  const skeleton = skeletonFor('ITR-3');
  if (!skeleton) return fail('ITR_SCHEMA_MISSING', { form: 'ITR-3' });
  const personal = personalInfo(taxpayer, notes, problems, 'ITR-3');
  if (taxpayer.status === 'F') problems.push({ path: 'taxpayer.status', message: 'ITR-3 here is for an individual or HUF (a proprietor). A firm or company return is not built here.' });

  const pl = args.profitAndLoss || {};
  const turnover = rupees(pl.turnover);
  const otherOperating = rupees(pl.otherIncome);
  const interestIncome = rupees(pl.interestIncome);
  const rentIncome = rupees(pl.rentIncome);
  const expenseTotal = rupees(pl.expenses);
  const depreciationBooks = rupees(pl.depreciationBooks);
  const interestPaid = rupees(pl.interestExpense);
  const incomeOnlyBusiness = turnover + otherOperating;
  const creditsOther = interestIncome + rentIncome;
  const profitBeforeTax = incomeOnlyBusiness + creditsOther - expenseTotal - depreciationBooks - interestPaid;
  if (!turnover && !pl.expenses) problems.push({ path: 'profitAndLoss', message: 'Give the profit and loss totals from the books: turnover and expenses at least.' });

  // Tax-computation adjustments from the books profit to business income (Schedule BP).
  const adj = args.adjustments || {};
  const depIT = rupees(adj.depreciationIncomeTax);
  const disallow40A = rupees(adj.disallowed40A);
  const disallow43B = rupees(adj.disallowed43B);
  const disallow37 = rupees(adj.disallowed37);
  const disallow40 = rupees(adj.disallowed40);
  const otherAdditions = rupees(adj.otherAdditions);
  const otherDeductions = rupees(adj.otherDeductions);
  const incomeOtherHeads = interestIncome + rentIncome; // credited to P&L but taxed under other heads
  const businessBeforeAdj = profitBeforeTax - incomeOtherHeads;
  const additions = depreciationBooks + disallow40A + disallow43B + disallow37 + disallow40 + otherAdditions;
  const deductionsBP = depIT + otherDeductions;
  const businessIncome = businessBeforeAdj + additions - deductionsBP;
  if (adj.depreciationIncomeTax == null && depreciationBooks) notes.push('Depreciation as per the Income-tax Act was not given, so book depreciation was added back and none allowed. Enter the Schedule DEP figure to correct it.');

  const salaryGross = rupees(args.salary?.gross);
  const otherSources = sum(rupees(args.otherIncome?.savingsInterest), rupees(args.otherIncome?.depositInterest), rupees(args.otherIncome?.dividend), rupees(args.otherIncome?.other)) + interestIncome;
  const houseProperty = signed(args.houseProperty?.netIncome) + rentIncome;
  const deductions = args.deductions || {};
  const ageBand = ageBandOf(personal.DOB, info.fyEnd);
  const lossBF = rupees(args.broughtForwardBusinessLoss);
  const taxableBusiness = Math.max(0, businessIncome);
  const setOff = Math.min(lossBF, taxableBusiness);
  if (houseProperty < 0 || args.capitalGains) warnings.push('House property loss, capital gains and loss set-off schedules are not built by this tool. Add them in the portal utility.');
  const tax = pickRegime(args, { fy: info.fy, salary: salaryGross, otherIncome: otherSources + houseProperty, businessIncome: taxableBusiness - setOff, deductions, ageBand });
  if (tax.calc.error) return fail(tax.calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
  const calc = tax.calc;
  const old = tax.regime === 'old';
  const grossTotal = calc.grossTotalIncomePaise / PAISE;
  const totalIncome = calc.totalIncomePaise / PAISE;
  const standardDeduction = calc.standardDeductionPaise / PAISE;
  const chapterVia = old ? (calc.section80CPaise + calc.section80DPaise) / PAISE : 0;
  if (!old && (rupees(deductions.c80) || rupees(deductions.d80Self) || rupees(deductions.d80Parents))) warnings.push('80C and 80D are not allowed in the new regime and were not claimed.');
  const slabTax = calc.slabTaxPaise / PAISE;
  const rebate = calc.rebatePaise / PAISE;
  const surcharge = calc.surchargePaise / PAISE;
  const cess = calc.cessPaise / PAISE;
  const taxPayable = calc.taxPayablePaise / PAISE;

  const filingDate = DATE_RE.test(String(args.filingDate || '')) ? args.filingDate : `${info.ayStart}-07-31`;
  const audited = args.taxAudit === true;
  const dueDate = audited ? `${info.ayStart}-10-31` : `${info.ayStart}-07-31`;
  if (!audited && turnover > 100000000) warnings.push('Turnover above Rs 1 crore normally needs a tax audit under 44AB (Rs 10 crore if cash is within 5%). Confirm with the CA before filing.');
  const advance = (Array.isArray(args.taxesPaid?.advanceTax) ? args.taxesPaid.advanceTax : []).map((p) => ({ date: String(p.date || ''), amount: rupees(p.amount) })).filter((p) => DATE_RE.test(p.date) && p.amount > 0);
  const tdsSalary = Array.isArray(args.taxesPaid?.tdsSalary) ? args.taxesPaid.tdsSalary : [];
  const tdsOther = Array.isArray(args.taxesPaid?.tdsOther) ? args.taxesPaid.tdsOther : [];
  const tds = sum(...tdsSalary.map((x) => rupees(x.tds)), ...tdsOther.map((x) => rupees(x.tds)), rupees(args.taxesPaid?.tds));
  const tcs = rupees(args.taxesPaid?.tcs);
  const selfAssessment = rupees(args.taxesPaid?.selfAssessment);
  const challans = Array.isArray(args.taxesPaid?.challans) ? args.taxesPaid.challans : [];
  const advanceTotal = advance.reduce((total, p) => total + p.amount, 0);
  const interest = interestAndFee({ ayStart: info.ayStart, dueDate, filingDate, taxLiability: taxPayable, tdsAndTcs: tds + tcs, advancePayments: advance, presumptive: false, totalIncome, selfAssessment });
  const interestTotal = interest.us234A + interest.us234B + interest.us234C;
  const totalTaxInterest = taxPayable + interestTotal + interest.fee234F;
  const taxesPaid = advanceTotal + tds + tcs + selfAssessment;
  const balance = Math.max(0, totalTaxInterest - taxesPaid);
  const refund = Math.max(0, taxesPaid - totalTaxInterest);
  if (refund > 0 && !args.bank?.account) problems.push({ path: 'bank', message: 'A refund is due: a bank account in your name, pre-validated on the portal, is needed to receive it.' });

  // Balance sheet: each side must add to the same total, so the capital account is the balancing figure when not given.
  const bs = args.balanceSheet || {};
  const fixedAssets = rupees(bs.fixedAssetsNet);
  const inventories = rupees(bs.inventories);
  const debtors = rupees(bs.debtors);
  const cash = rupees(bs.cash);
  const bank = signed(bs.bank);
  const loansAdvances = rupees(bs.loansAndAdvances);
  const otherCurrentAssets = rupees(bs.otherCurrentAssets);
  const secured = rupees(bs.securedLoans);
  const unsecured = rupees(bs.unsecuredLoans);
  const creditors = rupees(bs.creditors);
  const otherLiabilities = rupees(bs.otherLiabilities);
  const provisions = rupees(bs.provisions);
  const currentAssets = inventories + debtors + cash + bank + otherCurrentAssets;
  const currentLiabilities = creditors + otherLiabilities;
  const totalFundApply = fixedAssets + currentAssets + loansAdvances - currentLiabilities - provisions;
  const capital = bs.capital == null ? totalFundApply - secured - unsecured : signed(bs.capital);
  const totalFundSource = capital + secured + unsecured;
  if (bs.capital != null && totalFundSource !== totalFundApply) {
    problems.push({ path: 'balanceSheet', message: `The balance sheet does not balance: sources ${totalFundSource} against applications ${totalFundApply}. Fix the capital or the other figures.` });
  }
  if (!Object.keys(bs).length) notes.push('No balance sheet figures were given, so the balance sheet in the return is empty. The portal needs it where books are kept (Rs 2 crore turnover or more must file it in full).');

  const patch = {
    CreationInfo: { SWVersionNo: '1.0', SWCreatedBy: 'SW00000001', JSONCreatedBy: 'SW00000001', JSONCreationDate: filingDate, IntermediaryCity: 'Bengaluru', Digest: '-' },
    Form_ITR3: { FormName: 'ITR-3', Description: 'For Indls and HUFs having income from business or profession', AssessmentYear: String(info.ayStart), SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' },
    PartA_GEN1: {
      PersonalInfo: personal,
      FilingStatus: {
        ReturnFileSec: [11, 12, 13, 14, 16, 17, 18, 19].includes(Number(args.returnSection)) ? Number(args.returnSection) : 11,
        OptOutNewTaxRegime_Method: old ? 'OPTINRETURN' : 'BY10IEA',
        OptOutNewTaxRegime_Form10IEA_AY24_25: old ? 'Y' : 'N',
        SeventhProvisio139: 'N',
        ResidentialStatus: 'RES',
        HeldUnlistedEqShrPrYrFlg: 'N',
        ForeignExchangeFlag: 'N',
        FiiFpiFlag: 'N',
        ItrFilingDueDate: dueDate,
      },
    },
    PartA_GEN2: {
      AuditInfo: {
        LiableSec44AAflg: 'Y',
        IncDclrdUs: 'N',
        LiableSec44ABflg: audited ? 'Y' : 'N',
        LiableSec92Eflg: 'N',
        AccountAuditFlag: audited ? 'Y' : 'N',
      },
    },
    PARTA_BS: {
      FundSrc: {
        PropFund: { PropCap: capital, TotPropFund: capital },
        LoanFunds: {
          SecrLoan: { RupeeLoan: { FrmBank: secured, FrmOthrs: 0, TotRupeeLoan: secured }, TotSecrLoan: secured },
          UnsecrLoan: { FrmOthrs: unsecured, TotUnSecrLoan: unsecured },
          TotLoanFund: secured + unsecured,
        },
        TotFundSrc: totalFundSource,
      },
      FundApply: {
        FixedAsset: { NetBlock: fixedAssets, TotFixedAsset: fixedAssets, GrossBlock: fixedAssets },
        CurrAssetLoanAdv: {
          CurrAsset: {
            Inventories: { FinOrTradGood: inventories, TotInventries: inventories },
            SndryDebtors: debtors,
            CashOrBankBal: { CashinHand: cash, BankBal: bank, TotCashOrBankBal: cash + bank },
            OthCurrAsset: otherCurrentAssets,
            TotCurrAsset: currentAssets,
          },
          LoanAdv: { AdvRecoverable: loansAdvances, TotLoanAdv: loansAdvances },
          TotCurrAssetLoanAdv: currentAssets + loansAdvances,
          CurrLiabilitiesProv: {
            CurrLiabilities: { SundryCred: creditors, TotCurrLiabilities: currentLiabilities },
            Provisions: { OthProvision: provisions, TotProvisions: provisions },
            TotCurrLiabilitiesProvision: currentLiabilities + provisions,
          },
          NetCurrAsset: currentAssets + loansAdvances - currentLiabilities - provisions,
        },
        TotFundApply: totalFundApply,
      },
    },
    PARTA_PL: {
      CreditsToPL: {
        OthIncome: { RentInc: rentIncome, InterestInc: interestIncome, MiscOthIncome: otherOperating, TotOthIncome: rentIncome + interestIncome + otherOperating },
        TotCreditsToPL: turnover + otherOperating + creditsOther,
      },
      DebitsToPL: {
        OtherExpenses: expenseTotal,
        PBIDTA: turnover + otherOperating + creditsOther - expenseTotal,
        InterestExpdrtDtls: { Others: interestPaid, InterestExpdr: interestPaid },
        DepreciationAmort: depreciationBooks,
        PBT: profitBeforeTax,
      },
      TaxProvAppr: { ProvForCurrTax: 0, ProvDefTax: 0, ProfitAfterTax: profitBeforeTax },
      NoBooksOfAccPL: {},
    },
    ITR3ScheduleBP: {
      BusinessIncOthThanSpec: {
        ProfBfrTaxPL: profitBeforeTax,
        IncRecCredPLOthHeadDtls: { OtherSources: interestIncome, HouseProperty: rentIncome, OtherThanDividend: interestIncome },
        BalancePLOthThanSpecBus: businessBeforeAdj,
        AdjustedPLOthThanSpecBus: businessBeforeAdj,
        DepreciationDebPLCosAct: depreciationBooks,
        DepreciationAllowITAct32: { TotDeprAllowITAct: depIT, DepreciationAllowUs32_1_ii: depIT },
        AmtDebPLDisallowUs37: disallow37,
        AmtDebPLDisallowUs40: disallow40,
        AmtDebPLDisallowUs40A: disallow40A,
        AmtDebPLDisallowUs43B: disallow43B,
        AnyOthAmtAllDeduct: otherDeductions,
        TotDeductionAmts: depIT + otherDeductions,
        PLAftAdjDedBusOthThanSpec: businessIncome,
        NetPLAftAdjBusOthThanSpec: businessIncome,
        NetPLBusOthThanSpec7A7B7C: businessIncome,
        IncomeOtherThanRule: businessIncome,
      },
      IncChrgUnHdProftGain: taxableBusiness - setOff,
      BusSetoffCurrYr: { TotLossSetOffOnBus: 0 },
    },
    'PartB-TI': {
      Salaries: Math.max(0, salaryGross - standardDeduction),
      IncomeFromHP: houseProperty,
      ProfBusGain: { ProfGainNoSpecBus: taxableBusiness - setOff, TotProfBusGain: taxableBusiness - setOff },
      IncFromOS: { OtherSrcThanOwnRaceHorse: otherSources, TotIncFromOS: otherSources },
      TotalTI: grossTotal,
      BalanceAfterSetoffLosses: grossTotal,
      BroughtFwdLossesSetoff: setOff,
      GrossTotalIncome: grossTotal,
      DeductionsUndSchVIADtl: { PartBchapterVIA: chapterVia, TotDeductUndSchVIA: chapterVia },
      TotalIncome: totalIncome,
      AggregateIncome: totalIncome,
    },
    PartB_TTI: {
      ComputationOfTaxLiability: {
        TaxPayableOnTI: {
          TaxAtNormalRatesOnAggrInc: slabTax,
          TaxPayableOnTotInc: slabTax,
          Rebate87A: rebate,
          TaxPayableOnRebate: slabTax - rebate,
          TotalSurcharge: surcharge,
          EducationCess: cess,
          GrossTaxLiability: taxPayable,
        },
        GrossTaxPayable: taxPayable,
        TaxPayAfterCreditUs115JD: taxPayable,
        NetTaxLiability: taxPayable,
        IntrstPay: { IntrstPayUs234A: interest.us234A, IntrstPayUs234B: interest.us234B, IntrstPayUs234C: interest.us234C, LateFilingFee234F: interest.fee234F, TotalIntrstPay: interestTotal + interest.fee234F },
        AggregateTaxInterestLiability: totalTaxInterest,
      },
      TaxPaid: { TaxesPaid: { AdvanceTax: advanceTotal, TDS: tds, TCS: tcs, SelfAssessmentTax: selfAssessment, TotalTaxesPaid: taxesPaid }, BalTaxPayable: balance },
      Refund: { RefundDue: refund, BankAccountDtls: { BankDtlsFlag: args.bank?.account ? 'Y' : 'N', AddtnlBankDetails: bankDetails(args.bank) } },
      AssetOutIndiaFlag: 'NO',
    },
    ScheduleIT: { TaxPayment: taxPayments(challans, notes), TotalTaxPayments: taxPayments(challans, []).reduce((total, item) => total + item.Amt, 0) },
    Verification: {
      Declaration: { AssesseeVerName: String(taxpayer.name || '').slice(0, 125), FatherName: String(taxpayer.fatherName || '').slice(0, 125), AssesseeVerPAN: personal.PAN },
      Capacity: 'S',
      Place: String(taxpayer.address?.city || '').slice(0, 50),
      Date: filingDate,
    },
  };
  mergeInto(skeleton.body, patch);
  pruneEmpty(skeleton.body, [['ScheduleIT', 'TaxPayment']]);
  const itr = { ITR: { ITR3: skeleton.body } };
  const summary = {
    regime: tax.regime,
    comparedRegimes: tax.compared,
    profitBeforeTaxPerBooks: profitBeforeTax,
    businessIncomeAfterAdjustments: businessIncome,
    businessLossBroughtForwardSetOff: setOff,
    grossTotalIncome: grossTotal,
    totalIncome,
    grossTaxLiability: taxPayable,
    interest234A: interest.us234A,
    interest234B: interest.us234B,
    interest234C: interest.us234C,
    lateFee234F: interest.fee234F,
    taxesPaid,
    balanceTaxPayable: balance,
    refundDue: refund,
  };
  return finish({ form: 'ITR-3', itr, schema: skeleton.schema, info, notes, problems, warnings, summary, checks: [] });
}

// ---------------------------------------------------------------------------------------------
function finish({ form, itr, schema, info, notes, problems, warnings, summary, checks }) {
  const schemaYear = SCHEMA_AY[form];
  const ayCode = String(info.ayStart);
  let validation = null;
  if (ayCode === schemaYear) {
    const { errors, truncated } = validateAgainstSchema(schema, itr);
    validation = { checked: true, valid: errors.length === 0, errors: errors.slice(0, 40), truncated };
    if (errors.length) problems.push(...errors.slice(0, 40).map((e) => ({ path: e.path, message: `Schema: ${e.message}` })));
  } else {
    validation = { checked: false, valid: null, errors: [] };
    notes.push(`MyCA holds the CBDT schema for assessment year ${schemaYear}-${String(Number(schemaYear) + 1).slice(2)} only. This return is for AY ${info.ayLabel}, so the JSON was not checked against a schema. Load the official AY ${info.ayLabel} utility from the e-filing portal before uploading.`);
  }
  return {
    ok: true,
    data: {
      form,
      assessmentYear: info.ayLabel,
      ready: problems.length === 0,
      problems,
      warnings,
      notes,
      summary,
      businessRuleFindings: checks,
      validation,
      json: itr,
      next: 'Review the figures with your CA, then upload this JSON in the e-filing portal (e-File > Income Tax Returns > File Income Tax Return > Offline > Upload JSON), preview, verify and e-verify.',
    },
  };
}

// Fills what the caller left out from the books: profit and loss, balance sheet, taxes paid, depreciation, name and PAN.
// Anything the caller gave explicitly wins over the books.
function withBooks(state, form, args) {
  const fy = args.fy || '2024-25';
  const figures = booksFigures(state, { fy });
  if (!figures.ok) return { error: figures };
  const books = figures.data;
  const merged = { ...args, fy };
  const notes = [...books.notes];
  const company = state.company || {};
  const given = Object.fromEntries(Object.entries(args.taxpayer || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  merged.taxpayer = { ...(company.name ? { name: company.name } : {}), ...(company.pan ? { pan: company.pan } : {}), ...given };
  const advance = args.taxesPaid?.advanceTax ?? books.taxesPaid.advanceTax;
  merged.taxesPaid = { ...(args.taxesPaid || {}), advanceTax: advance };
  if (args.taxesPaid?.tds == null && !(args.taxesPaid?.tdsOther || []).length) {
    merged.taxesPaid.tds = books.taxesPaid.tds;
    merged.taxesPaid.tdsOther = books.taxesPaid.tdsOther;
  }
  let schedule = null;
  if (Array.isArray(args.fixedAssets) && args.fixedAssets.length) {
    const result = depreciationSchedule({ blocks: args.fixedAssets, fyEnd: books.to });
    if (!result.ok) return { error: result };
    schedule = result.data;
    notes.push(...schedule.notes);
  }
  if (form === 'ITR4') {
    const split = books.turnoverSplit;
    if (!(args.businesses || []).length && !(args.professions || []).length) {
      if (args.incomeKind === 'profession') {
        merged.professions = [{ name: String(company.name || 'Profession').slice(0, 75), code: String(args.businessCode || '14001'), receiptsBank: split.bank, receiptsCash: split.cash }];
      } else {
        merged.businesses = [{ name: String(company.name || 'Business').slice(0, 75), code: String(args.businessCode || '01001'), turnoverBank: split.bank, turnoverCash: split.cash }];
      }
      notes.push('Turnover is the sales in the books for the year. Cash receipts are the receipts recorded in cash; the rest is counted as received by bank or electronic mode, the 6% slab. If some receipts came in other ways, give businesses yourself.');
    }
  } else {
    merged.profitAndLoss = { ...books.profitAndLoss, ...(args.profitAndLoss || {}) };
    delete merged.profitAndLoss.netProfit;
    const balanceSheet = { ...books.balanceSheet, ...(args.balanceSheet || {}) };
    if (schedule) {
      merged.adjustments = { depreciationIncomeTax: schedule.totalDepreciation, ...(args.adjustments || {}) };
      if (args.balanceSheet?.fixedAssetsNet == null) balanceSheet.fixedAssetsNet = schedule.closingWdv;
      // Books carry no depreciation line: the income-tax depreciation is charged in the profit and loss too, so it is not allowed twice.
      if (!books.profitAndLoss.depreciationBooks && args.profitAndLoss?.depreciationBooks == null) merged.profitAndLoss.depreciationBooks = schedule.totalDepreciation;
    }
    merged.balanceSheet = balanceSheet;
  }
  return { args: merged, notes, books };
}

export function buildItrReturn(state, args = {}) {
  const form = String(args.form || '').replace(/\s|-/g, '').toUpperCase();
  if (form !== 'ITR4' && form !== 'ITR3') return fail('ITR_FORM_NOT_SUPPORTED', { hint: 'build_itr_json prepares ITR-3 and ITR-4. For ITR-1, ITR-2, ITR-5 or ITR-6 use the portal utility and check the JSON with check_itr_json.' });
  let input = args;
  let booksNotes = [];
  if (args.fromBooks === true) {
    const prepared = withBooks(state, form, args);
    if (prepared.error) return prepared.error;
    input = prepared.args;
    booksNotes = prepared.notes;
  }
  const result = form === 'ITR4' ? buildItr4(input) : buildItr3(input);
  if (result.ok && booksNotes.length) result.data.notes.unshift(...booksNotes);
  if (result.ok && args.fromBooks === true) result.data.source = 'books';
  return result;
}

export function buildItrReturnWords(data) {
  const lines = [];
  const s = data.summary;
  lines.push(`${data.form} for assessment year ${data.assessmentYear}: total income Rs ${s.totalIncome}, tax Rs ${s.grossTaxLiability}${s.refundDue ? `, refund due Rs ${s.refundDue}` : s.balanceTaxPayable ? `, balance to pay Rs ${s.balanceTaxPayable}` : ''} (${s.regime} regime).`);
  if (data.validation.checked) lines.push(data.validation.valid ? 'The JSON matches the official schema.' : `The JSON has ${data.validation.errors.length} schema errors.`);
  lines.push(data.ready ? 'No blocking problems found; the JSON is ready for your CA to review.' : `${data.problems.length} problem${data.problems.length === 1 ? '' : 's'} to fix before this can be filed:`);
  for (const problem of data.problems.slice(0, 8)) lines.push(`· ${problem.path}: ${problem.message}`);
  for (const warning of data.warnings.slice(0, 4)) lines.push(`Note: ${warning}`);
  for (const note of data.notes.slice(0, 4)) lines.push(note);
  return lines.join('\n');
}
