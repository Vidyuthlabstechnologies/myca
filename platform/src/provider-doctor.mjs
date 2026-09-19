import { loadEnvFile, liveCallsEnabled } from './runtime-config.mjs';
import { getSandboxClient } from './sandbox-client.mjs';
import { loadGovtConfig } from './govt.mjs';

function missing(env, keys) {
  return keys.filter((k) => !String(env[k] || '').trim());
}

function detectEnvironment(baseUrl) {
  return /test/i.test(String(baseUrl || '')) ? 'test' : 'live';
}

async function probeTcp(host, port, timeoutMs = 1500) {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done({ status: 'ok', host, port }));
    socket.once('timeout', () => done({ status: 'error', error: 'timeout', host, port }));
    socket.once('error', (err) => done({ status: 'error', error: String(err.code || err.message || err), host, port }));
  });
}

export async function providerDoctor(deps = {}) {
  const env = deps.env || loadEnvFile();
  const live = deps.allowNetwork == null ? liveCallsEnabled() : Boolean(deps.allowNetwork);
  const providers = [];

  const baseUrl = String(env.MYCA_GSP_BASE_URL || 'https://api.sandbox.co.in');
  const environment = detectEnvironment(baseUrl);
  const keyName = environment === 'live' ? 'MYCA_GSP_LIVE_API_KEY' : 'MYCA_GSP_TEST_API_KEY';
  const secretName = environment === 'live' ? 'MYCA_GSP_LIVE_API_SECRET' : 'MYCA_GSP_TEST_API_SECRET';
  const sandboxKey = env[keyName] || env.MYCA_GSP_API_KEY;
  const sandboxSecret = env[secretName] || env.MYCA_GSP_API_SECRET;
  const sandboxMissing = [
    ...(sandboxKey ? [] : [`${keyName} or MYCA_GSP_API_KEY`]),
    ...(sandboxSecret ? [] : [`${secretName} or MYCA_GSP_API_SECRET`]),
  ];
  let sandboxReach = { status: 'skipped', reason: 'live calls disabled — set MYCA_ENABLE_LIVE_CALLS=1 to ping' };
  if (sandboxKey && sandboxSecret && live) {
    try {
      const client = deps.sandboxClient || getSandboxClient();
      const ping = await client.ping();
      sandboxReach = ping.ok
        ? { status: 'ok', ms: ping.ms, environment: ping.environment || environment }
        : { status: 'error', error: ping.error || 'auth failed', ms: ping.ms };
    } catch (err) {
      sandboxReach = { status: 'error', error: String(err.message || err) };
    }
  }
  providers.push({
    id: 'sandbox',
    name: 'Sandbox by Quicko',
    requirements: ['REQ-CA-006', 'REQ-CA-007', 'REQ-CA-008', 'REQ-CA-009', 'REQ-CA-010'],
    configured: Boolean(sandboxKey && sandboxSecret),
    environment,
    baseUrl,
    missing: sandboxMissing,
    reachability: sandboxReach,
    note: environment === 'test'
      ? 'TEST environment returns provider fixtures, not real taxpayer data. Switch base URL to https://api.sandbox.co.in and set MYCA_GSP_ENV=live for real data.'
      : 'LIVE environment. GST taxpayer flows still require GSP/ASP onboarding.',
  });

  const govt = deps.govt || loadGovtConfig();
  const hasPublicKey = deps.hasPublicKey == null ? Boolean(govt.publicKeyPem) : Boolean(deps.hasPublicKey);
  const nicMissing = [
    ...(govt.clientId ? [] : ['client-id']),
    ...(govt.clientSecret ? [] : ['client-secret']),
    ...(govt.username ? [] : ['API username']),
    ...(govt.password ? [] : ['API password']),
    ...(govt.gstin ? [] : ['GSTIN']),
    ...(hasPublicKey ? [] : ['einv-public.pem (RSA public key)']),
  ];
  providers.push({
    id: 'nic_einvoice',
    name: 'NIC e-invoice (direct)',
    requirements: ['REQ-CA-007'],
    configured: nicMissing.length === 0,
    environment: govt.env || 'sandbox',
    missing: nicMissing,
    reachability: { status: 'not-tested', reason: 'run govt_probe to reach NIC; auth needs the RSA public key' },
    note: 'Credentials are encrypted at rest in the vault. A GSTIN notified for e-invoicing is required.',
  });

  const emailMissing = missing(env, ['MYCA_EMAIL_FROM', 'MYCA_EMAIL_RELAY_URL']);
  providers.push({
    id: 'email',
    name: 'Email relay',
    requirements: ['REQ-CA-013'],
    configured: emailMissing.length === 0,
    missing: emailMissing,
    reachability: { status: 'not-tested' },
    note: 'Any JSON relay (SES, Postmark, your own function). Without it the app still opens mailto: links.',
  });

  const waMissing = missing(env, ['MYCA_WHATSAPP_PHONE_NUMBER_ID', 'MYCA_WHATSAPP_ACCESS_TOKEN']);
  providers.push({
    id: 'whatsapp',
    name: 'WhatsApp Cloud API',
    requirements: ['REQ-CA-013'],
    configured: waMissing.length === 0,
    missing: waMissing,
    reachability: { status: 'not-tested' },
    note: 'Needs a Meta Business account and an approved message template. Without it the app still opens wa.me links.',
  });

  const tallyHost = env.MYCA_TALLY_HOST;
  const tallyPort = Number(env.MYCA_TALLY_PORT || 0);
  let tallyReach = { status: 'skipped', reason: 'MYCA_TALLY_HOST/PORT not set' };
  if (tallyHost && tallyPort) {
    tallyReach = deps.probeTally ? await deps.probeTally() : await probeTcp(tallyHost, tallyPort);
  }
  providers.push({
    id: 'tally',
    name: 'TallyPrime (local :9000)',
    requirements: ['REQ-CA-003'],
    configured: Boolean(tallyHost && tallyPort),
    host: tallyHost || '',
    port: tallyPort || null,
    missing: tallyHost && tallyPort ? [] : ['MYCA_TALLY_HOST', 'MYCA_TALLY_PORT'],
    reachability: tallyReach,
    note: 'Live pull needs TallyPrime running with the XML/ODBC interface enabled. CSV/XML import works without it.',
  });

  const nimMissing = missing(env, ['NVIDIA_NIM_API_KEY']);
  let nimReach = { status: 'skipped', reason: 'live calls disabled' };
  if (!nimMissing.length && live) {
    try {
      const nim = deps.nimClient || (await import('./nim-client.mjs')).getNimClient();
      const ping = await nim.ping();
      nimReach = ping.ok ? { status: 'ok', ms: ping.ms } : { status: 'error', error: ping.error };
    } catch (err) {
      nimReach = { status: 'error', error: String(err.message || err) };
    }
  }
  providers.push({
    id: 'nim',
    name: 'NVIDIA NIM (AI)',
    requirements: ['REQ-CA-014', 'REQ-CA-015'],
    configured: nimMissing.length === 0,
    missing: nimMissing,
    reachability: nimReach,
    note: 'An LLM may only choose tools; it never produces a figure.',
  });

  providers.push({
    id: 'firm_backend',
    name: 'Firm backend (Cloud Run + Cloud SQL)',
    requirements: ['REQ-CA-001', 'REQ-CA-002', 'REQ-CA-003'],
    configured: false,
    missing: ['Firm backend not built — MyCA is local-only today'],
    reachability: { status: 'n/a' },
    note: 'Per-client books exist locally; a hosted multi-tenant service is the next milestone.',
  });

  const configured = providers.filter((p) => p.configured).length;
  const reachable = providers.filter((p) => p.reachability?.status === 'ok').length;
  return {
    ok: true,
    liveCallsEnabled: live,
    generatedAt: new Date().toISOString(),
    summary: {
      providers: providers.length,
      configured,
      notConfigured: providers.length - configured,
      reachable,
      needsCredentials: providers.filter((p) => !p.configured).map((p) => p.id),
    },
    providers,
  };
}
