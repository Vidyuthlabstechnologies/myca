import { randomBytes } from 'node:crypto';
import { keyedHash } from './tokens.mjs';

export const INBOUND_HEADER = 'x-myca-key';
export const INBOUND_SOURCES = ['pos', 'documents'];
export const MAX_INBOUND_KEYS = 10;
const KEY_PREFIX = 'mk_';
const SALE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function dayOf(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createInbound({ db, secret, now = () => Date.now(), withBooks }) {
  const at = () => new Date(now());

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
        const created = await q(
          'insert into inbound_keys (business_id, label, source, key_hash, created_by, created_at) values ($1, $2, $3, $4, $5, $6) returning id',
          [businessId, name, source, keyedHash(secret, key), context.userId, at()],
        );
        await audit(q, businessId, context, 'inbound.key_created', { keyId: created.rows[0].id, label: name, source });
        return { ok: true, key: { id: created.rows[0].id, label: name, source, secret: key } };
      });
    },

    async list(businessId) {
      const start = new Date(`${dayOf(now())}T00:00:00.000Z`);
      const found = await db.query(
        `select k.id, k.label, k.source, k.created_at as "createdAt", k.last_used_at as "lastUsedAt", k.disabled_at as "disabledAt",
                coalesce(s.n, 0)::int as "todayCount", coalesce(s.total, 0)::numeric as "todayTotal"
           from inbound_keys k
           left join (select key_id, count(*) as n, sum(total) as total from inbound_sales where received_at >= $2 group by key_id) s on s.key_id = k.id
          where k.business_id = $1 order by k.created_at`,
        [businessId, start],
      );
      return { ok: true, keys: found.rows.map((row) => ({ ...row, todayTotal: Number(row.todayTotal), enabled: !row.disabledAt })) };
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
      const seen = await db.query('select invoice_id as "invoiceId", total from inbound_sales where business_id = $1 and sale_id = $2', [key.businessId, saleId]);
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
      const out = await withBooks(key.businessId, context, (session) => session.tool('create_invoice', args, actor));
      if (out.ok === false) return out;
      const invoice = out.invoice || {};
      await db.query(
        'insert into inbound_sales (business_id, key_id, sale_id, invoice_id, total, received_at) values ($1, $2, $3, $4, $5, $6) on conflict do nothing',
        [key.businessId, key.id, saleId, String(invoice.id || ''), Number(invoice.total || 0), at()],
      );
      return { ok: true, invoiceId: invoice.id, total: invoice.total, duplicate: false };
    },

    async document(key, requestId, body = {}, today) {
      if (key.source !== 'documents') return fail('KEY_NOT_FOR_DOCUMENTS');
      const name = String(body.name || '').trim().slice(0, 120);
      const content = typeof body.content === 'string' ? body.content : '';
      if (!name || !content) return fail('EMPTY_FILE');
      const context = { userId: null, deviceId: null, requestId };
      const actor = { actor: { userId: `inbox:${key.id}`, role: 'staff', name: key.label } };
      return withBooks(key.businessId, context, async (session) => {
        const stored = await session.uploadDocument(name, content, actor);
        if (stored.ok === false) return stored;
        const from = String(body.from || '').trim().slice(0, 80);
        await session.tool('add_reminder', { text: `A document arrived${from ? ` from ${from}` : ''} through ${key.label}: ${name}. Read it and record the bill if it is one.`, due: today }, actor);
        return { ok: true, sha256: stored.sha256, bytes: stored.bytes };
      });
    },
  };
}
