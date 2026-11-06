import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Decode, base32Encode, hotp, otpauthUri, totpCode, verifyTotp, TOTP_STEP_SECONDS } from '../src/totp.mjs';

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

test('base32 follows the RFC 4648 vectors, without padding on the way out and with or without it on the way in', () => {
  const vectors = [['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']];
  const padded = { MY: 'MY======', MZXQ: 'MZXQ====', MZXW6: 'MZXW6===', MZXW6YQ: 'MZXW6YQ=', MZXW6YTB: 'MZXW6YTB', MZXW6YTBOI: 'MZXW6YTBOI======' };
  for (const [plain, encoded] of vectors) {
    assert.equal(base32Encode(Buffer.from(plain, 'ascii')), encoded, plain);
    assert.equal(base32Decode(encoded).toString('ascii'), plain, encoded);
    if (encoded) {
      assert.equal(base32Decode(padded[encoded]).toString('ascii'), plain, padded[encoded]);
      assert.equal(base32Decode(encoded.toLowerCase()).toString('ascii'), plain, encoded.toLowerCase());
    }
  }
  assert.equal(base32Decode('mzxw 6ytb-oi').toString('ascii'), 'foobar', 'spaces and dashes typed by a person are ignored');
  assert.throws(() => base32Decode('MZXW6YTB0I'), /not base32/);
  const twenty = Buffer.from('0123456789abcdef0123', 'ascii');
  assert.equal(base32Encode(twenty).length, 32);
  assert.deepEqual(base32Decode(base32Encode(twenty)), twenty);
});

test('HOTP matches the RFC 4226 vectors for counters 0 to 9', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET, counter), code, `counter ${counter}`));
});

test('TOTP matches the RFC 6238 SHA1 vectors (last six digits)', () => {
  const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [seconds, eight] of vectors) {
    assert.equal(totpCode(RFC_SECRET, seconds * 1000), eight.slice(-6), `T=${seconds}`);
  }
});

test('verification accepts the step before and after, refuses anything further, and never accepts a step twice', () => {
  const now = 1111111111 * 1000;
  const current = Math.floor(1111111111 / TOTP_STEP_SECONDS);
  const code = totpCode(RFC_SECRET, now);
  assert.deepEqual(verifyTotp(RFC_SECRET, code, now), { ok: true, step: current });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30000), now), { ok: true, step: current - 1 });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30000), now), { ok: true, step: current + 1 });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 60000), now), { ok: false });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 60000), now), { ok: false });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 60000), now, { window: 2 }), { ok: true, step: current - 2 });
  assert.deepEqual(verifyTotp(RFC_SECRET, code, now, { lastStep: current }), { ok: false }, 'a code already used for this step is refused');
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30000), now, { lastStep: current }), { ok: false }, 'and so is an older step');
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30000), now, { lastStep: current }), { ok: true, step: current + 1 });
  assert.deepEqual(verifyTotp(RFC_SECRET, code, now, { lastStep: current - 1 }), { ok: true, step: current });
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) {
    assert.deepEqual(verifyTotp(RFC_SECRET, bad, now), String(bad) === code ? { ok: true, step: current } : { ok: false }, String(bad));
  }
  assert.deepEqual(verifyTotp(Buffer.from('another secret'), code, now), { ok: false });
  assert.deepEqual(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, 0), 0), { ok: false }, 'step 0 is never above lastStep 0');
});

test('the otpauth uri names MyCA, encodes the account and carries the SHA1 six-digit thirty-second parameters', () => {
  const uri = otpauthUri({ account: '+919876543210', secretBase32: 'JBSWY3DPEHPK3PXP' });
  assert.equal(uri, 'otpauth://totp/MyCA:%2B919876543210?secret=JBSWY3DPEHPK3PXP&issuer=MyCA&algorithm=SHA1&digits=6&period=30');
  const email = otpauthUri({ account: 'asha@example.com', secretBase32: 'MZXW6YTBOI' });
  assert.equal(email, 'otpauth://totp/MyCA:asha%40example.com?secret=MZXW6YTBOI&issuer=MyCA&algorithm=SHA1&digits=6&period=30');
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, 'otpauth:');
  assert.equal(parsed.searchParams.get('secret'), 'JBSWY3DPEHPK3PXP');
  assert.equal(parsed.searchParams.get('issuer'), 'MyCA');
  assert.equal(decodeURIComponent(parsed.pathname).replace(/^\/+/, ''), 'MyCA:+919876543210');
});
