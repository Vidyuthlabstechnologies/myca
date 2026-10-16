import { timingSafeEqual } from 'node:crypto';

export const JOB_HEADER = 'x-myca-job-token';
const MIN_TOKEN_LENGTH = 32;

export function jobTokenMatches(configured, given) {
  if (!configured || configured.length < MIN_TOKEN_LENGTH) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createJobs({ db, withBooks, connectors = null, syncChannels = null, pullsEnabled = () => false, log = () => {} }) {
  async function daily(requestId) {
    const found = await db.query('select business_id from books order by business_id');
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

  return { daily };
}
