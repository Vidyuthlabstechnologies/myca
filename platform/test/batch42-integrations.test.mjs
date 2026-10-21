import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-integrations-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { setModelTransport } from '../src/model-adapter.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { parseTallyReply, planTallyPush, pushTally } from '../src/tally-push.mjs';
import { signBytesWithCertificate, verifyDetachedSignature, listDscCertificates } from '../src/dsc.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { localToday } from '../src/dates.mjs';

const require = createRequire(import.meta.url);
const { compareVersions, parseLatest, checkForUpdate } = require('../desktop/update-check.cjs');
const TODAY = localToday();
const MONTH = TODAY.slice(0, 7);
const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_1', name, input }] });
afterEach(() => { setModelTransport(null); process.env.MYCA_MOCK_MODE = '1'; });

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  state._documents = createMemoryDocumentStore();
  return state;
}

test('the month is sent to Tally on this machine once, with the reply counted and a second send refused until asked again', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Arjun Stores', lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }], date: TODAY });
  assert.equal(planTallyPush(state, { url: 'http://tally.example.com:9000' }).error, 'TALLY_NOT_LOCAL');
  assert.equal(planTallyPush(state, { period: '2020-01' }).error, 'NOTHING_TO_PUSH');

  const held = await chat(state, `push ${MONTH} to Tally`);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Send .* to Tally at http:\/\/127\.0\.0\.1:9000: 1 voucher and \d+ ledger masters into company "Nalanda Textiles"\./, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^Simulated: .*Tally created \d+ and altered 0\. Nothing was sent\./, done.reply);
  assert.equal(state.tallyPushes[MONTH].mock, true);

  const twice = await chat(state, `push ${MONTH} to Tally`);
  assert.match(twice.reply, /already sent to Tally on .*only after deleting those vouchers in Tally/, twice.reply);
  assert.equal(twice.awaitingConfirmation, undefined);
  const again = await chat(state, `push ${MONTH} to Tally again`);
  assert.equal(again.awaitingConfirmation, true, again.reply);
  assert.match(again.reply, /second send of the same month/);
  await chat(state, 'no');

  process.env.MYCA_MOCK_MODE = '0';
  const received = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push(body);
      res.setHeader('content-type', 'text/xml');
      res.end(body.includes('<REJECT/>') ? '<RESPONSE><CREATED>0</CREATED><ALTERED>0</ALTERED><ERRORS>1</ERRORS><LINEERROR>Ledger does not exist</LINEERROR></RESPONSE>' : '<RESPONSE><CREATED>7</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const sent = await pushTally(state, { period: MONTH, url, again: true });
    assert.equal(sent.ok, true, JSON.stringify(sent));
    assert.equal(sent.push.created, 7);
    assert.equal(sent.push.mock, false);
    assert.match(received[0], /<TALLYREQUEST>Import Data<\/TALLYREQUEST>/);
    assert.match(received[0], /<SVCURRENTCOMPANY>Nalanda Textiles<\/SVCURRENTCOMPANY>/);
    assert.match(received[0], /Arjun Stores/);
    assert.equal(state.tallyPushes[MONTH].created, 7);
    const dead = await pushTally(state, { period: MONTH, url: 'http://127.0.0.1:1', again: true });
    assert.equal(dead.error, 'TALLY_UNREACHABLE');
  } finally {
    server.close();
  }
  assert.deepEqual(parseTallyReply('<RESPONSE><CREATED>2</CREATED><ALTERED>1</ALTERED><ERRORS>1</ERRORS><LINEERROR> Voucher  rejected </LINEERROR></RESPONSE>'), { created: 2, altered: 1, errors: 1, lineErrors: ['Voucher rejected'] });
  assert.equal(isRemoteQuery('push_tally'), false, 'the phone cannot push to a desktop Tally');
});

test('a signature with the DSC runs through the action gate: simulated in mock mode, stored beside the books, and never from the phone', async () => {
  const state = books();
  const { sha256 } = state._documents.put('{"gstin":"27AABCU9603R1ZN","ret_period":"092026"}');
  state.pendingFile = { kind: 'gstr1', name: 'gstr1.json', sha256 };
  const bad = await runTool(state, 'dsc_sign', { documentSha256: sha256, thumbprint: 'nope' });
  assert.equal(bad.error, 'BAD_THUMBPRINT');
  const thumb = 'A'.repeat(40);
  const signed = await chat(state, `sign GSTR-1 September with ${thumb}`);
  assert.match(signed.reply, /^Simulated: DSC-0001: signed GSTR-1 September with certificate AAAAAAAA… on .*detached PKCS#7 signature is stored as document [0-9a-f]{12}\. No token was used\./, signed.reply);
  assert.equal(state.dscSignatures.length, 1);
  assert.equal(state.dscSignatures[0].sha256, sha256);
  assert.equal(state.dscSignatures[0].mock, true);
  assert.ok(state._documents.exists(state.dscSignatures[0].signatureSha256), 'the signature bytes are in the document store');
  assert.ok(state.auditEvents.some((e) => /dsc_sign/.test(JSON.stringify(e))), 'the gate recorded the audit event');
  state.pendingFile = null;
  const nothing = await chat(state, `sign the return with ${thumb}`);
  assert.match(nothing.reply, /Attach or upload the document to sign first/, nothing.reply);
  assert.equal(isRemoteQuery('dsc_sign'), false);
  assert.equal(isRemoteQuery('dsc_certificates'), false);
});

test('on Windows a certificate in the user store signs a detached PKCS#7 that verifies, and the list names it', { skip: process.platform !== 'win32' }, async () => {
  const made = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(New-SelfSignedCertificate -Subject "CN=MyCA DSC Test" -CertStoreLocation Cert:\\CurrentUser\\My -KeyAlgorithm RSA -KeyLength 2048 -Type Custom -KeyUsage DigitalSignature -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddDays(1)).Thumbprint'], { encoding: 'utf8', timeout: 60000 }).trim();
  assert.match(made, /^[0-9A-F]{40}$/, made);
  try {
    const listed = await listDscCertificates();
    assert.equal(listed.ok, true, JSON.stringify(listed));
    const mine = listed.certificates.find((c) => c.thumbprint === made);
    assert.ok(mine, 'the test certificate is listed');
    assert.equal(mine.expired, false);
    const bytes = Buffer.from('MyCA signs this', 'utf8');
    const signed = await signBytesWithCertificate(bytes, made);
    assert.equal(signed.ok, true, JSON.stringify(signed));
    const verified = await verifyDetachedSignature(bytes, signed.signature);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.equal(verified.thumbprint, made);
    const tampered = await verifyDetachedSignature(Buffer.from('MyCA signs that', 'utf8'), signed.signature);
    assert.equal(tampered.ok, false, 'a changed payload fails the check');
    const missing = await signBytesWithCertificate(bytes, 'B'.repeat(40));
    assert.equal(missing.error, 'DSC_CERT_NOT_FOUND');
  } finally {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item Cert:\\CurrentUser\\My\\${made}`], { timeout: 30000 });
  }
});

test('the desktop update check compares release tags and only offers a download on the project\'s own release page', async () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('v0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.0', '1.0.0'), -1);
  assert.equal(parseLatest({ tag_name: 'v0.3.1', html_url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/tag/v0.3.1' }).url, 'https://github.com/Vidyuthlabstechnologies/myca/releases/tag/v0.3.1');
  assert.equal(parseLatest({ tag_name: 'v0.3.1', html_url: 'https://evil.example/download' }).url, '', 'a foreign link is dropped');
  assert.equal(parseLatest({ tag_name: 'v0.3.1', prerelease: true }), null);
  const fetchImpl = async () => ({ ok: true, json: async () => ({ tag_name: 'v0.2.0', html_url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/tag/v0.2.0' }) });
  const found = await checkForUpdate({ current: '0.1.0', fetchImpl });
  assert.deepEqual(found, { ok: true, newer: true, current: '0.1.0', latest: '0.2.0', url: 'https://github.com/Vidyuthlabstechnologies/myca/releases/tag/v0.2.0', assets: null });
  assert.equal((await checkForUpdate({ current: '0.2.0', fetchImpl })).newer, false);
  assert.equal((await checkForUpdate({ current: '0.1.0', fetchImpl: async () => { throw new Error('offline'); } })).error, 'UPDATE_UNREACHABLE');
});

test('with MYCA_TOKEN_IN_PAGE=0 the served page carries no token, so only the preload bridge can hand it to the renderer', () => {
  const home = mkdtempSync(join(tmpdir(), 'myca-token-'));
  const server = new URL('../src/server.mjs', import.meta.url).href;
  const script = [
    "import http from 'node:http';",
    `const { startServer, apiClientToken } = await import(${JSON.stringify(server)});`,
    'const started = await startServer(0);',
    'const token = apiClientToken();',
    'const page = await new Promise((done) => http.get({ host: "127.0.0.1", port: started.port, path: "/" }, (res) => { let b = ""; res.setEncoding("utf8"); res.on("data", (c) => { b += c; }); res.on("end", () => done(b)); }));',
    'console.log("RESULT" + JSON.stringify({ token, hasToken: page.includes(token), hasMarker: page.includes("__MYCA_API_TOKEN__"), emptyMeta: page.includes(\'name="myca-api-token" content=""\') }));',
    'process.exit(0);',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, APPDATA: home, HOME: home, MYCA_TOKEN_IN_PAGE: '0', MYCA_API_TOKEN: 'f'.repeat(64) }, encoding: 'utf8', timeout: 60000 });
  rmSync(home, { recursive: true, force: true });
  assert.equal(child.status, 0, child.stderr);
  const out = JSON.parse(child.stdout.split('\n').find((l) => l.startsWith('RESULT')).slice(6));
  assert.equal(out.token, 'f'.repeat(64), 'the launcher-supplied token is used');
  assert.equal(out.hasToken, false);
  assert.equal(out.hasMarker, false);
  assert.equal(out.emptyMeta, true);
});

test('an expense whose wording nothing has seen before gets its head from the model, shown as such in the preview and changeable', async () => {
  const state = books();
  await runTool(state, 'set_cash_balance', { bank: 100000, cash: 0, on: TODAY });
  setModelTransport(async (body) => {
    assert.equal(body.tool_choice.name, 'choose');
    assert.match(body.messages[0].content, /zarpetta rolls paid to Mehta Bros/);
    const allowed = body.tools[0].input_schema.properties.value.enum;
    assert.ok(allowed.includes('5240') && allowed.includes('none') && !allowed.includes('5100'));
    return { ok: true, response: toolUse('choose', { value: '5240' }) };
  });
  const held = await chat(state, 'paid 1200 to Mehta Bros for zarpetta rolls');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^Packing material: /, held.reply);
  assert.match(held.reply, /reads as Packing material to the model; tap to change it/, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.expenses[0].head, '5240');
  assert.equal(state.expenses[0].tagSource ?? state.expenses[0].source ?? 'model', 'model');

  setModelTransport(async () => ({ ok: true, response: toolUse('choose', { value: 'none' }) }));
  const vague = await chat(state, 'paid 300 to Mehta Bros for sundries');
  assert.match(vague.reply, /^Other expenses: /, vague.reply);
  await chat(state, 'no');
  setModelTransport(null);
  const direct = await runTool(state, 'suggest_expense_head', { description: 'zarpetta rolls' });
  assert.equal(direct.error, 'MODEL_NOT_CONFIGURED');
});
