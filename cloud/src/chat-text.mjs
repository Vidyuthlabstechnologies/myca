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

// The app's language for the assistant's reply ('mr', 'ta', ...). The engine ignores codes it does not
// support, so only a short lowercase code is passed on; without one the actor is passed on unchanged.
export function withChatLanguage(actor, lang) {
  const code = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
  if (!/^[a-z]{2,3}$/.test(code) || code === 'en') return actor;
  return { ...actor, lang: code };
}
