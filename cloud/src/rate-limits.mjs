import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({
  signIn: { max: 60, windowSeconds: 600 },
  ask: { max: 120, windowSeconds: 3600 },
  crash: { max: 30, windowSeconds: 3600 },
  upload: { max: 200, windowSeconds: 3600 },
});

function keyOf(kind, who) {
  return `${kind}:${createHash('sha256').update(String(who)).digest('hex').slice(0, 32)}`;
}

export function createRateLimits({ db, now = () => Date.now(), limits = LIMITS }) {
  async function take(kind, who) {
    const rule = limits[kind];
    if (!rule || !who) return { ok: true };
    const windowMs = rule.windowSeconds * 1000;
    const start = Math.floor(now() / windowMs) * windowMs;
    const found = await db.query(
      `insert into rate_limits (key, window_start, hits) values ($1, $2, 1)
       on conflict (key, window_start) do update set hits = rate_limits.hits + 1
       returning hits`,
      [keyOf(kind, who), new Date(start)],
    );
    if (found.rows[0].hits <= rule.max) return { ok: true };
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now()) / 1000)) };
  }

  async function prune() {
    const longest = Math.max(...Object.values(limits).map((rule) => rule.windowSeconds)) * 1000;
    return (await db.query('delete from rate_limits where window_start < $1', [new Date(now() - 2 * longest)])).rowCount;
  }

  return { take, prune };
}
