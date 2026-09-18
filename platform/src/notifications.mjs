import { loadEnvFile, liveCallsEnabled } from './runtime-config.mjs';

export const CHANNELS = ['email', 'whatsapp'];

function money(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildInvoiceShare(state, invoiceId, { channel = 'whatsapp', to = '' } = {}) {
  const invoice = [...(state.invoices || []), ...(state.purchases || [])].find((i) => i.id === invoiceId);
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND' };
  const channelKey = String(channel || '').toLowerCase();
  if (!CHANNELS.includes(channelKey)) return { ok: false, error: 'UNKNOWN_CHANNEL' };
  const company = state.company || {};
  const gst = (invoice.cgst || 0) + (invoice.sgst || 0) + (invoice.igst || 0);
  const subject = `Tax invoice ${invoice.id} from ${company.name || 'us'}`;
  const body = [
    `${company.name || ''}${company.gstin ? ` (GSTIN ${company.gstin})` : ''}`.trim(),
    `Invoice ${invoice.id} dated ${invoice.date}`,
    `Amount INR ${money(invoice.total)} (taxable ${money(invoice.taxable)}, GST ${money(gst)})`,
    company.address || '',
  ].filter(Boolean).join('\n');
  return { ok: true, draft: { invoiceId: invoice.id, channel: channelKey, to: String(to || ''), subject, body } };
}

export function shareLink(draft) {
  const text = encodeURIComponent(`${draft.subject}\n\n${draft.body}`);
  if (draft.channel === 'whatsapp') return `https://wa.me/${String(draft.to || '').replace(/\D/g, '')}?text=${text}`;
  if (draft.channel === 'email') return `mailto:${encodeURIComponent(draft.to || '')}?subject=${encodeURIComponent(draft.subject)}&body=${text}`;
  return '';
}

export function ensureOutbox(state) {
  state.outbox = Array.isArray(state.outbox) ? state.outbox : [];
  state.outboxSeq = Number(state.outboxSeq || state.outbox.length || 0);
  return state.outbox;
}

export function listOutbox(state) {
  ensureOutbox(state);
  return { ok: true, messages: state.outbox };
}

export function queueNotification(state, draft, { createdBy = 'ca' } = {}) {
  if (!draft || !CHANNELS.includes(String(draft.channel))) return { ok: false, error: 'UNKNOWN_CHANNEL' };
  ensureOutbox(state);
  const message = {
    id: `MSG-${String(++state.outboxSeq).padStart(6, '0')}`,
    channel: draft.channel,
    to: String(draft.to || ''),
    subject: String(draft.subject || ''),
    body: String(draft.body || ''),
    invoiceId: String(draft.invoiceId || ''),
    status: 'queued',
    createdAt: new Date().toISOString(),
    sentAt: '',
    providerId: '',
    error: '',
    createdBy: String(createdBy || 'ca'),
  };
  state.outbox.push(message);
  return { ok: true, message };
}

async function deliverWhatsApp(env, message, fetchFn) {
  const phoneId = env.MYCA_WHATSAPP_PHONE_NUMBER_ID;
  const token = env.MYCA_WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return { ok: false, error: 'WHATSAPP_NOT_CONFIGURED' };
  const to = String(message.to || '').replace(/\D/g, '');
  if (!to) return { ok: false, error: 'RECIPIENT_REQUIRED' };
  const res = await fetchFn(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: `${message.subject}\n\n${message.body}` },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP_${res.status}` };
  return { ok: true, providerId: data?.messages?.[0]?.id || '' };
}

async function deliverEmail(env, message, fetchFn) {
  const relay = env.MYCA_EMAIL_RELAY_URL;
  const from = env.MYCA_EMAIL_FROM;
  if (!relay || !from) return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  if (!message.to) return { ok: false, error: 'RECIPIENT_REQUIRED' };
  const headers = { 'content-type': 'application/json' };
  if (env.MYCA_EMAIL_RELAY_TOKEN) headers.authorization = `Bearer ${env.MYCA_EMAIL_RELAY_TOKEN}`;
  const res = await fetchFn(relay, {
    method: 'POST',
    headers,
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || `HTTP_${res.status}` };
  return { ok: true, providerId: data?.id || '' };
}

export async function sendNotification(state, messageId, deps = {}) {
  ensureOutbox(state);
  const message = state.outbox.find((m) => m.id === messageId);
  if (!message) return { ok: false, error: 'MESSAGE_NOT_FOUND' };
  if (message.status === 'sent') return { ok: false, error: 'ALREADY_SENT' };
  const live = deps.allowLive == null ? liveCallsEnabled() : Boolean(deps.allowLive);
  if (!live) {
    return { ok: false, error: 'LIVE_CALLS_DISABLED', hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 to send notifications.' };
  }
  const env = deps.env || loadEnvFile();
  const fetchFn = deps.fetchFn || fetch;
  const result = message.channel === 'whatsapp'
    ? await deliverWhatsApp(env, message, fetchFn)
    : await deliverEmail(env, message, fetchFn);
  if (result.ok) {
    message.status = 'sent';
    message.sentAt = new Date().toISOString();
    message.providerId = result.providerId || '';
  } else {
    message.status = 'failed';
    message.error = result.error;
  }
  return { ok: result.ok, message, error: result.error };
}
