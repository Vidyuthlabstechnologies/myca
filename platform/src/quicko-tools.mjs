import { runSandboxOperation } from './sandbox-adapter.mjs';
import { quickoCatalog } from './sandbox-endpoints.mjs';
import { normalizeActor } from './approvals.mjs';
import { normalizeClientId } from './books.mjs';
import { documentsOf, isSha256 } from './document-store.mjs';

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const CIN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const AADHAAR = /^[0-9]{12}$/;

function ok(data) {
  return { ok: true, data };
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

function actorOf(args) {
  return normalizeActor({ userId: args.actorId || 'ca', role: args.role || '' });
}

async function quicko(state, args, operationId, params) {
  const actor = actorOf(args);
  const out = await runSandboxOperation({
    operationId,
    actorId: actor.userId,
    actor,
    caApprovalId: args.caApprovalId || '',
    params,
    clientId: normalizeClientId(state.activeClientId),
  }, { state });
  return out;
}

function providerOf(out) {
  return out?.data?.provider ?? null;
}

function passOn(out, shape) {
  if (!out.ok) return fail(out.error, out);
  if (out.mock) return ok({ ...out.data, mock: true });
  return ok({ ...shape(providerOf(out), out.data), source: 'Sandbox by Quicko', operationId: out.operationId });
}

function consentOf(args) {
  if (args.consent !== true) return { ok: false, error: 'CONSENT_REQUIRED', hint: 'Ask the person whose details these are, then pass consent true and a reason.' };
  return { ok: true, consent: 'Y', reason: String(args.reason || 'KYC for accounting and tax compliance').slice(0, 200) };
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function form16Summary(data) {
  const partA = data?.['Part A'] || {};
  const partB = data?.['Part B'] || {};
  const salary = partB.details_of_salary_paid || {};
  const gross = salary.gross_salary || {};
  const employee = partB.employee || partA.employee || {};
  const employer = partB.employer || partA.employer || {};
  return {
    assessmentYear: partB.assessment_year || partA.assessment_year || '',
    employer: { name: employer.name || '', tan: employer.tan || '', pan: employer.pan || '' },
    employee: { pan: employee.pan || '', name: [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ') },
    optedOutOfNewRegime: salary.opting_out_of_taxation_us_115bac ?? salary.opting_out_of_taxation_us_115_bac ?? '',
    figuresAsPrinted: {
      salaryUnderSection17_1: num(gross.salary_as_per_provisions_contained_in_section_17_1),
      perquisitesUnderSection17_2: num(gross.value_of_perquisites_us_17_2),
      profitsInLieuUnderSection17_3: num(gross.profits_in_lieu_of_salary_us_17_3),
      salaryFromCurrentEmployer: num(salary.total_amount_of_salary_received_from_current_employer),
      exemptAllowancesSection10: num(salary.allowances_us_10?.total_amount_of_exemption_claimed_us_10),
      deductionsSection16: num(salary.total_amount_of_deductions_us_16),
      standardDeduction: num(salary.deduction_us_16?.standard_deduction_us_16_ia),
      incomeUnderSalaries: num(salary.income_chargeable_under_the_head_salaries),
      otherIncomeReported: num(salary.total_amount_of_other_income_reported_by_employee),
      grossTotalIncome: num(salary.gross_total_income),
      chapterVIADeductions: num(salary.aggregate_deductible_amount_under_chapter_vi_a),
      totalTaxableIncome: num(salary.total_taxable_income),
      taxOnTotalIncome: num(salary.tax_on_total_income),
      rebate87A: num(salary.rebate_us_87_a),
      cess: num(salary.health_and_eduction_cess),
      netTaxPayable: num(salary.net_tax_payable),
    },
    tdsQuarters: (Array.isArray(partA.tds) ? partA.tds : []).length,
  };
}

function form26asSummary(data) {
  const rows = Array.isArray(data?.['Part I']) ? data['Part I'] : [];
  return {
    pan: data?.pan || '',
    name: data?.name || '',
    financialYear: data?.financial_year || '',
    assessmentYear: data?.assessment_year || '',
    deductors: rows.map((row) => ({
      deductor: row.name_of_deductor || '',
      tan: row.tan_of_deductor || '',
      amountPaidOrCredited: num(row.total_amount_paid_credited),
      taxDeducted: num(row.total_tax_deducted),
      tdsDeposited: num(row.total_tds_deposited),
      entries: Array.isArray(row.deduction_wise) ? row.deduction_wise.length : 0,
    })),
    partsPresent: ['Part I', 'Part II', 'Part III', 'Part IV', 'Part V', 'Part VI'].filter((part) => Array.isArray(data?.[part]) && data[part].length),
  };
}

const READ_NOTE = 'Sandbox read the document; MyCA computed nothing. Every figure is as printed. Check it against the page before using it in a return.';

async function readTaxDocument(state, args, operationId, summarise) {
  const sha = String(args.documentSha256 || '').trim().toLowerCase();
  if (!isSha256(sha)) return fail('INVALID_SHA256', { hint: 'Upload the PDF with /api/upload first and pass its documentSha256.' });
  const params = { documentSha256: sha, ...(args.password ? { query: { password: String(args.password) } } : {}) };
  const out = await quicko(state, args, operationId, params);
  return passOn(out, (data) => ({ documentSha256: sha, summary: summarise(data || {}), extracted: data, note: READ_NOTE }));
}

const PNL_OPERATIONS = Object.freeze({
  domestic: 'quicko_it_calculator_tax_pnl_securities_domestic_sync',
  foreign: 'quicko_it_calculator_tax_pnl_securities_foreign_sync',
  crypto: 'quicko_it_calculator_tax_pnl_crypto_sync',
  all: 'quicko_it_calculator_tax_pnl_all_assets_sync',
  real_estate: 'quicko_it_calculator_tax_pnl_real_estate',
  other: 'quicko_it_calculator_tax_pnl_other',
});

function workbookOf(state, args) {
  if (args.workbook && typeof args.workbook === 'object' && !Array.isArray(args.workbook)) return { ok: true, workbook: args.workbook };
  const sha = String(args.documentSha256 || '').trim().toLowerCase();
  if (!isSha256(sha)) return fail('WORKBOOK_REQUIRED', { hint: 'Pass the tradebook as workbook (Sandbox workbook JSON: sheets, blocks, header, rows) or upload it as JSON and pass documentSha256.' });
  const stored = documentsOf(state).readVerified(sha);
  if (!stored.ok) return stored;
  let text = String(stored.content || '');
  const match = /^data:[a-z0-9.+/-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(text.trim());
  if (match) text = Buffer.from(match[1].replace(/\s+/g, ''), 'base64').toString('utf8');
  try {
    const workbook = JSON.parse(text);
    return workbook && typeof workbook === 'object' && !Array.isArray(workbook) ? { ok: true, workbook } : fail('WORKBOOK_NOT_JSON_OBJECT');
  } catch {
    return fail('WORKBOOK_NOT_JSON', { hint: 'Upload the tradebook as Sandbox workbook JSON.' });
  }
}

const REGIME_FIELDS = Object.freeze([
  'basic_salary', 'hra', 'rent_paid', 'other_allowances', 'interest_paid_on_homeloan', 'rent_received', 'property_tax_paid',
  'savings_interest', 'fd_interest', 'dividend_income', 'other_income', 'deductions_80_cce', 'deductions_80_ccd_2', 'deductions_80_ccd_1b',
  'deductions_80_d', 'deductions_80_g', 'deductions_80_gg', 'deductions_80_eea', 'deductions_80_ee', 'deductions_80_e', 'deductions_80_dd',
  'deductions_80_u', 'deductions_80_ddb', 'deductions_80_eeb',
]);

export async function quickoTaxCheck(state, args = {}) {
  const income = args.income && typeof args.income === 'object' ? args.income : {};
  const unknown = Object.keys(income).filter((key) => !REGIME_FIELDS.includes(key));
  if (unknown.length) return fail('UNKNOWN_INCOME_FIELDS', { unknown, allowed: REGIME_FIELDS });
  if (!String(args.financialYear || '').trim()) return fail('FINANCIAL_YEAR_REQUIRED', { hint: 'For example FY 2025-26.' });
  const body = {
    financial_year: String(args.financialYear).trim(),
    ...(args.pan ? { pan: upper(args.pan) } : {}),
    ...(Number.isInteger(args.age) ? { age: args.age } : {}),
    residential_status: String(args.residentialStatus || 'resident'),
    ...(args.city ? { address: { city: String(args.city) } } : {}),
    ...Object.fromEntries(Object.entries(income).map(([key, value]) => [key, Math.round(Number(value) || 0)])),
  };
  const regimes = args.regime === 'old' || args.regime === 'new' ? [args.regime] : ['new', 'old'];
  const results = {};
  for (const regime of regimes) {
    const out = await quicko(state, args, `quicko_calculators_income_tax_${regime}`, { body });
    if (!out.ok) return fail(out.error, { regime, ...out });
    results[regime] = out.mock ? { mock: true } : providerOf(out);
  }
  return ok({
    source: 'Sandbox by Quicko',
    regimes: results,
    note: 'This is Sandbox\'s own calculation, to cross-check prepare_itr. prepare_itr (MyCA\'s engine with dated rules) stays the figure used in the return; where they differ, ask the CA.',
  });
}

export const QUICKO_TOOLS = [
  {
    name: 'quicko_catalog',
    title: 'Quicko API catalogue',
    description: 'Every Sandbox by Quicko API MyCA can call (KYC, PAN, Aadhaar, DigiLocker, bank, MCA, income tax OCR, calculators, reports, ITD portal and ERI filing, TDS, TRACES, GST), each with its operationId, the parameters it needs and whether it needs a CA approval. Filter by family (gst, tds, kyc, bank, income_tax_ocr, income_tax_calculator, income_tax_report, income_tax_compliance) or search words. Read-only; calls nothing.',
    args: ['family', 'search', 'operationId', 'limit'],
    run: (_state, args = {}) => ok(quickoCatalog(args)),
  },
  {
    name: 'read_form16',
    title: 'Read Form 16 with Quicko',
    description: 'Send an uploaded Form 16 PDF (from /api/upload) to Sandbox\'s Form 16 reader and return the employer, employee PAN, salary under section 17, exemptions, section 16 deductions, chapter VI-A total, taxable income and tax as printed. MyCA computes nothing from it. Pass password if the PDF is locked.',
    args: ['documentSha256', 'password', 'actorId'],
    run: (state, args = {}) => readTaxDocument(state, args, 'quicko_it_ocr_form_16_pdf', form16Summary),
  },
  {
    name: 'read_form26as',
    title: 'Read Form 26AS with Quicko',
    description: 'Send an uploaded Form 26AS PDF to Sandbox\'s 26AS reader and return each deductor with TAN, amount paid or credited, tax deducted and TDS deposited, as printed, for the TDS credit check before an ITR. MyCA computes nothing from it.',
    args: ['documentSha256', 'password', 'actorId'],
    run: (state, args = {}) => readTaxDocument(state, args, 'quicko_it_ocr_form_26as_pdf', form26asSummary),
  },
  {
    name: 'capital_gains_pnl',
    title: 'Capital gains tax P&L (Quicko)',
    description: 'Sandbox\'s capital gains calculator on a tradebook: assetClass domestic (equity, mutual funds, derivatives), foreign, crypto, real_estate, other or all. Pass the tradebook as Sandbox workbook JSON (workbook) or an uploaded JSON file (documentSha256), with financialYear and optional input and output formats. Returns Sandbox\'s short and long-term split as it worked it out.',
    args: ['assetClass', 'financialYear', 'workbook', 'documentSha256', 'input', 'output', 'actorId'],
    run: async (state, args = {}) => {
      const operationId = PNL_OPERATIONS[String(args.assetClass || '')];
      if (!operationId) return fail('ASSET_CLASS_REQUIRED', { allowed: Object.keys(PNL_OPERATIONS) });
      const book = workbookOf(state, args);
      if (!book.ok) return book;
      const query = { ...(args.financialYear ? { financial_year: String(args.financialYear) } : {}), ...(args.input ? { input: String(args.input) } : {}), ...(args.output ? { output: String(args.output) } : {}) };
      const out = await quicko(state, args, operationId, { query, body: book.workbook });
      return passOn(out, (data) => ({ assetClass: args.assetClass, financialYear: args.financialYear || '', taxPnl: data, note: 'Sandbox worked these gains out from the trades given. Check the holding periods and cost before putting them in Schedule CG.' }));
    },
  },
  {
    name: 'quicko_tax_check',
    title: 'Cross-check income tax with Quicko',
    description: 'Run Sandbox\'s old and new regime income-tax calculators on the same income and deductions, to cross-check prepare_itr. income takes Sandbox\'s field names (basic_salary, hra, rent_paid, fd_interest, deductions_80_cce, deductions_80_d and so on) in rupees.',
    args: ['financialYear', 'regime', 'pan', 'age', 'residentialStatus', 'city', 'income', 'actorId'],
    run: (state, args = {}) => quickoTaxCheck(state, args),
  },
  {
    name: 'verify_pan',
    title: 'Verify PAN',
    description: 'Check a PAN with the Income Tax Department through Sandbox: whether it is valid and whether the name and date of birth match. Needs the person\'s consent (consent true).',
    args: ['pan', 'name', 'dateOfBirth', 'consent', 'reason', 'actorId'],
    run: async (state, args = {}) => {
      const pan = upper(args.pan);
      if (!PAN.test(pan)) return fail('INVALID_PAN');
      const consent = consentOf(args);
      if (!consent.ok) return consent;
      const out = await quicko(state, args, 'quicko_kyc_pan_verify', { body: { pan, name_as_per_pan: String(args.name || ''), date_of_birth: String(args.dateOfBirth || ''), consent: consent.consent, reason: consent.reason } });
      return passOn(out, (data) => ({ pan, result: data }));
    },
  },
  {
    name: 'pan_aadhaar_status',
    title: 'PAN-Aadhaar link status',
    description: 'Whether a PAN is linked to an Aadhaar number, from the Income Tax Department through Sandbox. Needs consent (consent true). An unlinked PAN is inoperative, which doubles TDS under section 206AA.',
    args: ['pan', 'aadhaarNumber', 'consent', 'reason', 'actorId'],
    run: async (state, args = {}) => {
      const pan = upper(args.pan);
      const aadhaar = String(args.aadhaarNumber || '').replace(/\s+/g, '');
      if (!PAN.test(pan)) return fail('INVALID_PAN');
      if (!AADHAAR.test(aadhaar)) return fail('INVALID_AADHAAR');
      const consent = consentOf(args);
      if (!consent.ok) return consent;
      const out = await quicko(state, args, 'quicko_kyc_pan_aadhaar_status', { body: { pan, aadhaar_number: aadhaar, consent: consent.consent, reason: consent.reason } });
      return passOn(out, (data) => ({ pan, result: data }));
    },
  },
  {
    name: 'check_206ab',
    title: 'Section 206AB check',
    description: 'Whether a payee is a specified person under sections 206AB and 206CCA (a non-filer, so TDS or TCS is due at the higher rate), from the Income Tax Department through Sandbox. Run it before deducting TDS on a new vendor. Needs consent (consent true).',
    args: ['pan', 'consent', 'reason', 'actorId'],
    run: async (state, args = {}) => {
      const pan = upper(args.pan);
      if (!PAN.test(pan)) return fail('INVALID_PAN');
      const consent = consentOf(args);
      if (!consent.ok) return consent;
      const out = await quicko(state, args, 'quicko_tds_compliance_206ab_check', { body: { pan, consent: consent.consent, reason: consent.reason } });
      return passOn(out, (data) => ({
        pan,
        name: data?.name || '',
        financialYear: data?.financial_year || '',
        specifiedPerson: String(data?.['specified_person_us_206ab_&_206cca'] || ''),
        panStatus: data?.pan_status || '',
        result: data,
      }));
    },
  },
  {
    name: 'search_tan',
    title: 'Search TAN',
    description: 'Look up a TAN (deductor name and details) on the Income Tax portal through Sandbox. Needs consent (consent true). Read-only.',
    args: ['tan', 'consent', 'reason', 'actorId'],
    run: async (state, args = {}) => {
      const tan = upper(args.tan);
      if (!TAN.test(tan)) return fail('INVALID_TAN');
      const consent = consentOf(args);
      if (!consent.ok) return consent;
      const out = await quicko(state, args, 'quicko_itd_portal_public_tans_tan', { path: { tan }, query: { consent: consent.consent, reason: consent.reason } });
      return passOn(out, (data) => ({ tan, result: data }));
    },
  },
  {
    name: 'lookup_ifsc',
    title: 'Look up IFSC',
    description: 'The bank, branch and address for an IFSC code, through Sandbox. Read-only.',
    args: ['ifsc', 'actorId'],
    run: async (state, args = {}) => {
      const ifsc = upper(args.ifsc);
      if (!IFSC.test(ifsc)) return fail('INVALID_IFSC');
      const out = await quicko(state, args, 'quicko_bank_ifsc', { path: { ifsc } });
      return passOn(out, (data) => ({ ifsc, result: data }));
    },
  },
  {
    name: 'verify_bank_account',
    title: 'Verify bank account',
    description: 'Check that a bank account exists and get the holder name, through Sandbox, without sending money (penny-less). Use it before paying a new vendor. Read-only.',
    args: ['ifsc', 'accountNumber', 'name', 'mobile', 'actorId'],
    run: async (state, args = {}) => {
      const ifsc = upper(args.ifsc);
      const account = String(args.accountNumber || '').replace(/\s+/g, '');
      if (!IFSC.test(ifsc)) return fail('INVALID_IFSC');
      if (!/^[0-9A-Za-z]{6,20}$/.test(account)) return fail('INVALID_ACCOUNT_NUMBER');
      const query = { ...(args.name ? { name: String(args.name) } : {}), ...(args.mobile ? { mobile: String(args.mobile) } : {}) };
      const out = await quicko(state, args, 'quicko_bank_ifsc_accounts_account_number_penniless_verify', { path: { ifsc, account_number: account }, query });
      return passOn(out, (data) => ({ ifsc, accountEndsWith: account.slice(-4), result: data }));
    },
  },
  {
    name: 'mca_company',
    title: 'Company master data (MCA)',
    description: 'A company\'s or LLP\'s master data from the MCA (name, status, incorporation date, directors, address) by CIN, through Sandbox. Read-only.',
    args: ['cin', 'actorId'],
    run: async (state, args = {}) => {
      const cin = upper(args.cin);
      if (!CIN.test(cin)) return fail('INVALID_CIN');
      const out = await quicko(state, args, 'quicko_kyc_mca_company_master_data', { body: { cin } });
      return passOn(out, (data) => ({ cin, result: data }));
    },
  },
  {
    name: 'gstins_for_pan',
    title: 'GSTINs for a PAN',
    description: 'Every GSTIN registered against a PAN in one state (two-digit GST state code, for example 29 for Karnataka), from the GST portal through Sandbox. Read-only.',
    args: ['pan', 'stateCode', 'actorId'],
    run: async (state, args = {}) => {
      const pan = upper(args.pan);
      if (!PAN.test(pan)) return fail('INVALID_PAN');
      const stateCode = String(args.stateCode || '').trim();
      if (!/^[0-9]{2}$/.test(stateCode)) return fail('STATE_CODE_REQUIRED', { hint: 'Two digits, for example 29.' });
      const out = await quicko(state, args, 'quicko_gst_compliance_public_pan_search', { body: { pan }, query: { state_code: stateCode } });
      return passOn(out, (data) => ({ pan, result: data }));
    },
  },
];
