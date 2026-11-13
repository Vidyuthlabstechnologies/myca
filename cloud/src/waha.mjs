import { createHmac, timingSafeEqual } from 'node:crypto';

const TIMEOUT_MS = 15000;
const REPLY_LIMIT = 4000;

function masked(phone) {
  const digits = String(phone || '');
  return `${digits.slice(0, 3)}…${digits.slice(-2)}`;
}

function trimBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function wahaChatId(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `${digits}@c.us` : '';
}

export function wahaPhone(chatId) {
  const match = /^(\d{8,15})@(?:c\.us|s\.whatsapp\.net)$/.exec(String(chatId || '').trim());
  return match ? `+${match[1]}` : '';
}

async function call(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`whatsapp gateway answered ${res.status}: ${text.slice(0, 200)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function wahaConfigFromEnv(env = process.env) {
  const value = (name) => {
    const v = String(env[name] || '').trim();
    return v === 'unset' ? '' : v;
  };
  return {
    baseUrl: trimBase(value('MYCA_WAHA_URL')),
    apiKey: value('MYCA_WAHA_API_KEY'),
    session: value('MYCA_WAHA_SESSION') || 'default',
    webhookSecret: value('MYCA_WAHA_WEBHOOK_SECRET'),
  };
}

export function createWahaSender({ baseUrl, apiKey = '', session = 'default', fetchImpl = fetch, log = () => {} }) {
  const base = trimBase(baseUrl);
  if (!/^https?:\/\//.test(base)) throw new Error('the WhatsApp gateway needs MYCA_WAHA_URL (http or https)');
  const headers = { 'content-type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) };
  async function sendText(phone, text) {
    const chatId = wahaChatId(phone);
    if (!chatId) throw new Error('whatsapp gateway: no phone number');
    await call(fetchImpl, `${base}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session, chatId, text: String(text).slice(0, REPLY_LIMIT), linkPreview: false }),
    });
    log({ whatsapp: 'sent', provider: 'waha', to: masked(phone) });
  }
  async function phoneOfLid(lid) {
    try {
      const text = await call(fetchImpl, `${base}/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(lid)}`, { method: 'GET', headers });
      const body = JSON.parse(text);
      return wahaPhone(body?.pn || body?.phoneNumber || '');
    } catch (err) {
      log({ whatsapp: 'lid-lookup-failed', provider: 'waha', error: String(err?.message || err) });
      return '';
    }
  }
  return {
    provider: 'waha',
    send: (phone, code) => sendText(phone, `${code} is your MyCA sign-in code. It expires in five minutes. Do not share it with anyone.`),
    sendText,
    phoneOfLid,
  };
}

export function wahaSignatureMatches(secret, rawBody, header, algorithmHeader = 'sha512') {
  if (!secret) return false;
  const algorithm = String(algorithmHeader || 'sha512').trim().toLowerCase();
  if (algorithm !== 'sha512') return false;
  const given = String(header || '').trim();
  if (!/^[0-9a-f]{128}$/i.test(given)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
}
