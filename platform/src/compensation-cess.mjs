import { rules } from './sprint-load.mjs';

const RULE_ID = 'gst.compensation-cess';

function hsnDigits(hsn) {
  return String(hsn ?? '').replace(/\D/g, '');
}

export function chargesCess(line) {
  return Number(line?.cessRate || 0) > 0 || Number(line?.cessPerUnit || 0) > 0;
}

export function carriesCessAmount(line) {
  return Number(line?.cess || 0) !== 0;
}

export function cessInForce(hsn, onDate) {
  const found = rules.rule(RULE_ID, onDate);
  if (!found.ok) return { ok: true };
  const { levied, hsnPrefixes } = found.value;
  const ruleUsed = `${RULE_ID}@${found.record.effectiveFrom}`;
  if (!levied) {
    return { ok: false, error: 'CESS_NOT_IN_FORCE', date: onDate, rule: ruleUsed, hint: `Compensation cess ended on ${found.record.effectiveFrom}; remove the cess from this line. Pan masala and tobacco goods are taxed at 40 per cent instead.` };
  }
  if (hsnPrefixes === null) return { ok: true };
  const digits = hsnDigits(hsn);
  if (hsnPrefixes.some((prefix) => digits.startsWith(prefix))) return { ok: true };
  return { ok: false, error: 'CESS_NOT_IN_FORCE', date: onDate, hsn: digits, rule: ruleUsed, hint: `From ${found.record.effectiveFrom} compensation cess is levied only on tobacco and tobacco products (HSN chapter 24) and pan masala (HSN 2106 90 20); give the full HSN or remove the cess.` };
}

export function cessLineNotInForce(lines, onDate, carries) {
  for (let index = 0; index < (lines || []).length; index += 1) {
    if (!carries(lines[index])) continue;
    const checked = cessInForce(lines[index].hsn, onDate);
    if (!checked.ok) return { ...checked, line: index + 1 };
  }
  return null;
}
