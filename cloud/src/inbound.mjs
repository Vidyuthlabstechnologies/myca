import { randomBytes, timingSafeEqual } from 'node:crypto';
import { keyedHash } from './tokens.mjs';
import { modelConfigured } from '../../platform/src/model-adapter.mjs';

export const INBOUND_HEADER = 'x-myca-key';
export const INBOUND_SOURCES = ['pos', 'documents'];
export const MAX_INBOUND_KEYS = 10;
const KEY_PREFIX = 'mk_';
const SALE_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const EMAIL_TOKEN = /^[a-z0-9]{10}$/;
const MAX_MAIL_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function emailToken() {
  for (;;) {
    const candidate = randomBytes(12).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    if (EMAIL_TOKEN.test(candidate)) return candidate;
  }
}

export function relayTokenMatches(configured, given) {
  if (!configured || configured.length < 32) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

async function noteDocument(session, { sha256, name, from, via, today, actor }) {
  let read = null;
  if (modelConfigured()) {
    const out = await session.tool('read_document', { documentSha256: sha256 }, actor);
    const args = out?.data?.proposal?.args;
    if (out?.ok !== false && args?.partyName) read = args;
  }
  const who = from ? ` from ${from}` : '';
  const text = read
    ? `Bill from ${read.partyName}${read.supplierInvoiceNo ? ` (${read.supplierInvoiceNo})` : ''}${read.date ? ` dated ${read.date}` : ''} arrived${who} through ${via}: ${name}. Open it to check the lines and post it.`
    : `A document arrived${who} through ${via}: ${name}. Read it and record the bill if it is one.`;
  await session.tool('add_reminder', { text: text.slice(0, 200), due: today, documentSha256: sha256, documentName: name }, actor);
  return Boolean(read);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function dayOf(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createInbound({ db, secret, now = () => Date.now(), withBooks, email = {}, storedBytes = async () => 0, limitBytes = Infinity }) {
  async function roomFor(businessId, incoming) {
    const stored = await storedBytes(businessId);
    return stored + incoming > limitBytes ? fail('STORAGE_FULL', { storedBytes: stored, limitBytes }) : null;
  }
  const at = () => new Date(now());
  const domain = String(email.domain || '').trim().toLowerCase();
  const addressOf = (token) => (domain && token ? `${token}@${domain}` : '');

  async function audit(q, businessId, context, action, metadata) {
    await q(
      `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [businessId, context.userId || null, context.deviceId || null, context.requestId || '', action, JSON.stringify(metadata)],
    );
  }

  return {
    async create(businessId, context, { label, source } = {}) {
      const name = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!name) return fail('LABEL_REQUIRED');
      if (!INBOUND_SOURCES.includes(source)) return fail('INVALID_SOURCE');
      const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
      return db.tx(async (q) => {
        const open = await q('select count(*)::int as n from inbound_keys where business_id = $1 and disabled_at is null', [businessId]);
        if (open.rows[0].n >= MAX_INBOUND_KEYS) return fail('TOO_MANY_KEYS');
        const token = source === 'documents' ? emailToken() : null;
        const created = await q(
          'insert into inbound_keys (business_id, label, source, key_hash, created_by, created_at, email_token) values ($1, $2, $3, $4, $5, $6, $7) returning id',
          [businessId, name, source, keyedHash(secret, key), context.userId, at(), token],
        );
        await audit(q, businessId, context, 'inbound.key_created', { keyId: created.rows[0].id, label: name, source });
        return { ok: true, key: { id: created.rows[0].id, label: name, source, secret: key, email: addressOf(token) } };
      });
    },

    async list(businessId) {
      const start = new Date(`${dayOf(now())}T00:00:00.000Z`);
      const found = await db.query(
        `select k.id, k.label, k.source, k.email_token as "emailToken", k.created_at as "createdAt", k.last_used_at as "lastUsedAt", k.disabled_at as "disabledAt",
                coalesce(s.n, 0)::int as "todayCount", coalesce(s.total, 0)::numeric as "todayTotal"
           from inbound_keys k
           left join (select key_id, count(*) as n, sum(total) as total from inbound_sales where received_at >= $2 group by key_id) s on s.key_id = k.id
          where k.business_id = $1 order by k.created_at`,
        [businessId, start],
      );
      return { ok: true, keys: found.rows.map(({ emailToken, ...row }) => ({ ...row, todayTotal: Number(row.todayTotal), enabled: !row.disabledAt, email: row.disabledAt ? '' : addressOf(emailToken) })) };
    },

    async disable(businessId, context, keyId) {
      if (!isUuid(keyId)) return fail('KEY_NOT_FOUND');
      return db.tx(async (q) => {
        const done = await q('update inbound_keys set disabled_at = $3 where id = $1 and business_id = $2 and disabled_at is null returning label', [keyId, businessId, at()]);
        if (!done.rowCount) return fail('KEY_NOT_FOUND');
        await audit(q, businessId, context, 'inbound.key_disabled', { keyId, label: done.rows[0].label });
        return { ok: true };
      });
    },

    async authenticate(presented) {
      const key = String(presented || '').trim();
      if (!key.startsWith(KEY_PREFIX)) return null;
      const found = await db.query(
        `select k.id, k.business_id as "businessId", k.label, k.source from inbound_keys k join businesses b on b.id = k.business_id
          where k.key_hash = $1 and k.disabled_at is null and b.deletion_requested_at is null`,
        [keyedHash(secret, key)],
      );
      const row = found.rows[0];
      if (row) await db.query('update inbound_keys set last_used_at = $2 where id = $1', [row.id, at()]);
      return row || null;
    },

    async sale(key, requestId, body = {}) {
      if (key.source !== 'pos') return fail('KEY_NOT_FOR_SALES');
      const saleId = String(body.saleId || '').trim();
      if (!SALE_ID.test(saleId)) return fail('INVALID_SALE_ID');
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) return fail('LINES_REQUIRED');
      return db.tx(async (q) => {
      await q('select pg_advisory_xact_lock(hashtext($1))', [`${key.businessId}:${saleId}`]);
      const seen = await q('select invoice_id as "invoiceId", total from inbound_sales where business_id = $1 and sale_id = $2', [key.businessId, saleId]);
      if (seen.rowCount) return { ok: true, invoiceId: seen.rows[0].invoiceId, total: Number(seen.rows[0].total), duplicate: true };
      const context = { userId: null, deviceId: null, requestId };
      const actor = { actor: { userId: `pos:${key.id}`, role: 'staff', name: key.label } };
      const args = {
        partyName: String(body.partyName || 'Counter sale').trim().slice(0, 80) || 'Counter sale',
        ...(body.partyGstin ? { partyGstin: String(body.partyGstin) } : {}),
        ...(body.partyState ? { partyState: String(body.partyState) } : {}),
        ...(body.date ? { date: String(body.date) } : {}),
        ...(body.taxJurisdiction ? { taxJurisdiction: String(body.taxJurisdiction) } : {}),
        lines: lines.slice(0, 50),
      };
      const out = await withBooks(key.businessId, context, (session) => session.tool('create_invoice', args, actor), { q });
      if (out.ok === false) return out;
      const invoice = out.invoice || {};
      await q(
        'insert into inbound_sales (business_id, key_id, sale_id, invoice_id, total, received_at) values ($1, $2, $3, $4, $5, $6) on conflict do nothing',
        [key.businessId, key.id, saleId, String(invoice.id || ''), Number(invoice.total || 0), at()],
      );
      return { ok: true, invoiceId: invoice.id, total: invoice.total, duplicate: false };
      });
    },

    async mail(requestId, body = {}, today) {
      const to = String(body.to || '').trim().toLowerCase();
      const token = to.split('@')[0].split('+')[0];
      if (!EMAIL_TOKEN.test(token) || (domain && to.split('@')[1] !== domain)) return fail('ADDRESS_NOT_FOUND');
      const found = await db.query(
        `select k.id, k.business_id as "businessId", k.label, k.source from inbound_keys k join businesses b on b.id = k.business_id
          where k.email_token = $1 and k.source = 'documents' and k.disabled_at is null and b.deletion_requested_at is null`,
        [token],
      );
      const key = found.rows[0];
      if (!key) return fail('ADDRESS_NOT_FOUND');
      await db.query('update inbound_keys set last_used_at = $2 where id = $1', [key.id, at()]);
      const from = String(body.from || '').trim().slice(0, 120);
      const subject = String(body.subject || '').trim().slice(0, 200);
      const files = [];
      for (const item of (Array.isArray(body.attachments) ? body.attachments : []).slice(0, MAX_MAIL_ATTACHMENTS)) {
        const name = String(item?.name || '').trim().slice(0, 120);
        const mime = String(item?.mime || 'application/octet-stream').toLowerCase();
        const base64 = typeof item?.base64 === 'string' ? item.base64 : '';
        if (!name || !base64) continue;
        const bytes = Buffer.from(base64, 'base64');
        if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) continue;
        files.push({ name, content: mime.startsWith('text/') ? bytes.toString('utf8') : `data:${mime};base64,${base64}` });
      }
      const text = String(body.text || '').trim();
      if (!files.length && text) files.push({ name: `${(subject || 'mail').replace(/[^A-Za-z0-9 ._-]+/g, ' ').trim().slice(0, 60) || 'mail'}.txt`, content: text });
      if (!files.length) return fail('NOTHING_TO_STORE');
      const full = await roomFor(key.businessId, files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0));
      if (full) return full;
      const context = { userId: null, deviceId: null, requestId };
      const actor = { actor: { userId: `mail:${key.id}`, role: 'staff', name: key.label } };
      return withBooks(key.businessId, context, async (session) => {
        const stored = [];
        for (const file of files) {
          const put = await session.uploadDocument(file.name, file.content, actor);
          if (put.ok === false) continue;
          stored.push({ name: file.name, sha256: put.sha256 });
        }
        if (!stored.length) return fail('NOTHING_TO_STORE');
        let read = 0;
        for (const file of stored) {
          if (await noteDocument(session, { sha256: file.sha256, name: file.name, from: subject ? `${from || 'mail'} about "${subject}"` : from, via: key.label, today, actor })) read += 1;
        }
        return { ok: true, stored: stored.length, read, files: stored };
      });
    },

    async document(key, requestId, body = {}, today) {
      if (key.source !== 'documents') return fail('KEY_NOT_FOR_DOCUMENTS');
      const name = String(body.name || '').trim().slice(0, 120);
      const content = typeof body.content === 'string' ? body.content : '';
      if (!name || !content) return fail('EMPTY_FILE');
      const full = await roomFor(key.businessId, Buffer.byteLength(content, 'utf8'));
      if (full) return full;
      const context = { userId: null, deviceId: null, requestId };
      const actor = { actor: { userId: `inbox:${key.id}`, role: 'staff', name: key.label } };
      return withBooks(key.businessId, context, async (session) => {
        const stored = await session.uploadDocument(name, content, actor);
        if (stored.ok === false) return stored;
        const from = String(body.from || '').trim().slice(0, 80);
        const read = await noteDocument(session, { sha256: stored.sha256, name, from, via: key.label, today, actor });
        return { ok: true, sha256: stored.sha256, bytes: stored.bytes, read };
      });
    },
  };
}
