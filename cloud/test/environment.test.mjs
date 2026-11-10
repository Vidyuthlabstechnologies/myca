import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEnvironment, environmentProblem, liveTargetsIn, enabledServices } from '../src/environment.mjs';

test('the environment comes from MYCA_ENVIRONMENT, then from the production markers', () => {
  assert.equal(deploymentEnvironment({}), 'local');
  assert.equal(deploymentEnvironment({ K_SERVICE: 'myca-api' }), 'production');
  assert.equal(deploymentEnvironment({ MYCA_PRODUCTION: '1' }), 'production');
  assert.equal(deploymentEnvironment({ K_SERVICE: 'myca-api-staging', MYCA_ENVIRONMENT: 'staging' }), 'staging');
  assert.match(environmentProblem({ MYCA_ENVIRONMENT: 'prod' }), /must be one of/);
});

test('staging refuses to start with any live switch or real-send integration set, and names them without values', () => {
  const clean = { MYCA_ENVIRONMENT: 'staging', MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '1', MYCA_WAHA_URL: 'unset' };
  assert.equal(environmentProblem(clean), '');
  assert.deepEqual(liveTargetsIn(clean), []);
  const cases = {
    MYCA_ENABLE_LIVE_CALLS: '1',
    MYCA_PROVIDER_ENV: 'live-portal',
    MYCA_ENABLE_CHANNEL_PULLS: 'true',
    MYCA_WAHA_URL: 'https://waha.example.in',
    MYCA_WHATSAPP_ACCESS_TOKEN: 'EAAB-secret-value',
    MYCA_SMS_PROVIDER: 'twilio',
    MYCA_SMS_TWILIO_SID: 'AC123',
    MYCA_SMS_MSG91_AUTHKEY: 'msg91-secret',
    MYCA_EMAIL_RELAY_URL: 'https://relay.example.in',
    MYCA_PLAY_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}',
    MYCA_GSP_LIVE_API_KEY: 'live-key',
  };
  for (const [name, value] of Object.entries(cases)) {
    const problem = environmentProblem({ ...clean, [name]: value });
    assert.match(problem, new RegExp(name), name);
    assert.ok(!problem.includes(value) || value === '1' || value === 'true', `${name} value is not echoed`);
  }
  assert.equal(environmentProblem({ MYCA_ENVIRONMENT: 'production', MYCA_ENABLE_LIVE_CALLS: '1' }), '', 'production is not restricted by the staging guard');
  assert.equal(environmentProblem({ MYCA_PROVIDER_ENV: 'sandbox', MYCA_ENVIRONMENT: 'staging' }), '');
});

test('the startup line lists services by name only', () => {
  const on = enabledServices({ MYCA_GOOGLE_CLIENT_IDS: 'abc.apps.googleusercontent.com', MYCA_WAHA_URL: 'https://waha.example.in', MYCA_JOB_TOKEN: 'x'.repeat(40) });
  assert.deepEqual(on, ['google-sign-in', 'whatsapp:waha', 'jobs']);
  assert.ok(!JSON.stringify(on).includes('waha.example.in'));
});
