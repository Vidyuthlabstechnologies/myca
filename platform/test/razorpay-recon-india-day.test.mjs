import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const module = fileURLToPath(new URL('../src/channel-connectors.mjs', import.meta.url));

function postedDates(timeZone, settledAt) {
  const script = `
    import { razorpayReconToCsv } from ${JSON.stringify(module)};
    const csv = razorpayReconToCsv([{ settlement_id: 'S1', settled_at: ${settledAt}, amount: 10000, type: 'payment', entity_id: 'pay_1' }], { from: '2026-03-01', to: '2026-04-30' });
    process.stdout.write(JSON.stringify(csv));
  `;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: timeZone }, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return String(JSON.parse(out.stdout));
}

test('a settlement at 00:30 IST on 1 April lands on 1 April, not on 31 March', () => {
  const justAfterMidnightIst = Date.UTC(2026, 2, 31, 19, 0, 0) / 1000;
  const csv = postedDates('Asia/Kolkata', justAfterMidnightIst);
  assert.match(csv, /2026-04-01/);
  assert.doesNotMatch(csv, /2026-03-31/);
});

test('a settlement at 23:30 IST on 31 March stays on 31 March', () => {
  const lateIst = Date.UTC(2026, 2, 31, 18, 0, 0) / 1000;
  const csv = postedDates('Asia/Kolkata', lateIst);
  assert.match(csv, /2026-03-31/);
});
