import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRequestAddress } from '../src/api.mjs';

test('the e-file signature takes the IP address from the request, never from the phone', () => {
  assert.deepEqual(withRequestAddress({ taxYear: 2025, device: { ipAddress: '6.6.6.6', deviceId: 'ab' } }, '::ffff:203.0.113.9'), { taxYear: 2025, device: { deviceId: 'ab', ipAddress: '203.0.113.9' } });
  assert.deepEqual(withRequestAddress({ taxYear: 2025, device: { ipAddress: '6.6.6.6' } }, ''), { taxYear: 2025, device: {} });
  assert.equal(withRequestAddress({ taxYear: 2025 }, '2001:db8::1').device.ipAddress, '2001:db8::1');
});
