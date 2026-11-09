import { mkdtempSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-sandbox-keys-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';
for (const name of ['MYCA_GSP_API_KEY', 'MYCA_GSP_API_SECRET', 'MYCA_GSP_TEST_API_KEY', 'MYCA_GSP_TEST_API_SECRET', 'MYCA_GSP_LIVE_API_KEY', 'MYCA_GSP_LIVE_API_SECRET', 'MYCA_GSP_ENV', 'MYCA_GSP_BASE_URL']) delete process.env[name];

import { test, before, after } from 'node:test';
const HIDDEN_ENV_FILES = [];
before(() => {
  for (const name of ['.env', '.env.production', '.env.local']) {
    const here = new URL(`../${name}`, import.meta.url);
    try {
      if (!existsSync(here)) continue;
      const away = new URL(`../${name}.test-hidden`, import.meta.url);
      renameSync(here, away);
      HIDDEN_ENV_FILES.push([away, here]);
    } catch { /* a file that cannot move stays; its keys are the operator's own */ }
  }
});
after(() => {
  for (const [away, here] of HIDDEN_ENV_FILES.splice(0)) {
    try { renameSync(away, here); } catch { /* restore what can be restored */ }
  }
});
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { SandboxClient, getSandboxClient } from '../src/sandbox-client.mjs';
import { sandboxKeysPath, saveSandboxKeys } from '../src/sandbox-keys.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

test('sandbox keys saved from the page are encrypted on disk, picked up by the next sandbox call, masked when shown, and forgotten on request', async () => {
  const state = createState();
  const before = await runTool(state, 'sandbox_keys', {});
  assert.equal(before.data.apiKeySet, false);
  assert.equal(before.data.environment, 'test');
  assert.equal(before.data.baseUrl, 'https://test-api.sandbox.co.in');

  const bad = await runTool(state, 'sandbox_save_keys', { apiKey: 'key_live_abcdef123456', apiSecret: 'has a space in it' });
  assert.equal(bad.error, 'BAD_KEY_SHAPE');
  const foreign = await runTool(state, 'sandbox_save_keys', { apiKey: 'key_test_abcdef123456', apiSecret: 'secret_test_abcdef123456', baseUrl: 'https://evil.example/api' });
  assert.equal(foreign.error, 'BAD_BASE_URL');

  const saved = await runTool(state, 'sandbox_save_keys', { environment: 'test', apiKey: 'key_test_abcdef123456', apiSecret: 'secret_test_abcdef123456' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.data.apiKeySet, true);
  assert.equal(saved.data.apiKeyHint, '••••3456');
  assert.equal(saved.data.baseUrl, 'https://test-api.sandbox.co.in');
  assert.ok(existsSync(sandboxKeysPath()));
  const onDisk = readFileSync(sandboxKeysPath(), 'utf8');
  assert.ok(!onDisk.includes('key_test_abcdef123456') && !onDisk.includes('secret_test_abcdef123456'), 'the key and secret are not in plain text on disk');

  const client = getSandboxClient();
  assert.equal(client.apiKey, 'key_test_abcdef123456');
  assert.equal(client.apiSecret, 'secret_test_abcdef123456');
  assert.equal(client.keySource, 'saved');
  assert.equal(client.environment, 'test');
  assert.equal(client.baseUrl, 'https://test-api.sandbox.co.in');
  assert.equal(client.isConfigured(), true);
  const status = await runTool(state, 'sandbox_status', {});
  assert.equal(status.data.configured, true);
  assert.equal(status.data.mock, true);

  const live = saveSandboxKeys({ environment: 'live', apiKey: 'key_live_abcdef123456', apiSecret: 'secret_live_abcdef123456' });
  assert.equal(live.ok, true);
  const liveClient = new SandboxClient();
  assert.equal(liveClient.environment, 'live');
  assert.equal(liveClient.baseUrl, 'https://api.sandbox.co.in');

  process.env.MYCA_GSP_API_KEY = 'env_key_abcdef123456';
  process.env.MYCA_GSP_API_SECRET = 'env_secret_abcdef123456';
  const envWins = new SandboxClient();
  assert.equal(envWins.apiKey, 'env_key_abcdef123456');
  assert.equal(envWins.keySource, 'MYCA_GSP_API_KEY');
  delete process.env.MYCA_GSP_API_KEY;
  delete process.env.MYCA_GSP_API_SECRET;

  const gone = await runTool(state, 'sandbox_clear_keys', {});
  assert.equal(gone.data.apiKeySet, false);
  assert.equal(getSandboxClient().isConfigured(), false);

  assert.equal(isRemoteQuery('sandbox_save_keys'), false, 'never from the phone');
  assert.equal(isRemoteQuery('sandbox_keys'), false);
  assert.equal(validateAssistantToolCall('sandbox_save_keys', { apiKey: 'key_test_abcdef123456', apiSecret: 'secret_test_abcdef123456', extra: 1 }).ok, false, 'the schema is strict');
});

test('the keys page is served beside the desktop and talks only to the tools that exist', () => {
  const html = readFileSync(new URL('../desktop/renderer/keys.html', import.meta.url), 'utf8');
  for (const name of ['sandbox_keys', 'sandbox_save_keys', 'sandbox_clear_keys', 'sandbox_status', 'provider_doctor', 'govt_save_credentials', 'govt_status']) assert.ok(html.includes(`'${name}'`), name);
  assert.ok(html.includes('developer.sandbox.co.in') && html.includes('einv-apisandbox.nic.in'));
  assert.ok(html.includes('__MYCA_API_TOKEN__'));
  const index = readFileSync(new URL('../desktop/renderer/index.html', import.meta.url), 'utf8');
  assert.ok(index.includes('href="/keys.html"'));
});
