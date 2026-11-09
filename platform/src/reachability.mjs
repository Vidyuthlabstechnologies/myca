import { connect } from 'node:net';
import { GOVT_SITES, publicGovtConfig } from './nic-config.mjs';

const PROBE_TIMEOUT_MS = 10000;
const PAGE_TIMEOUT_MS = 15000;

function probeSignal(signal) {
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

export async function probeGovt(fetchFn = fetch, { signal } = {}) {
  const targets = [
    { id: 'gst.gov.in', url: GOVT_SITES.gstHome },
    { id: 'einvoice1.gst.gov.in', url: GOVT_SITES.einvoicePortal },
    { id: 'einv-apisandbox.nic.in (portal)', url: GOVT_SITES.nicSandbox },
    { id: 'IRP sandbox gateway', url: `${GOVT_SITES.nicAuthSandbox.replace('/eivital/v1.04/auth', '')}/eivital/v1.04/heartbeat/ping` },
    { id: 'mca.gov.in', url: GOVT_SITES.mca },
    { id: 'eportal.incometax.gov.in', url: GOVT_SITES.itePortal },
  ];
  const hits = [];
  for (const t of targets) {
    if (signal?.aborted) break;
    const started = Date.now();
    try {
      const res = await fetchFn(t.url, {
        method: 'GET',
        headers: { accept: 'application/json, text/plain, text/html, */*', 'user-agent': 'MyCA/0.1 (local books; GSTN/NIC client)' },
        signal: probeSignal(signal),
        redirect: 'follow',
      });
      await res.body?.cancel().catch(() => {});
      hits.push({ id: t.id, url: t.url, ok: res.status > 0, status: res.status, ms: Date.now() - started });
    } catch (err) {
      hits.push({ id: t.id, url: t.url, ok: false, status: 0, error: String(err.message || err), ms: Date.now() - started });
    }
  }
  return {
    at: new Date().toISOString(),
    live: hits.filter((h) => h.ok).length,
    total: hits.length,
    hits,
    config: publicGovtConfig(),
    note: 'HTTP to official hosts from this machine. Auth/IRN still need your NIC client-id and API user.',
  };
}

export async function fetchPublicPage(url, { timeoutMs = PAGE_TIMEOUT_MS, signal } = {}) {
  const started = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(String(url), {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'MyCA/0.1 (local books; portal watch)', 'accept-language': 'en-IN,en' },
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      redirect: 'follow',
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status, ms: Date.now() - started };
    return { ok: true, status: res.status, text, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err), ms: Date.now() - started };
  }
}

export async function probeTcp(host, port, timeoutMs = 1500, { signal } = {}) {
  if (signal?.aborted) return { status: 'error', error: 'ABORTED', host, port };
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const onAbort = () => done({ status: 'error', error: 'ABORTED', host, port });
    const done = (result) => {
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      resolve(result);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done({ status: 'ok', host, port }));
    socket.once('timeout', () => done({ status: 'error', error: 'timeout', host, port }));
    socket.once('error', (err) => done({ status: 'error', error: String(err.code || err.message || err), host, port }));
  });
}
