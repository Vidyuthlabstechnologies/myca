import { isUuid } from './auth.mjs';

const LIVE = 'exists (select 1 from refresh_tokens t where t.device_id = d.id and t.used_at is null and t.expires_at > $2)';

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function sameId(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

export function createDevices({ db, now = () => Date.now() }) {
  const at = () => new Date(now());

  return {
    async list(userId, currentDeviceId) {
      const found = await db.query(
        `select d.id, d.label, d.created_at, d.last_seen_at from devices d
          where d.user_id = $1 and d.revoked_at is null and ${LIVE}`,
        [userId, at()],
      );
      const devices = found.rows
        .map((row) => ({
          id: row.id,
          label: row.label,
          signedInOn: row.created_at.toISOString(),
          lastActive: row.last_seen_at.toISOString(),
          current: sameId(row.id, currentDeviceId),
        }))
        .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive) || a.id.localeCompare(b.id));
      return { ok: true, devices };
    },

    async revoke(userId, deviceId, currentDeviceId) {
      if (!isUuid(deviceId)) return fail('DEVICE_NOT_FOUND');
      if (sameId(deviceId, currentDeviceId)) return fail('CURRENT_DEVICE');
      const done = await db.query('update devices set revoked_at = $3 where id = $1 and user_id = $2 and revoked_at is null', [deviceId, userId, at()]);
      if (!done.rowCount) return fail('DEVICE_NOT_FOUND');
      return { ok: true };
    },

    async revokeOthers(userId, currentDeviceId) {
      return db.tx(async (q) => {
        const live = await q(`select count(*)::int as n from devices d where d.user_id = $1 and d.id <> $3 and d.revoked_at is null and ${LIVE}`, [userId, at(), currentDeviceId]);
        await q('update devices set revoked_at = $3 where user_id = $1 and id <> $2 and revoked_at is null', [userId, currentDeviceId, at()]);
        return { ok: true, revoked: live.rows[0].n };
      });
    },
  };
}
