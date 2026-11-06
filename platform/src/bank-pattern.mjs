export const MAX_PATTERN = 120;
export const MAX_QUANTIFIERS = 8;
export const MAX_OPEN_REPEATS = 3;

const LOOKAROUND = new Set(['(?=', '(?!', '(?<=', '(?<!']);
const BRACES = /^\{(\d+)(?:,(\d*))?\}/;

function quantifierAt(text, at) {
  const ch = text[at];
  if (ch === '*' || ch === '+' || ch === '?') return { length: 1, open: ch !== '?' };
  if (ch !== '{') return null;
  const found = BRACES.exec(text.slice(at, at + 24));
  if (!found) return null;
  const min = Number(found[1]);
  const max = found[2] === undefined ? min : found[2] === '' ? Infinity : Number(found[2]);
  return { length: found[0].length, open: max > min + 1 };
}

function classEnd(text, at) {
  let i = at + 1;
  if (text[i] === '^') i += 1;
  if (text[i] === ']') i += 1;
  while (i < text.length && text[i] !== ']') i += text[i] === '\\' ? 2 : 1;
  return i < text.length ? i : -1;
}

export function safePatternProblem(source) {
  const text = String(source == null ? '' : source);
  if (!text.trim()) return 'The pattern is empty.';
  if (text.length > MAX_PATTERN) return `The pattern is longer than ${MAX_PATTERN} characters.`;
  let depth = 0;
  let quantifiers = 0;
  let openRepeats = 0;
  let last = 'start';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) return 'The pattern ends with a lone backslash.';
      if (/[1-9]/.test(next) || (next === 'k' && text[i + 2] === '<')) return 'Backreferences like \\1 are not allowed.';
      last = next === 'b' || next === 'B' ? 'anchor' : 'atom';
      i += 2;
      continue;
    }
    if (ch === '[') {
      const end = classEnd(text, i);
      if (end < 0) return 'A [ is not closed.';
      i = end + 1;
      last = 'atom';
      continue;
    }
    if (ch === '(') {
      if (LOOKAROUND.has(text.slice(i, i + 3)) || LOOKAROUND.has(text.slice(i, i + 4))) return 'Lookahead and lookbehind, like (?=...) or (?<!...), are not allowed.';
      if (text[i + 1] === '?' && text[i + 2] !== ':') return 'Only plain groups like (NEFT|IMPS) are allowed.';
      depth += 1;
      if (depth > 1) return 'A group inside a group is not allowed.';
      i += text[i + 1] === '?' ? 3 : 1;
      last = 'open';
      continue;
    }
    if (ch === ')') {
      if (depth === 0) return 'A ) has no matching (.';
      depth -= 1;
      i += 1;
      last = 'group';
      continue;
    }
    if (ch === '|') {
      i += 1;
      last = 'alt';
      continue;
    }
    if (ch === '^' || ch === '$') {
      i += 1;
      last = 'anchor';
      continue;
    }
    const quantifier = quantifierAt(text, i);
    if (quantifier) {
      if (last === 'group') return 'A repeat on a group, like (a+)+ or (ab)*, is not allowed; repeat one character or a class like [A-Z] instead.';
      if (last === 'quantifier') return 'Two repeats in a row, like a++ or a+?, are not allowed.';
      if (last !== 'atom') return 'A repeat like + or * needs a character before it.';
      quantifiers += 1;
      if (quantifiers > MAX_QUANTIFIERS) return `More than ${MAX_QUANTIFIERS} repeats; use contains for a plain text match instead.`;
      if (quantifier.open) {
        openRepeats += 1;
        if (openRepeats > MAX_OPEN_REPEATS) return `More than ${MAX_OPEN_REPEATS} open-ended repeats like .* or \\d+; keep the pattern short or use contains.`;
      }
      i += quantifier.length;
      last = 'quantifier';
      continue;
    }
    i += 1;
    last = 'atom';
  }
  if (depth > 0) return 'A ( is not closed.';
  return '';
}
