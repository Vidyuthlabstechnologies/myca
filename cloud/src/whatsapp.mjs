import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from './auth.mjs';
import { engineRole } from './businesses.mjs';
import { READ_ONLY_REPLY } from './billing.mjs';
import { chatText } from './chat-text.mjs';
import { wahaConfigFromEnv, wahaPhone, wahaSignatureMatches, withoutNumbers } from './waha.mjs';

const GRAPH_VERSION = 'v21.0';
const MAX_TEXT = 2000;
const REPLY_LIMIT = 4000;
const TOO_MANY_REPLY = 'That is a lot of messages in one hour, so I am pausing here. Write again in a little while, or use the app.';
const TIMEOUT_MS = 15000;

function masked(phone) {
  const digits = String(phone || '');
  return `${digits.slice(0, 3)}…${digits.slice(-2)}`;
}

export function createWhatsAppSender({ phoneNumberId, accessToken, fetchImpl = fetch, log = () => {} }) {
  if (!phoneNumberId || !accessToken) throw new Error('whatsapp needs MYCA_WHATSAPP_PHONE_NUMBER_ID and MYCA_WHATSAPP_ACCESS_TOKEN');
  return {
    provider: 'whatsapp',
    async sendText(phone, text) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`, {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(phone).replace(/^\+/, ''), type: 'text', text: { preview_url: false, body: String(text).slice(0, REPLY_LIMIT) } }),
          signal: controller.signal,
        });
        const body = await res.text();
        if (!res.ok) throw new Error(`whatsapp answered ${res.status}: ${withoutNumbers(body.slice(0, 200))}`);
        log({ whatsapp: 'sent', to: masked(phone) });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function whatsAppConfigFromEnv(env = process.env) {
  const value = (name) => String(env[name] || '').trim();
  const unset = (v) => !v || v === 'unset';
  return {
    verifyToken: unset(value('MYCA_WHATSAPP_VERIFY_TOKEN')) ? '' : value('MYCA_WHATSAPP_VERIFY_TOKEN'),
    appSecret: unset(value('MYCA_WHATSAPP_APP_SECRET')) ? '' : value('MYCA_WHATSAPP_APP_SECRET'),
    phoneNumberId: unset(value('MYCA_WHATSAPP_PHONE_NUMBER_ID')) ? '' : value('MYCA_WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: unset(value('MYCA_WHATSAPP_ACCESS_TOKEN')) ? '' : value('MYCA_WHATSAPP_ACCESS_TOKEN'),
    provider: whatsAppProvider(env),
    waha: wahaConfigFromEnv(env),
  };
}

export function whatsAppProvider(env = process.env) {
  const declared = String(env.MYCA_WHATSAPP_PROVIDER || '').trim().toLowerCase();
  if (declared === 'waha' || declared === 'meta') return declared;
  if (declared && declared !== 'unset') throw new Error(`unknown MYCA_WHATSAPP_PROVIDER "${declared}": use waha or meta`);
  return String(env.MYCA_WAHA_URL || '').trim() && String(env.MYCA_WAHA_URL || '').trim() !== 'unset' ? 'waha' : 'meta';
}

export function signatureMatches(appSecret, rawBody, header) {
  if (!appSecret) return false;
  const given = String(header || '').replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
}

export function messageKey(messageId) {
  return createHash('sha256').update(String(messageId)).digest('hex');
}

export function createWhatsApp({ db, withBooks, billing = null, withSharedBooks = null, syncOf = null, rateLimits = null, config = {}, sender = null, now = () => Date.now(), log = () => {} }) {
  const metaEnabled = config.provider !== 'waha' && Boolean(config.verifyToken) && Boolean(config.appSecret) && Boolean(sender);
  const wahaEnabled = config.provider === 'waha' && Boolean(config.waha?.webhookSecret) && Boolean(sender);
  const enabled = metaEnabled || wahaEnabled;

  function verify(query) {
    if (!config.verifyToken) return { ok: false, statusCode: 404, error: 'WHATSAPP_NOT_CONFIGURED' };
    if (query.get('hub.mode') !== 'subscribe' || query.get('hub.verify_token') !== config.verifyToken) return { ok: false, statusCode: 403, error: 'VERIFY_TOKEN_MISMATCH' };
    return { ok: true, text: query.get('hub.challenge') || '' };
  }

  async function businessesOf(q, phone) {
    const rows = await q(
      `select b.id, b.name, m.role, u.id as "userId", u.name as "userName" from users u
         join memberships m on m.user_id = u.id join businesses b on b.id = m.business_id
        where u.phone = $1 and u.deleted_at is null and b.deletion_requested_at is null order by b.created_at`,
      [phone],
    );
    return rows.rows;
  }

  async function linked(q, phone) {
    const row = await q('select business_id as "businessId" from whatsapp_links where phone = $1', [phone]);
    return row.rows[0]?.businessId || '';
  }

  async function remember(q, phone, businessId) {
    await q('insert into whatsapp_links (phone, business_id, updated_at) values ($1, $2, $3) on conflict (phone) do update set business_id = excluded.business_id, updated_at = excluded.updated_at', [phone, businessId, new Date(now()).toISOString()]);
  }

  async function seen(q, messageId) {
    const inserted = await q('insert into whatsapp_messages (id, received_at) values ($1, $2) on conflict (id) do nothing returning id', [messageKey(messageId), new Date(now()).toISOString()]);
    return inserted.rowCount === 0;
  }

  async function reply(phone, text) {
    if (!sender) return;
    try { await sender.sendText(phone, text); } catch (err) { log({ whatsapp: 'reply-failed', to: masked(phone), error: String(err?.message || err) }); }
  }

  async function handleText(requestId, phone, messageId, text) {
    const answer = await db.tx(async (q) => {
      if (await seen(q, messageId)) return { duplicate: true };
      const businesses = await businessesOf(q, phone);
      if (!businesses.length) return { stranger: true, text: 'This number is not a member of any MyCA business. Sign in on the app with it first.' };
      const pick = /^use\s+(\d{1,2})\s*$/i.exec(text.trim());
      let chosenId = await linked(q, phone);
      if (/^(?:switch|switch\s+business|businesses|which\s+business)\s*\??$/i.test(text.trim())) {
        return { text: businesses.length === 1 ? `You have one business here: ${businesses[0].name}.` : `Which business?\n${businesses.map((b, i) => `${i + 1}. ${b.name}`).join('\n')}\nReply "use 1", "use 2" and so on.` };
      }
      if (pick) {
        const chosen = businesses[Number(pick[1]) - 1];
        if (!chosen) return { text: `Say "use 1" to "use ${businesses.length}".` };
        await remember(q, phone, chosen.id);
        return { text: `Using ${chosen.name}. Ask away.` };
      }
      if (!chosenId || !businesses.some((b) => b.id === chosenId)) {
        if (businesses.length === 1) {
          chosenId = businesses[0].id;
          await remember(q, phone, chosenId);
        } else {
          return { text: `Which business?\n${businesses.map((b, i) => `${i + 1}. ${b.name}`).join('\n')}\nReply "use 1", "use 2" and so on.` };
        }
      }
      const business = businesses.find((b) => b.id === chosenId);
      const sync = business.role === 'accountant' && syncOf ? await syncOf(q, business.id) : null;
      return { businessId: business.id, business: business.name, shared: Boolean(sync && sync.mode !== 'live'), user: { userId: business.userId, role: business.role, name: business.userName } };
    });
    if (answer.duplicate) return { ok: true, duplicate: true };
    if (answer.text) {
      const allowed = rateLimits ? (await rateLimits.take(answer.stranger ? 'whatsappStranger' : 'whatsappMenu', phone)).ok : true;
      if (allowed) await reply(phone, answer.text);
      return allowed ? { ok: true, replied: true } : { ok: true, replied: false, rateLimited: true };
    }
    const taken = rateLimits ? await rateLimits.take('ask', answer.user.userId) : { ok: true };
    if (!taken.ok) {
      const told = (await rateLimits.take('askPaused', answer.user.userId)).ok;
      if (told) await reply(phone, TOO_MANY_REPLY);
      return { ok: true, replied: told, rateLimited: true };
    }
    const actor = { actor: { userId: answer.user.userId, role: engineRole(answer.user.role), name: answer.user.name || answer.user.userId } };
    const asked = chatText(text);
    const run = answer.shared && withSharedBooks
      ? withSharedBooks(answer.businessId, { requestId, userId: answer.user.userId, deviceId: null }, async (session) => {
        const got = await session.chat(asked, actor);
        if (!got.preview && !got.awaitingConfirmation) return got;
        return { reply: 'These books are shared with you as they stood when the owner last shared them, so nothing can be posted from here. Ask the owner to make the change.', tools: [] };
      })
      : null;
    const allowed = run || !billing ? { ok: true } : await billing.allows(answer.businessId, 'whatsapp');
    if (!allowed.ok) {
      const lapsed = allowed.plan === 'lapsed';
      await reply(phone, lapsed ? READ_ONLY_REPLY : 'Chat on WhatsApp comes with the Pro and CA firm plans. The owner can upgrade under Plan and billing in the app.');
      return { ok: true, replied: true, planRequired: true };
    }
    const out = await (run || withBooks(answer.businessId, { requestId, userId: answer.user.userId, deviceId: null }, (session) => session.chat(asked, actor)));
    const spoken = String(out?.reply || 'I could not read that.').slice(0, REPLY_LIMIT);
    await reply(phone, spoken);
    return { ok: true, replied: true, posted: Boolean(out?.posted), awaitingConfirmation: Boolean(out?.awaitingConfirmation) };
  }

  async function receive(requestId, rawBody, signatureHeader) {
    if (!metaEnabled) return { ok: false, statusCode: 404, error: 'WHATSAPP_NOT_CONFIGURED' };
    if (!signatureMatches(config.appSecret, rawBody, signatureHeader)) return { ok: false, statusCode: 401, error: 'BAD_SIGNATURE' };
    let body;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { return { ok: false, statusCode: 400, error: 'BAD_JSON' }; }
    const handled = [];
    for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        for (const message of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
          const phone = normalizePhone(`+${String(message.from || '').replace(/^\+/, '')}`);
          const messageId = String(message.id || '');
          if (!phone || !messageId) { handled.push({ ignored: 'no sender' }); continue; }
          if (message.type !== 'text' || !message.text?.body) {
            await reply(phone, 'Send a text message; photos of bills are read from the app.');
            handled.push({ ignored: message.type || 'unknown' });
            continue;
          }
          handled.push(await handleText(requestId, phone, messageId, String(message.text.body).slice(0, MAX_TEXT)));
        }
      }
    }
    return { ok: true, handled: handled.length, results: handled };
  }

  async function senderPhone(payload) {
    const direct = wahaPhone(payload?.from);
    if (direct) return direct;
    const alt = wahaPhone(payload?._data?.key?.remoteJidAlt || payload?._data?.key?.senderPn || payload?._data?.from || '');
    if (alt) return alt;
    if (/@lid$/.test(String(payload?.from || '')) && typeof sender?.phoneOfLid === 'function') return normalizePhone(await sender.phoneOfLid(String(payload.from)));
    return '';
  }

  async function receiveWaha(requestId, rawBody, headers = {}) {
    if (!wahaEnabled) return { ok: false, statusCode: 404, error: 'WHATSAPP_NOT_CONFIGURED' };
    if (!wahaSignatureMatches(config.waha.webhookSecret, rawBody, headers['x-webhook-hmac'], headers['x-webhook-hmac-algorithm'])) return { ok: false, statusCode: 401, error: 'BAD_SIGNATURE' };
    let body;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { return { ok: false, statusCode: 400, error: 'BAD_JSON' }; }
    const events = Array.isArray(body) ? body : [body];
    const handled = [];
    for (const event of events) {
      const payload = event?.payload || {};
      if (event?.event !== 'message') { handled.push({ ignored: String(event?.event || 'unknown') }); continue; }
      if (config.waha.session && event.session && event.session !== config.waha.session) { handled.push({ ignored: 'other session' }); continue; }
      if (payload.fromMe === true) { handled.push({ ignored: 'own message' }); continue; }
      if (/@(?:g\.us|newsletter|broadcast)$/.test(String(payload.from || ''))) { handled.push({ ignored: 'group' }); continue; }
      const phone = normalizePhone(await senderPhone(payload));
      const messageId = String(payload.id || '');
      if (!phone || !messageId) { handled.push({ ignored: 'no sender' }); continue; }
      const text = typeof payload.body === 'string' ? payload.body.trim() : '';
      if (!text || payload.hasMedia === true) {
        await reply(phone, 'Send a text message; photos of bills are read from the app.');
        handled.push({ ignored: payload.hasMedia ? 'media' : 'empty' });
        continue;
      }
      handled.push(await handleText(requestId, phone, `waha:${messageId}`, text.slice(0, MAX_TEXT)));
    }
    return { ok: true, handled: handled.length, results: handled };
  }

  return { enabled, provider: wahaEnabled ? 'waha' : metaEnabled ? 'meta' : '', verify, receive, receiveWaha };
}
