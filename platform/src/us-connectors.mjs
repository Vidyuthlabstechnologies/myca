import { createHash, randomBytes } from 'node:crypto';
import { performExternalAction } from './action-gate.mjs';
import { loadChannelConfig, saveChannelConfig, publicChannelConfig, CONNECTOR_CHANNELS } from './channel-connectors.mjs';
import { csvRows } from './text-safe.mjs';
import { localToday } from './dates.mjs';
import { setSalesTaxRate } from './us-sales.mjs';

export const PLAID_HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' };
export const TAXJAR_HOSTS = { sandbox: 'https://api.sandbox.taxjar.com', production: 'https://api.taxjar.com' };
export const GUSTO_HOSTS = { demo: 'https://api.gusto-demo.com', production: 'https://api.gusto.com' };
export const GUSTO_REDIRECT_PATH = '/api/oauth/gusto/callback';
const PLAID_SANDBOX_INSTITUTION = 'ins_109508';
export const PINWHEEL_CENTS = 100;
const PINWHEEL_FORM_KINDS = { 'W-2': 'W-2', 'W-2C': 'W-2', '1099-NEC': '1099-NEC', '1099-MISC': '1099-MISC' };

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function plaidTransactionsToCsv(transactions) {
  const rows = [['Date', 'Description', 'Amount', 'Type', 'Ref No']];
  for (const t of transactions || []) {
    if (!t || t.pending) continue;
    const amount = round2(t.amount);
    rows.push([String(t.date || ''), String(t.merchant_name || t.name || '').trim(), Math.abs(amount).toFixed(2), amount >= 0 ? 'debit' : 'credit', String(t.transaction_id || '')]);
  }
  return csvRows(rows);
}

export function gustoPayrollsToCsv(payrolls) {
  const rows = [['Check Date', 'Period Start', 'Period End', 'Gross Pay', 'Net Pay', 'Employee Taxes', 'Employer Taxes', 'Reimbursements', 'Payroll Id']];
  for (const p of payrolls || []) {
    const t = p.totals || {};
    rows.push([String(p.check_date || ''), String(p.pay_period?.start_date || ''), String(p.pay_period?.end_date || ''), round2(t.gross_pay).toFixed(2), round2(t.net_pay).toFixed(2), round2(t.employee_taxes).toFixed(2), round2(t.employer_taxes).toFixed(2), round2(t.reimbursements).toFixed(2), String(p.payroll_uuid || p.uuid || '')]);
  }
  return csvRows(rows);
}

export function mockUsReport(channel, kind, from, to) {
  if (channel === 'plaid') return plaidTransactionsToCsv([{ date: from, name: 'ACH DEPOSIT CAFE LUNA', amount: -540, transaction_id: `mock-plaid-${from}-1` }, { date: to, name: 'HEB GROCERY', amount: 86.4, transaction_id: `mock-plaid-${to}-2` }]);
  if (channel === 'gusto') return gustoPayrollsToCsv([{ payroll_uuid: `mock-gusto-${to}`, check_date: to, pay_period: { start_date: from, end_date: to }, totals: { gross_pay: 8200, net_pay: 6410.5, employee_taxes: 1789.5, employer_taxes: 627.3, reimbursements: 0 } }]);
  return '';
}

function store(channel, options = {}) {
  return { config: options.config === undefined ? loadChannelConfig(channel) : options.config, save: options.save || ((patch) => saveChannelConfig(channel, patch)) };
}

export async function plaidLinkToken(state, args = {}, actor, options = {}) {
  const { config } = store('plaid', options);
  if (!config || !config.clientId || !config.secret) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'plaid', hint: 'Save the Plaid client id and secret first.' });
  const out = await performExternalAction(state, {
    actionId: 'plaid_link',
    clientId: String(state.activeClientId || 'SELF'),
    params: { op: 'link_token', environment: config.environment || 'sandbox', userId: String(args.userId || 'owner') },
    actor: actor || { userId: 'owner' },
    metadata: { op: 'link_token' },
    fixture: () => ({ ok: true, mock: true, data: { link_token: 'link-sandbox-mock-token', expiration: '' } }),
  }, async (transports) => transports.channel.plaid({ config, op: 'link_token', params: { userId: String(args.userId || 'owner') } }));
  if (!out.ok) return out;
  return { ok: true, data: { linkToken: out.data.link_token, expiration: out.data.expiration || '', environment: config.environment || 'sandbox', mock: Boolean(out.mock) } };
}

export async function plaidExchange(state, args = {}, actor, options = {}) {
  const { config, save } = store('plaid', options);
  if (!config || !config.clientId || !config.secret) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'plaid', hint: 'Save the Plaid client id and secret first.' });
  const publicToken = String(args.publicToken || '').trim();
  if (!/^public-[a-z]+-[A-Za-z0-9-]{8,}$/.test(publicToken)) return fail('BAD_PUBLIC_TOKEN', { hint: 'The public token comes from Plaid Link when the owner finishes choosing the bank.' });
  const out = await performExternalAction(state, {
    actionId: 'plaid_link',
    clientId: String(state.activeClientId || 'SELF'),
    params: { op: 'exchange', environment: config.environment || 'sandbox', tokenHash: createHash('sha256').update(publicToken).digest('hex').slice(0, 16) },
    actor: actor || { userId: 'owner' },
    metadata: { op: 'exchange' },
    fixture: () => ({ ok: true, mock: true, data: { access_token: 'access-mock-exchange', item_id: 'mock-item-exchange' } }),
  }, async (transports) => transports.channel.plaid({ config, op: 'exchange', params: { publicToken } }));
  if (!out.ok) return out;
  const saved = await save({ accessToken: out.data.access_token, itemId: out.data.item_id, cursor: '' });
  if (saved && saved.ok === false) return saved;
  return { ok: true, data: { channel: 'plaid', itemId: out.data.item_id, linkedOn: localToday(), mock: Boolean(out.mock) } };
}

export async function plaidLinkSandbox(state, args = {}, actor, options = {}) {
  const { config, save } = store('plaid', options);
  if (!config || !config.clientId || !config.secret) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'plaid', hint: 'Save the Plaid client id and secret first.' });
  if ((config.environment || 'sandbox') !== 'sandbox') return fail('SANDBOX_ONLY', { hint: 'A test bank can be linked without Plaid Link only in the sandbox environment; production needs Plaid Link in the app.' });
  const institution = String(args.institutionId || PLAID_SANDBOX_INSTITUTION);
  const out = await performExternalAction(state, {
    actionId: 'plaid_link',
    clientId: String(state.activeClientId || 'SELF'),
    params: { institution, environment: 'sandbox' },
    actor: actor || { userId: 'owner' },
    metadata: { institution },
    fixture: () => ({ ok: true, mock: true, data: { accessToken: `access-sandbox-mock-${createHash('sha256').update(institution).digest('hex').slice(0, 12)}`, itemId: `mock-item-${institution}`, institution } }),
  }, async (transports) => {
    const created = await transports.channel.plaid({ config, op: 'sandbox_public_token', params: { institution } });
    if (!created.ok) return created;
    const exchanged = await transports.channel.plaid({ config, op: 'exchange', params: { publicToken: created.data.public_token } });
    if (!exchanged.ok) return exchanged;
    return { ok: true, data: { accessToken: exchanged.data.access_token, itemId: exchanged.data.item_id, institution } };
  });
  if (!out.ok) return out;
  const saved = await save({ accessToken: out.data.accessToken, itemId: out.data.itemId, cursor: '' });
  if (saved && saved.ok === false) return saved;
  return { ok: true, data: { channel: 'plaid', itemId: out.data.itemId, institution: out.data.institution, mock: Boolean(out.mock), linkedOn: localToday(), next: 'fetch_channel_report { channel: "plaid", kind: "bank" } pulls the transactions; the desktop does it daily.' } };
}

export async function taxjarRate(state, args = {}, actor, options = {}) {
  const { config } = store('taxjar', options);
  if (!config || !config.apiToken) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'taxjar', hint: 'Save the TaxJar API token first.' });
  const zip = String(args.zip || '').trim();
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return fail('BAD_ZIP', { hint: 'A US zip code is five digits, optionally plus four.' });
  const stateCode = String(args.state || '').trim().toUpperCase();
  const city = String(args.city || '').trim();
  const out = await performExternalAction(state, {
    actionId: 'taxjar_rate',
    clientId: String(state.activeClientId || 'SELF'),
    params: { zip, city, state: stateCode, environment: config.environment || 'sandbox' },
    actor: actor || { userId: 'owner' },
    metadata: { zip, city, state: stateCode },
    fixture: () => ({ ok: true, mock: true, data: { rate: { zip, state: stateCode || 'TX', city: city || 'AUSTIN', county: 'TRAVIS', state_rate: '0.0625', county_rate: '0.0', city_rate: '0.01', special_rate: '0.01', combined_rate: '0.0825', freight_taxable: true } } }),
  }, async (transports) => transports.channel.taxjar({ config, op: 'rates', params: { zip, city, state: stateCode } }));
  if (!out.ok) return out;
  const rate = out.data?.rate || {};
  const combined = round2(Number(rate.combined_rate) * 100 * 100) / 100;
  const code = String(args.code || (rate.city && stateCode ? `${stateCode}-${String(rate.city).toUpperCase().replace(/[^A-Z0-9]+/g, '')}` : stateCode || rate.state)).toUpperCase();
  const data = { zip, code, name: args.name || [rate.city, rate.state].filter(Boolean).join(', '), ratePercent: combined, parts: { state: Number(rate.state_rate) * 100, county: Number(rate.county_rate) * 100, city: Number(rate.city_rate) * 100, special: Number(rate.special_rate) * 100 }, freightTaxable: Boolean(rate.freight_taxable), mock: Boolean(out.mock), source: `TaxJar ${config.environment || 'sandbox'} on ${localToday()}` };
  if (args.record === false) return { ok: true, data };
  const recorded = setSalesTaxRate(state, { code, name: data.name, ratePercent: combined, from: args.from || localToday() });
  return { ok: true, data: { ...data, recorded: recorded.ok === true, recordError: recorded.ok ? '' : recorded.error } };
}

export function gustoRedirectUri({ host = '127.0.0.1', port = 4780, https = false } = {}) {
  return `${https ? 'https' : 'http'}://${host}:${port}${GUSTO_REDIRECT_PATH}`;
}

export async function gustoConnectUrl(args = {}, options = {}) {
  const { config, save } = store('gusto', options);
  if (!config || !config.clientId || !config.clientSecret) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'gusto', hint: 'Save the Gusto client id and secret first.' });
  const environment = config.environment === 'production' ? 'production' : 'demo';
  const redirectUri = String(args.redirectUri || config.redirectUri || gustoRedirectUri({ port: Number(args.port || 4780) }));
  const oauthState = `${args.statePrefix ? `${args.statePrefix}.` : ''}${randomBytes(16).toString('hex')}`;
  const saved = await save({ oauthState, redirectUri });
  if (saved && saved.ok === false) return saved;
  const url = new URL(`${GUSTO_HOSTS[environment]}/oauth/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', oauthState);
  return { ok: true, data: { url: url.toString(), redirectUri, environment, note: 'Open the link, sign in to Gusto and allow the app; Gusto sends the browser back to MyCA, which exchanges the code for tokens and keeps them in the vault.' } };
}

export async function gustoCallback(state, args = {}, actor, options = {}) {
  const { config, save } = store('gusto', options);
  if (!config || !config.clientId || !config.clientSecret) return fail('CONNECTOR_NOT_CONFIGURED', { channel: 'gusto' });
  const code = String(args.code || '').trim();
  const givenState = String(args.state || '').trim();
  if (!code) return fail('CODE_REQUIRED');
  if (!config.oauthState || givenState !== config.oauthState) return fail('OAUTH_STATE_MISMATCH', { hint: 'Start the connection again from the keys page; the link had expired or was not ours.' });
  const out = await performExternalAction(state, {
    actionId: 'gusto_token',
    clientId: String(state.activeClientId || 'SELF'),
    params: { codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16), environment: config.environment || 'demo' },
    actor: actor || { userId: 'owner' },
    metadata: { environment: config.environment || 'demo' },
    fixture: () => ({ ok: true, mock: true, data: { accessToken: 'mock-gusto-access', refreshToken: 'mock-gusto-refresh', companyUuid: 'mock-company-uuid', expiresIn: 7200 } }),
  }, async (transports) => {
    const token = await transports.channel.gusto({ config, op: 'token', params: { code, redirectUri: config.redirectUri } });
    if (!token.ok) return token;
    const info = await transports.channel.gusto({ config: { ...config, accessToken: token.data.access_token }, op: 'token_info', params: {} });
    return { ok: true, data: { accessToken: token.data.access_token, refreshToken: token.data.refresh_token, companyUuid: info.ok ? String(info.data?.resource?.uuid || '') : '', expiresIn: token.data.expires_in } };
  });
  if (!out.ok) return out;
  const saved = await save({ accessToken: out.data.accessToken, refreshToken: out.data.refreshToken, companyUuid: out.data.companyUuid, oauthState: '' });
  if (saved && saved.ok === false) return saved;
  return { ok: true, data: { channel: 'gusto', companyUuid: out.data.companyUuid, connectedOn: localToday(), mock: Boolean(out.mock) } };
}

function pinwheelMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) / PINWHEEL_CENTS : undefined;
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
}

export function pinwheelTaxFormToUsForm(taxForm, owner = 'taxpayer') {
  const kind = PINWHEEL_FORM_KINDS[String(taxForm?.form_type || '').toUpperCase()];
  const p = taxForm?.parsed_data || {};
  const notes = (taxForm?.warnings || []).map((w) => `${w.field || 'form'}: ${w.message || w.status || 'check this box'}`);
  const base = { taxFormId: String(taxForm?.id || ''), formType: String(taxForm?.form_type || ''), year: Number(taxForm?.year || 0), documentId: `pinwheel-${String(taxForm?.id || '')}`.slice(0, 80), notes };
  if (!kind) return { ...base, skipped: `MyCA does not read ${taxForm?.form_type || 'this form'} from payroll yet; add it by hand.` };
  if (!taxForm?.parsed_data) return { ...base, skipped: 'Pinwheel sent the PDF but no parsed boxes; add this form by hand from the PDF.' };
  if (kind === 'W-2') {
    const states = Array.isArray(p.box_15_to_20) ? p.box_15_to_20 : [];
    const first = states[0] || {};
    if (states.length > 1) notes.push(`This W-2 lists ${states.length} states; only ${first.box_15_state || 'the first'} is carried. Add the other state wages by hand.`);
    if (String(taxForm.form_type).toUpperCase() === 'W-2C') notes.push('This is a corrected W-2 (W-2c). Remove the original W-2 from the return if it is there.');
    const box13 = p.box_13 || {};
    return { ...base, form: { kind, owner, payer: String(p.box_c?.name || '').trim(), payerTin: String(p.box_b || '').trim(), source: 'payroll', documentId: base.documentId, fields: compact({
      wages: pinwheelMoney(p.box_1), federalWithheld: pinwheelMoney(p.box_2), socialSecurityWages: pinwheelMoney(p.box_3), socialSecurityTax: pinwheelMoney(p.box_4), medicareWages: pinwheelMoney(p.box_5), medicareTax: pinwheelMoney(p.box_6), socialSecurityTips: pinwheelMoney(p.box_7),
      box12: (Array.isArray(p.box_12) ? p.box_12 : []).map((row) => ({ code: String(row?.code || '').toUpperCase(), amount: pinwheelMoney(row?.amount) || 0 })),
      retirementPlan: box13.retirement_plan === undefined ? undefined : Boolean(box13.retirement_plan),
      state: first.box_15_state ? String(first.box_15_state).toUpperCase() : undefined, stateWages: pinwheelMoney(first.box_16), stateWithheld: pinwheelMoney(first.box_17), localWithheld: pinwheelMoney(first.box_19),
    }) } };
  }
  const payer = String(p.payer_name || p.payer?.name || '').trim();
  const payerTin = String(p.payer_tin || p.payer?.tin || '').trim();
  const fields = kind === '1099-NEC'
    ? compact({ nonemployeeCompensation: pinwheelMoney(p.box_1), federalWithheld: pinwheelMoney(p.box_4) })
    : compact({ rents: pinwheelMoney(p.box_1), royalties: pinwheelMoney(p.box_2), otherIncome: pinwheelMoney(p.box_3), federalWithheld: pinwheelMoney(p.box_4) });
  return { ...base, form: { kind, owner, payer, payerTin, source: 'payroll', documentId: base.documentId, fields } };
}

function mockPinwheelTaxForms(year) {
  return [{ id: 'mock-w2-1', form_type: 'W-2', year, parsed_data: { box_b: '12-3456789', box_c: { name: 'Sample Employer Inc' }, box_1: 6250000, box_2: 712000, box_3: 6250000, box_4: 387500, box_5: 6250000, box_6: 90625, box_12: [{ code: 'D', amount: 300000 }], box_13: { retirement_plan: true }, box_15_to_20: [{ box_15_state: 'CA', box_16: 6250000, box_17: 241000 }] }, warnings: [] }];
}

function pinwheelReady(options) {
  const { config, save } = store('pinwheel', options);
  if (!config || !config.apiSecret) return { error: fail('CONNECTOR_NOT_CONFIGURED', { channel: 'pinwheel', hint: 'Save the Pinwheel API secret first (set_channel_connector channel pinwheel).' }) };
  return { config, save };
}

function taxYearOf(args) {
  const year = Number(args.taxYear);
  return Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : 0;
}

export async function pinwheelLinkToken(state, args = {}, actor, options = {}) {
  const ready = pinwheelReady(options);
  if (ready.error) return ready.error;
  const out = await performExternalAction(state, {
    actionId: 'pinwheel_read',
    clientId: String(state.activeClientId || 'SELF'),
    params: { op: 'link_token', environment: ready.config.environment || 'sandbox' },
    actor: actor || { userId: 'owner' },
    metadata: { op: 'link_token' },
    fixture: () => ({ ok: true, mock: true, data: { token: 'mock-pinwheel-link-token', expires: '' } }),
  }, async (transports) => transports.channel.pinwheel({ config: ready.config, op: 'link_token', params: { endUserId: String(args.userId || 'owner') } }));
  if (!out.ok) return out;
  return { ok: true, data: { linkToken: out.data.token, expiration: out.data.expires || '', environment: ready.config.environment || 'sandbox', mock: Boolean(out.mock), next: 'Open Pinwheel Link with this token. When the owner finishes, pass the account id it returns to payroll_tax_forms.' } };
}

async function pullPinwheelForms(state, args, actor, options, formIds) {
  const ready = pinwheelReady(options);
  if (ready.error) return ready.error;
  const taxYear = taxYearOf(args);
  if (!taxYear) return fail('TAX_YEAR_REQUIRED', { hint: 'Say which tax year, like 2026.' });
  const given = String(args.accountId || '').trim();
  if (given && !/^[A-Za-z0-9-]{8,80}$/.test(given)) return fail('BAD_ACCOUNT_ID', { hint: 'The account id comes from Pinwheel Link when the owner finishes connecting their employer.' });
  const accountId = given || String(ready.config.accountId || '');
  if (!accountId) return fail('PAYROLL_NOT_LINKED', { hint: 'Connect the employer or payroll provider first: pinwheel_link_token, then Pinwheel Link in the app.' });
  const out = await performExternalAction(state, {
    actionId: 'pinwheel_read',
    clientId: String(state.activeClientId || 'SELF'),
    params: { op: 'tax_forms', environment: ready.config.environment || 'sandbox', year: taxYear, account: createHash('sha256').update(accountId).digest('hex').slice(0, 16) },
    actor: actor || { userId: 'owner' },
    metadata: { op: 'tax_forms', year: taxYear },
    fixture: () => ({ ok: true, mock: true, data: { taxForms: mockPinwheelTaxForms(taxYear).filter((f) => !formIds || formIds.includes(f.id)) } }),
  }, async (transports) => transports.channel.pinwheel({ config: ready.config, op: 'tax_forms', params: { accountId, year: taxYear, formIds } }));
  if (!out.ok) return out;
  if (given && given !== ready.config.accountId && !out.mock) {
    const saved = await ready.save({ accountId: given });
    if (saved && saved.ok === false) return saved;
  }
  const owner = args.owner === 'spouse' ? 'spouse' : 'taxpayer';
  const read = (out.data.taxForms || []).filter((f) => Number(f.year) === taxYear).map((f) => pinwheelTaxFormToUsForm(f, owner));
  return { ok: true, taxYear, owner, mock: Boolean(out.mock), environment: ready.config.environment || 'sandbox', read };
}

export async function payrollTaxForms(state, args = {}, actor, options = {}) {
  const pulled = await pullPinwheelForms(state, args, actor, options, null);
  if (!pulled.ok) return pulled;
  return { ok: true, data: { taxYear: pulled.taxYear, owner: pulled.owner, environment: pulled.environment, mock: pulled.mock, forms: pulled.read.filter((r) => r.form).map((r) => ({ taxFormId: r.taxFormId, kind: r.form.kind, payer: r.form.payer, payerTin: r.form.payerTin, amounts: r.form.fields, notes: r.notes })), skipped: pulled.read.filter((r) => r.skipped).map((r) => ({ taxFormId: r.taxFormId, formType: r.formType, reason: r.skipped })), amountsNote: 'Pinwheel sends amounts in cents; MyCA shows dollars.', next: 'import_payroll_tax_forms with these taxFormIds adds them to the return after you confirm.' } };
}

export function importPayrollTaxFormsPreview(_state, args = {}) {
  const ids = Array.isArray(args.taxFormIds) ? args.taxFormIds.map(String) : [];
  const taxYear = taxYearOf(args);
  const blockers = [];
  if (!taxYear) blockers.push('Say which tax year.');
  if (!ids.length) blockers.push('Pick the forms to add (payroll_tax_forms lists them).');
  return {
    blockers,
    summary: `Add ${ids.length} form${ids.length === 1 ? '' : 's'} from your payroll provider to your ${taxYear || ''} return${args.owner === 'spouse' ? ' (spouse)' : ''}.`,
    effects: ['MyCA fetches the forms again from Pinwheel and adds the boxes exactly as your employer reported them.', 'A form already added from payroll is not added twice.', 'You can remove any of them from the return later.'],
    figures: { forms: ids.length },
    pinned: { taxYear, owner: args.owner === 'spouse' ? 'spouse' : 'taxpayer', taxFormIds: ids, ...(args.accountId ? { accountId: String(args.accountId) } : {}) },
  };
}

export async function importPayrollTaxForms(state, args = {}, actor, options = {}) {
  const ids = Array.isArray(args.taxFormIds) ? [...new Set(args.taxFormIds.map(String))].slice(0, 50) : [];
  if (!ids.length) return fail('TAX_FORMS_REQUIRED', { hint: 'Pass the taxFormIds that payroll_tax_forms listed.' });
  const pulled = await pullPinwheelForms(state, args, actor, options, ids);
  if (!pulled.ok) return pulled;
  if (pulled.mock) return { ok: true, data: { taxYear: pulled.taxYear, mock: true, added: [], wouldAdd: pulled.read.filter((r) => r.form).map((r) => ({ taxFormId: r.taxFormId, kind: r.form.kind, payer: r.form.payer, amounts: r.form.fields })), note: 'Mock mode is on, so these are sample figures and nothing was added to the return.' } };
  const usReturn = options.usReturn || await import('./us-return.mjs');
  const existing = new Set((state.usReturns?.[pulled.taxYear]?.forms || []).map((f) => f.documentId).filter(Boolean));
  const added = [];
  const skipped = pulled.read.filter((r) => r.skipped).map((r) => ({ taxFormId: r.taxFormId, reason: r.skipped }));
  const failed = [];
  const missing = ids.filter((id) => !pulled.read.some((r) => r.taxFormId === id));
  for (const id of missing) failed.push({ taxFormId: id, error: 'TAX_FORM_NOT_FOUND', problems: [`Pinwheel has no ${pulled.taxYear} form ${id} on this account.`] });
  for (const r of pulled.read.filter((x) => x.form)) {
    if (existing.has(r.form.documentId)) { skipped.push({ taxFormId: r.taxFormId, reason: 'Already on the return.' }); continue; }
    const result = usReturn.addUsTaxForm(state, { taxYear: pulled.taxYear, ...r.form });
    if (result.ok) added.push({ taxFormId: r.taxFormId, id: result.data.id, kind: result.data.kind, payer: result.data.payer, amounts: result.data.amounts, notes: r.notes });
    else failed.push({ taxFormId: r.taxFormId, error: result.error, problems: result.problems || [] });
  }
  return { ok: failed.length === 0, ...(failed.length ? { error: 'SOME_FORMS_NOT_ADDED' } : {}), data: { taxYear: pulled.taxYear, added, skipped, failed } };
}

export function usConnectorsStatus() {
  return { ok: true, data: { connectors: ['plaid', 'taxjar', 'gusto', 'track1099', 'pinwheel'].map((channel) => publicChannelConfig(channel)), gustoRedirect: { desktop: [gustoRedirectUri({ host: '127.0.0.1' }), gustoRedirectUri({ host: 'localhost' })], hosted: 'https://<api host>/v1/oauth/gusto/callback' }, titles: Object.fromEntries(['plaid', 'taxjar', 'gusto', 'track1099', 'pinwheel'].map((c) => [c, CONNECTOR_CHANNELS[c].title])) } };
}
