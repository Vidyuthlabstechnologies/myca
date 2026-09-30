import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { getSandboxClient } from '../src/sandbox-client.mjs';
import { performExternalAction } from '../src/action-gate.mjs';

process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-gate-deadline-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_GSP_API_KEY = 'k';
process.env.MYCA_GSP_API_SECRET = 's';
process.env.MYCA_GSP_BASE_URL = 'https://test-api.sandbox.co.in';
process.env.NVIDIA_NIM_API_KEY = 'nim-key';

const requests = [];
let respond = 'hang';

globalThis.fetch = (url, init = {}) => {
  requests.push({ url: String(url), signal: init.signal });
  if (respond === 'token') {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'SANDBOX-TOKEN', expires_in: 3600 }), { status: 200 }));
  }
  return new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal.reason || new Error('ABORTED')), { once: true });
  });
};

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const LIVE = { MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' };
const maker = { userId: 'ca', role: 'staff' };

beforeEach(() => {
  requests.length = 0;
  respond = 'hang';
});

const HUNG_TRANSPORTS = [
  ['sandbox_status', (t) => t.sandbox.ping(), 'https://test-api.sandbox.co.in/authenticate'],
  ['nim_status', (t) => t.nim.ping(), '/chat/completions'],
  ['nic_health', (t) => t.nic.health(), '/eivital/v1.04/heartbeat/ping'],
];

for (const [actionId, call, urlPart] of HUNG_TRANSPORTS) {
  test(`deadline: a hung ${actionId} request is aborted by the gate, not left open`, async () => {
    const state = createState();
    const out = await withEnv(LIVE, () => performExternalAction(state, { actionId, params: {}, actor: maker, timeoutMs: 30 }, call));
    assert.equal(out.ok, false);
    assert.equal(out.error, 'EXTERNAL_TIMEOUT');
    const request = requests.find((r) => r.url.includes(urlPart));
    assert.ok(request, `${actionId} made no request: ${JSON.stringify(requests.map((r) => r.url))}`);
    assert.ok(request.signal, `${actionId} request carries no signal`);
    assert.equal(request.signal.aborted, true, `${actionId} request is still open`);
  });
}

test('deadline: the gate-scoped Sandbox transport still keeps its session on the shared client', async () => {
  const state = createState();
  respond = 'token';
  const out = await withEnv(LIVE, () => performExternalAction(state, { actionId: 'sandbox_status', params: {}, actor: maker }, (t) => t.sandbox.ping()));
  assert.equal(out.ok, true, out.error);
  assert.equal(getSandboxClient().token, 'SANDBOX-TOKEN');
  assert.ok(requests.every((r) => r.signal), 'every request carries the gate signal');
});
