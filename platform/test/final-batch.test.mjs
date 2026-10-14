import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose } from '../src/router.mjs';
import { setModelTransport } from '../src/model-adapter.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);
const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_1', name, input }] });

afterEach(() => setModelTransport(null));

function indianBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('with a model configured, an unmatched message is routed to one tool; writes still wait for confirmation; no match is said plainly', async () => {
  const state = indianBooks();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-09-01' });
  const seen = [];
  setModelTransport(async (body) => {
    seen.push(body);
    const text = body.messages[0].content;
    if (/money/.test(text)) return { ok: true, response: toolUse('business_summary', {}) };
    if (/bill Kiran/.test(text)) return { ok: true, response: toolUse('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Repair', hsn: '9987', qty: 1, rate: 2500, gstRate: 18 }] }) };
    return { ok: true, response: toolUse('no_matching_action', { reason: 'not about the books' }) };
  });
  const summary = await chat(state, 'how is the money situation looking these days');
  assert.equal(summary.viaModel, true, summary.reply);
  assert.equal(summary.tools[0].name, 'business_summary');
  assert.ok(seen[0].tools.some((tool) => tool.name === 'no_matching_action'));
  assert.ok(!seen[0].tools.some((tool) => tool.name === 'govt_save_credentials' || tool.name === 'run_automation'), 'blocked and internal tools are never offered');
  const write = await chat(state, 'please bill Kiran for the repair work we did');
  assert.equal(write.awaitingConfirmation, true, write.reply);
  assert.equal(write.preview.tool, 'create_invoice');
  assert.equal(write.preview.figures.total, 2950);
  assert.equal(state.invoices.length, 1, 'nothing posts without confirmation');
  const none = await chat(state, 'what is the weather in Pune');
  assert.match(none.reply, /nothing was recorded/);
  assert.match(none.reply, /not about the books/);
  setModelTransport(null);
  const canned = await chat(state, 'how is the money situation looking these days');
  assert.equal(canned.viaModel, undefined);
  assert.match(canned.reply, /I did not match that/);
});

test('an uploaded bill is read by the model into a purchase proposal that the engine prices; a bad GSTIN and a missing rate become warnings', async () => {
  const state = indianBooks();
  const documents = createMemoryDocumentStore();
  state._documents = documents;
  const image = `data:image/jpeg;base64,${Buffer.from('not really a jpeg').toString('base64')}`;
  const { sha256 } = documents.put(image);
  setModelTransport(async (body) => {
    const block = body.messages[0].content[0];
    assert.equal(block.type, 'image');
    assert.equal(block.source.media_type, 'image/jpeg');
    return { ok: true, response: toolUse('supplier_bill', { supplierName: 'Ganga Mills', supplierGstin: 'NOT-A-GSTIN', invoiceNo: 'GM/221', date: '2026-10-03', lines: [{ description: 'Cotton yarn', hsn: '5205', qty: 10, rate: 1200, gstRate: 5 }, { description: 'Freight', qty: 1, rate: 500 }], total: 13100, confidence: 0.85 }) };
  });
  const read = await runTool(state, 'read_document', { documentSha256: sha256 });
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.data.proposal.tool, 'create_purchase');
  assert.equal(read.data.proposal.args.partyName, 'Ganga Mills');
  assert.equal(read.data.proposal.args.partyGstin, undefined);
  assert.equal(read.data.proposal.args.supplierInvoiceNo, 'GM/221');
  assert.ok(read.data.warnings.some((w) => /GSTIN/.test(w)), JSON.stringify(read.data.warnings));
  assert.ok(read.data.warnings.some((w) => /no GST rate/.test(w)));
  assert.equal(isRemoteQuery('read_document'), true);
  const args = { ...read.data.proposal.args, lines: read.data.proposal.args.lines.map((line) => ({ ...line, gstRate: line.gstRate ?? 5 })) };
  const held = propose(state, 'create_purchase', args);
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.figures.total, 13125, 'the engine, not the model, prices the bill');
  setModelTransport(null);
  delete process.env.MYCA_MODEL_API_KEY;
  const off = await runTool(state, 'read_document', { documentSha256: sha256 });
  assert.equal(off.error, 'MODEL_NOT_CONFIGURED');
});

test('a filed invoice is amended: the difference posts, the next GSTR-1 carries B2BA with the original number, the filed month is unchanged, and GSTR-9 shows amendments and 0% lines', async () => {
  const state = indianBooks();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }, { description: 'Grain', hsn: '1001', qty: 1, rate: 2000, gstRate: 0 }], date: '2026-09-10' });
  const invoice = state.invoices[0];
  const early = await runTool(state, 'amend_invoice', { invoiceId: invoice.id, reason: 'Rate was wrong', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 12000, gstRate: 18 }, { description: 'Grain', hsn: '1001', qty: 1, rate: 2000, gstRate: 0 }], date: '2026-10-05' });
  assert.equal(early.error, 'NOT_FILED');
  const filed = await runTool(state, 'record_filing', { returnType: 'GSTR-1', period: '2026-09', arn: 'AA270926123456A', filedOn: '2026-10-11' });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  const held = propose(state, 'amend_invoice', { invoiceId: invoice.id, reason: 'Rate was wrong', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 12000, gstRate: 18 }, { description: 'Grain', hsn: '1001', qty: 1, rate: 2000, gstRate: 0 }], date: '2026-10-12' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.figures.delta, 2360);
  const out = await runTool(state, 'amend_invoice', { invoiceId: invoice.id, reason: 'Rate was wrong', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 12000, gstRate: 18 }, { description: 'Grain', hsn: '1001', qty: 1, rate: 2000, gstRate: 0 }], date: '2026-10-12' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(invoice.total, 16160);
  assert.equal(invoice.amendments.length, 1);
  assert.equal(acc(state, '4000').creditsPosted, 14000);
  assert.equal(acc(state, '2100').creditsPosted, 1080);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const october = invoicesToGstr1Json(state.company, state.invoices, '102026');
  assert.equal(october.b2b.length, 0);
  assert.equal(october.b2ba[0].ctin, '27AAACH7409R1Z1');
  assert.equal(october.b2ba[0].inv[0].oinum, invoice.id);
  assert.equal(october.b2ba[0].inv[0].oidt, '10-09-2026');
  assert.equal(october.b2ba[0].inv[0].val, 16160);
  const september = invoicesToGstr1Json(state.company, state.invoices, '092026');
  assert.equal(september.b2b[0].inv[0].val, 13800, 'the filed month keeps the figures as filed');
  assert.equal(september.b2ba, undefined);
  const listed = await runTool(state, 'list_amendments', { period: '2026-10' });
  assert.equal(listed.data.count, 1);
  assert.equal(listed.data.amendments[0].delta, 2360);
  const again = await runTool(state, 'amend_invoice', { invoiceId: invoice.id, reason: 'same', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 12000, gstRate: 18 }, { description: 'Grain', hsn: '1001', qty: 1, rate: 2000, gstRate: 0 }], date: '2026-10-13' });
  assert.equal(again.error, 'NOTHING_CHANGED');
  const annual = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(annual.data.table5.nilRatedOrExempt, 2000);
  assert.equal(annual.data.table4.amendments.count, 1);
  assert.equal(annual.data.table4.amendments.taxable, 2000);
  const reply = await chat(state, 'list amendments');
  assert.match(reply.reply, /AMD-0001/);
});

function usBooks() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', address: '12 Maple St', ein: '12-3456789' };
  return state;
}

test('Schedule SE comes from the Schedule C net profit with the statutory reduction, the wage base and the deductible half; tiny profits owe nothing', async () => {
  const state = usBooks();
  await runTool(state, 'set_sales_tax_rate', { code: 'TX', ratePercent: 6.25, from: '2026-01-01' });
  await runTool(state, 'create_invoice', { partyName: 'Cafe Luna', lines: [{ description: 'Cakes', qty: 1, rate: 60000 }], date: '2026-03-01', taxJurisdiction: 'TX' });
  await runTool(state, 'post_expense', { narration: 'Shop rent', payee: 'Realty', amount: 10000, date: '2026-04-01' });
  const se = await runTool(state, 'schedule_se', { year: '2026' });
  assert.equal(se.ok, true, JSON.stringify(se));
  assert.equal(se.data.netEarnings, 46175);
  assert.equal(se.data.lines[5].amount, 5725.7);
  assert.equal(se.data.lines[6].amount, 1339.08);
  assert.equal(se.data.selfEmploymentTax, 7064.78);
  assert.equal(se.data.deduction, 3532.39);
  assert.equal(se.data.additionalMedicareTax, 0);
  assert.equal(se.data.unreviewed, true);
  const capped = await runTool(state, 'schedule_se', { year: '2026', otherSocialSecurityWages: 150000, filingStatus: 'married_separate' });
  assert.equal(capped.data.lines[5].amount, 4278);
  assert.ok(capped.data.additionalMedicareTax > 0);
  const tiny = usBooks();
  await runTool(tiny, 'set_sales_tax_rate', { code: 'TX', ratePercent: 6.25, from: '2026-01-01' });
  await runTool(tiny, 'create_invoice', { partyName: 'Cafe Luna', lines: [{ description: 'Cake', qty: 1, rate: 300 }], date: '2026-03-01', taxJurisdiction: 'TX' });
  const none = await runTool(tiny, 'schedule_se', { year: '2026' });
  assert.equal(none.data.belowMinimum, true);
  assert.equal(none.data.selfEmploymentTax, 0);
  const words = await chat(state, 'self-employment tax');
  assert.match(words.reply, /Schedule SE 2026/);
  assert.equal((await runTool(indianBooks(), 'schedule_se', {})).error, 'NOT_FOR_COUNTRY');
});

test('the Schedule C document, the CPA pack and the payroll files come out as files with the engine figures', async () => {
  const state = usBooks();
  await runTool(state, 'set_sales_tax_rate', { code: 'TX', ratePercent: 6.25, from: '2026-01-01' });
  await runTool(state, 'set_sales_tax_nexus', { state: 'TX', frequency: 'monthly', from: '2026-01-01' });
  await runTool(state, 'create_invoice', { partyName: 'Cafe Luna', lines: [{ description: 'Cakes', qty: 1, rate: 60000 }], date: '2026-03-01', taxJurisdiction: 'TX' });
  await runTool(state, 'add_employee', { name: 'Ana Lopez', joinedOn: '2026-01-01', components: [{ name: 'Salary', amount: 5000 }], workState: 'TX', federalWithholding: 400 });
  const draft = await runTool(state, 'payroll_run', { period: '2026-01' });
  assert.equal(draft.ok, true, JSON.stringify(draft));
  const approved = await runTool(state, 'approve_payroll', { period: '2026-01', draftHash: draft.data.draftHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const doc = await runTool(state, 'schedule_c_document', { year: '2026' });
  assert.equal(doc.ok, true, JSON.stringify(doc));
  assert.equal(doc.data.fileName, 'schedule_c_2026.html');
  assert.match(doc.data.html, /Schedule C summary 2026/);
  assert.match(doc.data.html, /Schedule SE draft/);
  assert.match(doc.data.html, /Maple Street Bakery/);
  const pack = await runTool(state, 'cpa_pack', { year: '2026' });
  assert.equal(pack.ok, true, JSON.stringify(pack));
  assert.equal(pack.data.fileName, 'cpa_pack_2026.json');
  assert.ok(pack.data.sections.includes('scheduleSE'));
  assert.ok(pack.data.sections.includes('payroll'));
  assert.ok(pack.data.pack.salesTaxReturns.length >= 1);
  assert.ok(pack.data.pack.trialBalance.accounts > 0);
  assert.match(pack.data.pack.trialBalance.csv, /^code,account/);
  const q1 = await runTool(state, 'payroll_941_file', { quarter: '2026-Q1' });
  assert.equal(q1.ok, true, JSON.stringify(q1));
  assert.equal(q1.data.fileName, 'form_941_2026-Q1.csv');
  assert.match(q1.data.csv, /^line,description,amount/);
  assert.equal(q1.data.lines[0].amount, 5000);
  assert.equal(q1.data.lines[1].amount, 400);
  assert.equal((await runTool(state, 'payroll_941_file', { quarter: '2026-Q3' })).error, 'NO_PAYROLL');
  const w2 = await runTool(state, 'payroll_w2_file', { year: '2026' });
  assert.equal(w2.ok, true, JSON.stringify(w2));
  assert.equal(w2.data.employees.length, 1);
  assert.equal(w2.data.w3.wages, 5000);
  assert.match(w2.data.csv, /W-3,Totals/);
  for (const name of ['schedule_c_document', 'cpa_pack', 'payroll_941_file', 'payroll_w2_file', 'schedule_se']) assert.equal(isRemoteQuery(name), true, name);
  const reply = await chat(state, 'cpa pack');
  assert.match(reply.reply, /CPA pack 2026/);
});

test('a sales tax payment made before the period ends is recorded as a prepayment', async () => {
  const state = usBooks();
  await runTool(state, 'set_sales_tax_rate', { code: 'TX', ratePercent: 6.25, from: '2026-01-01' });
  await runTool(state, 'set_sales_tax_nexus', { state: 'TX', frequency: 'quarterly', from: '2026-01-01' });
  await runTool(state, 'create_invoice', { partyName: 'Cafe Luna', lines: [{ description: 'Cakes', qty: 1, rate: 1000 }], date: '2026-02-01', taxJurisdiction: 'TX' });
  const early = await runTool(state, 'record_sales_tax_payment', { state: 'TX', period: '2026-Q1', amount: 30, date: '2026-02-15' });
  assert.equal(early.ok, true, JSON.stringify(early));
  assert.equal(early.payment.prepayment, true);
  const later = await runTool(state, 'record_sales_tax_payment', { state: 'TX', period: '2026-Q1', amount: 32.5, date: '2026-04-10' });
  assert.equal(later.ok, true, JSON.stringify(later));
  assert.equal(later.payment.prepayment, false);
  assert.equal(later.left, 0);
});
