const MAX_REPLY_BYTES = 1024 * 1024;

export async function sendToTally(url, xml, signal) {
  let res;
  try {
    res = await fetch(`${url}/`, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8' }, body: xml, signal });
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' || err?.name === 'TimeoutError' ? 'TALLY_TIMEOUT' : 'TALLY_UNREACHABLE', detail: String(err?.message || err).slice(0, 200) };
  }
  const text = await res.text();
  if (text.length > MAX_REPLY_BYTES) return { ok: false, error: 'TALLY_REPLY_TOO_LARGE' };
  if (!res.ok) return { ok: false, error: 'TALLY_HTTP_ERROR', status: res.status, detail: text.slice(0, 300) };
  return { ok: true, text };
}
