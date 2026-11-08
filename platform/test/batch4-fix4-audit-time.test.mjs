import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { createState } from '../src/store.mjs';
import { appendAuditEvent } from '../src/ca-api.mjs';
import { runTool } from '../src/tools.mjs';
import { auditEventsIn, auditSheetRows, auditTrailWords } from '../src/audit-trail.mjs';
import { periodRange } from '../src/report-sheets.mjs';

const MODULES = {
  store: new URL('../src/store.mjs', import.meta.url).href,
  caApi: new URL('../src/ca-api.mjs', import.meta.url).href,
  tools: new URL('../src/tools.mjs', import.meta.url).href,
  router: new URL('../src/router.mjs', import.meta.url).href,
  invoice: new URL('../src/invoice.mjs', import.meta.url).href,
  reportSheets: new URL('../src/report-sheets.mjs', import.meta.url).href,
  audit: new URL('../src/audit-trail.mjs', import.meta.url).href,
  dates: new URL('../src/dates.mjs', import.meta.url).href,
  session: new URL('../src/session.mjs', import.meta.url).href,
  stores: new URL('../src/store-ports.mjs', import.meta.url).href,
};
const ZONES = ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu'];
const LOCAL = 0x04034b50;

function local(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

function change(state, at, extra = {}) {
  return appendAuditEvent(state, { actorId: 'USR-OWNER', actorName: 'Asha', action: 'tool.create_invoice', at, beforeHash: 'a', afterHash: 'b', metadata: {}, ...extra }).eventId;
}

async function listed(state, args) {
  const out = await runTool(state, 'audit_trail', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data.events.map((event) => event.eventId);
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

function sheetXmls(base64) {
  const buffer = Buffer.from(base64, 'base64');
  const parts = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === LOCAL) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const packedSize = buffer.readUInt32LE(offset + 18);
    parts.set(name, inflateRawSync(buffer.subarray(start, start + packedSize)).toString('utf8'));
    offset = start + packedSize;
  }
  return parts;
}

function unescape(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
}

function sheetRows(base64, number) {
  const xml = sheetXmls(base64).get(`xl/worksheets/sheet${number}.xml`);
  return [...xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((row) => [...row[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map((m) => [m[1], m[3] !== undefined ? Number(m[3]) : unescape(m[2])]));
}

function cell(row, letter) {
  return row.find((item) => item[0] === letter)?.[1];
}

function summaryOf(base64) {
  return new Map(sheetRows(base64, 3).map((row) => [cell(row, 'A'), cell(row, 'B')]));
}

async function zoneProbe(modules) {
  const { createState } = await import(modules.store);
  const { appendAuditEvent } = await import(modules.caApi);
  const { runTool } = await import(modules.tools);
  const { chat } = await import(modules.router);
  const { createInvoice } = await import(modules.invoice);
  const { reportSheet } = await import(modules.reportSheets);
  const { auditTrailWords } = await import(modules.audit);
  const pad = (n) => String(n).padStart(2, '0');
  const wall = (year, month, day, hour = 0, minute = 0, second = 0) => `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const stampOf = (year, month, day, hour = 0, minute = 0, second = 0) => new Date(year, month - 1, day, hour, minute, second).toISOString();
  const change = (state, at) => appendAuditEvent(state, { actorId: 'USR-ADMIN', actorName: 'Admin', action: 'tool.create_invoice', at, beforeHash: 'a', afterHash: 'b', metadata: { ok: true, details: { ids: ['INV-0001'] } } });
  const events = async (state, args) => (await runTool(state, 'audit_trail', { ...args, view: 'all' })).data.events;
  const out = { offsetMinutes: new Date(2026, 10, 7, 12, 0, 0).getTimezoneOffset() };

  const story = createState();
  createInvoice(story, { date: '2026-11-07', partyName: 'Kiran Stores', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] });
  const evening = change(story, stampOf(2026, 11, 7, 18, 0, 0));
  const early = change(story, stampOf(2026, 11, 1, 0, 30, 0));
  out.stamps = { evening: evening.at, early: early.at };
  out.ids = { evening: evening.eventId, early: early.eventId };
  const queries = {
    seventh: { from: '2026-11-07', to: '2026-11-07' },
    eighth: { from: '2026-11-08', to: '2026-11-08' },
    firstOfNovember: { from: '2026-11-01', to: '2026-11-01' },
    lastOfOctober: { from: '2026-10-31', to: '2026-10-31' },
    november: { period: '2026-11' },
    october: { period: '2026-10' },
  };
  out.asked = {};
  out.excel = {};
  for (const [name, args] of Object.entries(queries)) {
    const found = await events(story, args);
    out.asked[name] = found.map((event) => event.eventId);
    const sheet = reportSheet(story, 'audit_trail', args);
    out.excel[name] = { ok: sheet.ok, fileName: sheet.data.fileName, sheets: sheet.data.sheets, xlsxBase64: sheet.data.xlsxBase64, events: found };
  }
  const wide = { from: '2026-10-01', to: '2026-12-31' };
  out.jsonAt = (await events(story, wide)).map((event) => event.at);
  out.chain = (await runTool(story, 'audit_trail', wide)).data.chain;
  out.words = auditTrailWords((await runTool(story, 'audit_trail', queries.november)).data);
  out.chat = {
    seventh: (await chat(story, 'show the audit trail for 2026-11-07')).reply,
    eighth: (await chat(story, 'show the audit trail for 2026-11-08')).reply,
  };

  const fixed = appendAuditEvent(createState(), { eventId: 'AUD-000001', actorId: 'USR-ADMIN', actorName: 'Admin', action: 'tool.create_invoice', at: '2026-11-08T02:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: { ok: true } });
  out.fixed = { at: fixed.at, hash: fixed.hash };

  const edgeState = createState();
  const labels = new Map();
  const walls = [
    [2026, 7, 31, 23, 59, 59], [2026, 8, 1, 0, 0, 0], [2026, 8, 14, 23, 59, 59], [2026, 8, 15, 0, 0, 0], [2026, 8, 15, 12, 0, 0], [2026, 8, 15, 23, 59, 59], [2026, 8, 16, 0, 0, 0], [2026, 8, 31, 23, 59, 59], [2026, 9, 1, 0, 0, 0],
    [2026, 12, 31, 23, 59, 59], [2027, 1, 1, 0, 0, 0],
    [2026, 3, 7, 23, 59, 59], [2026, 3, 8, 0, 0, 0], [2026, 3, 8, 23, 59, 59], [2026, 3, 9, 0, 0, 0],
    [2026, 9, 26, 23, 59, 59], [2026, 9, 27, 0, 0, 0], [2026, 9, 27, 23, 59, 59], [2026, 9, 28, 0, 0, 0],
    [2026, 10, 31, 23, 59, 59], [2026, 11, 1, 0, 0, 0], [2026, 11, 1, 23, 59, 59], [2026, 11, 2, 0, 0, 0],
  ];
  for (const parts of walls) labels.set(change(edgeState, stampOf(...parts)).eventId, wall(...parts));
  const labelled = async (args) => (await events(edgeState, args)).map((event) => labels.get(event.eventId));
  out.edges = { labels: [...labels.values()], days: {}, months: {} };
  for (const day of new Set([...labels.values()].map((label) => label.slice(0, 10)))) out.edges.days[day] = await labelled({ from: day, to: day });
  for (const month of new Set([...labels.values()].map((label) => label.slice(0, 7)))) out.edges.months[month] = await labelled({ period: month });
  return out;
}

async function clockProbe(modules) {
  const { openSession } = await import(modules.session);
  const { createMemoryStores } = await import(modules.stores);
  const { localToday } = await import(modules.dates);
  const s = openSession(createMemoryStores(), { seed: false });
  await s.signIn('USR-ADMIN', '1234');
  const proposed = await s.propose('create_invoice', { partyName: 'Kiran Stores', partyGstin: '', lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }] });
  const posted = await s.confirm(proposed.preview.token);
  const stamp = s.state.auditEvents.filter((event) => event.action === 'chat.confirm').at(-1).at;
  const made = new Date(stamp);
  const today = localToday(made);
  const asked = await s.tool('audit_trail', { from: today, to: today });
  const answer = await s.chat('show the audit trail for today');
  const two = (value) => String(value).padStart(2, '0');
  return {
    posted: posted.posted,
    stamp,
    utcDay: stamp.slice(0, 10),
    clock: `${two(made.getHours())}:${two(made.getMinutes())}`,
    today,
    todayAfter: localToday(),
    count: asked.data.count,
    actions: asked.data.events.map((event) => event.action),
    reply: answer.reply,
  };
}

function inZone(zone, probe) {
  const script = `const probe = ${probe.toString()}; process.stdout.write(JSON.stringify(await probe(${JSON.stringify(MODULES)})));`;
  const env = { ...process.env, TZ: zone };
  delete env.NODE_TEST_CONTEXT;
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60000, env });
  assert.equal(ran.status, 0, `${zone}: ${ran.signal || ''} ${ran.stderr}`);
  return JSON.parse(ran.stdout);
}

const probes = new Map();

function probeOf(zone) {
  if (!probes.has(zone)) probes.set(zone, inZone(zone, zoneProbe));
  return probes.get(zone);
}

function zoneWhereTodayDiffers(now = new Date()) {
  return now.getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago';
}

function storyIsFiledByLocalDay(zone, run) {
  const { ids } = run;
  assert.deepEqual(run.asked.seventh, [ids.evening], `${zone}: 18:00 on 7 November belongs to the 7th`);
  assert.deepEqual(run.asked.eighth, [], `${zone}: and not to the 8th`);
  assert.deepEqual(run.asked.firstOfNovember, [ids.early], `${zone}: 00:30 on 1 November belongs to the 1st`);
  assert.deepEqual(run.asked.lastOfOctober, [], `${zone}: and not to 31 October`);
  assert.deepEqual(run.asked.november, [ids.evening, ids.early], `${zone}: both belong to November`);
  assert.deepEqual(run.asked.october, [], `${zone}: and neither to October`);
}

test('TZ-1: a month holds its first and last local second, and the seconds around it belong to the months next door', async () => {
  const state = createState();
  const julyLast = change(state, local(2026, 7, 31, 23, 59, 59));
  const augustFirst = change(state, local(2026, 8, 1, 0, 0, 0));
  const augustMiddle = change(state, local(2026, 8, 15, 12, 0, 0));
  const augustLast = change(state, local(2026, 8, 31, 23, 59, 59));
  const septemberFirst = change(state, local(2026, 9, 1, 0, 0, 0));
  assert.deepEqual(await listed(state, { period: '2026-07' }), [julyLast]);
  assert.deepEqual(await listed(state, { period: '2026-08' }), [augustFirst, augustMiddle, augustLast]);
  assert.deepEqual(await listed(state, { period: '2026-09' }), [septemberFirst]);
  assert.deepEqual(await listed(state, { from: '2026-08-01', to: '2026-08-31' }), [augustFirst, augustMiddle, augustLast]);
  const range = periodRange({ period: '2026-08' }, '2026-08-31');
  assert.deepEqual(auditEventsIn(state, range, { view: 'all' }).events.map((event) => event.eventId), [augustFirst, augustMiddle, augustLast]);
});

test('TZ-1: a day holds 00:00:00 to 23:59:59 local, and the second before and the second after belong to the days next door', async () => {
  const state = createState();
  const before = change(state, local(2026, 8, 14, 23, 59, 59));
  const first = change(state, local(2026, 8, 15, 0, 0, 0));
  const noon = change(state, local(2026, 8, 15, 12, 0, 0));
  const last = change(state, local(2026, 8, 15, 23, 59, 59));
  const after = change(state, local(2026, 8, 16, 0, 0, 0));
  assert.deepEqual(await listed(state, { from: '2026-08-15', to: '2026-08-15' }), [first, noon, last]);
  assert.deepEqual(await listed(state, { from: '2026-08-14', to: '2026-08-14' }), [before]);
  assert.deepEqual(await listed(state, { from: '2026-08-16', to: '2026-08-16' }), [after]);
  assert.deepEqual(await listed(state, { from: '2026-08-15', to: '2026-08-16' }), [first, noon, last, after]);
  assert.deepEqual(await listed(state, { to: '2026-08-15' }), [before, first, noon, last]);
});

test('TZ-1: the chat words print the local date and time of each change, and a stamp that cannot be read prints as it was written', () => {
  const event = (at) => ({ at, actorId: 'USR-1', actorName: 'Asha', summary: 'Change' });
  const base = { from: '2026-10-01', to: '2026-10-31', view: 'changes', chain: { ok: true, chained: 0, unchained: 0 }, more: false };
  const edges = [event(local(2026, 10, 6, 6, 5, 30)), event(local(2026, 10, 7, 23, 59, 59)), event(local(2026, 10, 8, 0, 0, 0))];
  const lines = auditTrailWords({ ...base, count: 3, total: 3, events: edges }).split('\n');
  assert.deepEqual(lines.slice(1), ['· 2026-10-08 00:00 Asha: Change', '· 2026-10-07 23:59 Asha: Change', '· 2026-10-06 06:05 Asha: Change']);
  const unreadable = [event('2026-10-09T99:99:99Z'), event('2026-10-10 not a time'), event('')];
  const written = auditTrailWords({ ...base, count: 3, total: 3, events: unreadable }).split('\n');
  assert.deepEqual(written.slice(1), ['·   Asha: Change', '· 2026-10-10 not a Asha: Change', '· 2026-10-09 99:99 Asha: Change']);
});

test('TZ-1: a stamp that does not parse is still filed under its first ten characters', async () => {
  const state = createState();
  const badHour = change(state, '2026-08-15T99:99:99Z');
  const words = change(state, '2026-08-15 not a time');
  const real = change(state, local(2026, 8, 15, 12, 0, 0));
  const elsewhere = change(state, '2026-09-15T99:99:99Z');
  assert.deepEqual(await listed(state, { from: '2026-08-15', to: '2026-08-15' }), [badHour, words, real]);
  assert.deepEqual(await listed(state, { period: '2026-09' }), [elsewhere]);
});

test('TZ-1: in Los Angeles a change at 18:00 on 7 November is listed under 7 November, not under the 8th', () => {
  const run = probeOf('America/Los_Angeles');
  assert.equal(run.offsetMinutes, 480);
  assert.equal(run.stamps.evening, '2026-11-08T02:00:00.000Z', 'the stamp itself is still the UTC time');
  assert.deepEqual(run.asked.seventh, [run.ids.evening]);
  assert.deepEqual(run.asked.eighth, []);
  assert.deepEqual(run.asked.november, [run.ids.evening, run.ids.early]);
  assert.match(run.chat.seventh, /^1 change between 7 November 2026 and 7 November 2026, /);
  assert.ok(run.chat.seventh.split('\n').includes('· 7 November 2026 18:00 Admin: Create invoice (INV-0001)'), run.chat.seventh);
  assert.match(run.chat.eighth, /^0 changes between 8 November 2026 and 8 November 2026, /);
  assert.ok(run.words.split('\n').includes('· 2026-11-07 18:00 Admin: Create invoice (INV-0001)'), run.words);
});

test('TZ-1: in India a change at 00:30 on 1 November is listed under November, not under October', () => {
  const run = probeOf('Asia/Kolkata');
  assert.equal(run.offsetMinutes, -330);
  assert.equal(run.stamps.early, '2026-10-31T19:00:00.000Z', 'the stamp itself is still the UTC time');
  assert.deepEqual(run.asked.november, [run.ids.evening, run.ids.early]);
  assert.deepEqual(run.asked.october, []);
  assert.deepEqual(run.asked.firstOfNovember, [run.ids.early]);
  assert.deepEqual(run.asked.lastOfOctober, []);
  assert.ok(run.words.split('\n').includes('· 2026-11-01 00:30 Admin: Create invoice (INV-0001)'), run.words);
});

test('TZ-1: in Auckland a change at 00:30 on 1 November is listed under November and one at 18:00 on 7 November under the 7th', () => {
  const run = probeOf('Pacific/Auckland');
  assert.equal(run.offsetMinutes, -780);
  assert.equal(run.stamps.early, '2026-10-31T11:30:00.000Z');
  storyIsFiledByLocalDay('Pacific/Auckland', run);
  assert.ok(run.words.split('\n').includes('· 2026-11-01 00:30 Admin: Create invoice (INV-0001)'), run.words);
});

test('TZ-1: in UTC nothing moves', () => {
  const run = probeOf('UTC');
  assert.equal(run.offsetMinutes, 0);
  assert.equal(run.stamps.evening, '2026-11-07T18:00:00.000Z');
  assert.equal(run.stamps.early, '2026-11-01T00:30:00.000Z');
  storyIsFiledByLocalDay('UTC', run);
  assert.ok(run.words.split('\n').includes('· 2026-11-07 18:00 Admin: Create invoice (INV-0001)'), run.words);
  assert.ok(run.words.split('\n').includes('· 2026-11-01 00:30 Admin: Create invoice (INV-0001)'), run.words);
});

test('TZ-1: in every zone an event is filed under the local day and month it was made in', () => {
  for (const zone of ZONES) storyIsFiledByLocalDay(zone, probeOf(zone));
});

test('TZ-1: in every zone the first and last local second of a day and of a month are inside, and the seconds around them are outside', () => {
  for (const zone of ZONES) {
    const { edges } = probeOf(zone);
    assert.ok(Object.keys(edges.days).length >= 15, zone);
    for (const [day, got] of Object.entries(edges.days)) assert.deepEqual(got, edges.labels.filter((label) => label.startsWith(day)), `${zone}: day ${day}`);
    for (const [month, got] of Object.entries(edges.months)) assert.deepEqual(got, edges.labels.filter((label) => label.startsWith(month)), `${zone}: month ${month}`);
  }
});

test('TZ-1: in every zone the chat words show the local date and time, and the chat answers for the day asked', () => {
  for (const zone of ZONES) {
    const run = probeOf(zone);
    assert.deepEqual(run.words.split('\n').slice(1, 3), ['· 2026-11-01 00:30 Admin: Create invoice (INV-0001)', '· 2026-11-07 18:00 Admin: Create invoice (INV-0001)'], zone);
    assert.match(run.chat.seventh, /^1 change between 7 November 2026 and 7 November 2026, /, zone);
    assert.ok(run.chat.seventh.split('\n').includes('· 7 November 2026 18:00 Admin: Create invoice (INV-0001)'), `${zone}: ${run.chat.seventh}`);
    assert.match(run.chat.eighth, /^0 changes between 8 November 2026 and 8 November 2026, /, zone);
  }
});

test('TZ-1: the stamp, the hash and the chain do not depend on the zone', () => {
  const utc = probeOf('UTC');
  for (const zone of ZONES) {
    const run = probeOf(zone);
    assert.deepEqual(run.fixed, utc.fixed, zone);
    assert.equal(run.fixed.at, '2026-11-08T02:00:00.000Z', zone);
    assert.deepEqual(run.jsonAt, [run.stamps.evening, run.stamps.early], `${zone}: the at field stays the ISO UTC stamp`);
    assert.equal(run.chain.ok, true, zone);
    assert.equal(run.chain.chained, 2, zone);
  }
});

test('TZ-1: the Excel audit sheet and its summary follow the same local filter as the list', () => {
  for (const zone of ZONES) {
    const run = probeOf(zone);
    const expected = { seventh: 1, eighth: 0, firstOfNovember: 1, lastOfOctober: 0, november: 2, october: 0 };
    for (const [name, count] of Object.entries(expected)) {
      const sheet = run.excel[name];
      assert.equal(sheet.ok, true, `${zone}: ${name}`);
      assert.equal(sheet.sheets[0].name, 'Audit trail', `${zone}: ${name}`);
      assert.equal(sheet.sheets[0].rows, count, `${zone}: ${name} audit rows`);
      assert.deepEqual(sheet.events.map((event) => event.eventId), run.asked[name], `${zone}: ${name} the same events as the list`);
      const rows = sheetRows(sheet.xlsxBase64, 1);
      assert.equal(cell(rows[0], 'B'), 'When (UTC)', zone);
      assert.equal(rows.length - 1, count, `${zone}: ${name} rows in the file`);
      const summary = summaryOf(sheet.xlsxBase64);
      assert.equal(summary.get('Events'), count, `${zone}: ${name} summary events`);
      assert.equal(summary.get('Changes'), count, `${zone}: ${name} summary changes`);
      assert.equal(summary.get('Audit sheet sha256'), sha(JSON.stringify(auditSheetRows(sheet.events))), `${zone}: ${name} digest`);
    }
    const seventh = sheetRows(run.excel.seventh.xlsxBase64, 1);
    assert.equal(cell(seventh[1], 'B'), run.stamps.evening, `${zone}: the When (UTC) column keeps the UTC stamp`);
    const november = sheetRows(run.excel.november.xlsxBase64, 1);
    assert.deepEqual(november.slice(1).map((row) => cell(row, 'B')), [run.stamps.evening, run.stamps.early], zone);
    assert.equal(run.excel.october.fileName, 'myca-audit-trail-2026-10.xlsx', zone);
    assert.equal(run.excel.november.fileName, 'myca-audit-trail-2026-11.xlsx', zone);
    assert.equal(sheetRows(run.excel.seventh.xlsxBase64, 2).length - 1 > 0, true, `${zone}: the entries of the 7th`);
    assert.equal(sheetRows(run.excel.eighth.xlsxBase64, 2).length - 1, 0, `${zone}: no entries on the 8th`);
  }
});

test('TZ-1: a change made now is listed under today and answered for today in a zone whose date is not the UTC date', () => {
  let seen;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zone = zoneWhereTodayDiffers();
    seen = { zone, ...inZone(zone, clockProbe) };
    if (seen.today !== seen.utcDay && seen.today === seen.todayAfter) break;
  }
  assert.equal(seen.posted, true);
  assert.notEqual(seen.today, seen.utcDay, `${seen.zone}: the local date and the UTC date differ for this test to mean anything`);
  assert.equal(seen.count, 1, `${seen.zone}: ${seen.stamp} is local ${seen.today}`);
  assert.deepEqual(seen.actions, ['chat.confirm']);
  assert.match(seen.reply, /^1 change between /, seen.reply);
  assert.match(seen.reply.split('\n')[1], new RegExp(`^· \\d{1,2} [A-Z][a-z]+ \\d{4} ${seen.clock} Firm Admin: Posted Create invoice \\(INV-0001(?:, \\d+)*\\)$`), seen.reply);
});
