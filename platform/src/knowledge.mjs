import { performExternalAction } from './action-gate.mjs';
import { searchFirmNotes } from './practice.mjs';
import { normalizeClientId } from './books.mjs';

const STOP = new Set(['what', 'does', 'do', 'did', 'the', 'our', 'about', 'with', 'from', 'that', 'this', 'have', 'has', 'had', 'for', 'and', 'are', 'was', 'were', 'when', 'where', 'which', 'who', 'how', 'why', 'say', 'said', 'notes', 'note', 'know', 'tell', 'me', 'us', 'any', 'anything', 'there', 'their', 'they', 'them', 'into', 'than', 'then', 'been', 'being', 'will', 'would', 'should', 'could', 'please']);
const MAX_HITS = 12;
const MAX_CONTEXT = 6000;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function keywordsOf(question) {
  const words = String(question || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((word) => word.length >= 3 && !STOP.has(word));
  return [...new Set(words)].slice(0, 8);
}

export function gatherNotes(state, question) {
  const hits = new Map();
  for (const word of keywordsOf(question)) {
    const found = searchFirmNotes(state, { query: word });
    if (!found.ok) continue;
    for (const hit of found.data.hits) {
      const key = `${hit.kind}:${hit.id}`;
      const existing = hits.get(key);
      if (existing) existing.matched += 1;
      else hits.set(key, { ...hit, matched: 1 });
    }
  }
  return [...hits.values()].sort((a, b) => b.matched - a.matched || String(b.on).localeCompare(String(a.on))).slice(0, MAX_HITS);
}

export function knowledgePrompt(question, notes) {
  let context = '';
  for (const note of notes) {
    const line = `[${note.kind} ${note.id}${note.on ? ` ${note.on}` : ''}] ${note.title}: ${note.excerpt}\n`;
    if (context.length + line.length > MAX_CONTEXT) break;
    context += line;
  }
  return {
    systemPrompt: 'You answer questions for an accounting firm using only the notes supplied. Quote the note id you relied on. If the notes do not answer the question, say what is missing. Never state an amount, a date, a rate or a deadline that is not in the notes, and never calculate.',
    prompt: `Notes:\n${context}\nQuestion: ${question}`,
  };
}

function mockAnswer(question, notes) {
  if (!notes.length) return `Simulated: the notes do not cover "${question}".`;
  return `Simulated answer from ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}: ${notes.slice(0, 3).map((note) => `[${note.kind} ${note.id}] ${note.excerpt}`).join(' ')}`;
}

export async function askKnowledge(state, args = {}, actor) {
  const question = String(args.question || '').trim();
  if (question.length < 3) return fail('QUESTION_REQUIRED');
  const notes = gatherNotes(state, question);
  if (!notes.length) return { ok: true, question, notes, answered: false };
  const built = knowledgePrompt(question, notes);
  const result = await performExternalAction(state, {
    actionId: 'knowledge_answer',
    clientId: normalizeClientId(state.activeClientId),
    params: { question, noteIds: notes.map((note) => `${note.kind}:${note.id}`) },
    actor: actor || { userId: 'owner' },
    metadata: { notes: notes.length },
    payload: { question, notes: notes.length },
    fixture: () => ({ ok: true, mock: true, simulated: true, data: { reply: mockAnswer(question, notes), model: 'mock' } }),
  }, async (transports) => {
    const out = await transports.nim.complete({ prompt: built.prompt, systemPrompt: built.systemPrompt, temperature: 0.1, maxTokens: 700 });
    if (!out.ok) return fail(out.error || 'MODEL_FAILED', { hint: out.hint });
    return { ok: true, data: { reply: String(out.reply || out.text || '').trim(), model: out.model || '' } };
  });
  if (!result.ok) return { ok: true, question, notes, answered: false, blocked: result.error, hint: result.hint || '', dryRun: Boolean(result.dryRun) };
  return { ok: true, question, notes, answered: true, answer: result.data.reply, model: result.data.model, mock: Boolean(result.mock) };
}

export function knowledgeWords(result) {
  const found = result.notes?.length ? `${result.notes.length} ${result.notes.length === 1 ? 'note' : 'notes'} found` : 'no notes found';
  const listed = (result.notes || []).slice(0, 5).map((note) => `· ${note.kind} ${note.id}: ${note.excerpt}`).join('\n');
  if (result.blocked) return `I could not ask the model (${result.blocked}${result.hint ? `: ${result.hint}` : ''}); ${found}.${listed ? `\n${listed}` : ''}`;
  if (!result.answered) return `Nothing in the firm's notes mentions that. Add a note or a document first, then ask again.`;
  return `${result.mock ? 'Simulated: ' : ''}${result.answer}\n\nFrom ${found}:\n${listed}`;
}
