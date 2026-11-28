import { checkRuleOverlay, ruleOverlay, setRuleOverlay, validateRules } from '../../sprints/statutory-rules/src/index.mjs';

export const RULES_POLL_MS = 60000;
const MAX_REASON = 500;

function problem(status, error, extra = {}) {
  const err = new Error(error);
  err.statusCode = status;
  err.body = { ok: false, error, ...extra };
  return err;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function createRules({ db, now = () => Date.now(), log = () => {}, pollMs = RULES_POLL_MS }) {
  let timer = null;
  let seen = '';
  let loadedAt = 0;
  let lastError = '';

  async function active() {
    const rows = await db.query('select id, record, rule_id as "ruleId", added_by as "addedBy", reason, added_at as "addedAt" from rule_records where revoked_at is null order by id');
    return rows.rows;
  }

  async function fingerprint() {
    const rows = await db.query('select coalesce(max(id), 0)::text as last, count(*) filter (where revoked_at is null)::text as live, (select changed_at::text from rule_records_stamp) as stamp from rule_records');
    const [row] = rows.rows;
    return `${row.last}:${row.live}:${row.stamp}`;
  }

  async function load() {
    const print = await fingerprint();
    if (print === seen) return { ok: true, changed: false, records: ruleOverlay().length };
    const rows = await active();
    const outcome = setRuleOverlay(rows.map((row) => row.record));
    if (!outcome.ok) {
      lastError = JSON.stringify(outcome.problems).slice(0, 500);
      log({ rules: 'overlay refused', problems: outcome.problems });
      return { ok: false, changed: false, problems: outcome.problems };
    }
    seen = print;
    loadedAt = now();
    lastError = '';
    log({ rules: 'overlay loaded', records: rows.length });
    return { ok: true, changed: true, records: rows.length };
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      load().catch((err) => log({ rules: 'overlay reload failed', error: String(err && err.message ? err.message : err) }));
    }, pollMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function list() {
    const rows = await db.query('select id, record, added_by as "addedBy", reason, added_at as "addedAt", revoked_at as "revokedAt", revoked_by as "revokedBy", revoked_reason as "revokedReason" from rule_records order by id desc limit 500');
    return { ok: true, loadedAt: loadedAt ? new Date(loadedAt).toISOString() : null, lastError, inForce: ruleOverlay().length, records: rows.rows };
  }

  async function add(adminId, body) {
    const reason = text(body && body.reason);
    if (!reason || reason.length > MAX_REASON) throw problem(400, 'REASON_REQUIRED', { hint: `Say why, in up to ${MAX_REASON} characters, for example the notification number.` });
    const records = Array.isArray(body && body.records) ? body.records : body && body.record ? [body.record] : [];
    if (records.length === 0 || records.length > 50) throw problem(400, 'RECORDS_REQUIRED', { hint: 'Send record, or records with 1 to 50 entries.' });
    const checked = validateRules(records);
    if (!checked.ok) throw problem(400, 'RULE_INVALID', { problems: checked.problems });
    const ids = await db.tx(async (step) => {
      await step('select pg_advisory_xact_lock(hashtext($1))', ['rule_records']);
      const current = (await step('select record from rule_records where revoked_at is null order by id')).rows.map((row) => row.record);
      const together = checkRuleOverlay([...current, ...records]);
      if (!together.ok) throw problem(409, 'RULE_CONFLICT', { problems: together.problems, hint: 'An active runtime change already covers those dates, or the result is not consistent. Deactivate the earlier one first, or start the new one after it.' });
      const made = [];
      for (const record of records) {
        const stored = await step('insert into rule_records (record, rule_id, added_by, reason) values ($1::jsonb, $2, $3, $4) returning id', [JSON.stringify(record), record.id, adminId, reason]);
        made.push(stored.rows[0].id);
      }
      await step('update rule_records_stamp set changed_at = now()');
      return made;
    });
    log({ rules: 'added', by: adminId, ids, ruleIds: records.map((record) => record.id), reason });
    const applied = await load();
    return { ok: true, ids, applied: applied.ok };
  }

  async function revoke(adminId, id, body) {
    if (!/^[0-9]{1,18}$/.test(String(id))) throw problem(404, 'NOT_FOUND');
    const reason = text(body && body.reason);
    if (!reason || reason.length > MAX_REASON) throw problem(400, 'REASON_REQUIRED', { hint: 'Say why this change is being withdrawn.' });
    await db.tx(async (step) => {
      await step('select pg_advisory_xact_lock(hashtext($1))', ['rule_records']);
      const remaining = (await step('select record from rule_records where revoked_at is null and id <> $1 order by id', [id])).rows.map((row) => row.record);
      const together = checkRuleOverlay(remaining);
      if (!together.ok) throw problem(409, 'RULE_CONFLICT', { problems: together.problems, hint: 'Withdrawing this would leave the other runtime changes inconsistent.' });
      const done = await step('update rule_records set revoked_at = now(), revoked_by = $2, revoked_reason = $3 where id = $1 and revoked_at is null returning id', [id, adminId, reason]);
      if (done.rowCount === 0) throw problem(404, 'NOT_FOUND');
      await step('update rule_records_stamp set changed_at = now()');
    });
    log({ rules: 'revoked', by: adminId, id, reason });
    const applied = await load();
    return { ok: true, id: Number(id), applied: applied.ok };
  }

  return { load, start, stop, list, add, revoke };
}
