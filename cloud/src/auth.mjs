import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  hashToken,
  keyedHash,
  newRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.mjs';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_PER_ADDRESS_PER_HOUR = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID.test(String(value ?? ''));
}

export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/[\s()-]/g, '');
  const match = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return match ? `+91${match[1]}` : '';
}

function codeHash(salt, code) {
  return createHash('sha256').update(`${salt}:${code}`, 'utf8').digest();
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export async function issueTokens(q, userId, deviceId, secret, now = () => Date.now()) {
  const refreshToken = newRefreshToken();
  await q('insert into refresh_tokens (token_hash, device_id, created_at, expires_at) values ($1, $2, $3, $4)', [
    hashToken(refreshToken),
    deviceId,
    new Date(now()),
    new Date(now() + REFRESH_TTL_SECONDS * 1000),
  ]);
  return {
    accessToken: signAccessToken({ userId, deviceId }, secret, now()),
    refreshToken,
    expiresInSeconds: ACCESS_TTL_SECONDS,
  };
}

export function createAuth({ db, secret, otpSender, now = () => Date.now(), secondFactor = null }) {
  const at = () => new Date(now());

  async function session(q, user, deviceLabel) {
    const userId = user.id;
    if (secondFactor && await secondFactor.enabledFor(q, userId)) {
      return { ...(await secondFactor.challenge(q, userId, deviceLabel)), user: { id: userId, name: user.name, isNew: false } };
    }
    const device = await q('insert into devices (user_id, label, created_at, last_seen_at) values ($1, $2, $3, $3) returning id', [
      userId,
      String(deviceLabel).slice(0, 80),
      at(),
    ]);
    const tokens = await issueTokens(q, userId, device.rows[0].id, secret, now);
    return { ok: true, ...tokens, user: { id: userId, name: user.name, isNew: user.created } };
  }

  return {
    phoneEnabled: Boolean(otpSender),

    async requestOtp(phoneInput, address = '') {
      if (!otpSender) return fail('PHONE_SIGN_IN_UNAVAILABLE');
      const phone = normalizePhone(phoneInput);
      if (!phone) return fail('INVALID_PHONE');
      const phoneHash = keyedHash(secret, phone);
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const salt = randomBytes(16).toString('hex');
      const created = await db.tx(async (q) => {
        await q('select pg_advisory_xact_lock(hashtext($1))', [phoneHash]);
        const recent = await q('select count(*)::int as n from otp_challenges where phone_hash = $1 and created_at > $2', [
          phoneHash,
          new Date(now() - 60 * 60 * 1000),
        ]);
        if (recent.rows[0].n >= OTP_MAX_PER_HOUR) return null;
        if (address) {
          const fromAddress = await q('select count(*)::int as n from otp_challenges where requester = $1 and created_at > $2', [address, new Date(now() - 60 * 60 * 1000)]);
          if (fromAddress.rows[0].n >= OTP_MAX_PER_ADDRESS_PER_HOUR) return null;
        }
        await q('update otp_challenges set consumed_at = $2 where phone_hash = $1 and consumed_at is null', [phoneHash, at()]);
        const inserted = await q(
          'insert into otp_challenges (phone_hash, salt, code_hash, created_at, expires_at, requester) values ($1, $2, $3, $4, $5, $6) returning id',
          [phoneHash, salt, codeHash(salt, code).toString('hex'), at(), new Date(now() + OTP_TTL_SECONDS * 1000), address || null],
        );
        return inserted.rows[0].id;
      });
      if (!created) return fail('TOO_MANY_REQUESTS');
      await otpSender.send(phone, code);
      return { ok: true, challengeId: created, expiresInSeconds: OTP_TTL_SECONDS };
    },

    async verifyOtp({ challengeId, phone: phoneInput, code, deviceLabel = '' } = {}) {
      const phone = normalizePhone(phoneInput);
      if (!phone || !isUuid(challengeId) || !/^\d{6}$/.test(String(code ?? ''))) return fail('INVALID_CODE');
      return db.tx(async (q) => {
        const found = await q('select * from otp_challenges where id = $1 for update', [challengeId]);
        const challenge = found.rows[0];
        if (!challenge || challenge.phone_hash !== keyedHash(secret, phone)) return fail('INVALID_CODE');
        if (challenge.consumed_at) return fail('CODE_USED');
        if (challenge.expires_at.getTime() <= now()) return fail('CODE_EXPIRED');
        if (challenge.attempts >= OTP_MAX_ATTEMPTS) return fail('TOO_MANY_ATTEMPTS');
        await q('update otp_challenges set attempts = attempts + 1 where id = $1', [challengeId]);
        const expected = Buffer.from(challenge.code_hash, 'hex');
        const given = codeHash(challenge.salt, String(code));
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
          return fail('INVALID_CODE', { attemptsRemaining: OTP_MAX_ATTEMPTS - challenge.attempts - 1 });
        }
        await q('update otp_challenges set consumed_at = $2 where id = $1', [challengeId, at()]);
        const user = await q(
          `insert into users (phone, created_at) values ($1, $2)
           on conflict (phone) do update set deleted_at = null
           returning id, name, (xmax = 0) as created`,
          [phone, at()],
        );
        return session(q, user.rows[0], deviceLabel);
      });
    },

    async signInWithGoogle({ sub, email = '', name = '' }, deviceLabel = '') {
      return db.tx(async (q) => {
        const user = await q(
          `insert into users (google_sub, email, name, created_at) values ($1, nullif($2, ''), $3, $4)
           on conflict (google_sub) do update
             set deleted_at = null, email = coalesce(nullif(excluded.email, ''), users.email)
           returning id, name, (xmax = 0) as created`,
          [sub, email, name, at()],
        );
        return session(q, user.rows[0], deviceLabel);
      });
    },

    async signInWithOidc({ issuer, sub, email = '', name = '' }, deviceLabel = '') {
      return db.tx(async (q) => {
        const user = await q(
          `insert into users (oidc_issuer, oidc_sub, email, name, created_at) values ($1, $2, nullif($3, ''), $4, $5)
           on conflict (oidc_issuer, oidc_sub) do update
             set deleted_at = null, email = coalesce(nullif(excluded.email, ''), users.email)
           returning id, name, (xmax = 0) as created`,
          [issuer, sub, email, name, at()],
        );
        return session(q, user.rows[0], deviceLabel);
      });
    },

    async refresh(refreshToken) {
      if (typeof refreshToken !== 'string' || !refreshToken) return fail('INVALID_REFRESH_TOKEN');
      return db.tx(async (q) => {
        const found = await q(
          `select t.token_hash, t.expires_at, t.used_at, d.id as device_id, d.user_id, d.revoked_at, u.deleted_at
             from refresh_tokens t join devices d on d.id = t.device_id join users u on u.id = d.user_id
            where t.token_hash = $1 for update of t, d`,
          [hashToken(refreshToken)],
        );
        const row = found.rows[0];
        if (!row) return fail('INVALID_REFRESH_TOKEN');
        if (row.revoked_at || row.deleted_at) return fail('DEVICE_REVOKED');
        if (row.used_at) {
          await q('update devices set revoked_at = $2 where id = $1', [row.device_id, at()]);
          return fail('REFRESH_TOKEN_REUSED');
        }
        if (row.expires_at.getTime() <= now()) return fail('REFRESH_TOKEN_EXPIRED');
        await q('update refresh_tokens set used_at = $2 where token_hash = $1', [row.token_hash, at()]);
        await q('update devices set last_seen_at = $2 where id = $1', [row.device_id, at()]);
        return { ok: true, ...(await issueTokens(q, row.user_id, row.device_id, secret, now)) };
      });
    },

    async authenticate(accessToken) {
      const verified = verifyAccessToken(accessToken, secret, now());
      if (!verified.ok) return verified;
      if (!isUuid(verified.userId) || !isUuid(verified.deviceId)) return fail('MALFORMED_TOKEN');
      const found = await db.query(
        `select u.id, u.name, u.phone from devices d join users u on u.id = d.user_id
          where d.id = $1 and u.id = $2 and d.revoked_at is null and u.deleted_at is null`,
        [verified.deviceId, verified.userId],
      );
      if (!found.rowCount) return fail('DEVICE_REVOKED');
      return { ok: true, userId: verified.userId, deviceId: verified.deviceId, name: found.rows[0].name, phone: found.rows[0].phone };
    },

    async logout(deviceId) {
      await db.query('update devices set revoked_at = $2 where id = $1 and revoked_at is null', [deviceId, at()]);
      return { ok: true };
    },

    async setName(userId, name) {
      const clean = String(name ?? '').trim().slice(0, 80);
      if (!clean) return fail('NAME_REQUIRED');
      await db.query('update users set name = $2 where id = $1', [userId, clean]);
      return { ok: true, name: clean };
    },

    async deleteAccount(userId) {
      return db.tx(async (q) => {
        await q('update users set deleted_at = $2 where id = $1', [userId, at()]);
        await q('update devices set revoked_at = $2 where user_id = $1 and revoked_at is null', [userId, at()]);
        await q('delete from user_totp where user_id = $1', [userId]);
        await q('delete from recovery_codes where user_id = $1', [userId]);
        await q('delete from second_step_challenges where user_id = $1', [userId]);
        await q(
          `update businesses set deletion_requested_at = $2
            where deletion_requested_at is null
              and id in (select business_id from memberships where user_id = $1 and role = 'owner')
              and not exists (
                select 1 from memberships m join users u on u.id = m.user_id
                 where m.business_id = businesses.id and m.role = 'owner' and m.user_id <> $1 and u.deleted_at is null)`,
          [userId, at()],
        );
        return { ok: true };
      });
    },
  };
}

export function createCaptureSender() {
  const sent = [];
  return {
    sent,
    last: () => sent.at(-1),
    async send(phone, code) {
      sent.push({ phone, code });
    },
    async sendText(phone, text) {
      sent.push({ phone, text });
    },
  };
}

export function createConsoleSender(log = console.log) {
  return {
    async send(phone, code) {
      log(`[dev otp] ${phone.slice(0, 5)}*****${phone.slice(-2)} -> ${code}`);
    },
    async sendText(phone, text) {
      log(`[dev sms] ${phone.slice(0, 5)}*****${phone.slice(-2)} -> ${text}`);
    },
  };
}
