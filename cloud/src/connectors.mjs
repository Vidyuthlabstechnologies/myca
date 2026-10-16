import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { CONNECTOR_CHANNELS } from '../../platform/src/channel-connectors.mjs';

const MIN_KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function connectorKeyFromEnv(env = process.env) {
  const value = String(env.MYCA_CONNECTOR_KEY || '').trim();
  return value === 'unset' ? '' : value;
}

function deriveKey(secret, businessId) {
  return Buffer.from(hkdfSync('sha256', secret, businessId, 'myca-business-connectors', 32));
}

export function sealSecrets(secret, businessId, values) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret, businessId), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

export function openSecrets(secret, businessId, sealed) {
  const [iv, tag, body] = String(sealed || '').split('.');
  if (!iv || !tag || !body) return {};
  try {
    const decipher = createDecipheriv(ALGORITHM, deriveKey(secret, businessId), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8'));
  } catch {
    return {};
  }
}

function publicView(channel, row) {
  const spec = CONNECTOR_CHANNELS[channel];
  const shown = {};
  for (const field of spec.fields) shown[field] = spec.secrets.includes(field) ? (row?.secretsSet?.includes(field) ? 'set' : '') : String(row?.fields?.[field] || '');
  const configured = Boolean(row) && spec.fields.every((field) => field === 'region' || field === 'dc' || (spec.secrets.includes(field) ? row.secretsSet.includes(field) : Boolean(row.fields[field])));
  return { channel, title: spec.title, configured, enabled: row ? row.enabled : true, lastFetchedTo: row?.lastFetchedTo || '', kinds: spec.kinds, pushes: spec.pushes || [], fields: spec.fields, secrets: spec.secrets, ...shown };
}

export function createConnectorStore({ db, key = '' }) {
  const enabled = key.length >= MIN_KEY_LENGTH;

  async function rowsFor(q, businessId) {
    const found = await q('select channel, fields, secrets, enabled, last_fetched_to as "lastFetchedTo" from business_connectors where business_id = $1 order by channel', [businessId]);
    return found.rows.map((row) => ({ channel: row.channel, fields: row.fields || {}, sealed: row.secrets, secretsSet: Object.keys(openSecrets(key, businessId, row.secrets)), enabled: row.enabled, lastFetchedTo: row.lastFetchedTo || '' }));
  }

  return {
    enabled,

    async list(businessId) {
      const rows = enabled ? await rowsFor((text, params) => db.query(text, params), businessId) : [];
      const byChannel = new Map(rows.map((row) => [row.channel, row]));
      return { ok: true, enabled, connectors: Object.keys(CONNECTOR_CHANNELS).map((channel) => publicView(channel, byChannel.get(channel))) };
    },

    async save(businessId, context, body = {}) {
      if (!enabled) return fail('CONNECTORS_UNAVAILABLE', { hint: 'The service has no connector key; ask the operator to set MYCA_CONNECTOR_KEY.' });
      const channel = String(body.channel || '').trim().toLowerCase();
      const spec = CONNECTOR_CHANNELS[channel];
      if (!spec) return fail('UNKNOWN_CONNECTOR', { channel, known: Object.keys(CONNECTOR_CHANNELS) });
      return db.tx(async (q) => {
        const existing = (await rowsFor(q, businessId)).find((row) => row.channel === channel);
        const fields = { ...(existing?.fields || {}) };
        const secrets = existing ? openSecrets(key, businessId, existing.sealed) : {};
        for (const field of spec.fields) {
          if (body[field] == null) continue;
          const value = String(body[field]).trim().slice(0, 2000);
          if (spec.secrets.includes(field)) {
            if (value) secrets[field] = value;
            else delete secrets[field];
          } else fields[field] = value;
        }
        const on = body.enabled == null ? (existing ? existing.enabled : true) : Boolean(body.enabled);
        await q(
          `insert into business_connectors (business_id, channel, fields, secrets, enabled, updated_at) values ($1, $2, $3::jsonb, $4, $5, now())
           on conflict (business_id, channel) do update set fields = excluded.fields, secrets = excluded.secrets, enabled = excluded.enabled, updated_at = now()`,
          [businessId, channel, JSON.stringify(fields), sealSecrets(key, businessId, secrets), on],
        );
        await q(
          `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata) values ($1, $2, $3, $4, 'connector.saved', $5::jsonb)`,
          [businessId, context.userId || null, context.deviceId || null, context.requestId || '', JSON.stringify({ channel, fields: Object.keys(fields), secrets: Object.keys(secrets), enabled: on })],
        );
        const row = (await rowsFor(q, businessId)).find((item) => item.channel === channel);
        return { ok: true, ...publicView(channel, row) };
      });
    },

    async configured(businessId) {
      if (!enabled) return [];
      const rows = await rowsFor((text, params) => db.query(text, params), businessId);
      return rows
        .filter((row) => row.enabled && publicView(row.channel, row).configured)
        .map((row) => ({
          channel: row.channel,
          lastFetchedTo: row.lastFetchedTo,
          config: { ...row.fields, ...openSecrets(key, businessId, row.sealed), enabled: true, lastFetchedTo: row.lastFetchedTo },
          onFetched: (to) => db.query('update business_connectors set last_fetched_to = $3 where business_id = $1 and channel = $2', [businessId, row.channel, to]),
        }));
    },
  };
}
