import { createState, serialize } from '../../platform/src/store.mjs';
import { runTool } from '../../platform/src/tools.mjs';
import { isUuid } from './auth.mjs';
import { DEMO_GSTIN, DEMO_NAME } from './demo.mjs';
import { countryPack } from '../../platform/src/countries/index.mjs';
import { residencyRefusal } from './residency.mjs';

const ENGINE_ROLE = { owner: 'admin', accountant: 'partner', staff: 'staff' };

export function engineRole(role) {
  return ENGINE_ROLE[role] || 'staff';
}

export function financialYear(date) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

async function openingBooks({ name, gstin, state, country, address, city, pin }, today) {
  const books = createState();
  books.company = { name: '', gstin: '', state: '', pan: '', fy: financialYear(today), address: '' };
  const set = await runTool(books, 'set_company', { name, ...(country ? { country } : {}), gstin, ...(state ? { state } : {}) });
  if (set.ok && String(address || '').trim()) {
    const placed = await runTool(books, 'set_business_address', { address, city, pin });
    if (!placed.ok) return placed;
  }
  if (set.ok === false) return fail(set.error || 'INVALID_COMPANY', { errors: set.errors });
  if (countryPack(books.company.country || 'IN')?.requiresState && !books.company.state) return fail('STATE_REQUIRED');
  const elsewhere = residencyRefusal(books.company.country);
  if (elsewhere) return elsewhere;
  return { ok: true, state: serialize(books), company: books.company };
}

import { storedState } from './books-seal.mjs';
export function createBusinesses({ db, now = () => Date.now(), booksKey = '' }) {
  return {
    async create(userId, { name, gstin = '', state = '', country = '', address = '', city = '', pin = '' } = {}, { demo = false } = {}) {
      if (demo) {
        name = DEMO_NAME;
        gstin = DEMO_GSTIN;
        state = '29';
        country = '';
        address = '12, Demo Road, Jayanagar';
        city = 'Bengaluru';
        pin = '560041';
      }
      const opening = await openingBooks({ name: String(name ?? ''), gstin: String(gstin ?? ''), state: String(state ?? ''), country: String(country ?? ''), address: String(address ?? ''), city: String(city ?? ''), pin: String(pin ?? '') }, new Date(now()));
      if (!opening.ok) return opening;
      return db.tx(async (q) => {
        const business = await q('insert into businesses (name, gstin, created_by, created_at, demo) values ($1, $2, $3, $4, $5) returning id', [
          opening.company.name,
          opening.company.gstin,
          userId,
          new Date(now()),
          Boolean(demo),
        ]);
        const id = business.rows[0].id;
        await q("insert into memberships (user_id, business_id, role) values ($1, $2, 'owner')", [userId, id]);
        await q('insert into books (business_id, version, state) values ($1, 0, $2::jsonb)', [id, storedState(booksKey, id, JSON.stringify(opening.state))]);
        if (demo) {
          await q(
            `insert into audit_log (business_id, user_id, request_id, action, metadata) values ($1, $2, '', 'demo_business_created', $3::jsonb)`,
            [id, userId, JSON.stringify({ source: 'POST /v1/businesses demo', why: 'A fictional business for trying the app; it cannot use live providers and is purged when unused.' })],
          );
        }
        return { ok: true, business: { id, name: opening.company.name, gstin: opening.company.gstin, role: 'owner', demo: Boolean(demo) } };
      });
    },

    async listFor(userId) {
      const found = await db.query(
        `select b.id, b.name, b.gstin, m.role, b.demo from memberships m join businesses b on b.id = m.business_id
          where m.user_id = $1 and b.deletion_requested_at is null order by b.created_at`,
        [userId],
      );
      return found.rows;
    },

    async membership(userId, businessId) {
      if (!isUuid(businessId)) return null;
      const found = await db.query(
        `select m.role, b.demo from memberships m join businesses b on b.id = m.business_id
          where m.user_id = $1 and m.business_id = $2 and b.deletion_requested_at is null`,
        [userId, businessId],
      );
      return found.rows[0] || null;
    },

    async members(businessId) {
      const found = await db.query(
        `select u.id, u.name, m.role from memberships m join users u on u.id = m.user_id
          where m.business_id = $1 and u.deleted_at is null order by m.created_at`,
        [businessId],
      );
      return found.rows;
    },

    async requestDeletion(businessId, context) {
      return db.tx(async (q) => {
        const done = await q('update businesses set deletion_requested_at = $2 where id = $1 and deletion_requested_at is null returning name', [businessId, new Date(now())]);
        if (!done.rowCount) return { ok: false, error: 'BUSINESS_NOT_FOUND' };
        await q(
          `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata)
           values ($1, $2, $3, $4, 'business.deletion_requested', $5::jsonb)`,
          [businessId, context.userId || null, context.deviceId || null, context.requestId || '', JSON.stringify({ name: done.rows[0].name })],
        );
        return { ok: true, deleted: true };
      });
    },

    async storedBytes(businessId) {
      const found = await db.query('select coalesce(sum(bytes), 0)::bigint as total from documents where business_id = $1', [businessId]);
      return Number(found.rows[0].total);
    },

    async rename(businessId, company) {
      await db.query('update businesses set name = $2, gstin = $3 where id = $1', [businessId, company.name || '', company.gstin || '']);
    },
  };
}
