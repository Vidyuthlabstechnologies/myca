import { createHash } from 'node:crypto';

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const STORAGE_API = 'https://storage.googleapis.com/storage/v1';
const STORAGE_UPLOAD = 'https://storage.googleapis.com/upload/storage/v1';
const TOKEN_MARGIN_MS = 60000;
const TIMEOUT_MS = 20000;

function sha256Of(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function objectName(businessId, sha256) {
  return `businesses/${businessId}/${sha256}`;
}

export function documentVaultConfigFromEnv(env = process.env) {
  const bucket = String(env.MYCA_DOCUMENT_BUCKET || '').trim();
  return { bucket: bucket === 'unset' ? '' : bucket };
}

export function createMetadataTokenSource({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cached = { token: '', expiresAt: 0 };
  return async function token() {
    if (cached.token && now() < cached.expiresAt) return cached.token;
    const res = await fetchImpl(METADATA_TOKEN_URL, { headers: { 'metadata-flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`metadata token: HTTP ${res.status}`);
    const body = await res.json();
    cached = { token: String(body.access_token || ''), expiresAt: now() + Number(body.expires_in || 0) * 1000 - TOKEN_MARGIN_MS };
    if (!cached.token) throw new Error('metadata token: empty');
    return cached.token;
  };
}

export function createDocumentVault({ bucket = '', fetchImpl = fetch, tokenSource = null, now = () => Date.now(), log = () => {} } = {}) {
  const kind = bucket ? 'gcs' : 'db';
  const token = tokenSource || createMetadataTokenSource({ fetchImpl, now });

  async function upload(businessId, sha256, content) {
    const name = objectName(businessId, sha256);
    const url = `${STORAGE_UPLOAD}/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(name)}&ifGenerationMatch=0`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'text/plain; charset=utf-8', 'x-goog-meta-sha256': sha256 },
      body: content,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 412) return { ok: true, existed: true };
    if (!res.ok) throw new Error(`document vault upload: HTTP ${res.status}`);
    return { ok: true, existed: false };
  }

  async function download(businessId, sha256) {
    const name = objectName(businessId, sha256);
    const url = `${STORAGE_API}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media`;
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`document vault read: HTTP ${res.status}`);
    const content = await res.text();
    if (sha256Of(content) !== sha256) {
      log({ vault: 'integrity-failed', businessId, sha256 });
      return null;
    }
    return content;
  }

  async function contentsOf(businessId, rows) {
    const out = [];
    for (const row of rows) {
      if (row.location === 'gcs') {
        const content = await download(businessId, row.sha256);
        if (content != null) out.push({ sha256: row.sha256, content });
      } else out.push({ sha256: row.sha256, content: row.content });
    }
    return out;
  }

  return {
    kind,
    bucket,
    async read(q, businessId, hashes) {
      if (!hashes.length) return [];
      const stored = await q('select sha256, content, location from documents where business_id = $1 and sha256 = any($2)', [businessId, hashes]);
      return contentsOf(businessId, stored.rows);
    },
    async all(q, businessId) {
      const stored = await q('select sha256, content, location from documents where business_id = $1 order by created_at', [businessId]);
      return contentsOf(businessId, stored.rows);
    },
    async purge(q, businessId) {
      const stored = await q('select sha256, location from documents where business_id = $1', [businessId]);
      let objects = 0;
      for (const row of stored.rows) {
        if (row.location !== 'gcs') continue;
        const name = objectName(businessId, row.sha256);
        const res = await fetchImpl(`${STORAGE_API}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok && res.status !== 404) throw new Error(`document vault delete: HTTP ${res.status}`);
        objects += 1;
      }
      const removed = await q('delete from documents where business_id = $1', [businessId]);
      return { rows: removed.rowCount, objects };
    },
    async write(q, businessId, doc) {
      const bytes = Buffer.byteLength(doc.content, 'utf8');
      if (kind === 'gcs') {
        await upload(businessId, doc.sha256, doc.content);
        const inserted = await q(
          "insert into documents (business_id, sha256, content, bytes, location) values ($1, $2, '', $3, 'gcs') on conflict do nothing returning sha256",
          [businessId, doc.sha256, bytes],
        );
        return inserted.rowCount > 0;
      }
      const inserted = await q(
        "insert into documents (business_id, sha256, content, bytes, location) values ($1, $2, $3, $4, 'db') on conflict do nothing returning sha256",
        [businessId, doc.sha256, doc.content, bytes],
      );
      return inserted.rowCount > 0;
    },
  };
}
