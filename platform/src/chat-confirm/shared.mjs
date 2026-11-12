import { formatMoneyCurrent } from '../country.mjs';

export function money(n) {
  return formatMoneyCurrent(Number(n) || 0);
}

export function stateCodeOf(value) {
  const s = String(value == null ? '' : value).trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : '';
}

export const PAYMENT_REASONS = {
  BILL_NOT_FOUND: 'That bill is not in these books.',
  INVALID_DATE: 'That is not a date I can read.',
  BEFORE_BILL: 'A payment cannot be dated before the bill.',
  PERIOD_LOCKED: 'That date is inside the locked period.',
  PARTY_NOT_FOUND: 'The supplier on that bill is missing from these books.',
  BILL_PAID: 'That bill is already fully paid.',
  BAD_AMOUNT: 'A payment has to be a positive amount.',
  OVERPAYMENT: 'That is more than is still owed on the bill.',
  INSUFFICIENT_CASH: 'There is not that much cash in hand. Pay from the bank, or record the cash first.',
};

export const TDS_REASONS = {
  NOT_A_DEDUCTOR: () => 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN first.',
  BAD_TDS_SECTION: () => 'MyCA handles TDS under 194A (interest), 194C (contractors), 194I (rent) and 194J (professional or technical fees).',
  TDS_CATEGORY_REQUIRED: () => 'Under 194J, say whether it is for professional services, technical services or director remuneration; the rate differs.',
  TDS_ASSET_REQUIRED: () => 'Under 194I, say whether the rent is for land, building or furniture, or for plant and machinery; the rate differs.',
  PAN_REQUIRED: () => 'Give the payee\'s PAN. MyCA does not yet have the rule for a payee without a PAN, so it will not guess the rate.',
  BAD_PAN: () => 'That PAN is not in the right form: five letters, four digits and a letter.',
  TDS_RULE_MISSING: () => 'MyCA has no TDS rule in force for that section on that date, so it will not work out a deduction.',
  BAD_TAN: () => 'A TAN is four letters, five digits and a letter.',
  INVALID_DATE: () => 'That is not a date I can read.',
  FUTURE_DATE: () => 'A deposit date cannot be in the future.',
  PERIOD_LOCKED: (p) => `${p.date} is inside the locked period (through ${p.lockThrough}).`,
  BAD_CHALLAN: () => 'Give the challan reference as printed (the CIN, or the BSR code and serial number).',
  CHALLAN_USED: (p) => `Challan ${p.challan} is already recorded.`,
  NOTHING_DUE: () => 'There is no TDS waiting to be deposited.',
  BAD_AMOUNT: () => 'The amount must be a positive number.',
  MORE_THAN_DUE: (p) => `That is more than the ${money(p.due)} of TDS still to deposit.`,
};

export const REVIEW_REASONS = {
  DRAFT_CHANGED: 'Your books for this month changed after you saw these figures. Review again to see the current ones.',
  STEP_NOT_READY: 'An earlier step of this review is not confirmed yet.',
  NOTHING_TO_REVIEW: 'There is nothing dated in this month to review.',
  OWNER_APPROVES: 'Only the owner approves the return.',
  ANSWER_DOES_NOT_FIT: 'That answer does not fit this step.',
  UNKNOWN_STEP: 'That is not a step of the review.',
  INVALID_PERIOD: 'That is not a month I can read.',
};
