const MAX_BYTES = 1024 * 1024;
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

export default {
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
