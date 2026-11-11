import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-taxassist-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { incomeTax } from '../src/sprint-load.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { ACTION_CLASSES } from '../src/action-gate.mjs';
import { findTaxGuidance, formatFigure, frontmatterProblems, loadTaxModule, loadTaxModules, parseFrontmatter, taxModuleCatalog, validateTaxModules } from '../src/tax-modules.mjs';
import { askTax, askTaxWords, countryGuidanceSections, countryModuleCatalog, booksGstTurnover, presumptiveIncome, reviewIncomeTaxReturn, taxPlan, taxPrompt, ungroundedFigures } from '../src/tax-assistant.mjs';

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

const TODAY = '2026-11-09';
const codes = (result) => result.data.findings.map((item) => item.code);

test('every tax module is a valid Agent Skill: name matches its folder, description within limits, metadata strings, sections cited', () => {
  const report = validateTaxModules();
  assert.deepEqual(report.problems, []);
  assert.equal(report.ok, true);
  const catalog = taxModuleCatalog();
  assert.deepEqual(catalog.map((module) => module.name), ['india-gst-input-tax-credit', 'india-gst-returns', 'india-income-tax-individuals', 'india-presumptive-income', 'india-tds-business-payments', 'us-federal-income-tax-individuals']);
  const toolNames = new Set(TOOLS.map((tool) => tool.name));
  for (const module of catalog) {
    assert.ok(module.sections.length >= 5, module.name);
    assert.equal(module.jurisdiction, module.name.startsWith('us-') ? 'US' : 'IN');
    for (const tool of module.tools) assert.ok(toolNames.has(tool), `${module.name} names a tool MyCA does not have: ${tool}`);
  }
});

test('the frontmatter checks follow the Agent Skills specification', () => {
  assert.deepEqual(frontmatterProblems({ name: 'gst-returns', description: 'x' }, 'gst-returns'), []);
  assert.ok(frontmatterProblems({ name: 'GST', description: 'x' }, 'GST').includes('NAME_INVALID'));
  assert.ok(frontmatterProblems({ name: 'gst--returns', description: 'x' }).includes('NAME_INVALID'));
  assert.ok(frontmatterProblems({ name: '-gst', description: 'x' }).includes('NAME_INVALID'));
  assert.ok(frontmatterProblems({ name: 'a'.repeat(65), description: 'x' }).includes('NAME_TOO_LONG'));
  assert.ok(frontmatterProblems({ name: 'gst', description: 'x' }, 'other').includes('NAME_NOT_FOLDER'));
  assert.ok(frontmatterProblems({ name: 'gst', description: 'x'.repeat(1025) }).includes('DESCRIPTION_TOO_LONG'));
  assert.ok(frontmatterProblems({ name: 'gst', description: '' }).includes('DESCRIPTION_REQUIRED'));
  assert.ok(frontmatterProblems({ name: 'gst', description: 'x', version: '1' }).includes('FIELD_UNKNOWN:version'));
  const parsed = parseFrontmatter('---\nname: gst\ndescription: "GST help"\nmetadata:\n  domain: "gst"\n  version: "1.0"\n---\n# body\n');
  assert.deepEqual(parsed.fields, { name: 'gst', description: 'GST help', metadata: { domain: 'gst', version: '1.0' } });
  assert.equal(parseFrontmatter('no frontmatter').ok, false);
});

test('a broken module is refused with the reason, and does not reach the catalog', () => {
  const root = mkdtempSync(join(tmpdir(), 'myca-taxmod-'));
  mkdirSync(join(root, 'bad-module'));
  writeFileSync(join(root, 'bad-module', 'SKILL.md'), '---\nname: bad-module\ndescription: Broken on purpose.\n---\n# Bad\n\n## one: A topic\nKeywords: gst\nRules: gst.no-such-rule\n\nRate {{gst.interest.rate#percentPerAnnum}}.\n');
  const loaded = loadTaxModules(root);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.modules.length, 0);
  assert.ok(loaded.problems.some((problem) => problem.includes('SECTION_SOURCE_MISSING:one')));
  assert.ok(loaded.problems.some((problem) => problem.includes('RULE_UNKNOWN:gst.no-such-rule')));
  assert.ok(loaded.problems.some((problem) => problem.includes('RULE_NOT_DECLARED:gst.interest.rate')));
});

test('every figure in every module resolves from the dated rules today, and a date before the rules begin says so instead of guessing', () => {
  for (const module of taxModuleCatalog()) {
    const loaded = loadTaxModule(module.name, TODAY);
    for (const section of loaded.sections) {
      assert.deepEqual(section.unresolved, [], section.ref);
      assert.doesNotMatch(section.text, /\{\{|\}\}/, section.ref);
    }
  }
  const slabs = loadTaxModule('india-income-tax-individuals', TODAY).sections.find((section) => section.id === 'slabs');
  assert.match(slabs.text, /up to ₹4,00,000 nil; ₹4,00,000 to ₹8,00,000 5%/);
  assert.ok(slabs.rules.every((rule) => rule.act === 'IT-2025'));
  const before = loadTaxModule('india-income-tax-individuals', '2024-06-01').sections.find((section) => section.id === 'slabs');
  assert.match(before.text, /₹3,00,000 to ₹7,00,000 5%/);
  const early = loadTaxModule('india-income-tax-individuals', '2025-06-01').sections.find((section) => section.id === 'return-due-dates');
  assert.match(early.text, /\[figure not in MyCA rules for that date\]/);
  assert.ok(early.unresolved.length > 0);
  const tds = loadTaxModule('india-tds-business-payments', TODAY).sections.find((section) => section.id === 'deposit-and-statement');
  assert.match(tds.text, /by the 7th of the month after the month \(30 April for the month of March\)/);
  const late = loadTaxModule('india-gst-returns', TODAY).sections.find((section) => section.id === 'late-fee');
  assert.match(late.text, /₹50 a day .* ₹20 a day for a nil return/);
});

test('figures are formatted by their unit, never as bare numbers that could be misread', () => {
  assert.equal(formatFigure(15000000, 'maxPaise'), '₹1,50,000');
  assert.equal(formatFigure(1000, 'basisPoints'), '10%');
  assert.equal(formatFigure(18, 'percentPerAnnum'), '18%');
  assert.equal(formatFigure({ month: 9, day: 30 }), '30 September');
  assert.equal(formatFigure(10000000, '', 'paise'), '₹1,00,000');
  assert.equal(formatFigure({ nested: { deeper: 1 } }), null);
});

test('questions find the topic that answers them, and an off-topic question finds nothing', () => {
  const top = (question) => findTaxGuidance(question, { onDate: TODAY })[0]?.ref;
  assert.equal(top('When is GSTR-3B due for quarterly filers?'), 'india-gst-returns/gstr3b-due');
  assert.equal(top('What TDS rate on payment to a CA for audit fees?'), 'india-tds-business-payments/tds-194j');
  assert.equal(top('how much tds on rent of office'), 'india-tds-business-payments/tds-194i');
  assert.equal(top('supplier not paid for 200 days, what about my ITC'), 'india-gst-input-tax-credit/rule37-unpaid-supplier');
  assert.equal(top('last date to claim ITC for last year'), 'india-gst-input-tax-credit/itc-time-limit');
  assert.equal(top('my customer deducted TDS how do I claim it'), 'india-tds-business-payments/customer-tds-credit');
  assert.equal(top('turnover in ITR does not match GST'), 'india-presumptive-income/gst-turnover-match');
  assert.equal(top('do I need audit if I show 4% profit under 44AD'), 'india-presumptive-income/lower-profit');
  assert.ok(findTaxGuidance('can I claim ITC on a car for my director', { onDate: TODAY }).some((hit) => hit.ref === 'india-gst-input-tax-credit/blocked-credits'));
  assert.deepEqual(findTaxGuidance('what is the weather today', { onDate: TODAY }), []);
});

test('the engine agrees with the independently derived figures in india-tax-guru (MIT) for FY 2025-26', () => {
  const cases = [
    ['old', 'below-60', 600000, 23400],
    ['old', '60-to-79', 600000, 20800],
    ['old', '80-plus', 600000, 10400],
    ['new', 'below-60', 1275000, 0],
    ['new', 'below-60', 1285000, 10400],
    ['old', 'below-60', 560000, 15080],
    ['old', 'below-60', 550000, 0],
    ['new', 'below-60', 5100000, 1149200],
    ['old', 'below-60', 5200000, 1521000],
    ['new', 'below-60', 5200000, 1253200],
    ['old', 'below-60', 1285000, 190320],
  ];
  for (const [regime, ageBand, salary, tax] of cases) {
    const computed = incomeTax.computeIncomeTax({ fy: '2025-26', regime, ageBand, salaryPaise: salary * 100, residentIndividual: true });
    assert.equal(computed.taxPayablePaise, tax * 100, `${regime} ${ageBand} salary ${salary}`);
  }
  const ages = ['below-60', '60-to-79', '80-plus'].map((ageBand) => incomeTax.computeIncomeTax({ fy: '2025-26', regime: 'new', ageBand, salaryPaise: 150000000, residentIndividual: true }).taxPayablePaise);
  assert.equal(new Set(ages).size, 1);
});

test('presumptive income splits digital and other receipts, uses the low-cash limit only when cash receipts are given, and refuses above the limit', () => {
  const split = presumptiveIncome('2025-26', { turnover: 10000000, digitalReceipts: 8000000 });
  assert.equal(split.section, '44AD');
  assert.equal(split.income, 640000, '6% of 80 lakh plus 8% of 20 lakh');
  const big = presumptiveIncome('2025-26', { turnover: 25000000 });
  assert.equal(big.eligible, false);
  assert.match(big.notes[0], /Cash receipts were not given/);
  const lowCash = presumptiveIncome('2025-26', { turnover: 25000000, digitalReceipts: 24000000, cashReceipts: 1000000 });
  assert.equal(lowCash.eligible, true);
  assert.equal(lowCash.cap, 30000000);
  const profession = presumptiveIncome('2026-27', { turnover: 4000000, profession: true });
  assert.equal(profession.section, '44ADA');
  assert.equal(profession.income, 2000000);
  assert.equal(profession.citation.act, 'IT-2025');
});

test('tax plan compares both regimes, finds the break-even deductions, and warns about the 87A edge', () => {
  const state = createState();
  const salaried = taxPlan(state, { fy: '2025-26', salary: 1500000, section80C: 150000, health80DSelf: 25000 });
  assert.equal(salaried.ok, true);
  assert.equal(salaried.data.recommended, 'new');
  assert.equal(salaried.data.regimes.new.taxPayable, 97500);
  assert.equal(salaried.data.regimes.old.taxPayable, 202800);
  assert.equal(salaried.data.saving, 105300);
  const even = salaried.data.ideas.find((idea) => idea.code === 'OLD_REGIME_BREAK_EVEN');
  assert.ok(even && even.neededDeductions > 0 && even.reachable === false, JSON.stringify(salaried.data.ideas));
  const check = incomeTax.computeIncomeTax({ fy: '2025-26', regime: 'old', salaryPaise: (1500000 - even.neededDeductions) * 100, residentIndividual: true, claims: { section80CPaise: 15000000, healthInsuranceSelfAndFamilyPaise: 2500000 } });
  assert.ok(check.taxPayablePaise <= 9750000);
  const edge = taxPlan(state, { fy: '2025-26', salary: 1285000 });
  assert.ok(edge.data.ideas.some((idea) => idea.code === 'REBATE_EDGE'));
  assert.ok(edge.data.unattested.length > 0);
  assert.equal(taxPlan(state, { fy: '2025-26' }).error, 'INCOME_REQUIRED');
  assert.equal(taxPlan(state, { fy: '2025' }).error, 'FY_INVALID');
});

test('tax plan for a small business compares presumptive income with actual profit and asks for digital receipts', () => {
  const plan = taxPlan(createState(), { fy: '2025-26', turnover: 4000000, actualProfit: 200000 });
  assert.equal(plan.data.presumptive.income, 320000);
  assert.equal(plan.data.income.business, 320000);
  assert.match(plan.data.regimeRule, /Form 10-IEA/);
  assert.ok(plan.data.ideas.some((idea) => idea.code === 'PRESUMPTIVE_ABOVE_ACTUAL'));
  assert.ok(plan.data.ideas.some((idea) => idea.code === 'DIGITAL_RECEIPTS'));
});

test('review finds the errors and the money left on the table in a prepared return', () => {
  const state = createState();
  const review = reviewIncomeTaxReturn(state, { fy: '2025-26', regime: 'new', salary: 1285000, section80C: 150000, claimedStandardDeduction: 50000, claimedRebate: 0, claimedTaxPayable: 63960 });
  assert.equal(review.ok, true);
  assert.equal(review.data.asFiled.taxPayable, 10400);
  assert.deepEqual(codes(review).sort(), ['DEDUCTIONS_IN_NEW_REGIME', 'REBATE_87A_MISSED', 'STANDARD_DEDUCTION', 'TAX_PAYABLE'].sort());
  const missed = review.data.findings.find((item) => item.code === 'REBATE_87A_MISSED');
  assert.equal(missed.impact, 51500);
  assert.equal(missed.source.ruleId, 'income-tax.new-regime.rebate');
  assert.equal(review.data.findings[0].severity, 'error');
  const old = reviewIncomeTaxReturn(state, { fy: '2025-26', regime: 'old', salary: 900000, section80C: 200000 });
  assert.ok(codes(old).includes('DEDUCTION_80C_OVER_CAP'));
  const cheaper = old.data.findings.find((item) => item.code === 'OTHER_REGIME_CHEAPER');
  assert.equal(cheaper.impact, 54600);
  const clean = reviewIncomeTaxReturn(state, { fy: '2025-26', regime: 'new', salary: 1500000, claimedStandardDeduction: 75000, claimedTotalIncome: 1425000, claimedTaxPayable: 97500 });
  assert.deepEqual(codes(clean), []);
  assert.equal(clean.data.clean, true);
  assert.equal(reviewIncomeTaxReturn(state, { fy: '2025-26', salary: 100 }).error, 'REGIME_REQUIRED');
});

test('review checks TDS against Form 26AS and the turnover against the year\'s GST sales in the books', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Rao', gstin: '27AABCU9603R1ZN', state: '27', entityType: 'proprietorship' };
  for (const month of ['04', '07', '10']) {
    const made = await runTool(state, 'create_invoice', { partyName: 'Retail Mart', lines: [{ description: 'Cloth', qty: 1, rate: 1000000, gstRate: 5 }], date: `2025-${month}-10` });
    assert.equal(made.ok, true, JSON.stringify(made));
  }
  const books = booksGstTurnover(state, '2025-26');
  assert.equal(books.months, 3);
  assert.equal(books.taxablePaise, 300000000);
  assert.equal(books.taxPaise, 15000000);
  state.tdsCreditStatements = [{ date: '2025-10-15', taxDeducted: 30000, section: '194C', tan: 'MUMR12345A', name: 'Retail Mart' }];
  const inclusive = reviewIncomeTaxReturn(state, { fy: '2025-26', regime: 'new', presumptive: true, turnover: 3150000, digitalReceipts: 3150000, claimedTds: 10000 });
  assert.ok(codes(inclusive).includes('GST_INCLUSIVE_TURNOVER'), JSON.stringify(codes(inclusive)));
  const overstated = inclusive.data.findings.find((item) => item.code === 'GST_INCLUSIVE_TURNOVER');
  assert.equal(overstated.impact, 12000, '8% of the 1,50,000 GST counted as turnover');
  const tds = inclusive.data.findings.find((item) => item.code === 'TDS_CREDIT_UNCLAIMED');
  assert.equal(tds.impact, 20000);
  const short = reviewIncomeTaxReturn(state, { fy: '2025-26', regime: 'new', turnover: 2500000, businessIncome: 150000, claimedTds: 40000 });
  assert.ok(codes(short).includes('TURNOVER_BELOW_GST'));
  assert.ok(codes(short).includes('TDS_CLAIM_ABOVE_26AS'));
  const matched = reviewIncomeTaxReturn(state, { fy: '2025-26', regime: 'new', presumptive: true, turnover: 3000000, businessIncome: 100000 });
  assert.ok(codes(matched).includes('GST_TURNOVER_MATCHED'));
  assert.ok(codes(matched).includes('BELOW_PRESUMPTIVE_PROFIT'));
});

test('ask_tax answers from the modules through the gate, shows the guidance itself when the model is off, and refuses a model figure that is not in the rules', async () => {
  const state = createState();
  assert.equal(ACTION_CLASSES.tax_answer.actionClass, 'read');
  const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'ask_tax', { question: 'Can I take GST credit on staff lunch?', asOf: TODAY }));
  assert.equal(dry.ok, true);
  assert.equal(dry.answered, false);
  assert.equal(dry.blocked, 'LIVE_CALLS_DISABLED');
  assert.ok(dry.sections.some((section) => section.ref === 'india-gst-input-tax-credit/blocked-credits'));
  assert.match(dry.answer, /food and beverages/);
  const mock = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'tax question: when is GSTR-1 due for a monthly filer?'));
  assert.match(mock.reply, /^Simulated: /, mock.reply);
  assert.match(mock.reply, /the 11th of the month after the month/);
  assert.match(mock.reply, /\[india-gst-returns\/gstr1-due\]/);
  const none = await runTool(state, 'ask_tax', { question: 'what is the weather today' });
  assert.equal(none.sections.length, 0);
  const noneWords = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'tax question: what is the weather today'));
  assert.match(noneWords.reply, /None of MyCA's tax modules covers that yet/);
  const sections = findTaxGuidance('TDS on rent', { onDate: TODAY });
  const prompt = taxPrompt('TDS on rent', sections, TODAY);
  assert.match(prompt.systemPrompt, /Never state an amount, rate, date, limit or section number that is not in the guidance/);
  assert.match(prompt.prompt, /\[india-tds-business-payments\/tds-194i\]/);
  assert.deepEqual(ungroundedFigures('TDS on office rent is 10% above ₹50,000 [india-tds-business-payments/tds-194i].', prompt.context), []);
  assert.deepEqual(ungroundedFigures('TDS on office rent is 12% above ₹2,40,000.', prompt.context), ['12', '240000']);
});

test('the tax tools are read-only, declared for chat, and open to the Android app', async () => {
  for (const name of ['ask_tax', 'tax_modules', 'tax_plan', 'review_income_tax']) {
    assert.ok(TOOLS.some((tool) => tool.name === name), name);
    assert.ok(REMOTE_QUERY_TOOLS.has(name), name);
  }
  const listed = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(createState(), 'tax modules'));
  assert.match(listed.reply, /india-gst-input-tax-credit: 7 topics/);
  const shown = await runTool(createState(), 'tax_modules', { module: 'india-presumptive-income', asOf: TODAY });
  assert.equal(shown.ok, true);
  assert.equal(shown.data.sections.length, 5);
  assert.equal((await runTool(createState(), 'tax_modules', { module: 'nope' })).error, 'TAX_MODULE_UNKNOWN');
  const plan = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(createState(), 'tax_plan', { fy: '2025-26', salary: 1500000 }));
  assert.equal(plan.ok, true);
});

test('asking with an old date uses that year\'s rules', async () => {
  const result = await askTax(createState(), { question: 'income tax slab rates', asOf: '2024-06-01' });
  const slabs = result.sections.find((section) => section.id === 'slabs');
  assert.ok(slabs);
  assert.match(slabs.text, /₹3,00,000 to ₹7,00,000 5%/);
});

test('a country without tax modules is answered from its own research notes, never from India\'s', () => {
  const sections = countryGuidanceSections('MY', 'what is the service tax rate on rental or leasing?');
  assert.ok(sections.length > 0);
  assert.ok(sections.every((section) => section.ref.startsWith('my-knowledge/') && section.kind === 'country-knowledge'));
  assert.match(sections.map((section) => section.text).join('\n'), /rental or leasing/);
  assert.ok(sections.every((section) => /^https:\/\//.test(section.source)));
  assert.deepEqual(countryGuidanceSections('MY', 'which ready-made libraries does MyCA use and what are the open questions?').filter((section) => /ready-made|open-questions|summary/.test(section.ref)), [], 'build notes are not shown as tax guidance');
  assert.deepEqual(countryGuidanceSections('MY', 'weather'), []);

  const built = taxPrompt('when is Form BE due?', sections, TODAY, 'MY');
  assert.match(built.systemPrompt, /tax agents in Malaysia/);
  assert.match(built.systemPrompt, /never answer from another country's tax law/);
  assert.doesNotMatch(built.systemPrompt, /India|\bCA\b|CBDT/);
  assert.match(built.systemPrompt, /confirm with your tax agent before you file/);

  const words = askTaxWords({ sections, answered: false, answer: 'guidance', jurisdiction: 'MY', unattested: ['my-knowledge'] });
  assert.match(words, /research notes and are not yet signed off by a tax agent/);
  assert.doesNotMatch(words, /your CA\b/);
  const none = askTaxWords({ sections: [], jurisdiction: 'MY', modules: countryModuleCatalog('MY') });
  assert.match(none, /They cover: my-knowledge\. Ask your tax agent/);
  assert.equal(countryModuleCatalog('MY')[0].reviewStatus, 'not yet signed off');
});
