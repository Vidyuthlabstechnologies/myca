import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { internalHost, metadataHost, publicHttpsUrl, readCapped } from '../src/outbound.mjs';
import { ChannelClient, amazonDocumentUrl, MAX_PROVIDER_FILE_BYTES, MAX_PROVIDER_JSON_BYTES } from '../src/channel-client.mjs';

const hostOf = (url) => new URL(url).hostname;

test('addresses inside a network are recognised however they are written', () => {
  const inside = [
    'http://169.254.169.254/latest/meta-data/', 'http://[fd00:ec2::254]/', 'http://metadata.google.internal/', 'http://metadata/', 'http://instance-data.ec2.internal/',
    'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://localhost/', 'http://api.localhost/', 'http://0.0.0.0/',
    'http://10.0.0.5/', 'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/', 'http://100.64.0.1/', 'http://198.18.0.1/', 'http://224.0.0.1/', 'http://255.255.255.255/',
    'http://[::1]/', 'http://[::]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[::ffff:a00:1]/', 'http://[fe80::1]/', 'http://[fc00::1]/', 'http://[fd12:3456::1]/', 'http://[ff02::1]/', 'http://[64:ff9b::a00:1]/', 'http://[2002:a00:1::]/',
    'http://db/', 'http://printer.local/', 'http://vault.internal/', 'http://169.254.169.254./',
  ];
  for (const url of inside) assert.equal(internalHost(hostOf(url)), true, url);
  const outside = ['https://api.razorpay.com/', 'https://nalanda.myshopify.com/', 'https://8.8.8.8/', 'https://172.32.0.1/', 'https://100.128.0.1/', 'https://[2606:4700::1111]/', 'https://[2a00:1450:4001::200e]/', 'https://[::ffff:8.8.8.8]/', 'https://tortuga-prod-eu.s3-eu-west-1.amazonaws.com/'];
  for (const url of outside) assert.equal(internalHost(hostOf(url)), false, url);
  assert.equal(internalHost(''), true);
  assert.equal(internalHost('[not-an-address'), true);
});

test('the cloud metadata addresses are recognised on their own', () => {
  for (const url of ['http://169.254.169.254/', 'http://169.254.170.2/', 'http://[fd00:ec2::254]/', 'http://[fe80::a9fe:a9fe]/', 'http://[::ffff:169.254.169.254]/', 'http://metadata.google.internal/', 'http://metadata.google.internal./']) {
    assert.equal(metadataHost(hostOf(url)), true, url);
  }
  for (const url of ['https://10.0.0.5/', 'https://waha.internal/', 'https://api.anthropic.com/', 'https://[fd12::1]/']) assert.equal(metadataHost(hostOf(url)), false, url);
});

test('a link from outside is followed only when it is plain https to a public host', () => {
  assert.equal(publicHttpsUrl('https://login.example.com/keys').hostname, 'login.example.com');
  for (const bad of ['http://login.example.com/keys', 'https://user:pw@login.example.com/', 'https://169.254.169.254/', 'https://10.1.2.3/', 'https://localhost/', 'https://[::1]/', 'file:///etc/passwd', 'gopher://x', 'not a url', '']) {
    assert.equal(publicHttpsUrl(bad), null, bad);
  }
});

test('the Amazon report link is fetched only from Amazon storage', () => {
  assert.equal(amazonDocumentUrl('https://tortuga-prod-eu.s3-eu-west-1.amazonaws.com/abc?X-Amz-Signature=1'), 'https://tortuga-prod-eu.s3-eu-west-1.amazonaws.com/abc?X-Amz-Signature=1');
  for (const bad of ['http://tortuga-prod-eu.s3-eu-west-1.amazonaws.com/abc', 'https://amazonaws.com.evil.example/abc', 'https://evilamazonaws.com/abc', 'https://169.254.169.254/latest/meta-data/', 'https://metadata.google.internal/', 'https://10.0.0.8/x', 'https://bucket.s3.amazonaws.com:8443/x', 'https://u:p@bucket.s3.amazonaws.com/x', '']) {
    assert.equal(amazonDocumentUrl(bad), '', bad);
  }
});

function amazonFetch(documentBody, calls) {
  return async (url, init = {}) => {
    calls.push({ url, init });
    const json = (body) => ({ ok: true, status: 200, headers: { get: () => '' }, text: async () => JSON.stringify(body) });
    if (url.includes('/auth/o2/token')) return json({ access_token: 'tok' });
    if (url.endsWith('/reports')) return json({ reportId: 'R1' });
    if (url.endsWith('/reports/R1')) return json({ processingStatus: 'DONE', reportDocumentId: 'D1' });
    if (url.endsWith('/documents/D1')) return json(documentBody);
    return { ok: true, status: 200, headers: { get: (name) => (name === 'content-length' ? String(MAX_PROVIDER_FILE_BYTES + 1) : '') }, text: async () => 'never read' };
  };
}

const AMAZON = { config: { clientId: 'c', clientSecret: 's', refreshToken: 'r', marketplaceId: 'M', region: 'IN' }, kind: 'settlement', from: '2026-09-01', to: '2026-09-15' };

test('a report link that points anywhere but Amazon storage is not fetched, and every connector request refuses redirects', async () => {
  for (const link of ['http://169.254.169.254/latest/meta-data/iam/security-credentials/', 'https://169.254.169.254/x', 'https://metadata.google.internal/computeMetadata/v1/', 'https://10.0.0.8/report', 'https://files.example/D1']) {
    const calls = [];
    const out = await new ChannelClient({ fetchFn: amazonFetch({ url: link }, calls), pollMs: 1, pollLimit: 2 }).amazonReport(AMAZON);
    assert.equal(out.error, 'AMAZON_DOCUMENT_HOST_REFUSED', link);
    assert.equal(calls.some((call) => call.url === link), false, `${link} was not requested`);
    assert.ok(calls.length >= 4);
    for (const call of calls) assert.equal(call.init.redirect, 'error', `${call.url} refuses redirects`);
  }
});

test('a report larger than the limit is refused before it is read', async () => {
  const calls = [];
  const out = await new ChannelClient({ fetchFn: amazonFetch({ url: 'https://tortuga-prod-eu.s3-eu-west-1.amazonaws.com/D1' }, calls), pollMs: 1, pollLimit: 2 }).amazonReport(AMAZON);
  assert.equal(out.error, 'AMAZON_DOCUMENT_TOO_LARGE');
});

test('a connector answer larger than the limit stops the pull with an error and is never taken as an empty answer', async () => {
  const huge = async () => ({ ok: true, status: 200, headers: { get: (name) => (name === 'content-length' ? String(MAX_PROVIDER_JSON_BYTES + 1) : '') }, text: async () => { throw new Error('the body was read'); } });
  const client = new ChannelClient({ fetchFn: huge });
  await assert.rejects(client.razorpay({ config: { keyId: 'rzp_test_1', keySecret: 's' }, from: '2026-10-01', to: '2026-10-31' }), /RESPONSE_TOO_LARGE/);
});

test('a provider that answers with a redirect to an inside address is not followed, and the inside address is never reached', async () => {
  let reached = 0;
  const inside = createServer((req, res) => { reached += 1; res.end('secret'); });
  await new Promise((resolve) => inside.listen(0, '127.0.0.1', resolve));
  const provider = createServer((req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${inside.address().port}/latest/meta-data/` }); res.end(); });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  try {
    const client = new ChannelClient();
    await assert.rejects(client.fetchFn(`http://127.0.0.1:${provider.address().port}/report`, { headers: { 'x-api-key': 'k' } }));
    assert.equal(reached, 0);
    const followed = await fetch(`http://127.0.0.1:${provider.address().port}/report`);
    assert.equal(await followed.text(), 'secret', 'without the default the same request is followed');
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    await new Promise((resolve) => inside.close(resolve));
  }
});

test('a response is read only up to the limit, whether or not it declares its length', async () => {
  const body = (chunks) => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
  assert.deepEqual(await readCapped(body(['hello ', 'world']), 100), { ok: true, text: 'hello world' });
  const over = await readCapped(body(['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60)]), 100);
  assert.equal(over.ok, false);
  assert.equal(over.error, 'RESPONSE_TOO_LARGE');
  assert.equal(over.bytes, 120, 'reading stopped at the chunk that crossed the limit');
  const declared = await readCapped({ headers: { get: () => '5000' }, text: async () => { throw new Error('must not be read'); } }, 100);
  assert.equal(declared.error, 'RESPONSE_TOO_LARGE');
  assert.deepEqual(await readCapped({ headers: { get: () => '' }, text: async () => 'plain' }, 100), { ok: true, text: 'plain' });
  assert.equal((await readCapped({ headers: { get: () => '' }, text: async () => 'x'.repeat(200) }, 100)).ok, false);
});
