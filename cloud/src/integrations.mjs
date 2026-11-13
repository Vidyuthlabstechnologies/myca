import { hostedCountries } from './residency.mjs';
import { deploymentEnvironment } from './environment.mjs';

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);
const lower = (value) => String(value ?? '').trim().toLowerCase();
const read = (env, name) => {
  const value = String(env[name] ?? '').trim();
  return value === 'unset' ? '' : value;
};

const LIVE_PREFIXES = ['key_live_', 'sk_live_', 'rk_live_', 'pk_live_', 'secret_live_'];
const TEST_PREFIXES = ['key_test_', 'sk_test_', 'rk_test_', 'pk_test_', 'secret_test_'];

export function keyKind(value) {
  const v = String(value ?? '').trim();
  if (LIVE_PREFIXES.some((p) => v.startsWith(p))) return 'live';
  if (TEST_PREFIXES.some((p) => v.startsWith(p))) return 'test';
  return '';
}

export const SLOTTED = Object.freeze({
  MYCA_GSP_API_KEY: 'MYCA_GSP_{MODE}_API_KEY',
  MYCA_GSP_API_SECRET: 'MYCA_GSP_{MODE}_API_SECRET',
  MYCA_STRIPE_SECRET_KEY: 'MYCA_STRIPE_{MODE}_SECRET_KEY',
  MYCA_STRIPE_WEBHOOK_SECRET: 'MYCA_STRIPE_{MODE}_WEBHOOK_SECRET',
  MYCA_STRIPE_PRICE_US_PLUS: 'MYCA_STRIPE_{MODE}_PRICE_US_PLUS',
  MYCA_US_FILER_BASE_URL: 'MYCA_US_FILER_{MODE}_BASE_URL',
  MYCA_US_FILER_API_KEY: 'MYCA_US_FILER_{MODE}_API_KEY',
  MYCA_US_FILER_WEBHOOK_SECRET: 'MYCA_US_FILER_{MODE}_WEBHOOK_SECRET',
});

export const slotName = (base, mode) => SLOTTED[base].replace('{MODE}', mode === 'live' ? 'LIVE' : 'TEST');

export function providerModeOf(env = process.env) {
  if (TRUE_WORDS.has(lower(env.MYCA_MOCK_MODE))) return 'simulated';
  const declared = lower(env.MYCA_PROVIDER_ENV);
  if (['off', 'test', 'live'].includes(declared)) return declared;
  return TRUE_WORDS.has(lower(env.MYCA_ENABLE_LIVE_CALLS)) ? 'live' : 'off';
}

const keyMode = (mode) => (mode === 'live' ? 'live' : 'test');

function effective(env, base, mode) {
  return read(env, slotName(base, keyMode(mode))) || read(env, base);
}

export const INTEGRATIONS = Object.freeze([
  {
    id: 'quicko',
    title: 'Sandbox by Quicko: GST returns, e-invoice (IRN, including RCM self-invoices), e-way bill, income tax, PAN and bank checks',
    countries: ['IN'],
    keys: ['MYCA_GSP_API_KEY', 'MYCA_GSP_API_SECRET'],
    neededLive: (env) => hostedCountries(env).includes('IN'),
    sandbox: 'Quicko test host (test-api.sandbox.co.in) with a key_test_ key',
  },
  {
    id: 'nic-einvoice',
    title: 'NIC e-invoice and e-way bill (IRP), reached through Quicko with each business\'s own IRP API user',
    countries: ['IN'],
    keys: [],
    follows: 'quicko',
    sandbox: 'Quicko test host; each business saves its IRP sandbox user in the app',
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp (WAHA gateway, or Meta Cloud API)',
    countries: ['IN', 'US'],
    keys: ['MYCA_WAHA_URL'],
    alt: ['MYCA_WHATSAPP_ACCESS_TOKEN', 'MYCA_WHATSAPP_PHONE_NUMBER_ID'],
    sandbox: 'Chat replies to people who write in still go out; reminders and invoices to customers from the outbox go out only in live mode',
  },
  {
    id: 'play-billing',
    title: 'Google Play subscriptions and one-time purchases',
    countries: ['IN', 'US'],
    keys: ['MYCA_PLAY_PACKAGE'],
    sandbox: 'Play license testers buy with test cards; their purchases are stored with testPurchase = true',
  },
  {
    id: 'stripe',
    title: 'Stripe card checkout (US returns and MyCA Plus)',
    countries: ['US'],
    keys: ['MYCA_STRIPE_SECRET_KEY', 'MYCA_STRIPE_WEBHOOK_SECRET', 'MYCA_STRIPE_PRICE_US_PLUS'],
    sandbox: 'Stripe test mode: sk_test_ key, its own webhook secret and test price id',
  },
  {
    id: 'us-filer',
    title: 'US e-file partner (Column Tax or April)',
    countries: ['US'],
    keys: ['MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET'],
    sandbox: 'The partner\'s sandbox base URL and sandbox key',
  },
  {
    id: 'bank-payroll-connectors',
    title: 'Plaid, Gusto, Pinwheel and TaxJar (keys saved per business in the app)',
    countries: ['US'],
    keys: [],
    perBusiness: true,
    sandbox: 'Always the provider sandbox (Plaid sandbox, Gusto demo) unless the service is live, whatever a business saved',
  },
  {
    id: 'ai-model',
    title: 'AI model for Ask MyCA (NVIDIA NIM or any OpenAI-compatible host)',
    countries: ['IN', 'US'],
    keys: ['MYCA_MODEL_API_KEY'],
    alt: ['NVIDIA_NIM_API_KEY', 'NIM_API_KEY'],
    sandbox: 'Same key in both modes; the model only drafts, every change still needs a confirm',
  },
  {
    id: 'sms',
    title: 'Sign-in codes by SMS (Twilio or MSG91)',
    countries: ['IN', 'US'],
    keys: ['MYCA_SMS_PROVIDER'],
    sandbox: 'Same in both modes; MYCA_TEST_PHONES numbers get a fixed code and no SMS',
  },
  {
    id: 'email-relay',
    title: 'Email relay (invoices and notices by email)',
    countries: ['IN', 'US'],
    keys: ['MYCA_EMAIL_RELAY_URL', 'MYCA_EMAIL_RELAY_TOKEN'],
    sandbox: 'Reminders and invoices to customers from the outbox go out only in live mode',
  },
]);

function configured(env, item, mode) {
  const value = (name) => (SLOTTED[name] ? effective(env, name, mode) : read(env, name));
  if (item.keys.length && item.keys.every((name) => value(name))) return 'ready';
  if (item.alt && item.alt.some((name) => value(name))) return 'ready';
  if (item.keys.some((name) => value(name))) return 'partial';
  return 'not set';
}

export function integrationReport(env = process.env) {
  const mode = providerModeOf(env);
  const countries = hostedCountries(env);
  const statusOf = {};
  const rows = [];
  for (const item of INTEGRATIONS) {
    if (!item.countries.some((c) => countries.includes(c))) continue;
    let status = item.follows ? statusOf[item.follows] : item.perBusiness ? 'per business' : configured(env, item, mode);
    if (item.id === 'bank-payroll-connectors' && !TRUE_WORDS.has(lower(env.MYCA_ENABLE_CHANNEL_PULLS))) status = 'off (MYCA_ENABLE_CHANNEL_PULLS)';
    statusOf[item.id] = status;
    rows.push({ id: item.id, title: item.title, status, runsAgainst: mode === 'live' ? 'production' : mode === 'simulated' ? 'simulated, no network' : mode === 'off' ? 'nothing (dry runs)' : item.sandbox });
  }
  return { mode, countries, integrations: rows };
}

export function keyProblems(env = process.env) {
  const mode = providerModeOf(env);
  const problems = [];
  const where = deploymentEnvironment(env);

  for (const base of Object.keys(SLOTTED)) {
    const testSlot = slotName(base, 'test');
    const liveSlot = slotName(base, 'live');
    if (keyKind(read(env, testSlot)) === 'live') problems.push(`${testSlot} holds a live key. Put live keys only in ${liveSlot}.`);
    if (keyKind(read(env, liveSlot)) === 'test') problems.push(`${liveSlot} holds a test key. Put test keys only in ${testSlot}.`);
    if (read(env, liveSlot) && where !== 'production') problems.push(`${liveSlot} is set on a ${where} server. Live keys belong only on the production server.`);
    const plain = read(env, base);
    const kind = keyKind(plain);
    if (!read(env, slotName(base, keyMode(mode)))) {
      if (mode !== 'live' && kind === 'live') problems.push(`${base} holds a live key but the service runs in ${mode} mode. Move it to ${liveSlot} and put the test key in ${testSlot}.`);
      if (mode === 'live' && kind === 'test') problems.push(`${base} holds a test key but the service runs live. Put the live key in ${liveSlot}.`);
    }
  }

  const gspEnv = lower(env.MYCA_GSP_ENV);
  if ((mode === 'test' || mode === 'live') && (gspEnv === 'test' || gspEnv === 'live') && gspEnv !== mode) {
    problems.push(`MYCA_GSP_ENV is ${gspEnv} but MYCA_PROVIDER_ENV is ${mode}. Leave MYCA_GSP_ENV unset (it follows the provider mode) or make them match.`);
  }

  const pairs = [
    ['MYCA_GSP_API_KEY', 'MYCA_GSP_API_SECRET', 'a Quicko key needs its secret'],
    ['MYCA_STRIPE_SECRET_KEY', 'MYCA_STRIPE_WEBHOOK_SECRET', 'without the webhook secret no payment can be confirmed'],
    ['MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'the e-file partner needs both its address and its key'],
    ['MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET', 'without the webhook secret no filing result can be trusted'],
  ];
  if (mode === 'test' || mode === 'live') {
    for (const [a, b, why] of pairs) {
      const hasA = Boolean(effective(env, a, mode));
      const hasB = Boolean(effective(env, b, mode));
      if (hasA !== hasB) problems.push(`${hasA ? a : b} is set for ${mode} mode but ${hasA ? b : a} is not: ${why}. Set ${slotName(hasA ? b : a, keyMode(mode))}.`);
    }
  }

  if (mode === 'live') {
    for (const item of INTEGRATIONS) {
      if (!item.neededLive || !item.neededLive(env)) continue;
      const missing = item.keys.filter((name) => !effective(env, name, mode));
      if (missing.length) problems.push(`Live mode needs ${item.title.split(':')[0]}: set ${missing.map((n) => (SLOTTED[n] ? slotName(n, 'live') : n)).join(', ')}.`);
    }
  }
  return problems;
}

export function applyKeySlots(env = process.env) {
  const mode = providerModeOf(env);
  const active = keyMode(mode);
  const applied = [];
  for (const base of Object.keys(SLOTTED)) {
    const own = read(env, slotName(base, active));
    if (own) {
      env[base] = own;
      applied.push(slotName(base, active));
    }
    delete env[slotName(base, active === 'live' ? 'test' : 'live')];
  }
  if ((mode === 'test' || mode === 'live') && !lower(env.MYCA_GSP_ENV)) env.MYCA_GSP_ENV = mode;
  return applied;
}
