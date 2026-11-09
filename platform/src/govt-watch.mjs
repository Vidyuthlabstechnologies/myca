import { createHash } from 'node:crypto';
import { localToday } from './dates.mjs';
import { addReminder } from './reminders.mjs';
import { performExternalAction } from './action-gate.mjs';

export const GOVT_SOURCES = [
  { id: 'cbic-central-tax-notifications', family: 'gst.*, due-date.*', url: 'https://taxinformation.cbic.gov.in/content-page/explore-notification', what: 'CBIC central tax and rate notifications' },
  { id: 'gst-portal-news', family: 'due-date.*, gst.*', url: 'https://www.gst.gov.in/newsandupdates', what: 'GST portal news and updates (extensions, portal changes)' },
  { id: 'cbdt-circulars', family: 'tds.*, income-tax.*, audit-threshold.*', url: 'https://incometaxindia.gov.in/Pages/communications/circulars.aspx', what: 'CBDT circulars' },
  { id: 'cbdt-notifications', family: 'tds.*, income-tax.*', url: 'https://incometaxindia.gov.in/Pages/communications/notifications.aspx', what: 'CBDT notifications' },
  { id: 'epfo-circulars', family: 'payroll.epf.*', url: 'https://www.epfindia.gov.in/site_en/Circulars.php', what: 'EPFO circulars (wage ceiling, contribution rates, admin charges)' },
  { id: 'esic-circulars', family: 'payroll.esi.*', url: 'https://www.esic.gov.in/circulars', what: 'ESIC circulars (wage ceiling, contribution rates)' },
  { id: 'dopt-holidays', family: 'holiday.*', url: 'https://dopt.gov.in/holidays', what: 'DoPT holiday memoranda for the next calendar year' },
  { id: 'irs-information-returns', family: 'us.federal.*', url: 'https://www.irs.gov/instructions/i1099gi', what: 'IRS general instructions for information returns' },
];

export function govtWatchTextOf(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function govtWatchFingerprint(text) {
  const stable = String(text || '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/\b(?:visitors?|hits?|count)\s*:?\s*\d[\d,]*/gi, '')
    .replace(/\b(?:last updated|updated on)\s*:?\s*[0-9/.-]+/gi, '');
  return createHash('sha256').update(stable).digest('hex');
}

function govtOf(state) {
  if (!state.automation || typeof state.automation !== 'object') state.automation = { lastRun: '', log: [] };
  const automation = state.automation;
  if (!automation.govt || typeof automation.govt !== 'object') automation.govt = { lastChecked: '', sources: {}, pending: [] };
  if (!automation.govt.sources || typeof automation.govt.sources !== 'object') automation.govt.sources = {};
  if (!Array.isArray(automation.govt.pending)) automation.govt.pending = [];
  return automation.govt;
}

export function checkGovtSources(state, args = {}) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(args.today || '')) ? args.today : localToday();
  const readings = args.readings && typeof args.readings === 'object' ? args.readings : {};
  const govt = govtOf(state);
  const changed = [];
  const unreachable = [];
  const firstSeen = [];
  for (const source of GOVT_SOURCES) {
    const reading = readings[source.id];
    const text = typeof reading === 'string' ? reading : reading && typeof reading.text === 'string' ? reading.text : null;
    const error = reading && typeof reading === 'object' && reading.error ? String(reading.error) : '';
    if (text == null) {
      if (error) unreachable.push({ id: source.id, family: source.family, url: source.url, what: source.what, error });
      continue;
    }
    const hash = govtWatchFingerprint(govtWatchTextOf(text));
    const before = govt.sources[source.id];
    if (!before || !before.hash) {
      govt.sources[source.id] = { hash, checkedOn: today, acceptedOn: today, chars: text.length };
      firstSeen.push(source.id);
      continue;
    }
    if (before.hash !== hash) {
      govt.sources[source.id] = { ...before, hash, checkedOn: today, pendingHash: hash, chars: text.length };
      changed.push(source);
    } else {
      const { pendingHash, ...rest } = before;
      govt.sources[source.id] = { ...rest, checkedOn: today };
    }
  }
  govt.lastChecked = today;
  const existing = new Set((state.reminders || []).map((reminder) => reminder.source).filter(Boolean));
  const reminded = [];
  for (const source of changed) {
    const key = `govt:${source.id}`;
    govt.pending = govt.pending.filter((item) => item.id !== source.id);
    govt.pending.push({ id: source.id, family: source.family, url: source.url, what: source.what, detectedOn: today, status: 'changed' });
    if (existing.has(key)) continue;
    const made = addReminder(state, { text: `${source.what} page changed: read it and add any new dated rule (${source.family})`, due: today, actorId: 'automation', today });
    if (!made.ok) continue;
    made.reminder.source = key;
    existing.add(key);
    reminded.push({ id: made.reminder.id, due: made.reminder.due, text: made.reminder.text, sourceId: source.id });
  }
  for (const row of unreachable) {
    const found = govt.pending.find((item) => item.id === row.id);
    if (!found) govt.pending.push({ id: row.id, family: row.family, url: row.url, what: row.what, detectedOn: today, status: 'unreachable', error: row.error });
    else {
      found.status = 'unreachable';
      found.detectedOn = today;
      found.error = row.error;
    }
  }
  govt.pending = govt.pending.filter((item) => GOVT_SOURCES.some((source) => source.id === item.id));
  return { ok: true, data: { checkedOn: today, changed: changed.map((source) => source.id), firstSeen, unreachable: unreachable.map((row) => row.id), reminded, pending: govt.pending.length } };
}

export function govtWatchStatus(state, args = {}) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOf || args.today || '')) ? String(args.asOf || args.today) : localToday();
  const govt = state.automation && typeof state.automation === 'object' && state.automation.govt && typeof state.automation.govt === 'object'
    ? state.automation.govt
    : { lastChecked: '', sources: {}, pending: [] };
  const rows = GOVT_SOURCES.map((source) => {
    const seen = govt.sources && govt.sources[source.id];
    const pending = (govt.pending || []).find((item) => item.id === source.id) || null;
    return { id: source.id, family: source.family, url: source.url, what: source.what, checkedOn: seen ? seen.checkedOn || '' : '', acceptedOn: seen ? seen.acceptedOn || '' : '', changed: Boolean(seen && seen.pendingHash), pending: pending ? pending.status : '' };
  });
  return { ok: true, data: { today, lastChecked: govt.lastChecked || '', sources: rows, pending: govt.pending || [] } };
}

export function govtWatchWords(data) {
  if (!data.lastChecked) return 'The portal watch has not run yet. It checks the official CBIC, GST portal, CBDT, EPFO, ESIC, DoPT and IRS pages every hour and raises a reminder the moment one changes; figures still change only through a new dated rule your CA has reviewed.';
  const changed = data.sources.filter((row) => row.changed);
  const lines = [`Portal watch last ran on ${data.lastChecked}: ${changed.length === 0 ? 'no official page changed since it was last accepted' : `${changed.length} page${changed.length === 1 ? '' : 's'} changed`} (${data.sources.length} pages watched).`];
  for (const row of changed) lines.push(`! ${row.what}: read ${row.url} and add any new dated rule for ${row.family}.`);
  const unreachable = data.sources.filter((row) => row.pending === 'unreachable');
  for (const row of unreachable) lines.push(`· ${row.what} could not be read; it will be retried on the next run.`);
  return lines.join('\n');
}

export async function collectGovtReadings(state, actor) {
  const readings = {};
  for (const source of GOVT_SOURCES) {
    const result = await performExternalAction(state, {
      actionId: 'govt_page_fetch',
      clientId: String(state.activeClientId || 'SELF'),
      params: { url: source.url },
      actor: actor || { userId: 'owner' },
      metadata: { source: source.id },
      payload: { url: source.url },
      fixture: () => ({ ok: true, mock: true, simulated: true, data: { text: `${source.id} mock page text`, source: `${source.id}:mock` } }),
    }, async (transports) => {
      const fetched = await transports.reachability.fetchPublicPage(source.url);
      if (!fetched.ok) return fetched;
      return { ok: true, data: { text: govtWatchTextOf(fetched.text), source: source.id } };
    });
    if (result.error === 'LIVE_CALLS_DISABLED' && Object.keys(readings).length === 0) return null;
    readings[source.id] = result.ok ? String(result.data?.text || '') : { error: String(result.error || 'FETCH_FAILED') };
  }
  return readings;
}
