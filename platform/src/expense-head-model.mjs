import { EXPENSE_HEADS, GENERAL_HEAD, headNamed } from './expenses.mjs';
import { chooseAmong, modelConfigured } from './model-adapter.mjs';

const NO_HEAD = 'none';

export async function suggestExpenseHead({ description = '', payee = '' } = {}) {
  const text = [String(description || '').trim(), String(payee || '').trim()].filter(Boolean).join(' paid to ');
  if (!text || !modelConfigured()) return { ok: false, error: 'MODEL_NOT_CONFIGURED' };
  const options = EXPENSE_HEADS.filter((head) => head.code !== GENERAL_HEAD).map((head) => ({ value: head.code, label: `${head.name}${head.keywords.length ? ` (for example ${head.keywords.slice(0, 5).join(', ')})` : ''}` }));
  options.push({ value: NO_HEAD, label: 'None of these fits, or the wording is too vague to tell.' });
  const chosen = await chooseAmong({
    question: `Which expense head fits this Indian small-business expense: "${text}"?`,
    options,
    instructions: 'Pick the head a bookkeeper would use from the wording alone. Never change or add any figure. When unsure, choose none.',
  });
  if (!chosen.ok) return chosen;
  const head = headNamed(chosen.value);
  if (!head || chosen.value === NO_HEAD) return { ok: false, error: 'MODEL_NO_MATCH' };
  return { ok: true, head: head.code, headName: head.name, why: `"${text}" reads as ${head.name} to the model; tap to change it.` };
}
