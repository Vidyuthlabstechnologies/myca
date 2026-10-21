import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-language-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { setModelTransport } from '../src/model-adapter.mjs';
import { languageOf, figuresOf, figuresKept } from '../src/chat-language.mjs';
import { localToday } from '../src/dates.mjs';

const require = createRequire(import.meta.url);
const { pickAssets, parseSums, signatureVerdict, fetchAndVerify, runInstallerSilently } = require('../desktop/update-install.cjs');
const { checkForUpdate } = require('../desktop/update-check.cjs');
const TODAY = localToday();
afterEach(() => setModelTransport(null));

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const TRANSLATIONS = {
  'मेहता ब्रदर्स को 1,200 रुपये डीज़ल के लिए दिए': 'paid 1200 to Mehta Brothers for diesel',
  'हाँ': 'yes',
  'ఈ నెల అమ్మకాలు ఎంత?': 'how is business?',
};
function translator(body) {
  if (body.tool_choice?.name !== 'translation') return { ok: false, error: 'MODEL_NO_MATCH' };
  const text = body.messages[0].content;
  const toEnglish = /to English\.$/.test(body.system);
  let out;
  if (toEnglish) out = TRANSLATIONS[text] ?? text;
  else out = `[${/to Hindi/.test(body.system) ? 'hi' : 'te'}] ${text}`;
  return { ok: true, response: { content: [{ type: 'tool_use', id: 'tu_1', name: 'translation', input: { text: out } }] } };
}

test('the script tells the language, and figures survive the round trip, Devanagari and Telugu digits included', () => {
  assert.equal(languageOf('paid 1200 to Mehta'), null);
  assert.equal(languageOf('मेहता को 1200 दिए'), 'hi');
  assert.equal(languageOf('మెహతాకు 1200 ఇచ్చాను'), 'te');
  assert.deepEqual(figuresOf('₹1,200.50 on 2026-10-21 for INV-0003'), ['1200.50', '2026', '10', '21', '0003']);
  assert.deepEqual(figuresOf('१२०० रुपये'), ['1200']);
  assert.equal(figuresKept('paid 1200 to Mehta', 'मेहता को १,२०० दिए'), true);
  assert.equal(figuresKept('paid 1200 to Mehta', 'मेहता को 1300 दिए'), false);
});

test('a Hindi message is understood through the model, the books change exactly as in English, and the reply comes back in Hindi with the figures intact', async () => {
  const state = books();
  await runTool(state, 'set_cash_balance', { bank: 100000, cash: 0, on: TODAY });
  setModelTransport(translator);
  const held = await chat(state, 'मेहता ब्रदर्स को 1,200 रुपये डीज़ल के लिए दिए');
  assert.equal(held.language, 'hi');
  assert.equal(held.understood, 'paid 1200 to Mehta Brothers for diesel');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^\[hi\] Travel and conveyance: /, held.reply);
  assert.match(held.replyEnglish, /₹1,200\.00/);
  const done = await chat(state, 'हाँ');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^\[hi\] Posted EXP-0001/, done.reply);
  assert.equal(state.expenses[0].amount, 1200);
  assert.equal(state.expenses[0].payee, 'Mehta Brothers');
});

test('a Telugu question is answered in Telugu; a translation that changes a figure is refused; without a model key the reply says so in the owner\'s language and records nothing', async () => {
  const state = books();
  setModelTransport(translator);
  const asked = await chat(state, 'ఈ నెల అమ్మకాలు ఎంత?');
  assert.equal(asked.language, 'te');
  assert.match(asked.reply, /^\[te\] /, asked.reply);
  assert.equal(asked.translated, true);

  setModelTransport((body) => (/to English\.$/.test(body.system)
    ? { ok: true, response: { content: [{ type: 'tool_use', id: 'tu_1', name: 'translation', input: { text: 'paid 1300 to Mehta Brothers for diesel' } }] } }
    : translator(body)));
  const changed = await chat(state, 'मेहता ब्रदर्स को 1,200 रुपये डीज़ल के लिए दिए');
  assert.equal(changed.blocked, true);
  assert.match(changed.reply, /संख्याओं का अंदाज़ा नहीं लगाता/, changed.reply);
  assert.equal(state.pendingChatAction, null);

  setModelTransport(null);
  delete process.env.MYCA_MODEL_API_KEY;
  const off = await chat(state, 'మెహతాకు 1200 ఇచ్చాను');
  assert.equal(off.blocked, true);
  assert.match(off.reply, /MYCA_MODEL_API_KEY/);
  assert.equal(state.expenses.length, 0);
});

test('the quiet updater takes only the project\'s own installer and checksum, verifies the SHA-256 and the publisher signature, and refuses anything else', async () => {
  const release = {
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/tag/v0.2.0',
    assets: [
      { name: 'MyCA Setup 0.2.0.exe', browser_download_url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/download/v0.2.0/MyCA.Setup.0.2.0.exe', size: 12 },
      { name: 'MyCA 0.2.0.exe', browser_download_url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/download/v0.2.0/MyCA.0.2.0.exe', size: 12 },
      { name: 'SHA256SUMS', browser_download_url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/download/v0.2.0/SHA256SUMS', size: 200 },
    ],
  };
  const picked = pickAssets(release.assets);
  assert.equal(picked.installer.name, 'MyCA Setup 0.2.0.exe');
  assert.equal(pickAssets([{ name: 'MyCA Setup 0.2.0.exe', browser_download_url: 'https://evil.example/x.exe' }, release.assets[2]]), null, 'a foreign host is never an update');
  const bytes = Buffer.from('not really an installer');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const sums = `${sha}  MyCA Setup 0.2.0.exe\n${'0'.repeat(64)}  MyCA 0.2.0.exe\n`;
  assert.deepEqual(parseSums(sums), { 'MyCA Setup 0.2.0.exe': sha, 'MyCA 0.2.0.exe': '0'.repeat(64) });

  const fetchImpl = async (url) => {
    if (/SHA256SUMS$/.test(url)) return { ok: true, text: async () => sums };
    if (/releases\/latest$/.test(url)) return { ok: true, json: async () => release };
    return { ok: true, headers: { get: () => String(bytes.length) }, body: new Blob([bytes]).stream() };
  };
  const found = await checkForUpdate({ current: '0.1.0', fetchImpl, url: 'https://api.github.com/repos/Vidyuthlabstechnologies/myca/releases/latest' });
  assert.equal(found.newer, true);
  assert.equal(found.assets.installer.name, 'MyCA Setup 0.2.0.exe');

  const dir = mkdtempSync(join(tmpdir(), 'myca-upd-'));
  const signedBy = (subject, status = 'Valid') => async () => ({ ok: true, stdout: JSON.stringify({ Status: status, Subject: subject }) });
  const good = await fetchAndVerify(found, { fetchImpl, dir, checkSignature: signedBy('CN=Vidyuthlabs Technologies Private Limited, O=Vidyuthlabs Technologies Private Limited, C=IN') });
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(good.sha256, sha);
  const unsigned = await fetchAndVerify(found, { fetchImpl, dir, checkSignature: signedBy('', 'NotSigned') });
  assert.equal(unsigned.error, 'SIGNATURE_NOT_VALID');
  const stranger = await fetchAndVerify(found, { fetchImpl, dir, checkSignature: signedBy('CN=Someone Else') });
  assert.equal(stranger.error, 'SIGNATURE_WRONG_PUBLISHER');
  const tampered = await fetchAndVerify(found, { fetchImpl: async (url) => (/SHA256SUMS$/.test(url) ? { ok: true, text: async () => sums.replace(sha, 'f'.repeat(64)) } : fetchImpl(url)), dir, checkSignature: signedBy('CN=Vidyuthlabs') });
  assert.equal(tampered.error, 'SHA256_MISMATCH');
  assert.deepEqual(signatureVerdict('garbage'), { ok: false, error: 'SIGNATURE_UNREADABLE' });

  const spawned = [];
  const fakeSpawn = (path, args, opts) => { spawned.push({ path, args, detached: opts.detached }); return { unref() {}, pid: 42 }; };
  assert.deepEqual(runInstallerSilently(good.path, fakeSpawn), { ok: true, pid: 42 });
  assert.deepEqual(spawned, [{ path: good.path, args: ['/S'], detached: true }]);
  writeFileSync(join(dir, 'keep'), '');
});
