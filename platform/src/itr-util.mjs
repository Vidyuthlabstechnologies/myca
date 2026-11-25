export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const rupees = (value) => Math.max(0, Math.round(Number(value) || 0));
export const signed = (value) => Math.round(Number(value) || 0);
export const sum = (...values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

export function mergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(target, key) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      mergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function layer(target, patch, path, itemAt) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const isObject = value && typeof value === 'object' && !Array.isArray(value);
    if (!isObject) {
      target[key] = value;
      continue;
    }
    if (!Object.hasOwn(target, key) || typeof target[key] !== 'object' || target[key] === null) {
      const base = itemAt([...path, key]);
      target[key] = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    }
    layer(target[key], value, [...path, key], itemAt);
  }
  return target;
}
