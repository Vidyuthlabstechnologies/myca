import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const TRACKS = new Set(['internal', 'alpha', 'beta', 'production']);
const STATUSES = new Set(['draft', 'completed']);

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function serviceAccountJwt(account, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: account.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key, 'base64url')}`;
}

async function json(response, step) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${step} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function accessTokenFor(account, fetchFn) {
  const token = await json(await fetchFn(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountJwt(account) }),
  }), 'sign-in');
  return token.access_token;
}

export async function uploadBundle({ account = null, accessToken = '', packageName, bundle, track = 'internal', status = 'draft', fetchFn = fetch }) {
  if (!TRACKS.has(track)) throw new Error(`unknown track ${track}`);
  if (!STATUSES.has(status)) throw new Error(`unknown status ${status}`);
  if (!accessToken && !account) throw new Error('an access token or a service account key is required');
  const auth = { authorization: `Bearer ${accessToken || await accessTokenFor(account, fetchFn)}` };
  const app = `${API}/${encodeURIComponent(packageName)}`;
  const edit = await json(await fetchFn(`${app}/edits`, { method: 'POST', headers: auth }), 'opening an edit');
  const uploaded = await json(await fetchFn(`${UPLOAD}/${encodeURIComponent(packageName)}/edits/${edit.id}/bundles?uploadType=media`, { method: 'POST', headers: { ...auth, 'content-type': 'application/octet-stream' }, body: bundle }), 'uploading the bundle');
  await json(await fetchFn(`${app}/edits/${edit.id}/tracks/${track}`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ track, releases: [{ versionCodes: [String(uploaded.versionCode)], status }] }) }), 'setting the track');
  await json(await fetchFn(`${app}/edits/${edit.id}:commit`, { method: 'POST', headers: auth }), 'committing the edit');
  return { versionCode: uploaded.versionCode, track, status };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON || '';
  const accessToken = String(process.env.PLAY_ACCESS_TOKEN || '').trim();
  if (!raw.trim() && !accessToken) {
    console.log('Neither PLAY_ACCESS_TOKEN nor PLAY_SERVICE_ACCOUNT_JSON is set; nothing uploaded.');
    process.exit(0);
  }
  const result = await uploadBundle({
    accessToken,
    account: raw.trim() ? JSON.parse(raw) : null,
    packageName: process.env.PLAY_PACKAGE || 'com.mldynamic.myca',
    bundle: readFileSync(process.argv[2] || 'dist/myca-android.aab'),
    track: process.env.PLAY_TRACK || 'internal',
    status: process.env.PLAY_RELEASE_STATUS || 'draft',
  });
  console.log(`Uploaded version ${result.versionCode} to the ${result.track} track as ${result.status}.`);
}
