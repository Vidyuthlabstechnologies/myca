export const CA_SYNC_MODES = ['live', 'daily', 'weekly', 'month_close', 'manual'];
const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function boundaryOf(mode, nowMs) {
  const local = new Date(nowMs + IST_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  if (mode === 'daily') return new Date(midnight - IST_MS);
  if (mode === 'weekly') {
    const sinceMonday = (local.getUTCDay() + 6) % 7;
    return new Date(midnight - sinceMonday * DAY_MS - IST_MS);
  }
  if (mode === 'month_close') return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST_MS);
  return null;
}

export async function syncOf(q, businessId) {
  const found = await q(
    `select b.ca_sync, s.as_of, s.shared_at, s.reason, s.version
       from businesses b left join shared_books s on s.business_id = b.id
      where b.id = $1`,
    [businessId],
  );
  const row = found.rows[0];
  if (!row) return null;
  return { mode: row.ca_sync, asOf: row.as_of, sharedAt: row.shared_at, reason: row.reason, version: row.version };
}

async function keep(q, businessId, books, { asOf, at, by = null, reason }) {
  await q(
    `insert into shared_books (business_id, version, state, as_of, shared_at, shared_by, reason)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7)
     on conflict (business_id) do update
       set version = excluded.version, state = excluded.state, as_of = excluded.as_of,
           shared_at = excluded.shared_at, shared_by = excluded.shared_by, reason = excluded.reason`,
    [businessId, books.version, JSON.stringify(books.state), asOf, at, by, reason],
  );
}

export async function refreshIfDue(q, businessId, books, nowMs) {
  const sync = await syncOf(q, businessId);
  if (!sync) return null;
  const boundary = boundaryOf(sync.mode, nowMs);
  if (!boundary) return sync;
  if (sync.asOf && sync.asOf.getTime() >= boundary.getTime()) return sync;
  await keep(q, businessId, books, { asOf: boundary, at: new Date(nowMs), reason: 'interval' });
  return { ...sync, asOf: boundary, reason: 'interval' };
}

export async function shareNow(q, businessId, books, userId, nowMs) {
  const at = new Date(nowMs);
  await keep(q, businessId, books, { asOf: at, at, by: userId, reason: 'manual' });
  return at;
}
