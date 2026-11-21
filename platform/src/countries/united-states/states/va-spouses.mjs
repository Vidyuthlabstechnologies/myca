import { whole, positive, sum } from '../state-kit.mjs';

export const OWNERS = Object.freeze(['taxpayer', 'spouse']);
const ownerOf = (form) => (form.owner === 'spouse' ? 'spouse' : 'taxpayer');
const field = (form, key) => positive(form.fields?.[key]);
const formsOf = (ctx, kind) => (ctx.forms || []).filter((form) => form.kind === kind);
const taxableOf = (form) => (form.fields?.taxableAmount === undefined || form.fields?.taxableAmount === null || form.fields?.taxableAmount === '' ? field(form, 'grossDistribution') : field(form, 'taxableAmount'));

function weightsOf(rows, pick) {
  const weights = { taxpayer: 0, spouse: 0 };
  for (const row of rows) weights[row.owner] += Math.abs(whole(pick(row)));
  return weights;
}

export function splitByOwner(total, weights, joint) {
  const amount = whole(total);
  if (!joint) return { taxpayer: amount, spouse: 0, assumed: false };
  const all = weights.taxpayer + weights.spouse;
  if (all <= 0) {
    const half = Math.round(amount / 2);
    return { taxpayer: half, spouse: amount - half, assumed: amount !== 0 };
  }
  const taxpayer = Math.round((amount * weights.taxpayer) / all);
  return { taxpayer, spouse: amount - taxpayer, assumed: false };
}

const rowsOf = (ctx, kind, pick) => formsOf(ctx, kind).map((form) => ({ owner: ownerOf(form), value: pick(form) }));

export function incomeByOwner(ctx) {
  const income = ctx.income;
  const joint = ctx.filingStatus === 'mfj';
  const by = (total, rows) => splitByOwner(total, weightsOf(rows, (row) => row.value), joint);
  const businessRows = (ctx.federal.schedules?.C || []).map((item) => ({ owner: item.owner === 'spouse' ? 'spouse' : 'taxpayer', value: whole(item.lines?.['31']) }));
  const gainRows = [
    ...formsOf(ctx, '1099-B').map((form) => ({ owner: ownerOf(form), value: sum(Array.isArray(form.fields?.transactions) ? form.fields.transactions : [form.fields || {}], (row) => positive(row.proceeds) - positive(row.costBasis) + positive(row.washSaleLossDisallowed)) })),
    ...rowsOf(ctx, '1099-DIV', (form) => field(form, 'capitalGainDistributions')),
  ];
  const parts = {
    wages: by(income.wages, ctx.w2.map((row) => ({ owner: row.owner, value: row.wages }))),
    business: by(income.businessIncome, businessRows),
    interest: by(income.taxableInterest - income.usObligationInterest, rowsOf(ctx, '1099-INT', (form) => field(form, 'interest'))),
    usInterest: by(income.usObligationInterest, rowsOf(ctx, '1099-INT', (form) => field(form, 'treasuryInterest'))),
    dividends: by(income.ordinaryDividends, rowsOf(ctx, '1099-DIV', (form) => field(form, 'ordinaryDividends'))),
    capitalGain: by(income.capitalGain, gainRows),
    ira: by(income.iraTaxable, formsOf(ctx, '1099-R').filter((form) => form.fields?.iraSepSimple).map((form) => ({ owner: ownerOf(form), value: taxableOf(form) }))),
    pension: by(income.pensionTaxable, formsOf(ctx, '1099-R').filter((form) => !form.fields?.iraSepSimple).map((form) => ({ owner: ownerOf(form), value: taxableOf(form) }))),
    socialSecurityTaxable: by(income.socialSecurityTaxable, rowsOf(ctx, 'SSA-1099', (form) => field(form, 'netBenefits'))),
    unemployment: by(income.unemployment, rowsOf(ctx, '1099-G', (form) => field(form, 'unemployment'))),
    stateRefund: by(income.stateRefundTaxable, rowsOf(ctx, '1099-G', (form) => field(form, 'stateRefund'))),
    other: by(income.otherIncome, rowsOf(ctx, '1099-MISC', (form) => field(form, 'otherIncome'))),
  };
  const gross = (owner) => Object.values(parts).reduce((total, part) => total + part[owner], 0);
  parts.adjustments = splitByOwner(income.adjustments, { taxpayer: Math.max(0, gross('taxpayer')), spouse: Math.max(0, gross('spouse')) }, joint);
  const assumed = Object.entries(parts).filter(([, part]) => part.assumed).map(([key]) => key);
  const owners = Object.fromEntries(OWNERS.map((owner) => [owner, Object.fromEntries(Object.entries(parts).map(([key, part]) => [key, part[owner]]))]));
  return { ...owners, assumed };
}

export function filerOf(ctx, owner) {
  return ctx.filers.find((item) => item.role === owner) || null;
}

export function bornOnOrBefore(filer, iso) {
  return Boolean(filer?.dateOfBirth) && /^\d{4}-\d{2}-\d{2}$/.test(filer.dateOfBirth) && filer.dateOfBirth <= iso;
}

export function ageInYear(filer, taxYear) {
  if (!filer?.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(filer.dateOfBirth)) return null;
  return Number(taxYear) - Number(filer.dateOfBirth.slice(0, 4));
}

export function applyRatio(amount, value, places) {
  const scale = 10 ** places;
  return Math.round((whole(amount) * Math.round(Number(value) * scale)) / scale);
}

export function nextBusinessDay(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
