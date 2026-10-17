import { isNegated, isQuestion, normalizeChat } from './intent.mjs';

const WHO_TO_CHASE = /^(?:who\s+(?:should\s+i|do\s+i\s+need\s+to|to)\s+chase|who\s+is\s+overdue|chase\s+(?:payments?|dues|customers|overdues?)|remind\s+(?:my\s+)?customers|payment\s+reminders?|collect(?:ion)?\s+(?:dues|payments?)|overdue\s+(?:customers|invoices|payments?)|kis\s*se\s+paisa\s+lena\s+hai|paisa\s+kaun\s+dega|udhaar\s+kaun\s+dega)\s*\??$/i;
const REMIND_ONE = /^(?:send\s+(?:a\s+)?(?:payment\s+)?reminder\s+to|remind|chase|payment\s+reminder\s+(?:to|for))\s+(?!me\b)(?!customers\b)(?!suppliers?\b)([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)(?:\s+(?:to\s+pay|for\s+payment|about\s+(?:their\s+)?(?:dues|payment|invoices?)))?\s*$/i;
const HINDI_ONE = /^([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)\s+ko\s+(?:payment\s+)?reminder\s+bhej(?:o|do|iye)\s*$/i;

export function planCollectionFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw)) return null;
  if (WHO_TO_CHASE.test(raw)) return { kind: 'tool', name: 'collection_drafts', args: {} };
  const one = raw.match(REMIND_ONE) || raw.match(HINDI_ONE);
  if (!one || isQuestion(raw)) return null;
  const customer = one[1].trim();
  const known = (state.invoices || []).some((inv) => String(inv.partyName || '').trim().toLowerCase() === customer.toLowerCase());
  if (!known) return null;
  return { kind: 'tool', name: 'record_collection_reminder', args: { customer } };
}
