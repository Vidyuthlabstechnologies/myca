const LIMIT = 2000;
const LONG_RUN = /\s{4,}/g;

export function chatText(value) {
  let text = '';
  try {
    text = String(value ?? '');
  } catch {
    text = '';
  }
  return text.slice(0, LIMIT).replace(LONG_RUN, (run) => run[0]);
}
