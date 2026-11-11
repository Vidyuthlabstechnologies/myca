export const RETURN_STATUSES = Object.freeze(['draft', 'ready', 'signed', 'submitted', 'accepted', 'rejected']);

const MOVES = Object.freeze({
  draft: Object.freeze(['ready']),
  ready: Object.freeze(['draft', 'signed']),
  signed: Object.freeze(['draft', 'submitted']),
  submitted: Object.freeze(['accepted', 'rejected']),
  rejected: Object.freeze(['draft']),
  accepted: Object.freeze([]),
});

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function nextStatuses(status) {
  return MOVES[status] || [];
}

export function canMoveReturn(from, to) {
  return nextStatuses(from).includes(to);
}

export function returnLocked(status) {
  return status === 'signed' || status === 'submitted' || status === 'accepted';
}

export function moveReturn(record, to, { at, by, note = '' } = {}) {
  const from = record && RETURN_STATUSES.includes(record.status) ? record.status : 'draft';
  if (!RETURN_STATUSES.includes(to)) return { ok: false, error: 'UNKNOWN_RETURN_STATUS', status: String(to) };
  if (!canMoveReturn(from, to)) return { ok: false, error: 'RETURN_MOVE_NOT_ALLOWED', from, to, allowed: [...nextStatuses(from)] };
  if (!INSTANT.test(String(at || ''))) return { ok: false, error: 'MOVE_NEEDS_TIME' };
  if (typeof by !== 'string' || !by.trim()) return { ok: false, error: 'MOVE_NEEDS_ACTOR' };
  const history = [...(Array.isArray(record?.history) ? record.history : []), { from, to, at, by: by.trim(), note: String(note || '').slice(0, 500) }];
  return { ok: true, record: { ...record, status: to, history } };
}
