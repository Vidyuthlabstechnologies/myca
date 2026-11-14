import test from 'node:test';
import assert from 'node:assert/strict';
import { withServerDeviceFacts } from '../src/api.mjs';

test('HMRC tools keep the app\'s own device facts but never take the public address, port or two-step claims from the app', () => {
  const args = { taxYear: '2026-27', device: { deviceId: '3f0e4a2c-1111-4222-8333-444455556666', timezone: 'UTC+01:00', ipAddress: '6.6.6.6', ipAddressTimestamp: '2020-01-01T00:00:00.000Z', port: 443, multiFactor: [{ type: 'TOTP', timestamp: '2026-01-01T00:00:00.000Z', uniqueReference: 'fake' }] } };
  const out = withServerDeviceFacts(args, '::ffff:203.0.113.9');
  assert.deepEqual(out, { taxYear: '2026-27', device: { deviceId: '3f0e4a2c-1111-4222-8333-444455556666', timezone: 'UTC+01:00', ipAddress: '203.0.113.9' } });
  assert.deepEqual(withServerDeviceFacts({ body: {} }, ''), { body: {}, device: {} });
  assert.deepEqual(withServerDeviceFacts({ device: ['x'] }, '198.51.100.4'), { device: { ipAddress: '198.51.100.4' } });
});
