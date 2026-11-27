import { deploymentEnvironment } from './environment.mjs';
import { keyProblems, providerModeOf } from './integrations.mjs';

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);
const MIN_SECRET = 32;

const lower = (value) => String(value ?? '').trim().toLowerCase();
const text = (env, name) => {
  const value = String(env[name] ?? '').trim();
  return value === 'unset' ? '' : value;
};
const strong = (env, name) => text(env, name).length >= MIN_SECRET;

export function wantsLive(env = process.env) {
  return providerModeOf(env) === 'live';
}

function gap(id, what, fix) {
  return { id, what, fix };
}

// What has to be true before the service may talk to the government, take real payments or
// send real messages. One list, used three ways: the server refuses to start in live mode
// without it, the release check prints it, and the tests pin it.
export function goLiveReadiness(env = process.env) {
  const gaps = [];
  const warnings = [];

  if (deploymentEnvironment(env) !== 'production') gaps.push(gap('ENVIRONMENT', 'Live mode is on, but this is not the production stack.', 'Set MYCA_ENVIRONMENT to production, or use test mode here.'));
  if (TRUE_WORDS.has(lower(env.MYCA_MOCK_MODE))) gaps.push(gap('SIMULATED', 'Simulated providers are on, so no real answer would ever come back.', 'Set MYCA_MOCK_MODE to 0.'));
  if (lower(env.MYCA_GSP_ENV) && lower(env.MYCA_GSP_ENV) !== 'live') gaps.push(gap('GSP_ENV', `The tax-portal provider is set to ${lower(env.MYCA_GSP_ENV)}, not live.`, 'Leave MYCA_GSP_ENV unset or set it to live.'));
  if (!text(env, 'MYCA_GSP_LIVE_API_KEY') || !text(env, 'MYCA_GSP_LIVE_API_SECRET')) gaps.push(gap('GSP_LIVE_KEYS', 'There is no live key and secret for the tax-portal provider (Quicko).', 'Set gsp_live_api_key and gsp_live_api_secret.'));

  if (text(env, 'MYCA_TEST_PHONES')) gaps.push(gap('TEST_PHONES', 'Test phone numbers sign in with a fixed code.', 'Empty test_phones.'));
  if (TRUE_WORDS.has(lower(env.MYCA_DEV_OTP))) gaps.push(gap('DEV_OTP', 'Sign-in codes are being printed to the log.', 'Unset MYCA_DEV_OTP.'));
  if (text(env, 'MYCA_TEST_CODE')) gaps.push(gap('TEST_CODE', 'A fixed test sign-in code is set.', 'Unset test_code.'));

  if (!text(env, 'MYCA_GOOGLE_CLIENT_IDS')) gaps.push(gap('GOOGLE_CLIENT_IDS', 'No Google client id is set, so Google sign-in, the one most people use, cannot work.', 'Set google_client_ids to the web client id the app is built with.'));
  const sms = lower(env.MYCA_SMS_PROVIDER);
  if (sms === 'twilio' && !(text(env, 'MYCA_SMS_TWILIO_SID') && text(env, 'MYCA_SMS_TWILIO_TOKEN') && text(env, 'MYCA_SMS_TWILIO_FROM'))) gaps.push(gap('SMS_TWILIO', 'Twilio is chosen for sign-in codes but its sid, token or sender is missing.', 'Set sms_twilio_sid, sms_secret and sms_twilio_from.'));
  if (sms === 'msg91' && !(text(env, 'MYCA_SMS_MSG91_AUTHKEY') && text(env, 'MYCA_SMS_MSG91_TEMPLATE_ID'))) gaps.push(gap('SMS_MSG91', 'MSG91 is chosen for sign-in codes but its auth key or DLT template id is missing.', 'Set sms_secret and sms_msg91_template_id (the template must be registered with DLT).'));
  if (!sms) warnings.push('Phone sign-in is off, so only Google sign-in works.');

  const publicUrl = text(env, 'MYCA_PUBLIC_URL');
  if (!/^https:\/\/[^/\s]+/i.test(publicUrl)) gaps.push(gap('PUBLIC_URL', 'There is no public https address, so links and sign-in redirects would use whatever host asked.', 'Set public_url to the https address people reach the API on.'));

  for (const name of ['MYCA_TOKEN_SECRET', 'MYCA_BOOKS_KEY', 'MYCA_CONNECTOR_KEY', 'MYCA_JOB_TOKEN']) {
    if (!strong(env, name)) gaps.push(gap(`SECRET_${name.slice(5)}`, `${name} is missing or shorter than ${MIN_SECRET} characters.`, `Set ${name} to a random value of at least ${MIN_SECRET} characters.`));
  }

  if (!text(env, 'MYCA_PLAY_PACKAGE') || !text(env, 'MYCA_PLAY_SERVICE_ACCOUNT_JSON') || !(text(env, 'MYCA_PLAY_PRODUCT_ESSENTIALS') || text(env, 'MYCA_PLAY_PRODUCT_PRO'))) {
    gaps.push(gap('PLAY_BILLING', 'Google Play billing is not complete (package, service account and plan products), so no subscription could be confirmed.', 'Set play_package_name, play_service_account_json and the plan product ids.'));
  }

  for (const problem of keyProblems(env)) gaps.push(gap('PROVIDER_KEYS', problem, 'Fix the provider keys named above.'));

  if (!text(env, 'MYCA_ADMIN_USER_IDS')) warnings.push('No admin user is set, so the growth and usage digest cannot be read.');
  if (!text(env, 'MYCA_MODEL_API_KEY') && !text(env, 'NVIDIA_NIM_API_KEY') && !text(env, 'NIM_API_KEY')) warnings.push('No model key is set, so the assistant is off.');
  if (!text(env, 'MYCA_EMAIL_RELAY_URL')) warnings.push('No email relay is set, so no email is sent.');

  return { live: wantsLive(env), ready: gaps.length === 0, gaps, warnings };
}

export function goLiveProblem(env = process.env) {
  if (!wantsLive(env)) return '';
  const { gaps } = goLiveReadiness(env);
  if (!gaps.length) return '';
  return `Live mode is switched on, but ${gaps.length === 1 ? 'one thing is' : `${gaps.length} things are`} not ready, so the API will not start and the running version stays up:\n- ${gaps.map((item) => `${item.what} ${item.fix}`).join('\n- ')}`;
}
