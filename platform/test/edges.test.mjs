import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emptyLedger, createTransfers, paise, trialBalance, verifyChain,
  freeze, hydrate, ACCOUNT_FLAGS, TRANSFER_FLAGS, journal, listAccounts,
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
import { invoiceToNicPayload, nicGenerateIrn, probeGovt, nicAuthenticate, mycaDir, saveGovtConfig, loadGovtConfig, publicGovtConfig, migrateGovtVault, govtConfigPath } from '../src/govt.mjs';
import { csvRows } from '../src/text-safe.mjs';
import { liveCallsEnabled } from '../src/runtime-config.mjs';
import { openSession } from '../src/session.mjs';
import { purchaseRegisterCsv, postTallyRows } from '../src/post-import.mjs';
import { isAllowedOrigin } from '../src/server.mjs';
import { assistantTools, planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { CA_API_REQUIREMENTS, integrationReadiness } from '../src/integration-contract.mjs';
import { handleCaApi, stateDigest } from '../src/ca-api.mjs';
import { providerCatalog, providerRequirementIds, providerRequirementMap } from '../src/provider-catalog.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { requestApproval, decideApproval, reserveApproval, settleApproval, approvalStatus, findApproval } from '../src/approvals.mjs';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { queueNotification, sendNotification } from '../src/notifications.mjs';
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
    partyGstin: extra.partyGstin ?? '27AAACH7409R1Z1',
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

test('gstSplit: CGST equals SGST, each at half the rate in paise; inter is IGST', () => {
  const intraSplit = gstSplit({ taxable: 1, rate: 5, supplierState: '27', partyState: '27' });
  assert.equal(intraSplit.igst, 0);
  assert.equal(intraSplit.cgst, 0.03, '2.5% of Rs 1 is 2.5 paise, rounded to 3');
  assert.equal(intraSplit.sgst, intraSplit.cgst);
  assert.equal(intraSplit.tax, 0.06);
  const odd = gstSplit({ taxable: 1234.57, rate: 18, supplierState: '27', partyState: '27' });
  assert.equal(odd.cgst, 111.11);
  assert.equal(odd.sgst, 111.11);
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
  intra(state, { partyName: 'Retail Mart Pvt', partyGstin: '27AAACH7409R1Z1' });
  assert.equal(state.parties.length, 1);
});

test('invoice: custom id does not consume INV sequence', () => {
  const state = createState();
  createInvoice(state, { id: 'TALLY-88', partyName: 'A', partyGstin: '27AAACH7409R1Z1', partyState: '27', lines: [line()] });
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
  const bill = createPurchase(state, { partyName: 'Fabrics Co', partyGstin: '27AABCT1332L1ZE', partyState: '27', lines: [line()] });
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
    partyGstin: '24AAACF7856R1ZY',
    partyState: '24',
    lines: [line({ rate: 100000, gstRate: 18 })],
  });
  assert.equal(bill.invoice.igst, 18000);
  assert.equal(bill.invoice.cgst, 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('purchase: itcEligible false (s.17(5)) posts the GST to cost, not to ITC, and flags the bill', () => {
  const state = createState();
  const bill = createPurchase(state, {
    partyName: 'Fabrics Co',
    partyGstin: '27AABCT1332L1ZE',
    partyState: '27',
    itcEligible: false,
    lines: [line()],
  });
  assert.equal(bill.invoice.itcEligible, false);
  const acc = Object.fromEntries(listAccounts(state.ledger).map((x) => [x.code, x]));
  assert.equal((acc['1200']?.debitsPosted || 0) + (acc['1201']?.debitsPosted || 0) + (acc['1202']?.debitsPosted || 0), 0);
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

test('gstr1: B2B groups by GSTIN; B2C goes to b2cs; a malformed GSTIN is held back; undated skipped', () => {
  const state = createState();
  intra(state, { partyName: 'A' });
  intra(state, { partyName: 'A2' });
  intra(state, { partyName: 'Cash', partyGstin: '', partyState: '27', lines: [line({ rate: 500 })] });
  intra(state, { partyName: 'Odd', partyGstin: '27SHORT', partyState: '27', lines: [line({ rate: 200 })] });
  const json = invoicesToGstr1Json(state.company, [
    ...state.invoices,
    { id: 'NODATE', partyGstin: '27AAACH7409R1Z1', lines: [], total: 1 },
  ]);
  assert.equal(json.b2b.length, 1);
  assert.equal(json.b2b[0].inv.length, 2);
  assert.equal(json.fp, '082026');
  assert.equal(json.b2cs.length, 1);
  assert.equal(json.b2cs[0].sply_ty, 'INTRA');
  assert.equal(json.b2cs[0].rt, 5);
  assert.equal(json.b2cs[0].txval, 500);
  assert.deepEqual(json.held.map((h) => [h.code, h.gstin]), [['INVALID_GSTIN', '27SHORT']]);
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
  const doc = parseDocument('Invoice Retail Mart GSTIN 27aaach7409r1z1, 10 rolls at 50,000, GST 5%');
  assert.equal(doc.partyGstin, '27AAACH7409R1Z1');
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
  const sale = await chat(state, 'Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 1 rolls at 1000, GST 5%');
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
  const out = await chat(state, 'from Fabrics Co GSTIN 27AABCT1332L1ZE at 10000 GST 5%');
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
    partyGstin: '27AAACH7409R1Z1',
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
    payloadSummary: { gstin: '27AABCU9603R1ZN' },
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
    partyGstin: '27AAACH7409R1Z1',
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
  await sess.tool('validate_gstin', { gstin: '27AABCU9603R1ZN' });

  const loaded = loadState(path);
  assert.equal(loaded.documents.length, 1);
  assert.equal(loaded.auditEvents.some((event) => event.action === 'tool.validate_gstin'), true);
  rmSync(dir, { recursive: true, force: true });
});

test('zoho csv: empty, bad header, BOM, quotes, blank invoice numbers', () => {
  assert.equal(parseZohoBooksCsv('').meta.error, 'EMPTY');
  assert.equal(parseZohoBooksCsv('foo,bar\n1,2').meta.error, 'NO_HEADER');
  const csv = `\uFEFFInvoice Number,Invoice Date,Customer Name,GST Identification Number (GSTIN),Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage
,"05-08-2026",SkipMe,27AAACH7409R1Z1,X,5208,1,10,5
INV-Z-1,05-08-2026,"Retail, Mart",27AAACH7409R1Z1,"Fabric, dyed",5208,2,"10,000",5
INV-Z-1,2026-08-05,Retail Mart,27AAACH7409R1Z1,Thread,5204,1,500,5`;
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
<PARTYGSTIN>27AAACH7409R1Z1</PARTYGSTIN><NARRATION>Cloth, fine</NARRATION>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER>
<VOUCHER VCHTYPE="Sales"><VOUCHERNUMBER>2</VOUCHERNUMBER><PARTYLEDGERNAME>NoDate</PARTYLEDGERNAME></VOUCHER>
</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const converted = tallyXmlToDayBookCsv(xml);
  assert.equal(converted.ok, true);
  assert.equal(converted.count, 1);
  assert.match(converted.csv, /"Retail, Mart"/);
  assert.match(converted.csv, /"Cloth, fine"/);
});

test('tally post: duplicate voucher skipped; unknown type skipped; zero skipped', () => {
  const state = createState();
  const rows = [
    { voucherType: 'Sales', voucherNo: '1', date: '2026-08-01', ledger: 'A', gstin: '27AAACH7409R1Z1', computedAmount: 1000, gstRate: 5, narration: 'x' },
    { voucherType: 'Sales', voucherNo: '1', date: '2026-08-01', ledger: 'A', gstin: '27AAACH7409R1Z1', computedAmount: 1000, gstRate: 5 },
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
  const good = await runTool(state, 'validate_gstin', { gstin: '27AABCU9603R1ZN' });
  assert.equal(good.data.ok, true);
  intra(state, { lines: [line({ rate: 10000 })] });
  createPurchase(state, { partyName: 'V', partyGstin: '27AABCT1332L1ZE', partyState: '27', lines: [line({ rate: 2000 })] });
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
  createPurchase(state, { partyName: 'V', partyGstin: '27AABCT1332L1ZE', partyState: '27', lines: [line()] });
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
  assert.throws(() => safeStatePath('C:\\Windows\\win.ini'), /\.json|outside allowed|absolute/);
  assert.throws(() => safeStatePath(join(tmpdir(), '..', 'myca-evil', 'state.json')), /outside allowed/);
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
    partyGstin: '27AAACH7409R1Z1',
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


test('security: live provider calls are opt-in and never fire in tests', async () => {
  assert.equal(liveCallsEnabled(), false);
  const state = createState();
  const nimAsk = await runTool(state, 'nim_ask', { prompt: 'summarise 194C' });
  assert.equal(nimAsk.ok, false);
  assert.equal(nimAsk.error, 'LIVE_CALLS_DISABLED');
  const good = await runTool(state, 'validate_gstin', { gstin: '27AABCU9603R1ZN' });
  assert.equal(good.data.liveVerified, false);
});

test('security: NIC auth refuses to send credentials without the RSA public key', async () => {
  if (existsSync(join(mycaDir(), 'einv-public.pem'))) return;
  const out = await nicAuthenticate(
    { env: 'sandbox', clientId: 'cid', clientSecret: 'sec', username: 'u', password: 'p', gstin: '27AABCU9603R1ZN' },
    async () => { throw new Error('network must not be reached'); },
  );
  assert.equal(out.error, 'MISSING_NIC_PUBLIC_KEY');
});

test('invoice: invalid or zero lines do not leave an orphan party', () => {
  const state = createState();
  assert.equal(createInvoice(state, { partyName: 'Ghost', lines: [line({ qty: 0 })] }).error, 'BAD_LINE');
  assert.equal(createInvoice(state, { partyName: 'Ghost', lines: [line({ rate: 0 })] }).error, 'ZERO_AMOUNT');
  assert.equal(state.parties.length, 0);
  assert.equal(state.ledger.accounts.has(90001n), false);
});

test('invoice: missing party name defaults to Walk-in', () => {
  const state = createState();
  const r = createInvoice(state, { partyGstin: '', partyState: '27', lines: [line()] });
  assert.equal(r.ok, true);
  assert.equal(r.invoice.partyName, 'Walk-in');
});

test('receipt: rejects overpayment, non-positive amounts, and missing party', () => {
  const state = createState();
  const inv = intra(state, { lines: [line({ rate: 1000 })] });
  assert.equal(recordReceipt(state, { invoiceId: inv.invoice.id, amount: 0 }).error, 'BAD_AMOUNT');
  const over = recordReceipt(state, { invoiceId: inv.invoice.id, amount: 2000 });
  assert.equal(over.error, 'OVERPAYMENT');
  assert.equal(over.due, 1050);
  assert.equal(trialBalance(state.ledger).balanced, true);
  state.parties = [];
  assert.equal(recordReceipt(state, { invoiceId: inv.invoice.id, amount: 10 }).error, 'PARTY_NOT_FOUND');
});

test('csv: numeric cells (including negatives) are not formula-escaped', () => {
  assert.equal(csvRows([[-100, '=X', '+Y', '@z', 0]]), "-100,'=X,'+Y,'@z,0");
});

test('tally post: duplicate purchase skipped and zero receipt skipped', () => {
  const state = createState();
  const rows = [
    { voucherType: 'Purchase', voucherNo: 'P1', date: '2026-08-01', ledger: 'V', gstin: '27AABCT1332L1ZE', computedAmount: 1000, gstRate: 18 },
    { voucherType: 'Purchase', voucherNo: 'P1', date: '2026-08-01', ledger: 'V', gstin: '27AABCT1332L1ZE', computedAmount: 1000, gstRate: 18 },
    { voucherType: 'Receipt', voucherNo: 'R0', date: '2026-08-01', ledger: 'C', computedAmount: 0 },
  ];
  const out = postTallyRows(state, rows);
  assert.equal(out.posted, 1);
  assert.equal(out.skipped.some((s) => s.reason === 'exists'), true);
  assert.equal(out.skipped.some((s) => s.reason === 'zero'), true);
  assert.equal(state.purchases.length, 1);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('intent: party name is captured after invoice/purchase without a preposition', () => {
  assert.equal(parseDocument('Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 50000, GST 5%').partyName, 'Retail Mart');
  assert.equal(parseDocument('purchase Fabric Co 20 rolls at 2000 GST 5%').partyName, 'Fabric Co');
  assert.equal(parseDocument('invoice at 1000 GST 18%').partyName, 'Walk-in');
});

test('vault: govt credentials are encrypted at rest and round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-vault-'));
  const prev = process.env.APPDATA;
  process.env.APPDATA = dir;
  try {
    saveGovtConfig({ env: 'sandbox', clientId: 'cid', clientSecret: 'super-secret', username: 'u', password: 'p@ss', gstin: '27AABCU9603R1ZN' });
    const raw = readFileSync(govtConfigPath(), 'utf8');
    assert.doesNotMatch(raw, /super-secret/);
    assert.doesNotMatch(raw, /p@ss/);
    const cfg = loadGovtConfig();
    assert.equal(cfg.clientSecret, 'super-secret');
    assert.equal(cfg.password, 'p@ss');
    assert.equal(publicGovtConfig().passwordSet, true);
    assert.equal(publicGovtConfig().vault, 'aes-256-gcm-local');
  } finally {
    process.env.APPDATA = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault: legacy plaintext govt.json is migrated to encrypted on demand', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-vault-legacy-'));
  const prev = process.env.APPDATA;
  process.env.APPDATA = dir;
  try {
    mkdirSync(join(dir, 'MyCA'), { recursive: true });
    writeFileSync(govtConfigPath(), JSON.stringify({ env: 'sandbox', clientId: 'c', clientSecret: 'legacy-secret', username: 'u', password: 'legacy-pass', gstin: '27AABCU9603R1ZN' }));
    assert.equal(migrateGovtVault(), true);
    const raw = readFileSync(govtConfigPath(), 'utf8');
    assert.doesNotMatch(raw, /legacy-secret/);
    assert.match(raw, /secrets/);
    assert.equal(loadGovtConfig().password, 'legacy-pass');
  } finally {
    process.env.APPDATA = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ca-api: clients get isolated ledgers', () => {
  const state = createState();
  const selfBefore = state.invoices.length;
  const created = handleCaApi(state, 'POST', '/api/ca/clients', { clientId: 'CL-100', name: 'Beta Traders', gstin: '29AAACF7856R1ZO', state: '29', entityType: 'proprietor' });
  assert.equal(created.ok, true);
  assert.equal(handleCaApi(state, 'POST', '/api/ca/clients', { clientId: 'CL-100' }).error, 'CLIENT_EXISTS');
  const posted = handleCaApi(state, 'POST', '/api/ca/clients/CL-100/vouchers', {
    type: 'invoice', partyName: 'Retail Mart', partyGstin: '', partyState: '29',
    lines: [{ description: 'Cloth', qty: 1, rate: 1000, gstRate: 5 }],
  });
  assert.equal(posted.ok, true);
  const betaTb = handleCaApi(state, 'GET', '/api/ca/clients/CL-100/trial-balance');
  assert.equal(betaTb.data.balanced, true);
  assert.equal(state.extraBooks['CL-100'].invoices.length, 1);
  assert.equal(state.invoices.length, selfBefore);
  assert.equal(handleCaApi(state, 'GET', '/api/ca/clients').data.clients.some((c) => c.clientId === 'CL-100'), true);
  assert.throws(() => handleCaApi(state, 'GET', '/api/ca/clients/NOPE/ledger'), /CLIENT_NOT_FOUND/);
});

test('documents: attachment bytes live on disk, not in serialized state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-docs-'));
  const sess = openSession(join(dir, 'MyCA', 'state.json'));
  const res = await sess.attachFile('tally', 'daybook.csv', 'Date,Voucher Type\n2026-08-01,Sales');
  assert.equal(res.ok, true);
  assert.equal(existsSync(join(dir, 'MyCA', 'documents', `${res.sha256}.txt`)), true);
  const persisted = serialize(sess.state);
  assert.equal(persisted.files, undefined);
  assert.equal(persisted.attachments.tally.sha256, res.sha256);
  const reloaded = openSession(join(dir, 'MyCA', 'state.json'));
  assert.match(reloaded.state.files.tally, /daybook|Sales/);
  rmSync(dir, { recursive: true, force: true });
});

test('documents: legacy inline files migrate to the disk store on open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-docs-legacy-'));
  const path = join(dir, 'MyCA', 'state.json');
  const legacy = createState();
  legacy.files = { tally: 'Date,Voucher Type\n2026-08-01,Sales' };
  saveState(path, { ...legacy });
  writeFileSync(path, JSON.stringify({ ...serialize(legacy), files: legacy.files }));
  const sess = openSession(path);
  const stored = sess.state.attachments.tally;
  assert.ok(stored && stored.sha256);
  assert.equal(existsSync(join(dir, 'MyCA', 'documents', `${stored.sha256}.txt`)), true);
  assert.equal(serialize(sess.state).files, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('gstr1 json: real hash; gross turnover only when given, never summed from one month', () => {
  const state = createState();
  intra(state);
  const json = invoicesToGstr1Json(state.company, state.invoices);
  assert.match(json.hash, /^[0-9a-f]{64}$/);
  assert.equal('gt' in json, false);
  assert.equal('cur_gt' in json, false);
  assert.ok(json.warnings.some((w) => w.startsWith('GT_NOT_PROVIDED')));
  const given = invoicesToGstr1Json(state.company, state.invoices, undefined, { grossTurnover: 45000000, currentGrossTurnover: 12000000 });
  assert.equal(given.gt, 45000000);
  assert.equal(given.cur_gt, 12000000);
});

test('approvals: maker-checker, approver role, single use, expiry', () => {
  const state = createState();
  const req = requestApproval(state, { operationId: 'einvoice_generate', actor: { userId: 'maker' } });
  assert.equal(req.ok, true);
  assert.equal(approvalStatus(req.approval), 'pending');
  assert.equal(decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'maker', role: 'partner' } }).error, 'MAKER_CHECKER_VIOLATION');
  assert.equal(decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'reviewer', role: 'clerk' } }).error, 'APPROVER_ROLE_REQUIRED');
  const decided = decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
  assert.equal(decided.approval.status, 'approved');
  assert.equal(reserveApproval(findApproval(state, req.approval.approvalId), { userId: 'ca' }).ok, true);
  settleApproval(findApproval(state, req.approval.approvalId), { ok: true, actor: { userId: 'ca' } });
  assert.equal(approvalStatus(findApproval(state, req.approval.approvalId)), 'used');
  assert.equal(reserveApproval(findApproval(state, req.approval.approvalId), { userId: 'ca' }).error, 'APPROVAL_NOT_ACTIVE');
  const expired = requestApproval(state, { operationId: 'einvoice_cancel', actor: { userId: 'maker' } });
  decideApproval(state, { approvalId: expired.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' }, ttlMs: -1000 });
  assert.equal(approvalStatus(findApproval(state, expired.approval.approvalId)), 'expired');
});

test('sandbox adapter: live gate, assistant block, approvals and secret redaction refuse before any provider call', async () => {
  const state = createState();
  const client = { searchGstin: async () => { throw new Error('an injected client must never be called'); } };

  const off = await runSandboxOperation({ actorId: 'ca', operationId: 'gstin_verify', params: { gstin: '27AABCU9603R1ZN' } }, { state, client });
  assert.equal(off.error, 'LIVE_CALLS_DISABLED');
  assert.equal((await runSandboxOperation({ actorId: 'ca', operationId: 'nope' }, { state, client })).error, 'UNKNOWN_SANDBOX_OPERATION');

  const assist = await runSandboxOperation({ operationId: 'einvoice_generate', actorId: 'assistant', caApprovalId: 'APR-000001' }, { state, client });
  assert.equal(assist.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');

  const liveBefore = process.env.MYCA_ENABLE_LIVE_CALLS;
  process.env.MYCA_ENABLE_LIVE_CALLS = '1';
  try {
    const noApproval = await runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', caApprovalId: '', params: { payload: { Version: '1.1' } } }, { state, client });
    assert.equal(noApproval.error, 'CA_APPROVAL_REQUIRED');

    const secret = await runSandboxOperation({ actorId: 'ca', operationId: 'gstin_verify', payloadSummary: { apiKey: 'x' } }, { state, client });
    assert.equal(secret.error, 'SECRET_FIELDS_NOT_ALLOWED_IN_HANDOFF');

  } finally {
    process.env.MYCA_ENABLE_LIVE_CALLS = liveBefore;
  }
});

test('tools: approval workflow is exposed and gated ops stay non-autonomous', async () => {
  const state = createState();
  const req = await runTool(state, 'approval_request', { operationId: 'einvoice_generate', requestedBy: 'maker' });
  assert.equal(req.ok, true);
  assert.equal((await runTool(state, 'approval_list', {})).data.approvals.length, 1);
  const blocked = validateAssistantToolCall('approval_decide', { approvalId: req.data.approval.approvalId, decision: 'approve', decidedBy: 'p', role: 'partner' });
  assert.equal(blocked.ok, false);
  const run = await runTool(state, 'sandbox_operation', { operationId: 'gstin_verify' });
  assert.equal(run.ok, false);
  assert.equal(run.error, 'LIVE_CALLS_DISABLED');
  const names = assistantTools(TOOLS).map((t) => t.name);
  assert.equal(names.includes('approval_decide'), false);
  assert.equal(names.includes('sandbox_operation'), true);
});

test('company: set_company validates and updates the profile', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'set_company', { gstin: '27ABC' })).error, 'INVALID_GSTIN');
  assert.equal((await runTool(state, 'set_company', { fy: '26-27' })).error, 'INVALID_FY');
  assert.equal((await runTool(state, 'set_company', { pin: '123' })).error, 'INVALID_PIN');
  const out = await runTool(state, 'set_company', { name: 'Acme Traders', gstin: '27AABCU9603R1ZN', city: 'Pune', pin: '411001' });
  assert.equal(out.ok, true);
  assert.equal(state.company.name, 'Acme Traders');
  assert.equal(state.company.state, '27');
  assert.equal(state.company.pin, 411001);
  assert.equal((await runTool(state, 'set_company', { name: '' })).error, 'COMPANY_NAME_REQUIRED');
});

test('clients: register, switch active, and isolate books inside the app', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-clients-'));
  const sess = openSession(join(dir, 'MyCA', 'state.json'));
  sess.state.invoices = [];
  sess.state.invoiceSeq = 0;
  sess.state.parties = [];
  assert.equal((await sess.tool('add_client', { clientId: 'CL-7', name: 'Beta', gstin: '29AAACF7856R1ZO', state: '29' })).ok, true);
  assert.equal((await sess.tool('add_client', { clientId: 'CL-7', name: 'Beta' })).error, 'CLIENT_EXISTS');
  assert.equal((await sess.tool('set_active_client', { clientId: 'NOPE' })).error, 'CLIENT_NOT_FOUND');
  assert.equal((await sess.tool('set_active_client', { clientId: 'CL-7' })).ok, true);
  const inv = await sess.tool('create_invoice', { partyName: 'X', partyGstin: '', partyState: '29', lines: [{ description: 's', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(inv.ok, true);
  assert.equal(sess.state.extraBooks['CL-7'].invoices.length, 1);
  assert.equal(sess.state.invoices.length, 0);
  const snap = sess.snapshot();
  assert.equal(snap.activeClientId, 'CL-7');
  assert.equal(snap.invoices.length, 1);
  assert.equal(snap.clients.some((c) => c.clientId === 'CL-7'), true);
  assert.equal((await sess.tool('set_active_client', { clientId: 'SELF' })).ok, true);
  assert.equal(sess.snapshot().invoices.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('ca-api: document content can be read back through the content route', () => {
  const state = createState();
  const up = handleCaApi(state, 'POST', '/api/ca/clients/SELF/documents', { kind: 'gstr2b', fileName: 'g.csv', content: 'a,b\n1,2' });
  assert.equal(up.ok, true);
  const id = up.data.documentId;
  assert.equal(handleCaApi(state, 'GET', '/api/ca/clients/SELF/documents').data.documents.length, 1);
  const content = handleCaApi(state, 'GET', `/api/ca/clients/SELF/documents/${id}`);
  assert.equal(content.ok, true);
  assert.equal(content.data.content, 'a,b\n1,2');
  assert.equal(content.data.fileName, 'g.csv');
  assert.equal(handleCaApi(state, 'GET', '/api/ca/clients/SELF/documents/DOC-999999').error, 'DOCUMENT_NOT_FOUND');
});

test('tools: file, list and read documents for the active client', async () => {
  const state = createState();
  assert.equal(validateAssistantToolCall('save_document', { content: 'x' }).ok, false);
  assert.equal(validateAssistantToolCall('get_document', { documentId: 'DOC-000001' }).ok, false);
  const saved = await runTool(state, 'save_document', { kind: 'bank_statement', fileName: 'hdfc.csv', content: 'Date,Amount\n2026-08-01,100' });
  assert.equal(saved.ok, true);
  const list = await runTool(state, 'list_documents', {});
  assert.equal(list.data.documents.length, 1);
  assert.equal(list.data.documents[0].kind, 'bank_statement');
  const read = await runTool(state, 'get_document', { documentId: saved.data.documentId });
  assert.equal(read.data.content, 'Date,Amount\n2026-08-01,100');
  assert.equal((await runTool(state, 'get_document', {})).ok, false);
  assert.equal(assistantTools(TOOLS).map((t) => t.name).includes('list_documents'), true);
});

test('backup/restore: round-trips books, clients and documents', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-backup-'));
  const path = join(dir, 'MyCA', 'state.json');
  const sess = openSession(path);
  sess.state.invoices = [];
  sess.state.invoiceSeq = 0;
  sess.state.parties = [];
  await sess.tool('create_invoice', { partyName: 'A', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  await sess.tool('save_document', { kind: 'bank_statement', fileName: 'b.csv', content: 'a,b\n1,2' });
  const backup = sess.backup();
  assert.equal(backup.version, 1);
  assert.equal(backup.state.invoices.length, 1);
  assert.equal(Object.keys(backup.documents).length, 1);

  await sess.tool('create_invoice', { partyName: 'B', partyGstin: '', partyState: '27', lines: [{ description: 'y', qty: 1, rate: 200, gstRate: 5 }] });
  assert.equal(sess.state.invoices.length, 2);

  assert.equal((await sess.restore({ ...backup })).error, 'CONFIRMATION_REQUIRED');
  assert.equal((await sess.restore({ version: 2, state: {}, confirm: true })).error, 'INVALID_BACKUP');
  const restored = await sess.restore({ ...backup, confirm: true });
  assert.equal(restored.ok, true);
  assert.equal(sess.state.invoices.length, 1);
  assert.equal(restored.restored.documents, 1);
  assert.equal((await sess.tool('get_document', { documentId: 'DOC-000001' })).data.content, 'a,b\n1,2');
  rmSync(dir, { recursive: true, force: true });
});

test('period lock: rejects postings on or before the locked date, allows after', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'lock_period', { through: 'nope' })).error, 'INVALID_DATE');
  assert.equal((await runTool(state, 'lock_period', { through: '2026-08-31' })).ok, true);
  assert.equal(state.lockThrough, '2026-08-31');
  const locked = await runTool(state, 'create_invoice', { date: '2026-08-15', partyName: 'A', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(locked.ok, false);
  assert.equal(locked.error, 'PERIOD_LOCKED');
  assert.equal((await runTool(state, 'post_expense', { amount: 100, date: '2026-07-01' })).error, 'PERIOD_LOCKED');
  const allowed = await runTool(state, 'create_invoice', { date: '2026-09-01', partyName: 'A', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(allowed.ok, true);
  assert.equal((await runTool(state, 'unlock_period', { reason: 'correction' })).ok, true);
  assert.equal(state.lockThrough, '');
  assert.equal((await runTool(state, 'create_invoice', { date: '2026-08-15', partyName: 'B', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] })).ok, true);
  assert.equal(validateAssistantToolCall('lock_period', { through: '2026-08-31' }).ok, false);
  assert.equal((await runTool(state, 'period_status', {})).data.rows[0].clientId, 'SELF');
});

test('period lock: applies per client book, not to SELF', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-lock-'));
  const sess = openSession(join(dir, 'MyCA', 'state.json'));
  await sess.tool('add_client', { clientId: 'CL-1', name: 'Beta', state: '29' });
  await sess.tool('set_active_client', { clientId: 'CL-1' });
  assert.equal((await sess.tool('lock_period', { through: '2026-08-31' })).ok, true);
  assert.equal(sess.state.extraBooks['CL-1'].lockThrough, '2026-08-31');
  assert.equal(sess.state.lockThrough, '');
  const locked = await sess.tool('create_invoice', { date: '2026-08-10', partyName: 'X', partyGstin: '', partyState: '29', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(locked.error, 'PERIOD_LOCKED');
  await sess.tool('set_active_client', { clientId: 'SELF' });
  assert.equal((await sess.tool('create_invoice', { date: '2026-08-10', partyName: 'Y', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] })).ok, true);
  rmSync(dir, { recursive: true, force: true });
});

test('notifications: share builds a deep link, queues, and only sends when live', async () => {
  const state = createState();
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [line({ rate: 1000 })] });
  const share = await runTool(state, 'share_invoice', { invoiceId: inv.invoice.id, channel: 'whatsapp', to: '91 98765 43210' });
  assert.equal(share.ok, true);
  assert.match(share.data.link, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.equal(share.data.message.status, 'queued');
  assert.equal((await runTool(state, 'list_outbox', {})).data.messages.length, 1);
  assert.equal((await runTool(state, 'send_notification', { messageId: share.data.message.id })).error, 'LIVE_CALLS_DISABLED');
  const mail = await runTool(state, 'share_invoice', { invoiceId: inv.invoice.id, channel: 'email', to: 'a@b.in' });
  assert.match(mail.data.link, /^mailto:a%40b\.in\?subject=/);
  assert.equal((await runTool(state, 'share_invoice', { invoiceId: 'INV-9999', channel: 'email' })).error, 'INVOICE_NOT_FOUND');
  assert.equal((await runTool(state, 'share_invoice', { invoiceId: inv.invoice.id, channel: 'sms' })).error, 'UNKNOWN_CHANNEL');
  assert.equal(validateAssistantToolCall('send_notification', { messageId: 'MSG-000001' }).ok, false);
});

test('notifications: transports deliver with an injected fetch', async () => {
  const state = createState();
  const wa = queueNotification(state, { channel: 'whatsapp', to: '919876543210', subject: 's', body: 'b' });
  let seen = null;
  const waFetch = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.TEST' }] }) };
  };
  const sent = await sendNotification(state, wa.message.id, {
    allowLive: true,
    env: { MYCA_WHATSAPP_PHONE_NUMBER_ID: '123', MYCA_WHATSAPP_ACCESS_TOKEN: 'tok' },
    fetchFn: waFetch,
  });
  assert.equal(sent.ok, true);
  assert.equal(wa.message.status, 'sent');
  assert.equal(wa.message.providerId, 'wamid.TEST');
  assert.match(seen.url, /graph\.facebook\.com\/v20\.0\/123\/messages/);
  assert.equal(JSON.parse(seen.opts.body).to, '919876543210');

  const emailFetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'relay-1' }) });
  const mail = queueNotification(state, { channel: 'email', to: 'a@b.in', subject: 's', body: 'b' });
  const mailSent = await sendNotification(state, mail.message.id, {
    allowLive: true,
    env: { MYCA_EMAIL_RELAY_URL: 'https://relay.test/send', MYCA_EMAIL_FROM: 'me@myca.in' },
    fetchFn: emailFetch,
  });
  assert.equal(mailSent.ok, true);
  const unconfigured = queueNotification(state, { channel: 'email', to: 'a@b.in', subject: 's', body: 'b' });
  const failed = await sendNotification(state, unconfigured.message.id, { allowLive: true, env: {}, fetchFn: emailFetch });
  assert.equal(failed.error, 'EMAIL_NOT_CONFIGURED');
  assert.equal(unconfigured.message.status, 'failed');
});

test('sandbox client: environment detection and scoped key selection', () => {
  const testClient = new SandboxClient({ baseUrl: 'https://test-api.sandbox.co.in', apiKey: 'k', apiSecret: 's', fetchFn: async () => ({}) });
  assert.equal(testClient.environment, 'test');
  const liveClient = new SandboxClient({ baseUrl: 'https://api.sandbox.co.in', apiKey: 'k', apiSecret: 's', fetchFn: async () => ({}) });
  assert.equal(liveClient.environment, 'live');

  const saved = {};
  for (const key of ['MYCA_GSP_TEST_API_KEY', 'MYCA_GSP_TEST_API_SECRET', 'MYCA_GSP_LIVE_API_KEY', 'MYCA_GSP_LIVE_API_SECRET', 'MYCA_GSP_ENV']) {
    saved[key] = process.env[key];
  }
  process.env.MYCA_GSP_TEST_API_KEY = 'test-key';
  process.env.MYCA_GSP_TEST_API_SECRET = 'test-secret';
  process.env.MYCA_GSP_LIVE_API_KEY = 'live-key';
  process.env.MYCA_GSP_LIVE_API_SECRET = 'live-secret';
  try {
    const t = new SandboxClient({ baseUrl: 'https://test-api.sandbox.co.in', fetchFn: async () => ({}) });
    assert.equal(t.apiKey, 'test-key');
    assert.equal(t.keySource, 'MYCA_GSP_TEST_API_KEY');
    const l = new SandboxClient({ baseUrl: 'https://api.sandbox.co.in', fetchFn: async () => ({}) });
    assert.equal(l.environment, 'live');
    assert.equal(l.apiKey, 'live-key');
    const forced = new SandboxClient({ baseUrl: 'https://test-api.sandbox.co.in', environment: 'live', fetchFn: async () => ({}) });
    assert.equal(forced.apiKey, 'live-key');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('provider doctor: reports configuration, environment and missing pieces', async () => {
  const { providerDoctor } = await import('../src/provider-doctor.mjs');
  const report = await providerDoctor({
    env: {
      MYCA_GSP_BASE_URL: 'https://test-api.sandbox.co.in',
      MYCA_GSP_TEST_API_KEY: 'k',
      MYCA_GSP_TEST_API_SECRET: 's',
      MYCA_EMAIL_FROM: 'me@myca.in',
      MYCA_TALLY_HOST: '127.0.0.1',
      MYCA_TALLY_PORT: '9000',
    },
    allowNetwork: false,
    govt: { env: 'sandbox', clientId: 'c', clientSecret: 's', username: 'u', password: 'p', gstin: '27AABCU9603R1ZN' },
    hasPublicKey: false,
    probeTally: async () => ({ status: 'error', error: 'ECONNREFUSED' }),
  });
  const sandbox = report.providers.find((p) => p.id === 'sandbox');
  assert.equal(sandbox.configured, true);
  assert.equal(sandbox.environment, 'test');
  assert.equal(sandbox.reachability.status, 'skipped');
  const nic = report.providers.find((p) => p.id === 'nic_einvoice');
  assert.equal(nic.configured, false);
  assert.equal(nic.missing.includes('einv-public.pem (RSA public key)'), true);
  const email = report.providers.find((p) => p.id === 'email');
  assert.equal(email.missing.includes('MYCA_EMAIL_RELAY_URL'), true);
  assert.equal(report.providers.find((p) => p.id === 'whatsapp').configured, false);
  assert.equal(report.providers.find((p) => p.id === 'tally').reachability.status, 'error');
  assert.equal(report.summary.providers, 7);
  assert.equal(report.liveCallsEnabled, false);
});

test('provider doctor: pings sandbox when live and configured', async () => {
  const { providerDoctor } = await import('../src/provider-doctor.mjs');
  const report = await providerDoctor({
    env: { MYCA_GSP_BASE_URL: 'https://test-api.sandbox.co.in', MYCA_GSP_API_KEY: 'k', MYCA_GSP_API_SECRET: 's' },
    allowNetwork: true,
    sandboxClient: { ping: async () => ({ ok: true, ms: 42, environment: 'test' }) },
    govt: {},
    hasPublicKey: false,
    probeTally: async () => ({ status: 'skipped' }),
  });
  const sandbox = report.providers.find((p) => p.id === 'sandbox');
  assert.equal(sandbox.reachability.status, 'ok');
  assert.equal(sandbox.reachability.ms, 42);
  assert.equal(report.summary.reachable, 1);
});

test('nic: public key normalises from PEM, base64 DER and a file path', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { normalizeNicPublicKey } = await import('../src/govt.mjs');
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const fromPem = normalizeNicPublicKey(pair.publicKey);
  assert.equal(fromPem.ok, true);
  assert.equal(fromPem.bits, 2048);
  assert.match(fromPem.pem, /BEGIN PUBLIC KEY/);

  const der = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  assert.equal(normalizeNicPublicKey(der.publicKey.toString('base64')).ok, true);
  const dir = mkdtempSync(join(tmpdir(), 'myca-nic-'));
  const cerPath = join(dir, 'einv.cer');
  writeFileSync(cerPath, der.publicKey);
  assert.equal(normalizeNicPublicKey(cerPath).ok, true);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(normalizeNicPublicKey('not a key').error, 'INVALID_PUBLIC_KEY');
  assert.equal(normalizeNicPublicKey('').error, 'PUBLIC_KEY_REQUIRED');
});

test('nic: govt_set_public_key validates, stores and is assistant-blocked', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const dir = mkdtempSync(join(tmpdir(), 'myca-nicstore-'));
  const prev = process.env.APPDATA;
  process.env.APPDATA = dir;
  try {
    assert.equal((await runTool(createState(), 'govt_set_public_key', { key: 'nope' })).ok, false);
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const good = await runTool(createState(), 'govt_set_public_key', { key: pair.publicKey });
    assert.equal(good.ok, true);
    assert.equal(good.data.bits, 2048);
    assert.match(loadGovtConfig().publicKeyPem, /BEGIN PUBLIC KEY/);
    assert.equal(validateAssistantToolCall('govt_set_public_key', { key: 'x' }).ok, false);
  } finally {
    process.env.APPDATA = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('notifications: test_notification is gated and rejects unknown channels', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'test_notification', { channel: 'sms', to: 'x' })).error, 'UNKNOWN_CHANNEL');
  assert.equal((await runTool(state, 'test_notification', { channel: 'email', to: 'a@b.in' })).error, 'LIVE_CALLS_DISABLED');
  assert.equal((await runTool(state, 'list_outbox', {})).data.messages.length, 1);
  assert.equal(validateAssistantToolCall('test_notification', { channel: 'email', to: 'a@b.in' }).ok, false);
});

test('provider doctor: warns on a live URL with only a generic key', async () => {
  const { providerDoctor } = await import('../src/provider-doctor.mjs');
  const report = await providerDoctor({
    env: { MYCA_GSP_BASE_URL: 'https://api.sandbox.co.in', MYCA_GSP_API_KEY: 'k', MYCA_GSP_API_SECRET: 's' },
    allowNetwork: false,
    govt: {},
    hasPublicKey: false,
    probeTally: async () => ({ status: 'skipped' }),
  });
  const sandbox = report.providers.find((p) => p.id === 'sandbox');
  assert.equal(sandbox.environment, 'live');
  assert.equal(sandbox.warnings.length, 1);
  assert.match(sandbox.warnings[0], /LIVE base URL/);
  assert.equal(report.summary.warnings >= 1, true);
});
