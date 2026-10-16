import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-portal-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function withCheck(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}
const BUYER = withCheck('27AAACK1234F1Z');

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', pan: 'AABCU9603R', tan: 'MUMN12345A', state: '27' };
  return state;
}

test('GSTR-1 is saved to the portal only with no held invoice, filed only after the approved review with an unchanged draft and the OTP, and the FVU job is kept; dry runs record nothing', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-05' });
  const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'save_gstr1_portal', { period: '2026-09' }));
  assert.equal(dry.ok, false, JSON.stringify(dry));
  assert.equal(Object.keys(state.portalSaves).length, 0, 'a dry run records nothing');

  const saved = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'save GSTR-1 for 2026-09 to the portal'));
  assert.match(saved.reply, /Simulated: GSTR-1 for September 2026 \(27AABCU9603R1ZN\) saved to the portal, reference MOCK-GSTR1-2026-09: 1 invoice\./, saved.reply);
  assert.equal(state.portalSaves['2026-09'].mock, true);

  const unapproved = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'file GSTR-1 for 2026-09 with OTP 123456'));
  assert.match(unapproved.reply, /Approve the GST review for that month first/, unapproved.reply);
  const review = await runTool(state, 'gst_review', { period: '2026-09' });
  for (const step of review.data.steps) {
    const answered = await runTool(state, 'gst_review_answer', { period: '2026-09', step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash });
    assert.equal(answered.ok, true, JSON.stringify(answered));
  }
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'More cotton', hsn: '5205', qty: 1, rate: 500, gstRate: 5 }], date: '2026-09-06' });
  const changed = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'file_gstr1_portal', { period: '2026-09', otp: '123456' }));
  assert.equal(changed.error, 'DRAFT_CHANGED');
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'save_gstr1_portal', { period: '2026-09' }));
  const review2 = await runTool(state, 'gst_review', { period: '2026-09' });
  for (const step of review2.data.steps) await runTool(state, 'gst_review_answer', { period: '2026-09', step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review2.data.draftHash });
  const filed = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'file GSTR-1 for 2026-09 with OTP 123456'));
  assert.match(filed.reply, /Simulated: GSTR-1 for September 2026 filed, acknowledgement MOCK-ACK-2026-09\. Nothing was sent and nothing is recorded as filed\./, filed.reply);
  assert.equal((state.filings || []).length, 0);

  const fvu = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'generate FVU for Q2 2026-27 26Q'));
  assert.match(fvu.reply, /Simulated: FVU job for 26Q Q2 2026-27: completed \(MOCK-FVU-MUMN12345A-Q2\)/, fvu.reply);
  const status = await chat(state, 'portal status');
  assert.match(status.reply, /GSTR-1 September 2026 27AABCU9603R1ZN: saved .* filed .* \(MOCK-ACK-2026-09\) \(simulated\)/, status.reply);
  assert.match(status.reply, /FVU 26Q Q2 2026-27: completed \(simulated\)/);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.tdsFvuJobs.length, 1);
  assert.equal(copy.portalSaves['2026-09'].filedAck, 'MOCK-ACK-2026-09');
});
