import { mergeInto, rupees, DATE_RE } from './itr-util.mjs';
const PAISE = 100;

export const COLUMNS = {
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
export const SHORT_COLUMNS = ['STCG15Per', 'STCG20Per', 'STCG30Per', 'STCGAppRate', 'STCGDTAARate'];
const LONG_COLUMNS = ['LTCG10Per', 'LTCG12_5Per', 'LTCG20Per', 'LTCGDTAARate'];
const LOSS_SUFFIX = { STCG15Per: 'Stcl15Per', STCG20Per: 'Stcl20Per', STCG30Per: 'Stcl30Per', STCGAppRate: 'StclAppRate', STCGDTAARate: 'StclDTAARate', LTCG10Per: 'Ltcl10Per', LTCG12_5Per: 'Ltcl12_5Per', LTCG20Per: 'Ltcl20Per', LTCGDTAARate: 'LtclDTAARate' };
const SETOFF_FIELD = { STCG15Per: 'StclSetoff15Per', STCG20Per: 'StclSetoff20Per', STCG30Per: 'StclSetoff30Per', STCGAppRate: 'StclSetoffAppRate', STCGDTAARate: 'StclSetoffDTAARate', LTCG10Per: 'LtclSetOff10Per', LTCG12_5Per: 'LtclSetOff12_5Per', LTCG20Per: 'LtclSetOff20Per', LTCGDTAARate: 'LtclSetOffDTAARate' };
const GAIN_BLOCK = { STCG15Per: 'InStcg15Per', STCG20Per: 'InStcg20Per', STCG30Per: 'InStcg30Per', STCGAppRate: 'InStcgAppRate', STCGDTAARate: 'InStcgDTAARate', LTCG10Per: 'InLtcg10Per', LTCG12_5Per: 'InLtcg12_5Per', LTCG20Per: 'InLtcg20Per', LTCGDTAARate: 'InLtcgDTAARate' };
export const columnOf = (bucket) => Object.keys(COLUMNS).find((name) => COLUMNS[name].includes(bucket));
export const fromBuckets = (map, column) => COLUMNS[column].reduce((total, key) => total + (map[key] || 0), 0);


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

function capitalGainsPatch(cg, rows, form) {
  const itr3 = form === 'ITR-3';
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
    ...(short ? { LossSec94of7Or94of8: 0 } : itr3 ? { ExemptionOrDednUs54: { ExemptionGrandTotal: 0 } } : { DeductionUs54F: 0 }),
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
    if (!isLong) return itr3 ? { ...base, PropertyValuation: row.sale, ImproveCost: row.improvement, ExemptionOrDednUs54: { ExemptionGrandTotal: 0 }, CapgainonAssets: row.gain } : { ...base, ImproveCost: row.improvement, DeductionUs54B: 0, STCGonImmvblPrprty: row.gain };
    const indexed = row.indexationChosen ? rupees(row.indexedCost) : row.cost;
    return {
      ...base,
      AquisitCostIndex: indexed,
      CostOfImprovements: { CostOfImprovementsDtls: [], TotalImprovecost: row.improvement, TotalindexImprovecost: row.improvement },
      ExemptionOrDednUs54: { ExemptionGrandTotal: 0 },
      ...(itr3 ? { PropertyValuation: row.sale, CapgainonAssets: row.gain, CapgainonAssets_1ea: 0, TaxSec1121aiiB: 0, TaxSec1121a: 0, ExcessAmtSec1121a: 0, BalanceForEiB: row.gain, TotalDednForEiB: row.cost + row.improvement + row.expenses } : { LTCGonImmvblPrprty: row.after ? row.gain : 0, LTCGonImmvblPrprtyBE: row.after ? 0 : row.gain }),
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

export function currYrLosses(cg) {
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


export function gainSchedules({ form, cg, skeleton, args, problems, notes = [], calc }) {
  const patch = {};
  const sections = capitalGainsPatch(cg, cg.rows, form);
  const columnsAfterYear = Object.fromEntries(Object.keys(COLUMNS).map((column) => [column, fromBuckets(cg.afterYearLosses, column)]));
  const specialFinal = cg.specialIncome;
  const columnsFinal = Object.fromEntries(Object.keys(COLUMNS).map((column) => [column, fromBuckets(specialFinal, column) + (column === 'STCGAppRate' ? cg.normalRateGain : 0)]));
  const bfSetoffByColumn = (column) => fromBuckets(cg.bfSetoff.short, column) + fromBuckets(cg.bfSetoff.long, column);
  const specialTotal = Object.values(specialFinal).reduce((a, b) => a + b, 0);
  const gainsAfterSetOff = Object.values(columnsAfterYear).reduce((a, b) => a + b, 0);

  patch.ScheduleCGFor23 = sections.patch;
  patch.ScheduleCGFor23.SumOfCGIncm = gainsAfterSetOff;
  patch.ScheduleCGFor23.TotScheduleCGFor23 = gainsAfterSetOff;
  patch.ScheduleCGFor23.CurrYrLosses = currYrLosses(cg);
  patch.ScheduleCGFor23.DeducClaimInfo = { TotDeductClaim: 0 };

  const itr3 = form === 'ITR-3';
  const sched112 = cg.rows.filter((row) => row.bucket.startsWith('ltcg112A'));
  if (sched112.length) {
    const lines = args.capitalGains?.transactions?.filter((txn) => txn.kind === 'listed-equity' || txn.kind === 'equity-mf') || [];
    const find = (row) => lines.find((txn) => (txn.name || txn.kind) === row.name && txn.buyDate === row.buyDate && txn.sellDate === row.sellDate) || {};
    const lowerKey = itr3 ? 'LTCGBeforelower6and11' : 'LTCGBeforelowerB1B2';
    const details = sched112.map((row) => {
      const source = find(row);
      const isin = String(source.isin || '').toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) problems.push({ path: 'capitalGains.transactions', message: `Schedule 112A needs the ISIN of ${row.name}.` });
      const item = skeleton.itemAt(['Schedule112A', 'Schedule112ADtls']);
      const before2018 = row.buyDate < '2018-02-01';
      const actualCost = rupees(source.cost) + row.improvement;
      const fmv = before2018 && source.fmv31Jan2018 != null ? rupees(source.fmv31Jan2018) : 0;
      const lower = before2018 && source.fmv31Jan2018 != null ? Math.min(row.sale, fmv) : 0;
      const costWithoutIndex = Math.max(actualCost, lower);
      const units = Number(source.units) > 0 ? Number(source.units) : 0;
      if (!units) notes.push(`${row.name}: the number of units was not given, so units and price per unit are left blank in Schedule 112A.`);
      return mergeInto(item, {
        ShareOnOrBefore: before2018 ? 'BE' : 'AE',
        ShareTransferredOnOrBefore: row.after ? 'AE' : 'BE',
        ISINCode: isin,
        ShareUnitName: String(row.name).slice(0, 125),
        ...(units ? { NumSharesUnits: units, SalePricePerShareUnit: row.sale / units, FairMktValuePerShareunit: fmv / units } : { FairMktValuePerShareunit: 0 }),
        TotSaleValue: row.sale,
        CostAcqWithoutIndx: costWithoutIndex,
        AcquisitionCost: actualCost,
        [lowerKey]: lower,
        TotFairMktValueCapAst: fmv,
        ExpExclCnctTransfer: row.expenses,
        TotalDeductions: costWithoutIndex + row.expenses,
        Balance: row.sale - costWithoutIndex - row.expenses,
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
      LTCGBeforelowerB1B2112A: total(lowerKey),
      FairMktValueCapAst112A: total('TotFairMktValueCapAst'),
      ExpExclCnctTransfer112A: total('ExpExclCnctTransfer'),
      Deductions112A: total('TotalDeductions'),
      Balance112A: gainBE + gainAE,
      Balance112ABE: gainBE,
      Balance112AAE: gainAE,
      TotalBalance112A: gainBE + gainAE,
    };
  }

  const cylaRows = {};
  for (const column of Object.keys(COLUMNS)) {
    const value = columnsAfterYear[column];
    cylaRows[column] = { IncCYLA: { IncOfCurYrUnderThatHead: value, IncOfCurYrAfterSetOff: value } };
  }
  const bflaRows = {};
  let bfTotal = 0;
  for (const column of Object.keys(COLUMNS)) {
    const from = columnsAfterYear[column];
    const used = Math.min(from, bfSetoffByColumn(column));
    bfTotal += used;
    bflaRows[column] = { IncBFLA: { IncOfCurYrUndHeadFromCYLA: from, BFlossPrevYrUndSameHeadSetoff: used, IncOfCurYrAfterSetOffBFLosses: from - used } };
  }

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

  const stRows = { ShortTerm15Per: columnsAfterYear.STCG15Per, ShortTerm20Per: columnsAfterYear.STCG20Per, ShortTerm30Per: 0, ShortTermAppRate: columnsAfterYear.STCGAppRate, ShortTermSplRateDTAA: 0 };
  stRows.TotalShortTerm = Object.values(stRows).reduce((a, b) => a + b, 0);
  const ltRows = { LongTerm10Per: columnsAfterYear.LTCG10Per, LongTerm12_5Per: columnsAfterYear.LTCG12_5Per, LongTerm20Per: columnsAfterYear.LTCG20Per, LongTermSplRateDTAA: 0 };
  ltRows.TotalLongTerm = Object.values(ltRows).reduce((a, b) => a + b, 0);
  const capGain = { ShortTerm: stRows, LongTerm: ltRows, ShortTermLongTermTotal: stRows.TotalShortTerm + ltRows.TotalLongTerm, CapGains30Per115BBH: 0, TotalCapGains: stRows.TotalShortTerm + ltRows.TotalLongTerm };

  const land = sections.extra;
  const finishBody = (body) => {
    const cgBody = body.ScheduleCGFor23;
    if (!land.shortLand.length) delete cgBody.ShortTermCapGainFor23.SaleofLandBuild;
    else cgBody.ShortTermCapGainFor23.SaleofLandBuild = { SaleofLandBuildDtls: land.shortLand };
    if (!land.longLand.length) delete cgBody.LongTermCapGain23.SaleofLandBuild;
    else cgBody.LongTermCapGain23.SaleofLandBuild = { SaleofLandBuildDtls: land.longLand, TotalLTCGImmblPrprty: land.longPropertyBE + land.longPropertyAE, TotalLTCGImmblPrprtyBE: land.longPropertyBE, TotalLTCGImmblPrprtyAE: land.longPropertyAE, TotalExcessTax: 0 };
  };
  return { patch, capGain, columnsAfterYear, columnsFinal, specialTotal, specialFinal, cylaRows, bflaRows, bfTotal, gainsAfterSetOff, finishBody };
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

export function houseSchedule({ rows, skeleton, taxpayer, total }) {
  const items = rows.filter((row) => row.h.type).map((row, position) => {
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
      AsseseeShareProperty: row.share < 100 ? row.share : 100,
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
  if (!items.length) return null;
  for (const item of items) if (item.ifLetOut !== 'L') delete item.TenantDetails;
  return { PropertyDetails: items, PassThroghIncome: 0, TotalIncomeChargeableUnHP: total };
}
