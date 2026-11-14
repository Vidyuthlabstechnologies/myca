import { randomInt } from 'node:crypto';

export const FUNNELS = Object.freeze({
  india: Object.freeze(['signed_in', 'business_created', 'first_entry', 'plan_viewed', 'trial_started', 'paid']),
  us: Object.freeze(['signed_in', 'return_started', 'documents_added', 'return_reviewed', 'plan_viewed', 'paid', 'filed']),
});
export const OTHER_STEPS = Object.freeze(['tour_finished', 'referral_shared', 'team_invited', 'referral_claimed']);
export const MAX_STEPS_PER_REQUEST = 10;
export const REFERRAL_CLAIM_DAYS = 30;
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;

const EDITIONS = new Set(Object.keys(FUNNELS));
const CLIENT_STEPS = new Set([...FUNNELS.india, ...FUNNELS.us, ...OTHER_STEPS.filter((step) => step !== 'referral_claimed')]);
const SOURCE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const DAY_MS = 86400000;

export function cleanStep(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'BAD_STEP' };
  const step = String(raw.step || '');
  if (!CLIENT_STEPS.has(step)) return { ok: false, error: 'UNKNOWN_STEP' };
  const edition = String(raw.edition || 'india');
  if (!EDITIONS.has(edition)) return { ok: false, error: 'BAD_EDITION' };
  const source = raw.source === undefined || raw.source === null || raw.source === '' ? '' : String(raw.source).toLowerCase();
  if (source && !SOURCE.test(source)) return { ok: false, error: 'BAD_SOURCE' };
  return { ok: true, step: { step, edition, source } };
}

export function normalizeCode(value) {
  const code = String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return '';
  for (const char of code) if (!CODE_ALPHABET.includes(char)) return '';
  return code;
}

function newCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function rate(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function referralLink(siteUrl, code) {
  const base = String(siteUrl || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/?#]+$/.test(base)) return null;
  return `${base}/r/${code}`;
}

export function createGrowth({ db, now = () => Date.now(), siteUrl = '', reward = '' }) {
  async function mark(userId, { step, edition, source }) {
    const at = new Date(now());
    await db.query(
      `insert into funnel_steps (user_id, step, edition, source, first_at, last_at, hits)
       values ($1, $2, $3, $4, $5, $5, 1)
       on conflict (user_id, step) do update
         set last_at = excluded.last_at,
             hits = least(funnel_steps.hits + 1, 1000000)`,
      [userId, step, edition, source, at],
    );
    if (step === 'paid') {
      await db.query('update referrals set converted_at = $2 where referred_user_id = $1 and converted_at is null', [userId, at]);
    }
  }

  async function codeFor(userId) {
    const found = await db.query('select code from referral_codes where user_id = $1', [userId]);
    if (found.rowCount) return found.rows[0].code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const saved = await db.query(
        `insert into referral_codes (user_id, code, created_at) values ($1, $2, $3)
         on conflict do nothing returning code`,
        [userId, newCode(), new Date(now())],
      );
      if (saved.rowCount) return saved.rows[0].code;
      const raced = await db.query('select code from referral_codes where user_id = $1', [userId]);
      if (raced.rowCount) return raced.rows[0].code;
    }
    throw new Error('could not allocate a referral code');
  }

  return {
    funnels: FUNNELS,

    async record(userId, body) {
      const list = Array.isArray(body?.steps) ? body.steps : null;
      if (!list || !list.length) return { ok: false, error: 'NO_STEPS' };
      if (list.length > MAX_STEPS_PER_REQUEST) return { ok: false, error: 'TOO_MANY_STEPS', max: MAX_STEPS_PER_REQUEST };
      const cleaned = list.map(cleanStep);
      const accepted = cleaned.filter((item) => item.ok).map((item) => item.step);
      for (const step of accepted) await mark(userId, step);
      return { ok: true, accepted: accepted.length, refused: cleaned.length - accepted.length };
    },

    async referral(userId) {
      const code = await codeFor(userId);
      const counts = await db.query(
        `select count(*)::int as invited, count(converted_at)::int as converted
           from referrals where referrer_user_id = $1`,
        [userId],
      );
      return {
        ok: true,
        code,
        link: referralLink(siteUrl, code),
        invited: counts.rows[0].invited,
        converted: counts.rows[0].converted,
        reward: reward || null,
      };
    },

    async claim(userId, body) {
      const code = normalizeCode(body?.code);
      if (!code) return { ok: false, error: 'BAD_CODE' };
      return db.tx(async (q) => {
        const me = await q('select created_at from users where id = $1 for update', [userId]);
        if (!me.rowCount) return { ok: false, error: 'USER_NOT_FOUND' };
        const already = await q('select 1 from referrals where referred_user_id = $1', [userId]);
        if (already.rowCount) return { ok: false, error: 'ALREADY_CLAIMED' };
        if (now() - new Date(me.rows[0].created_at).getTime() > REFERRAL_CLAIM_DAYS * DAY_MS) {
          return { ok: false, error: 'CLAIM_WINDOW_CLOSED', days: REFERRAL_CLAIM_DAYS };
        }
        const owner = await q('select rc.user_id from referral_codes rc join users u on u.id = rc.user_id where rc.code = $1 and u.deleted_at is null', [code]);
        if (!owner.rowCount) return { ok: false, error: 'CODE_NOT_FOUND' };
        const referrer = owner.rows[0].user_id;
        if (referrer === userId) return { ok: false, error: 'OWN_CODE' };
        const at = new Date(now());
        const paid = await q("select 1 from funnel_steps where user_id = $1 and step = 'paid'", [userId]);
        await q('insert into referrals (referred_user_id, referrer_user_id, claimed_at, converted_at) values ($1, $2, $3, $4)', [userId, referrer, at, paid.rowCount ? at : null]);
        await q(
          `insert into funnel_steps (user_id, step, edition, source, first_at, last_at, hits)
           values ($1, 'referral_claimed', 'india', 'referral', $2, $2, 1)
           on conflict (user_id, step) do nothing`,
          [userId, at],
        );
        return { ok: true };
      });
    },

    async digest({ sinceMs, edition = 'india' }) {
      if (!EDITIONS.has(edition)) return { ok: false, error: 'BAD_EDITION' };
      const since = new Date(sinceMs);
      const { rows } = await db.query(
        `with cohort as (
           select user_id from funnel_steps where step = 'signed_in' and edition = $1 and first_at >= $2
         )
         select f.step, count(distinct f.user_id)::int as users
           from funnel_steps f join cohort c on c.user_id = f.user_id
          group by f.step`,
        [edition, since],
      );
      const reached = Object.fromEntries(rows.map((row) => [row.step, row.users]));
      const funnel = FUNNELS[edition];
      const first = reached[funnel[0]] || 0;
      const steps = funnel.map((step, index) => {
        const users = reached[step] || 0;
        const previous = index === 0 ? users : reached[funnel[index - 1]] || 0;
        return { step, users, fromPrevious: index === 0 ? null : rate(users, previous), fromStart: rate(users, first) };
      });
      const sources = await db.query(
        `select s.source, count(*)::int as "signedIn", count(p.user_id)::int as paid
           from funnel_steps s
           left join funnel_steps p on p.user_id = s.user_id and p.step = 'paid'
          where s.step = 'signed_in' and s.edition = $1 and s.first_at >= $2
          group by s.source order by count(*) desc limit 50`,
        [edition, since],
      );
      const referrals = await db.query(
        `select count(*)::int as claimed, count(converted_at)::int as converted
           from referrals where claimed_at >= $1`,
        [since],
      );
      const extras = Object.fromEntries(OTHER_STEPS.map((step) => [step, reached[step] || 0]));
      return {
        ok: true,
        edition,
        steps,
        other: extras,
        sources: sources.rows.map((row) => ({ source: row.source || 'direct', signedIn: row.signedIn, paid: row.paid, conversion: rate(row.paid, row.signedIn) })),
        referrals: { ...referrals.rows[0], conversion: rate(referrals.rows[0].converted, referrals.rows[0].claimed) },
      };
    },
  };
}
