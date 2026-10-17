import { timingSafeEqual } from 'node:crypto';

export const JOB_HEADER = 'x-myca-job-token';
const MIN_TOKEN_LENGTH = 32;

export function jobTokenMatches(configured, given) {
  if (!configured || configured.length < MIN_TOKEN_LENGTH) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createJobs({ db, withBooks, connectors = null, syncChannels = null, pullsEnabled = () => false, sender = null, log = () => {} }) {
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

  return { daily, weekly };
}
