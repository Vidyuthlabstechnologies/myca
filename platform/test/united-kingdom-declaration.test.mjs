import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runEngineTool, enginePreview, engineWords } from '../src/countries/engines.mjs';
import { ChannelClient, getChannelClient, setChannelClient } from '../src/channel-client.mjs';
import { FINAL_DECLARATION, declarationFor, filingDeadline, amendmentWindowCloses, amendmentOpen, taxYearEnded } from '../src/countries/united-kingdom/declarations.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function gbState() {
  const state = createState();
  state.company = { ...(state.company || {}), country: 'GB', name: 'Test Trader' };
  runEngineTool('set_gb_taxpayer', state, { name: 'Test Trader', nino: 'AA123456C' });
  return state;
}

async function connected() {
  const state = gbState();
  const link = runEngineTool('connect_gb_hmrc', state, {});
  await runEngineTool('finish_gb_hmrc_connection', state, { code: 'abcdefgh123', state: link.data.state });
  return state;
}

test('the declaration words are HMRC\'s own, for the taxpayer and for an agent', () => {
  assert.equal(FINAL_DECLARATION.taxpayer, 'I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information.');
  assert.match(FINAL_DECLARATION.agent, /^I confirm that my client has received a copy of all the information being filed/);
  assert.match(FINAL_DECLARATION.preamble, /in response to your notice to file from HM Revenue & Customs/);
  assert.equal(declarationFor('agent').text, FINAL_DECLARATION.agent);
  assert.equal(declarationFor().declaredBy, 'taxpayer');
  assert.equal(declarationFor('someone'), null);
});

test('deadlines: the return is due 31 January after the year and can be amended for 12 more months', () => {
  assert.equal(filingDeadline('2025-26'), '2027-01-31');
  assert.equal(amendmentWindowCloses('2025-26'), '2028-01-31');
  assert.equal(amendmentOpen('2025-26', '2028-01-31'), true);
  assert.equal(amendmentOpen('2025-26', '2028-02-01'), false);
  assert.equal(taxYearEnded('2025-26', '2026-04-05'), false);
  assert.equal(taxYearEnded('2025-26', '2026-04-06'), true);
  assert.equal(filingDeadline('2025-27'), null);
});

test('an agent declares for a client and the receipt keeps the exact words agreed', async () => {
  await withEnv({ MYCA_MOCK_MODE: '1', MYCA_PROVIDER_ENV: 'test' }, async () => {
    const state = await connected();
    const final = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-finalise' });
    assert.equal(final.ok, true, JSON.stringify(final));
    assert.equal((await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: final.data.calculationId, declaration: true, declaredBy: 'accountant' })).error, 'BAD_DECLARER');
    const refused = await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: final.data.calculationId, declaration: false, declaredBy: 'agent' });
    assert.equal(refused.declarationText, FINAL_DECLARATION.agent);
    const preview = enginePreview('submit_gb_final_declaration')(state, { taxYear: '2025-26', calculationId: final.data.calculationId, declaration: true, declaredBy: 'agent' });
    assert.deepEqual(preview.blockers, []);
    assert.ok(preview.effects.includes(`Declaration: ${FINAL_DECLARATION.agent}`));
    assert.match(preview.effects.join(' '), /amended until 2028-01-31/);
    const sent = await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: final.data.calculationId, declaration: true, declaredBy: 'agent' });
    assert.equal(sent.ok, true);
    assert.equal(sent.data.declaredBy, 'agent');
    assert.equal(sent.data.declarationText, FINAL_DECLARATION.agent);
    assert.equal(sent.data.type, 'final-declaration');
    const status = runEngineTool('gb_hmrc_status', state, {}).data;
    assert.equal(status.returns.length, 1);
    assert.equal(status.returns[0].amendmentWindowCloses, '2028-01-31');
    assert.equal(status.declarationWords.taxpayer, FINAL_DECLARATION.taxpayer);
    assert.equal(state.auditEvents.find((event) => event.action === 'gb_final_declaration_submitted').metadata.declaredBy, 'agent');
  });
});

test('amendments: only after a return, only inside the window, and a second final calculation is refused', async () => {
  await withEnv({ MYCA_MOCK_MODE: '1', MYCA_PROVIDER_ENV: 'test' }, async () => {
    const state = await connected();
    const early = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-amend' });
    assert.equal(early.error, 'NO_RETURN_TO_AMEND');
    assert.match(enginePreview('trigger_gb_itsa_calculation')(state, { taxYear: '2025-26', calculationType: 'intent-to-amend' }).blockers.join(' '), /final declaration already sent/);
    assert.equal((await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2020-21', calculationType: 'intent-to-amend' })).error, 'AMENDMENT_WINDOW_CLOSED');
    const final = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-finalise' });
    await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: final.data.calculationId, declaration: true });
    assert.equal((await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-finalise' })).error, 'FINAL_DECLARATION_ALREADY_SENT');
    const amend = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-amend' });
    assert.equal(amend.ok, true, JSON.stringify(amend));
    const preview = enginePreview('submit_gb_final_declaration')(state, { taxYear: '2025-26', calculationId: amend.data.calculationId, declaration: true });
    assert.match(preview.summary, /^Confirm the amendment/);
    const confirmed = await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: amend.data.calculationId, declaration: true });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.data.type, 'confirm-amendment');
    assert.equal(confirmed.data.amends, final.data.calculationId);
    assert.match(engineWords('submit_gb_final_declaration')(confirmed), /amended return/);
    assert.ok(state.auditEvents.some((event) => event.action === 'gb_amendment_confirmed'));
  });
});

test('in live, the final calculation waits for the tax year to end', async () => {
  await withEnv({ MYCA_MOCK_MODE: '0', MYCA_PROVIDER_ENV: 'live' }, async () => {
    const state = gbState();
    const out = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2099-01', calculationType: 'intent-to-finalise' });
    assert.equal(out.error, 'BAD_TAX_YEAR');
    const next = `${new Date().getUTCFullYear() + 1}-${String((new Date().getUTCFullYear() + 2) % 100).padStart(2, '0')}`;
    const waiting = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: next, calculationType: 'intent-to-finalise' });
    assert.equal(waiting.error, 'TAX_YEAR_NOT_ENDED');
  });
});

test('the sandbox calculation is shown in full like an SA302, and HMRC errors stop the declaration', async () => {
  const realClient = getChannelClient();
  const calcId = '0d6b2c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c';
  let withErrors = false;
  const detail = () => ({
    metadata: { calculationId: calcId, calculationType: 'intent-to-finalise', calculationTimestamp: '2026-11-14T10:00:00.000Z' },
    calculation: {
      allowancesAndDeductions: { personalAllowance: 12570 },
      incomeSummaryTotals: { totalSelfEmploymentProfit: 42000, totalUKOtherPropertyProfit: 8000, totalEmploymentIncome: 0 },
      taxCalculation: {
        incomeTax: {
          totalIncomeReceivedFromAllSources: 50000, totalAllowancesAndDeductions: 12570, totalTaxableIncome: 37430, incomeTaxCharged: 7486, totalIncomeTaxDue: 7486,
          payPensionsProfit: { incomeReceived: 50000, allowancesAllocated: 12570, taxableIncome: 37430, incomeTaxAmount: 7486, taxBands: [{ name: 'BRT', rate: 20, bandLimit: 37700, apportionedBandLimit: 37700, income: 37430, taxAmount: 7486 }] },
        },
        nics: { class2Nics: { amount: 0 }, class4Nics: { totalAmount: 1745.8 }, totalNic: 1745.8 },
        totalStudentLoansRepaymentAmount: 500,
        totalIncomeTaxAndNicsDue: 9731.8,
      },
    },
    ...(withErrors ? { messages: { errors: [{ id: 'C55001', text: 'A final declaration cannot be made while quarterly updates are missing.' }] } } : {}),
  });
  setChannelClient(new ChannelClient({
    fetchFn: async (url) => {
      const path = new URL(url).pathname;
      const body = path === '/oauth/token' ? { access_token: 'acc', refresh_token: 'ref', expires_in: 14400 }
        : path.endsWith('/trigger/intent-to-finalise') ? { calculationId: calcId }
          : path.endsWith(`/${calcId}`) ? detail()
            : null;
      return { ok: Boolean(body), status: body ? 200 : 404, headers: { get: () => '' }, text: async () => JSON.stringify(body || { code: 'MATCHING_RESOURCE_NOT_FOUND' }) };
    },
  }));
  try {
    await withEnv({ MYCA_MOCK_MODE: '0', MYCA_PROVIDER_ENV: 'test', MYCA_HMRC_CLIENT_ID: 'cid', MYCA_HMRC_CLIENT_SECRET: 'csecret', MYCA_HMRC_REDIRECT_URI: 'https://example.org/hmrc/callback', MYCA_HMRC_TOKEN_KEY: 'z'.repeat(48) }, async () => {
      const state = await connected();
      const calc = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-finalise' });
      assert.equal(calc.ok, true, JSON.stringify(calc));
      const b = calc.data.breakdown;
      assert.deepEqual(b.income, { selfEmployment: 42000, ukProperty: 8000, foreignProperty: null, employment: 0, total: 50000 });
      assert.equal(b.personalAllowance, 12570);
      assert.deepEqual(b.bands, [{ source: 'Pay, pensions and profit', name: 'BRT', rate: 20, income: 37430, tax: 7486 }]);
      assert.equal(b.class4Nics, 1745.8);
      assert.equal(b.totalNics, 1745.8);
      assert.equal(b.studentLoan, 500);
      assert.equal(b.totalDue, 9731.8);
      assert.equal(calc.data.nics, 1745.8);
      assert.equal(calc.data.blockedByErrors, false);
      withErrors = true;
      const bad = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-finalise' });
      assert.equal(bad.data.blockedByErrors, true);
      assert.match(enginePreview('submit_gb_final_declaration')(state, { taxYear: '2025-26', calculationId: calcId, declaration: true }).blockers.join(' '), /errors/);
      const refused = await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: calcId, declaration: true });
      assert.equal(refused.error, 'CALCULATION_HAS_ERRORS');
      assert.equal(refused.errors[0].id, 'C55001');
    });
  } finally {
    setChannelClient(realClient);
  }
});

test('the history lists everything sent to HMRC, newest first, for access requests and record keeping', async () => {
  await withEnv({ MYCA_MOCK_MODE: '1', MYCA_PROVIDER_ENV: 'test' }, async () => {
    const state = await connected();
    assert.deepEqual(runEngineTool('gb_hmrc_history', state, {}).data, { count: 0, submissions: [] });
    assert.equal(runEngineTool('gb_hmrc_history', state, { kind: 'payroll' }).error, 'BAD_KIND');
    const final = await runEngineTool('trigger_gb_itsa_calculation', state, { taxYear: '2025-26', calculationType: 'intent-to-finalise' });
    await runEngineTool('submit_gb_final_declaration', state, { taxYear: '2025-26', calculationId: final.data.calculationId, declaration: true });
    const history = runEngineTool('gb_hmrc_history', state, {}).data;
    assert.equal(history.count, 1);
    assert.equal(history.submissions[0].kind, 'final-declaration');
    assert.equal(history.submissions[0].declarationText, FINAL_DECLARATION.taxpayer);
    assert.equal(runEngineTool('gb_hmrc_history', state, { kind: 'vat' }).data.count, 0);
  });
});

test('typos never turn into a zero: bad amounts and impossible dates are refused with the field named', () => {
  const state = gbState();
  const vat = runEngineTool('gb_vat_return_check', state, { periodKey: '18A1', to: '2026-06-30', sales: [{ net: 'twelve' }] });
  assert.equal(vat.error, 'BAD_AMOUNT');
  assert.equal(vat.problems[0].field, 'sales[0].net');
  assert.equal(runEngineTool('gb_vat_return_check', state, { periodKey: '18A1', to: '2026-02-30', sales: [{ net: 10 }] }).error, 'BAD_PERIOD_END');
  const credit = runEngineTool('gb_vat_return_check', state, { periodKey: '18A1', to: '2026-06-30', sales: [{ net: 1000 }, { net: -200 }] });
  assert.equal(credit.ok, true, 'a credit note is a negative sale');
  assert.equal(credit.data.body.totalValueSalesExVAT, 800);
  assert.equal(runEngineTool('gb_tax_estimate', state, { taxYear: '2025-26', income: { property: { income: -10 } } }).error, 'BAD_AMOUNT');
});

test('a landlord quarter is sorted into HMRC property boxes, and unknown or bad lines hold it back', () => {
  const state = gbState();
  const base = { kind: 'uk-property', taxYear: '2026-27', periodStartDate: '2026-04-06', periodEndDate: '2026-07-05' };
  const good = runEngineTool('gb_itsa_quarter_check', state, { ...base, transactions: [{ category: 'rent', amount: 3000 }, { category: 'rent', amount: '1500.50' }, { category: 'letting-agent', amount: 450 }, { category: 'mortgage-interest', amount: 900 }, { category: 'repairs', amount: -50 }] });
  assert.equal(good.data.ready, true, JSON.stringify(good));
  assert.deepEqual(good.data.body.ukProperty, { income: { periodAmount: 4500.5 }, expenses: { professionalFees: 450, residentialFinancialCost: 900, repairsAndMaintenance: -50 } });
  assert.deepEqual(good.data.totals, { income: 4500.5, expenses: 400, financeCosts: 900, profit: 4100.5 });
  const held = runEngineTool('gb_itsa_quarter_check', state, { ...base, transactions: [{ category: 'rent', amount: -10 }, { category: 'yacht', amount: 5 }, { category: 'rent' }] });
  assert.equal(held.data.ready, false);
  assert.deepEqual(held.data.problems.map((problem) => problem.field), ['transactions', 'transactions[0].amount', 'transactions[2].amount']);
  assert.equal(runEngineTool('gb_itsa_quarter_check', state, { ...base, periodEndDate: '2027-05-01', transactions: [] }).error, 'PERIOD_OUTSIDE_TAX_YEAR');
  assert.equal(runEngineTool('gb_itsa_quarter_check', state, { ...base, income: { periodAmount: 'lots' } }).error, 'BAD_AMOUNT');
  const trade = runEngineTool('gb_itsa_quarter_check', state, { kind: 'self-employment', taxYear: '2026-27', periodStartDate: '2026-04-06', periodEndDate: '2026-07-05', transactions: [{ category: 'sales', amount: 'abc' }] });
  assert.equal(trade.data.ready, false);
  assert.equal(trade.data.problems[0].field, 'transactions[0].amount');
});
