const { createHash } = require('crypto');
const { createReadStream, createWriteStream, mkdtempSync } = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { execFile, spawn } = require('child_process');
const { tmpdir } = require('os');
const { join } = require('path');

const INSTALLER = /^MyCA Setup \d+\.\d+\.\d+\.exe$/;
const SUMS = 'SHA256SUMS';
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024;
const DEFAULT_PUBLISHER = process.env.MYCA_UPDATE_PUBLISHER || 'Vidyuthlabs';

function pickAssets(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const installer = list.find((a) => a && INSTALLER.test(String(a.name || '')) && /^https:\/\/github\.com\/Vidyuthlabstechnologies\/myca\//.test(String(a.browser_download_url || '')));
  const sums = list.find((a) => a && String(a.name || '') === SUMS && /^https:\/\/github\.com\/Vidyuthlabstechnologies\/myca\//.test(String(a.browser_download_url || '')));
  if (!installer || !sums) return null;
  return { installer: { name: installer.name, url: installer.browser_download_url, bytes: Number(installer.size || 0) }, sums: { url: sums.browser_download_url } };
}

function parseSums(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line.trim());
    if (m) out[m[2].replace(/^\.\//, '')] = m[1].toLowerCase();
  }
  return out;
}

async function fileSha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function download(url, path, { fetchImpl = globalThis.fetch, maxBytes = MAX_INSTALLER_BYTES } = {}) {
  const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok) return { ok: false, error: 'DOWNLOAD_HTTP_ERROR', status: res.status };
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) return { ok: false, error: 'DOWNLOAD_TOO_LARGE', bytes: declared };
  let seen = 0;
  const counted = new (require('stream').Transform)({
    transform(chunk, _enc, done) {
      seen += chunk.length;
      if (seen > maxBytes) done(new Error('DOWNLOAD_TOO_LARGE'));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counted, createWriteStream(path));
  } catch (err) {
    return { ok: false, error: /TOO_LARGE/.test(String(err && err.message)) ? 'DOWNLOAD_TOO_LARGE' : 'DOWNLOAD_FAILED', detail: String(err && err.message || err) };
  }
  return { ok: true, path, bytes: seen };
}

function signatureVerdict(stdout, publisher = DEFAULT_PUBLISHER) {
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || '').trim());
  } catch {
    return { ok: false, error: 'SIGNATURE_UNREADABLE' };
  }
  const status = String(parsed.Status || '');
  const subject = String(parsed.Subject || '');
  if (status !== 'Valid') return { ok: false, error: 'SIGNATURE_NOT_VALID', status, subject };
  if (!subject.toLowerCase().includes(String(publisher).toLowerCase())) return { ok: false, error: 'SIGNATURE_WRONG_PUBLISHER', status, subject };
  return { ok: true, subject };
}

function authenticode(path) {
  return new Promise((resolve) => {
    const script = `$s = Get-AuthenticodeSignature -LiteralPath '${path.replace(/'/g, "''")}'; [pscustomobject]@{ Status = $s.Status.ToString(); Subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '' } } | ConvertTo-Json -Compress`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 60000, windowsHide: true }, (err, stdout) => {
      resolve(err ? { ok: false, error: 'SIGNATURE_CHECK_FAILED', detail: String(err.message || err) } : { ok: true, stdout: String(stdout || '') });
    });
  });
}

async function fetchAndVerify(found, { fetchImpl = globalThis.fetch, checkSignature = authenticode, publisher = DEFAULT_PUBLISHER, dir = mkdtempSync(join(tmpdir(), 'myca-update-')) } = {}) {
  const assets = found && found.assets;
  if (!assets) return { ok: false, error: 'NO_INSTALLER_ASSET' };
  const sumsRes = await fetchImpl(assets.sums.url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!sumsRes.ok) return { ok: false, error: 'SUMS_HTTP_ERROR', status: sumsRes.status };
  const expected = parseSums(await sumsRes.text())[assets.installer.name];
  if (!expected) return { ok: false, error: 'SUMS_MISSING_INSTALLER' };
  const path = join(dir, assets.installer.name);
  const got = await download(assets.installer.url, path, { fetchImpl });
  if (!got.ok) return got;
  const actual = await fileSha256(path);
  if (actual !== expected) return { ok: false, error: 'SHA256_MISMATCH', expected, actual };
  const checked = await checkSignature(path);
  if (!checked.ok) return checked;
  const verdict = signatureVerdict(checked.stdout, publisher);
  if (!verdict.ok) return { ...verdict, path };
  return { ok: true, path, sha256: actual, subject: verdict.subject };
}

function runInstallerSilently(path, spawnImpl = spawn) {
  const child = spawnImpl(path, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return { ok: true, pid: child.pid };
}

module.exports = { pickAssets, parseSums, fileSha256, download, signatureVerdict, authenticode, fetchAndVerify, runInstallerSilently, INSTALLER, DEFAULT_PUBLISHER };
