const fromCents = (cents) => Math.round(Number(cents || 0) / 100);
const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

export function careApplicableBasisPoints(agi, joint, credit) {
  let basisPoints = credit.initialBasisPoints;
  for (const phase of credit.phases) {
    const start = fromCents(joint ? phase.startCents.joint : phase.startCents.other);
    const step = fromCents(joint ? phase.stepCents.joint : phase.stepCents.other);
    if (agi <= start) continue;
    const steps = Math.ceil((agi - start) / step);
    basisPoints = Math.max(phase.floorBasisPoints, basisPoints - steps * credit.pointBasisPoints);
  }
  return basisPoints;
}

export function careExpenseLimit(qualifyingPersons, credit) {
  if (qualifyingPersons <= 0) return 0;
  return fromCents(qualifyingPersons >= 2 ? credit.twoOrMoreExpenseCents : credit.onePersonExpenseCents);
}

export function deemedEarnedIncome(actual, months, qualifyingPersons, credit, otherMonthsPay = 0) {
  const count = Math.max(0, Math.min(12, Math.floor(Number(months) || 0)));
  const monthly = fromCents(qualifyingPersons >= 2 ? credit.deemedMonthlyCents.twoOrMore : credit.deemedMonthlyCents.one);
  const deemed = count * monthly;
  const total = Math.max(0, whole(actual));
  const outside = count >= 12 ? 0 : Math.min(total, Math.max(0, whole(otherMonthsPay)));
  const inside = total - outside;
  return { earned: outside + Math.max(inside, deemed), deemed, outside, inside, used: deemed > inside };
}

export function dependentCareBenefits({ received, carriedIn = 0, forfeited = 0, qualifiedExpenses, earnedTaxpayer, earnedOther, mfsWithSpouseIncome, exclusion }) {
  const line12 = Math.max(0, whole(received));
  const line13 = Math.max(0, whole(carriedIn));
  const line14 = Math.max(0, whole(forfeited));
  const line15 = Math.max(0, line12 + line13 - line14);
  const line16 = Math.max(0, whole(qualifiedExpenses));
  const line17 = Math.min(line15, line16);
  const line18 = whole(earnedTaxpayer);
  const line19 = whole(earnedOther);
  const line20 = Math.max(0, Math.min(line17, line18, line19));
  const line21 = fromCents(mfsWithSpouseIncome ? exclusion.mfsMaxCents : exclusion.maxCents);
  const line22 = 0;
  const line23 = line15 - line22;
  const line24 = 0;
  const line25 = Math.max(0, Math.min(line20, line21));
  const line26 = Math.max(0, line23 - line25);
  return { lines: { 12: line12, 13: line13, 14: line14, 15: line15, 16: line16, 17: line17, 18: line18, 19: line19, 20: line20, 21: line21, 22: line22, 23: line23, 24: line24, 25: line25, 26: line26 }, excluded: line25, deducted: line24, taxable: line26 };
}

export function dependentCareCredit({ qualifyingPersons, qualifiedExpenses, benefits, earnedTaxpayer, earnedOther, agi, joint, taxLimit, credit }) {
  const limit = careExpenseLimit(qualifyingPersons, credit);
  const expenses = Math.max(0, whole(qualifiedExpenses));
  const lines = {};
  let line3;
  if (benefits) {
    const line27 = limit;
    const line28 = benefits.deducted + benefits.excluded;
    const line29 = Math.max(0, line27 - line28);
    const line30 = Math.max(0, expenses - line28);
    const line31 = Math.min(line29, line30);
    Object.assign(lines, { 27: line27, 28: line28, 29: line29, 30: line30, 31: line31 });
    line3 = line31;
  } else line3 = Math.min(expenses, limit);
  const line4 = whole(earnedTaxpayer);
  const line5 = whole(earnedOther);
  const line6 = Math.max(0, Math.min(line3, line4, line5));
  const line7 = whole(agi);
  const basisPoints = careApplicableBasisPoints(line7, joint, credit);
  const line9a = Math.round((line6 * basisPoints) / 10000);
  const line9b = 0;
  const line9c = line9a + line9b;
  const line10 = Math.max(0, whole(taxLimit));
  const line11 = Math.min(line9c, line10);
  Object.assign(lines, { 3: line3, 4: line4, 5: line5, 6: line6, 7: line7, 8: basisPoints / 10000, '9a': line9a, '9b': line9b, '9c': line9c, 10: line10, 11: line11 });
  return { lines, credit: line11, basisPoints, limit };
}

const normalName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function under13Part(age, dateOfBirth) {
  if (age === null || age === undefined) return false;
  return age <= 12 || (age === 13 && !String(dateOfBirth || '').endsWith('-01-01'));
}

export function careQualifyingPersons({ dependents = [], spouse = null, spouseAllowed = false, dependentsAllowed = true, providers = [] }) {
  const candidates = dependents.map((item, index) => {
    const lived = Number(item.months ?? 12) > 6 || Boolean(item.bornOrDiedInYear);
    const disabled = Boolean(item.disabled);
    const qualifies = dependentsAllowed && ((Boolean(item.qualifyingChild) && under13Part(item.age, item.dateOfBirth)) || (disabled && lived));
    const first = normalName(item.firstName);
    const full = normalName(`${item.firstName || ''} ${item.lastName || ''}`);
    return { key: item.id || `dependent-${index + 1}`, kind: 'dependent', firstName: String(item.firstName || ''), lastName: String(item.lastName || ''), names: [normalName(item.id), first, full].filter(Boolean), qualifies, disabledOver12: disabled && Number(item.age) > 12, expenses: 0, referenced: false };
  });
  if (spouse) candidates.push({ key: 'spouse', kind: 'spouse', firstName: String(spouse.firstName || ''), lastName: String(spouse.lastName || ''), names: ['spouse', normalName(spouse.firstName), normalName(`${spouse.firstName || ''} ${spouse.lastName || ''}`)].filter(Boolean), qualifies: spouseAllowed, disabledOver12: true, expenses: 0, referenced: false });
  const problems = [];
  const qualifyingDependents = candidates.filter((item) => item.kind === 'dependent' && item.qualifies);
  let unassigned = 0;
  let excluded = 0;
  const rows = providers.map((provider) => {
    const amount = Math.max(0, whole(provider.amount));
    const wanted = normalName(provider.qualifyingPerson);
    let person = wanted ? candidates.find((item) => item.names.includes(wanted)) : null;
    if (!wanted && qualifyingDependents.length === 1) person = qualifyingDependents[0];
    if (person) person.referenced = true;
    let counted = amount;
    if (!wanted && !person) {
      unassigned += amount;
      if (qualifyingDependents.length > 1) problems.push({ level: 'warning', code: 'CARE_PERSON_NOT_NAMED', message: `${provider.name || 'A care provider'}: say which child or dependent was cared for, so Form 2441 line 2 shows the expenses for each person.` });
    } else if (!person) {
      counted = 0;
      excluded += amount;
      problems.push({ level: 'error', code: 'CARE_PERSON_UNKNOWN', message: `${provider.name || 'A care provider'} cared for "${provider.qualifyingPerson}", who is not a dependent or spouse on this return; the amount is left out.` });
    } else if (!person.qualifies) {
      counted = 0;
      excluded += amount;
      problems.push({ level: 'warning', code: 'CARE_PERSON_NOT_QUALIFYING', message: `${person.firstName || 'That person'} is not a qualifying person for Form 2441 (a dependent under 13 when cared for, or a dependent or spouse unable to care for themself who lived with you more than half the year), so the ${amount} paid to ${provider.name || 'that provider'} is left out.` });
    } else person.expenses += amount;
    return { name: provider.name, tin: provider.tin, ...(provider.ssn ? { ssn: provider.ssn } : {}), address: provider.address, ...(provider.city ? { city: provider.city, state: provider.state || '', zip: provider.zip || '' } : {}), householdEmployee: provider.householdEmployee, amount, qualifyingPerson: person ? person.key : '', counted };
  });
  const persons = candidates.filter((item) => item.qualifies && (item.kind === 'dependent' || item.referenced)).map((item) => ({ key: item.key, kind: item.kind, firstName: item.firstName, lastName: item.lastName, disabledOver12: item.disabledOver12, expenses: item.expenses }));
  const qualifiedExpenses = persons.reduce((total, item) => total + item.expenses, 0) + unassigned;
  return { persons, providers: rows, qualifiedExpenses, unassigned, excluded, count: persons.length, problems };
}
