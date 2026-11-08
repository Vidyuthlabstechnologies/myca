import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from 'node:crypto';
import { isUuid, issueTokens, plainText } from './auth.mjs';
import { keyedHash } from './tokens.mjs';
import { base32Decode, base32Encode, otpauthUri, verifyTotp } from './totp.mjs';

export const SECOND_STEP_TTL_SECONDS = 300;
export const SECOND_STEP_MAX_ATTEMPTS = 5;
export const ENROL_MAX_ATTEMPTS = 5;
export const CHANGE_MAX_ATTEMPTS = 5;
export const CHANGE_COOL_DOWN_SECONDS = 15 * 60;
export const RECOVERY_CODES = 8;
export const RECOVERY_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RECOVERY_CODE_LENGTH = 10;
const SECRET_BYTES = 20;
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_INFO = 'myca-user-totp';
const TOTP_SHAPE = /^\d{6}$/;
const RECOVERY_SHAPE = /^[a-z0-9]{10}$/;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function normaliseCode(input) {
  return plainText(input).replace(/[\s-]/g, '').toLowerCase();
}

export function formatRecoveryCode(code) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function newRecoveryCode() {
  let out = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) out += RECOVERY_CODE_ALPHABET[randomInt(0, RECOVERY_CODE_ALPHABET.length)];
  return out;
}

export function createSecondFactor({ db, secret, booksKey = '', now = () => Date.now() }) {
  const at = () => new Date(now());

  function userKey(userId) {
    return Buffer.from(hkdfSync('sha256', booksKey, String(userId), KEY_INFO, 32));
  }

  function sealSecret(userId, text) {
    if (!booksKey) return text;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, userKey(userId), iv);
    const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return `${VERSION}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
  }

  function openSecret(userId, value) {
    if (typeof value !== 'string' || !value.startsWith(`${VERSION}.`)) return value;
    if (!booksKey) throw Object.assign(new Error('the authenticator key is sealed and the service has no MYCA_BOOKS_KEY'), { code: 'BOOKS_KEY_MISSING' });
    const [, iv, tag, body] = value.split('.');
    try {
      const decipher = createDecipheriv(ALGORITHM, userKey(userId), Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw Object.assign(new Error('the authenticator key could not be opened with this key'), { code: 'BOOKS_KEY_WRONG' });
    }
  }

  function secretOf(userId, row) {
    return base32Decode(openSecret(userId, row.secret_sealed));
  }

  async function codesLeft(q, userId) {
    const found = await q('select count(*)::int as n from recovery_codes where user_id = $1 and used_at is null', [userId]);
    return found.rows[0].n;
  }

  async function replaceRecoveryCodes(q, userId) {
    await q('delete from recovery_codes where user_id = $1', [userId]);
    const codes = [];
    while (codes.length < RECOVERY_CODES) {
      const code = newRecoveryCode();
      if (!codes.includes(code)) codes.push(code);
    }
    for (const code of codes) {
      await q('insert into recovery_codes (user_id, code_hash, created_at) values ($1, $2, $3)', [userId, keyedHash(secret, code), at()]);
    }
    return codes.map(formatRecoveryCode);
  }

  async function check(q, userId, input) {
    const code = normaliseCode(input);
    const found = await q('select secret_sealed, enabled_at, last_step from user_totp where user_id = $1 for update', [userId]);
    const row = found.rows[0];
    if (!row || !row.enabled_at) return fail('NOT_ENABLED');
    if (TOTP_SHAPE.test(code)) {
      const key = secretOf(userId, row);
      const lastStep = Number(row.last_step);
      const verified = verifyTotp(key, code, now(), { lastStep });
      if (!verified.ok) return fail(verifyTotp(key, code, now(), { lastStep: lastStep - 1 }).ok ? 'CODE_USED' : 'INVALID_CODE');
      await q('update user_totp set last_step = $2 where user_id = $1', [userId, verified.step]);
      return { ok: true, usedRecoveryCode: false };
    }
    if (RECOVERY_SHAPE.test(code)) {
      const used = await q('update recovery_codes set used_at = $3 where user_id = $1 and code_hash = $2 and used_at is null', [userId, keyedHash(secret, code), at()]);
      if (used.rowCount) return { ok: true, usedRecoveryCode: true };
    }
    return fail('INVALID_CODE');
  }

  async function clearTries(q, userId) {
    await q('update user_totp set attempts = 0, failed_at = null where user_id = $1', [userId]);
  }

  async function checkForChange(q, userId, input) {
    const found = await q('select enabled_at, attempts, failed_at from user_totp where user_id = $1 for update', [userId]);
    const row = found.rows[0];
    if (!row || !row.enabled_at) return fail('NOT_ENABLED');
    const spent = row.attempts >= CHANGE_MAX_ATTEMPTS;
    if (spent && row.failed_at && row.failed_at.getTime() + CHANGE_COOL_DOWN_SECONDS * 1000 > now()) return fail('TOO_MANY_ATTEMPTS');
    const tried = spent ? 0 : row.attempts;
    const checked = await check(q, userId, input);
    if (checked.ok) {
      await clearTries(q, userId);
      return checked;
    }
    await q('update user_totp set attempts = $2, failed_at = $3 where user_id = $1', [userId, tried + 1, at()]);
    return { ...checked, attemptsRemaining: CHANGE_MAX_ATTEMPTS - tried - 1 };
  }

  return {
    sealSecret,
    openSecret,

    async enabledFor(q, userId) {
      const found = await q('select 1 from user_totp where user_id = $1 and enabled_at is not null', [userId]);
      return found.rowCount > 0;
    },

    async status(userId) {
      const found = await db.query('select enabled_at from user_totp where user_id = $1', [userId]);
      const row = found.rows[0];
      const enabled = Boolean(row && row.enabled_at);
      return {
        ok: true,
        enabled,
        enabledAt: enabled ? row.enabled_at.toISOString() : null,
        recoveryCodesLeft: enabled ? await codesLeft(db.query, userId) : 0,
      };
    },

    async begin(userId) {
      return db.tx(async (q) => {
        const found = await q('select enabled_at from user_totp where user_id = $1 for update', [userId]);
        if (found.rows[0] && found.rows[0].enabled_at) return fail('ALREADY_ENABLED');
        const secretBase32 = base32Encode(randomBytes(SECRET_BYTES));
        await q(
          `insert into user_totp (user_id, secret_sealed, attempts, enabled_at, last_step, created_at) values ($1, $2, 0, null, 0, $3)
           on conflict (user_id) do update set secret_sealed = excluded.secret_sealed, attempts = 0, enabled_at = null, last_step = 0, created_at = excluded.created_at`,
          [userId, sealSecret(userId, secretBase32), at()],
        );
        const user = (await q('select id, phone, email from users where id = $1', [userId])).rows[0];
        const account = user.phone || user.email || user.id;
        return { ok: true, secret: secretBase32, uri: otpauthUri({ account, secretBase32 }), account };
      });
    },

    async confirm(userId, input) {
      const code = normaliseCode(input);
      return db.tx(async (q) => {
        const found = await q('select secret_sealed, attempts, enabled_at from user_totp where user_id = $1 for update', [userId]);
        const row = found.rows[0];
        if (!row || row.enabled_at) return fail('NOT_ENROLLING');
        const verified = TOTP_SHAPE.test(code) ? verifyTotp(secretOf(userId, row), code, now()) : { ok: false };
        if (!verified.ok) {
          if (row.attempts + 1 >= ENROL_MAX_ATTEMPTS) {
            await q('delete from user_totp where user_id = $1', [userId]);
            return fail('ENROLMENT_RESTART');
          }
          await q('update user_totp set attempts = attempts + 1 where user_id = $1', [userId]);
          return fail('INVALID_CODE', { attemptsRemaining: ENROL_MAX_ATTEMPTS - row.attempts - 1 });
        }
        await q('update user_totp set enabled_at = $2, last_step = $3, attempts = 0 where user_id = $1', [userId, at(), verified.step]);
        return { ok: true, recoveryCodes: await replaceRecoveryCodes(q, userId) };
      });
    },

    async disable(userId, code) {
      return db.tx(async (q) => {
        const checked = await checkForChange(q, userId, code);
        if (!checked.ok) return checked;
        await q('delete from user_totp where user_id = $1', [userId]);
        await q('delete from recovery_codes where user_id = $1', [userId]);
        return { ok: true };
      });
    },

    async regenerateRecoveryCodes(userId, code) {
      return db.tx(async (q) => {
        const checked = await checkForChange(q, userId, code);
        if (!checked.ok) return checked;
        return { ok: true, recoveryCodes: await replaceRecoveryCodes(q, userId) };
      });
    },

    async challenge(q, userId, deviceLabel = '') {
      const inserted = await q(
        'insert into second_step_challenges (user_id, device_label, created_at, expires_at) values ($1, $2, $3, $4) returning id',
        [userId, String(deviceLabel ?? '').slice(0, 80), at(), new Date(now() + SECOND_STEP_TTL_SECONDS * 1000)],
      );
      return { ok: true, secondStep: true, challengeId: inserted.rows[0].id, expiresInSeconds: SECOND_STEP_TTL_SECONDS };
    },

    async complete({ challengeId, code: input, deviceLabel = '' } = {}) {
      const code = normaliseCode(input);
      if (!isUuid(challengeId) || !(TOTP_SHAPE.test(code) || RECOVERY_SHAPE.test(code))) return fail('INVALID_CODE');
      return db.tx(async (q) => {
        const found = await q('select * from second_step_challenges where id = $1 for update', [challengeId]);
        const challenge = found.rows[0];
        if (!challenge) return fail('CODE_EXPIRED');
        if (challenge.consumed_at) return fail('CODE_USED');
        if (challenge.expires_at.getTime() <= now()) return fail('CODE_EXPIRED');
        if (challenge.attempts >= SECOND_STEP_MAX_ATTEMPTS) return fail('TOO_MANY_ATTEMPTS');
        await q('update second_step_challenges set attempts = attempts + 1 where id = $1', [challengeId]);
        const checked = await check(q, challenge.user_id, code);
        if (!checked.ok) {
          return fail(checked.error === 'CODE_USED' ? 'CODE_USED' : 'INVALID_CODE', { attemptsRemaining: SECOND_STEP_MAX_ATTEMPTS - challenge.attempts - 1 });
        }
        await clearTries(q, challenge.user_id);
        await q('update second_step_challenges set consumed_at = $2 where id = $1', [challengeId, at()]);
        const user = (await q('select id, name from users where id = $1 and deleted_at is null', [challenge.user_id])).rows[0];
        if (!user) return fail('INVALID_CODE');
        const device = await q('insert into devices (user_id, label, created_at, last_seen_at) values ($1, $2, $3, $3) returning id', [
          user.id,
          String(deviceLabel || challenge.device_label || '').slice(0, 80),
          at(),
        ]);
        const tokens = await issueTokens(q, user.id, device.rows[0].id, secret, now);
        return {
          ok: true,
          ...tokens,
          user: { id: user.id, name: user.name, isNew: false },
          usedRecoveryCode: checked.usedRecoveryCode,
          recoveryCodesLeft: await codesLeft(q, user.id),
        };
      });
    },
  };
}
