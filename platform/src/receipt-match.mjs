import { documentsOf, isSha256 } from './document-store.mjs';
import { daysBetween } from './reminders.mjs';

const AMOUNT_TOLERANCE = 0.5;
const DAY_TOLERANCE = 3;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function key(name) {
  return String(name || '').trim().toLowerCase();
}

export function matchDocument(state, { total, date, partyName } = {}) {
  const amount = round2(total);
  if (!(amount > 0) || !date) return [];
  const party = key(partyName);
  const candidates = [];
  for (const expense of state.expenses || []) {
    if (expense.documentSha256) continue;
    const near = Math.abs(round2(expense.amount) - amount) <= AMOUNT_TOLERANCE;
    const days = Math.abs(daysBetween(expense.date, date));
    if (near && days <= DAY_TOLERANCE) candidates.push({ kind: 'expense', id: expense.id, date: expense.date, amount: round2(expense.amount), party: expense.payee || expense.narration || '', daysApart: days, sameParty: party && key(expense.payee) === party });
  }
  for (const bill of state.purchases || []) {
    if (bill.documentSha256 || bill.status === 'cancelled') continue;
    const near = Math.abs(round2(bill.total) - amount) <= AMOUNT_TOLERANCE;
    const days = Math.abs(daysBetween(bill.date, date));
    if (near && days <= DAY_TOLERANCE) candidates.push({ kind: 'bill', id: bill.id, date: bill.date, amount: round2(bill.total), party: bill.partyName, daysApart: days, sameParty: party && key(bill.partyName) === party });
  }
  return candidates.sort((a, b) => Number(b.sameParty) - Number(a.sameParty) || a.daysApart - b.daysApart);
}

export function planAttachDocument(state, args = {}) {
  const sha = String(args.documentSha256 || '').trim().toLowerCase();
  if (!isSha256(sha)) return { ok: false, error: 'INVALID_SHA256' };
  if (!documentsOf(state).exists(sha)) return { ok: false, error: 'DOCUMENT_NOT_FOUND' };
  const id = String(args.id || '').trim().toUpperCase();
  const target = (state.expenses || []).find((e) => e.id === id) || (state.purchases || []).find((b) => b.id === id) || (state.invoices || []).find((i) => i.id === id);
  if (!target) return { ok: false, error: 'ENTRY_NOT_FOUND', id };
  const kind = (state.expenses || []).includes(target) ? 'expense' : (state.purchases || []).includes(target) ? 'bill' : 'invoice';
  return { ok: true, plan: { sha, id, kind, target, replaces: target.documentSha256 || '' } };
}

export function attachDocument(state, args = {}) {
  const planned = planAttachDocument(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  plan.target.documentSha256 = plan.sha;
  return { ok: true, id: plan.id, kind: plan.kind, documentSha256: plan.sha, replaced: plan.replaces };
}

export function matchWords(matches, money) {
  if (!matches.length) return '';
  const best = matches[0];
  const when = best.daysApart === 0 ? 'the same day' : `${best.daysApart} ${best.daysApart === 1 ? 'day' : 'days'} apart`;
  return `This looks like ${best.kind === 'bill' ? 'bill' : 'expense'} ${best.id} already in the books: ${money(best.amount)} to ${best.party} on ${best.date}, ${when}. Say "attach it to ${best.id}" to keep the document with that entry instead of posting it again.`;
}
