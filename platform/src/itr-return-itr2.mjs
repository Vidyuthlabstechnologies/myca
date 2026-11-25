import { shared, chapterViaExtras, viaPatch, assessmentYearOf, interestAndFee } from './itr-return-builder.mjs';
import { houseProperty } from './itr-return-individual.mjs';
import { computeCapitalGains } from './capital-gains.mjs';
import { incomeTax } from './sprint-load.mjs';

const { skeletonFor, mergeInto, pruneEmpty, personalInfo, bankDetails, taxPayments, ageBandOf, finish, rupees, signed, sum, DATE_RE } = shared;
const PAISE = 100;
const HP_LOSS_LIMIT = 200000;
const SECTION_10_NATURES = new Set(['10(5)', '10(6)', '10(7)', '10(10)', '10(10A)']);
const EMPLOYER_NATURES = new Set(['CGOV', 'SGOV', 'PSU', 'PE', 'PESG', 'PEPS', 'PEO', 'OTH', 'NA']);

const COLUMNS = {
  STCG15Per: ['stcg111A_BE'],
  STCG20Per: ['stcg111A_AE'],
  STCG30Per: [],
  STCGAppRate: ['stcgOther'],
  STCGDTAARate: [],
  LTCG10Per: ['ltcg112A_BE'],
  LTCG12_5Per: ['ltcg112A_AE', 'ltcgOther_AE'],
  LTCG20Per: ['ltcgOther_BE'],
  LTCGDTAARate: [],
};
const SHORT_COLUMNS = ['STCG15Per', 'STCG20Per', 'STCG30Per', 'STCGAppRate', 'STCGDTAARate'];
const LONG_COLUMNS = ['LTCG10Per', 'LTCG12_5Per', 'LTCG20Per', 'LTCGDTAARate'];
const LOSS_SUFFIX = { STCG15Per: 'Stcl15Per', STCG20Per: 'Stcl20Per', STCG30Per: 'Stcl30Per', STCGAppRate: 'StclAppRate', STCGDTAARate: 'StclDTAARate', LTCG10Per: 'Ltcl10Per', LTCG12_5Per: 'Ltcl12_5Per', LTCG20Per: 'Ltcl20Per', LTCGDTAARate: 'LtclDTAARate' };
const SETOFF_FIELD = { STCG15Per: 'StclSetoff15Per', STCG20Per: 'StclSetoff20Per', STCG30Per: 'StclSetoff30Per', STCGAppRate: 'StclSetoffAppRate', STCGDTAARate: 'StclSetoffDTAARate', LTCG10Per: 'LtclSetOff10Per', LTCG12_5Per: 'LtclSetOff12_5Per', LTCG20Per: 'LtclSetOff20Per', LTCGDTAARate: 'LtclSetOffDTAARate' };
const GAIN_BLOCK = { STCG15Per: 'InStcg15Per', STCG20Per: 'InStcg20Per', STCG30Per: 'InStcg30Per', STCGAppRate: 'InStcgAppRate', STCGDTAARate: 'InStcgDTAARate', LTCG10Per: 'InLtcg10Per', LTCG12_5Per: 'InLtcg12_5Per', LTCG20Per: 'InLtcg20Per', LTCGDTAARate: 'InLtcgDTAARate' };
const columnOf = (bucket) => Object.keys(COLUMNS).find((name) => COLUMNS[name].includes(bucket));
const fromBuckets = (map, column) => COLUMNS[column].reduce((total, key) => total + (map[key] || 0), 0);

function layer(target, patch, path, itemAt) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const isObject = value && typeof value === 'object' && !Array.isArray(value);
    if (!isObject) {
      target[key] = value;
      continue;
    }
    if (!Object.hasOwn(target, key) || typeof target[key] !== 'object' || target[key] === null) {
      const base = itemAt([...path, key]);
      target[key] = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    }
    layer(target[key], value, [...path, key], itemAt);
  }
  return target;
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function salaryBlock(args, notes, problems) {
  const input = args.salary || {};
  const employers = Array.isArray(input.employers) && input.employers.length ? input.employers : (input.gross || input.perquisites || input.profitsInLieu ? [input] : []);
  const rows = employers.map((employer, index) => {
    if (!employer.name) problems.push({ path: `salary.employers[${index}].name`, message: 'The employer name is required.' });
    const nature = EMPLOYER_NATURES.has(employer.nature) ? employer.nature : 'OTH';
    return {
      name: String(employer.name || '').slice(0, 125),
      nature,
      tan: employer.tan ? String(employer.tan).toUpperCase() : '',
      address: employer.address || {},
      gross: rupees(employer.gross),
      perquisites: rupees(employer.perquisites),
      profitsInLieu: rupees(employer.profitsInLieu),
    };
  });
  const exempt = Array.isArray(input.exemptAllowances) ? input.exemptAllowances : [];
  for (const item of exempt) if (!SECTION_10_NATURES.has(String(item.nature))) problems.push({ path: 'salary.exemptAllowances', message: `Exempt allowance nature must be one of ${[...SECTION_10_NATURES].join(', ')}.` });
  const exemptTotal = exempt.reduce((total, item) => total + rupees(item.amount), 0);
  const hra = input.hra ? {
    place: input.hra.metro ? '1' : '2',
    received: rupees(input.hra.received),
    rentPaid: rupees(input.hra.rentPaid),
    salaryForHra: rupees(input.hra.salaryForHra),
  } : null;
  let hraExempt = 0;
  if (hra) {
    const share = hra.place === '1' ? 0.5 : 0.4;
    const excessRent = Math.max(0, hra.rentPaid - Math.round(hra.salaryForHra * 0.1));
    hraExempt = Math.min(hra.received, excessRent, Math.round(hra.salaryForHra * share));
    notes.push(`House rent allowance exempt under section 10(13A) worked out at Rs ${hraExempt} as the least of the allowance received, rent paid above 10% of salary, and ${hra.place === '1' ? '50%' : '40%'} of salary.`);
  }
  const gross = rows.reduce((total, row) => total + row.gross + row.perquisites + row.profitsInLieu, 0);
  return { rows, exempt, exemptTotal: exemptTotal + hraExempt, hra, hraExempt, gross, professionalTax: rupees(input.professionalTax), entertainment: rupees(input.entertainmentAllowance) };
}

function loanRows(input, interest) {
  const loans = Array.isArray(input.interestLoans) && input.interestLoans.length ? input.interestLoans : [{ interest }];
  return loans.map((loan) => ({
    LoanTknFrom: loan.from === 'I' ? 'I' : 'B',
    BankOrInstnName: String(loan.lender || 'Lender').slice(0, 125),
    LoanAccNoOfBankOrInstnRefNo: String(loan.accountNo || 'LOAN1').slice(0, 20),
    DateofLoan: DATE_RE.test(String(loan.date || '')) ? loan.date : '2000-04-01',
    TotalLoanAmt: rupees(loan.amount),
    LoanOutstndngAmt: rupees(loan.outstanding),
    InterestUs24B: rupees(loan.interest ?? interest),
  }));
}

function propertyBlock(args, regime) {
  const list = Array.isArray(args.houseProperties) ? args.houseProperties : [];
  const rows = list.map((input, index) => {
    const share = Math.min(100, Math.max(0, Number(input.sharePercent ?? 100)));
    const scaled = { ...input, rentReceived: Math.round(rupees(input.rentReceived) * share / 100), municipalTax: Math.round(rupees(input.municipalTax) * share / 100), arrearsRent: rupees(input.arrearsRent) };
    const h = houseProperty(scaled, regime);
    return { index, input, share, h };
  });
  return rows;
}

function otherSourcesBlock(args) {
  const other = args.otherIncome || {};
  const savings = rupees(other.savingsInterest);
  const deposits = rupees(other.depositInterest);
  const refundInterest = rupees(other.taxRefundInterest);
  const otherInterest = rupees(other.otherInterest);
  const familyPension = rupees(other.familyPension);
  const familyPensionDeduction = Math.min(Math.round(familyPension / 3), 25000);
  const dividend = rupees(other.dividend);
  const misc = rupees(other.other);
  const expenses = rupees(other.expenses);
  const gross = savings + deposits + refundInterest + otherInterest + familyPension + dividend + misc;
  const net = Math.max(0, gross - familyPensionDeduction - expenses);
  return { savings, deposits, refundInterest, otherInterest, familyPension, familyPensionDeduction, dividend, misc, expenses, gross, net, dividendByQuarter: other.dividendByQuarter, otherNature: other.otherNature };
}

function gainLines(rows) {
  const zero = () => ({ sale: 0, cost: 0, improvement: 0, expenses: 0, gain: 0 });
  const groups = { stt: { be: zero(), ae: zero() }, otherShort: { be: zero(), ae: zero() }, otherLong: { be: zero(), ae: zero() }, property: [] };
  for (const row of rows) {
    const side = row.after ? 'ae' : 'be';
    const add = (target) => {
      target.sale += row.sale;
      target.cost += row.cost;
      target.improvement += row.improvement;
      target.expenses += row.expenses;
      target.gain += row.gain;
    };
    if (row.bucket.startsWith('stcg111A')) add(groups.stt[side]);
    else if (row.kind === 'property') groups.property.push(row);
    else if (row.bucket === 'stcgOther') add(groups.otherShort[side]);
    else if (row.bucket.startsWith('ltcg112A')) add(groups.stt[`long${side}`] ||= zero());
    else add(groups.otherLong[side]);
  }
  return groups;
}

function capitalGainsPatch(cg, rows, regime) {
  const groups = gainLines(rows);
  const equityLine = (g) => ({
    FullConsideration: g.sale,
    DeductSec48: { AquisitCost: g.cost, ImproveCost: g.improvement, ExpOnTrans: g.expenses, TotalDedn: g.cost + g.improvement + g.expenses },
    BalanceCG: g.gain,
    LossSec94of7Or94of8: 0,
    CapgainonAssets: g.gain,
  });
  const otherLine = (g, short = false) => ({
    FullValueConsdRecvUnqshr: 0,
    FairMrktValueUnqshr: 0,
    FullValueConsdSec50CA: 0,
    FullValueConsdOthUnqshr: g.sale,
    FullConsideration: g.sale,
    DeductSec48: { AquisitCost: g.cost, ImproveCost: g.improvement, ExpOnTrans: g.expenses, TotalDedn: g.cost + g.improvement + g.expenses },
    BalanceCG: g.gain,
    ...(short ? { LossSec94of7Or94of8: 0 } : { DeductionUs54F: 0 }),
    CapgainonAssets: g.gain,
  });
  const propertyRows = groups.property;
  const shortProperty = propertyRows.filter((row) => !row.longTerm);
  const longProperty = propertyRows.filter((row) => row.longTerm);
  const shortOtherTotal = groups.otherShort.be.gain + groups.otherShort.ae.gain;
  const sttShort = groups.stt.be.gain + groups.stt.ae.gain;
  const sttShortLines = groups.stt.be.sale || groups.stt.ae.sale ? [{
    MFSectionCode: '1A',
    EquityMFonSTTDtls_BE: { ...equityLine(groups.stt.be), CapgainonAssets: groups.stt.be.gain },
    EquityMFonSTTDtls: equityLine(groups.stt.ae),
    TotalCapGainonassets: sttShort,
  }] : [];
  const shortPropertyTotal = shortProperty.reduce((total, row) => total + row.gain, 0);
  const totalSTCG = sttShort + shortOtherTotal + shortPropertyTotal;
  const longEquityBE = groups.stt.longbe || { sale: 0, cost: 0, improvement: 0, expenses: 0, gain: 0 };
  const longEquityAE = groups.stt.longae || { sale: 0, cost: 0, improvement: 0, expenses: 0, gain: 0 };
  const longPropertyTotal = longProperty.reduce((total, row) => total + row.gain, 0);
  const longEquity = longEquityBE.gain + longEquityAE.gain;
  const longOther = groups.otherLong.be.gain + groups.otherLong.ae.gain;
  const totalLTCG = longEquity + longPropertyTotal + longOther;
  const landDetails = (list, isLong) => list.map((row) => {
    const base = {
      DateofPurchase: row.buyDate,
      DateofSale: row.sellDate,
      FullConsideration: row.sale,
      FullConsideration50C: row.sale,
      AquisitCost: row.cost,
      ExpOnTrans: row.expenses,
      TotalDedn: row.cost + row.improvement + row.expenses,
      Balance: row.gain,
    };
    if (!isLong) return { ...base, ImproveCost: row.improvement, DeductionUs54B: 0, STCGonImmvblPrprty: row.gain };
    const indexed = row.indexationChosen ? rupees(row.indexedCost) : row.cost;
    return {
      ...base,
      AquisitCostIndex: indexed,
      CostOfImprovements: { CostOfImprovementsDtls: [], TotalImprovecost: row.improvement, TotalindexImprovecost: row.improvement },
      ExemptionOrDednUs54: { ExemptionGrandTotal: 0 },
      LTCGonImmvblPrprty: row.after ? row.gain : 0,
      LTCGonImmvblPrprtyBE: row.after ? 0 : row.gain,
    };
  });
  const patch = {
    ShortTermCapGainFor23: {
      EquityMFonSTT: sttShortLines,
      SaleOnOtherAssets: otherLine({ sale: groups.otherShort.be.sale + groups.otherShort.ae.sale, cost: groups.otherShort.be.cost + groups.otherShort.ae.cost, improvement: groups.otherShort.be.improvement + groups.otherShort.ae.improvement, expenses: groups.otherShort.be.expenses + groups.otherShort.ae.expenses, gain: shortOtherTotal }, true),
      TotalAmtDeemedStcg: 0,
      TotalAmtNotTaxUsDTAAStcg: 0,
      TotalAmtTaxUsDTAAStcg: 0,
      TotalSTCG: totalSTCG,
    },
    LongTermCapGain23: {
      SaleOfEquityShareUs112A: {
        BalanceCG: longEquity,
        BalanceCGTransferBE: longEquityBE.gain,
        BalanceCGTransferAE: longEquityAE.gain,
        DeductionUs54F: 0,
        DeductionUs54FBE: 0,
        DeductionUs54FAE: 0,
        CapgainonAssets: longEquity,
        CapgainonAssetsTransferBE: longEquityBE.gain,
        CapgainonAssetsTransferAE: longEquityAE.gain,
      },
      SaleofAssetNADtls: {
        SaleofAssetNA_BE: otherLine(groups.otherLong.be),
        SaleofAssetNA: otherLine(groups.otherLong.ae),
        TotalCapgainonAssets: longOther,
      },
      TotalAmtDeemedLtcg: 0,
      TotalAmtNotTaxUsDTAALtcg: 0,
      TotalAmtTaxUsDTAALtcg: 0,
      TotalLTCG: totalLTCG,
    },
    SumOfCGIncm: totalSTCG + totalLTCG,
    IncmFromVDATrnsf: 0,
    TotScheduleCGFor23: totalSTCG + totalLTCG,
  };
  const landShort = landDetails(shortProperty, false);
  const landLong = landDetails(longProperty, true);
  const extra = { shortLand: landShort, longLand: landLong, shortPropertyTotal, longPropertyBE: longProperty.filter((row) => !row.after).reduce((total, row) => total + row.gain, 0), longPropertyAE: longProperty.filter((row) => row.after).reduce((total, row) => total + row.gain, 0) };
  return { patch, extra, totals: { totalSTCG, totalLTCG } };
}

function currYrLosses(cg) {
  const net = {};
  for (const column of Object.keys(COLUMNS)) net[column] = fromBuckets(cg.original, column);
  const lossIn = {};
  const gainIn = {};
  for (const column of Object.keys(COLUMNS)) {
    lossIn[column] = Math.max(0, -net[column]);
    gainIn[column] = Math.max(0, net[column]);
  }
  const cellMatrix = {};
  for (const [lossBucket, targets] of Object.entries(cg.lossMatrix)) {
    const lossColumn = columnOf(lossBucket);
    for (const [gainBucket, amount] of Object.entries(targets)) {
      const gainColumn = columnOf(gainBucket);
      if (lossColumn === gainColumn) continue;
      cellMatrix[gainColumn] ||= {};
      cellMatrix[gainColumn][lossColumn] = (cellMatrix[gainColumn][lossColumn] || 0) + amount;
    }
  }
  const block = { InLossSetOff: {}, TotLossSetOff: {}, LossRemainSetOff: {} };
  for (const column of Object.keys(COLUMNS)) {
    block.InLossSetOff[SETOFF_FIELD[column]] = lossIn[column];
    const setOffTotal = Object.values(cg.lossMatrix).length ? Object.entries(cg.lossMatrix).filter(([lossBucket]) => columnOf(lossBucket) === column).reduce((total, [, targets]) => total + Object.values(targets).reduce((a, b) => a + b, 0), 0) : 0;
    block.TotLossSetOff[SETOFF_FIELD[column]] = setOffTotal;
    block.LossRemainSetOff[SETOFF_FIELD[column]] = Math.max(0, lossIn[column] - setOffTotal);
    const gainBlock = { CurrYearIncome: gainIn[column] };
    let used = 0;
    for (const other of Object.keys(COLUMNS)) {
      if (other === column || !SETOFF_FIELD[other]) continue;
      const field = SETOFF_FIELD[other];
      if (column.startsWith('STCG') && other.startsWith('LTCG')) continue;
      const amount = cellMatrix[column]?.[other] || 0;
      gainBlock[field] = amount;
      used += amount;
    }
    gainBlock.CurrYrCapGain = Math.max(0, gainIn[column] - used);
    block[GAIN_BLOCK[column]] = gainBlock;
  }
  return block;
}

export function buildItr2(args = {}) {
  const info = assessmentYearOf(args.fy || '2024-25');
  if (!info) return fail('FY_INVALID', { hint: 'Give the financial year as 2024-25.' });
  const notes = [];
  const problems = [];
  const warnings = [];
  const taxpayer = args.taxpayer || {};
  const skeleton = skeletonFor('ITR-2');
  if (!skeleton) return fail('ITR_SCHEMA_MISSING', { form: 'ITR-2' });
  const personal = personalInfo(taxpayer, notes, problems, 'ITR-2');
  if (taxpayer.status === 'F') problems.push({ path: 'taxpayer.status', message: 'ITR-2 is for an individual or HUF.' });

  if (args.foreignAssets === true) problems.push({ path: 'foreignAssets', message: 'Foreign assets and foreign income need Schedule FA and Schedule FSI, which this builder does not produce yet. Use the portal utility for those schedules.' });
  if (rupees(args.businessIncome) > 0 || (args.businesses || []).length || (args.professions || []).length) problems.push({ path: 'businesses', message: 'Business or professional income rules out ITR-2. Use ITR-3 or ITR-4.' });
  if (args.residentialStatus && args.residentialStatus !== 'RES') problems.push({ path: 'residentialStatus', message: 'Only resident individuals are built here. A non-resident or not-ordinarily-resident return needs more schedules.' });

  const salary = salaryBlock(args, notes, problems);
  const other = otherSourcesBlock(args);
  const ageBand = ageBandOf(personal.DOB, info.fyEnd);
  const agri = rupees(args.agriIncome);
  const deductions = args.deductions || {};
  const extras = chapterViaExtras(deductions, { ageBand, savingsInterest: other.savings, depositInterest: other.deposits });

  const cg = computeCapitalGains({ transactions: args.capitalGains?.transactions || [], broughtForward: { stcl: args.broughtForward?.shortTermCapitalLoss, ltcl: args.broughtForward?.longTermCapitalLoss } });
  for (const error of cg.problems) problems.push(error);
  notes.push(...cg.notes);
  for (const row of cg.rows) notes.push(...row.notes.map((text) => `${row.name}: ${text}`));
  for (const item of cg.rows.filter((row) => row.bucket.startsWith('ltcg112A') || row.bucket.startsWith('stcg111A'))) {
    if (!item.name) problems.push({ path: 'capitalGains', message: 'Each listed share or fund sale needs a name.' });
  }

  const regimeWanted = ['old', 'new', 'auto'].includes(args.regime) ? args.regime : 'new';
  const specialPaise = Object.fromEntries(Object.entries(cg.specialIncome).map(([key, value]) => [key, Math.max(0, value) * PAISE]));
  const hpBlocks = (regime) => propertyBlock(args, regime);
  const bfHp = rupees(args.broughtForward?.houseProperty);

  const runFor = (regime) => {
    const rows = hpBlocks(regime);
    const hpTotal = rows.reduce((total, row) => total + row.h.income, 0);
    const professionalTax = regime === 'old' ? salary.professionalTax : 0;
    const netSalary = Math.max(0, salary.gross - salary.exemptTotal);
    const standardEstimate = regime === 'old' ? 50000 : 75000;
    const salaryAfter = Math.max(0, netSalary - Math.min(netSalary, standardEstimate));
    const normalBeforeHp = salaryAfter - professionalTax + other.net + cg.normalRateGain;
    let hpForTax = 0;
    let hpLossSetoff = 0;
    let hpLossCarried = 0;
    if (hpTotal >= 0) hpForTax = hpTotal;
    else if (regime === 'old') {
      const loss = Math.min(-hpTotal, HP_LOSS_LIMIT);
      hpLossSetoff = Math.min(loss, Math.max(0, normalBeforeHp));
      hpLossCarried = -hpTotal - hpLossSetoff;
      hpForTax = -hpLossSetoff;
    } else {
      hpLossCarried = -hpTotal;
    }
    const bfHpSetoff = hpTotal > 0 && regime === 'old' ? Math.min(bfHp, hpTotal) : Math.min(bfHp, Math.max(0, hpTotal));
    hpForTax -= bfHpSetoff;
    const bfHpCarried = bfHp - bfHpSetoff;
    const calc = incomeTax.computeIncomeTaxSpecial({
      fy: info.fy,
      regime,
      ageBand,
      residentIndividual: true,
      salaryPaise: netSalary * PAISE,
      otherIncomePaise: (other.net + hpForTax - professionalTax + cg.normalRateGain) * PAISE,
      claims: {
        otherChapterViaPaise: (extras.totalOld || 0) * PAISE,
        employerNpsPaise: (regime === 'old' ? extras.employerNpsOld || 0 : extras.employerNpsNew || 0) * PAISE,
        section80CPaise: rupees(deductions.c80) * PAISE,
        healthInsuranceSelfAndFamilyPaise: rupees(deductions.d80Self) * PAISE,
        healthInsuranceParentsPaise: rupees(deductions.d80Parents) * PAISE,
        selfAndFamilyIncludesSenior: deductions.selfSenior === true,
        parentsIncludeSenior: deductions.parentsSenior === true,
      },
      special: specialPaise,
    });
    return { regime, rows, hpTotal, hpForTax, hpLossSetoff, hpLossCarried, bfHpSetoff, bfHpCarried, professionalTax, netSalary, calc };
  };

  let chosen = regimeWanted;
  let compared = null;
  let run;
  if (regimeWanted === 'auto') {
    const results = [runFor('new'), runFor('old')];
    const failed = results.find((item) => item.calc.error);
    if (failed) return fail(failed.calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
    run = results[0].calc.taxPayablePaise <= results[1].calc.taxPayablePaise ? results[0] : results[1];
    chosen = run.regime;
    compared = { newTax: results[0].calc.taxPayablePaise / PAISE, oldTax: results[1].calc.taxPayablePaise / PAISE };
  } else {
    run = runFor(chosen);
    if (run.calc.error) return fail(run.calc.error, { fy: info.fy, hint: 'No income-tax rules are recorded for this financial year; nothing was computed.' });
  }
  const old = chosen === 'old';
  const calc = run.calc;
  const via = viaPatch({ ...calc, grossTotalIncomePaise: calc.grossNormalIncomePaise }, extras);
  if (!old && (rupees(deductions.c80) || rupees(deductions.d80Self) || rupees(deductions.d80Parents))) warnings.push('Deductions under 80C and 80D are not allowed in the new tax regime, so they were not claimed. Choose the old regime if they should count.');
  if (calc.surchargeWarning) warnings.push(calc.surchargeWarning);
  if (calc.basicExemptionAdjustedPaise > 0) notes.push(`Rs ${calc.basicExemptionAdjustedPaise / PAISE} of special-rate gains was set against the unused basic exemption limit, highest rate first.`);

  const standardDeduction = calc.standardDeductionPaise / PAISE;
  const professionalTaxAllowed = old ? Math.min(run.professionalTax, Math.max(0, run.netSalary - standardDeduction)) : 0;
  const incomeFromSalary = Math.max(0, run.netSalary - standardDeduction - professionalTaxAllowed);
  const specialFinal = cg.specialIncome;
  const specialTotal = Object.values(specialFinal).reduce((a, b) => a + b, 0);
  const grossTotal = incomeFromSalary + Math.max(0, run.hpForTax) + other.net + cg.normalRateGain + specialTotal - Math.max(0, -run.hpForTax);
  const totalIncome = calc.totalIncomePaise / PAISE;
  if (totalIncome > 5000000) problems.push({ path: 'income', message: `Total income ${totalIncome} is above Rs 50 lakh. Schedule AL (assets and liabilities) is required and is not built here yet.` });

  const slabAndSpecial = calc.normalTaxPaise / PAISE + calc.specialTaxPaise / PAISE;
  const rebate = calc.rebatePaise / PAISE;
  const surcharge = calc.surchargePaise / PAISE;
  const taxPayable = calc.taxPayablePaise / PAISE;
  const cess = taxPayable - (slabAndSpecial - rebate + surcharge);
  const relief89 = rupees(args.relief89);
  const netLiability = Math.max(0, taxPayable - relief89);
  const filingDate = DATE_RE.test(String(args.filingDate || '')) ? args.filingDate : `${info.ayStart}-07-31`;
  const dueDate = `${info.ayStart}-07-31`;
  const advance = (Array.isArray(args.taxesPaid?.advanceTax) ? args.taxesPaid.advanceTax : []).map((p) => ({ date: String(p.date || ''), amount: rupees(p.amount) })).filter((p) => DATE_RE.test(p.date) && p.amount > 0);
  const tdsSalary = Array.isArray(args.taxesPaid?.tdsSalary) ? args.taxesPaid.tdsSalary : [];
  const tdsOther = Array.isArray(args.taxesPaid?.tdsOther) ? args.taxesPaid.tdsOther : [];
  const tds = sum(...tdsSalary.map((x) => rupees(x.tds)), ...tdsOther.map((x) => rupees(x.tds)), rupees(args.taxesPaid?.tds));
  const tcs = rupees(args.taxesPaid?.tcs);
  const selfAssessment = rupees(args.taxesPaid?.selfAssessment);
  const challans = Array.isArray(args.taxesPaid?.challans) ? args.taxesPaid.challans : [];
  const advanceTotal = advance.reduce((total, p) => total + p.amount, 0);
  const hasGains = cg.rows.some((row) => row.gain > 0);
  if (hasGains) notes.push('Section 234C relief for capital gains was applied: interest is not charged on instalments that fell due before the gain arose. Confirm the figure with your CA.');
  const interest = interestAndFee({ ayStart: info.ayStart, dueDate, filingDate, taxLiability: netLiability, tdsAndTcs: tds + tcs, advancePayments: advance, presumptive: false, totalIncome, selfAssessment, hasCapitalGainOrLottery: hasGains });
  const interestTotal = interest.us234A + interest.us234B + interest.us234C;
  const totalTaxInterest = netLiability + interestTotal + interest.fee234F;
  const taxesPaid = advanceTotal + tds + tcs + selfAssessment;
  const balance = Math.max(0, totalTaxInterest - taxesPaid);
  const refund = Math.max(0, taxesPaid - totalTaxInterest);
  if (!args.bank?.account) problems.push({ path: 'bank', message: refund > 0 ? 'A refund is due: a bank account in your name, pre-validated on the portal, is needed to receive it.' : 'The return needs at least one bank account in your name, even when no refund is due.' });

  const carry = { shortTermCapitalLoss: cg.carryForward.stcl, longTermCapitalLoss: cg.carryForward.ltcl, houseProperty: run.hpLossCarried + run.bfHpCarried };
  if (run.hpLossCarried > 0 && !old) notes.push(`A house property loss of Rs ${run.hpLossCarried} cannot be set off in the new regime; it is carried forward.`);
  if (run.hpLossCarried > 0 && old) notes.push(`A house property loss of Rs ${run.hpLossCarried} is carried forward (set-off against other heads is limited to Rs 2 lakh and to the income available).`);

  const patch = {};
  const sections = capitalGainsPatch(cg, cg.rows, chosen);
  const columnsAfterYear = Object.fromEntries(Object.keys(COLUMNS).map((column) => [column, fromBuckets(cg.afterYearLosses, column) + (column.startsWith('LTCG') ? 0 : 0)]));
  const columnsFinal = Object.fromEntries(Object.keys(COLUMNS).map((column) => [column, fromBuckets(specialFinal, column) + (column === 'STCGAppRate' ? cg.normalRateGain : 0)]));
  const bfSetoffByColumn = (column) => fromBuckets(cg.bfSetoff.short, column) + fromBuckets(cg.bfSetoff.long, column);

  patch.CreationInfo = { SWVersionNo: '1.0', SWCreatedBy: 'SW00000001', JSONCreatedBy: 'SW00000001', JSONCreationDate: filingDate, IntermediaryCity: 'Bengaluru', Digest: '-' };
  patch.Form_ITR2 = { FormName: 'ITR-2', Description: 'For Indls and HUFs not having income from business or profession', AssessmentYear: String(info.ayStart), SchemaVer: 'Ver1.0', FormVer: 'Ver1.0' };
  patch.PartA_GEN1 = {
    PersonalInfo: personal,
    FilingStatus: {
      ReturnFileSec: [11, 12, 13, 14, 16, 17, 18, 19].includes(Number(args.returnSection)) ? Number(args.returnSection) : 11,
      OptOutNewTaxRegime: old ? 'Y' : 'N',
      SeventhProvisio139: 'N',
      ResidentialStatus: 'RES',
      FiiFpiFlag: 'N',
      HeldUnlistedEqShrPrYrFlg: args.unlistedShares === true ? 'Y' : 'N',
      CompDirectorPrvYrFlg: args.director === true ? 'Y' : 'N',
      ItrFilingDueDate: dueDate,
    },
  };

  const salaries = salary.rows.map((row) => {
    const item = skeleton.itemAt(['ScheduleS', 'Salaries']);
    return mergeInto(item, {
      NameOfEmployer: row.name,
      NatureOfEmployment: ['CGOV', 'SGOV', 'PSU', 'PE', 'PESG'].includes(row.nature) ? row.nature : 'PE',
      ...(row.tan ? { TANofEmployer: row.tan } : {}),
      AddressDetail: {
        AddrDetail: String(row.address.line || row.address.flat || taxpayer.address?.flat || 'NA').slice(0, 200),
        CityOrTownOrDistrict: String(row.address.city || taxpayer.address?.city || 'NA').slice(0, 50),
        StateCode: String(row.address.stateCode || taxpayer.address?.stateCode || '99').padStart(2, '0'),
        ...(row.address.pin ? { PinCode: Number(String(row.address.pin).replace(/\D/g, '')) || undefined } : {}),
      },
      Salarys: { GrossSalary: row.gross + row.perquisites + row.profitsInLieu, Salary: row.gross, ValueOfPerquisites: row.perquisites, ProfitsinLieuOfSalary: row.profitsInLieu, IncomeNotified89A: 0, IncomeNotifiedOther89A: 0 },
    });
  });
  patch.ScheduleS = {
    Salaries: salaries,
    TotalGrossSalary: salary.gross,
    AllwncExtentExemptUs10: salary.exemptTotal,
    NetSalary: run.netSalary,
    DeductionUS16: standardDeduction + professionalTaxAllowed + salary.entertainment,
    DeductionUnderSection16ia: standardDeduction,
    EntertainmntalwncUs16ii: salary.entertainment,
    ProfessionalTaxUs16iii: professionalTaxAllowed,
    TotIncUnderHeadSalaries: incomeFromSalary,
  };
  if (salary.exempt.length) patch.ScheduleS.AllwncExemptUs10 = { AllwncExemptUs10Dtls: salary.exempt.map((item) => ({ SalNatureDesc: String(item.nature), SalOthAmount: rupees(item.amount) })) };
  if (salary.hra) patch.ScheduleS.Section10_13A = { Placeofwork: salary.hra.place, ActlHRARecv: salary.hra.received, ActlRentPaid: salary.hra.rentPaid, DtlsSalUsSec171: salary.hra.salaryForHra, ActlRentPaid10Per: Math.round(salary.hra.salaryForHra * 0.1), Sal40Or50Per: Math.round(salary.hra.salaryForHra * (salary.hra.place === '1' ? 0.5 : 0.4)), EligbleExmpAllwncUs10Hra: salary.hraExempt, EligbleExmpAllwncUs13A: salary.hraExempt };
  if (salary.hra) delete patch.ScheduleS.Section10_13A.EligbleExmpAllwncUs10Hra;

  const hpItems = run.rows.filter((row) => row.h.type).map((row, position) => {
    const item = skeleton.itemAt(['ScheduleHP', 'PropertyDetails']);
    const h = row.h;
    const owned = Math.round(Math.max(0, h.annualValue));
    const address = row.input.address || {};
    return mergeInto(item, {
      HPSNo: position + 1,
      AddressDetailWithZipCode: {
        AddrDetail: String(address.line || 'NA').slice(0, 200),
        CityOrTownOrDistrict: String(address.city || 'NA').slice(0, 50),
        StateCode: String(address.stateCode || taxpayer.address?.stateCode || '99').padStart(2, '0'),
        CountryCode: '91',
        ...(address.pin ? { PinCode: Number(String(address.pin).replace(/\D/g, '')) || undefined } : {}),
      },
      PropertyOwner: 'SE',
      PropCoOwnedFlg: row.share < 100 ? 'YES' : 'NO',
      AsseseeShareProperty: row.share,
      ifLetOut: h.type,
      Rentdetails: {
        AnnualLetableValue: h.gross,
        RentNotRealized: 0,
        LocalTaxes: h.taxPaid,
        TotalUnrealizedAndTax: h.taxPaid,
        BalanceALV: owned,
        AnnualOfPropOwned: owned,
        ThirtyPercentOfBalance: h.standardDeduction,
        IntOnBorwCap: h.interest,
        Section24B: { Section24BDtls: h.interest > 0 ? loanRows(row.input, h.interest) : [], TotalInterestUs24B: h.interest },
        TotalDeduct: h.standardDeduction + h.interest,
        ArrearsUnrealizedRentRcvd: h.arrears,
        IncomeOfHP: h.income,
      },
    });
  });
  if (hpItems.length) {
    for (const item of hpItems) {
      if (item.PropCoOwnedFlg === 'NO') item.AsseseeShareProperty = 100;
      if (item.ifLetOut !== 'L') delete item.TenantDetails;
    }
    patch.ScheduleHP = { PropertyDetails: hpItems, PassThroghIncome: 0, TotalIncomeChargeableUnHP: run.hpTotal };
  }

  Object.assign(patch, { ScheduleCGFor23: sections.patch });
  const gainsAfterSetOff = Object.values(columnsAfterYear).reduce((a, b) => a + b, 0);
  patch.ScheduleCGFor23.SumOfCGIncm = gainsAfterSetOff;
  patch.ScheduleCGFor23.TotScheduleCGFor23 = gainsAfterSetOff;
  patch.ScheduleCGFor23.CurrYrLosses = currYrLosses(cg);
  patch.ScheduleCGFor23.DeducClaimInfo = { TotDeductClaim: 0 };

  const sched112 = cg.rows.filter((row) => row.bucket.startsWith('ltcg112A'));
  if (sched112.length) {
    const lines = args.capitalGains?.transactions?.filter((txn) => txn.kind === 'listed-equity' || txn.kind === 'equity-mf') || [];
    const isinOf = (row) => lines.find((txn) => (txn.name || txn.kind) === row.name && txn.buyDate === row.buyDate && txn.sellDate === row.sellDate)?.isin;
    const details = sched112.map((row) => {
      const isin = String(isinOf(row) || '').toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) problems.push({ path: 'capitalGains.transactions', message: `Schedule 112A needs the ISIN of ${row.name}.` });
      const item = skeleton.itemAt(['Schedule112A', 'Schedule112ADtls']);
      const source = lines.find((txn) => (txn.name || txn.kind) === row.name && txn.buyDate === row.buyDate && txn.sellDate === row.sellDate) || {};
      const fmv = source.fmv31Jan2018 != null ? rupees(source.fmv31Jan2018) : 0;
      return mergeInto(item, {
        ShareOnOrBefore: row.buyDate < '2018-02-01' ? 'BE' : 'AE',
        ShareTransferredOnOrBefore: row.after ? 'AE' : 'BE',
        ISINCode: isin,
        ShareUnitName: String(row.name).slice(0, 125),
        TotSaleValue: row.sale,
        CostAcqWithoutIndx: rupees(source.cost),
        AcquisitionCost: row.cost,
        LTCGBeforelowerB1B2: Math.max(0, row.sale - rupees(source.cost)),
        FairMktValuePerShareunit: 0,
        TotFairMktValueCapAst: fmv,
        ExpExclCnctTransfer: row.expenses,
        TotalDeductions: row.cost + row.expenses + row.improvement,
        Balance: row.gain,
      });
    });
    const total = (key) => details.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
    const gainBE = details.filter((item) => item.ShareTransferredOnOrBefore === 'BE').reduce((acc, item) => acc + item.Balance, 0);
    const gainAE = details.filter((item) => item.ShareTransferredOnOrBefore === 'AE').reduce((acc, item) => acc + item.Balance, 0);
    patch.Schedule112A = {
      Schedule112ADtls: details,
      SaleValue112A: total('TotSaleValue'),
      CostAcqWithoutIndx112A: total('CostAcqWithoutIndx'),
      AcquisitionCost112A: total('AcquisitionCost'),
      LTCGBeforelowerB1B2112A: total('LTCGBeforelowerB1B2'),
      FairMktValueCapAst112A: total('TotFairMktValueCapAst'),
      ExpExclCnctTransfer112A: total('ExpExclCnctTransfer'),
      Deductions112A: total('TotalDeductions'),
      Balance112A: gainBE + gainAE,
      Balance112ABE: gainBE,
      Balance112AAE: gainAE,
      TotalBalance112A: gainBE + gainAE,
    };
  }

  const cyla = {};
  for (const column of Object.keys(COLUMNS)) {
    const value = columnsAfterYear[column];
    cyla[column] = { IncCYLA: { IncOfCurYrUnderThatHead: value, IncOfCurYrAfterSetOff: value } };
  }
  cyla.TotalCurYr = { TotHPlossCurYr: Math.min(run.hpLossSetoff + run.hpLossCarried, run.hpLossSetoff + run.hpLossCarried), TotOthSrcLossNoRaceHorse: 0 };
  cyla.TotalLossSetOff = { TotHPlossCurYrSetoff: run.hpLossSetoff, TotOthSrcLossNoRaceHorseSetoff: 0 };
  cyla.LossRemAftSetOff = { BalHPlossCurYrAftSetoff: run.hpLossCarried, BalOthSrcLossNoRaceHorseAftSetoff: 0 };
  patch.ScheduleCYLA = cyla;

  const bfla = { Salary: { IncBFLA: { IncOfCurYrUndHeadFromCYLA: incomeFromSalary, IncOfCurYrAfterSetOffBFLosses: incomeFromSalary } } };
  let bfTotal = 0;
  for (const column of Object.keys(COLUMNS)) {
    const from = columnsAfterYear[column];
    const used = Math.min(from, bfSetoffByColumn(column));
    bfTotal += used;
    bfla[column] = { IncBFLA: { IncOfCurYrUndHeadFromCYLA: from, BFlossPrevYrUndSameHeadSetoff: used, IncOfCurYrAfterSetOffBFLosses: from - used } };
  }
  bfla.TotalBFLossSetOff = { TotBFLossSetoff: bfTotal };
  bfla.IncomeOfCurrYrAftCYLABFLA = incomeFromSalary + Object.values(columnsAfterYear).reduce((a, b) => a + b, 0) - bfTotal;
  patch.ScheduleBFLA = bfla;

  const siRows = [];
  const siRate = (bucket) => ({ stcg111A_BE: ['1A_BE', 15], stcg111A_AE: ['1A', 20], ltcg112A_BE: ['2A_BE', 10], ltcg112A_AE: ['2A', 12.5], ltcgOther_BE: ['21_BE', 20], ltcgOther_AE: ['22', 12.5] })[bucket];
  const byKey = calc.specialTaxByKey || {};
  for (const [bucket, income] of Object.entries(specialFinal)) {
    if (income <= 0) continue;
    const [code, rate] = siRate(bucket);
    const item = skeleton.itemAt(['ScheduleSI', 'SplCodeRateTax']);
    siRows.push(mergeInto(item, { SecCode: code, SplRatePercent: rate, SplRateInc: income, SplRateIncTax: byKey[bucket] != null ? byKey[bucket] / PAISE : Math.round(income * rate / 100) }));
  }
  if (siRows.length) patch.ScheduleSI = { SplCodeRateTax: siRows, TotSplRateInc: specialTotal, TotSplRateIncTax: siRows.reduce((total, row) => total + row.SplRateIncTax, 0) };

  const otherDetails = [];
  const dividendQuarters = Array.isArray(other.dividendByQuarter) && other.dividendByQuarter.length === 5 ? other.dividendByQuarter.map(rupees) : [other.dividend, 0, 0, 0, 0];
  if (other.dividend && !(Array.isArray(other.dividendByQuarter) && other.dividendByQuarter.length === 5)) notes.push('Dividend by quarter was not given, so all of it is shown in the first quarter (up to 15 June), which is the cautious choice for 234C. Give dividendByQuarter with five amounts to correct it.');
  const osBlock = {
    GrossIncChrgblTaxAtAppRate: other.gross,
    DividendGross: other.dividend,
    DividendOthThan22e: other.dividend,
    Dividend22e: 0,
    Dividend22f: 0,
    InterestGross: other.savings + other.deposits + other.refundInterest + other.otherInterest,
    IntrstFrmSavingBank: other.savings,
    IntrstFrmTermDeposit: other.deposits,
    IntrstFrmIncmTaxRefund: other.refundInterest,
    NatofPassThrghIncome: 0,
    IntrstFrmOthers: other.otherInterest,
    RentFromMachPlantBldgs: 0,
    FamilyPension: other.familyPension,
    AnyOtherIncome: other.misc,
    IncChargeableSpecialRates: 0,
    Deductions: { Expenses: other.expenses, DeductionUs57iia: other.familyPensionDeduction, Depreciation: 0, TotDeductions: other.expenses + other.familyPensionDeduction },
    BalanceNoRaceHorse: other.net,
  };
  if (other.misc) osBlock.OthersInc = { OthersIncDtls: [{ OthNatOfInc: String(other.otherNature || 'Other income').slice(0, 50), OthAmount: other.misc }] };
  if (other.dividend) osBlock.DividendIncome = undefined;
  patch.ScheduleOS = { IncOthThanOwnRaceHorse: osBlock, TotOthSrcNoRaceHorse: other.net, IncChargeable: other.net };
  if (other.dividend) {
    patch.ScheduleOS.IncFrmLottery = undefined;
    patch.ScheduleOS.DividendQuarters = dividendQuarters;
  }

  const hpIncomeRow = Math.max(0, run.hpForTax);
  const stRows = { ShortTerm15Per: columnsFinal.STCG15Per, ShortTerm20Per: columnsFinal.STCG20Per, ShortTerm30Per: 0, ShortTermAppRate: columnsFinal.STCGAppRate, ShortTermSplRateDTAA: 0 };
  stRows.TotalShortTerm = Object.values(stRows).reduce((a, b) => a + b, 0);
  const ltRows = { LongTerm10Per: columnsFinal.LTCG10Per, LongTerm12_5Per: columnsFinal.LTCG12_5Per, LongTerm20Per: columnsFinal.LTCG20Per, LongTermSplRateDTAA: 0 };
  ltRows.TotalLongTerm = Object.values(ltRows).reduce((a, b) => a + b, 0);
  const capTotal = stRows.TotalShortTerm + ltRows.TotalLongTerm;
  const totalTI = incomeFromSalary + hpIncomeRow + capTotal + other.net;
  const hpLossUsed = Math.max(0, -run.hpForTax);
  patch['PartB-TI'] = {
    Salaries: incomeFromSalary,
    IncomeFromHP: hpIncomeRow,
    CapGain: { ShortTerm: stRows, LongTerm: ltRows, ShortTermLongTermTotal: capTotal, CapGains30Per115BBH: 0, TotalCapGains: capTotal },
    IncFromOS: { OtherSrcThanOwnRaceHorse: other.net, IncChargblSplRate: 0, FromOwnRaceHorse: 0, TotIncFromOS: other.net },
    TotalTI: totalTI,
    CurrentYearLoss: hpLossUsed,
    BalanceAfterSetoffLosses: Math.max(0, totalTI - hpLossUsed),
    BroughtFwdLossesSetoff: 0,
    GrossTotalIncome: Math.max(0, totalTI - hpLossUsed),
    IncChargeTaxSplRate111A112: specialTotal,
    DeductionsUnderScheduleVIA: via.total,
    TotalIncome: totalIncome,
    IncChargeableTaxSplRates: specialTotal,
    NetAgricultureIncomeOrOtherIncomeForRate: agri,
    AggregateIncome: totalIncome,
    LossesOfCurrentYearCarriedFwd: carry.shortTermCapitalLoss + carry.longTermCapitalLoss + carry.houseProperty,
    DeemedIncomeUs115JC: 0,
  };
  const grossForSummary = Math.max(0, totalTI - hpLossUsed);

  patch.PartB_TTI = {
    ComputationOfTaxLiability: {
      TaxPayableOnTI: {
        TaxAtNormalRatesOnAggrInc: calc.normalTaxPaise / PAISE,
        TaxAtSpecialRates: calc.specialTaxPaise / PAISE,
        RebateOnAgriInc: 0,
        TaxPayableOnTotInc: slabAndSpecial,
      },
      Rebate87A: rebate,
      TaxPayableOnRebate: slabAndSpecial - rebate,
      TotalSurcharge: surcharge,
      EducationCess: cess,
      GrossTaxLiability: taxPayable,
      GrossTaxPayable: taxPayable,
      CreditUS115JD: 0,
      TaxPayAfterCreditUs115JD: taxPayable,
      NetTaxLiability: netLiability,
      IntrstPay: { IntrstPayUs234A: interest.us234A, IntrstPayUs234B: interest.us234B, IntrstPayUs234C: interest.us234C, LateFilingFee234F: interest.fee234F, TotalIntrstPay: interestTotal + interest.fee234F },
      AggregateTaxInterestLiability: totalTaxInterest,
    },
    TaxPaid: { TaxesPaid: { AdvanceTax: advanceTotal, TDS: tds, TCS: tcs, SelfAssessmentTax: selfAssessment, TotalTaxesPaid: taxesPaid }, BalTaxPayable: balance },
    Refund: { RefundDue: refund, BankAccountDtls: { BankDtlsFlag: args.bank?.account ? 'Y' : 'N', AddtnlBankDetails: bankDetails(args.bank) } },
    AssetOutIndiaFlag: 'NO',
  };
  if (relief89) patch.PartB_TTI.ComputationOfTaxLiability.Relief89 = relief89;

  if (via.total > 0) patch.ScheduleVIA = { UsrDeductUndChapVIA: via.block, DeductUndChapVIA: { Section80D: 0, Section80G: 0, Section80GGA: 0, ...via.block } };
  if (old && rupees(deductions.c80) > 0) patch.Schedule80C = { Schedule80CDtls: [{ Amount: calc.section80CPaise / PAISE, IdentificationNo: 'NA' }], TotalAmt: calc.section80CPaise / PAISE };

  patch.ScheduleTDS1 = {
    TDSonSalary: tdsSalary.filter((x) => x.tan).map((x) => ({ EmployerOrDeductorOrCollectDetl: { TAN: String(x.tan).toUpperCase(), EmployerOrDeductorOrCollecterName: String(x.name || '').slice(0, 125) }, IncChrgSal: rupees(x.income), TotalTDSSal: rupees(x.tds) })),
    TotalTDSonSalaries: sum(...tdsSalary.map((x) => rupees(x.tds))),
  };
  patch.ScheduleTDS2 = {
    TDSOthThanSalaryDtls: tdsOther.filter((x) => x.tan).map((x) => ({
      TDSCreditName: 'S',
      TANOfDeductor: String(x.tan).toUpperCase(),
      TDSSection: String(x.section || '193'),
      TaxDeductCreditDtls: { TaxDeductedOwnHands: rupees(x.tds), TaxDeductedIncome: rupees(x.gross), TaxDeductedTDS: rupees(x.tds), TaxClaimedOwnHands: rupees(x.tds), TaxClaimedIncome: rupees(x.gross), TaxClaimedTDS: rupees(x.tds) },
      GrossAmount: rupees(x.gross),
      HeadOfIncome: ['HP', 'CG', 'OS', 'EI', 'NA'].includes(x.head) ? x.head : 'OS',
      AmtCarriedFwd: 0,
    })),
    TotalTDSonOthThanSals: sum(...tdsOther.map((x) => rupees(x.tds))),
  };
  patch.ScheduleIT = { TaxPayment: taxPayments(challans, notes), TotalTaxPayments: taxPayments(challans, []).reduce((total, item) => total + item.Amt, 0) };
  patch.Verification = {
    Declaration: { AssesseeVerName: String(taxpayer.name || '').slice(0, 125), FatherName: String(taxpayer.fatherName || '').slice(0, 125), AssesseeVerPAN: personal.PAN },
    Capacity: 'S',
    Place: String(taxpayer.address?.city || '').slice(0, 50),
    Date: filingDate,
  };

  const cleaned = JSON.parse(JSON.stringify(patch));
  if (cleaned.ScheduleOS) delete cleaned.ScheduleOS.DividendQuarters;
  layer(skeleton.body, cleaned, [], skeleton.itemAt);
  const body = skeleton.body;
  if (!sections.extra.shortLand.length) delete body.ScheduleCGFor23.ShortTermCapGainFor23.SaleofLandBuild;
  else body.ScheduleCGFor23.ShortTermCapGainFor23.SaleofLandBuild = { SaleofLandBuildDtls: sections.extra.shortLand };
  if (!sections.extra.longLand.length) delete body.ScheduleCGFor23.LongTermCapGain23.SaleofLandBuild;
  else body.ScheduleCGFor23.LongTermCapGain23.SaleofLandBuild = { SaleofLandBuildDtls: sections.extra.longLand, TotalLTCGImmblPrprty: sections.extra.longPropertyBE + sections.extra.longPropertyAE, TotalLTCGImmblPrprtyBE: sections.extra.longPropertyBE, TotalLTCGImmblPrprtyAE: sections.extra.longPropertyAE, TotalExcessTax: 0 };
  pruneEmpty(body, [['ScheduleIT', 'TaxPayment'], ['ScheduleTDS1', 'TDSonSalary'], ['ScheduleTDS2', 'TDSOthThanSalaryDtls'], ['ScheduleS', 'Salaries']]);
  if (!salary.rows.length) delete body.ScheduleS;
  if (!other.gross && !other.expenses) delete body.ScheduleOS;
  const itr = { ITR: { ITR2: body } };
  return finish({ form: 'ITR-2', itr, schema: skeleton.schema, info, notes, problems, warnings, summary: {
    regime: chosen,
    comparedRegimes: compared,
    incomeFromSalary,
    incomeFromHouseProperty: run.hpTotal,
    shortTermGains: stRows.TotalShortTerm,
    longTermGains: ltRows.TotalLongTerm,
    exemption112A: cg.exemption112A,
    incomeFromOtherSources: other.net,
    grossTotalIncome: grossForSummary,
    totalIncome,
    taxAtNormalRates: calc.normalTaxPaise / PAISE,
    taxAtSpecialRates: calc.specialTaxPaise / PAISE,
    rebate87A: rebate,
    surcharge,
    cess,
    grossTaxLiability: taxPayable,
    interest234A: interest.us234A,
    interest234B: interest.us234B,
    interest234C: interest.us234C,
    lateFee234F: interest.fee234F,
    taxesPaid,
    balanceTaxPayable: balance,
    refundDue: refund,
    lossesToCarryForward: carry,
    indexationChoice: cg.indexationChoice,
  }, checks: [] });
}
