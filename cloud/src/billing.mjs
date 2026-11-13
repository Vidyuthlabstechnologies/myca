import { createSign, timingSafeEqual } from 'node:crypto';
import { createStripe, stripeSignatureValid } from './stripe.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;
const LIVE_STATUSES = new Set(['active', 'in_grace_period', 'canceled']);
const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const RENEW_AHEAD_DAYS = 2;
const RENEW_LOOKBACK_DAYS = 30;
const RENEW_BATCH = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PLANS = Object.freeze({
  lapsed: Object.freeze({ id: 'lapsed', title: 'Trial ended', monthlyRupees: 0, yearlyRupees: 0, limits: { invoicesPerMonth: 0, members: 1 }, features: ['books'] }),
  essentials: Object.freeze({ id: 'essentials', title: 'Essentials', monthlyRupees: 399, yearlyRupees: 3999, limits: { invoicesPerMonth: null, members: 2 }, features: ['books', 'post', 'chat', 'gst-reports', 'team'] }),
  pro: Object.freeze({ id: 'pro', title: 'Pro', monthlyRupees: 799, yearlyRupees: 7999, limits: { invoicesPerMonth: null, members: 5 }, features: ['books', 'post', 'chat', 'gst-reports', 'gst-returns', 'einvoice', 'connectors', 'whatsapp', 'team'] }),
  household: Object.freeze({ id: 'household', title: 'Personal tax return', monthlyRupees: 0, yearlyRupees: 0, limits: { invoicesPerMonth: 0, members: 3 }, features: ['books', 'post', 'chat', 'team'] }),
  firm: Object.freeze({ id: 'firm', title: 'CA firm', monthlyRupees: 2499, yearlyRupees: 24999, limits: { invoicesPerMonth: null, members: 25 }, features: ['books', 'post', 'chat', 'gst-reports', 'gst-returns', 'einvoice', 'connectors', 'whatsapp', 'team', 'priority-support'] }),
});

const PAID = ['essentials', 'pro', 'firm'];
export const US_RETURN_PRICE_USD = 129;
export const US_RETURN_LAUNCH_PRICE_USD = 99;
export const US_RETURN_LAUNCH_UNTIL = '2027-04-15';
export const US_PLUS_PRICE_USD = 249;
export const US_EXPERT_REVIEW_PRICE_USD = 299;
export const US_WAITLIST_PRODUCTS = Object.freeze({ done_for_you: 'Done For You', international: 'International add-on' });
export const US_PLUS_TOOLS = Object.freeze(['read_irs_letter', 'us_withholding_check', 'us_estimated_payments']);
export const US_RETURN_PRICE_LINE = (price, listPrice = price) => (listPrice > price ? `$${price} to file your federal return, launch price for this season (usually $${listPrice}). One price, no upgrade fees.` : `$${price} to file your federal return. One price, no upgrade fees.`);

function launchEnd(day) {
  const text = String(day || '').trim();
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text) ? Date.parse(`${text}T23:59:59-04:00`) || 0 : 0;
}
const US_RETURN_YEARS_BACK = 3;
const PLUS_LIVE = new Set(['active', 'trialing', 'past_due']);
const CARD_RETURN_PRODUCT = 'card:us_return';

function dollars(value, fallback) {
  return /^[0-9]{1,4}$/.test(String(value || '').trim()) ? Number(value) : fallback;
}

function cheapestWith(feature) {
  return PAID.map((id) => PLANS[id]).filter((plan) => plan.features.includes(feature)).map((plan) => plan.title);
}

export const READ_ONLY_REPLY = 'The free trial has ended, so the books are read-only: you can still ask questions and export everything, but nothing new is posted. The owner can choose a plan under Plan and billing.';

export async function readOnlyChat(session, message, actor) {
  if (session.state.pendingChatAction) await session.discard(actor);
  const out = await session.chat(message, actor);
  if (!out.preview && !out.awaitingConfirmation && !out.pending) return out;
  await session.discard(actor);
  return { reply: READ_ONLY_REPLY, tools: [], error: 'PLAN_REQUIRED' };
}

function unset(value) {
  const text = String(value || '').trim();
  return text === 'unset' ? '' : text;
}

function parseServiceAccount(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed.client_email && parsed.private_key ? { clientEmail: parsed.client_email, privateKey: parsed.private_key, tokenUri: parsed.token_uri || 'https://oauth2.googleapis.com/token' } : null;
  } catch {
    return null;
  }
}

export function billingConfigFromEnv(env = process.env) {
  const prices = Object.fromEntries(String(env.MYCA_PLAN_PRICES || '').split(',').map((pair) => pair.split('=').map((part) => part.trim())).filter(([plan, price]) => PAID.includes(plan) && /^[0-9]{1,6}$/.test(price || '')).map(([plan, price]) => [plan, Number(price)]));
  return {
    packageName: unset(env.MYCA_PLAY_PACKAGE),
    productIds: { essentials: unset(env.MYCA_PLAY_PRODUCT_ESSENTIALS), pro: unset(env.MYCA_PLAY_PRODUCT_PRO), firm: unset(env.MYCA_PLAY_PRODUCT_FIRM) },
    usReturn: { packageName: unset(env.MYCA_PLAY_PACKAGE_US), productId: unset(env.MYCA_PLAY_PRODUCT_US_1040), priceUsd: dollars(env.MYCA_US_RETURN_PRICE_USD, US_RETURN_PRICE_USD), launchPriceUsd: dollars(env.MYCA_US_RETURN_LAUNCH_PRICE_USD, US_RETURN_LAUNCH_PRICE_USD), launchUntil: unset(env.MYCA_US_LAUNCH_OFFER_UNTIL) || US_RETURN_LAUNCH_UNTIL },
    usPlus: { priceUsd: dollars(env.MYCA_US_PLUS_PRICE_USD, US_PLUS_PRICE_USD), productId: unset(env.MYCA_PLAY_PRODUCT_US_PLUS) },
    usExpertReview: { on: unset(env.MYCA_US_EXPERT_REVIEW) === '1', priceUsd: dollars(env.MYCA_US_EXPERT_REVIEW_PRICE_USD, US_EXPERT_REVIEW_PRICE_USD) },
    stripe: { secretKey: unset(env.MYCA_STRIPE_SECRET_KEY), webhookSecret: unset(env.MYCA_STRIPE_WEBHOOK_SECRET), plusPriceId: unset(env.MYCA_STRIPE_PRICE_US_PLUS), returnUrl: unset(env.MYCA_US_CHECKOUT_RETURN_URL) },
    notifyToken: unset(env.MYCA_PLAY_NOTIFY_TOKEN),
    serviceAccount: parseServiceAccount(unset(env.MYCA_PLAY_SERVICE_ACCOUNT_JSON)),
    prices,
  };
}

export function billingConfigProblem(env = process.env) {
  const cfg = billingConfigFromEnv(env);
  const card = cfg.stripe;
  if ((card.secretKey || card.webhookSecret) && !(card.secretKey && card.webhookSecret && card.returnUrl)) return 'Card checkout needs all of MYCA_STRIPE_SECRET_KEY, MYCA_STRIPE_WEBHOOK_SECRET and MYCA_US_CHECKOUT_RETURN_URL.';
  if (card.returnUrl && !/^https:\/\//.test(card.returnUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(card.returnUrl)) return 'MYCA_US_CHECKOUT_RETURN_URL must be an https address.';
  if (card.secretKey && !/^(sk|rk)_(test|live)_/.test(card.secretKey)) return 'MYCA_STRIPE_SECRET_KEY is not a Stripe secret key (it starts sk_live_ or sk_test_).';
  const usPlay = cfg.usReturn.packageName || cfg.packageName;
  if (!(cfg.packageName && PAID.some((plan) => cfg.productIds[plan])) && !(usPlay && (cfg.usReturn.productId || cfg.usPlus.productId))) return '';
  const given = unset(env.MYCA_PLAY_SERVICE_ACCOUNT_JSON);
  if (given && !cfg.serviceAccount) return 'MYCA_PLAY_SERVICE_ACCOUNT_JSON is not a service account key: paste the whole JSON file Google Cloud gave for the Play service account.';
  if (!given && !env.K_SERVICE) return 'Google Play subscriptions are on but MYCA_PLAY_SERVICE_ACCOUNT_JSON is empty: outside Cloud Run the API has no other way to reach the Play Developer API.';
  return '';
}

export function notifyTokenMatches(expected, given) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function stateWord(value) {
  return String(value || '').replace(/^SUBSCRIPTION_STATE_/, '').toLowerCase() || 'unknown';
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export const US_EFILE_NOT_OPEN_HINT = 'IRS e-file is not open in MyCA yet. Your return is saved and nothing has been charged. You can still review it and download it as a PDF.';

export function createBilling({ db, config = {}, now = () => Date.now(), fetchImpl = (...args) => globalThis.fetch(...args), log = () => {}, usFilingOpen = () => true }) {
  const cfg = { packageName: '', productIds: {}, notifyToken: '', serviceAccount: null, prices: {}, ...config };
  cfg.usReturn = { packageName: '', productId: '', priceUsd: US_RETURN_PRICE_USD, launchPriceUsd: 0, launchUntil: '', ...(config.usReturn || {}) };
  const launchUntil = launchEnd(cfg.usReturn.launchUntil);
  const returnPrice = () => (cfg.usReturn.launchPriceUsd > 0 && cfg.usReturn.launchPriceUsd < cfg.usReturn.priceUsd && now() <= launchUntil ? cfg.usReturn.launchPriceUsd : cfg.usReturn.priceUsd);
  const launchOffer = () => (returnPrice() < cfg.usReturn.priceUsd ? { priceUsd: returnPrice(), until: cfg.usReturn.launchUntil } : null);
  cfg.usPlus = { priceUsd: US_PLUS_PRICE_USD, productId: '', ...(config.usPlus || {}) };
  cfg.usExpertReview = { on: false, priceUsd: US_EXPERT_REVIEW_PRICE_USD, ...(config.usExpertReview || {}) };
  cfg.stripe = { secretKey: '', webhookSecret: '', plusPriceId: '', returnUrl: '', ...(config.stripe || {}) };
  const enabled = Boolean(cfg.packageName && PAID.some((plan) => cfg.productIds[plan]));
  const usPackage = cfg.usReturn.packageName || cfg.packageName;
  const usPlayEnabled = Boolean(usPackage && cfg.usReturn.productId);
  const cardEnabled = Boolean(cfg.stripe.secretKey && cfg.stripe.webhookSecret && cfg.stripe.returnUrl);
  const plusOnPlay = Boolean(usPackage && cfg.usPlus.productId);
  const plusOnCard = !plusOnPlay && cardEnabled && Boolean(cfg.stripe.plusPriceId);
  const plusBuyable = plusOnPlay || plusOnCard;
  const plusCheckout = plusOnPlay ? 'play' : plusOnCard ? 'card' : 'none';
  const usEnforced = usPlayEnabled || cardEnabled;
  const usSold = () => usEnforced && usFilingOpen() === true;
  const notOpen = () => fail('US_EFILE_NOT_OPEN', { hint: US_EFILE_NOT_OPEN_HINT });
  const stripe = cardEnabled ? createStripe({ secretKey: cfg.stripe.secretKey, fetchImpl }) : null;
  const planOfProduct = (productId) => PAID.find((plan) => cfg.productIds[plan] && cfg.productIds[plan] === productId) || null;
  let cachedToken = { value: '', until: 0 };

  async function accessToken() {
    if (cachedToken.value && cachedToken.until > now()) return cachedToken.value;
    let res;
    if (cfg.serviceAccount) {
      const iat = Math.floor(now() / 1000);
      const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ iss: cfg.serviceAccount.clientEmail, scope: PLAY_SCOPE, aud: cfg.serviceAccount.tokenUri, iat, exp: iat + 3600 }))}`;
      const signature = createSign('RSA-SHA256').update(unsigned).sign(cfg.serviceAccount.privateKey).toString('base64url');
      res = await fetchImpl(cfg.serviceAccount.tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString(),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      res = await fetchImpl(`${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(PLAY_SCOPE)}`, { headers: { 'metadata-flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw Object.assign(new Error('PLAY_AUTH_FAILED'), { status: res.status });
    cachedToken = { value: data.access_token, until: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 60000 };
    return cachedToken.value;
  }

  async function play(method, path, packageName = cfg.packageName) {
    const res = await fetchImpl(`${PLAY_API}/${encodeURIComponent(packageName)}/purchases/${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    return { ok: res.ok, status: res.status, data };
  }

  async function lookup(purchaseToken) {
    const out = await play('GET', `subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
    if (!out.ok) return { ok: false, status: out.status };
    const items = Array.isArray(out.data.lineItems) ? out.data.lineItems : [];
    const item = items.find((line) => planOfProduct(line.productId)) || items[0] || {};
    const expiry = items.map((line) => Date.parse(line.expiryTime || '')).filter(Number.isFinite);
    return {
      ok: true,
      productId: String(item.productId || ''),
      plan: planOfProduct(item.productId),
      status: stateWord(out.data.subscriptionState),
      currentEnd: expiry.length ? new Date(Math.max(...expiry)) : null,
      accountId: String(out.data.externalAccountIdentifiers?.obfuscatedExternalAccountId || ''),
      linkedPurchaseToken: String(out.data.linkedPurchaseToken || ''),
      needsAck: out.data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
      testPurchase: Boolean(out.data.testPurchase),
    };
  }

  async function acknowledge(found, purchaseToken) {
    if (!found.needsAck || !LIVE_STATUSES.has(found.status) || !found.productId) return;
    const out = await play('POST', `subscriptions/${encodeURIComponent(found.productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`);
    if (!out.ok) log({ billing: 'acknowledge_failed', status: out.status });
  }

  async function save(businessId, userId, purchaseToken, found) {
    await db.query(
      `insert into subscriptions (business_id, provider, provider_subscription_id, product_id, plan, status, current_end, test_purchase, created_by, updated_at)
       values ($1, 'play', $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (business_id) do update set provider = excluded.provider, provider_subscription_id = excluded.provider_subscription_id, product_id = excluded.product_id, plan = excluded.plan, status = excluded.status, current_end = excluded.current_end, test_purchase = excluded.test_purchase, created_by = coalesce(excluded.created_by, subscriptions.created_by), updated_at = now()`,
      [businessId, purchaseToken, found.productId, found.plan, found.status, found.currentEnd, found.testPurchase, userId],
    );
  }

  async function row(businessId) {
    const found = await db.query('select provider, provider_subscription_id as "token", product_id as "productId", plan, status, current_end as "currentEnd", test_purchase as "testPurchase" from subscriptions where business_id = $1', [businessId]);
    return found.rows[0] || null;
  }

  async function ownerOfToken(purchaseToken) {
    if (!purchaseToken) return null;
    const found = await db.query("select business_id as \"businessId\" from subscriptions where provider = 'play' and provider_subscription_id = $1", [purchaseToken]);
    return found.rows[0]?.businessId || null;
  }

  function manageUrl(productId, packageName = cfg.packageName) {
    if (!packageName) return '';
    const sku = productId ? `sku=${encodeURIComponent(productId)}&` : '';
    return `https://play.google.com/store/account/subscriptions?${sku}package=${encodeURIComponent(packageName)}`;
  }

  async function entitlement(businessId) {
    const at = now();
    const business = await db.query('select b.created_at as "createdAt", b.demo, b.kind, u.trial_started_at as "trialStartedAt" from businesses b left join users u on u.id = b.created_by where b.id = $1', [businessId]);
    if (business.rows[0]?.kind === 'household') {
      const plan = PLANS.household;
      return { ok: true, enforced: enabled, plan: plan.id, planTitle: plan.title, limits: plan.limits, features: plan.features, trial: null, subscription: null, manageUrl: '', usReturn: { enforced: usSold(), filingOpen: usFilingOpen() === true, priceUsd: returnPrice(), listPriceUsd: cfg.usReturn.priceUsd, productId: cfg.usReturn.productId, checkout: checkoutKind() }, usPlus: await usPlus(businessId) };
    }
    if (business.rows[0]?.demo) {
      return { ok: true, enforced: enabled, plan: 'pro', planTitle: PLANS.pro.title, limits: PLANS.pro.limits, features: PLANS.pro.features, trial: null, demo: true, subscription: null, manageUrl: '' };
    }
    const createdAt = business.rows[0] ? new Date(business.rows[0].createdAt).getTime() : at;
    const firstBusinessAt = business.rows[0]?.trialStartedAt ? new Date(business.rows[0].trialStartedAt).getTime() : createdAt;
    const trialEndsAt = Math.min(createdAt, firstBusinessAt) + TRIAL_DAYS * DAY_MS;
    const sub = await row(businessId);
    const paidUntil = sub?.currentEnd ? new Date(sub.currentEnd).getTime() + GRACE_DAYS * DAY_MS : 0;
    const paying = Boolean(sub && LIVE_STATUSES.has(sub.status) && PAID.includes(sub.plan) && paidUntil > at);
    const inTrial = !paying && at < trialEndsAt;
    const plan = paying ? sub.plan : inTrial ? 'pro' : 'lapsed';
    return {
      ok: true,
      enforced: enabled,
      plan,
      planTitle: PLANS[plan].title,
      limits: PLANS[plan].limits,
      features: PLANS[plan].features,
      trial: inTrial ? { endsAt: new Date(trialEndsAt).toISOString(), daysLeft: Math.max(0, Math.ceil((trialEndsAt - at) / DAY_MS)) } : null,
      subscription: sub ? { provider: sub.provider, plan: sub.plan, productId: sub.productId, status: sub.status, renews: sub.status === 'active' || sub.status === 'in_grace_period', currentEnd: sub.currentEnd ? new Date(sub.currentEnd).toISOString() : null, testPurchase: sub.testPurchase } : null,
      manageUrl: sub?.provider === 'play' ? manageUrl(sub.productId) : '',
    };
  }

  async function allows(businessId, feature) {
    if (!enabled) return { ok: true };
    const got = await entitlement(businessId);
    if (got.features.includes(feature)) return { ok: true, entitlement: got };
    const plans = cheapestWith(feature);
    const hint = got.plan === 'lapsed' ? 'The free trial has ended, so the books are read-only: you can see and export everything. The owner can choose a plan under Plan and billing.' : `${plans.join(' or ')} includes this. The owner can upgrade under Plan and billing.`;
    return fail('PLAN_REQUIRED', { feature, plan: got.plan, hint });
  }

  async function withinLimit(businessId, limit, used) {
    if (!enabled) return { ok: true };
    const got = await entitlement(businessId);
    const cap = got.limits[limit];
    if (cap == null || used < cap) return { ok: true };
    return fail('PLAN_LIMIT_REACHED', { limit, cap, plan: got.plan, hint: `The ${got.planTitle} plan allows ${cap}. The owner can upgrade under Plan and billing.` });
  }

  function usTaxYearProblem(taxYear) {
    const year = Number(taxYear);
    const latest = new Date(now()).getUTCFullYear();
    if (!Number.isInteger(year) || year > latest || year < latest - US_RETURN_YEARS_BACK) return fail('BAD_TAX_YEAR', { hint: `Pick a tax year from ${latest - US_RETURN_YEARS_BACK} to ${latest}.` });
    return null;
  }

  async function isHousehold(businessId) {
    const found = await db.query('select kind from businesses where id = $1', [businessId]);
    return found.rows[0]?.kind === 'household';
  }

  async function usPurchase(businessId, taxYear) {
    const found = await db.query('select provider, product_id as "productId", price_usd as "priceUsd", test_purchase as "testPurchase", created_at as "createdAt" from us_return_purchases where business_id = $1 and tax_year = $2', [businessId, taxYear]);
    return found.rows[0] || null;
  }

  async function usReturn(businessId, taxYear) {
    const bad = usTaxYearProblem(taxYear);
    if (bad) return bad;
    const year = Number(taxYear);
    const bought = await usPurchase(businessId, year);
    return {
      ok: true,
      taxYear: year,
      enforced: usSold(),
      paid: Boolean(bought) || !usSold(),
      filingOpen: usFilingOpen() === true,
      purchased: Boolean(bought),
      priceUsd: bought ? bought.priceUsd : returnPrice(),
      listPriceUsd: cfg.usReturn.priceUsd,
      launchOffer: bought ? null : launchOffer(),
      currency: 'USD',
      productId: cfg.usReturn.productId,
      buyable: usSold(),
      checkout: checkoutKind(),
      priceLine: bought ? US_RETURN_PRICE_LINE(bought.priceUsd) : US_RETURN_PRICE_LINE(returnPrice(), cfg.usReturn.priceUsd),
      provider: bought?.provider || null,
      purchasedAt: bought ? new Date(bought.createdAt).toISOString() : null,
      testPurchase: Boolean(bought?.testPurchase),
    };
  }

  async function usFilingAllowed(businessId, taxYear) {
    if (usFilingOpen() !== true) return notOpen();
    if (!usEnforced) return { ok: true };
    const bad = usTaxYearProblem(taxYear);
    if (bad) return bad;
    if (await usPurchase(businessId, Number(taxYear))) return { ok: true };
    return fail('US_RETURN_UNPAID', { taxYear: Number(taxYear), priceUsd: returnPrice(), productId: cfg.usReturn.productId, hint: `Preparing and checking your return is free. Filing it with the IRS is $${returnPrice()} for the ${taxYear} return, paid once on the Sign and e-file screen.` });
  }

  async function lookupProduct(productId, purchaseToken) {
    const out = await play('GET', `products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`, usPackage);
    if (!out.ok) return { ok: false, status: out.status };
    return {
      ok: true,
      purchased: Number(out.data.purchaseState ?? 0) === 0,
      accountId: String(out.data.obfuscatedExternalAccountId || ''),
      needsAck: Number(out.data.acknowledgementState ?? 0) === 0 && Number(out.data.consumptionState ?? 0) === 0,
      testPurchase: out.data.purchaseType === 0,
    };
  }

  async function verifyUsReturn(businessId, userId, { taxYear, productId, purchaseToken } = {}) {
    if (!usPlayEnabled) return fail('BILLING_NOT_CONFIGURED', { hint: 'The operator has not set up the Google Play product for US returns yet.' });
    if (!(await isHousehold(businessId))) return fail('NOT_A_PERSONAL_RETURN', { hint: 'The filing fee is for a personal US return. Businesses use a monthly plan.' });
    const bad = usTaxYearProblem(taxYear);
    if (bad) return bad;
    const year = Number(taxYear);
    const token = String(purchaseToken || '');
    if (productId !== cfg.usReturn.productId || !token || token.length > 2000) return fail('UNKNOWN_PRODUCT', { products: [cfg.usReturn.productId] });
    const used = await db.query(`select business_id as "businessId", tax_year as "taxYear" from us_return_purchases where provider = 'play' and purchase_token = $1`, [token]);
    if (used.rows[0]) {
      if (used.rows[0].businessId === businessId && Number(used.rows[0].taxYear) === year) return usReturn(businessId, year);
      return fail('PURCHASE_ALREADY_USED', { hint: 'This Google Play payment already paid for another return. Each tax year is paid once.' });
    }
    if (await usPurchase(businessId, year)) return fail('ALREADY_PAID', { taxYear: year, hint: `The ${year} return is already paid for.` });
    let found;
    try {
      found = await lookupProduct(productId, token);
    } catch (error) {
      log({ billing: 'play_auth_failed', status: error.status || 0 });
      return fail('PROVIDER_UNAVAILABLE', { hint: 'Google Play could not be reached. Your payment is safe; try again in a minute.' });
    }
    if (!found.ok) return fail('PURCHASE_NOT_FOUND', { status: found.status, hint: 'Google Play does not know this payment.' });
    if (!found.purchased) return fail('PURCHASE_NOT_COMPLETE', { hint: 'Google Play has not finished this payment yet. It is picked up once it goes through.' });
    if (found.accountId && found.accountId !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play payment was made for another return.' });
    const saved = await db.query(
      `insert into us_return_purchases (business_id, tax_year, provider, purchase_token, product_id, price_usd, test_purchase, created_by)
       values ($1, $2, 'play', $3, $4, $5, $6, $7) on conflict do nothing returning tax_year`,
      [businessId, year, token, productId, returnPrice(), found.testPurchase, userId],
    );
    if (!saved.rows.length) return fail('PURCHASE_ALREADY_USED', { hint: 'This return or this payment was just recorded by another request.' });
    if (found.needsAck) {
      const ack = await play('POST', `products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, usPackage);
      if (!ack.ok) log({ billing: 'acknowledge_failed', status: ack.status });
    }
    await audit(businessId, userId, 'billing.us_return_paid', { provider: 'play', taxYear: year, priceUsd: returnPrice(), testPurchase: found.testPurchase });
    return usReturn(businessId, year);
  }

  function checkoutKind() {
    return cardEnabled ? 'card' : usPlayEnabled ? 'play' : 'none';
  }

  async function usPlusRow(businessId) {
    const found = await db.query('select provider, subscription_id as "subscriptionId", status, current_end as "currentEnd", cancel_at_period_end as "cancelAtPeriodEnd", price_usd as "priceUsd" from us_plus_subscriptions where business_id = $1', [businessId]);
    return found.rows[0] || null;
  }

  async function lookupUsPlus(purchaseToken) {
    const out = await play('GET', `subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, usPackage);
    if (!out.ok) return { ok: false, status: out.status };
    const items = Array.isArray(out.data.lineItems) ? out.data.lineItems : [];
    const item = items.find((line) => line.productId === cfg.usPlus.productId) || {};
    const expiry = items.map((line) => Date.parse(line.expiryTime || '')).filter(Number.isFinite);
    const status = stateWord(out.data.subscriptionState);
    return {
      ok: true,
      productId: String(item.productId || ''),
      status,
      currentEnd: expiry.length ? new Date(Math.max(...expiry)) : null,
      canceled: status === 'canceled',
      accountId: String(out.data.externalAccountIdentifiers?.obfuscatedExternalAccountId || ''),
      needsAck: out.data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
      testPurchase: Boolean(out.data.testPurchase),
    };
  }

  async function refreshPlayPlus(businessId, sub) {
    if (!plusOnPlay || sub?.provider !== 'play') return sub;
    const until = sub.currentEnd ? new Date(sub.currentEnd).getTime() : 0;
    if (until > now()) return sub;
    try {
      const found = await lookupUsPlus(sub.subscriptionId);
      if (!found.ok) return sub;
      await db.query('update us_plus_subscriptions set status = $2, current_end = $3, cancel_at_period_end = $4, updated_at = now() where business_id = $1', [businessId, found.status, found.currentEnd, found.canceled]);
      return usPlusRow(businessId);
    } catch (error) {
      log({ billing: 'play_auth_failed', status: error.status || 0 });
      return sub;
    }
  }

  async function usPlus(businessId) {
    const sub = await refreshPlayPlus(businessId, await usPlusRow(businessId));
    const until = sub?.currentEnd ? new Date(sub.currentEnd).getTime() : 0;
    const live = sub?.provider === 'play' ? LIVE_STATUSES.has(sub.status) : PLUS_LIVE.has(sub?.status);
    const active = Boolean(sub && live && until + GRACE_DAYS * DAY_MS > now());
    return {
      ok: true,
      enforced: plusBuyable,
      active: active || !plusBuyable,
      subscribed: active,
      status: sub?.status || null,
      until: until ? new Date(until).toISOString() : null,
      renews: active && !sub.cancelAtPeriodEnd,
      priceUsd: sub ? sub.priceUsd : cfg.usPlus.priceUsd,
      per: 'year',
      buyable: plusBuyable,
      checkout: plusCheckout,
      productId: plusOnPlay ? cfg.usPlus.productId : '',
      provider: sub?.provider || null,
      manageUrl: sub?.provider === 'play' ? manageUrl(cfg.usPlus.productId, usPackage) : '',
      features: ['IRS letter reader', 'Withholding check', 'Quarterly estimate reminders'],
    };
  }

  async function verifyUsPlus(businessId, userId, { productId, purchaseToken } = {}) {
    if (!plusOnPlay) return fail('BILLING_NOT_CONFIGURED', { hint: 'The operator has not set up the Google Play product for MyCA Plus yet.' });
    if (!(await isHousehold(businessId))) return fail('NOT_A_PERSONAL_RETURN', { hint: 'MyCA Plus is for a personal US return.' });
    const token = String(purchaseToken || '');
    if (productId !== cfg.usPlus.productId || !token || token.length > 2000) return fail('UNKNOWN_PRODUCT', { products: [cfg.usPlus.productId] });
    const holder = await db.query('select business_id as "businessId" from us_plus_subscriptions where subscription_id = $1', [token]);
    if (holder.rows[0] && holder.rows[0].businessId !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play subscription already pays for another return.' });
    let found;
    try {
      found = await lookupUsPlus(token);
    } catch (error) {
      log({ billing: 'play_auth_failed', status: error.status || 0 });
      return fail('PROVIDER_UNAVAILABLE', { hint: 'Google Play could not be reached. Your purchase is safe; try again in a minute.' });
    }
    if (!found.ok) return fail('PURCHASE_NOT_FOUND', { status: found.status, hint: 'Google Play does not know this purchase.' });
    if (found.productId !== cfg.usPlus.productId) return fail('PURCHASE_PRODUCT_MISMATCH');
    if (found.accountId && found.accountId !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play subscription was bought for another return.' });
    if (!LIVE_STATUSES.has(found.status)) return fail('PURCHASE_NOT_COMPLETE', { hint: 'Google Play has not finished this payment yet.' });
    const saved = await db.query(
      `insert into us_plus_subscriptions (business_id, provider, subscription_id, status, current_end, cancel_at_period_end, price_usd, created_by)
       values ($1, 'play', $2, $3, $4, $5, $6, $7)
       on conflict (business_id) do update set provider = excluded.provider, subscription_id = excluded.subscription_id, status = excluded.status, current_end = excluded.current_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()
       returning (xmax = 0) as inserted`,
      [businessId, token, found.status, found.currentEnd, found.canceled, cfg.usPlus.priceUsd, userId],
    );
    if (found.needsAck) {
      const ack = await play('POST', `subscriptions/${encodeURIComponent(found.productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, usPackage);
      if (!ack.ok) log({ billing: 'acknowledge_failed', status: ack.status });
    }
    if (saved.rows[0]?.inserted) await audit(businessId, userId, 'billing.us_plus_started', { provider: 'play', status: found.status, priceUsd: cfg.usPlus.priceUsd, testPurchase: found.testPurchase });
    return usPlus(businessId);
  }

  async function usPlusAllows(businessId) {
    const plus = await usPlus(businessId);
    if (plus.active) return { ok: true };
    return fail('US_PLUS_REQUIRED', { priceUsd: cfg.usPlus.priceUsd, hint: `This is part of MyCA Plus, $${cfg.usPlus.priceUsd} a year. Cancel any time.` });
  }

  function offers() {
    return {
      usReturn: { title: 'MyCA Return', priceUsd: returnPrice(), listPriceUsd: cfg.usReturn.priceUsd, launchOffer: launchOffer(), currency: 'USD', per: 'tax_year', priceLine: US_RETURN_PRICE_LINE(returnPrice(), cfg.usReturn.priceUsd), checkout: checkoutKind(), packageName: usPackage, productId: cfg.usReturn.productId, buyable: usEnforced },
      usPlus: { title: 'MyCA Plus', priceUsd: cfg.usPlus.priceUsd, currency: 'USD', per: 'year', checkout: plusCheckout, packageName: plusOnPlay ? usPackage : '', productId: plusOnPlay ? cfg.usPlus.productId : '', buyable: plusBuyable, features: ['IRS letter reader', 'Withholding check', 'Quarterly estimate reminders'] },
      usExpertReview: cfg.usExpertReview.on ? { title: 'Expert Review', priceUsd: cfg.usExpertReview.priceUsd, currency: 'USD', per: 'return', available: true } : { title: 'Expert Review', available: false },
      usWaitlist: Object.entries(US_WAITLIST_PRODUCTS).map(([id, title]) => ({ id, title })),
    };
  }

  async function usCheckout(businessId, userId, { product, taxYear } = {}, { unsupported = [] } = {}) {
    if (!cardEnabled) return fail('CARD_CHECKOUT_NOT_CONFIGURED', { hint: 'The operator has not set up card payments yet.' });
    if (!(await isHousehold(businessId))) return fail('NOT_A_PERSONAL_RETURN', { hint: 'Card checkout is for a personal US return. Businesses use a monthly plan.' });
    const back = cfg.stripe.returnUrl;
    const join = back.includes('?') ? '&' : '?';
    if (product === 'return') {
      if (usFilingOpen() !== true) return notOpen();
      const bad = usTaxYearProblem(taxYear);
      if (bad) return bad;
      const year = Number(taxYear);
      if (await usPurchase(businessId, year)) return fail('ALREADY_PAID', { taxYear: year, hint: `The ${year} return is already paid for.` });
      if (unsupported.length) {
        const names = unsupported.map((item) => item.form).filter(Boolean);
        return fail('UNSUPPORTED_FORMS', { taxYear: year, forms: unsupported, hint: `Your return needs ${names.join(', ')}, which MyCA can't file yet. You have not been charged.` });
      }
      const metadata = { businessId, userId, product: 'return', taxYear: String(year) };
      const made = await stripe.createCheckout({
        mode: 'payment',
        client_reference_id: businessId,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: returnPrice() * 100, product_data: { name: `MyCA Return, ${year} federal` } } }],
        metadata,
        payment_intent_data: { metadata, statement_descriptor_suffix: 'TAX RETURN' },
        success_url: `${back}${join}checkout={CHECKOUT_SESSION_ID}&result=paid`,
        cancel_url: `${back}${join}result=canceled`,
      });
      return started(businessId, userId, made, { product: 'return', taxYear: year, priceUsd: returnPrice() });
    }
    if (product === 'plus') {
      if (!plusOnCard) return fail('CARD_CHECKOUT_NOT_CONFIGURED', { hint: plusOnPlay ? 'MyCA Plus is bought in Google Play.' : 'The operator has not set up MyCA Plus yet.' });
      if ((await usPlus(businessId)).subscribed) return fail('ALREADY_SUBSCRIBED', { hint: 'MyCA Plus is already on for this return.' });
      const metadata = { businessId, userId, product: 'plus' };
      const made = await stripe.createCheckout({
        mode: 'subscription',
        client_reference_id: businessId,
        line_items: [{ quantity: 1, price: cfg.stripe.plusPriceId }],
        metadata,
        subscription_data: { metadata },
        success_url: `${back}${join}checkout={CHECKOUT_SESSION_ID}&result=paid`,
        cancel_url: `${back}${join}result=canceled`,
      });
      return started(businessId, userId, made, { product: 'plus', priceUsd: cfg.usPlus.priceUsd });
    }
    return fail('UNKNOWN_PRODUCT', { products: ['return', 'plus'] });
  }

  async function started(businessId, userId, made, metadata) {
    if (!made.ok || !made.data.url) {
      log({ billing: 'stripe_checkout_failed', status: made.status });
      return fail('PROVIDER_UNAVAILABLE', { hint: 'Card payments could not be started. Nothing was charged; try again in a minute.' });
    }
    await audit(businessId, userId, 'billing.us_checkout_started', { provider: 'stripe', ...metadata });
    return { ok: true, url: made.data.url, sessionId: made.data.id };
  }

  async function recordCheckout(session) {
    const meta = session.metadata || {};
    const businessId = String(meta.businessId || session.client_reference_id || '');
    if (!UUID.test(businessId)) return { recorded: false, reason: 'no_business' };
    if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) return { recorded: false, reason: 'not_paid', businessId };
    const userId = UUID.test(String(meta.userId || '')) ? meta.userId : null;
    if (meta.product === 'return') {
      const year = Number(meta.taxYear);
      if (!Number.isInteger(year)) return { recorded: false, reason: 'no_tax_year', businessId };
      const priceUsd = Math.round(Number(session.amount_total || 0) / 100);
      const saved = await db.query(
        `insert into us_return_purchases (business_id, tax_year, provider, purchase_token, product_id, price_usd, test_purchase, created_by)
         values ($1, $2, 'stripe', $3, $4, $5, $6, $7) on conflict do nothing returning tax_year`,
        [businessId, year, String(session.id), CARD_RETURN_PRODUCT, priceUsd, session.livemode !== true, userId],
      );
      if (saved.rows.length) await audit(businessId, userId, 'billing.us_return_paid', { provider: 'stripe', taxYear: year, priceUsd, testPurchase: session.livemode !== true });
      return { recorded: true, businessId, product: 'return', taxYear: year };
    }
    if (meta.product === 'plus' && session.subscription) {
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const sub = typeof session.subscription === 'object' && session.subscription.status ? session.subscription : (await stripe.getSubscription(subscriptionId)).data || {};
      await savePlus(businessId, userId, subscriptionId, sub);
      return { recorded: true, businessId, product: 'plus' };
    }
    return { recorded: false, reason: 'unknown_product', businessId };
  }

  async function savePlus(businessId, userId, subscriptionId, sub) {
    const end = Number(sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0);
    const status = String(sub.status || 'active');
    const saved = await db.query(
      `insert into us_plus_subscriptions (business_id, provider, subscription_id, status, current_end, cancel_at_period_end, price_usd, created_by)
       values ($1, 'stripe', $2, $3, $4, $5, $6, $7)
       on conflict (business_id) do update set subscription_id = excluded.subscription_id, status = excluded.status, current_end = excluded.current_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()
       returning (xmax = 0) as inserted, status`,
      [businessId, subscriptionId, status, end ? new Date(end * 1000) : null, sub.cancel_at_period_end === true, cfg.usPlus.priceUsd, userId],
    );
    if (saved.rows[0]?.inserted) await audit(businessId, userId, 'billing.us_plus_started', { provider: 'stripe', status, priceUsd: cfg.usPlus.priceUsd });
  }

  async function usCheckoutConfirm(businessId, userId, { sessionId } = {}) {
    if (!cardEnabled) return fail('CARD_CHECKOUT_NOT_CONFIGURED');
    const id = String(sessionId || '');
    if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(id)) return fail('UNKNOWN_CHECKOUT');
    const found = await stripe.getCheckout(id);
    if (!found.ok) return fail(found.status === 404 ? 'UNKNOWN_CHECKOUT' : 'PROVIDER_UNAVAILABLE', { hint: 'The card payment could not be checked. If you paid, it is picked up within a few minutes.' });
    const owner = String(found.data.metadata?.businessId || found.data.client_reference_id || '');
    if (owner !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This payment was made for another return.' });
    const out = await recordCheckout(found.data);
    if (!out.recorded) return fail(out.reason === 'not_paid' ? 'PURCHASE_NOT_COMPLETE' : 'UNKNOWN_CHECKOUT', { hint: 'The card payment has not gone through yet.' });
    if (out.product === 'return') return usReturn(businessId, out.taxYear);
    return usPlus(businessId);
  }

  async function stripeWebhook(raw, signature) {
    if (!cardEnabled) return { ok: false, statusCode: 404, error: 'CARD_CHECKOUT_NOT_CONFIGURED' };
    const payload = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
    if (!stripeSignatureValid(cfg.stripe.webhookSecret, payload, signature, Math.floor(now() / 1000))) return { ok: false, statusCode: 400, error: 'BAD_SIGNATURE' };
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return { ok: false, statusCode: 400, error: 'BAD_EVENT' };
    }
    const object = event?.data?.object || {};
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const out = await recordCheckout(object);
      return { ok: true, received: event.type, recorded: out.recorded };
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const end = Number(object.current_period_end || object.items?.data?.[0]?.current_period_end || 0);
      const status = event.type === 'customer.subscription.deleted' ? 'canceled_final' : String(object.status || '');
      const changed = await db.query(
        'update us_plus_subscriptions set status = $2, current_end = coalesce($3, current_end), cancel_at_period_end = $4, updated_at = now() where subscription_id = $1 returning business_id as "businessId"',
        [String(object.id || ''), status, end ? new Date(end * 1000) : null, object.cancel_at_period_end === true],
      );
      if (changed.rows[0]) await audit(changed.rows[0].businessId, null, 'billing.us_plus_changed', { provider: 'stripe', status });
      return { ok: true, received: event.type, recorded: Boolean(changed.rows[0]) };
    }
    return { ok: true, received: event.type || 'unknown', recorded: false };
  }

  async function cancelUsPlus(businessId, userId) {
    const sub = await usPlusRow(businessId);
    if (sub?.provider === 'play') return fail('MANAGE_IN_PLAY', { manageUrl: manageUrl(cfg.usPlus.productId, usPackage), hint: 'MyCA Plus was bought in Google Play. Cancel it there, under Subscriptions.' });
    if (!cardEnabled || !sub) return fail('NOT_SUBSCRIBED', { hint: 'MyCA Plus is not on for this return.' });
    const out = await stripe.cancelAtPeriodEnd(sub.subscriptionId);
    if (!out.ok) return fail('PROVIDER_UNAVAILABLE', { hint: 'Stripe could not be reached. Nothing changed; try again in a minute.' });
    await db.query('update us_plus_subscriptions set cancel_at_period_end = true, updated_at = now() where business_id = $1', [businessId]);
    await audit(businessId, userId, 'billing.us_plus_canceled', { provider: 'stripe' });
    return usPlus(businessId);
  }

  async function joinUsWaitlist(businessId, userId, { product } = {}) {
    if (!US_WAITLIST_PRODUCTS[product]) return fail('UNKNOWN_PRODUCT', { products: Object.keys(US_WAITLIST_PRODUCTS) });
    const saved = await db.query('insert into us_waitlist (business_id, product, created_by) values ($1, $2, $3) on conflict do nothing returning product', [businessId, product, userId]);
    if (saved.rows.length) await audit(businessId, userId, 'us.waitlist_joined', { product });
    return { ok: true, product, title: US_WAITLIST_PRODUCTS[product], joined: true };
  }

  async function audit(businessId, userId, action, metadata) {
    await db.query(`insert into audit_log (business_id, user_id, request_id, action, metadata) values ($1, $2, '', $3, $4::jsonb)`, [businessId, userId, action, JSON.stringify(metadata)]);
  }

  return {
    enabled,
    plans: () => ({
      ok: true,
      enabled,
      store: 'play',
      packageName: cfg.packageName,
      trialDays: TRIAL_DAYS,
      currency: 'INR',
      plans: PAID.map((id) => PLANS[id]).map((plan) => ({ ...plan, monthlyRupees: cfg.prices[plan.id] ?? plan.monthlyRupees, productId: cfg.productIds[plan.id] || '', buyable: enabled && Boolean(cfg.productIds[plan.id]) })),
      ...offers(),
    }),
    entitlement,
    usEnforced,
    usFilingOpen: () => usFilingOpen() === true,
    cardEnabled,
    usReturn,
    usFilingAllowed,
    verifyUsReturn,
    usCheckout,
    usCheckoutConfirm,
    stripeWebhook,
    usPlus,
    usPlusAllows,
    verifyUsPlus,
    cancelUsPlus,
    joinUsWaitlist,
    allows,
    withinLimit,

    async verify(businessId, userId, { productId, purchaseToken } = {}) {
      if (!enabled) return fail('BILLING_NOT_CONFIGURED', { hint: 'The operator has not set up Google Play subscriptions yet.' });
      const token = String(purchaseToken || '');
      if (!planOfProduct(productId) || !token || token.length > 2000) return fail('UNKNOWN_PLAN', { products: PAID.map((p) => cfg.productIds[p]).filter(Boolean) });
      const holder = await ownerOfToken(token);
      if (holder && holder !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play subscription already pays for another business.' });
      let found;
      try {
        found = await lookup(token);
      } catch (error) {
        log({ billing: 'play_auth_failed', status: error.status || 0 });
        return fail('PROVIDER_UNAVAILABLE', { hint: 'Google Play could not be reached. Your purchase is safe; open Plan and billing again in a minute.' });
      }
      if (!found.ok) return fail('PURCHASE_NOT_FOUND', { status: found.status, hint: 'Google Play does not know this purchase.' });
      if (!found.plan || found.productId !== productId) return fail('PURCHASE_PRODUCT_MISMATCH');
      if (found.accountId && found.accountId !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play subscription was bought for another business.' });
      await save(businessId, userId, token, found);
      await acknowledge(found, token);
      await audit(businessId, userId, 'billing.subscribe', { provider: 'play', plan: found.plan, status: found.status, testPurchase: found.testPurchase });
      return { ok: true, plan: found.plan, status: found.status, testPurchase: found.testPurchase, entitlement: await entitlement(businessId) };
    },

    async refreshDue() {
      const summary = { checked: 0, changed: 0, failed: 0 };
      if (!enabled) return summary;
      const at = now();
      const due = await db.query(
        `select business_id as "businessId", provider_subscription_id as "token", status, current_end as "currentEnd"
           from subscriptions
          where provider = 'play' and status = any($1::text[]) and current_end is not null and current_end < $2 and current_end > $3
          order by current_end limit $4`,
        [[...LIVE_STATUSES], new Date(at + RENEW_AHEAD_DAYS * DAY_MS), new Date(at - RENEW_LOOKBACK_DAYS * DAY_MS), RENEW_BATCH],
      );
      for (const sub of due.rows) {
        summary.checked += 1;
        let found;
        try {
          found = await lookup(sub.token);
        } catch (error) {
          summary.failed += 1;
          log({ billing: 'renewal_check_failed', businessId: sub.businessId, status: error.status || 0 });
          continue;
        }
        if (!found.ok || !found.plan) {
          summary.failed += 1;
          log({ billing: 'renewal_lookup_failed', businessId: sub.businessId, status: found.status || 0 });
          continue;
        }
        const before = `${sub.status}|${sub.currentEnd ? new Date(sub.currentEnd).getTime() : 0}`;
        const after = `${found.status}|${found.currentEnd ? found.currentEnd.getTime() : 0}`;
        await save(sub.businessId, null, sub.token, found);
        await acknowledge(found, sub.token);
        if (before !== after) {
          summary.changed += 1;
          await audit(sub.businessId, null, 'billing.renewal_check', { provider: 'play', status: found.status, plan: found.plan });
        }
      }
      return summary;
    },

    async notify(rawBody, givenToken, { pushVerified = false } = {}) {
      if (!enabled || (!cfg.notifyToken && !pushVerified)) return { ok: false, statusCode: 404, error: 'NOT_FOUND' };
      if (!pushVerified && !notifyTokenMatches(cfg.notifyToken, givenToken)) return { ok: false, statusCode: 401, error: 'BAD_TOKEN' };
      let message;
      let event;
      try {
        message = JSON.parse(rawBody.toString('utf8')).message || {};
        event = JSON.parse(Buffer.from(String(message.data || ''), 'base64').toString('utf8'));
      } catch {
        return { ok: true, ignored: true };
      }
      if (event.packageName !== cfg.packageName || !event.subscriptionNotification?.purchaseToken) return { ok: true, ignored: true };
      const token = String(event.subscriptionNotification.purchaseToken);
      let found;
      try {
        found = await lookup(token);
      } catch (error) {
        log({ billing: 'play_auth_failed', status: error.status || 0 });
        return { ok: false, statusCode: 503, error: 'PROVIDER_UNAVAILABLE' };
      }
      if (!found.ok) {
        log({ billing: 'notify_lookup_failed', status: found.status });
        return found.status >= 500 ? { ok: false, statusCode: 503, error: 'PROVIDER_UNAVAILABLE' } : { ok: true, unknown: true };
      }
      let businessId = (await ownerOfToken(token)) || (await ownerOfToken(found.linkedPurchaseToken));
      if (!businessId && UUID.test(found.accountId)) {
        const exists = await db.query('select id from businesses where id = $1', [found.accountId]);
        if (exists.rows.length) businessId = found.accountId;
      }
      if (!businessId || !found.plan) {
        log({ billing: 'notify_unknown_purchase' });
        return { ok: true, unknown: true };
      }
      await save(businessId, null, token, found);
      await acknowledge(found, token);
      await db.query("insert into billing_events (provider, event_id) values ('play', $1) on conflict do nothing", [String(message.messageId || message.message_id || `${token.slice(0, 40)}:${event.eventTimeMillis || ''}`).slice(0, 200)]);
      await audit(businessId, null, 'billing.event', { provider: 'play', notificationType: Number(event.subscriptionNotification.notificationType) || 0, status: found.status, plan: found.plan });
      return { ok: true };
    },
  };
}
