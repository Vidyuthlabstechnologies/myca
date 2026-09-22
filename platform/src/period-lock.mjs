import { isoDate } from './dates.mjs';

export function normalizeLockDate(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  return isoDate(raw);
}

export function lockThrough(state) {
  return String(state?.lockThrough || '');
}

// Dates are compared only after normalising, so 2026-6-1 or 2026/06/01 cannot
// slip past a lock; a date that cannot be read is treated as locked.
export function isPeriodLocked(state, date) {
  const lock = normalizeLockDate(lockThrough(state));
  if (!lock) return false;
  const day = isoDate(String(date == null ? '' : date).trim().slice(0, 10));
  return day == null || day <= lock;
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
