export const CLEAN_ENERGY_CATEGORIES = Object.freeze(['solar-electric', 'solar-water', 'small-wind', 'geothermal', 'battery', 'fuel-cell']);
export const HOME_IMPROVEMENT_CATEGORIES = Object.freeze(['insulation', 'door', 'window', 'central-ac', 'water-heater', 'furnace', 'panelboard', 'audit', 'heat-pump', 'heat-pump-water-heater', 'biomass']);
export const ENERGY_CATEGORIES = Object.freeze([...CLEAN_ENERGY_CATEGORIES, ...HOME_IMPROVEMENT_CATEGORIES]);
const QMID_CATEGORIES = new Set(['door', 'window', 'central-ac', 'water-heater', 'furnace', 'panelboard', 'heat-pump', 'heat-pump-water-heater', 'biomass']);
const ENABLED_CODES = Object.freeze({ window: 'A', 'central-ac': 'B', 'water-heater': 'C', furnace: 'D', 'heat-pump': 'E', 'heat-pump-water-heater': 'F', biomass: 'G' });
const SECTION_A = new Set(['insulation', 'door', 'window']);
const LABELS = Object.freeze({ 'solar-electric': 'solar electric property', 'solar-water': 'solar water heating property', 'small-wind': 'small wind energy property', geothermal: 'geothermal heat pump property', battery: 'battery storage technology', 'fuel-cell': 'fuel cell property', insulation: 'insulation or air sealing', door: 'exterior door', window: 'window or skylight', 'central-ac': 'central air conditioner', 'water-heater': 'gas, propane or oil water heater', furnace: 'gas, propane or oil furnace or hot water boiler', panelboard: 'panelboard, subpanelboard, branch circuit or feeder', audit: 'home energy audit', 'heat-pump': 'heat pump', 'heat-pump-water-heater': 'heat pump water heater', biomass: 'biomass stove or boiler' });

export const isQmid = (value) => /^[A-Za-z0-9]{4}$/.test(String(value || '').trim());

const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};
const ofBasis = (amount, basisPoints) => Math.round((amount * basisPoints) / 10000);
const total = (rows) => rows.reduce((sum, row) => sum + row.cost, 0);
const byCostDown = (rows) => [...rows].sort((a, b) => b.cost - a.cost);
const check = (level, code, message, fix = '') => ({ level, code, message, fix });
const named = (item) => `${item.payer ? `${item.payer}: ` : ''}${LABELS[item.category] || item.category}`;

export function energyItemsFor(items, taxYear, checks) {
  const kept = [];
  for (const raw of items) {
    const item = { payer: String(raw.payer || ''), category: String(raw.category || ''), cost: whole(raw.cost), qmid: String(raw.qmid || '').trim().toUpperCase(), capacity: Number(raw.capacity || 0), placedInService: String(raw.placedInService || '') };
    if (!ENERGY_CATEGORIES.includes(item.category) || item.cost <= 0) continue;
    const serviceYear = /^\d{4}-\d{2}-\d{2}$/.test(item.placedInService) ? item.placedInService.slice(0, 4) : '';
    if (serviceYear && serviceYear !== String(taxYear)) {
      checks.push(check('warning', 'ENERGY_ITEM_OTHER_YEAR', `${named(item)} was installed on ${item.placedInService}, so it is not a ${taxYear} expense${serviceYear > '2025' ? ' and no credit is allowed for it: the residential energy credits ended for property installed after 2025-12-31' : `; claim it on the ${serviceYear} return`}.`, 'Check the installation date, or remove the item.'));
      continue;
    }
    kept.push(item);
  }
  return kept;
}

export function homeImprovementCredit({ items, mainHome, originalUser, newConstruction, taxLimit, rule }) {
  const checks = [];
  const rows = items.filter((item) => HOME_IMPROVEMENT_CATEGORIES.includes(item.category));
  if (!rows.length) return null;
  if (!rule.allowed) {
    checks.push(check('warning', 'ENERGY_HOME_IMPROVEMENT_ENDED', 'The energy efficient home improvement credit ended for property placed in service after 2025-12-31 (Public Law 119-21), so no credit is included for these items.', 'Remove the items, or add them to the 2025 return if they were installed in 2025.'));
    return { credit: 0, lines: { allowed: false }, checks };
  }
  const usable = [];
  for (const item of rows) {
    if (rule.qmidRequired && QMID_CATEGORIES.has(item.category) && !isQmid(item.qmid)) checks.push(check('warning', 'ENERGY_QMID_MISSING', `${named(item)} has no qualified manufacturer identification number (QMID). From 2025 each item needs the manufacturer's four-character QMID, so it is left out of the credit.`, 'Add the QMID from the manufacturer\'s certification or the invoice.'));
    else usable.push(item);
  }
  const sectionAAllowed = mainHome !== false && originalUser !== false && newConstruction !== true;
  const sectionBAllowed = originalUser !== false;
  const auditAllowed = mainHome !== false;
  if (!sectionAAllowed && usable.some((item) => SECTION_A.has(item.category))) checks.push(check('warning', 'ENERGY_SECTION_A_NOT_ALLOWED', newConstruction === true && mainHome !== false && originalUser !== false ? 'Insulation, doors and windows that are part of building a new home do not qualify (Form 5695 line 17e).' : 'Insulation, doors and windows qualify only on your main home in the United States, as the original user, expected to last at least 5 years (Form 5695 lines 17a to 17c).', ''));
  if (!sectionBAllowed && usable.some((item) => !SECTION_A.has(item.category) && item.category !== 'audit')) checks.push(check('warning', 'ENERGY_SECTION_B_NOT_ALLOWED', 'Energy property qualifies only if you originally placed it in service (Form 5695 line 21b).', ''));
  if (!auditAllowed && usable.some((item) => item.category === 'audit')) checks.push(check('warning', 'ENERGY_AUDIT_NOT_ALLOWED', 'A home energy audit qualifies only for your main home in the United States (Form 5695 line 26a).', ''));
  const of = (category) => usable.filter((item) => item.category === category && (SECTION_A.has(category) ? sectionAAllowed : category === 'audit' ? auditAllowed : sectionBAllowed));
  const rate = rule.creditBasisPoints;
  const cap = (amount, capCents) => Math.min(amount, capCents / 100);
  const annual = rule.annualCapCents / 100;
  const insulation = total(of('insulation'));
  const line18b = cap(ofBasis(insulation, rate), rule.annualCapCents);
  const doors = byCostDown(of('door'));
  const line19a = doors[0]?.cost || 0;
  const line19c = cap(ofBasis(line19a, rate), rule.doorEachCapCents);
  const line19d = total(doors.slice(1, 3));
  const line19e = total(doors.slice(3));
  const line19f = line19d + line19e;
  const line19g = ofBasis(line19f, rate);
  const line19h = cap(line19c + line19g, rule.doorsCapCents);
  const windows = byCostDown(of('window'));
  const line20a = total(windows.slice(0, 4));
  const line20b = total(windows.slice(4));
  const line20c = line20a + line20b;
  const line20d = cap(ofBasis(line20c, rate), rule.windowsCapCents);
  const property = (category, top) => {
    const sorted = byCostDown(of(category));
    const first = total(sorted.slice(0, top));
    const rest = total(sorted.slice(top));
    return { a: first, b: rest, c: first + rest, d: cap(ofBasis(first + rest, rate), rule.propertyItemCapCents), items: sorted };
  };
  const ac = property('central-ac', 1);
  const heater = property('water-heater', 2);
  const furnace = property('furnace', 1);
  const enabled = [...new Set(usable.filter((item) => ENABLED_CODES[item.category] && sectionBAllowed && (item.category !== 'window' || sectionAAllowed)).map((item) => ENABLED_CODES[item.category]))].sort();
  const panels = of('panelboard');
  if (panels.length && !enabled.length) checks.push(check('warning', 'ENERGY_PANELBOARD_WITHOUT_ENABLED', 'A panelboard, subpanelboard, branch circuit or feeder qualifies only when installed with a qualifying window, air conditioner, water heater, furnace, boiler, heat pump or biomass stove in 2025 (Form 5695 line 25a), so it is left out.', 'Add the item it enabled, or ask your CPA about the safe harbor for property installed in 2024.'));
  const line25c = enabled.length ? total(panels) : 0;
  const line25e = cap(ofBasis(line25c, rate), rule.propertyItemCapCents);
  const line26b = total(of('audit'));
  const line26c = cap(ofBasis(line26b, rate), rule.auditCapCents);
  const line27 = line18b + line19h + line20d + ac.d + heater.d + furnace.d + line25e + line26c;
  const line28 = Math.min(line27, annual);
  const heatPumps = byCostDown(of('heat-pump'));
  const heatPumpWaterHeaters = byCostDown(of('heat-pump-water-heater'));
  const biomass = byCostDown(of('biomass'));
  const line29 = { a: heatPumps[0]?.cost || 0, b: total(heatPumps.slice(1)), c: heatPumpWaterHeaters[0]?.cost || 0, d: total(heatPumpWaterHeaters.slice(1)), e: biomass[0]?.cost || 0, f: total(biomass.slice(1)) };
  const line29g = line29.a + line29.b + line29.c + line29.d + line29.e + line29.f;
  const line29h = cap(ofBasis(line29g, rate), rule.heatPumpCapCents);
  const line30 = line28 + line29h;
  const line31 = Math.max(0, whole(taxLimit));
  const line32 = Math.min(line30, line31);
  if (line30 > line31) checks.push(check('warning', 'ENERGY_HOME_IMPROVEMENT_LIMITED_BY_TAX', `The energy efficient home improvement credit of ${line30} is limited to the tax left after earlier credits (${line31}); the rest cannot be carried forward.`, ''));
  const qmids = (list) => list.map((item) => item.qmid).filter(Boolean);
  return {
    credit: line32,
    checks,
    lines: {
      allowed: true, '17a': mainHome !== false, '17b': originalUser !== false, '17e': newConstruction === true, '21b': originalUser !== false,
      '18a': insulation, '18b': line18b, '19a': line19a, '19b': doors[0]?.qmid || '', '19c': line19c, '19d': line19d, '19dQmids': qmids(doors.slice(1, 3)), '19e': line19e, '19f': line19f, '19g': line19g, '19h': line19h,
      '20a': line20a, '20aQmids': qmids(windows.slice(0, 4)), '20b': line20b, '20c': line20c, '20d': line20d,
      '22a': ac.a, '22aQmid': ac.items[0]?.qmid || '', '22b': ac.b, '22c': ac.c, '22d': ac.d,
      '23a': heater.a, '23aQmids': qmids(heater.items.slice(0, 2)), '23b': heater.b, '23c': heater.c, '23d': heater.d,
      '24a': furnace.a, '24aQmid': furnace.items[0]?.qmid || '', '24b': furnace.b, '24c': furnace.c, '24d': furnace.d,
      '25a': line25c > 0, '25b': enabled, '25c': line25c, '25dQmids': enabled.length ? qmids(panels).slice(0, 2) : [], '25e': line25e,
      '26a': line26b > 0, '26b': line26b, '26c': line26c, 27: line27, 28: line28,
      '29a': line29.a, '29aQmid': heatPumps[0]?.qmid || '', '29b': line29.b, '29c': line29.c, '29cQmid': heatPumpWaterHeaters[0]?.qmid || '', '29d': line29.d, '29e': line29.e, '29eQmid': biomass[0]?.qmid || '', '29f': line29.f, '29g': line29g, '29h': line29h,
      30: line30, 31: line31, 32: line32,
    },
  };
}

export function cleanEnergyTentative({ items, mainHome, carryforward, rule }) {
  const checks = [];
  const rows = items.filter((item) => CLEAN_ENERGY_CATEGORIES.includes(item.category));
  const carriedIn = whole(carryforward);
  if (!rule.newExpenditures) {
    if (rows.length) checks.push(check('warning', 'ENERGY_CLEAN_ENERGY_ENDED', 'The residential clean energy credit ended for expenditures made after 2025-12-31 (Public Law 119-21): an expenditure counts when installation is completed, so no credit is included for these items. Only an unused credit carried forward from 2025 can still be claimed.', 'Remove the items, or add them to the 2025 return if installation was completed in 2025.'));
    if (!carriedIn) return rows.length ? { tentative: 0, carryforwardOnly: true, lines: { 1: 0 }, checks } : null;
    return { tentative: carriedIn, carryforwardOnly: true, lines: { 1: carriedIn }, checks };
  }
  if (!rows.length && !carriedIn) return null;
  const sum = (category) => total(rows.filter((item) => item.category === category));
  const batteries = rows.filter((item) => item.category === 'battery');
  const smallBatteries = batteries.filter((item) => !(item.capacity >= rule.batteryMinimumKilowattHours));
  for (const item of smallBatteries) checks.push(check('warning', 'ENERGY_BATTERY_TOO_SMALL', `${named(item)}: battery storage qualifies only with a capacity of at least ${rule.batteryMinimumKilowattHours} kilowatt hours${item.capacity > 0 ? '' : ', and no capacity was entered'}, so it is left out (Form 5695 line 5a).`, 'Enter the battery\'s capacity in kilowatt hours.'));
  const line5b = total(batteries.filter((item) => item.capacity >= rule.batteryMinimumKilowattHours));
  const line6a = sum('solar-electric') + sum('solar-water') + sum('small-wind') + sum('geothermal') + line5b;
  const line6b = ofBasis(line6a, rule.creditBasisPoints);
  const cells = rows.filter((item) => item.category === 'fuel-cell');
  if (cells.length && mainHome === false) checks.push(check('warning', 'ENERGY_FUEL_CELL_NOT_MAIN_HOME', 'Fuel cell property qualifies only on your main home in the United States (Form 5695 line 7a), so it is left out.', ''));
  const cellRows = mainHome === false ? [] : cells;
  const line8 = total(cellRows);
  const line9 = ofBasis(line8, rule.creditBasisPoints);
  const kilowatts = cellRows.reduce((sum, item) => sum + (Number.isFinite(item.capacity) ? item.capacity : 0), 0);
  const counted = kilowatts >= rule.fuelCellMinimumKilowatts ? Math.floor(kilowatts / rule.fuelCellMinimumKilowatts) * rule.fuelCellMinimumKilowatts : 0;
  if (cellRows.length && counted === 0) checks.push(check('warning', 'ENERGY_FUEL_CELL_CAPACITY', `Fuel cell property needs a nameplate capacity of at least ${rule.fuelCellMinimumKilowatts} kilowatt; none was entered, so its credit is zero (Form 5695 line 10).`, 'Enter the fuel cell\'s capacity in kilowatts.'));
  const line10 = Math.round(counted * (rule.fuelCellPerKilowattCents / 100));
  const line11 = Math.min(line9, line10);
  const line13 = line6b + line11 + carriedIn;
  return { tentative: line13, carryforwardOnly: false, checks, lines: { 1: sum('solar-electric'), 2: sum('solar-water'), 3: sum('small-wind'), 4: sum('geothermal'), '5a': batteries.length ? line5b > 0 : null, '5b': line5b, '6a': line6a, '6b': line6b, ...(cells.length ? { '7a': mainHome !== false } : {}), 8: line8, 9: line9, 10: line10, kilowatts: counted, 11: line11, 12: carriedIn, 13: line13 } };
}

export function cleanEnergyCredit(tentative, taxLimit) {
  const limit = Math.max(0, whole(taxLimit));
  const credit = Math.min(tentative.tentative, limit);
  const carriedOut = tentative.tentative - credit;
  const checks = carriedOut > 0 ? [check('warning', 'ENERGY_CLEAN_ENERGY_CARRYFORWARD', `The residential clean energy credit is limited to the tax left after other credits (${limit}); ${carriedOut} is carried forward to next year. Keep this year's Form 5695 to claim it.`, '')] : [];
  const lines = tentative.carryforwardOnly ? { ...tentative.lines, 2: limit, 3: credit, 4: carriedOut } : { ...tentative.lines, 14: limit, 15: credit, 16: carriedOut };
  return { credit, carriedOut, lines, checks };
}
