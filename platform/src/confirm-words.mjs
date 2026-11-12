import { formatMoneyCurrent } from './country.mjs';

export function money(n) {
  return formatMoneyCurrent(Number(n) || 0);
}

export const REVIEW_REASONS = {
  DRAFT_CHANGED: 'Your books for this month changed after you saw these figures. Review again to see the current ones.',
  STEP_NOT_READY: 'An earlier step of this review is not confirmed yet.',
  NOTHING_TO_REVIEW: 'There is nothing dated in this month to review.',
  OWNER_APPROVES: 'Only the owner approves the return.',
  ANSWER_DOES_NOT_FIT: 'That answer does not fit this step.',
  UNKNOWN_STEP: 'That is not a step of the review.',
  INVALID_PERIOD: 'That is not a month I can read.',
};
