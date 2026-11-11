const PORT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const provided = new Map();

export function providePort(name, implementation) {
  const key = String(name || '');
  if (!PORT_NAME.test(key)) throw new Error(`BAD_PORT_NAME:${key}`);
  if (implementation === null || implementation === undefined) provided.delete(key);
  else provided.set(key, implementation);
}

export function hasPort(name) {
  return provided.has(String(name || ''));
}

export function port(name) {
  const key = String(name || '');
  if (!provided.has(key)) throw new Error(`PORT_NOT_PROVIDED:${key}`);
  return provided.get(key);
}

export function portOr(name, fallback) {
  const key = String(name || '');
  return provided.has(key) ? provided.get(key) : fallback;
}
