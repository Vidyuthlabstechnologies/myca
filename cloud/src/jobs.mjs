import { timingSafeEqual } from 'node:crypto';

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

export function createJobs({ db, withBooks, connectors = null, syncChannels = null, pullsEnabled = () => false, sender = null, vault = null, now = () => Date.now(), log = () => {} }) {
  async function purge(requestId) {
    const summary = { businesses: 0, documents: 0, objects: 0, accessRows: 0, crashRows: 0, otpRows: 0, failed: [] };
    const cutoff = new Date(now() - DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const due = await db.query('select id, name from businesses where deletion_requested_at is not null and deletion_requested_at < $1 order by deletion_requested_at', [cutoff]);
    for (const row of due.rows) {
      try {
        await db.tx(async (q) => {
          const docs = vault ? await vault.purge(q, row.id) : { rows: (await q('delete from documents where business_id = $1', [row.id])).rowCount, objects: 0 };
          await q('alter table audit_log disable trigger audit_log_no_update');
          try {
            await q('delete from audit_log where business_id = $1', [row.id]);
          } finally {
            await q('alter table audit_log enable trigger audit_log_no_update');
          }
          for (const table of ['access_log', 'shared_books', 'inbound_sales', 'inbound_keys', 'business_connectors', 'invitations', 'memberships', 'books']) {
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
    summary.accessRows = (await db.query('delete from access_log where at < $1', [new Date(now() - ACCESS_LOG_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.crashRows = (await db.query('delete from crash_reports where last_seen < $1', [new Date(now() - CRASH_REPORT_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
    summary.otpRows = (await db.query('delete from otp_challenges where created_at < $1', [new Date(now() - OTP_CHALLENGE_DAYS * 24 * 60 * 60 * 1000)])).rowCount;
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
