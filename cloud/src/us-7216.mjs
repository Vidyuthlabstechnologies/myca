import { createHash } from 'node:crypto';
import { partnerSettings } from '../../platform/src/us-filing-partner.mjs';

export const US_PREPARER_NAME = '[the US company, to be confirmed before release]';
export const PARTNER_TINS = 'us-7216-partner-tins';
export const EXPERT_REVIEW = 'us-7216-expert-review';
export const PLUS_USE = 'us-7216-plus-use';
export const US_7216_VERSION = 'us-7216-draft-2026-11-14';
const UNNAMED_PARTNER = '[Column Tax or April, to be confirmed]';
const UNNAMED_EXPERT = '[the CPA or enrolled agent firm, to be named when the Expert Review partner is signed]';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 3 * 366;
const NAME = /\p{L}/u;

export const DISCLOSE_OUTSIDE_PREPARATION = [
  'Federal law requires this consent form be provided to you. Unless authorized by law, we cannot disclose your tax return information to third parties for purposes other than the preparation and filing of your tax return without your consent. If you consent to the disclosure of your tax return information, Federal law may not protect your tax return information from further use or distribution.',
  'You are not required to complete this form to engage our tax return preparation services. If we obtain your signature on this form by conditioning our tax return preparation services on your consent, your consent will not be valid. If you agree to the disclosure of your tax return information, your consent is valid for the amount of time that you specify. If you do not specify the duration of your consent, your consent is valid for one year from the date of signature.',
];

export const DISCLOSE_FOR_PREPARATION = [
  'Federal law requires this consent form be provided to you. Unless authorized by law, we cannot disclose your tax return information to third parties for purposes other than those related to the preparation and filing of your tax return without your consent. If you consent to the disclosure of your tax return information, Federal law may not protect your tax return information from further use or distribution.',
  'You are not required to complete this form. Because our ability to disclose your tax return information to another tax return preparer affects the tax return preparation service(s) that we provide to you and its (their) cost, we may decline to provide you with tax return preparation services or change the terms (including the cost) of the tax return preparation services that we provide to you if you do not sign this form. If you agree to the disclosure of your tax return information, your consent is valid for the amount of time that you specify. If you do not specify the duration of your consent, your consent is valid for one year from the date of signature.',
];

export const USE_STATEMENTS = [
  'Federal law requires this consent form be provided to you. Unless authorized by law, we cannot use your tax return information for purposes other than the preparation and filing of your tax return without your consent.',
  'You are not required to complete this form to engage our tax return preparation services. If we obtain your signature on this form by conditioning our tax return preparation services on your consent, your consent will not be valid. Your consent is valid for the amount of time that you specify. If you do not specify the duration of your consent, your consent is valid for one year from the date of signature.',
];

export const TIGTA_STATEMENT = 'If you believe your tax return information has been disclosed or used improperly in a manner unauthorized by law or without your permission, you may contact the Treasury Inspector General for Tax Administration (TIGTA) by telephone at 1-800-366-4484, or by email at complaints@tigta.treas.gov.';

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
}

export function usConsentForms({ partner = partnerSettings() } = {}) {
  const partnerName = partner?.label || UNNAMED_PARTNER;
  return [
    {
      document: PARTNER_TINS,
      version: `${US_7216_VERSION}.${slug(partner?.provider)}`,
      kind: 'disclose',
      enforced: true,
      title: 'Consent to disclose your Social Security numbers to our e-file partner',
      body: [
        ...DISCLOSE_OUTSIDE_PREPARATION,
        `What you allow: ${US_PREPARER_NAME} may disclose to ${partnerName}, the IRS-authorized e-file provider that signs Form 8879 with you and sends your return to the IRS, the Social Security numbers and ITINs on the federal return you prepare in MyCA: yours, and your spouse's and dependents' if they are on the return.`,
        `Why: so that ${partnerName} can fill them in on its filing screen and you do not type them again. Nothing else is disclosed under this consent. If you do not sign it you can still file: you type the numbers on ${partnerName}'s screen yourself.`,
        TIGTA_STATEMENT,
      ],
    },
    {
      document: EXPERT_REVIEW,
      version: US_7216_VERSION,
      kind: 'disclose',
      enforced: false,
      title: 'Consent to disclose your return for Expert Review',
      body: [
        ...DISCLOSE_FOR_PREPARATION,
        `What you allow: ${US_PREPARER_NAME} may disclose to ${UNNAMED_EXPERT} the federal return you prepare in MyCA, with the forms and answers it was made from, but not your full Social Security numbers, which are shown to the reviewer only as the last four digits.`,
        'Why: so that a credentialed tax professional can review the return and advise you before you file. You can ask us to disclose less, for example only some forms.',
        TIGTA_STATEMENT,
      ],
    },
    {
      document: PLUS_USE,
      version: US_7216_VERSION,
      kind: 'use',
      enforced: false,
      title: 'Consent to use your filed return for MyCA Plus',
      body: [
        ...USE_STATEMENTS,
        `What you allow: ${US_PREPARER_NAME} may use the federal return you filed through MyCA, and the forms and answers it was made from, to give you the MyCA Plus services you ask for: reading an IRS letter and checking it against your return, checking your withholding, and working out estimated tax payments.`,
        'We do not use it to offer you any other product, and we do not disclose it to anyone under this consent.',
        TIGTA_STATEMENT,
      ],
    },
  ];
}

export function formHasBlanks(form) {
  return /\[[^\]]+\]/.test([form.title, ...form.body].join('\n'));
}

export function renderConsent(form, { signedName = '', signedAt = '', validUntil = '' } = {}) {
  const lines = [form.title, '', `Tax return preparer: ${US_PREPARER_NAME}`, `Taxpayer: ${signedName || 'the person who signs below'}`, '', ...form.body.flatMap((p) => [p, ''])];
  lines.push(`This consent is valid until ${validUntil || 'the date you choose, or one year from the date you sign if you do not choose one'}.`);
  if (signedName) lines.push(`Signed electronically by typing the name "${signedName}" on ${signedAt}.`);
  return lines.join('\n');
}

function dayOnly(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function consentPeriod(validUntil, nowMs) {
  if (validUntil === undefined || validUntil === null || validUntil === '') return { ok: true, until: nowMs + 365 * DAY_MS };
  const text = String(validUntil);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: 'CONSENT_DATE_INVALID' };
  const end = Date.parse(`${text}T23:59:59.999Z`);
  if (!Number.isFinite(end) || dayOnly(end) !== text) return { ok: false, error: 'CONSENT_DATE_INVALID' };
  if (end <= nowMs) return { ok: false, error: 'CONSENT_DATE_PAST' };
  if (end - nowMs > MAX_DAYS * DAY_MS) return { ok: false, error: 'CONSENT_TOO_LONG', hint: 'Choose a date within three years.' };
  return { ok: true, until: end };
}

export function createUsConsents({ db, now = () => Date.now(), environment = 'local', forms = () => usConsentForms() }) {
  const formFor = (document) => forms().find((form) => form.document === document) || null;

  async function current(userId, form) {
    const found = await db.query(
      `select signed_at, valid_until from us_7216_consents
        where user_id = $1 and document = $2 and version = $3 and revoked_at is null and valid_until > $4
        order by signed_at desc limit 1`,
      [userId, form.document, form.version, new Date(now())],
    );
    const row = found.rows[0];
    return row ? { signedAt: row.signed_at.toISOString(), validUntil: row.valid_until.toISOString() } : null;
  }

  async function audit(q, userId, action, metadata) {
    await q(
      `insert into audit_log (business_id, user_id, request_id, action, metadata)
       select business_id, $1, '', $2, $3::jsonb from memberships where user_id = $1 and role = 'owner'`,
      [userId, action, JSON.stringify(metadata)],
    );
  }

  return {
    async list(userId) {
      const out = [];
      for (const form of forms()) {
        out.push({ document: form.document, version: form.version, kind: form.kind, title: form.title, preparer: US_PREPARER_NAME, body: form.body, text: renderConsent(form), final: !formHasBlanks(form), signed: await current(userId, form) });
      }
      return { ok: true, consents: out };
    },

    async valid(userId, document) {
      const form = formFor(document);
      return Boolean(form && (await current(userId, form)));
    },

    async sign(userId, deviceId, body = {}) {
      const form = formFor(String(body.document || ''));
      if (!form) return { ok: false, error: 'CONSENT_UNKNOWN' };
      if (body.version !== form.version) return { ok: false, error: 'CONSENT_CHANGED', version: form.version };
      if (environment === 'production' && formHasBlanks(form)) return { ok: false, error: 'CONSENT_NOT_FINAL', hint: 'This consent cannot be signed until every name on it is filled in.' };
      const signedName = String(body.signedName ?? '').replace(/\s+/g, ' ').trim();
      if (signedName.length < 2 || signedName.length > 120 || !NAME.test(signedName)) return { ok: false, error: 'SIGNATURE_REQUIRED', hint: 'Type your full name to sign.' };
      const at = now();
      const period = consentPeriod(body.validUntil, at);
      if (!period.ok) return period;
      const signedAt = new Date(at).toISOString();
      const validUntil = new Date(period.until).toISOString();
      const text = renderConsent(form, { signedName, signedAt, validUntil: validUntil.slice(0, 10) });
      const textSha256 = createHash('sha256').update(text).digest('hex');
      await db.tx(async (q) => {
        await q('update us_7216_consents set revoked_at = $3 where user_id = $1 and document = $2 and revoked_at is null', [userId, form.document, new Date(at)]);
        await q(
          `insert into us_7216_consents (user_id, document, version, kind, signed_name, text_sha256, consent_text, device_id, signed_at, valid_until)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [userId, form.document, form.version, form.kind, signedName, textSha256, text, deviceId || null, new Date(at), new Date(period.until)],
        );
        await audit(q, userId, 'us_7216.consent_signed', { document: form.document, version: form.version, validUntil, textSha256 });
      });
      return { ok: true, document: form.document, version: form.version, signedAt, validUntil, textSha256, text };
    },

    async revoke(userId, document) {
      const form = formFor(String(document || ''));
      if (!form) return { ok: false, error: 'CONSENT_UNKNOWN' };
      const at = new Date(now());
      return db.tx(async (q) => {
        const done = await q('update us_7216_consents set revoked_at = $3 where user_id = $1 and document = $2 and revoked_at is null', [userId, form.document, at]);
        if (done.rowCount) await audit(q, userId, 'us_7216.consent_revoked', { document: form.document });
        return { ok: true, document: form.document, revoked: done.rowCount > 0 };
      });
    },
  };
}
