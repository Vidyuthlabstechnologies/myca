import { isNegated, isQuestion, normalizeChat } from './intent.mjs';
import { paymentRun } from './payment-run.mjs';

const WHO_TO_PAY = /^(?:(?:who|whom|which\s+bills?)\s+(?:do\s+i\s+(?:need\s+to|have\s+to)|should\s+i|to)\s+pay|pay\s+the\s+bills|payment\s+run|bills?\s+to\s+pay|what\s+(?:bills?\s+)?(?:is|are)\s+due\s+to\s+suppliers|supplier\s+payments?\s+due|kis\s*ko\s+payment\s+(?:karna|dena)\s+hai|kiska\s+payment\s+baki\s+hai)\s*\??$/i;
const PAY_PROPOSED = /^pay\s+(?:the\s+)?(?:proposed|due|suggested)\s+bills(?:\s+(?:except|but\s+not|minus|leaving\s+out)\s+(.+))?\s*$/i;

export function planPaymentRunFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw)) return null;
  if (WHO_TO_PAY.test(raw)) return { kind: 'tool', name: 'payment_run', args: {} };
  const pay = raw.match(PAY_PROPOSED);
  if (!pay || isQuestion(raw)) return null;
  const except = new Set((pay[1] || '').toUpperCase().split(/[\s,]+(?:and\s+)?/).map((s) => s.trim()).filter((s) => /^BILL-\d+$/.test(s)));
  const run = paymentRun(state).data;
  const billIds = run.proposed.map((r) => r.billId).filter((id) => !except.has(id));
  if (!billIds.length) return { kind: 'reply', reply: run.proposed.length ? 'That leaves nothing to pay. I have recorded nothing.' : 'Nothing needs paying right now, so there is nothing to record.', tools: [] };
  return { kind: 'tool', name: 'record_payment_run', args: { billIds, mode: 'bank' } };
}
