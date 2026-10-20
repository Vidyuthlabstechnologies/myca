import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performExternalAction } from './action-gate.mjs';
import { documentsOf, isSha256 } from './document-store.mjs';
import { normalizeClientId } from './books.mjs';
import { localToday } from './dates.mjs';

const POWERSHELL = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const TIMEOUT_MS = 60000;
const THUMBPRINT = /^[0-9A-F]{40}$/;
const MAX_SIGNATURES = 500;

const LIST_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$rows = @(Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey } | ForEach-Object {',
  '  [pscustomobject]@{ thumbprint = $_.Thumbprint; subject = $_.Subject; issuer = $_.Issuer; notAfter = $_.NotAfter.ToString("yyyy-MM-dd"); notBefore = $_.NotBefore.ToString("yyyy-MM-dd") }',
  '})',
  'ConvertTo-Json -InputObject $rows -Compress',
].join('\n');

function signScript(thumbprint, payloadPath) {
  return [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Security',
    `$cert = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq "${thumbprint}" -and $_.HasPrivateKey } | Select-Object -First 1`,
    'if (-not $cert) { Write-Output "NO_CERT"; exit 2 }',
    `$bytes = [System.IO.File]::ReadAllBytes("${payloadPath.replace(/\\/g, '\\\\').replace(/"/g, '')}")`,
    '$content = New-Object System.Security.Cryptography.Pkcs.ContentInfo (,$bytes)',
    '$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms ($content, $true)',
    '$signer = New-Object System.Security.Cryptography.Pkcs.CmsSigner ($cert)',
    '$signer.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::EndCertOnly',
    '$cms.ComputeSignature($signer)',
    'Write-Output ([Convert]::ToBase64String($cms.Encode()))',
  ].join('\n');
}

function verifyScript(payloadPath, signaturePath) {
  return [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Security',
    `$bytes = [System.IO.File]::ReadAllBytes("${payloadPath.replace(/\\/g, '\\\\')}")`,
    `$sig = [Convert]::FromBase64String([System.IO.File]::ReadAllText("${signaturePath.replace(/\\/g, '\\\\')}"))`,
    '$content = New-Object System.Security.Cryptography.Pkcs.ContentInfo (,$bytes)',
    '$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms ($content, $true)',
    '$cms.Decode($sig)',
    '$cms.CheckSignature($true)',
    'Write-Output ($cms.SignerInfos[0].Certificate.Thumbprint)',
  ].join('\n');
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    execFile(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.killed ? 'DSC_TIMEOUT' : 'DSC_TOOL_FAILED', detail: String(stderr || err.message || '').trim().slice(0, 300), stdout: String(stdout || '').trim() });
      else resolve({ ok: true, stdout: String(stdout || '').trim() });
    });
  });
}

export async function listDscCertificates({ run = runPowerShell } = {}) {
  if (process.platform !== 'win32') return { ok: false, error: 'DSC_WINDOWS_ONLY', hint: 'A DSC token is read through the Windows certificate store; sign from the Windows desktop.' };
  const out = await run(LIST_SCRIPT);
  if (!out.ok) return out;
  let rows;
  try {
    rows = out.stdout ? JSON.parse(out.stdout) : [];
  } catch {
    return { ok: false, error: 'DSC_LIST_UNREADABLE' };
  }
  const today = localToday();
  const certificates = (Array.isArray(rows) ? rows : [rows]).filter((row) => row && THUMBPRINT.test(String(row.thumbprint || ''))).map((row) => ({
    thumbprint: String(row.thumbprint),
    subject: String(row.subject || ''),
    issuer: String(row.issuer || ''),
    notBefore: String(row.notBefore || ''),
    notAfter: String(row.notAfter || ''),
    expired: String(row.notAfter || '') < today,
  }));
  return { ok: true, certificates };
}

export function dscSignaturesOf(state) {
  state.dscSignatures = Array.isArray(state.dscSignatures) ? state.dscSignatures : [];
  return state.dscSignatures;
}

function withTempFiles(work) {
  const dir = mkdtempSync(join(tmpdir(), 'myca-dsc-'));
  return Promise.resolve(work(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

export async function signBytesWithCertificate(bytes, thumbprint, { run = runPowerShell } = {}) {
  if (process.platform !== 'win32') return { ok: false, error: 'DSC_WINDOWS_ONLY' };
  return withTempFiles(async (dir) => {
    const payloadPath = join(dir, 'payload.bin');
    writeFileSync(payloadPath, bytes);
    const out = await run(signScript(thumbprint, payloadPath));
    if (!out.ok) return out.stdout === 'NO_CERT' ? { ok: false, error: 'DSC_CERT_NOT_FOUND', thumbprint } : out;
    if (out.stdout === 'NO_CERT') return { ok: false, error: 'DSC_CERT_NOT_FOUND', thumbprint };
    if (!/^[A-Za-z0-9+/=]+$/.test(out.stdout)) return { ok: false, error: 'DSC_SIGNATURE_UNREADABLE' };
    return { ok: true, signature: out.stdout, algorithm: 'PKCS7-detached' };
  });
}

export async function verifyDetachedSignature(bytes, signatureBase64, { run = runPowerShell } = {}) {
  if (process.platform !== 'win32') return { ok: false, error: 'DSC_WINDOWS_ONLY' };
  return withTempFiles(async (dir) => {
    const payloadPath = join(dir, 'payload.bin');
    const signaturePath = join(dir, 'signature.b64');
    writeFileSync(payloadPath, bytes);
    writeFileSync(signaturePath, String(signatureBase64 || ''));
    const out = await run(verifyScript(payloadPath, signaturePath));
    if (!out.ok) return { ok: false, error: 'DSC_SIGNATURE_INVALID', detail: out.detail };
    return { ok: true, thumbprint: out.stdout };
  });
}

function payloadOf(state, args) {
  if (args.documentSha256) {
    const sha = String(args.documentSha256).trim().toLowerCase();
    if (!isSha256(sha)) return { ok: false, error: 'INVALID_SHA256' };
    const stored = documentsOf(state).readVerified(sha);
    if (!stored.ok) return stored;
    return { ok: true, bytes: Buffer.from(String(stored.content), 'utf8'), sha256: sha, what: `document ${sha.slice(0, 12)}` };
  }
  const text = String(args.text || '');
  if (!text.trim()) return { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Give the uploaded document (documentSha256) or the text to sign.' };
  const bytes = Buffer.from(text, 'utf8');
  return { ok: true, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), what: `${bytes.length} bytes of text` };
}

export function planDscSign(state, args = {}) {
  const thumbprint = String(args.thumbprint || '').trim().toUpperCase();
  if (!THUMBPRINT.test(thumbprint)) return { ok: false, error: 'BAD_THUMBPRINT', hint: 'A certificate thumbprint is forty hexadecimal characters; list them with dsc_certificates.' };
  const payload = payloadOf(state, args);
  if (!payload.ok) return payload;
  const purpose = String(args.purpose || '').trim().slice(0, 120);
  return { ok: true, plan: { thumbprint, sha256: payload.sha256, bytes: payload.bytes, what: payload.what, purpose } };
}

export async function signWithDsc(state, args = {}, actor, { run = runPowerShell } = {}) {
  const planned = planDscSign(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const params = { thumbprint: plan.thumbprint, sha256: plan.sha256, purpose: plan.purpose };
  const out = await performExternalAction(state, {
    actionId: 'dsc_sign',
    actor,
    params,
    clientId: normalizeClientId(state.activeClientId),
    approvalId: args.caApprovalId || '',
    metadata: { what: plan.what, purpose: plan.purpose },
    fixture: () => ({ ok: true, signature: Buffer.from(createHash('sha256').update(`mock-dsc:${plan.thumbprint}:${plan.sha256}`).digest()).toString('base64'), algorithm: 'PKCS7-detached' }),
  }, () => signBytesWithCertificate(plan.bytes, plan.thumbprint, { run }));
  if (!out.ok) return out;
  const stored = documentsOf(state).put(out.signature);
  const record = { id: `DSC-${String(dscSignaturesOf(state).length + 1).padStart(4, '0')}`, on: localToday(), thumbprint: plan.thumbprint, sha256: plan.sha256, purpose: plan.purpose, signatureSha256: stored.sha256, algorithm: out.algorithm || 'PKCS7-detached', signedBy: actor?.userId || 'owner', mock: Boolean(out.mock) };
  const list = dscSignaturesOf(state);
  list.push(record);
  if (list.length > MAX_SIGNATURES) list.splice(0, list.length - MAX_SIGNATURES);
  return { ok: true, signature: record, mock: Boolean(out.mock) };
}

export function dscWords(name, result) {
  if (name === 'dsc_certificates') {
    const list = result.data?.certificates || [];
    if (!list.length) return 'No signing certificate with a private key is on this machine. Plug in the DSC token and install its driver, then ask again.';
    return `Signing certificates on this machine:\n${list.map((c) => `· ${c.subject.replace(/^CN=/, '')} (${c.thumbprint.slice(0, 8)}…, valid to ${c.notAfter}${c.expired ? ', EXPIRED' : ''})`).join('\n')}\nSay "sign <document> with <thumbprint>" when a CA has approved it.`;
  }
  if (name === 'dsc_sign' && (result.data?.signature || result.signature)) {
    const s = result.data?.signature || result.signature;
    return `${s.mock ? 'Simulated: ' : ''}${s.id}: signed ${s.purpose || `sha256 ${s.sha256.slice(0, 12)}`} with certificate ${s.thumbprint.slice(0, 8)}… on ${s.on}; the detached PKCS#7 signature is stored as document ${s.signatureSha256.slice(0, 12)}.${s.mock ? ' No token was used.' : ''}`;
  }
  return '';
}
