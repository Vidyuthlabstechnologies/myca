import { createHmac, timingSafeEqual } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;
const LIVE_STATUSES = new Set(['authenticated', 'active', 'pending']);
const RAZORPAY_API = 'https://api.razorpay.com/v1';

export const PLANS = Object.freeze({
  free: Object.freeze({ id: 'free', title: 'Free', monthlyRupees: 0, limits: { invoicesPerMonth: 30, members: 1 }, features: ['books', 'gst-returns', 'chat'] }),
  pro: Object.freeze({ id: 'pro', title: 'Pro', monthlyRupees: 499, limits: { invoicesPerMonth: null, members: 5 }, features: ['books', 'gst-returns', 'chat', 'einvoice', 'connectors', 'whatsapp', 'team'] }),
  firm: Object.freeze({ id: 'firm', title: 'CA firm', monthlyRupees: 1499, limits: { invoicesPerMonth: null, members: 25 }, features: ['books', 'gst-returns', 'chat', 'einvoice', 'connectors', 'whatsapp', 'team', 'priority-support'] }),
});

const PAID = ['pro', 'firm'];

function unset(value) {
  const text = String(value || '').trim();
  return text === 'unset' ? '' : text;
}

export function billingConfigFromEnv(env = process.env) {
  const prices = Object.fromEntries(String(env.MYCA_PLAN_PRICES || '').split(',').map((pair) => pair.split('=').map((part) => part.trim())).filter(([plan, price]) => PAID.includes(plan) && /^[0-9]{1,6}$/.test(price || '')).map(([plan, price]) => [plan, Number(price)]));
  return {
    keyId: unset(env.MYCA_RAZORPAY_KEY_ID),
    keySecret: unset(env.MYCA_RAZORPAY_KEY_SECRET),
    webhookSecret: unset(env.MYCA_RAZORPAY_WEBHOOK_SECRET),
    planIds: { pro: unset(env.MYCA_RAZORPAY_PLAN_PRO), firm: unset(env.MYCA_RAZORPAY_PLAN_FIRM) },
    prices,
    manageUrl: unset(env.MYCA_BILLING_MANAGE_URL),
  };
}

export function razorpaySignatureMatches(secret, rawBody, header) {
  if (!secret || typeof header !== 'string' || !/^[0-9a-f]{64}$/.test(header)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(header, 'hex'));
}

function planList(config) {
  return Object.values(PLANS).map((plan) => ({ ...plan, monthlyRupees: config.prices[plan.id] ?? plan.monthlyRupees, buyable: plan.id !== 'free' && Boolean(config.planIds[plan.id]) }));
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function createBilling({ db, config = {}, now = () => Date.now(), fetchImpl = (...args) => globalThis.fetch(...args), log = () => {} }) {
  const cfg = { keyId: '', keySecret: '', webhookSecret: '', planIds: {}, prices: {}, manageUrl: '', ...config };
  const enabled = Boolean(cfg.keyId && cfg.keySecret && cfg.webhookSecret && (cfg.planIds.pro || cfg.planIds.firm));
  const testMode = cfg.keyId.startsWith('rzp_test_');

  async function razorpay(method, path, body) {
    const res = await fetchImpl(`${RAZORPAY_API}${path}`, {
      method,
      headers: { authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
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

  async function row(businessId) {
    const found = await db.query('select provider, provider_subscription_id as "subscriptionId", plan, status, current_end as "currentEnd", checkout_url as "checkoutUrl" from subscriptions where business_id = $1', [businessId]);
    return found.rows[0] || null;
  }

  async function entitlement(businessId) {
    const at = now();
    const business = await db.query('select created_at as "createdAt" from businesses where id = $1', [businessId]);
    const createdAt = business.rows[0] ? new Date(business.rows[0].createdAt).getTime() : at;
    const trialEndsAt = createdAt + TRIAL_DAYS * DAY_MS;
    const sub = await row(businessId);
    const paidUntil = sub?.currentEnd ? new Date(sub.currentEnd).getTime() + GRACE_DAYS * DAY_MS : 0;
    const paying = Boolean(sub && LIVE_STATUSES.has(sub.status) && PAID.includes(sub.plan) && (paidUntil === 0 ? sub.status !== 'pending' : paidUntil > at));
    const inTrial = !paying && at < trialEndsAt;
    const plan = paying ? sub.plan : inTrial ? 'pro' : 'free';
    return {
      ok: true,
      enforced: enabled,
      testMode,
      plan,
      planTitle: PLANS[plan].title,
      limits: PLANS[plan].limits,
      features: PLANS[plan].features,
      trial: inTrial ? { endsAt: new Date(trialEndsAt).toISOString(), daysLeft: Math.max(0, Math.ceil((trialEndsAt - at) / DAY_MS)) } : null,
      subscription: sub ? { provider: sub.provider, plan: sub.plan, status: sub.status, currentEnd: sub.currentEnd ? new Date(sub.currentEnd).toISOString() : null, checkoutUrl: sub.status === 'created' ? sub.checkoutUrl : '' } : null,
      manageUrl: cfg.manageUrl,
    };
  }

  async function allows(businessId, feature) {
    if (!enabled) return { ok: true };
    const got = await entitlement(businessId);
    if (got.features.includes(feature)) return { ok: true, entitlement: got };
    return fail('PLAN_REQUIRED', { feature, plan: got.plan, hint: `${PLANS.pro.title} or ${PLANS.firm.title} includes this. The owner can upgrade under Plan and billing.` });
  }

  async function withinLimit(businessId, limit, used) {
    if (!enabled) return { ok: true };
    const got = await entitlement(businessId);
    const cap = got.limits[limit];
    if (cap == null || used < cap) return { ok: true };
    return fail('PLAN_LIMIT_REACHED', { limit, cap, plan: got.plan, hint: `The ${got.planTitle} plan allows ${cap}. The owner can upgrade under Plan and billing.` });
  }

  return {
    enabled,
    testMode,
    plans: () => ({ ok: true, enabled, testMode, trialDays: TRIAL_DAYS, currency: 'INR', plans: planList(cfg) }),
    entitlement,
    allows,
    withinLimit,

    async subscribe(businessId, userId, { plan } = {}) {
      if (!enabled) return fail('BILLING_NOT_CONFIGURED', { hint: 'The operator has not set up Razorpay yet.' });
      const planId = cfg.planIds[plan];
      if (!PAID.includes(plan) || !planId) return fail('UNKNOWN_PLAN', { plans: PAID.filter((p) => cfg.planIds[p]) });
      const existing = await row(businessId);
      if (existing && existing.provider === 'razorpay' && LIVE_STATUSES.has(existing.status)) return fail('ALREADY_SUBSCRIBED', { plan: existing.plan, hint: 'Cancel the current plan first, or change it from the Razorpay link in your email.' });
      const out = await razorpay('POST', '/subscriptions', { plan_id: planId, total_count: 120, customer_notify: 1, notes: { businessId, plan } });
      if (!out.ok || !out.data.id) {
        log({ billing: 'subscribe_failed', status: out.status });
        return fail('PROVIDER_REFUSED', { status: out.status, hint: out.data?.error?.description || 'Razorpay did not create the subscription.' });
      }
      await db.query(
        `insert into subscriptions (business_id, provider, provider_subscription_id, plan, status, current_end, checkout_url, created_by, updated_at)
         values ($1, 'razorpay', $2, $3, $4, null, $5, $6, now())
         on conflict (business_id) do update set provider = excluded.provider, provider_subscription_id = excluded.provider_subscription_id, plan = excluded.plan, status = excluded.status, current_end = null, checkout_url = excluded.checkout_url, created_by = excluded.created_by, updated_at = now()`,
        [businessId, out.data.id, plan, String(out.data.status || 'created'), String(out.data.short_url || ''), userId],
      );
      await db.query(`insert into audit_log (business_id, user_id, request_id, action, metadata) values ($1, $2, '', 'billing.subscribe', $3::jsonb)`, [businessId, userId, JSON.stringify({ plan, provider: 'razorpay' })]);
      return { ok: true, plan, checkoutUrl: String(out.data.short_url || ''), status: String(out.data.status || 'created'), testMode };
    },

    async cancel(businessId, userId) {
      if (!enabled) return fail('BILLING_NOT_CONFIGURED');
      const existing = await row(businessId);
      if (!existing || existing.provider !== 'razorpay' || !LIVE_STATUSES.has(existing.status) && existing.status !== 'created') return fail('NO_SUBSCRIPTION');
      const out = await razorpay('POST', `/subscriptions/${encodeURIComponent(existing.subscriptionId)}/cancel`, { cancel_at_cycle_end: existing.status === 'active' ? 1 : 0 });
      if (!out.ok) return fail('PROVIDER_REFUSED', { status: out.status, hint: out.data?.error?.description || 'Razorpay did not cancel it.' });
      const status = String(out.data.status || 'cancelled');
      await db.query('update subscriptions set status = $2, updated_at = now() where business_id = $1', [businessId, status === 'active' ? 'active' : status]);
      await db.query(`insert into audit_log (business_id, user_id, request_id, action, metadata) values ($1, $2, '', 'billing.cancel', $3::jsonb)`, [businessId, userId, JSON.stringify({ plan: existing.plan, endsAtCycleEnd: status === 'active' })]);
      return { ok: true, status, endsAtCycleEnd: status === 'active' };
    },

    async webhook(rawBody, signature, eventId) {
      if (!enabled) return { ok: false, statusCode: 404, error: 'NOT_FOUND' };
      if (!razorpaySignatureMatches(cfg.webhookSecret, rawBody, signature)) return { ok: false, statusCode: 401, error: 'BAD_SIGNATURE' };
      let event;
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return { ok: false, statusCode: 400, error: 'BAD_JSON' };
      }
      const entity = event?.payload?.subscription?.entity;
      if (!String(event?.event || '').startsWith('subscription.') || !entity?.id) return { ok: true, ignored: true };
      const id = String(eventId || `${event.event}:${entity.id}:${event.created_at || ''}`).slice(0, 200);
      const fresh = await db.query("insert into billing_events (provider, event_id) values ('razorpay', $1) on conflict do nothing returning event_id", [id]);
      if (!fresh.rows.length) return { ok: true, duplicate: true };
      const currentEnd = Number(entity.current_end) > 0 ? new Date(Number(entity.current_end) * 1000) : null;
      const updated = await db.query(
        'update subscriptions set status = $2, current_end = coalesce($3, current_end), updated_at = now() where provider = $4 and provider_subscription_id = $1 returning business_id as "businessId", plan',
        [String(entity.id), String(entity.status || ''), currentEnd, 'razorpay'],
      );
      if (!updated.rows.length) {
        log({ billing: 'webhook_unknown_subscription' });
        return { ok: true, unknown: true };
      }
      const { businessId, plan } = updated.rows[0];
      await db.query(`insert into audit_log (business_id, request_id, action, metadata) values ($1, '', 'billing.event', $2::jsonb)`, [businessId, JSON.stringify({ event: String(event.event), status: String(entity.status || ''), plan })]);
      return { ok: true };
    },
  };
}
