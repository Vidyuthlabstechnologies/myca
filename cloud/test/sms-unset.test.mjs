import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smsSenderFromEnv } from '../src/sms-sender.mjs';

test('no SMS provider means no sender, whatever the placeholder secrets say', () => {
  assert.equal(smsSenderFromEnv({ MYCA_SMS_PROVIDER: '', MYCA_SMS_TWILIO_TOKEN: 'unset', MYCA_SMS_MSG91_AUTHKEY: 'unset' }), null);
});

test('a chosen provider with only the placeholder secret refuses to start', () => {
  assert.throws(() => smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'msg91', MYCA_SMS_MSG91_AUTHKEY: 'unset', MYCA_SMS_MSG91_TEMPLATE_ID: 't1' }), /MSG91_AUTHKEY/);
  assert.throws(() => smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'twilio', MYCA_SMS_TWILIO_SID: 'AC1', MYCA_SMS_TWILIO_TOKEN: 'unset', MYCA_SMS_TWILIO_FROM: '+1' }), /TWILIO_TOKEN/);
});
