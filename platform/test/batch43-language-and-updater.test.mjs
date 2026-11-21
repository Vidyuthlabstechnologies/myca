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
import { languageOf, figuresOf, figuresKept, localDecision } from '../src/chat-language.mjs';
import { localToday } from '../src/dates.mjs';
import { openSession } from '../src/session.mjs';
import { withChatLanguage } from '../../cloud/src/chat-text.mjs';

const require = createRequire(import.meta.url);
const { pickAssets, parseSums, signatureVerdict, commonNameOf, fetchAndVerify, runInstallerSilently } = require('../desktop/update-install.cjs');
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
  const THUMB = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678';
  const signer = { commonName: 'Vidyuthlabs Technologies Private Limited', thumbprints: [THUMB] };
  const signedBy = (subject, thumbprint = THUMB, status = 'Valid') => async () => ({ ok: true, stdout: JSON.stringify({ Status: status, Subject: subject, Thumbprint: thumbprint }) });
  const good = await fetchAndVerify(found, { fetchImpl, dir, signer, checkSignature: signedBy('CN=Vidyuthlabs Technologies Private Limited, O=Vidyuthlabs Technologies Private Limited, C=IN') });
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(good.sha256, sha);
  assert.equal(good.thumbprint, THUMB);
  const unsigned = await fetchAndVerify(found, { fetchImpl, dir, signer, checkSignature: signedBy('', '', 'NotSigned') });
  assert.equal(unsigned.error, 'SIGNATURE_NOT_VALID');
  const stranger = await fetchAndVerify(found, { fetchImpl, dir, signer, checkSignature: signedBy('CN=Vidyuthlabs Technologies Private Limited', 'F'.repeat(40)) });
  assert.equal(stranger.error, 'SIGNATURE_WRONG_PUBLISHER', 'a valid signature from another certificate is refused');
  const lookalike = await fetchAndVerify(found, { fetchImpl, dir, signer, checkSignature: signedBy('CN=Vidyuthlabs Technologies Private Limited Ltd') });
  assert.equal(lookalike.error, 'SIGNATURE_WRONG_PUBLISHER', 'the common name must match exactly');
  const unpinned = await fetchAndVerify(found, { fetchImpl, dir, checkSignature: signedBy('CN=Vidyuthlabs Technologies Private Limited') });
  assert.equal(unpinned.error, 'SIGNER_NOT_PINNED', 'until a thumbprint is pinned in the app nothing installs quietly');
  const tampered = await fetchAndVerify(found, { fetchImpl: async (url) => (/SHA256SUMS$/.test(url) ? { ok: true, text: async () => sums.replace(sha, 'f'.repeat(64)) } : fetchImpl(url)), dir, signer, checkSignature: signedBy('CN=Vidyuthlabs Technologies Private Limited') });
  assert.equal(tampered.error, 'SHA256_MISMATCH');
  assert.equal(commonNameOf('CN="Vidyuthlabs, Inc.", O=X'), 'Vidyuthlabs, Inc.');
  assert.equal(commonNameOf('O=X, CN=Plain Name, C=IN'), 'Plain Name');
  assert.deepEqual(signatureVerdict('garbage'), { ok: false, error: 'SIGNATURE_UNREADABLE' });

  const spawned = [];
  const fakeSpawn = (path, args, opts) => { spawned.push({ path, args, detached: opts.detached }); return { unref() {}, pid: 42 }; };
  assert.deepEqual(runInstallerSilently(good.path, fakeSpawn), { ok: true, pid: 42 });
  assert.deepEqual(spawned, [{ path: good.path, args: ['/S'], detached: true }]);
  writeFileSync(join(dir, 'keep'), '');
});

const INDIA = {
  'मेहता ब्रदर्सना डिझेलसाठी 1,200 रुपये दिले': 'paid 1200 to Mehta Brothers for diesel',
  'हो': 'yes',
  'இந்த மாதம் வியாபாரம் எப்படி?': 'how is business?',
  'ಈ ತಿಂಗಳು ವ್ಯಾಪಾರ ಹೇಗಿದೆ?': 'how is business?',
  'এই মাসে ব্যবসা কেমন?': 'how is business?',
  'મહેતા બ્રધર્સને ડીઝલ માટે ૧,૨૦૦ રૂપિયા આપ્યા': 'paid 1200 to Mehta Brothers for diesel',
};
const TAGS = { Hindi: 'hi', Marathi: 'mr', Gujarati: 'gu', Tamil: 'ta', Telugu: 'te', Kannada: 'kn', Bengali: 'bn' };
function indiaTranslator(calls = [], { changeFiguresBack = false } = {}) {
  return (body) => {
    if (body.tool_choice?.name !== 'translation') return { ok: false, error: 'MODEL_NO_MATCH' };
    const text = body.messages[0].content;
    const [, from, to] = /Translate from (\w+) to (\w+)\.$/.exec(body.system);
    calls.push({ from, to, text });
    let out;
    if (to === 'English') out = INDIA[text] ?? TRANSLATIONS[text] ?? text;
    else out = `[${TAGS[to]}] ${changeFiguresBack ? text.replace(/\d/g, '9') : text}`;
    return { ok: true, response: { content: [{ type: 'tool_use', id: 'tu_1', name: 'translation', input: { text: out } }] } };
  };
}

test('a Devanagari message with the app in Marathi is read as Marathi and answered in Marathi; without the hint it is still Hindi', async () => {
  const state = books();
  await runTool(state, 'set_cash_balance', { bank: 100000, cash: 0, on: TODAY });
  const calls = [];
  setModelTransport(indiaTranslator(calls));
  assert.equal(languageOf('मेहता ब्रदर्सना 1200 दिले', 'mr'), 'mr');
  assert.equal(languageOf('मेहता ब्रदर्सना 1200 दिले'), 'hi');
  const held = await chat(state, 'मेहता ब्रदर्सना डिझेलसाठी 1,200 रुपये दिले', { lang: 'mr' });
  assert.equal(held.language, 'mr');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(calls[0].from, 'Marathi');
  assert.match(held.reply, /^\[mr\] /, held.reply);
  assert.match(held.reply, /इंग्रजीत असे समजले: "paid 1200 to Mehta Brothers for diesel"/);
  const done = await chat(state, 'हो', { lang: 'mr' });
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.localDecision, true);
  assert.match(done.reply, /^\[mr\] Posted EXP-0001/, done.reply);
  assert.equal(state.expenses[0].amount, 1200);

  setModelTransport(null);
  delete process.env.MYCA_MODEL_API_KEY;
  const off = await chat(books(), 'मेहता ब्रदर्सना 1200 दिले', { lang: 'mr' });
  assert.equal(off.blocked, true);
  assert.match(off.reply, /मराठीत बोलण्यासाठी/);
});

test('Tamil, Kannada, Bengali and Gujarati are told by their script, answered in the same language, and their own digits count as figures', async () => {
  assert.equal(languageOf('மேத்தாவுக்கு 1200 கொடுத்தேன்'), 'ta');
  assert.equal(languageOf('ಮೆಹ್ತಾಗೆ 1200 ಕೊಟ್ಟೆ'), 'kn');
  assert.equal(languageOf('মেহতাকে ১২০০ দিলাম'), 'bn');
  assert.equal(languageOf('મહેતાને ૧૨૦૦ આપ્યા'), 'gu');
  for (const digits of ['१२००', '১২০০', '૧૨૦૦', '௧௨௦௦', '౧౨౦౦', '೧೨೦೦']) assert.deepEqual(figuresOf(`₹${digits}`), ['1200'], digits);
  assert.equal(figuresKept('paid 1,200.50 on 2026-10-21', 'মেহতাকে ১,২০০.৫০ ২০২৬-১০-২১'), true);
  assert.equal(figuresKept('paid 1200', 'મહેતાને ૧૩૦૦ આપ્યા'), false);

  const state = books();
  await runTool(state, 'set_cash_balance', { bank: 100000, cash: 0, on: TODAY });
  const calls = [];
  setModelTransport(indiaTranslator(calls));
  for (const [message, code, name] of [['இந்த மாதம் வியாபாரம் எப்படி?', 'ta', 'Tamil'], ['ಈ ತಿಂಗಳು ವ್ಯಾಪಾರ ಹೇಗಿದೆ?', 'kn', 'Kannada'], ['এই মাসে ব্যবসা কেমন?', 'bn', 'Bengali']]) {
    calls.length = 0;
    const out = await chat(state, message);
    assert.equal(out.language, code);
    assert.equal(out.translated, true, out.reply);
    assert.equal(calls[0].from, name);
    assert.match(out.reply, new RegExp(`^\\[${code}\\] `), out.reply);
  }
  const held = await chat(state, 'મહેતા બ્રધર્સને ડીઝલ માટે ૧,૨૦૦ રૂપિયા આપ્યા');
  assert.equal(held.language, 'gu');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const done = await chat(state, 'હા');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^\[gu\] Posted/, done.reply);
  assert.equal(state.expenses[0].amount, 1200);
  for (const no of ['வேண்டாம்', 'ಬೇಡ', 'না', 'ના', 'नको']) assert.equal(localDecision(no), 'no', no);
  for (const yes of ['ஆமா', 'ಹೌದು', 'হ্যাঁ', 'હા', 'हो', 'అవును', 'हाँ']) assert.equal(localDecision(yes), 'yes', yes);
});

test('an English message with the app in Hindi gets a Hindi reply; a changed figure, a missing model or lang "en" leave the plain English reply', async () => {
  const state = books();
  await runTool(state, 'set_cash_balance', { bank: 100000, cash: 0, on: TODAY });
  const english = await chat(books(), 'paid 1200 to Mehta Brothers for diesel');
  const plain = await chat(books(), 'paid 1200 to Mehta Brothers for diesel', { lang: 'en' });
  const same = (out) => JSON.stringify(out).replaceAll(out.preview?.token || '\u0000', 'TOKEN');
  assert.equal(same(plain), same(english), 'lang "en" is the same as no lang');

  setModelTransport(indiaTranslator());
  const hindi = await chat(state, 'paid 1200 to Mehta Brothers for diesel', { lang: 'hi' });
  assert.equal(hindi.language, 'hi');
  assert.equal(hindi.translated, true);
  assert.equal(hindi.awaitingConfirmation, true, hindi.reply);
  assert.match(hindi.reply, /^\[hi\] /);
  assert.match(hindi.replyEnglish, /₹1,200\.00/);
  assert.equal(hindi.reply, `[hi] ${hindi.replyEnglish}`);
  const yes = await chat(state, 'yes', { lang: 'hi' });
  assert.equal(yes.posted, true, yes.reply);
  assert.match(yes.reply, /^\[hi\] Posted/);

  setModelTransport(indiaTranslator([], { changeFiguresBack: true }));
  const changed = await chat(books(), 'paid 1200 to Mehta Brothers for diesel', { lang: 'ta' });
  assert.equal(changed.translated, undefined);
  assert.equal(changed.language, undefined);
  assert.doesNotMatch(changed.reply, /^\[ta\]/);
  assert.match(changed.reply, /₹1,200\.00/);

  setModelTransport(null);
  delete process.env.MYCA_MODEL_API_KEY;
  const noModel = await chat(books(), 'paid 1200 to Mehta Brothers for diesel', { lang: 'kn' });
  assert.equal(noModel.blocked, undefined, noModel.reply);
  assert.equal(same(noModel), same(english));
  const unknown = await chat(books(), 'paid 1200 to Mehta Brothers for diesel', { lang: 'xx' });
  assert.equal(same(unknown), same(english));
});

test('the app language travels from the cloud request through the session to the reply', async () => {
  const actor = { actor: { userId: 'u1', role: 'owner', name: 'Owner' } };
  assert.equal(withChatLanguage(actor, undefined), actor);
  assert.equal(withChatLanguage(actor, 'en'), actor);
  assert.equal(withChatLanguage(actor, 'not a code'), actor);
  assert.deepEqual(withChatLanguage(actor, 'MR'), { ...actor, lang: 'mr' });
  const session = openSession(join(mkdtempSync(join(tmpdir(), 'myca-chat-lang-')), 'MyCA', 'state.json'));
  setModelTransport(indiaTranslator());
  const out = await session.chat('how is business?', withChatLanguage(actor, 'bn'));
  assert.equal(out.language, 'bn');
  assert.match(out.reply, /^\[bn\] /, out.reply);
  const english = await session.chat('how is business?');
  assert.doesNotMatch(english.reply, /^\[/);
});
