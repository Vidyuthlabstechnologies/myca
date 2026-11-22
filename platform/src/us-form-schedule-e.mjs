export const RENTAL_ENTRY_KIND = 'Rental property';
export const PROPERTY_TYPES = Object.freeze({ 1: 'Single family residence', 2: 'Multi-family residence', 3: 'Vacation/short-term rental', 4: 'Commercial', 5: 'Land', 6: 'Royalties', 7: 'Self-rental', 8: 'Other' });
export const EXPENSE_LINES = Object.freeze([['advertising', '5'], ['autoTravel', '6'], ['cleaningMaintenance', '7'], ['commissions', '8'], ['insurance', '9'], ['legalProfessional', '10'], ['managementFees', '11'], ['mortgageInterest', '12'], ['otherInterest', '13'], ['repairs', '14'], ['supplies', '15'], ['taxes', '16'], ['utilities', '17'], ['depreciation', '18'], ['otherExpenses', '19']]);
const DEFAULT_CLASS = Object.freeze({ 1: 'residential', 2: 'residential', 3: 'residential', 4: 'nonresidential', 7: 'nonresidential' });
const ROYALTY = 6;
const RECHARACTERIZED = new Set([5, 7]);
const NOT_DEPRECIABLE = new Set([5, 6]);
const DIRECT_RENTAL = new Set(['advertising', 'commissions', 'managementFees']);
const INTEREST_AND_TAXES = new Set(['mortgageInterest', 'taxes']);

const dollars = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};
const positive = (value) => Math.max(0, dollars(value));
const fromCents = (cents) => Math.round(Number(cents || 0) / 100);
const provided = (value) => value !== undefined && value !== null && value !== '';
const sameName = (left, right) => {
  const a = String(left || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return a !== '' && a === String(right || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
};
const yes = (value) => value === true || /^(yes|y|true|1)$/i.test(String(value ?? '').trim());
const answered = (value) => typeof value === 'boolean' || /^(yes|y|true|1|no|n|false|0)$/i.test(String(value ?? '').trim());
const total = (items, pick) => items.reduce((sum, item) => sum + pick(item), 0);

function allocate(amounts, amount) {
  const whole = total(amounts, (value) => value);
  if (whole <= 0 || amount <= 0) return amounts.map(() => 0);
  let given = 0;
  return amounts.map((value, index) => {
    if (index === amounts.length - 1) return amount - given;
    const share = Math.round((amount * value) / whole);
    given += share;
    return share;
  });
}

export function macrsRealPropertyDepreciation({ costBasis, landValue = 0, placedInService, recoveryClass, taxYear, table }) {
  const schedule = table?.[recoveryClass];
  if (!schedule) return { ok: false, error: 'RECOVERY_CLASS_UNKNOWN' };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(placedInService || ''));
  if (!match) return { ok: false, error: 'PLACED_IN_SERVICE_REQUIRED' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return { ok: false, error: 'PLACED_IN_SERVICE_REQUIRED' };
  if (year > Number(taxYear)) return { ok: false, error: 'PLACED_IN_SERVICE_AFTER_YEAR' };
  if (String(placedInService) < schedule.placedInServiceFrom) return { ok: false, error: 'PLACED_IN_SERVICE_BEFORE_MACRS' };
  const basis = positive(costBasis);
  const land = positive(landValue);
  if (land > basis) return { ok: false, error: 'LAND_ABOVE_COST' };
  const depreciableBasis = basis - land;
  const recoveryYear = Number(taxYear) - year + 1;
  const row = schedule.rows.find((item) => recoveryYear >= item.fromYear && recoveryYear <= item.toYear);
  const rate = row ? row.rates[month - 1] : 0;
  const amount = Math.round((depreciableBasis * rate) / table.ratesPer);
  const placedThisYear = recoveryYear === 1;
  return { ok: true, method: schedule.method, convention: schedule.convention, recoveryPeriod: schedule.recoveryPeriod, table: schedule.table, recoveryClass, placedInService: String(placedInService), month, recoveryYear, costBasis: basis, landValue: land, depreciableBasis, ratePercent: rate / 1000, amount, fullyDepreciated: !row, form4562Line: placedThisYear ? schedule.form4562Line : '17' };
}

function depreciationFor(property, type, fields, taxYear, table, checks) {
  if (provided(fields.depreciation)) return { amount: positive(fields.depreciation), detail: { source: 'entered', amount: positive(fields.depreciation) } };
  if (!(positive(fields.costBasis) > 0)) return { amount: 0, detail: null };
  if (NOT_DEPRECIABLE.has(type)) {
    checks.push(['warning', 'RENTAL_NOT_DEPRECIABLE', `${property}: land and royalty interests are not depreciated, so the cost entered gives no depreciation (depletion, if any, is entered as the depreciation amount).`, 'Enter any depletion in the depreciation box.']);
    return { amount: 0, detail: null };
  }
  const recoveryClass = ['residential', 'nonresidential'].includes(fields.recoveryClass) ? fields.recoveryClass : DEFAULT_CLASS[type];
  if (!recoveryClass) {
    checks.push(['error', 'RENTAL_RECOVERY_CLASS_REQUIRED', `${property}: say whether the building is residential rental (27.5 years) or nonresidential (39 years) so depreciation can be figured.`, 'Choose the recovery class on the rental property.']);
    return { amount: 0, detail: null };
  }
  const figured = macrsRealPropertyDepreciation({ costBasis: fields.costBasis, landValue: fields.landValue, placedInService: fields.placedInService, recoveryClass, taxYear, table });
  if (!figured.ok) {
    const words = { PLACED_IN_SERVICE_REQUIRED: 'needs the date it was placed in service (YYYY-MM-DD) to figure depreciation', PLACED_IN_SERVICE_AFTER_YEAR: 'was placed in service after this tax year, so it has no depreciation for the year', PLACED_IN_SERVICE_BEFORE_MACRS: 'was placed in service before the MACRS tables that MyCA uses apply; enter the depreciation amount yourself', LAND_ABOVE_COST: 'has a land value above its cost', RECOVERY_CLASS_UNKNOWN: 'has no recovery class' };
    checks.push(['error', 'RENTAL_DEPRECIATION_INVALID', `${property} ${words[figured.error]}.`, 'Correct the depreciation details on the rental property.']);
    return { amount: 0, detail: null };
  }
  return { amount: figured.amount, detail: { source: 'computed', ...figured } };
}

function entriesWithForms(entries, miscForms, checks) {
  const matched = new Map(entries.map((entry) => [entry.id, { rents: 0, royalties: 0, payers: [] }]));
  const created = [];
  const typeOf = (entry) => Number(entry.fields?.propertyType);
  for (const form of miscForms) {
    const owner = form.owner === 'spouse' ? 'spouse' : 'taxpayer';
    for (const [box, wantsRoyalty] of [['rents', false], ['royalties', true]]) {
      const amount = positive(form.fields?.[box]);
      if (!amount) continue;
      const entry = entries.find((item) => (item.owner === 'spouse' ? 'spouse' : 'taxpayer') === owner && (typeOf(item) === ROYALTY) === wantsRoyalty && (sameName(item.fields?.rentPayer, form.payer) || sameName(item.payer, form.payer)));
      if (entry) {
        const slot = matched.get(entry.id);
        slot[box] += amount;
        slot.payers.push(form.payer || '');
        continue;
      }
      created.push({ id: `${form.id || 'misc'}-${box}`, owner, payer: `${form.payer || 'Payer'} (1099-MISC)`, source: '1099-MISC', fields: { propertyType: wantsRoyalty ? ROYALTY : 8, [box]: amount } });
      if (!wantsRoyalty) checks.push(['warning', 'RENTAL_FROM_1099_ONLY', `Rents of ${amount} on the 1099-MISC from ${form.payer || 'a payer'} are on Schedule E as a property of type 8 (other) with no expenses.`, 'Add the rental property with its address, type and expenses, and name this payer on it.']);
    }
  }
  return { matched, created };
}

function buildProperty(entry, slot, ctx) {
  const { taxYear, personalUse, table, checks, needs } = ctx;
  const fields = entry.fields || {};
  const name = String(entry.payer || 'Rental property');
  const local = [];
  let type = Number(fields.propertyType);
  if (!PROPERTY_TYPES[type]) {
    local.push(['error', 'RENTAL_TYPE_INVALID', `${name}: the type of property must be a code from 1 to 8.`, 'Choose the type on the rental property.']);
    type = 8;
  }
  const enteredRents = positive(fields.rents);
  const enteredRoyalties = positive(fields.royalties);
  if (slot && slot.rents > enteredRents && enteredRents > 0) local.push(['warning', 'RENTS_BELOW_1099', `${name}: rents entered (${enteredRents}) are less than the 1099-MISC rents (${slot.rents}); the 1099-MISC amount is used.`, 'Enter the total rents received, including those on the 1099-MISC.']);
  if (slot && slot.royalties > enteredRoyalties && enteredRoyalties > 0) local.push(['warning', 'ROYALTIES_BELOW_1099', `${name}: royalties entered (${enteredRoyalties}) are less than the 1099-MISC royalties (${slot.royalties}); the 1099-MISC amount is used.`, 'Enter the total royalties received.']);
  const line3 = Math.max(enteredRents, slot?.rents || 0);
  const line4 = Math.max(enteredRoyalties, slot?.royalties || 0);
  const fairRentalDays = Math.max(0, Math.trunc(Number(fields.fairRentalDays) || 0));
  const personalUseDays = type === ROYALTY ? 0 : Math.max(0, Math.trunc(Number(fields.personalUseDays) || 0));
  let rentalShare = null;
  let usedAsHome = false;
  if (personalUseDays > 0) {
    if (fairRentalDays <= 0) local.push(['error', 'RENTAL_DAYS_REQUIRED', `${name}: personal use days are given, so the fair rental days are needed to split the expenses.`, 'Enter the fair rental days on the rental property.']);
    else {
      usedAsHome = personalUseDays > Math.max(personalUse.personalUseDays, (fairRentalDays * personalUse.personalUseBasisPoints) / 10000);
      if (usedAsHome && fairRentalDays < personalUse.minimalRentalDays) {
        checks.push(...local, ['warning', 'RENTAL_UNDER_15_DAYS', `${name}: used as a home and rented fewer than ${personalUse.minimalRentalDays} days, so the rent is not reported and no rental expenses are deducted (section 280A(g)).`, 'If you itemize, the mortgage interest and taxes go on Schedule A.']);
        return null;
      }
      rentalShare = { fairRentalDays, totalDays: fairRentalDays + personalUseDays };
    }
  }
  const share = (amount) => (rentalShare ? Math.round((amount * rentalShare.fairRentalDays) / rentalShare.totalDays) : amount);
  const depreciation = depreciationFor(name, type, fields, taxYear, table, local);
  const lines = { 3: line3, 4: line4 };
  let personalInterestAndTaxes = 0;
  const rentalPortions = [];
  for (const [key, line] of EXPENSE_LINES) {
    const full = key === 'depreciation' ? depreciation.amount : positive(fields[key]);
    const rental = usedAsHome && DIRECT_RENTAL.has(key) ? full : share(full);
    if (full) lines[line] = rental;
    if (full) rentalPortions.push({ key, line, rental });
    if (INTEREST_AND_TAXES.has(key)) personalInterestAndTaxes += full - rental;
  }
  const vacationHome = usedAsHome ? dwellingUnitLimit({ name, rents: line3, portions: rentalPortions, priorOperating: positive(fields.priorOperatingCarryover), priorDepreciation: positive(fields.priorDepreciationCarryover), itemizing: Boolean(ctx.itemizing), rentalShare: rentalShare.fairRentalDays / rentalShare.totalDays }) : null;
  if (vacationHome) {
    for (const [, line] of EXPENSE_LINES) delete lines[line];
    Object.assign(lines, vacationHome.scheduleLines);
    if (vacationHome.carryover.operating + vacationHome.carryover.depreciation > 0) local.push(['warning', 'VACATION_HOME_LIMIT', `${name}: used as a home (${personalUseDays} personal days, more than the greater of ${personalUse.personalUseDays} days or ${personalUse.personalUseBasisPoints / 100}% of the ${fairRentalDays} rental days), so the rental expenses cannot make a loss (IRC 280A(c)(5), Pub. 527 Worksheet 5-1). ${vacationHome.carryover.operating} of operating expenses and ${vacationHome.carryover.depreciation} of depreciation are not allowed this year and carry over to next year for this property.`, 'Keep the amounts; enter them as the operating expense and depreciation carryovers on next year\'s rental property.']);
  } else if (!usedAsHome && (positive(fields.priorOperatingCarryover) > 0 || positive(fields.priorDepreciationCarryover) > 0)) local.push(['warning', 'VACATION_HOME_CARRYOVER_UNUSED', `${name}: a Worksheet 5-1 carryover was entered, but the property was not used as a home this year, so MyCA does not deduct it; Pub. 527 says the carryover is still limited to the rental income.`, 'Have your CPA apply the carryover.']);
  if (personalInterestAndTaxes > 0) local.push(['warning', 'RENTAL_PERSONAL_SHARE', `${name}: ${personalInterestAndTaxes} of the mortgage interest and taxes is for personal use and is not on Schedule E.`, 'If you itemize, add it to the Schedule A mortgage interest and property tax.']);
  lines[20] = total(EXPENSE_LINES, ([, line]) => lines[line] || 0);
  lines[21] = line3 + line4 - lines[20];
  if (yes(fields.shortStays)) needs.push({ form: 'Short-term rental', code: 'SHORT_TERM_RENTAL_NOT_COVERED', message: `${name}: with an average stay of 7 days or less the activity is not a rental activity under the passive rules (Treas. Reg. 1.469-1T(e)(3)), which MyCA does not handle.`, fix: 'Have your CPA prepare this activity.' });
  if (yes(fields.notAtRisk)) needs.push({ form: '6198', code: 'FORM_6198_NOT_COVERED', message: `${name}: part of the investment is not at risk, so the loss may be limited on Form 6198, which MyCA does not prepare.`, fix: 'Have your CPA prepare Form 6198.' });
  if (yes(fields.soldInYear)) needs.push({ form: '4797', code: 'FORM_4797_NOT_COVERED', message: `${name}: the sale of a rental property goes on Form 4797 (with depreciation recapture and the release of any suspended passive loss), which MyCA does not prepare.`, fix: 'Have your CPA prepare Form 4797.' });
  checks.push(...local);
  const royalty = type === ROYALTY;
  const recharacterized = RECHARACTERIZED.has(type) && lines[21] > 0;
  const prior = royalty || usedAsHome ? 0 : positive(fields.priorYearUnallowedLoss);
  if (royalty && positive(fields.priorYearUnallowedLoss) > 0) checks.push(['warning', 'ROYALTY_NOT_PASSIVE', `${name}: royalties are not a passive activity, so a passive loss carryover is not used here.`, '']);
  if (usedAsHome && positive(fields.priorYearUnallowedLoss) > 0) checks.push(['warning', 'VACATION_HOME_NOT_PASSIVE', `${name}: a dwelling unit used as a home is not a passive activity this year (IRC 469(j)(10)), so the Form 8582 carryover is not used here.`, 'Have your CPA confirm how the earlier passive loss is used.']);
  const passiveCurrent = royalty || recharacterized || usedAsHome ? 0 : lines[21];
  const activeKnown = usedAsHome || answered(fields.activeParticipation);
  const active = activeKnown && yes(fields.activeParticipation);
  if (!royalty && !activeKnown && (passiveCurrent < 0 || prior > 0)) checks.push(['warning', 'ACTIVE_PARTICIPATION_UNANSWERED', `${name}: active participation was not answered, so the $25,000 special allowance is not applied to this loss.`, 'Answer whether you actively participated (own 10% or more and make the management decisions).']);
  return {
    id: entry.id,
    name,
    owner: entry.owner === 'spouse' ? 'spouse' : 'taxpayer',
    source: entry.source || 'entry',
    propertyType: type,
    propertyTypeLabel: PROPERTY_TYPES[type],
    description: String(fields.otherDescription || ''),
    fairRentalDays,
    personalUseDays,
    qjv: yes(fields.qjv),
    rentalShare: rentalShare ? Math.round((rentalShare.fairRentalDays / rentalShare.totalDays) * 10000) / 10000 : 1,
    usedAsHome,
    ...(vacationHome ? { vacationHome: { worksheet: vacationHome.worksheet, carryover: vacationHome.carryover, itemizing: vacationHome.itemizing, limited: vacationHome.limited } } : {}),
    form1099Payers: slot?.payers || [],
    royalty,
    recharacterized,
    activeParticipation: active,
    priorYearUnallowedLoss: prior,
    passiveCurrent,
    depreciation: depreciation.detail ? { ...depreciation.detail, rentalAmount: lines[18] || 0 } : null,
    lines,
  };
}

function passiveLimit(properties, { status, livedWithSpouse, magi, allowance }) {
  const rows = properties.filter((item) => !item.royalty && (item.passiveCurrent !== 0 || item.priorYearUnallowedLoss > 0)).map((item) => {
    const a = Math.max(0, item.passiveCurrent);
    const b = Math.min(0, item.passiveCurrent);
    const c = 0 - item.priorYearUnallowedLoss;
    return { id: item.id, name: item.name, part: item.activeParticipation ? 'IV' : 'V', a, b, c, overall: a + b + c };
  });
  const part = (name) => rows.filter((row) => row.part === name);
  const sums = (list) => ({ a: total(list, (row) => row.a), b: total(list, (row) => row.b), c: total(list, (row) => row.c) });
  const iv = sums(part('IV'));
  const v = sums(part('V'));
  const line1d = iv.a + iv.b + iv.c;
  const line2d = v.a + v.b + v.c;
  const line3 = line1d + line2d;
  const allowedLoss = new Map(rows.map((row) => [row.id, 0 - (row.b + row.c)]));
  const unallowed = new Map(rows.map((row) => [row.id, 0]));
  const hasLoss = rows.some((row) => row.b < 0 || row.c < 0);
  const mfsTogether = status === 'mfs' && livedWithSpouse !== false;
  const mfsApart = status === 'mfs' && livedWithSpouse === false;
  const maxAllowance = fromCents(mfsApart ? allowance.mfsLivedApartMaxCents : allowance.maxCents);
  const phaseOutEnd = fromCents(mfsApart ? allowance.mfsLivedApartPhaseOutEndCents : allowance.phaseOutEndCents);
  const phaseOutStart = phaseOutEnd - Math.round((maxAllowance * 10000) / allowance.phaseOutBasisPoints);
  const modified = Math.max(0, magi);
  const exception = hasLoss && !mfsTogether && rows.every((row) => row.part === 'IV' && row.c === 0) && -line3 <= maxAllowance && modified <= phaseOutStart;
  if (!hasLoss) return { required: false, allowedLoss, unallowed, form: null, line3, magi: modified };
  const lines = { '1a': iv.a, '1b': iv.b, '1c': iv.c, '1d': line1d, '2a': v.a, '2b': v.b, '2c': v.c, '2d': line2d, 3: line3 };
  const columns = (row) => ({ name: row.name, a: row.a, b: row.b, c: row.c, ...(row.overall >= 0 ? { d: row.overall } : { e: row.overall }) });
  const form = { lines, partIV: part('IV').map(columns), partV: part('V').map(columns), magi: modified, mfsLivedWithSpouse: mfsTogether, specialAllowanceExceptionMet: exception };
  if (line3 >= 0) return { required: !exception, allowedLoss, unallowed, form, line3, magi: modified };
  let line9 = 0;
  if (line1d < 0 && !mfsTogether) {
    const line4 = Math.min(-line1d, -line3);
    const line5 = phaseOutEnd;
    const line6 = modified;
    const line7 = line6 >= line5 ? 0 : line5 - line6;
    const line8 = line6 >= line5 ? 0 : Math.min(Math.round((line7 * allowance.phaseOutBasisPoints) / 10000), maxAllowance);
    line9 = Math.min(line4, line8);
    Object.assign(lines, { 4: line4, 5: line5, 6: line6, ...(line6 >= line5 ? {} : { 7: line7 }), 8: line8, 9: line9 });
  }
  lines[10] = iv.a + v.a;
  lines[11] = line9 + lines[10];
  const lossRowsIV = part('IV').filter((row) => row.overall < 0);
  const special = new Map();
  if (line9 > 0) {
    const shares = allocate(lossRowsIV.map((row) => -row.overall), line9);
    lossRowsIV.forEach((row, index) => special.set(row.id, shares[index]));
    form.partVI = lossRowsIV.map((row, index) => ({ name: row.name, a: -row.overall, b: Math.round((-row.overall / total(lossRowsIV, (item) => -item.overall)) * 10000) / 10000, c: shares[index], d: -row.overall - shares[index] }));
  }
  const seven = [...lossRowsIV.map((row) => ({ row, loss: -row.overall - (special.get(row.id) || 0) })), ...part('V').filter((row) => row.overall < 0).map((row) => ({ row, loss: -row.overall }))].filter((item) => item.loss > 0);
  const toAllocate = -line3 - line9;
  const shares = allocate(seven.map((item) => item.loss), toAllocate);
  const sevenTotal = total(seven, (item) => item.loss);
  form.partVII = seven.map((item, index) => ({ name: item.row.name, a: item.loss, b: Math.round((item.loss / sevenTotal) * 10000) / 10000, c: shares[index] }));
  form.partVIII = seven.map((item, index) => {
    const loss = -(item.row.b + item.row.c);
    unallowed.set(item.row.id, shares[index]);
    allowedLoss.set(item.row.id, loss - shares[index]);
    return { name: item.row.name, a: loss, b: shares[index], c: loss - shares[index] };
  });
  return { required: !exception, allowedLoss, unallowed, form, line3, magi: modified };
}

function dwellingUnitLimit({ rents, portions, priorOperating, priorDepreciation, itemizing, rentalShare }) {
  const tierOf = (key) => (DIRECT_RENTAL.has(key) || (itemizing && INTEREST_AND_TAXES.has(key)) ? 1 : key === 'depreciation' ? 3 : 2);
  const items = [...portions.map((item) => ({ ...item, tier: tierOf(item.key) })), ...(priorOperating ? [{ key: 'priorOperatingCarryover', line: '19', rental: priorOperating, tier: 2 }] : []), ...(priorDepreciation ? [{ key: 'priorDepreciationCarryover', line: '18', rental: priorDepreciation, tier: 3 }] : [])];
  const of = (pick) => total(items.filter(pick), (item) => item.rental);
  const line1 = rents;
  const line2a = itemizing ? of((item) => item.key === 'mortgageInterest') : 0;
  const line2b = itemizing ? of((item) => item.key === 'taxes') : 0;
  const line2d = of((item) => DIRECT_RENTAL.has(item.key));
  const line2e = line2a + line2b + line2d;
  const line3 = Math.max(0, line1 - line2e);
  const line4a = of((item) => item.tier === 2 && !INTEREST_AND_TAXES.has(item.key) && item.key !== 'priorOperatingCarryover');
  const line4b = itemizing ? 0 : of((item) => item.key === 'mortgageInterest');
  const line4c = itemizing ? 0 : of((item) => item.key === 'taxes');
  const line4d = priorOperating;
  const line4e = line4a + line4b + line4c + line4d;
  const line4f = Math.min(line3, line4e);
  const line5 = Math.max(0, line3 - line4f);
  const line6b = of((item) => item.key === 'depreciation');
  const line6c = priorDepreciation;
  const line6d = line6b + line6c;
  const line6e = Math.min(line5, line6d);
  const allowedOf = { 1: line2e, 2: line4f, 3: line6e };
  const scheduleLines = {};
  for (const tier of [1, 2, 3]) {
    const tierItems = items.filter((item) => item.tier === tier);
    const shares = tier === 1 ? tierItems.map((item) => item.rental) : allocate(tierItems.map((item) => item.rental), allowedOf[tier]);
    tierItems.forEach((item, index) => {
      if (shares[index] > 0 || tier === 1) scheduleLines[item.line] = (scheduleLines[item.line] || 0) + shares[index];
    });
  }
  const worksheet = { F: Math.round(rentalShare * 10000) / 10000, 1: line1, '2a': line2a, '2b': line2b, '2c': 0, '2d': line2d, '2e': line2e, 3: line3, '4a': line4a, '4b': line4b, '4c': line4c, '4d': line4d, '4e': line4e, '4f': line4f, 5: line5, '6a': 0, '6b': line6b, '6c': line6c, '6d': line6d, '6e': line6e, '7a': line4e - line4f, '7b': line6d - line6e };
  return { worksheet, scheduleLines, itemizing, limited: line4e > line4f || line6d > line6e, carryover: { operating: line4e - line4f, depreciation: line6d - line6e } };
}

export function computeScheduleE({ taxYear, status, livedWithSpouse, itemizing = false, entries = [], miscForms = [], magiBeforeScheduleE = 0, qbiSafeHarbor = false, rules: ruleValues }) {
  const rawChecks = [];
  const needs = [];
  const { matched, created } = entriesWithForms(entries, miscForms, rawChecks);
  const ctx = { taxYear, personalUse: ruleValues.personalUse, table: ruleValues.macrs, checks: rawChecks, needs, itemizing };
  const properties = [...entries.map((entry) => buildProperty(entry, matched.get(entry.id), ctx)), ...created.map((entry) => buildProperty(entry, null, ctx))].filter(Boolean);
  const checks = rawChecks.map(([level, code, message, fix]) => ({ level, code, message, fix }));
  if (!properties.length) return { has: false, properties: [], checks, needs, line26: 0, qbiRental: 0, magi: magiBeforeScheduleE };
  const nonpassive = total(properties, (item) => (item.royalty || item.recharacterized || item.usedAsHome ? item.lines[21] : 0));
  const passiveNet = total(properties, (item) => (item.royalty ? 0 : item.passiveCurrent - item.priorYearUnallowedLoss));
  const magi = magiBeforeScheduleE + nonpassive + Math.max(0, passiveNet);
  const limit = passiveLimit(properties, { status, livedWithSpouse, magi, allowance: ruleValues.allowance });
  if (status === 'mfs' && livedWithSpouse === undefined && limit.form && limit.line3 < 0 && limit.form.lines['1d'] < 0) checks.push({ level: 'warning', code: 'MFS_LIVED_APART_UNANSWERED', message: `On a separate return the rental loss gets the special allowance of up to ${fromCents(ruleValues.allowance.mfsLivedApartMaxCents)} (Form 8582) only if you lived apart from your spouse for the whole year; that was not answered, so no allowance is given and the loss is carried forward.`, fix: 'Answer whether you lived with your spouse at any time during the year.' });
  for (const item of properties) {
    if (item.royalty || !(item.passiveCurrent < 0 || item.priorYearUnallowedLoss > 0)) continue;
    item.lines[22] = 0 - (limit.allowedLoss.get(item.id) || 0);
    item.unallowedLossCarryforward = limit.unallowed.get(item.id) || 0;
  }
  const sumLine = (line) => total(properties, (item) => item.lines[line] || 0);
  const line24 = total(properties, (item) => Math.max(0, item.lines[21]));
  const line25 = total(properties, (item) => (item.royalty || item.usedAsHome ? Math.min(0, item.lines[21]) : item.lines[22] || 0));
  const line26 = line24 + line25;
  const lines = { '23a': sumLine(3), '23b': sumLine(4), '23c': sumLine(12), '23d': sumLine(18), '23e': sumLine(20), 24: line24, 25: line25, 26: line26, 41: line26 };
  const carryforward = properties.filter((item) => item.unallowedLossCarryforward > 0).map((item) => ({ id: item.id, name: item.name, unallowedLoss: item.unallowedLossCarryforward }));
  const qbiRental = qbiSafeHarbor ? total(properties, (item) => (item.royalty ? 0 : Math.max(0, item.lines[21]) + (item.lines[22] || 0))) : 0;
  const form4562 = properties.filter((item) => item.depreciation?.source === 'computed').map((item) => ({ property: item.name, required: item.depreciation.recoveryYear === 1, lines: { [item.depreciation.form4562Line]: item.depreciation.rentalAmount, 22: item.depreciation.rentalAmount }, detail: item.depreciation }));
  if (carryforward.length) checks.push({ level: 'warning', code: 'PASSIVE_LOSS_CARRYFORWARD', message: `Passive rental losses of ${total(carryforward, (item) => item.unallowedLoss)} are not allowed this year (Form 8582) and carry forward to next year.`, fix: 'Keep the amounts; enter each as the prior-year unallowed loss on next year\'s rental property.' });
  return { has: true, properties, lines, line26, nonpassive, passiveNet, magi, form8582: limit.required ? limit.form : null, carryforward, qbiRental, form4562, checks, needs };
}
