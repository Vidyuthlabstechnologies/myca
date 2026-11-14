import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { nicGetIrn } from '../src/nic-client.mjs';
import { setTransport } from '../src/eway-bill.mjs';
import { invoiceDocument } from '../src/invoice-document.mjs';
import { localToday } from '../src/dates.mjs';
import { deadlineRun } from '../src/deadline-run.mjs';

async function inMockMode(fn) {
  const saved = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.MYCA_MOCK_MODE;
    else process.env.MYCA_MOCK_MODE = saved;
  }
}

function seller() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' };
  return state;
}

test('a simulated IRN is acknowledged and cancelled at the time of the request, never before the invoice date', async () => {
  const state = seller();
  const today = localToday();
  const inv = createInvoice(state, { date: today, partyName: 'Retail', partyGstin: '27AAACH7409R1Z1', partyState: '27', partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  const out = await inMockMode(() => runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', params: { invoiceId: inv.invoice.id } }, { state }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.ackDate.slice(0, 10), today);
  assert.equal(state.invoices[0].mockAckDate.slice(0, 10), today);
  const cancelled = await inMockMode(() => runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_cancel', params: { irn: out.data.irn, reason: '1' } }, { state }));
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal(cancelled.data.cancelDate.slice(0, 10), today);
  const read = await nicGetIrn('A'.repeat(64), {}, async () => { throw new Error('no network'); }, { mock: true });
  const [d, m, y] = String(read.data.AckDt).slice(0, 10).split('/');
  assert.equal(`${y}-${m}-${d}`, today, JSON.stringify(read.data));
});

test('a simulated e-way bill is kept on the invoice as a mock field, and its status moves on while saying it is simulated', async () => {
  const state = seller();
  const inv = createInvoice(state, { partyName: 'Bengaluru Mart', partyGstin: '29AAACG1234F1Z0', partyAddress: '45 MG Road, Bengaluru 560001', lines: [{ description: 'Silk', hsn: '5007', qty: 2, rate: 30000, gstRate: 5 }] });
  assert.notEqual(setTransport(state, { invoiceId: inv.invoice.id, vehicleNo: 'MH12AB1234', distanceKm: 840, mode: 'road' }).ok, false);
  const before = (await runTool(state, 'eway_bill_status', { invoiceId: inv.invoice.id })).data;
  assert.equal(before.status, 'ready');
  const out = await inMockMode(() => runSandboxOperation({ actorId: 'ca', operationId: 'ewb_generate', params: { invoiceId: inv.invoice.id } }, { state }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.mock, true);
  const stored = state.invoices[0];
  assert.equal(stored.ewbNo, undefined, 'the real e-way bill number stays empty');
  assert.equal(stored.mockEwb.ewbNo, out.data.ewbNo);
  const after = (await runTool(state, 'eway_bill_status', { invoiceId: inv.invoice.id })).data;
  assert.equal(after.status, 'simulated');
  assert.equal(after.ewbNo, '');
  assert.equal(after.mockEwbNo, out.data.ewbNo);
  const doc = invoiceDocument(state, inv.invoice.id).data;
  assert.equal(doc.ewayBill.status, 'simulated');
  assert.match(doc.ewayBill.next, /simulated/i);
  assert.match(doc.ewayBill.next, /nothing reached/i);
  const asked = await chat(state, `e-way bill status ${inv.invoice.id}`);
  assert.match(asked.reply, new RegExp(`Simulated e-way bill ${out.data.ewbNo}`), asked.reply);
});

test('returns for months before the business started in MyCA are not shown as overdue', async () => {
  const state = seller();
  createInvoice(state, { date: '2026-11-03', partyName: 'Retail', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const run = deadlineRun(state, { asOfDate: '2026-11-14' });
  const gst = run.deadlines.filter((row) => row.clientId === 'SELF' && /^GSTR-(1|3B)$/.test(row.returnType));
  const september = gst.filter((row) => row.period === '2026-09');
  assert.ok(september.length > 0);
  assert.ok(september.every((row) => row.level !== 'overdue'), JSON.stringify(september));
  assert.ok(september.every((row) => row.level === 'before_start'));
  const november = gst.filter((row) => row.period === '2026-11');
  assert.ok(november.every((row) => row.level !== 'before_start'));

  const older = seller();
  createInvoice(older, { date: '2026-09-02', partyName: 'Retail', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const earlier = deadlineRun(older, { asOfDate: '2026-11-14' }).deadlines.filter((row) => row.clientId === 'SELF' && row.returnType === 'GSTR-1' && row.period === '2026-09');
  assert.equal(earlier[0].level, 'overdue', 'a month with books in it is still overdue');

  const fresh = seller();
  createInvoice(fresh, { date: localToday(), partyName: 'Retail', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const check = await runTool(fresh, 'books_check', {});
  const due = check.data.findings.find((item) => item.id === 'due');
  assert.ok(due, JSON.stringify(check).slice(0, 400));
  assert.equal(due.severity, 'ok', `${due.title}: ${due.detail}`);
});

test('asking chat to file a GST return points to the app\'s own filing flow and files nothing', async () => {
  const state = seller();
  createInvoice(state, { partyName: 'Retail', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  for (const text of ['file my GSTR-1', 'submit GSTR-1 return on GSTN using OTP']) {
    const out = await chat(state, text);
    assert.match(out.reply, /Taxes and filings/, out.reply);
    assert.match(out.reply, /approv/i, out.reply);
    assert.match(out.reply, /nothing was filed/i, out.reply);
    assert.doesNotMatch(out.reply, /cannot upload, submit, sign, or file/i);
    assert.notEqual(out.awaitingConfirmation, true);
  }
  const sandboxed = await inMockMode(() => chat(state, 'file my GSTR-1'));
  assert.match(sandboxed.reply, /simulated/i, sandboxed.reply);
  assert.equal((state.filings || []).length, 0);
});
