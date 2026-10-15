const MAX_PARTS = 50;

function headerBlock(raw) {
  const split = raw.search(/\r?\n\r?\n/);
  if (split < 0) return { headers: raw, body: '' };
  const sep = raw.slice(split).match(/^\r?\n\r?\n/)[0];
  return { headers: raw.slice(0, split), body: raw.slice(split + sep.length) };
}

export function parseHeaders(block) {
  const out = {};
  for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    out[name] = out[name] ? `${out[name]}, ${value}` : value;
  }
  return out;
}

export function parameter(header, name) {
  const match = new RegExp(`;\\s*${name}\\*?=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(header || '');
  if (!match) return '';
  const value = match[1] ?? match[2] ?? '';
  const encoded = /^(?:utf-8|iso-8859-1)'[^']*'(.*)$/i.exec(value);
  return encoded ? safeDecode(encoded[1]) : value;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function decodeWord(value) {
  return String(value || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset, kind, text) => {
    const bytes = /b/i.test(kind) ? base64Bytes(text) : qpBytes(text.replace(/_/g, ' '));
    return textOf(bytes, charset);
  });
}

function base64Bytes(text) {
  const clean = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function qpBytes(text) {
  const src = String(text).replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function textOf(bytes, charset) {
  try {
    return new TextDecoder(String(charset || 'utf-8').toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function bytesOf(body, encoding) {
  const enc = String(encoding || '7bit').toLowerCase();
  if (enc === 'base64') return base64Bytes(body);
  if (enc === 'quoted-printable') return qpBytes(body);
  return new TextEncoder().encode(body);
}

export function base64Of(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function walk(raw, out, depth) {
  if (out.parts.length >= MAX_PARTS || depth > 8) return;
  const { headers: block, body } = headerBlock(raw);
  const headers = parseHeaders(block);
  const type = String(headers['content-type'] || 'text/plain').split(';')[0].trim().toLowerCase();
  if (type.startsWith('multipart/')) {
    const boundary = parameter(headers['content-type'], 'boundary');
    if (!boundary) return;
    const pieces = body.split(new RegExp(`(?:^|\\r?\\n)--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?(?:\\r?\\n|$)`));
    for (const piece of pieces.slice(1)) {
      if (piece.trim()) walk(piece, out, depth + 1);
    }
    return;
  }
  const disposition = String(headers['content-disposition'] || '');
  const name = decodeWord(parameter(disposition, 'filename') || parameter(headers['content-type'], 'name'));
  const bytes = bytesOf(body, headers['content-transfer-encoding']);
  if (name || /^attachment/i.test(disposition)) {
    out.parts.push({ kind: 'attachment', name: name || `attachment-${out.parts.length + 1}`, mime: type, bytes });
    return;
  }
  if (type === 'text/plain' && !out.text) {
    out.text = textOf(bytes, parameter(headers['content-type'], 'charset'));
    return;
  }
  if (type === 'text/html' && !out.html) out.html = textOf(bytes, parameter(headers['content-type'], 'charset'));
}

export function parseMail(raw) {
  const { headers: block } = headerBlock(raw);
  const headers = parseHeaders(block);
  const out = { parts: [], text: '', html: '' };
  walk(raw, out, 0);
  return {
    from: decodeWord(headers.from || ''),
    to: decodeWord(headers.to || ''),
    subject: decodeWord(headers.subject || ''),
    text: out.text,
    html: out.html,
    attachments: out.parts,
  };
}

export function addressOf(header) {
  const angle = /<([^>]+)>/.exec(header || '');
  const bare = angle ? angle[1] : String(header || '').split(',')[0];
  return bare.trim().toLowerCase();
}
