const WORD = /\w/;

function isWord(ch) {
  return ch !== undefined && WORD.test(ch);
}

export function asciiLower(text) {
  return String(text).replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

export function xmlSource(text, { ignoreCase = false } = {}) {
  const raw = String(text ?? '');
  return { text: raw, hay: ignoreCase ? asciiLower(raw) : raw, ignoreCase };
}

function tagAt(hay, name, from, lead, prefixed) {
  let at = from;
  for (;;) {
    const hit = hay.indexOf(name, at);
    if (hit < 0) return null;
    let start = -1;
    const plain = hit - lead.length;
    if (plain >= 0 && hay.startsWith(lead, plain)) {
      start = plain;
    } else if (prefixed && hay[hit - 1] === ':') {
      let p = hit - 2;
      while (p >= 0 && isWord(hay[p])) p -= 1;
      const led = p + 1 - lead.length;
      if (p < hit - 2 && led >= 0 && hay.startsWith(lead, led)) start = led;
    }
    if (start >= from) return { start, after: hit + name.length };
    at = hit + 1;
  }
}

function closeAt(hay, name, from, prefixed) {
  let at = from;
  for (;;) {
    const found = tagAt(hay, name, at, '</', prefixed);
    if (!found) return null;
    if (hay[found.after] === '>') return { start: found.start, end: found.after + 1 };
    at = found.after;
  }
}

function openAt(hay, name, from, { prefixed, boundary, exact }) {
  let at = from;
  for (;;) {
    const found = tagAt(hay, name, at, '<', prefixed);
    if (!found) return null;
    const next = hay[found.after];
    if (!(boundary && isWord(next)) && !(exact && next !== '>')) return found;
    at = found.after;
  }
}

export function xmlOpenings(source, name, options = {}) {
  const { hay, ignoreCase } = source;
  const key = ignoreCase ? asciiLower(name) : name;
  const found = [];
  let at = 0;
  let gt = -1;
  for (;;) {
    const open = openAt(hay, key, at, options);
    if (!open) break;
    if (gt < open.after) gt = hay.indexOf('>', open.after);
    if (gt < 0) break;
    if (!found.length || found[found.length - 1].bodyFrom !== gt + 1) found.push({ start: open.start, bodyFrom: gt + 1 });
    at = open.after;
  }
  return found;
}

export function xmlElements(source, name, options = {}) {
  const { text, hay, ignoreCase } = source;
  const key = ignoreCase ? asciiLower(name) : name;
  const found = [];
  let at = 0;
  for (;;) {
    const open = openAt(hay, key, at, options);
    if (!open) break;
    let bodyFrom = open.after;
    if (!options.bare) {
      const gt = hay.indexOf('>', open.after);
      if (gt < 0) break;
      bodyFrom = gt + 1;
    }
    const close = closeAt(hay, key, bodyFrom, options.prefixed);
    if (!close) break;
    found.push({ outer: text.slice(open.start, close.end), inner: text.slice(bodyFrom, close.start) });
    at = close.end;
    if (options.first) break;
  }
  return found;
}

export function xmlFirst(source, name, options = {}) {
  const found = xmlElements(source, name, { ...options, first: true });
  return found.length ? found[0] : null;
}

export function withoutCdataMarks(text) {
  const raw = String(text);
  const OPEN = '<![CDATA[';
  const CLOSE = ']]>';
  let out = '';
  let at = 0;
  for (;;) {
    const open = raw.indexOf(OPEN, at);
    if (open < 0) break;
    const close = raw.indexOf(CLOSE, open + OPEN.length);
    if (close < 0) break;
    out += raw.slice(at, open) + raw.slice(open + OPEN.length, close);
    at = close + CLOSE.length;
  }
  return out + raw.slice(at);
}

export function soleCdata(text) {
  const trimmed = String(text).trim();
  if (!trimmed.startsWith('<![CDATA[') || !trimmed.endsWith(']]>') || trimmed.length < 12) return null;
  return trimmed.slice(9, -3);
}
