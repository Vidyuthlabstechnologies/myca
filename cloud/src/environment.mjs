import { isProduction } from './runtime.mjs';

export const ENVIRONMENTS = ['local', 'staging', 'production'];
const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);
const SAFE_PROVIDER_ENVS = new Set(['', 'off', 'sandbox']);
const LIVE_TARGETS = [
  'MYCA_WAHA_URL',
  'MYCA_WHATSAPP_ACCESS_TOKEN',
  'MYCA_WHATSAPP_PHONE_NUMBER_ID',
  'MYCA_SMS_PROVIDER',
  'MYCA_SMS_TWILIO_SID',
  'MYCA_SMS_TWILIO_TOKEN',
  'MYCA_SMS_MSG91_AUTHKEY',
  'MYCA_EMAIL_RELAY_URL',
  'MYCA_EMAIL_RELAY_TOKEN',
  'MYCA_PLAY_SERVICE_ACCOUNT_JSON',
  'MYCA_GSP_LIVE_API_KEY',
];

const lower = (value) => String(value ?? '').trim().toLowerCase();
const present = (env, name) => {
  const value = String(env[name] ?? '').trim();
  return Boolean(value) && value !== 'unset';
};

export function deploymentEnvironment(env = process.env) {
  const given = lower(env.MYCA_ENVIRONMENT);
  if (ENVIRONMENTS.includes(given)) return given;
  return isProduction(env) ? 'production' : 'local';
}

export function liveTargetsIn(env = process.env) {
  const names = [];
  if (TRUE_WORDS.has(lower(env.MYCA_ENABLE_LIVE_CALLS))) names.push('MYCA_ENABLE_LIVE_CALLS');
  if (!SAFE_PROVIDER_ENVS.has(lower(env.MYCA_PROVIDER_ENV))) names.push('MYCA_PROVIDER_ENV');
  if (TRUE_WORDS.has(lower(env.MYCA_ENABLE_CHANNEL_PULLS))) names.push('MYCA_ENABLE_CHANNEL_PULLS');
  for (const name of LIVE_TARGETS) if (present(env, name)) names.push(name);
  return names;
}

const OPERATOR_URLS = ['MYCA_WAHA_URL', 'MYCA_EMAIL_RELAY_URL', 'MYCA_MODEL_BASE_URL', 'NVIDIA_NIM_BASE_URL', 'MYCA_PUBLIC_URL'];
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function plainHttpUrls(env = process.env) {
  const names = [];
  for (const name of OPERATOR_URLS) {
    if (!present(env, name)) continue;
    let url;
    try {
      url = new URL(String(env[name]).trim());
    } catch {
      names.push(name);
      continue;
    }
    if (url.protocol === 'https:') continue;
    if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) continue;
    names.push(name);
  }
  return names;
}

export function environmentProblem(env = process.env) {
  const given = lower(env.MYCA_ENVIRONMENT);
  if (given && !ENVIRONMENTS.includes(given)) return `MYCA_ENVIRONMENT must be one of ${ENVIRONMENTS.join(', ')}.`;
  if (deploymentEnvironment(env) !== 'local') {
    const plain = plainHttpUrls(env);
    if (plain.length) return `These must be https:// URLs outside local development, because they carry API keys and customer messages: ${plain.join(', ')}.`;
  }
  if (deploymentEnvironment(env) !== 'staging') return '';
  const offending = liveTargetsIn(env);
  if (!offending.length) return '';
  return `MYCA_ENVIRONMENT is staging, which must never file, pay or send anything real, but these are set: ${offending.join(', ')}. Unset them or use MYCA_ENVIRONMENT=production.`;
}

export function enabledServices(env = process.env) {
  const on = [];
  if (present(env, 'MYCA_GOOGLE_CLIENT_IDS')) on.push('google-sign-in');
  if (present(env, 'MYCA_OIDC_ISSUER')) on.push('oidc-sign-in');
  if (present(env, 'MYCA_SMS_PROVIDER')) on.push(`sms:${lower(env.MYCA_SMS_PROVIDER)}`);
  if (present(env, 'MYCA_TEST_PHONES')) on.push('test-phones');
  if (TRUE_WORDS.has(lower(env.MYCA_REVIEWER_SIGN_IN))) on.push('reviewer-sign-in');
  if (present(env, 'MYCA_WAHA_URL')) on.push('whatsapp:waha');
  else if (present(env, 'MYCA_WHATSAPP_ACCESS_TOKEN')) on.push('whatsapp:meta');
  if (present(env, 'MYCA_EMAIL_RELAY_URL')) on.push('email-relay');
  if (present(env, 'MYCA_INBOUND_EMAIL_DOMAIN')) on.push('inbound-email');
  if (present(env, 'MYCA_PLAY_PACKAGE')) on.push('play-billing');
  if (present(env, 'MYCA_GSP_API_KEY') || present(env, 'MYCA_GSP_LIVE_API_KEY')) on.push('gsp');
  if (present(env, 'MYCA_MODEL_API_KEY') || present(env, 'NVIDIA_NIM_API_KEY') || present(env, 'NIM_API_KEY')) on.push('model');
  if (present(env, 'MYCA_DOCUMENT_BUCKET')) on.push('document-bucket');
  if (present(env, 'MYCA_CONNECTOR_KEY')) on.push('connectors');
  if (TRUE_WORDS.has(lower(env.MYCA_ENABLE_CHANNEL_PULLS))) on.push('channel-pulls');
  if (TRUE_WORDS.has(lower(env.MYCA_ENABLE_LIVE_CALLS))) on.push('live-calls');
  if (present(env, 'MYCA_JOB_TOKEN')) on.push('jobs');
  return on;
}
