import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { serviceAccountJwt, uploadBundle } from '../../scripts/play-upload.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = { client_email: 'release@myca.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };

test('the service account sign-in is an RS256 token for the Play publisher scope', () => {
  const [header, claims, signature] = serviceAccountJwt(account, 1000).split('.');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${claims}`);
  assert.equal(verify.verify(publicKey, signature, 'base64url'), true);
  const body = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.deepEqual([body.iss, body.scope, body.exp - body.iat], [account.client_email, 'https://www.googleapis.com/auth/androidpublisher', 3000]);
});

test('an upload opens an edit, sends the bundle, puts it on the track as a draft and commits', async () => {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push([options.method, url.replace(/^https:\/\/[^/]+/, '')]);
    const reply = url.includes('/token') ? { access_token: 't' } : url.endsWith('/edits') ? { id: 'E1' } : url.includes('/bundles') ? { versionCode: 42 } : {};
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const out = await uploadBundle({ account, packageName: 'com.mldynamic.myca', bundle: Buffer.from('aab'), track: 'internal', fetchFn });
  assert.deepEqual(out, { versionCode: 42, track: 'internal', status: 'draft' });
  assert.deepEqual(calls.map((call) => call.join(' ')), [
    'POST /token',
    'POST /androidpublisher/v3/applications/com.mldynamic.myca/edits',
    'POST /upload/androidpublisher/v3/applications/com.mldynamic.myca/edits/E1/bundles?uploadType=media',
    'PUT /androidpublisher/v3/applications/com.mldynamic.myca/edits/E1/tracks/internal',
    'POST /androidpublisher/v3/applications/com.mldynamic.myca/edits/E1:commit',
  ]);
});

test('a refused step stops the upload and says which step, and an unknown track is refused before any call', async () => {
  const fetchFn = async (url) => new Response(url.includes('/token') ? '{"access_token":"t"}' : '{"error":"forbidden"}', { status: url.includes('/token') ? 200 : 403 });
  await assert.rejects(uploadBundle({ account, packageName: 'p', bundle: Buffer.from('x'), fetchFn }), /opening an edit failed with HTTP 403/);
  await assert.rejects(uploadBundle({ account, packageName: 'p', bundle: Buffer.from('x'), track: 'everyone', fetchFn: async () => { throw new Error('called'); } }), /unknown track/);
});

test('an access token from the CI identity skips the key sign-in and goes straight to the edit', async () => {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push([options.method, url.replace(/^https:\/\/[^/]+/, ''), options.headers?.authorization]);
    const reply = url.endsWith('/edits') ? { id: 'E2' } : url.includes('/bundles') ? { versionCode: 7 } : {};
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const out = await uploadBundle({ accessToken: 'ci-token', packageName: 'com.mldynamic.myca', bundle: Buffer.from('aab'), fetchFn });
  assert.equal(out.versionCode, 7);
  assert.equal(calls.some(([, path]) => path.includes('/token')), false);
  assert.ok(calls.every(([, , authorization]) => authorization === 'Bearer ci-token'));
  await assert.rejects(uploadBundle({ packageName: 'p', bundle: Buffer.from('x'), fetchFn }), /access token or a service account key/);
});
