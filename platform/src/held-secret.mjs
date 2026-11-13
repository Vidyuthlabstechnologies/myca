import { timingSafeEqual } from 'node:crypto';

function sameText(given, kept) {
  const left = Buffer.from(String(given ?? ''), 'utf8');
  const right = Buffer.from(String(kept ?? ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sameSecrets(given, kept) {
  if (!Array.isArray(given) || !Array.isArray(kept) || given.length !== kept.length) return false;
  let same = true;
  for (let i = 0; i < given.length; i += 1) same = sameText(given[i], kept[i]) && same;
  return same;
}
