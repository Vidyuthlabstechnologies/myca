import { createState, serialize } from '../../platform/src/store.mjs';
import { runTool } from '../../platform/src/tools.mjs';
import { isUuid } from './auth.mjs';

export const ROLES = ['owner', 'staff', 'accountant'];

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

async function openingBooks({ name, gstin, state, country }, today) {
  const books = createState();
  books.company = { name: '', gstin: '', state: '', pan: '', fy: financialYear(today), address: '' };
  const set = await runTool(books, 'set_company', { name, ...(country ? { country } : {}), gstin, ...(state ? { state } : {}) });
  if (set.ok === false) return fail(set.error || 'INVALID_COMPANY', { errors: set.errors });
  if (books.company.country !== 'US' && !books.company.state) return fail('STATE_REQUIRED');
  return { ok: true, state: serialize(books), company: books.company };
}

export function createBusinesses({ db, now = () => Date.now() }) {
  return {
    async create(userId, { name, gstin = '', state = '', country = '' } = {}) {
      const opening = await openingBooks({ name: String(name ?? ''), gstin: String(gstin ?? ''), state: String(state ?? ''), country: String(country ?? '') }, new Date(now()));
      if (!opening.ok) return opening;
      return db.tx(async (q) => {
        const business = await q('insert into businesses (name, gstin, created_by, created_at) values ($1, $2, $3, $4) returning id', [
          opening.company.name,
          opening.company.gstin,
          userId,
          new Date(now()),
        ]);
        const id = business.rows[0].id;
        await q("insert into memberships (user_id, business_id, role) values ($1, $2, 'owner')", [userId, id]);
        await q('insert into books (business_id, version, state) values ($1, 0, $2::jsonb)', [id, JSON.stringify(opening.state)]);
        return { ok: true, business: { id, name: opening.company.name, gstin: opening.company.gstin, role: 'owner' } };
      });
    },

    async listFor(userId) {
      const found = await db.query(
        `select b.id, b.name, b.gstin, m.role from memberships m join businesses b on b.id = m.business_id
          where m.user_id = $1 and b.deletion_requested_at is null order by b.created_at`,
        [userId],
      );
      return found.rows;
    },

    async membership(userId, businessId) {
      if (!isUuid(businessId)) return null;
      const found = await db.query(
        `select m.role from memberships m join businesses b on b.id = m.business_id
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

    async rename(businessId, company) {
      await db.query('update businesses set name = $2, gstin = $3 where id = $1', [businessId, company.name || '', company.gstin || '']);
    },
  };
}
