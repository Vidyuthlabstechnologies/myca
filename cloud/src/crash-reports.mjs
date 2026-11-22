import { createHash } from 'node:crypto';

export const MAX_REPORTS_PER_REQUEST = 10;
export const KEEP_DAYS = 90;
const MAX_MESSAGE = 300;
const MAX_FRAMES = 40;
const MAX_FRAME = 300;
const MAX_COUNT = 1000;
const MAX_SCRUBBED = 4000;
const MAX_STACK_READ = 200000;
const KINDS = new Set(['flutter', 'async', 'server']);

const SCRUBS = [
  [/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/g, ''],
  [/(https?:\/\/[^\s?#"']+)[?#][^\s"')]*/gi, '$1'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[TOKEN]'],
  [/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/gi, '[GSTIN]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[PAN]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[ID]'],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[TOKEN]'],
  [/"[^"\n]{0,200}"/g, '"[TEXT]"'],
  [/'[^'\n]{0,200}'/g, "'[TEXT]'"],
  [/(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, '[SSN]'],
  [/(?<!\d)\d{2}-\d{7}(?!\d)/g, '[EIN]'],
  [/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g, '[PHONE]'],
  [/(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g, '[PHONE]'],
  [/(?:₹|(?<![\w.$])\$|\brs\.?|\binr|\busd)\s*\d[\d,]*(?:\.\d+)?/gi, '[AMOUNT]'],
  [/(?<!\d)\d{7,}(?!\d)(?:\.\d+)?/g, '[NUMBER]'],
  [/(?<![\w.])(?<!\.\w{1,8}:)(?<!\.\w{1,8}:\d{1,7}:)\d[\d,]{2,}\d(?:\.\d+)?/g, '[NUMBER]'],
];

export function scrubCrashText(value) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of SCRUBS) text = text.replace(pattern, replacement);
  return text;
}

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function head(value, max) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  let last = cut.length - 1;
  while (last >= 0 && !/\s/.test(cut[last])) last -= 1;
  return last > 0 ? cut.slice(0, last) : cut;
}

function stackOf(value) {
  const frames = [];
  for (const line of head(value, MAX_STACK_READ).split('\n')) {
    if (!line.trim()) continue;
    frames.push(clip(scrubCrashText(head(line.trimEnd(), MAX_SCRUBBED)), MAX_FRAME));
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.join('\n');
}

export function cleanCrashReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'BAD_REPORT' };
  const kind = String(raw.kind || '');
  if (!KINDS.has(kind)) return { ok: false, error: 'BAD_KIND' };
  const type = String(raw.type || '').trim();
  if (!/^[\w<>.,$ ]{1,100}$/.test(type)) return { ok: false, error: 'BAD_TYPE' };
  const appVersion = String(raw.appVersion || 'unknown').trim();
  if (!/^[\w.+-]{1,32}$/.test(appVersion)) return { ok: false, error: 'BAD_VERSION' };
  const count = Number(raw.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return { ok: false, error: 'BAD_COUNT' };
  const message = clip(scrubCrashText(head(raw.message, MAX_SCRUBBED)).replace(/\s+/g, ' ').trim(), MAX_MESSAGE);
  const stack = stackOf(raw.stack);
  const fingerprint = createHash('sha256').update([kind, type, ...stack.split('\n').slice(0, 5)].join('\n')).digest('hex');
  return { ok: true, report: { kind, type, appVersion, count, message, stack, fingerprint } };
}

export function createCrashReports({ db, now = () => Date.now() }) {
  async function store(reports) {
    const at = new Date(now());
    const cutoff = new Date(at.getTime() - KEEP_DAYS * 86400000);
    await db.query('delete from crash_reports where last_seen < $1', [cutoff]);
    for (const report of reports) {
      await db.query(
        `insert into crash_reports (fingerprint, app_version, kind, error_type, message, stack, occurrences, first_seen, last_seen)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         on conflict (fingerprint, app_version) do update
           set occurrences = least(crash_reports.occurrences + excluded.occurrences, 2000000000),
               message = excluded.message,
               last_seen = excluded.last_seen`,
        [report.fingerprint, report.appVersion, report.kind, report.type, report.message, report.stack, report.count, at],
      );
    }
  }

  return {
    async record(body) {
      const list = Array.isArray(body?.reports) ? body.reports : null;
      if (!list || !list.length) return { ok: false, error: 'NO_REPORTS' };
      if (list.length > MAX_REPORTS_PER_REQUEST) return { ok: false, error: 'TOO_MANY_REPORTS', max: MAX_REPORTS_PER_REQUEST };
      const cleaned = list.map(cleanCrashReport);
      const accepted = cleaned.filter((item) => item.ok).map((item) => item.report);
      if (accepted.length) await store(accepted);
      return { ok: true, accepted: accepted.length, refused: cleaned.length - accepted.length };
    },
    async recordServer(err, appVersion) {
      const out = cleanCrashReport({
        kind: 'server',
        type: String(err?.name || err?.constructor?.name || 'Error').replace(/[^\w<>.,$ ]/g, '').slice(0, 100) || 'Error',
        message: err?.message,
        stack: String(err?.stack || '').split('\n').slice(1).join('\n'),
        appVersion,
      });
      if (out.ok) await store([out.report]);
    },
    async digest(sinceMs) {
      const { rows } = await db.query(
        `select app_version as "appVersion", kind, error_type as "errorType", message, split_part(stack, E'\n', 1) as "topFrame", fingerprint,
                occurrences, first_seen as "firstSeen", last_seen as "lastSeen"
           from crash_reports where last_seen >= $1 order by app_version desc, occurrences desc limit 500`,
        [new Date(sinceMs)],
      );
      const byVersion = {};
      for (const row of rows) {
        const entry = byVersion[row.appVersion] || (byVersion[row.appVersion] = { appVersion: row.appVersion, crashes: 0, signatures: [] });
        entry.crashes += row.occurrences;
        entry.signatures.push(row);
      }
      return Object.values(byVersion);
    },

    async recent(limit = 20) {
      const { rows } = await db.query(
        'select app_version, kind, error_type, message, stack, occurrences, first_seen, last_seen from crash_reports order by last_seen desc limit $1',
        [limit],
      );
      return rows;
    },
  };
}
