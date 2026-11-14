import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectorEnvironment } from '../src/runtime-config.mjs';
import { ChannelClient } from '../src/channel-client.mjs';
import { gustoConnectUrl } from '../src/us-connectors.mjs';

async function withProviderEnv(value, fn) {
  const before = process.env.MYCA_PROVIDER_ENV;
  process.env.MYCA_PROVIDER_ENV = value;
  try { return await fn(); } finally {
    if (before === undefined) delete process.env.MYCA_PROVIDER_ENV; else process.env.MYCA_PROVIDER_ENV = before;
  }
}

function recordingClient() {
  const urls = [];
  const client = new ChannelClient({ fetchFn: async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ rate: { combined_rate: '0.1' }, access_token: 'a', next_cursor: '', has_more: false, added: [] }), { status: 200, headers: { 'content-type': 'application/json' } }); } });
  return { client, urls };
}

test('a business that saved "production" still reaches the sandbox unless the whole service is live', async () => {
  for (const mode of ['off', 'test']) {
    await withProviderEnv(mode, async () => {
      assert.equal(connectorEnvironment('production'), 'sandbox');
      assert.equal(connectorEnvironment('development'), 'sandbox');
      assert.equal(connectorEnvironment('production', 'demo'), 'demo');
      const { client, urls } = recordingClient();
      await client.plaid({ config: { environment: 'production', accessToken: 'x' }, op: 'sync' });
      await client.taxjar({ config: { environment: 'production', apiToken: 't' }, op: 'rates', params: { zip: '94107' } });
      await client.gusto({ config: { environment: 'production', clientId: 'c', clientSecret: 's' }, op: 'token', params: { code: 'c' } });
      await client.pinwheel({ config: { environment: 'production', apiSecret: 's' }, op: 'link_token' });
      assert.ok(urls[0].startsWith('https://sandbox.plaid.com/'), urls[0]);
      assert.ok(urls[1].startsWith('https://api.sandbox.taxjar.com/'), urls[1]);
      assert.ok(urls[2].startsWith('https://api.gusto-demo.com/'), urls[2]);
      assert.ok(urls[3].startsWith('https://sandbox.getpinwheel.com/'), urls[3]);
      const connect = await gustoConnectUrl({ redirectUri: 'https://api.example/cb' }, { config: { clientId: 'c', clientSecret: 's', environment: 'production' }, save: async () => ({ ok: true }) });
      assert.ok(connect.data.url.startsWith('https://api.gusto-demo.com/'), connect.data.url);
    });
  }
});

test('live mode reaches the production hosts a business chose', async () => {
  await withProviderEnv('live', async () => {
    assert.equal(connectorEnvironment('production'), 'production');
    assert.equal(connectorEnvironment(''), 'sandbox');
    const { client, urls } = recordingClient();
    await client.plaid({ config: { environment: 'production', accessToken: 'x' }, op: 'sync' });
    assert.ok(urls[0].startsWith('https://production.plaid.com/'), urls[0]);
  });
});
