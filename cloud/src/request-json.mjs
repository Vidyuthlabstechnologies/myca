const CONVERSION_KEYS = new Set(['toString', 'valueOf']);

function storable(key, value) {
  if (CONVERSION_KEYS.has(key)) return undefined;
  return typeof value === 'string' && value.includes('\u0000') ? value.replaceAll('\u0000', '') : value;
}

export function parseRequestJson(text) {
  return /\\u0000|"(?:toString|valueOf)"/.test(text) ? JSON.parse(text, storable) : JSON.parse(text);
}
