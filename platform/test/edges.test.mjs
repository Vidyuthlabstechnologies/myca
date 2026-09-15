import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emptyLedger, createTransfers, paise, trialBalance, verifyChain,
  freeze, hydrate, ACCOUNT_FLAGS, TRANSFER_FLAGS, journal,
} from '../src/ledger.mjs';
import { installChart, gstSplit } from '../src/chart.mjs';
import {
  createInvoice, recordReceipt, createPurchase, printInvoice,
  invoicesToSalesCsv, purchasesToInwardCsv, ensureParty,
} from '../src/invoice.mjs';
import { createState, serialize, deserialize, seedDemo, saveState, loadState, safeStatePath } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { parseDocument, isPurchaseIntent, isSaleIntent, normalizeChat } from '../src/intent.mjs';
import { parseZohoBooksCsv } from '../src/import-zoho.mjs';
import { tallyXmlToDayBookCsv } from '../src/tally-xml.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { TOOLS, runTool } from '../src/tools.mjs';
import { invoiceToNicPayload, nicGenerateIrn, probeGovt, nicAuthenticate } from '../src/govt.mjs';
import { openSession } from '../src/session.mjs';
import { purchaseRegisterCsv, postTallyRows } from '../src/post-import.mjs';
import { isAllowedOrigin } from '../src/server.mjs';
import { assistantTools, planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { CA_API_REQUIREMENTS, integrationReadiness } from '../src/integration-contract.mjs';
import { handleCaApi, stateDigest } from '../src/ca-api.mjs';
import { providerCatalog, providerRequirementIds, providerRequirementMap } from '../src/provider-catalog.mjs';
import {
  SANDBOX_OPERATIONS,
  createSandboxHandoff,
  sandboxAdapterPlan,
  sandboxOperationById,
} from '../src/sandbox-adapter-contract.mjs';

const line = (over = {}) => ({ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5, ...over });

function intra(state, extra = {}) {
  return createInvoice(state, {
    date: '2026-08-01',
    partyName: extra.partyName || 'Retail Mart',
    partyGstin: extra.partyGstin ?? '27AAACH7409R1Z3',
    partyState: extra.partyState || '27',
    lines: extra.lines || [line()],
    ...extra,
  });
}

test('ledger: zero and negative amounts are rejected', () => {
  const l = emptyLedger();
  installChart(l);
  const z = createTransfers(l, [{ id: 1, debitAccountId: 1100, creditAccountId: 4000, amount: 0n, code: 'Z' }]);
  assert.equal(z[0].ok, false);
  assert.equal(z[0].error, 'amount_must_be_positive');
  const n = createTransfers(l, [{ id: 2, debitAccountId: 1100, creditAccountId: 4000, amount: -1n, code: 'N' }]);
  assert.equal(n[0].ok, false);
});

test('ledger: missing account, linked abort does not post the bundle', () => {
  const l = emptyLedger();
  installChart(l);
  const r = createTransfers(l, [
    { id: 11, debitAccountId: 1100, creditAccountId: 4000, amount: paise(100), flags: TRANSFER_FLAGS.LINKED },
    { id: 12, debitAccountId: 99999, creditAccountId: 4000, amount: paise(10), flags: TRANSFER_FLAGS.LINKED },
  ]);
  assert.equal(r.some((x) => x.error === 'account_not_found'), true);
  assert.equal(r.some((x) => x.error === 'linked_abort'), true);
  assert.equal(l.transfers.length, 0);
  assert.equal(trialBalance(l).balanced, true);
});

test('ledger: linked limit failure leaves the whole bundle unposted', () => {
  const l = emptyLedger();
  createTransfers(l, []);
  installChart(l);
  const r = createTransfers(l, [
    { id: 13, debitAccountId: 1100, creditAccountId: 4000, amount: paise(100), flags: TRANSFER_FLAGS.LINKED },
    { id: 14, debitAccountId: 5100, creditAccountId: 1001, amount: paise(10), flags: TRANSFER_FLAGS.LINKED },
  ]);
  assert.equal(r.some((x) => x.error === 'exceeds_debits'), true);
  assert.equal(r.some((x) => x.id === '13' && x.error === 'linked_abort'), true);
  assert.equal(l.transfers.length, 0);
  assert.equal(trialBalance(l).balanced, true);
});

test('ledger: duplicate transfer id is idempotent', () => {
  const l = emptyLedger();
  installChart(l);
  const spec = { id: 21, debitAccountId: 1100, creditAccountId: 4000, amount: paise(500), code: 'SALES' };
  assert.equal(createTransfers(l, [spec])[0].ok, true);
  const again = createTransfers(l, [spec]);
  assert.equal(again[0].exists, true);
  assert.equal(l.transfers.length, 1);
  assert.equal(trialBalance(l).debit, 500);
});

test('ledger: cash cannot be credited past posted debits', () => {
  const l = emptyLedger();
  installChart(l);
  const r = createTransfers(l, [{ id: 31, debitAccountId: 5100, creditAccountId: 1001, amount: paise(50), code: 'CASH' }]);
  assert.equal(r[0].ok, false);
  assert.equal(r[0].error, 'exceeds_debits');
});

test('ledger: pending then post and void', () => {
  const l = emptyLedger();
  installChart(l);
  const pending = createTransfers(l, [{
    id: 41, debitAccountId: 1100, creditAccountId: 4000, amount: paise(100), flags: TRANSFER_FLAGS.PENDING, code: 'HOLD',
  }]);
  assert.equal(pending[0].ok, true);
  assert.equal(l.accounts.get(1100n).debitsPosted, 0n);
  assert.ok(l.accounts.get(1100n).debitsPending > 0n);
  const posted = createTransfers(l, [{
    id: 42, flags: TRANSFER_FLAGS.POST_PENDING, pendingId: 41,
  }]);
  assert.equal(posted[0].ok, true);
  assert.equal(l.accounts.get(1100n).debitsPosted, paise(100));
  assert.equal(verifyChain(l).ok, true);

  const l2 = emptyLedger();
  installChart(l2);
  createTransfers(l2, [{
    id: 51, debitAccountId: 1100, creditAccountId: 4000, amount: paise(80), flags: TRANSFER_FLAGS.PENDING,
  }]);
  const voided = createTransfers(l2, [{ id: 52, flags: TRANSFER_FLAGS.VOID_PENDING, pendingId: 51 }]);
  assert.equal(voided[0].ok, true);
  assert.equal(l2.accounts.get(1100n).debitsPosted, 0n);
  assert.equal(l2.accounts.get(1100n).debitsPending, 0n);
});

test('ledger: resolve missing pending fails the rest of the linked batch', () => {
  const l = emptyLedger();
  installChart(l);
  const r = createTransfers(l, [{ id: 61, flags: TRANSFER_FLAGS.POST_PENDING, pendingId: 999 }]);
  assert.equal(r[0].error, 'pending_not_found');
});

test('ledger: freeze/hydrate keeps trial balance and checksum chain', () => {
  const state = createState();
  intra(state);
  const frozen = freeze(state.ledger);
  const restored = hydrate(frozen);
  assert.equal(trialBalance(restored).balanced, true);
  assert.equal(verifyChain(restored).ok, true);
  assert.equal(journal(restored).length, state.ledger.transfers.length);
});

test('ledger: tampered prevChecksum fails verifyChain', () => {
  const state = createState();
  intra(state);
  state.ledger.transfers[1].prevChecksum = 12345;
  assert.equal(verifyChain(state.ledger).ok, false);
});

test('gstSplit: intra halves, inter is IGST, odd paise still sum to tax', () => {
  const intraSplit = gstSplit({ taxable: 1, rate: 5, supplierState: '27', partyState: '27' });
  assert.equal(intraSplit.igst, 0);
  assert.equal(intraSplit.cgst + intraSplit.sgst, intraSplit.tax);
  const inter = gstSplit({ taxable: 100, rate: 18, supplierState: '27', partyState: '24' });
  assert.equal(inter.igst, 18);
  assert.equal(inter.cgst, 0);
});

test('invoice: missing lines, bad qty/rate, zero taxable', () => {
  const state = createState();
  assert.equal(createInvoice(state, { partyName: 'X', lines: [] }).error, 'NO_LINES');
  assert.equal(createInvoice(state, { partyName: 'X' }).error, 'NO_LINES');
  assert.equal(createInvoice(state, { partyName: 'X', lines: [line({ qty: 0 })] }).error, 'BAD_LINE');
  assert.equal(createInvoice(state, { partyName: 'X', lines: [line({ rate: 'nope' })] }).error, 'BAD_LINE');
  assert.equal(createInvoice(state, { partyName: 'X', lines: [line({ rate: -5 })] }).error, 'BAD_LINE');
  assert.equal(createInvoice(state, { partyName: 'X', lines: [line({ qty: 1, rate: 0, gstRate: 18 })] }).error, 'ZERO_AMOUNT');
  assert.equal(state.invoices.length, 0);
  assert.equal(state.invoiceSeq, 0);
});

test('invoice: GST 0% still posts and ties', () => {
  const state = createState();
  const r = intra(state, { lines: [line({ gstRate: 0, rate: 2000 })] });
  assert.equal(r.ok, true);
  assert.equal(r.invoice.total, 2000);
  assert.equal(r.invoice.cgst + r.invoice.sgst + r.invoice.igst, 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('invoice: default GST 18% and default qty 1', () => {
  const state = createState();
  const r = createInvoice(state, {
    partyName: 'Walk-in',
    lines: [{ description: 'Cut', rate: 100 }],
  });
  assert.equal(r.invoice.lines[0].qty, 1);
  assert.equal(r.invoice.lines[0].gstRate, 18);
  assert.equal(r.invoice.total, 118);
});

test('invoice: B2C with no GSTIN books intra CGST/SGST against company state', () => {
  const state = createState();
  const r = intra(state, { partyName: 'Cash customer', partyGstin: '', partyState: '27' });
  assert.equal(r.invoice.igst, 0);
  assert.ok(r.invoice.cgst > 0);
});

test('invoice: mixed GST rates and fractional qty still tie', () => {
  const state = createState();
  const r = intra(state, {
    lines: [
      line({ qty: 2.5, rate: 99.99, gstRate: 5, hsn: '5208' }),
      line({ qty: 1, rate: 1000, gstRate: 18, hsn: '5402' }),
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(Math.round((r.invoice.taxable + r.invoice.cgst + r.invoice.sgst + r.invoice.igst) * 100) / 100, r.invoice.total);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('invoice: same GSTIN reuses party even if name differs', () => {
  const state = createState();
  intra(state, { partyName: 'Retail Mart' });
  intra(state, { partyName: 'Retail Mart Pvt', partyGstin: '27AAACH7409R1Z3' });
  assert.equal(state.parties.length, 1);
});

test('invoice: custom id does not consume INV sequence', () => {
  const state = createState();
  createInvoice(state, { id: 'TALLY-88', partyName: 'A', partyGstin: '27AAACH7409R1Z3', partyState: '27', lines: [line()] });
  const second = intra(state);
  assert.equal(state.invoiceSeq, 1);
  assert.equal(second.invoice.id, 'INV-0001');
});

test('receipt: missing invoice, partial then paid, cash vs bank', () => {
  const state = createState();
  const inv = intra(state, { lines: [line({ rate: 10000 })] });
  assert.equal(recordReceipt(state, { invoiceId: 'INV-9999' }).error, 'INVOICE_NOT_FOUND');
  const part = recordReceipt(state, { invoiceId: inv.invoice.id, amount: 1000, mode: 'cash' });
  assert.equal(part.invoice.status, 'partial');
  const rest = recordReceipt(state, { invoiceId: inv.invoice.id, amount: inv.invoice.total - 1000, mode: 'bank' });
  assert.equal(rest.invoice.status, 'paid');
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('print: not found; sales vs purchase heading', () => {
  const state = createState();
  assert.equal(printInvoice(state, 'INV-0001').error, 'NOT_FOUND');
  const inv = intra(state);
  const html = printInvoice(state, inv.invoice.id);
  assert.match(html.html, /Bill to/);
  const bill = createPurchase(state, { partyName: 'Fabrics Co', partyGstin: '27AABCT1332L1ZM', partyState: '27', lines: [line()] });
  const billHtml = printInvoice(state, bill.invoice.id);
  assert.match(billHtml.html, /Supplier/);
});

test('print: invoice html escapes imported fields', () => {
  const state = createState();
  const inv = createInvoice(state, {
    partyName: '<img src=x onerror=alert(1)>',
    partyGstin: '',
    partyState: '27',
    lines: [line({ description: '<script>alert(1)</script>', hsn: '5208' })],
  });
  const html = printInvoice(state, inv.invoice.id).html;
  assert.doesNotMatch(html, /<script>|<img/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('purchase: interstate vendor books IGST ITC', () => {
  const state = createState();
  const bill = createPurchase(state, {
    date: '2026-08-04',
    partyName: 'Gujarat Yarn',
    partyGstin: '24AAACF7856R1Z0',
    partyState: '24',
    lines: [line({ rate: 100000, gstRate: 18 })],
  });
  assert.equal(bill.invoice.igst, 18000);
  assert.equal(bill.invoice.cgst, 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('purchase: itcEligible false still posts ITC accounts today but flags the bill', () => {
  const state = createState();
  const bill = createPurchase(state, {
    partyName: 'Fabrics Co',
    partyGstin: '27AABCT1332L1ZM',
    partyState: '27',
    itcEligible: false,
    lines: [line()],
  });
  assert.equal(bill.invoice.itcEligible, false);
  const csv = purchasesToInwardCsv(state.purchases);
  assert.match(csv, /N,Y/);
});

test('csv exports: empty registers are header-only', () => {
  assert.equal(invoicesToSalesCsv([]).split('\n').length, 1);
  assert.equal(purchasesToInwardCsv([]).split('\n').length, 1);
  assert.equal(purchaseRegisterCsv([]).split('\n').length, 1);
});

test('csv exports: quote commas and neutralize formulas', () => {
  const state = createState();
  createInvoice(state, {
    partyName: '=CMD, Retail',
    partyGstin: '',
    partyState: '27',
    lines: [line({ hsn: '+bad' })],
  });
  const sales = invoicesToSalesCsv(state.invoices);
  assert.match(sales, /"'=CMD, Retail"/);
  assert.match(sales, /'\+bad/);
  createPurchase(state, { partyName: '@Supplier, Inc', partyGstin: '', partyState: '27', lines: [line()] });
  assert.match(purchasesToInwardCsv(state.purchases), /"'@Supplier, Inc"/);
  assert.match(purchaseRegisterCsv(state.purchases), /"'@Supplier, Inc"/);
});

test('gstr1: B2B groups by GSTIN; B2C and short GSTIN go to b2cs; undated skipped', () => {
  const state = createState();
  intra(state, { partyName: 'A' });
  intra(state, { partyName: 'A2' });
  intra(state, { partyName: 'Cash', partyGstin: '', partyState: '27', lines: [line({ rate: 500 })] });
  intra(state, { partyName: 'Odd', partyGstin: '27SHORT', partyState: '27', lines: [line({ rate: 200 })] });
  const json = invoicesToGstr1Json(state.company, [
    ...state.invoices,
    { id: 'NODATE', partyGstin: '27AAACH7409R1Z3', lines: [], total: 1 },
  ]);
  assert.equal(json.b2b.length, 1);
  assert.equal(json.b2b[0].inv.length, 2);
  assert.equal(json.fp, '082026');
  assert.ok(json.b2cs.length >= 2);
  assert.equal(json.b2cs.some((r) => r.sply_ty === 'INTRA'), true);
  const interC = invoicesToGstr1Json(state.company, [{
    id: 'B2C-GJ', date: '2026-09-01', partyGstin: '', partyState: '24', taxable: 100, cgst: 0, sgst: 0, igst: 18, total: 118,
    lines: [{ gstRate: 18, taxable: 100, cgst: 0, sgst: 0, igst: 18 }],
  }]);
  assert.equal(interC.b2cs[0].sply_ty, 'INTER');
});

test('nic payload: B2B vs B2C supply type and date format', () => {
  const state = createState();
  const b2b = intra(state);
  const p = invoiceToNicPayload(state.company, b2b.invoice);
  assert.equal(p.TranDtls.SupTyp, 'B2B');
  assert.equal(p.DocDtls.Dt, '01/08/2026');
  const b2c = invoiceToNicPayload(state.company, { ...b2b.invoice, partyGstin: '' });
  assert.equal(b2c.TranDtls.SupTyp, 'B2C');
});

test('intent: em-dash strip, comma rates, purchase vs sale, help and empty', () => {
  assert.equal(normalizeChat('x — books ITC').toLowerCase().includes('itc'), false);
  const doc = parseDocument('Invoice Retail Mart GSTIN 27aaach7409r1z3, 10 rolls at 50,000, GST 5%');
  assert.equal(doc.partyGstin, '27AAACH7409R1Z3');
  assert.equal(doc.lines[0].qty, 10);
  assert.equal(doc.lines[0].rate, 50000);
  assert.equal(isPurchaseIntent('Purchase from Fabrics'), true);
  assert.equal(isSaleIntent('Purchase from Fabrics'), false);
  assert.equal(isSaleIntent('Invoice Retail'), true);
  assert.equal(isPurchaseIntent('bill from Yarn Co at 100 GST 5%'), true);
  const walk = parseDocument('invoice at 1000 GST 18%');
  assert.equal(walk.partyName, 'Walk-in');
  assert.equal(parseDocument('hello there'), null);
});

test('chat: empty, help, unknown, gstn does not file, import without attach', async () => {
  const state = createState();
  assert.match((await chat(state, '  ')).reply, /Tell me what/);
  assert.match((await chat(state, 'help')).reply, /MyCA posts invoices/);
  const unk = await chat(state, 'please dance');
  assert.match(unk.reply, /did not match/);
  const gstn = await chat(state, 'gstn');
  assert.equal(gstn.tools[0].name, 'company_profile');
  const tally = await chat(state, 'import tally');
  assert.match(tally.reply, /Attach a Tally Day Book/);
  const xml = await chat(state, 'tally xml');
  assert.match(xml.reply, /Attach a Tally XML/);
  const zoho = await chat(state, 'import zoho');
  assert.match(zoho.reply, /Zoho/);
  const bank = await chat(state, 'import bank');
  assert.match(bank.reply, /bank CSV/);
});

test('chat: GSTR-1 JSON vs GSTR-1 tables; print and pay; IRN missing invoice', async () => {
  const state = createState();
  const sale = await chat(state, 'Invoice Retail Mart GSTIN 27AAACH7409R1Z3, 1 rolls at 1000, GST 5%');
  assert.match(sale.reply, /Posted INV-0001/);
  const json = await chat(state, 'export gstr1 json');
  assert.equal(json.tools[0].name, 'export_gstr1_json');
  const tables = await chat(state, 'gstr-1');
  assert.equal(tables.tools[0].name, 'prepare_gstr1');
  const printed = await chat(state, 'print INV-0001');
  assert.match(printed.reply, /Printable INV-0001/);
  const missingPrint = await chat(state, 'print INV-0099');
  assert.match(missingPrint.reply, /failed|NOT_FOUND/i);
  const paid = await chat(state, 'INV-0001 paid by bank');
  assert.equal(state.invoices[0].status, 'paid');
  const irn = await chat(state, 'generate irn INV-0001');
  assert.match(irn.reply, /IRN not issued/);
  const irnMissing = await chat(state, 'generate irn INV-7777');
  assert.match(irnMissing.reply, /IRN not issued|INVOICE_NOT_FOUND/i);
  void paid;
});

test('chat: doc without invoice/purchase verb asks for intent', async () => {
  const state = createState();
  const out = await chat(state, 'from Fabrics Co GSTIN 27AABCT1332L1ZM at 10000 GST 5%');
  assert.match(out.reply, /invoice|purchase/i);
  assert.equal(state.invoices.length, 0);
  assert.equal(state.purchases.length, 0);
});

test('assistant contract: exposes strict schemas and blocks unsafe tools', () => {
  const catalog = assistantTools(TOOLS);
  const names = catalog.map((t) => t.name);
  assert.ok(names.includes('create_invoice'));
  assert.ok(names.includes('filing_pack'));
  assert.equal(names.includes('govt_save_credentials'), false);
  assert.equal(names.includes('seed_demo'), false);
  assert.equal(catalog.every((t) => t.strict && t.parameters?.additionalProperties === false), true);

  assert.equal(validateAssistantToolCall('govt_save_credentials', {}).ok, false);
  assert.equal(validateAssistantToolCall('create_invoice', {
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [line()],
  }).ok, true);
  const bad = validateAssistantToolCall('create_invoice', {
    partyName: 'Retail Mart',
    lines: [line()],
    uploadToGstn: true,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /not allowed/);
});

test('assistant planner: blocks live filing but allows filing pack prep', async () => {
  const state = createState();
  const blocked = planLocalToolCall(state, 'submit GSTR-1 return on GSTN using OTP');
  assert.equal(blocked.blocked, true);
  assert.match(blocked.reply, /cannot upload, submit, sign, or file/i);

  const pack = planLocalToolCall(state, 'filing pack');
  assert.equal(pack.kind, 'tool');
  assert.equal(pack.name, 'filing_pack');

  const out = await chat(state, 'submit GSTR-1 return on GSTN using OTP');
  assert.equal(out.blocked, true);
  assert.equal(state.invoices.length, 0);
});

test('requirements: CA API requirement IDs are stable and unique', () => {
  assert.equal(CA_API_REQUIREMENTS.length, 15);
  const ids = CA_API_REQUIREMENTS.map((r) => r.requirementId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, Array.from({ length: 15 }, (_, i) => `REQ-CA-${String(i + 1).padStart(3, '0')}`));
  for (const req of CA_API_REQUIREMENTS) {
    assert.ok(req.id);
    assert.ok(req.title);
    assert.ok(req.purpose);
    assert.ok(['must_have', 'gst', 'income_tax', 'practice', 'ai'].includes(req.priority));
    assert.ok(['read', 'write', 'read_write'].includes(req.direction));
    assert.ok(req.endpoints.length >= 1);
    assert.ok(req.requiredFields.length >= 1);
  }
});

test('requirements: readiness accepts slugs and formal IDs', async () => {
  const ready = integrationReadiness(['client_master', 'REQ-CA-002', 'REQ-CA-003', 'REQ-CA-004', 'REQ-CA-005']);
  assert.equal(ready.ok, true);
  assert.equal(ready.byPriority.must_have.available, 5);
  assert.equal(ready.availableRequirementIds.includes('REQ-CA-002'), true);
  assert.equal(ready.missingRequirementIds.includes('REQ-CA-006'), true);

  const state = createState();
  const out = await chat(state, 'show prd requirement ids and api readiness');
  assert.equal(out.tools[0].name, 'integration_readiness');
  assert.match(out.reply, /REQ-CA-001/);
});

test('requirements: integration registry persists and drives readiness', async () => {
  const state = createState();
  const connected = await runTool(state, 'integration_connect', {
    requirementId: 'REQ-CA-001',
    provider: 'TallyPrime export',
  });
  assert.equal(connected.ok, true);
  assert.equal(connected.data.connection.requirementId, 'REQ-CA-001');
  assert.equal(connected.data.readiness.available, 1);

  const ready = await runTool(state, 'integration_readiness', {});
  assert.equal(ready.data.availableRequirementIds.includes('REQ-CA-001'), true);
  assert.equal(ready.data.rows[0].connection.provider, 'TallyPrime export');

  const restored = deserialize(serialize(state));
  assert.equal(restored.integrationConnections['REQ-CA-001'].provider, 'TallyPrime export');

  const disconnected = await runTool(restored, 'integration_disconnect', { requirementId: 'client_master' });
  assert.equal(disconnected.ok, true);
  assert.equal(disconnected.data.readiness.available, 0);
});

test('requirements: chat can connect and disconnect requirement APIs', async () => {
  const state = createState();
  const connected = await chat(state, 'connect REQ-CA-002 api provider Zoho Books');
  assert.equal(connected.tools[0].name, 'integration_connect');
  assert.match(connected.reply, /REQ-CA-002/);
  assert.equal(state.integrationConnections['REQ-CA-002'].provider, 'Zoho Books');

  assert.equal(validateAssistantToolCall('integration_connect', {
    requirementId: 'REQ-CA-003',
    provider: 'Drive',
    secret: 'nope',
  }).ok, false);

  const disconnected = await chat(state, 'disconnect REQ-CA-002 api');
  assert.equal(disconnected.tools[0].name, 'integration_disconnect');
  assert.equal(Boolean(state.integrationConnections['REQ-CA-002']), false);
});

test('requirements: provider catalog is assistant-safe and chat-routable', async () => {
  assert.equal(validateAssistantToolCall('provider_catalog', { providerId: 'sandbox' }).ok, true);
  assert.equal(validateAssistantToolCall('provider_catalog', { providerId: 'other' }).ok, false);

  const state = createState();
  const out = await chat(state, 'show sandbox api provider map');
  assert.equal(out.tools[0].name, 'provider_catalog');
  assert.match(out.reply, /Sandbox by Quicko/);
  assert.match(out.reply, /REQ-CA-006/);
  assert.match(out.reply, /Adapters must wrap these existing owners/);

  const tool = await runTool(state, 'provider_catalog', { providerId: 'sandbox' });
  assert.equal(tool.ok, true);
  assert.equal(tool.data.requirements.length, 5);
  assert.equal(tool.data.requirements.every((row) => row.duplicateBusinessLogicAllowed === false), true);
});

test('requirements: Sandbox adapter plan is read-only and maps to existing tools', async () => {
  assert.equal(validateAssistantToolCall('sandbox_adapter_plan', { requirementId: 'REQ-CA-006' }).ok, true);
  assert.equal(validateAssistantToolCall('sandbox_adapter_plan', { requirementId: 'REQ-CA-001' }).ok, false);

  const state = createState();
  const out = await chat(state, 'show sandbox adapter plan');
  assert.equal(out.tools[0].name, 'sandbox_adapter_plan');
  assert.match(out.reply, /No external API call was made/);
  assert.match(out.reply, /gst_taxpayer_generate_otp/);

  const plan = sandboxAdapterPlan({ requirementId: 'REQ-CA-007' });
  assert.equal(plan.operations.some((operation) => operation.operationId === 'einvoice_generate'), true);
  assert.equal(plan.operations.every((operation) => operation.duplicateBusinessLogicAllowed === false), true);
  assert.ok(plan.operations.find((operation) => operation.operationId === 'einvoice_generate').mapsToTools.includes('govt_generate_irn'));
});

test('requirements: Sandbox handoff contract blocks unsafe autonomous operations', () => {
  assert.ok(SANDBOX_OPERATIONS.length >= 10);
  assert.equal(sandboxOperationById('gstin_verify').assistantBlocked, false);
  assert.equal(sandboxOperationById('einvoice_generate').assistantBlocked, true);

  const readOnly = createSandboxHandoff({
    operationId: 'gstin_verify',
    actorId: 'assistant',
    payloadSummary: { gstin: '27AABCU9603R1ZP' },
  });
  assert.equal(readOnly.ok, true);
  assert.equal(readOnly.handoff.requirementId, 'REQ-CA-008');

  const noApproval = createSandboxHandoff({
    operationId: 'einvoice_generate',
    actorId: 'ca_user',
    payloadSummary: { invoiceId: 'INV-0001' },
  });
  assert.equal(noApproval.ok, false);
  assert.equal(noApproval.error, 'CA_APPROVAL_REQUIRED');

  const assistantBlocked = createSandboxHandoff({
    operationId: 'einvoice_generate',
    actorId: 'assistant',
    caApprovalId: 'APR-1',
    payloadSummary: { invoiceId: 'INV-0001' },
  });
  assert.equal(assistantBlocked.ok, false);
  assert.equal(assistantBlocked.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');

  const secret = createSandboxHandoff({
    operationId: 'gst_taxpayer_verify_otp',
    actorId: 'ca_user',
    caApprovalId: 'APR-2',
    payloadSummary: { otp: '123456' },
  });
  assert.equal(secret.ok, false);
  assert.equal(secret.error, 'SECRET_FIELDS_NOT_ALLOWED_IN_HANDOFF');
});

test('requirements: local CA API covers must-have read/write surfaces', () => {
  const state = createState();
  const clients = handleCaApi(state, 'GET', '/api/ca/clients');
  assert.equal(clients.ok, true);
  assert.equal(clients.data.clients[0].clientId, 'SELF');
  assert.equal(clients.data.clients[0].pan, 'AABCU9603R');

  const before = stateDigest(state);
  const voucher = handleCaApi(state, 'POST', '/api/ca/clients/SELF/vouchers', {
    type: 'sale',
    partyName: 'API Retail',
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [line({ rate: 1500 })],
  });
  assert.equal(voucher.ok, true);
  assert.equal(voucher.invoice.id, 'INV-0001');
  assert.notEqual(stateDigest(state), before);

  const ledger = handleCaApi(state, 'GET', '/api/ca/clients/SELF/ledger');
  assert.equal(ledger.data.rows.length > 0, true);
  const tb = handleCaApi(state, 'GET', '/api/ca/clients/SELF/trial-balance');
  assert.equal(tb.data.balanced, true);

  const doc = handleCaApi(state, 'POST', '/api/ca/clients/SELF/documents', {
    kind: 'gstr2b',
    fileName: 'gstr2b.csv',
    content: 'gstin,amount\n27AAACH7409R1Z3,100',
  });
  assert.equal(doc.ok, true);
  assert.equal(doc.data.documentId, 'DOC-000001');
  const docs = handleCaApi(state, 'GET', '/api/ca/clients/SELF/documents');
  assert.equal(docs.data.documents.length, 1);

  const users = handleCaApi(state, 'GET', '/api/ca/users');
  assert.equal(users.data.users[0].role, 'admin');
  const access = handleCaApi(state, 'GET', '/api/ca/clients/SELF/access');
  assert.equal(access.data.users[0].userId, 'USR-ADMIN');

  const audit = handleCaApi(state, 'GET', '/api/ca/clients/SELF/audit-events');
  assert.equal(audit.data.auditEvents.some((event) => event.action === 'books_ledger.create_invoice'), true);
  assert.equal(audit.data.auditEvents.some((event) => event.action === 'documents.upload'), true);
});

test('provider catalog: Sandbox maps to existing requirement IDs and owner modules', () => {
  const sandbox = providerCatalog('sandbox');
  assert.equal(sandbox.providerId, 'sandbox');
  assert.equal(sandbox.posture, 'provider_adapter_only');
  assert.match(sandbox.docsUrl, /developer\.sandbox\.co\.in/);
  assert.ok(sandbox.notes.some((note) => /existing MyCA engines/i.test(note)));

  const knownIds = new Set(CA_API_REQUIREMENTS.map((req) => req.requirementId));
  const mappedIds = providerRequirementIds('sandbox');
  assert.deepEqual(mappedIds, ['REQ-CA-006', 'REQ-CA-007', 'REQ-CA-008', 'REQ-CA-009', 'REQ-CA-010']);
  assert.ok(mappedIds.every((id) => knownIds.has(id)));

  const repoRoot = join(process.cwd(), '..');
  for (const mapping of providerRequirementMap('sandbox')) {
    assert.equal(mapping.duplicateBusinessLogicAllowed, false);
    assert.ok(mapping.existingOwners.length >= 1);
    assert.ok(mapping.sandboxDocs.length >= 1);
    assert.ok(mapping.sandboxDocs.every((doc) => doc.url.startsWith('https://developer.sandbox.co.in/')));
    assert.ok(mapping.existingOwners.every((owner) => existsSync(join(repoRoot, owner))));
  }
});

test('provider catalog: Sandbox does not override Cursor-owned engines', () => {
  const sandbox = providerCatalog('sandbox');
  const ownerText = sandbox.requirements.flatMap((req) => req.existingOwners).join('\n');
  assert.match(ownerText, /sprints\/sprint-3-gst-recon/);
  assert.match(ownerText, /sprints\/sprint-5-filing-assistant/);
  assert.match(ownerText, /platform\/src\/govt\.mjs/);
  assert.equal(providerCatalog('missing-provider'), null);
  assert.deepEqual(providerRequirementMap('missing-provider'), []);
});

test('requirements: CA API audit and document state persists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-ca-api-'));
  const path = join(dir, 'state.json');
  const sess = openSession(path);
  const uploaded = await sess.caApi('POST', '/api/ca/clients/SELF/documents', {
    kind: 'audit',
    fileName: 'wp.txt',
    content: 'working paper',
  });
  assert.equal(uploaded.ok, true);
  await sess.tool('validate_gstin', { gstin: '27AABCU9603R1ZP' });

  const loaded = loadState(path);
  assert.equal(loaded.documents.length, 1);
  assert.equal(loaded.auditEvents.some((event) => event.action === 'tool.validate_gstin'), true);
  rmSync(dir, { recursive: true, force: true });
});

test('zoho csv: empty, bad header, BOM, quotes, blank invoice numbers', () => {
  assert.equal(parseZohoBooksCsv('').meta.error, 'EMPTY');
  assert.equal(parseZohoBooksCsv('foo,bar\n1,2').meta.error, 'NO_HEADER');
  const csv = `\uFEFFInvoice Number,Invoice Date,Customer Name,GST Identification Number (GSTIN),Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage
,"05-08-2026",SkipMe,27AAACH7409R1Z3,X,5208,1,10,5
INV-Z-1,05-08-2026,"Retail, Mart",27AAACH7409R1Z3,"Fabric, dyed",5208,2,"10,000",5
INV-Z-1,2026-08-05,Retail Mart,27AAACH7409R1Z3,Thread,5204,1,500,5`;
  const p = parseZohoBooksCsv(csv);
  assert.equal(p.invoices.length, 1);
  assert.equal(p.invoices[0].partyName, 'Retail, Mart');
  assert.equal(p.invoices[0].lines.length, 2);
  assert.equal(p.invoices[0].lines[0].rate, 10000);
});

test('tally xml: not envelope, CDATA, skip voucher without date', () => {
  assert.equal(tallyXmlToDayBookCsv('<html></html>').ok, false);
  const xml = `<?xml version="1.0"?><ENVELOPE><BODY><DATA><TALLYMESSAGE>
<VOUCHER VCHTYPE="Sales"><DATE><![CDATA[20260805]]></DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
<VOUCHERNUMBER>1</VOUCHERNUMBER><PARTYLEDGERNAME>Retail, Mart</PARTYLEDGERNAME>
<PARTYGSTIN>27AAACH7409R1Z3</PARTYGSTIN><NARRATION>Cloth, fine</NARRATION>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER>
<VOUCHER VCHTYPE="Sales"><VOUCHERNUMBER>2</VOUCHERNUMBER><PARTYLEDGERNAME>NoDate</PARTYLEDGERNAME></VOUCHER>
</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const converted = tallyXmlToDayBookCsv(xml);
  assert.equal(converted.ok, true);
  assert.equal(converted.count, 1);
  assert.match(converted.csv, /Retail Mart/);
});

test('tally post: duplicate voucher skipped; unknown type skipped; zero skipped', () => {
  const state = createState();
  const rows = [
    { voucherType: 'Sales', voucherNo: '1', date: '2026-08-01', ledger: 'A', gstin: '27AAACH7409R1Z3', computedAmount: 1000, gstRate: 5, narration: 'x' },
    { voucherType: 'Sales', voucherNo: '1', date: '2026-08-01', ledger: 'A', gstin: '27AAACH7409R1Z3', computedAmount: 1000, gstRate: 5 },
    { voucherType: 'Journal', voucherNo: 'j', date: '2026-08-01', computedAmount: 0 },
    { voucherType: 'Contra', voucherNo: 'c', date: '2026-08-01', debit: 0 },
    { voucherType: 'Mystery', voucherNo: 'm', date: '2026-08-01', computedAmount: 10 },
  ];
  const first = postTallyRows(state, rows);
  assert.equal(first.posted, 1);
  assert.ok(first.skipped.some((s) => s.reason === 'exists'));
  assert.ok(first.skipped.some((s) => String(s.reason).startsWith('unposted')));
});

test('tools: unknown, missing args, gstin check, gst payable net, seed is idempotent', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'nope')).ok, false);
  assert.equal((await runTool(state, 'import_tally', {})).ok, false);
  assert.equal((await runTool(state, 'govt_generate_irn', {})).ok, false);
  assert.equal((await runTool(state, 'gst_reconcile', {})).ok, false);
  assert.equal((await runTool(state, 'audit_books', {})).ok, false);
  const badGstin = await runTool(state, 'validate_gstin', { gstin: '27' });
  assert.equal(badGstin.data.ok, false);
  const good = await runTool(state, 'validate_gstin', { gstin: '27AABCU9603R1ZP' });
  assert.equal(good.data.ok, true);
  intra(state, { lines: [line({ rate: 10000 })] });
  createPurchase(state, { partyName: 'V', partyGstin: '27AABCT1332L1ZM', partyState: '27', lines: [line({ rate: 2000 })] });
  const pay = await runTool(state, 'gst_payable', {});
  assert.ok(pay.data.output > pay.data.input);
  const a = seedDemo(createState());
  const n = a.invoices.length;
  seedDemo(a);
  assert.equal(a.invoices.length, n);
  const seededTool = await runTool(createState(), 'seed_demo', {});
  assert.equal(seededTool.ok, true);
  assert.ok(seededTool.data.invoices >= 2);
});

test('store: serialize round-trip after mixed books', () => {
  const state = createState();
  intra(state);
  createPurchase(state, { partyName: 'V', partyGstin: '27AABCT1332L1ZM', partyState: '27', lines: [line()] });
  const copy = deserialize(serialize(state));
  assert.equal(copy.invoices.length, 1);
  assert.equal(copy.purchases.length, 1);
  assert.equal(trialBalance(copy.ledger).balanced, true);
  assert.equal(verifyChain(copy.ledger).ok, true);
});

test('store: state paths are constrained before file reads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-safe-path-'));
  const safe = join(dir, 'state.json');
  assert.equal(safeStatePath(safe), safe);
  assert.throws(() => safeStatePath('state.json'), /absolute/);
  assert.throws(() => safeStatePath(join(dir, 'state.txt')), /\.json/);
  assert.throws(() => safeStatePath('C:\\Windows\\win.ini'), /\.json|outside allowed/);
  rmSync(dir, { recursive: true, force: true });
});

test('session: overlapping tools get unique invoice numbers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-edge-'));
  const sess = openSession(join(dir, 'MyCA', 'state.json'));
  sess.state.invoices = [];
  sess.state.purchases = [];
  sess.state.invoiceSeq = 0;
  sess.state.parties = [];
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => sess.tool('create_invoice', {
    partyName: `P${i}`,
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [line({ rate: 100 + i })],
  })));
  assert.ok(results.every((r) => r.ok));
  const ids = results.map((r) => r.invoice.id);
  assert.equal(new Set(ids).size, 20);
  assert.equal(trialBalance(sess.state.ledger).balanced, true);
  rmSync(dir, { recursive: true, force: true });
});

test('govt: probe records fetch failures; IRN missing invoice; persist temp books', async () => {
  const probe = await probeGovt(async () => { throw new Error('offline'); });
  assert.equal(probe.live, 0);
  assert.equal(probe.hits.length, 6);
  const state = createState();
  const missing = await nicGenerateIrn(state, 'INV-0001', async () => ({ ok: false, status: 401, text: async () => '{}' }));
  assert.equal(missing.error, 'INVOICE_NOT_FOUND');
  const dir = mkdtempSync(join(tmpdir(), 'myca-save-'));
  const path = join(dir, 'state.json');
  const s = createState();
  intra(s);
  saveState(path, s);
  const loaded = loadState(path);
  assert.equal(loaded.invoices.length, 1);
  rmSync(dir, { recursive: true, force: true });
  const auth = await nicAuthenticate({ env: 'sandbox' });
  assert.equal(auth.error, 'MISSING_CREDENTIALS');
});

test('server: only local matching origins are allowed', () => {
  assert.equal(isAllowedOrigin(undefined, '127.0.0.1:4780'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:4780', '127.0.0.1:4780'), true);
  assert.equal(isAllowedOrigin('http://localhost:4780', '127.0.0.1:4780'), true);
  assert.equal(isAllowedOrigin('https://evil.example', '127.0.0.1:4780'), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:9999', '127.0.0.1:4780'), false);
});

test('ensureParty: case-insensitive name match without GSTIN', () => {
  const state = createState();
  const a = ensureParty(state, { name: 'Walk-In', gstin: '', stateCode: '27' });
  const b = ensureParty(state, { name: 'walk-in', gstin: '', stateCode: '27' });
  assert.equal(a.accountId, b.accountId);
});

test('security: index.html has strict CSP and no external font CDNs', () => {
  const htmlPath = join(import.meta.dirname, '../desktop/renderer/index.html');
  const html = readFileSync(htmlPath, 'utf8');
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/i);
  assert.match(html, /default-src 'self'/i);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/i);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/i);

  const fontsCssPath = join(import.meta.dirname, '../desktop/renderer/fonts.css');
  assert.equal(existsSync(fontsCssPath), true);
  const fontsCss = readFileSync(fontsCssPath, 'utf8');
  assert.match(fontsCss, /fraunces\.woff2/);
  assert.match(fontsCss, /ibm-plex-mono/);
  assert.match(fontsCss, /ibm-plex-sans/);

  const fontsDir = join(import.meta.dirname, '../desktop/renderer/fonts');
  assert.equal(existsSync(join(fontsDir, 'fraunces.woff2')), true);
  assert.equal(existsSync(join(fontsDir, 'ibm-plex-sans-400.woff2')), true);
  assert.equal(existsSync(join(fontsDir, 'ibm-plex-mono-500.woff2')), true);
});

