import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-3b-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { gstr3bPortalJson, offsetPlan } from '../src/gstr3b-portal.mjs';
import { localToday } from '../src/dates.mjs';

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
const SUPPLIER = withCheck('27AAACS5678G1Z');

function lastMonth() {
  const [y, m] = localToday().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
const PERIOD = lastMonth();

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

async function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', pan: 'AABCU9603R', state: '27' };
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 10000, gstRate: 5 }], date: `${PERIOD}-05` });
  await runTool(state, 'create_invoice', { partyName: 'Walk-in Delhi', partyState: '07', lines: [{ description: 'Shirts', hsn: '6205', qty: 2, rate: 1000, gstRate: 12 }], date: `${PERIOD}-06` });
  await runTool(state, 'create_purchase', { partyName: 'Yarn Mills', partyGstin: SUPPLIER, lines: [{ description: 'Yarn', hsn: '5205', qty: 1, rate: 4000, gstRate: 5 }], date: `${PERIOD}-07` });
  return state;
}

async function approve(state) {
  const review = await runTool(state, 'gst_review', { period: PERIOD });
  for (const step of review.data.steps) await runTool(state, 'gst_review_answer', { period: PERIOD, step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash });
}

test('the GSTR-3B JSON follows the GSTN layout and the books: outward tax, unregistered inter-state supplies by place of supply, and the credit', async () => {
  const state = await books();
  const built = gstr3bPortalJson(state, PERIOD);
  assert.equal(built.ok, true, JSON.stringify(built));
  const body = built.body;
  assert.equal(body.gstin, '27AABCU9603R1ZN');
  assert.equal(body.ret_period, `${PERIOD.slice(5)}${PERIOD.slice(0, 4)}`);
  assert.deepEqual(body.sup_details.osup_det, { txval: 12000, iamt: 240, camt: 250, samt: 250, csamt: 0 });
  assert.deepEqual(body.inter_sup.unreg_details, [{ pos: '07', txval: 2000, iamt: 240 }]);
  assert.deepEqual(body.itc_elg.itc_net, { iamt: 0, camt: 100, samt: 100, csamt: 0 });
  assert.equal(body.itc_elg.itc_avl.find((row) => row.ty === 'OTH').camt, 100);
  assert.match(built.hash, /^[0-9a-f]{64}$/);
});

test('the set-off sends credit used by head and the cash left, as the portal expects', () => {
  const plan = offsetPlan({ used: { igst: { igst: 10, cgst: 5, sgst: 0 }, cgst: { cgst: 20, igst: 0 }, sgst: { sgst: 20, igst: 0 } }, cash: { igst: 30, cgst: 40, sgst: 40 }, late: null, creditUsed: 55 }, { 30002: 7 });
  assert.deepEqual(plan.pditc, { liab_ldg_id: 7, trans_typ: 30002, i_pdi: 10, i_pdc: 5, i_pds: 0, c_pdi: 0, c_pdc: 20, s_pdi: 0, s_pds: 20, cs_pdcs: 0 });
  assert.equal(plan.pdcash[0].ipd, 30);
  assert.equal(plan.pdcash[0].cpd, 40);
  assert.equal(plan.pdcash[0].c_lfeepd, 0);
});

test('GSTR-3B is saved, paid only after the approved review and an unchanged draft, then filed with the OTP; dry runs record nothing', async () => {
  const state = await books();
  const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'save_gstr3b_portal', { period: PERIOD }));
  assert.equal(dry.ok, false, JSON.stringify(dry));
  assert.equal(Object.keys(state.gstr3bPortal || {}).length, 0);

  const saved = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, `save GSTR-3B for ${PERIOD} to the portal`));
  assert.match(saved.reply, /Simulated: GSTR-3B for .* saved to the portal: outward taxable ₹12000, tax ₹740, credit ₹200\./, saved.reply);

  const early = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'file_gstr3b_portal', { period: PERIOD, otp: '123456' }));
  assert.equal(early.error, 'REVIEW_NOT_APPROVED', JSON.stringify(early));
  await approve(state);
  const unpaid = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'file_gstr3b_portal', { period: PERIOD, otp: '123456' }));
  assert.equal(unpaid.error, 'NOT_SET_OFF', JSON.stringify(unpaid));

  const paid = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, `pay GSTR-3B for ${PERIOD} on the portal`));
  assert.match(paid.reply, /Simulated: GSTR-3B tax for .* set off on the portal: ₹200 from credit and ₹540 from cash\./, paid.reply);
  const again = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'offset_gstr3b_portal', { period: PERIOD }));
  assert.equal(again.error, 'ALREADY_SET_OFF');

  const filed = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, `file GSTR-3B for ${PERIOD} with OTP 123456`));
  assert.match(filed.reply, /Simulated: GSTR-3B for .* filed, acknowledgement MOCK-ACK3B-.*\. Nothing was sent and nothing is marked as filed\./, filed.reply);
  assert.equal((state.filings || []).length, 0, 'a simulated filing is never recorded');
  const status = await chat(state, 'portal status');
  assert.match(status.reply, /GSTR-3B .* tax set off .* filed .* \(simulated\)/, status.reply);
});

test('a change to the books after the save stops the payment until it is saved again', async () => {
  const state = await books();
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'save_gstr3b_portal', { period: PERIOD }));
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'More', hsn: '5205', qty: 1, rate: 500, gstRate: 5 }], date: `${PERIOD}-08` });
  await approve(state);
  const out = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'offset_gstr3b_portal', { period: PERIOD }));
  assert.equal(out.error, 'DRAFT_CHANGED', JSON.stringify(out));
});

test('an approval for a filing step is asked by month and stays bound to the draft, so the OTP and the portal summary never need to be known in advance', async () => {
  const { filingApprovalSubject } = await import('../src/portal-filing.mjs');
  const { paramsHash } = await import('../src/approvals.mjs');
  const state = await books();
  const asked = await runTool(state, 'approval_request', { operationId: 'gst_file_gstr3b_evc', requestedBy: 'ca', period: PERIOD });
  assert.equal(asked.ok, true, JSON.stringify(asked));
  const subject = filingApprovalSubject(state, 'gst_file_gstr3b_evc', { period: PERIOD });
  assert.equal(subject.ok, true);
  assert.deepEqual(Object.keys(subject.subject).sort(), ['draftHash', 'gstin', 'operationId', 'period']);
  assert.equal(state.approvals.at(-1).paramsHash, paramsHash(subject.subject));
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'More', hsn: '5205', qty: 1, rate: 500, gstRate: 5 }], date: `${PERIOD}-09` });
  const after = filingApprovalSubject(state, 'gst_file_gstr3b_evc', { period: PERIOD });
  assert.notEqual(paramsHash(after.subject), state.approvals.at(-1).paramsHash, 'a change to the books needs a fresh approval');
  const fvu = filingApprovalSubject(state, 'tds_fvu_generate', { quarter: 'Q2 2026-27', tan: 'MUMN12345A' });
  assert.deepEqual(fvu.subject, { operationId: 'tds_fvu_generate', quarter: 'Q2 2026-27', form: '26Q', tan: 'MUMN12345A' });
  assert.equal(filingApprovalSubject(state, 'nic_irn_generate', { period: PERIOD }).error, 'NOT_A_FILING_OPERATION');
});
