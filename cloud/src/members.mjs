import { isUuid, normalizePhone } from './auth.mjs';
import { keyedHash } from './tokens.mjs';

export const INVITABLE_ROLES = ['staff', 'accountant'];
export const INVITE_TTL_DAYS = 14;
export const MAX_OPEN_INVITES = 20;

const OPEN = 'accepted_at is null and declined_at is null and revoked_at is null';

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function hint(phone) {
  return `xxxxxxx${phone.slice(-3)}`;
}

export function createMembers({ db, secret, now = () => Date.now() }) {
  const at = () => new Date(now());

  async function audit(q, businessId, context, action, metadata) {
    await q(
      `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [businessId, context.userId || null, context.deviceId || null, context.requestId || '', action, JSON.stringify(metadata)],
    );
  }

  return {
    async invite(businessId, context, { phone: phoneInput, role } = {}) {
      const phone = normalizePhone(phoneInput);
      if (!phone) return fail('INVALID_PHONE');
      if (!INVITABLE_ROLES.includes(role)) return fail('INVALID_ROLE');
      const phoneHash = keyedHash(secret, phone);
      return db.tx(async (q) => {
        await q('select 1 from businesses where id = $1 for update', [businessId]);
        const member = await q(
          'select 1 from memberships m join users u on u.id = m.user_id where m.business_id = $1 and u.phone = $2 and u.deleted_at is null',
          [businessId, phone],
        );
        if (member.rowCount) return fail('ALREADY_A_MEMBER');
        await q(`update invitations set revoked_at = $3 where business_id = $1 and phone_hash = $2 and ${OPEN}`, [businessId, phoneHash, at()]);
        const open = await q(`select count(*)::int as n from invitations where business_id = $1 and ${OPEN} and expires_at > $2`, [businessId, at()]);
        if (open.rows[0].n >= MAX_OPEN_INVITES) return fail('TOO_MANY_INVITATIONS');
        const created = await q(
          `insert into invitations (business_id, phone_hash, phone_hint, role, invited_by, created_at, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [businessId, phoneHash, hint(phone), role, context.userId, at(), new Date(now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)],
        );
        await audit(q, businessId, context, 'member.invite', { invitationId: created.rows[0].id, role });
        return { ok: true, invitation: { id: created.rows[0].id, phoneHint: hint(phone), role } };
      });
    },

    async openFor(businessId) {
      const found = await db.query(
        `select id, phone_hint as "phoneHint", role from invitations
          where business_id = $1 and ${OPEN} and expires_at > $2 order by created_at`,
        [businessId, at()],
      );
      return found.rows;
    },

    async revoke(businessId, context, invitationId) {
      if (!isUuid(invitationId)) return fail('INVITATION_NOT_FOUND');
      return db.tx(async (q) => {
        const done = await q(`update invitations set revoked_at = $3 where id = $1 and business_id = $2 and ${OPEN} returning id`, [
          invitationId,
          businessId,
          at(),
        ]);
        if (!done.rowCount) return fail('INVITATION_NOT_FOUND');
        await audit(q, businessId, context, 'member.invite_revoked', { invitationId });
        return { ok: true };
      });
    },

    async pendingFor(phone) {
      const found = await db.query(
        `select i.id, i.role, b.name as "businessName", u.name as "invitedBy"
           from invitations i join businesses b on b.id = i.business_id join users u on u.id = i.invited_by
          where i.phone_hash = $1 and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
            and i.expires_at > $2 and b.deletion_requested_at is null
          order by i.created_at`,
        [keyedHash(secret, phone), at()],
      );
      return found.rows;
    },

    async respond(user, context, invitationId, accept) {
      if (!isUuid(invitationId)) return fail('INVITATION_NOT_FOUND');
      return db.tx(async (q) => {
        const found = await q(
          `select i.id, i.business_id, i.role, i.invited_by, i.expires_at, b.name
             from invitations i join businesses b on b.id = i.business_id
            where i.id = $1 and i.phone_hash = $2 and i.accepted_at is null and i.declined_at is null
              and i.revoked_at is null and b.deletion_requested_at is null
            for update of i`,
          [invitationId, keyedHash(secret, user.phone)],
        );
        const invitation = found.rows[0];
        if (!invitation) return fail('INVITATION_NOT_FOUND');
        if (invitation.expires_at.getTime() <= now()) return fail('INVITATION_EXPIRED');
        if (!accept) {
          await q('update invitations set declined_at = $2 where id = $1', [invitationId, at()]);
          await audit(q, invitation.business_id, context, 'member.invite_declined', { invitationId });
          return { ok: true, declined: true };
        }
        await q('update invitations set accepted_at = $2 where id = $1', [invitationId, at()]);
        await q(
          `insert into memberships (user_id, business_id, role, invited_by) values ($1, $2, $3, $4)
           on conflict (user_id, business_id) do nothing`,
          [user.userId, invitation.business_id, invitation.role, invitation.invited_by],
        );
        await audit(q, invitation.business_id, context, 'member.joined', { invitationId, role: invitation.role });
        return { ok: true, business: { id: invitation.business_id, name: invitation.name, role: invitation.role } };
      });
    },

    async remove(businessId, context, actorRole, targetUserId) {
      if (!isUuid(targetUserId)) return fail('MEMBER_NOT_FOUND');
      const leaving = targetUserId === context.userId;
      if (!leaving && actorRole !== 'owner') return fail('OWNER_ONLY');
      return db.tx(async (q) => {
        await q('select 1 from businesses where id = $1 for update', [businessId]);
        const target = await q('select role from memberships where business_id = $1 and user_id = $2', [businessId, targetUserId]);
        if (!target.rowCount) return fail('MEMBER_NOT_FOUND');
        if (target.rows[0].role === 'owner') {
          const owners = await q(
            `select count(*)::int as n from memberships m join users u on u.id = m.user_id
              where m.business_id = $1 and m.role = 'owner' and u.deleted_at is null`,
            [businessId],
          );
          if (owners.rows[0].n <= 1) return fail('LAST_OWNER');
        }
        await q('delete from memberships where business_id = $1 and user_id = $2', [businessId, targetUserId]);
        await audit(q, businessId, context, leaving ? 'member.left' : 'member.removed', { userId: targetUserId, role: target.rows[0].role });
        return { ok: true };
      });
    },
  };
}
