import { randomBytes } from 'node:crypto';

export const PRIVACY_REQUEST_KINDS = Object.freeze(['access', 'correction', 'erasure', 'withdraw', 'nominate', 'grievance']);
export const PRIVACY_REPLY_DAYS = 30;
export const PRIVACY_REQUEST_KEEP_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OPEN_PER_USER = 10;

const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

const SELF_SERVICE = Object.freeze({
  access: 'Businesses screen, then Download everything, gives you every record MyCA holds for a business at once.',
  correction: 'You can change your name under Settings, and every entry in your books can be edited by its owner.',
  erasure: 'Settings, then Delete my account, erases your account thirty days later; a business can be deleted from the Businesses screen.',
  withdraw: 'Deleting your account withdraws your consent. Withdrawing does not affect what was done before.',
  nominate: '',
  grievance: '',
});

function shape(row) {
  return {
    reference: row.reference,
    kind: row.kind,
    status: row.status,
    message: row.message,
    reply: row.reply,
    createdAt: new Date(row.created_at).toISOString(),
    dueAt: new Date(row.due_at).toISOString(),
    answeredAt: row.answered_at ? new Date(row.answered_at).toISOString() : null,
  };
}

export function createPrivacyRequests({ db, now = () => Date.now() }) {
  async function create(userId, body = {}) {
    const kind = String(body.kind || '');
    if (!PRIVACY_REQUEST_KINDS.includes(kind)) return { ok: false, error: 'UNKNOWN_REQUEST_KIND', kinds: PRIVACY_REQUEST_KINDS };
    const message = clip(body.message, 2000);
    const nomineeName = kind === 'nominate' ? clip(body.nomineeName, 120) : '';
    const nomineeContact = kind === 'nominate' ? clip(body.nomineeContact, 120) : '';
    if (kind === 'nominate' && (!nomineeName || !nomineeContact)) return { ok: false, error: 'NOMINEE_REQUIRED', hint: 'Give the name and a phone number or email of the person you nominate.' };
    if ((kind === 'grievance' || kind === 'correction') && !message) return { ok: false, error: 'MESSAGE_REQUIRED', hint: 'Tell us what went wrong or what should be corrected.' };
    const open = await db.query("select count(*)::int as n from privacy_requests where user_id = $1 and status = 'open'", [userId]);
    if (open.rows[0].n >= MAX_OPEN_PER_USER) return { ok: false, error: 'TOO_MANY_OPEN_REQUESTS', hint: 'You already have ten open requests. We will answer those first.' };
    const at = new Date(now());
    const reference = `DPR-${at.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const { rows } = await db.query(
      `insert into privacy_requests (reference, user_id, kind, message, nominee_name, nominee_contact, created_at, due_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [reference, userId, kind, message, nomineeName, nomineeContact, at, new Date(at.getTime() + PRIVACY_REPLY_DAYS * DAY_MS)],
    );
    return { ok: true, request: shape(rows[0]), selfService: SELF_SERVICE[kind] || undefined, replyWithinDays: PRIVACY_REPLY_DAYS };
  }

  async function mine(userId) {
    const { rows } = await db.query('select * from privacy_requests where user_id = $1 order by created_at desc limit 50', [userId]);
    return { ok: true, requests: rows.map(shape), replyWithinDays: PRIVACY_REPLY_DAYS };
  }

  async function queue({ openOnly = true } = {}) {
    const { rows } = await db.query(
      `select * from privacy_requests ${openOnly ? "where status = 'open'" : ''} order by due_at limit 200`,
    );
    const at = now();
    return { ok: true, requests: rows.map((row) => ({ ...shape(row), userId: row.user_id, nomineeName: row.nominee_name, nomineeContact: row.nominee_contact, overdue: row.status === 'open' && new Date(row.due_at).getTime() < at })) };
  }

  async function answer(reference, body = {}) {
    const status = String(body.status || 'answered');
    if (!['answered', 'closed'].includes(status)) return { ok: false, error: 'UNKNOWN_STATUS' };
    const reply = clip(body.reply, 4000);
    if (!reply) return { ok: false, error: 'REPLY_REQUIRED' };
    const { rows } = await db.query(
      'update privacy_requests set status = $2, reply = $3, answered_at = $4 where reference = $1 returning *',
      [String(reference || ''), status, reply, new Date(now())],
    );
    if (!rows.length) return { ok: false, error: 'REQUEST_NOT_FOUND' };
    return { ok: true, request: shape(rows[0]) };
  }

  async function overdue() {
    const { rows } = await db.query("select count(*)::int as n from privacy_requests where status = 'open' and due_at < $1", [new Date(now())]);
    return rows[0].n;
  }

  return { create, mine, queue, answer, overdue };
}
