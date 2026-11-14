const PLAY_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';
const DAY_MS = 24 * 60 * 60 * 1000;

export function createPlayFake({ now = () => Date.now(), packages = [] } = {}) {
  const purchases = new Map();
  const calls = [];
  const known = new Set(packages);
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  function buy(packageName, productId, { token = `sandbox-${packageName}-${purchases.size + 1}`, state = 'ACTIVE', days = 30, accountId = '', linkedPurchaseToken = '' } = {}) {
    known.add(packageName);
    purchases.set(`${packageName}|${token}`, {
      subscriptionState: `SUBSCRIPTION_STATE_${state}`,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      lineItems: [{ productId, expiryTime: new Date(now() + days * DAY_MS).toISOString() }],
      ...(accountId ? { externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId } } : {}),
      ...(linkedPurchaseToken ? { linkedPurchaseToken } : {}),
      testPurchase: {},
    });
    return token;
  }

  function purchase(packageName, token) {
    return purchases.get(`${packageName}|${token}`) || null;
  }

  async function handle(url, init = {}) {
    const text = String(url);
    const method = init.method || 'GET';
    calls.push({ url: text, method });
    if (text === 'https://oauth2.googleapis.com/token' || text.startsWith('http://metadata.google.internal/')) return json(200, { access_token: 'ya29.sandbox', expires_in: 3600 });
    if (!text.startsWith(PLAY_BASE)) return json(404, { error: { message: 'not faked in the sandbox' } });
    const [packagePart, ...rest] = text.slice(PLAY_BASE.length).split('/purchases/');
    const packageName = decodeURIComponent(packagePart);
    if (!known.has(packageName)) return json(404, { error: { message: 'unknown package' } });
    const path = rest.join('/purchases/');
    const lookup = path.match(/^subscriptionsv2\/tokens\/([^/]+)$/);
    if (lookup && method === 'GET') {
      const found = purchase(packageName, decodeURIComponent(lookup[1]));
      return found ? json(200, found) : json(404, { error: { message: 'not found' } });
    }
    const ack = path.match(/^subscriptions\/([^/]+)\/tokens\/([^/:]+):acknowledge$/);
    if (ack && method === 'POST') {
      const found = purchase(packageName, decodeURIComponent(ack[2]));
      if (!found) return json(404, { error: { message: 'not found' } });
      found.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
      return json(200, {});
    }
    return json(404, { error: { message: 'not faked in the sandbox' } });
  }

  return { buy, purchase, calls, handle };
}
