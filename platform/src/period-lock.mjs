export function normalizeLockDate(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export function lockThrough(state) {
  return String(state?.lockThrough || '');
}

export function isPeriodLocked(state, date) {
  const lock = lockThrough(state);
  if (!lock) return false;
  const day = String(date || '').slice(0, 10);
  return Boolean(day) && day <= lock;
}

export function lockPeriod(state, through, reason = '') {
  const value = normalizeLockDate(through);
  if (value == null) return { ok: false, error: 'INVALID_DATE' };
  if (!value) return { ok: false, error: 'DATE_REQUIRED' };
  state.lockThrough = value;
  return { ok: true, lockThrough: value, reason: String(reason || '') };
}

export function unlockPeriod(state) {
  state.lockThrough = '';
  return { ok: true, lockThrough: '' };
}
