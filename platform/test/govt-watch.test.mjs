import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { checkGovtSources, govtWatchStatus, govtWatchWords, GOVT_SOURCES } from '../src/govt-watch.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

function readingsWith(text) {
  const readings = {};
  for (const source of GOVT_SOURCES) readings[source.id] = `${source.id} ${text}`;
  return readings;
}

test('the first portal check records fingerprints and raises no reminders', () => {
  const state = books();
  const out = checkGovtSources(state, { readings: readingsWith('version one'), today: '2026-10-31' });
  assert.equal(out.ok, true);
  assert.equal(out.data.firstSeen.length, GOVT_SOURCES.length);
  assert.equal(out.data.changed.length, 0);
  assert.equal((state.reminders || []).length, 0);
  assert.equal(state.automation.govt.lastChecked, '2026-10-31');
});

test('a changed page raises one reminder once and stays pending', () => {
  const state = books();
  checkGovtSources(state, { readings: readingsWith('version one'), today: '2026-10-31' });
  const readings = readingsWith('version one');
  readings['gst-portal-news'] = 'gst-portal-news version two with an extension notice';
  const out = checkGovtSources(state, { readings, today: '2026-11-01' });
  assert.deepEqual(out.data.changed, ['gst-portal-news']);
  assert.equal(out.data.reminded.length, 1);
  assert.equal(out.data.reminded[0].sourceId, 'gst-portal-news');
  assert.match(out.data.reminded[0].text, /GST portal news/);
  const again = checkGovtSources(state, { readings, today: '2026-11-02' });
  assert.equal(again.data.reminded.length, 0, 'the same change never reminds twice');
  assert.equal((state.reminders || []).filter((item) => item.source === 'govt:gst-portal-news').length, 1);
});

test('an unreadable page is recorded as unreachable without a reminder', () => {
  const state = books();
  checkGovtSources(state, { readings: readingsWith('version one'), today: '2026-10-31' });
  const readings = readingsWith('version one');
  readings['dopt-holidays'] = { error: 'HTTP 403' };
  const out = checkGovtSources(state, { readings, today: '2026-11-01' });
  assert.deepEqual(out.data.unreachable, ['dopt-holidays']);
  assert.equal(out.data.reminded.length, 0);
  const status = govtWatchStatus(state, {});
  const row = status.data.sources.find((item) => item.id === 'dopt-holidays');
  assert.equal(row.pending, 'unreachable');
});

test('figures never change when a page changes, and the words say who reads it', () => {
  const state = books();
  checkGovtSources(state, { readings: readingsWith('version one'), today: '2026-10-31' });
  const before = state.ledger.transfers.length;
  const readings = readingsWith('version one');
  readings['cbdt-circulars'] = 'cbdt-circulars version two';
  checkGovtSources(state, { readings, today: '2026-11-01' });
  assert.equal(state.ledger.transfers.length, before);
  const words = govtWatchWords(govtWatchStatus(state, {}).data);
  assert.match(words, /CBDT circulars/);
});

test('the portal watch tools validate, run through runTool, and route from chat words', async () => {
  assert.equal(validateAssistantToolCall('govt_watch_status', {}).ok, true);
  assert.equal(validateAssistantToolCall('govt_watch_check', { force: true }).ok, true);
  assert.equal(validateAssistantToolCall('govt_watch_check', { force: 'yes' }).ok, false);
  const state = books();
  const status = await runTool(state, 'govt_watch_status', {});
  assert.equal(status.ok, true);
  assert.equal(status.data.sources.length, GOVT_SOURCES.length);
});

test('the live portal check skips cleanly when live calls are off, touching no figures', async () => {
  const state = books();
  const before = state.ledger.transfers.length;
  const previous = process.env.MYCA_ENABLE_LIVE_CALLS;
  process.env.MYCA_ENABLE_LIVE_CALLS = '0';
  let out;
  try {
    out = await runTool(state, 'govt_watch_check', {});
  } finally {
    if (previous === undefined) delete process.env.MYCA_ENABLE_LIVE_CALLS;
    else process.env.MYCA_ENABLE_LIVE_CALLS = previous;
  }
  assert.equal(out.ok, true);
  assert.equal(out.data.skipped, true);
  assert.equal(out.data.reason, 'LIVE_CALLS_DISABLED');
  assert.equal(state.ledger.transfers.length, before);
  assert.equal((state.reminders || []).length, 0);
});
