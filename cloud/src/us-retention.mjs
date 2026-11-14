export const US_EFILE_RECORD_YEARS = 3;

function dueDate(taxYear) {
  const year = Number(taxYear);
  return Number.isInteger(year) && year > 1900 ? Date.UTC(year + 1, 3, 15) : NaN;
}

function plusYears(ms, years) {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.getTime();
}

function received(submission) {
  const times = [submission?.ack?.acknowledgedAt, submission?.submittedAt].map((value) => Date.parse(String(value || ''))).filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

export function usRecordsHeldUntil(state) {
  const returns = state?.usEfile?.returns;
  if (!returns || typeof returns !== 'object') return null;
  let until = null;
  for (const [year, entry] of Object.entries(returns)) {
    for (const submission of Array.isArray(entry?.submissions) ? entry.submissions : []) {
      if (submission?.transport !== 'mef' || submission?.mode !== 'live') continue;
      const start = Math.max(...[dueDate(submission.taxYear ?? year), received(submission)].filter(Number.isFinite));
      if (!Number.isFinite(start)) continue;
      const end = plusYears(start, US_EFILE_RECORD_YEARS);
      if (until === null || end > until) until = end;
    }
  }
  return until === null ? null : new Date(until).toISOString();
}
