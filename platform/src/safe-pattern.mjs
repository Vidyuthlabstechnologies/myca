export const MAX_PATTERN = 120;
export const MAX_QUANTIFIERS = 8;
export const MAX_OPEN_REPEATS = 3;

const LOOKAROUND = new Set(['(?=', '(?!', '(?<=', '(?<!']);
const BRACES = /^\{(\d+)(?:,(\d*))?\}/;

const CLASS_ESCAPES = { d: '\\d', D: '\\D', s: '\\s', S: '\\S', w: '\\w', W: '\\W', n: '\\n', r: '\\r', t: '\\t', f: '\\f', v: '\\v' };
const WORD_ANCHORS = { b: '\\b', B: '\\B' };

function literal(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quantifierAt(text, at) {
  const ch = text[at];
  if (ch === '*' || ch === '+' || ch === '?') return { length: 1, open: ch !== '?', source: ch === '*' ? '*' : ch === '+' ? '+' : '?' };
  if (ch !== '{') return null;
  const found = BRACES.exec(text.slice(at, at + 24));
  if (!found) return null;
  const min = Number(found[1]);
  const max = found[2] === undefined ? min : found[2] === '' ? Infinity : Number(found[2]);
  const source = found[2] === undefined ? `{${min}}` : found[2] === '' ? `{${min},}` : `{${min},${max}}`;
  return { length: found[0].length, open: max > min + 1, source };
}

function escapeAt(text, at, inClass) {
  const next = text[at + 1];
  if (next === undefined) return { problem: 'The pattern ends with a lone backslash.' };
  if (CLASS_ESCAPES[next]) return { length: 2, source: CLASS_ESCAPES[next], kind: 'atom' };
  if (!inClass && WORD_ANCHORS[next]) return { length: 2, source: WORD_ANCHORS[next], kind: 'anchor' };
  if (/[1-9]/.test(next) || (next === 'k' && text[at + 2] === '<')) return { problem: 'Backreferences like \\1 are not allowed.' };
  if (/[A-Za-z0-9]/.test(next)) return { problem: `Escapes like \\${next} are not allowed; write the character itself.` };
  return { length: 2, source: next === '-' ? '\\-' : literal(next), kind: 'atom', char: next };
}

function classAt(text, at) {
  let i = at + 1;
  let source = '[';
  if (text[i] === '^') {
    source += '^';
    i += 1;
  }
  const member = () => {
    if (text[i] === '\\') {
      const escaped = escapeAt(text, i, true);
      if (escaped.problem) return escaped;
      i += escaped.length;
      return escaped;
    }
    const ch = text[i];
    i += 1;
    return { source: ch === '-' ? '\\-' : literal(ch), char: ch };
  };
  while (i < text.length && text[i] !== ']') {
    const low = member();
    if (low.problem) return low;
    if (low.char !== undefined && text[i] === '-' && i + 1 < text.length && text[i + 1] !== ']') {
      i += 1;
      const high = member();
      if (high.problem) return high;
      if (high.char === undefined) return { problem: 'A range like [a-\\d] is not allowed; write the characters out.' };
      source += `${low.source}-${high.source}`;
      continue;
    }
    source += low.source;
  }
  if (i >= text.length) return { problem: 'A [ is not closed.' };
  return { length: i + 1 - at, source: `${source}]` };
}

export function safePattern(source) {
  const text = String(source == null ? '' : source);
  const refuse = (problem) => ({ problem, source: '' });
  if (!text.trim()) return refuse('The pattern is empty.');
  if (text.length > MAX_PATTERN) return refuse(`The pattern is longer than ${MAX_PATTERN} characters.`);
  let out = '';
  let depth = 0;
  let quantifiers = 0;
  let openRepeats = 0;
  let last = 'start';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const escaped = escapeAt(text, i, false);
      if (escaped.problem) return refuse(escaped.problem);
      out += escaped.source;
      last = escaped.kind;
      i += escaped.length;
      continue;
    }
    if (ch === '[') {
      const cls = classAt(text, i);
      if (cls.problem) return refuse(cls.problem);
      out += cls.source;
      i += cls.length;
      last = 'atom';
      continue;
    }
    if (ch === '(') {
      if (LOOKAROUND.has(text.slice(i, i + 3)) || LOOKAROUND.has(text.slice(i, i + 4))) return refuse('Lookahead and lookbehind, like (?=...) or (?<!...), are not allowed.');
      if (text[i + 1] === '?' && text[i + 2] !== ':') return refuse('Only plain groups like (NEFT|IMPS) are allowed.');
      depth += 1;
      if (depth > 1) return refuse('A group inside a group is not allowed.');
      const silent = text[i + 1] === '?';
      out += silent ? '(?:' : '(';
      i += silent ? 3 : 1;
      last = 'open';
      continue;
    }
    if (ch === ')') {
      if (depth === 0) return refuse('A ) has no matching (.');
      depth -= 1;
      out += ')';
      i += 1;
      last = 'group';
      continue;
    }
    if (ch === '|') {
      out += '|';
      i += 1;
      last = 'alt';
      continue;
    }
    if (ch === '^' || ch === '$') {
      out += ch === '^' ? '^' : '$';
      i += 1;
      last = 'anchor';
      continue;
    }
    const quantifier = quantifierAt(text, i);
    if (quantifier) {
      if (last === 'group') return refuse('A repeat on a group, like (a+)+ or (ab)*, is not allowed; repeat one character or a class like [A-Z] instead.');
      if (last === 'quantifier') return refuse('Two repeats in a row, like a++ or a+?, are not allowed.');
      if (last !== 'atom') return refuse('A repeat like + or * needs a character before it.');
      quantifiers += 1;
      if (quantifiers > MAX_QUANTIFIERS) return refuse(`More than ${MAX_QUANTIFIERS} repeats; use contains for a plain text match instead.`);
      if (quantifier.open) {
        openRepeats += 1;
        if (openRepeats > MAX_OPEN_REPEATS) return refuse(`More than ${MAX_OPEN_REPEATS} open-ended repeats like .* or \\d+; keep the pattern short or use contains.`);
      }
      out += quantifier.source;
      i += quantifier.length;
      last = 'quantifier';
      continue;
    }
    out += ch === '.' ? '.' : literal(ch);
    i += 1;
    last = 'atom';
  }
  if (depth > 0) return refuse('A ( is not closed.');
  return { problem: '', source: out };
}

export function safePatternProblem(source) {
  return safePattern(source).problem;
}

const compiledPatterns = new Map();

export function regexOf(source) {
  const key = String(source == null ? '' : source);
  if (compiledPatterns.has(key)) return compiledPatterns.get(key);
  let re = null;
  const safe = safePattern(key);
  if (!safe.problem) {
    try {
      re = new RegExp(safe.source, 'i');
    } catch {
      re = null;
    }
  }
  if (compiledPatterns.size >= 500) compiledPatterns.clear();
  compiledPatterns.set(key, re);
  return re;
}
