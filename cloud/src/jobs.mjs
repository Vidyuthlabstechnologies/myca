import { timingSafeEqual } from 'node:crypto';
import { keyedHash } from './tokens.mjs';
import { DEMO_INACTIVE_DAYS } from './demo.mjs';
import { usRecordsHeldUntil } from './us-retention.mjs';
import { PRIVACY_REQUEST_KEEP_DAYS } from './privacy-requests.mjs';

export const JOB_HEADER = 'x-myca-job-token';
const MIN_TOKEN_LENGTH = 32;

export function jobTokenMatches(configured, given) {
  if (!configured || configured.length < MIN_TOKEN_LENGTH) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const DELETION_GRACE_DAYS = 30;
export const ACCESS_LOG_DAYS = 365;
export const CRASH_REPORT_DAYS = 90;
export const OTP_CHALLENGE_DAYS = 1;
export const WHATSAPP_MESSAGE_DAYS = 30;

export function createJobs({ db, secret = '', rateLimits = null, withBooks, readBooks = null, connectors = null, syncChannels = null, pullsEnabled = () => false, sender = null, vault = null, billing = null, now = () => Date.now(), log = () => {} }) {
  async function recordsHeldUntil(businessId, requestId) {
    if (!readBooks) return null;
    try {
      return await readBooks(businessId, { requestId, userId: null, deviceId: null }, (session) => usRecordsHeldUntil(session.state));
    } catch (err) {
      if (err && (err.statusCode === 404 || err.body?.error === 'BUSINESS_NOT_FOUND')) return null;
      throw err;
    }
  }

  async function purge(requestId) {
    const summary = { businesses: 0, held: 0, users: 0, documents: 0, objects: 0, accessRows: 0, crashRows: 0, otpRows: 0, secondStepRows: 0, failed: [] };
    const cutoff = new Date(now() - DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const idleSince = new Date(now() - DEMO_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
    const idle = await db.query(
      `update businesses b set deletion_requested_at = $2
        where b.demo and b.deletion_requested_at is null and b.created_at < $1
          and not exists (select 1 from access_log a where a.business_id = b.id and a.at >= $1)
        returning b.id`,
      [idleSince, new Date(now())],
    );
    summary.demoRetired = idle.rowCount;
    const due = await db.query('select id, name from businesses where deletion_requested_at is not null and deletion_requested_at < $1 order by deletion_requested_at', [cutoff]);
    for (const row of due.rows) {
      try {
        const heldUntil = await recordsHeldUntil(row.id, requestId);
        if (heldUntil && Date.parse(heldUntil) > now()) {
          summary.held += 1;
          log({ requestId, job: 'purge', businessId: row.id, heldUntil, why: 'IRS e-file records (Form 8879 and the return) are kept three years' });
          continue;
        }
        await db.tx(async (q) => {
          const docs = vault ? await vault.purge(q, row.id) : { rows: (await q('delete from documents where business_id = $1', [row.id])).rowCount, objects: 0 };
          await q('alter table audit_log disable trigger audit_log_no_update');
          try {
            await q('delete from audit_log where business_id = $1', [row.id]);
          } finally {
            await q('alter table audit_log enable trigger audit_log_no_update');
          }
          for (const table of ['access_log', 'shared_books', 'inbound_sales', 'inbound_keys', 'gst_portal_sessions', 'business_connectors', 'invitations', 'memberships', 'books']) {
            await q(`delete from ${table} where business_id = $1`, [row.id]);
          }
          await q('delete from businesses where id = $1', [row.id]);
          summary.documents += docs.rows;
          summary.objects += docs.objects;
        });
        summary.businesses += 1;
        log({ requestId, job: 'purge', businessId: row.id, purged: true });
      } catch (err) {
        summary.failed.push({ businessId: row.id, error: String(err && err.message ? err.message : err) });
        log({ requestId, job: 'purge', businessId: row.id, error: String(err && err.stack ? err.stack : err) });
      }
    }
    const leaving = await db.query('select id, phone from users where deleted_at is not null and deleted_at < $1 order by deleted_at', [cutoff]);
    for (const row of leaving.rows) {
      try {
        await db.tx(async (q) => {
          const still = await q('select 1 from users where id = $1 and deleted_at is not null and deleted_at < $2 for update', [row.id, cutoff]);
          if (!still.rowCount) return;
          if (row.phone) {
            const phoneHash = secret ? keyedHash(secret, row.phone) : '';
            if (phoneHash) {
              await q('delete from invitations where phone_hash = $1', [phoneHash]);
              await q('delete from otp_challenges where phone_hash = $1', [phoneHash]);
            }
            await q('delete from whatsapp_links where phone = $1', [row.phone]);
          }
          await q('delete from access_log where user_id = $1', [row.id]);
          await q("update privacy_requests set message = '', nominee_name = '', nominee_contact = '', reply = '' where user_id = $1", [row.id]);
          await q('delete from users where id = $1', [row.id]);
          summary.users += 1;
        });
      } catch (err) {
        summary.failed.push({ userId: row.id, error: String(err && err.message ? err.message : err) });
        log({ requestId, job: 'purge', userId: row.id, error: String(err && err.stack ? err.stack : err) });
      }
    }
    if (summary.users) log({ requestId, job: 'purge', usersErased: summary.users });
    summary.accessRows = (await db.query('delete from access_log where at < $1', [new Date(now() - ACCESS_LOG_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.crashRows = (await db.query('delete from crash_reports where last_seen < $1', [new Date(now() - CRASH_REPORT_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.otpRows = (await db.query('delete from otp_challenges where created_at < $1', [new Date(now() - OTP_CHALLENGE_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.rateRows = rateLimits ? await rateLimits.prune() : 0;
    summary.secondStepRows = (await db.query('delete from second_step_challenges where created_at < $1', [new Date(now() - OTP_CHALLENGE_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.privacyRequestRows = (await db.query("delete from privacy_requests where status <> 'open' and created_at < $1", [new Date(now() - PRIVACY_REQUEST_KEEP_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.privacyRequestsOverdue = (await db.query("select count(*)::int as n from privacy_requests where status = 'open' and due_at < $1", [new Date(now())])).rows[0].n;
    if (summary.privacyRequestsOverdue) log({ requestId, job: 'purge', alert: 'PRIVACY_REQUESTS_OVERDUE', overdue: summary.privacyRequestsOverdue });
    summary.whatsappRows = (await db.query('delete from whatsapp_messages where received_at < $1', [new Date(now() - WHATSAPP_MESSAGE_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    return summary;
  }

  async function daily(requestId) {
    const found = await db.query('select b.business_id from books b join businesses x on x.id = b.business_id where x.deletion_requested_at is null order by b.business_id');
    const summary = { ok: true, businesses: found.rowCount, ran: 0, skipped: 0, reminders: 0, warnings: 0, pulled: 0, failed: [] };
    for (const row of found.rows) {
      const businessId = row.business_id;
      try {
        const out = await withBooks(businessId, { requestId, userId: null, deviceId: null }, (session) => session.tool('run_automation', {}, { actor: { userId: 'automation', role: 'owner' } }));
        if (out.ok === false) {
          summary.failed.push({ businessId, error: out.error });
          continue;
        }
        if (out.data.skipped) summary.skipped += 1;
        else {
          summary.ran += 1;
          summary.reminders += out.data.run.reminders.length;
          summary.warnings += out.data.run.warnings.length;
          if (out.data.run.warnings.length) log({ requestId, job: 'daily', businessId, warnings: out.data.run.warnings });
        }
        if (connectors && syncChannels && pullsEnabled()) {
          const configured = await connectors.configured(businessId);
          if (configured.length) {
            const pulled = await withBooks(businessId, { requestId, userId: null, deviceId: null }, async (session) => {
              const out = await syncChannels(session.state, {}, { actor: { userId: 'automation', role: 'owner' }, connectors: configured });
              session.persist();
              return out;
            });
            summary.pulled += pulled.data.fetched;
            const failures = pulled.data.results.filter((r) => !r.ok);
            if (failures.length) log({ requestId, job: 'daily', businessId, pulls: failures });
          }
        }
      } catch (err) {
        summary.failed.push({ businessId, error: String(err && err.message ? err.message : err) });
        log({ requestId, job: 'daily', businessId, error: String(err && err.stack ? err.stack : err) });
      }
    }
    try {
      summary.billing = billing && billing.refreshDue ? await billing.refreshDue() : { checked: 0, changed: 0, failed: 0 };
    } catch (err) {
      summary.billing = { checked: 0, changed: 0, failed: 1 };
      log({ requestId, job: 'daily', billing: String(err && err.stack ? err.stack : err) });
    }
    summary.purge = await purge(requestId);
    log({ requestId, job: 'daily', ...summary, failed: summary.failed.length });
    return summary;
  }

  async function weekly(requestId) {
    const summary = { ok: true, businesses: 0, sent: 0, skipped: 0, failed: [] };
    if (!sender) return { ...summary, skipped: 0, reason: 'NO_SENDER' };
    const found = await db.query(
      `select m.business_id, u.phone, u.name
         from memberships m join users u on u.id = m.user_id join businesses b on b.id = m.business_id
        where m.weekly_brief and m.role <> 'accountant' and u.deleted_at is null and b.deletion_requested_at is null
        order by m.business_id`,
    );
    const byBusiness = new Map();
    for (const row of found.rows) {
      if (!byBusiness.has(row.business_id)) byBusiness.set(row.business_id, []);
      byBusiness.get(row.business_id).push(row);
    }
    summary.businesses = byBusiness.size;
    for (const [businessId, members] of byBusiness) {
      try {
        const out = await withBooks(businessId, { requestId, userId: null, deviceId: null }, (session) => session.chat('weekly brief', { actor: { userId: 'automation', role: 'owner', name: 'MyCA' } }));
        const text = String(out.reply || '').trim();
        if (!text) { summary.skipped += members.length; continue; }
        for (const member of members) {
          try {
            await sender.sendText(member.phone, text);
            summary.sent += 1;
          } catch (err) {
            summary.failed.push({ businessId, error: String(err && err.message ? err.message : err) });
          }
        }
      } catch (err) {
        summary.failed.push({ businessId, error: String(err && err.message ? err.message : err) });
        log({ requestId, job: 'weekly', businessId, error: String(err && err.stack ? err.stack : err) });
      }
    }
    log({ requestId, job: 'weekly', ...summary, failed: summary.failed.length });
    return summary;
  }

  return { daily, weekly, purge };
}
