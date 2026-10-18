import { isNegated, isQuestion, normalizeChat } from './intent.mjs';
import { saidPeriod } from './filing-intent.mjs';
import { monthCloseOf } from './month-close.mjs';

const CLOSE = /^(?:close\s+(?:the\s+)?month|month[\s-]*end(?:\s+close)?|close\s+(\d{4}-\d{2})|close\s+([a-z]+(?:\s+\d{4})?)|mahina\s+band\s+karo|month\s+close)\s*\??$/i;
const APPROVE = /^(?:approve|sign\s+off|confirm)\s+(?:the\s+)?(?:month\s+)?close(?:\s+for\s+(\d{4}-\d{2}))?(?:\s+with\s+a\s+note)?\s*(?::|-|,)?\s*(.*)$/i;

export function planMonthCloseFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw) || isQuestion(raw)) return null;
  const approve = raw.match(APPROVE);
  if (approve) {
    const period = approve[1] || saidPeriod(raw) || '';
    const close = monthCloseOf(state, period ? { period } : {});
    if (!close.ok) return { kind: 'reply', reply: close.error === 'MONTH_NOT_OVER' ? `${close.period} is not over yet.` : 'Say the month as 2026-09.', tools: [] };
    const note = String(approve[2] || '').trim();
    return { kind: 'tool', name: 'month_close_approve', args: { period: close.data.period, draftHash: close.data.draftHash, ...(note ? { note } : {}) } };
  }
  const close = raw.match(CLOSE);
  if (!close) return null;
  const period = close[1] || (close[2] ? saidPeriod(raw) : '') || saidPeriod(raw) || '';
  return { kind: 'tool', name: 'month_close', args: period ? { period } : {} };
}
