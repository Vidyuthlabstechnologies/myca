const INTERNAL_NAMES = /(^|\.)(localhost|local|internal|localdomain|home\.arpa|lan|intranet|corp)$/;
const METADATA_NAMES = new Set(['metadata.google.internal', 'metadata', 'metadata.goog', 'instance-data', 'instance-data.ec2.internal']);

function ipv4Parts(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

function ipv4Internal([a, b, c]) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

function ipv6Groups(host) {
  let text = host;
  const dotted = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (dotted) {
    const v4 = ipv4Parts(dotted[2]);
    if (!v4) return null;
    text = `${dotted[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/.test(text) || !text.includes(':')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function ipv6Internal(groups) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embedded = [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255];
  if (groups.slice(0, 5).every((group) => group === 0) && (g5 === 0 || g5 === 0xffff)) return g5 === 0 && g6 === 0 && g7 <= 1 ? true : ipv4Internal(embedded);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return ipv4Internal(embedded);
  if (g0 === 0x2002) return ipv4Internal([g1 >> 8, g1 & 255, g2 >> 8, g2 & 255]);
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if (g0 === 0x2001 && g1 === 0xdb8) return true;
  return false;
}

function bareHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export function internalHost(hostname) {
  const host = bareHost(hostname);
  if (!host) return true;
  const v4 = ipv4Parts(host);
  if (v4) return ipv4Internal(v4);
  if (host.includes(':')) {
    const groups = ipv6Groups(host);
    return groups ? ipv6Internal(groups) : true;
  }
  if (/^[\d.]+$/.test(host) || /^0x/.test(host)) return true;
  if (!host.includes('.')) return true;
  return INTERNAL_NAMES.test(host) || METADATA_NAMES.has(host);
}

export function metadataHost(hostname) {
  const host = bareHost(hostname);
  if (METADATA_NAMES.has(host)) return true;
  const v4 = ipv4Parts(host);
  if (v4) return v4[0] === 169 && v4[1] === 254;
  if (!host.includes(':')) return false;
  const groups = ipv6Groups(host);
  if (!groups) return false;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if (groups[0] === 0xfd00 && groups[1] === 0xec2) return true;
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  return mapped && groups[6] >> 8 === 169 && (groups[6] & 255) === 254;
}

export function publicHttpsUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return internalHost(url.hostname) ? null : url;
}

export async function readCapped(res, limitBytes) {
  const declared = Number(res.headers?.get?.('content-length') || 0);
  if (declared > limitBytes) return { ok: false, error: 'RESPONSE_TOO_LARGE', bytes: declared };
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    const text = await res.text();
    return Buffer.byteLength(text, 'utf8') > limitBytes ? { ok: false, error: 'RESPONSE_TOO_LARGE', bytes: Buffer.byteLength(text, 'utf8') } : { ok: true, text };
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, error: 'RESPONSE_TOO_LARGE', bytes: total };
    }
    chunks.push(value);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}
