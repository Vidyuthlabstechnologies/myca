const RELEASES_URL = 'https://api.github.com/repos/Vidyuthlabstechnologies/myca/releases/latest';
const DOWNLOAD_HOST = /^https:\/\/github\.com\/Vidyuthlabstechnologies\/myca\/releases\//;
const TIMEOUT_MS = 8000;

function parseVersion(value) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

function parseLatest(body) {
  if (!body || typeof body !== 'object') return null;
  const version = parseVersion(body.tag_name) ? String(body.tag_name).replace(/^v/, '') : null;
  if (!version || body.draft === true || body.prerelease === true) return null;
  const url = String(body.html_url || '');
  return { version, url: DOWNLOAD_HOST.test(url) ? url : '' };
}

async function checkForUpdate({ current, fetchImpl = globalThis.fetch, url = process.env.MYCA_UPDATE_URL || RELEASES_URL } = {}) {
  if (!parseVersion(current)) return { ok: false, error: 'BAD_CURRENT_VERSION' };
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, error: 'UPDATE_HTTP_ERROR', status: res.status };
    const latest = parseLatest(await res.json());
    if (!latest) return { ok: true, newer: false, current };
    return { ok: true, newer: compareVersions(latest.version, current) > 0, current, latest: latest.version, url: latest.url };
  } catch (err) {
    return { ok: false, error: err && err.name === 'TimeoutError' ? 'UPDATE_TIMEOUT' : 'UPDATE_UNREACHABLE' };
  }
}

module.exports = { parseVersion, compareVersions, parseLatest, checkForUpdate, RELEASES_URL };
