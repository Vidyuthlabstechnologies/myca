const MAX_BYTES = 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function htmlFromText(text) {
  return `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!env.RELAY_TOKEN) {
      return json({ ok: false, error: 'RELAY_NOT_CONFIGURED', hint: 'Run: wrangler secret put RELAY_TOKEN' }, 503);
    }
    if ((request.headers.get('authorization') || '') !== `Bearer ${env.RELAY_TOKEN}`) {
      return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
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
    const subject = String(body.subject || '').trim();
    const text = String(body.text || '');
    const html = body.html ? String(body.html) : htmlFromText(text);

    if (!EMAIL_RE.test(from)) return json({ ok: false, error: 'INVALID_FROM' }, 400);
    if (!to.length || !to.every((addr) => EMAIL_RE.test(addr))) return json({ ok: false, error: 'INVALID_TO' }, 400);
    if (!subject) return json({ ok: false, error: 'SUBJECT_REQUIRED' }, 400);
    if (env.ALLOWED_FROM_DOMAIN) {
      const domain = from.split('@')[1].toLowerCase();
      if (domain !== String(env.ALLOWED_FROM_DOMAIN).toLowerCase()) {
        return json({ ok: false, error: 'FROM_DOMAIN_NOT_ALLOWED', allowed: env.ALLOWED_FROM_DOMAIN }, 403);
      }
    }

    try {
      const result = await env.EMAIL.send({
        to,
        from: { email: from, name: String(body.fromName || 'MyCA') },
        subject,
        text: text || subject,
        html,
      });
      return json({ ok: true, messageId: result?.messageId || null });
    } catch (err) {
      return json({ ok: false, error: String(err.code || err.message || err) }, 502);
    }
  },
};
