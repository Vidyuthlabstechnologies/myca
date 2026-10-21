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

export function usConnectorsStatus() {
  return { ok: true, data: { connectors: ['plaid', 'taxjar', 'gusto', 'track1099'].map((channel) => publicChannelConfig(channel)), gustoRedirect: { desktop: [gustoRedirectUri({ host: '127.0.0.1' }), gustoRedirectUri({ host: 'localhost' })], hosted: 'https://<api host>/v1/oauth/gusto/callback' }, titles: Object.fromEntries(['plaid', 'taxjar', 'gusto', 'track1099'].map((c) => [c, CONNECTOR_CHANNELS[c].title])) } };
}
