const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DAY = /(?<![\w-])(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?![\w-])/g;
const MONTH = /(?<![\w-])(20\d{2})-(0[1-9]|1[0-2])(?![\w-])/g;

export function inWords(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(DAY, (_, y, m, d) => `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`)
    .replace(MONTH, (_, y, m) => `${MONTHS[Number(m) - 1]} ${y}`);
}

export function spoken(out) {
  if (!out || typeof out !== 'object') return out;
  const next = { ...out, reply: inWords(out.reply) };
  if (out.preview && typeof out.preview === 'object') {
    next.preview = {
      ...out.preview,
      summary: inWords(out.preview.summary),
      ...(Array.isArray(out.preview.effects) ? { effects: out.preview.effects.map(inWords) } : {}),
      ...(Array.isArray(out.preview.blockers) ? { blockers: out.preview.blockers.map(inWords) } : {}),
    };
  }
  return next;
}
