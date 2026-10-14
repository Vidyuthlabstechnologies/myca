const MAX_TURNS = 6;
const MAX_TEXT = 500;

function turns(state) {
  if (!Array.isArray(state.chatRecent)) state.chatRecent = [];
  return state.chatRecent;
}

export function rememberTurn(state, message, reply) {
  const text = String(message || '').trim().slice(0, MAX_TEXT);
  const answer = String(reply || '').trim().slice(0, MAX_TEXT);
  if (!text || !answer) return;
  const list = turns(state);
  list.push({ user: text, assistant: answer });
  if (list.length > MAX_TURNS) list.splice(0, list.length - MAX_TURNS);
}

export function recentTurns(state) {
  const out = [];
  for (const turn of Array.isArray(state.chatRecent) ? state.chatRecent : []) {
    if (!turn || typeof turn.user !== 'string' || typeof turn.assistant !== 'string') continue;
    out.push({ role: 'user', content: turn.user }, { role: 'assistant', content: turn.assistant });
  }
  return out;
}

export function forgetTurns(state) {
  state.chatRecent = [];
  return { ok: true, data: { forgotten: true } };
}
