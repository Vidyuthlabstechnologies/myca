import { rules } from './sprint-load.mjs';
import { localToday } from './dates.mjs';
import { countryOf } from './country.mjs';

const FAMILIES = [
  { key: 'gst', country: 'IN', title: 'GST rates, thresholds, set-off, interest and late fees', match: (id) => id.startsWith('gst.'), watch: ['CBIC central tax and rate notifications after every GST Council meeting', 'CGST Rules amendments (rule 36, 37, 37A, 61, 88A, 138)'] },
  { key: 'tds', country: 'IN', title: 'TDS sections, rates and thresholds', match: (id) => id.startsWith('tds.'), watch: ['Finance Act each year (February budget, enacted by end of March)', 'CBDT circulars on TDS rates and no-PAN deduction'] },
  { key: 'income-tax', country: 'IN', title: 'Income tax slabs, rebate, surcharge and cess', match: (id) => id.startsWith('income-tax.'), watch: ['Finance Act First Schedule each year', 'Income-tax Act 2025 rules and forms as notified'] },
  { key: 'audit-threshold', country: 'IN', title: 'Tax audit and presumptive limits', match: (id) => id.startsWith('audit-threshold.'), watch: ['Finance Act amendments to sections 44AB, 44AD and 44ADA (2025 Act ss.58 and 63)'] },
  { key: 'msme', country: 'IN', title: 'MSME payment time limit and the deduction on payment', match: (id) => id.startsWith('msme.'), watch: ['MSMED Act 2006 amendments to s.15 and s.2(b)', 'Finance Act changes to s.43B(h) and its successor in the Income-tax Act 2025 (section number to be confirmed by the advisor)'] },
  { key: 'due-date', country: 'IN', title: 'Return due dates and rollover', match: (id) => id.startsWith('due-date.'), watch: ['CBIC notifications extending GSTR-1 and GSTR-3B dates', 'CBDT orders extending ITR and TDS statement dates'] },
  { key: 'holiday', country: 'IN', title: 'Gazetted holiday calendar', match: (id) => id.startsWith('holiday.'), watch: ['DoPT holiday Office Memorandum, published each July for the next calendar year'] },
  { key: 'payroll', country: 'IN', title: 'Provident fund and state insurance', match: (id) => id.startsWith('payroll.') && !id.startsWith('payroll.pt.'), watch: ['EPFO circulars on wage ceiling, rates and administrative charges', 'ESIC notifications on contribution rates and the wage limit', 'Code on Social Security 2020 rules as brought into force'] },
  { key: 'professional-tax', country: 'IN', title: 'Professional tax by state', match: (id) => id.startsWith('payroll.pt.'), watch: ['Each state commercial tax department notification; budgets change slabs in April'] },
  { key: 'us-federal', country: 'US', title: 'Federal information reporting', match: (id) => id.startsWith('us.federal.'), watch: ['IRS General Instructions for Certain Information Returns (new edition each year)', 'IRS inflation adjustment revenue procedure each October or November'] },
  { key: 'us-sales-tax', country: 'US', title: 'State sales tax due dates', match: (id) => id.startsWith('us.salestax.'), watch: ['Texas Comptroller sales tax due dates', 'California Department of Tax and Fee Administration filing calendar', 'Any new state the business registers in needs its own dated rule'] },
];

const SOON_DAYS = 90;

function inForceOn(record, date) {
  return record.effectiveFrom <= date && (record.effectiveTo === null || record.effectiveTo >= date);
}

function verified(record) {
  return (record.attestations || []).some((a) => a.verdict === 'verified');
}

function plusDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function rulesStatus(state, args = {}) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOf || '')) ? args.asOf : localToday();
  const country = args.country ? String(args.country).toUpperCase() : countryOf(state);
  const soon = plusDays(asOf, SOON_DAYS);
  const all = rules.RULES || [];
  const families = FAMILIES.filter((family) => family.country === country).map((family) => {
    const records = all.filter((record) => family.match(record.id));
    const ids = [...new Set(records.map((record) => record.id))].sort();
    const inForce = records.filter((record) => inForceOn(record, asOf));
    const gaps = ids.filter((id) => !id.includes('.extension.') && !records.some((record) => record.id === id && inForceOn(record, asOf)));
    const ending = inForce.filter((record) => record.effectiveTo !== null && record.effectiveTo <= soon && !records.some((next) => next.id === record.id && next.effectiveFrom > record.effectiveTo)).map((record) => ({ id: record.id, effectiveTo: record.effectiveTo }));
    const latestFrom = records.reduce((max, record) => (record.effectiveFrom > max ? record.effectiveFrom : max), '');
    const lastVerified = records.flatMap((record) => (record.attestations || []).filter((a) => a.verdict === 'verified').map((a) => a.on)).sort().pop() || '';
    const coveredUntil = inForce.every((record) => record.effectiveTo !== null) && inForce.length ? inForce.reduce((min, record) => (min === '' || record.effectiveTo < min ? record.effectiveTo : min), '') : '';
    return {
      key: family.key,
      title: family.title,
      records: records.length,
      ids: ids.length,
      inForce: inForce.length,
      attested: records.filter(verified).length,
      latestFrom,
      lastVerified,
      coveredUntil,
      gaps,
      ending,
      watch: family.watch,
      attention: gaps.length > 0 || ending.length > 0,
    };
  });
  const totals = families.reduce((sum, family) => ({ records: sum.records + family.records, attested: sum.attested + family.attested, gaps: sum.gaps + family.gaps.length, ending: sum.ending + family.ending.length }), { records: 0, attested: 0, gaps: 0, ending: 0 });
  const notes = [];
  if (totals.attested === 0) notes.push(country === 'US' ? 'No rule has been reviewed by a US CPA yet; figures carry a not-reviewed note until one attests.' : 'No rule has been reviewed by your CA yet; figures carry a not-reviewed note until one attests.');
  for (const family of families) {
    if (family.gaps.length) notes.push(`${family.title}: ${family.gaps.length === 1 ? '1 rule has' : `${family.gaps.length} rules have`} nothing in force on ${asOf} (${family.gaps.slice(0, 3).join(', ')}${family.gaps.length > 3 ? ', …' : ''}).`);
    if (family.ending.length) notes.push(`${family.title}: ${family.ending.length === 1 ? '1 record ends' : `${family.ending.length} records end`} by ${family.ending.map((row) => row.effectiveTo).sort().pop()} with no successor recorded.`);
  }
  return {
    ok: true,
    data: {
      asOf,
      country,
      integrity: rules.registryIntegrity ? rules.registryIntegrity().problems.length : 0,
      totals,
      families,
      notes,
      howToUpdate: 'A change in law is a new dated record with its act, section and source; existing records are never edited. The partner CA firm attests each record it has checked, and the not-reviewed note then disappears for that figure.',
    },
  };
}

export function rulesStatusWords(data) {
  const head = `${data.totals.records} dated statutory records for ${data.country === 'US' ? 'the United States' : 'India'} as of ${data.asOf}; ${data.totals.attested} reviewed by ${data.country === 'US' ? 'a CPA' : 'your CA'}.`;
  const rows = data.families.map((family) => `· ${family.title}: ${family.inForce} in force${family.latestFrom ? `, latest from ${family.latestFrom}` : ''}${family.coveredUntil ? `, covered until ${family.coveredUntil}` : ''}${family.attention ? ' — needs attention' : ''}`);
  return [head, ...rows, ...data.notes].join('\n');
}
