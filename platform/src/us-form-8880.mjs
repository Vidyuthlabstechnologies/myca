export const SAVERS_DEFERRAL_CODES = Object.freeze(['D', 'E', 'F', 'G', 'H', 'S', 'AA', 'BB', 'EE']);

const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};

export function electiveDeferrals(box12) {
  return (Array.isArray(box12) ? box12 : []).filter((row) => SAVERS_DEFERRAL_CODES.includes(String(row?.code || '').toUpperCase())).reduce((total, row) => total + whole(row.amount), 0);
}

export function saversRate(agi, filingStatus, rule) {
  const bands = filingStatus === 'mfj' ? rule.rates.mfj : filingStatus === 'hoh' ? rule.rates.hoh : rule.rates.other;
  const found = bands.find((band) => agi <= band.upToCents / 100);
  return found ? found.basisPoints : 0;
}

function blockedReasons(person, rule) {
  const reasons = [];
  if (person.age !== null && person.age !== undefined && person.age < rule.minimumAge) reasons.push(`under ${rule.minimumAge} at the end of the year`);
  if (person.dependent) reasons.push('can be claimed as someone else\'s dependent');
  if (person.student) reasons.push('was a full-time student during part of 5 months of the year');
  return reasons;
}

export function computeForm8880({ filingStatus, agi, people, taxLimit, rule }) {
  const joint = filingStatus === 'mfj';
  const columns = (joint ? people.slice(0, 2) : people.slice(0, 1)).map((person) => ({ ...person, blocked: blockedReasons(person, rule) }));
  const checks = [];
  const distributions = joint ? columns.reduce((total, person) => total + whole(person.distributions), 0) : whole(columns[0]?.distributions);
  const cap = rule.contributionCapCents / 100;
  const rows = columns.map((person) => {
    const contributed = whole(person.ira) + whole(person.able) + whole(person.deferrals);
    if (person.blocked.length) {
      if (contributed > 0) checks.push({ level: 'warning', code: 'SAVERS_CREDIT_PERSON_EXCLUDED', message: `${person.name} ${person.blocked.join(' and ')}, so their contributions do not count for the retirement savings contributions credit (Form 8880).`, fix: '' });
      return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, excluded: true };
    }
    const line1 = whole(person.ira) + whole(person.able);
    const line2 = whole(person.deferrals);
    const line3 = line1 + line2;
    const line5 = Math.max(0, line3 - distributions);
    return { 1: line1, 2: line2, 3: line3, 4: distributions, 5: line5, 6: Math.min(line5, cap), excluded: false };
  });
  const line7 = rows.reduce((total, row) => total + row[6], 0);
  const line9 = saversRate(agi, filingStatus, rule);
  const line10 = Math.round((line7 * line9) / 10000);
  const line11 = Math.max(0, whole(taxLimit));
  const line12 = Math.min(line10, line11);
  if (line7 > 0 && line9 === 0) checks.push({ level: 'warning', code: 'SAVERS_CREDIT_AGI_TOO_HIGH', message: `Adjusted gross income of ${agi} is above the limit for the retirement savings contributions credit, so no credit is included.`, fix: '' });
  if (line10 > 0 && line11 < line10) checks.push({ level: 'warning', code: 'SAVERS_CREDIT_LIMITED_BY_TAX', message: `The retirement savings contributions credit of ${line10} is limited to the tax left after earlier credits (${line11}); the rest cannot be carried forward.`, fix: '' });
  const column = (index) => (rows[index] ? Object.fromEntries(Object.entries(rows[index]).filter(([key]) => key !== 'excluded')) : null);
  return {
    credit: line12,
    lines: { a: column(0), ...(joint ? { b: column(1) } : {}), 7: line7, 8: agi, 9: line9 / 10000, 10: line10, 11: line11, 12: line12 },
    checks,
  };
}
