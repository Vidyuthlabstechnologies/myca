import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smsSenderFromEnv } from '../src/sms-sender.mjs';

function fakeFetch(calls, status = 201) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, text: async () => (status < 400 ? '{"sid":"SM1"}' : 'nope') };
  };
}

test('no provider configured means no sender, so phone sign-in stays off', () => {
  assert.equal(smsSenderFromEnv({}), null);
  assert.throws(() => smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'pigeon' }), /unknown MYCA_SMS_PROVIDER/);
  assert.throws(() => smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'twilio' }), /MYCA_SMS_TWILIO_SID/);
});

test('twilio sends the code by basic-auth form post and logs only a masked number', async () => {
  const calls = [];
  const logs = [];
  const sender = smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'twilio', MYCA_SMS_TWILIO_SID: 'ACxx', MYCA_SMS_TWILIO_TOKEN: 'tok', MYCA_SMS_TWILIO_FROM: '+15550001111' }, { fetchImpl: fakeFetch(calls), log: (entry) => logs.push(entry) });
  await sender.send('+919200000001', '123456');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Accounts\/ACxx\/Messages\.json$/);
  assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from('ACxx:tok').toString('base64')}`);
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('To'), '+919200000001');
  assert.match(body.get('Body'), /^123456 is your MyCA sign-in code/);
  assert.deepEqual(logs, [{ sms: 'sent', provider: 'twilio', to: '+91…01' }]);
  assert.ok(!JSON.stringify(logs).includes('123456'), 'the code never reaches the log');
});

test('msg91 posts the code to the OTP template and a provider error surfaces', async () => {
  const calls = [];
  const sender = smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'msg91', MYCA_SMS_MSG91_AUTHKEY: 'key', MYCA_SMS_MSG91_TEMPLATE_ID: 'tpl' }, { fetchImpl: fakeFetch(calls) });
  await sender.send('+919200000001', '654321');
  assert.match(calls[0].url, /control\.msg91\.com\/api\/v5\/otp\?template_id=tpl&mobile=919200000001/);
  assert.equal(calls[0].init.headers.authkey, 'key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { OTP: '654321' });
  const failing = smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'msg91', MYCA_SMS_MSG91_AUTHKEY: 'key', MYCA_SMS_MSG91_TEMPLATE_ID: 'tpl' }, { fetchImpl: fakeFetch([], 500) });
  await assert.rejects(() => failing.send('+919200000001', '1'), /sms provider answered 500/);
});
