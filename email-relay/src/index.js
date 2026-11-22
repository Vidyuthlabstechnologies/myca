import { parseMail, addressOf, base64Of } from './mime.js';

const MAX_BYTES = 1024 * 1024;
const MAX_MAIL_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const MAX_RECIPIENTS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINE_BREAKS = /[\r\n]+/g;
const encoder = new TextEncoder();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function singleLine(value) {
  return String(value || '').replace(LINE_BREAKS, ' ').trim();
}

function htmlFromText(text) {
  return `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function tokenMatches(presented, expected) {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function inboundPayload(mail, { maxAttachmentBytes = MAX_ATTACHMENT_BYTES } = {}) {
  const attachments = [];
  const dropped = [];
  for (const part of mail.attachments) {
    if (attachments.length >= MAX_ATTACHMENTS) break;
    if (part.bytes.length > maxAttachmentBytes) {
      dropped.push(part.name);
      continue;
    }
    attachments.push({ name: part.name, mime: part.mime, base64: base64Of(part.bytes) });
  }
  return {
    to: addressOf(mail.to),
    from: addressOf(mail.from),
    subject: singleLine(mail.subject).slice(0, 200),
    text: String(mail.text || '').slice(0, 20000),
    attachments,
    dropped,
  };
}

async function readAll(stream, limit) {
  const chunks = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) throw new Error('MAIL_TOO_LARGE');
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(out);
}

export default {
  async email(message, env) {
    const apiUrl = String(env.MYCA_API_URL || '').replace(/\/+$/, '');
    const token = String(env.INBOUND_RELAY_TOKEN || '');
    if (!apiUrl || token.length < 32) {
      message.setReject('MyCA inbound mail is not configured on this relay');
      return;
    }
    let raw;
    try {
      raw = await readAll(message.raw, MAX_MAIL_BYTES);
    } catch {
      message.setReject('Message too large');
      return;
    }
    let payload;
    try {
      payload = inboundPayload(parseMail(raw));
    } catch {
      message.setReject('Message could not be read');
      return;
    }
    if (!payload.to) payload.to = String(message.to || '').toLowerCase();
    if (!payload.from) payload.from = String(message.from || '').toLowerCase();
    const doFetch = env.FETCH || fetch;
    let res;
    try {
      res = await doFetch(`${apiUrl}/v1/inbound/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-myca-relay-token': token },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      message.setReject(`MyCA could not be reached: ${String(err.message || err).slice(0, 80)}`);
      return;
    }
    if (res.status === 404) {
      message.setReject('No MyCA business is listening at this address');
      return;
    }
    if (!res.ok) message.setReject(`MyCA refused the message (${res.status})`);
  },

  async fetch(request, env) {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!env.RELAY_TOKEN) {
      return json({ ok: false, error: 'RELAY_NOT_CONFIGURED', hint: 'Run: wrangler secret put RELAY_TOKEN' }, 503);
    }
    if (!(await tokenMatches(request.headers.get('authorization') || '', `Bearer ${env.RELAY_TOKEN}`))) {
      return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }
    const allowedDomain = String(env.ALLOWED_FROM_DOMAIN || '').trim().toLowerCase();
    if (!allowedDomain) {
      return json({ ok: false, error: 'FROM_DOMAIN_NOT_CONFIGURED', hint: 'Set vars.ALLOWED_FROM_DOMAIN in wrangler.jsonc to your sending domain' }, 503);
    }

    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, 413);

    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, 400);
    }

    const from = String(body.from || '').trim();
    const to = toList(body.to);
    const subject = singleLine(body.subject);
    const fromName = singleLine(body.fromName) || 'MyCA';
    const text = String(body.text || '');
    const html = body.html ? String(body.html) : htmlFromText(text);

    if (!EMAIL_RE.test(from)) return json({ ok: false, error: 'INVALID_FROM' }, 400);
    if (!to.length || !to.every((addr) => EMAIL_RE.test(addr))) return json({ ok: false, error: 'INVALID_TO' }, 400);
    if (to.length > MAX_RECIPIENTS) return json({ ok: false, error: 'TOO_MANY_RECIPIENTS', max: MAX_RECIPIENTS }, 400);
    if (!subject) return json({ ok: false, error: 'SUBJECT_REQUIRED' }, 400);
    if (from.split('@')[1].toLowerCase() !== allowedDomain) {
      return json({ ok: false, error: 'FROM_DOMAIN_NOT_ALLOWED', allowed: allowedDomain }, 403);
    }

    try {
      const result = await env.EMAIL.send({
        to,
        from: { email: from, name: fromName },
        subject,
        text: text || subject,
        html,
      });
      const id = result?.messageId || null;
      return json({ ok: true, id, messageId: id });
    } catch (err) {
      return json({ ok: false, error: String(err.code || err.message || err) }, 502);
    }
  },
};
