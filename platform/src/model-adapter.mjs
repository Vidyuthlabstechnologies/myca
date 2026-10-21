import { loadEnvFile } from './runtime-config.mjs';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 30000;
const MAX_TOKENS = 1024;
const NO_ACTION = 'no_matching_action';

let transportOverride = null;

export function setModelTransport(transport) {
  transportOverride = typeof transport === 'function' ? transport : null;
}

function setting(name) {
  const fromProcess = String(process.env[name] || '').trim();
  if (fromProcess) return fromProcess;
  return String(loadEnvFile()[name] || '').trim();
}

export function modelConfig() {
  const apiKey = setting('MYCA_MODEL_API_KEY');
  return {
    configured: Boolean(apiKey) || Boolean(transportOverride),
    model: setting('MYCA_MODEL') || DEFAULT_MODEL,
    baseUrl: (setting('MYCA_MODEL_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey,
  };
}

export function modelConfigured() {
  return modelConfig().configured;
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function callModel(body) {
  const config = modelConfig();
  if (transportOverride) return transportOverride(body);
  if (!config.apiKey) return { ok: false, error: 'MODEL_NOT_CONFIGURED' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': API_VERSION },
      body: JSON.stringify({ model: config.model, max_tokens: MAX_TOKENS, ...body }),
      signal: controller.signal,
    });
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_RESPONSE_BYTES) return { ok: false, error: 'MODEL_RESPONSE_TOO_LARGE', bytes: declared };
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) return { ok: false, error: 'MODEL_RESPONSE_TOO_LARGE', bytes: text.length };
    if (!res.ok) return { ok: false, error: 'MODEL_HTTP_ERROR', status: res.status, detail: text.slice(0, 300) };
    return { ok: true, response: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'MODEL_TIMEOUT' : 'MODEL_UNREACHABLE', detail: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

function toolUseOf(response) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  return blocks.find((block) => block && block.type === 'tool_use') || null;
}

const SYSTEM_CHOOSE = [
  'You route one message from a small business owner to exactly one bookkeeping tool.',
  'You never compute, round, convert or estimate any amount, rate, date or tax: pass the figures the owner typed through unchanged, and leave a field out rather than guess it.',
  'Choose a tool that changes the books only when the owner clearly asked for that change; a question gets a read-only tool.',
  `When no tool fits, or the message is ambiguous, call ${NO_ACTION} and say briefly why.`,
].join(' ');

export async function chooseTool({ message, tools, country = 'IN', history = [] }) {
  const text = String(message || '').trim();
  if (!text) return { ok: false, error: 'EMPTY_MESSAGE' };
  const offered = (tools || []).map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
  offered.push({ name: NO_ACTION, description: 'Nothing offered fits this message, or it is too ambiguous to act on.', input_schema: { type: 'object', additionalProperties: false, properties: { reason: { type: 'string' } } } });
  const called = await callModel({
    system: `${SYSTEM_CHOOSE} The business is in ${country === 'US' ? 'the United States' : 'India'}.`,
    tools: offered,
    tool_choice: { type: 'any' },
    messages: [...history, { role: 'user', content: text }],
  });
  if (!called.ok) return called;
  const use = toolUseOf(called.response);
  if (!use) return { ok: false, error: 'MODEL_NO_TOOL' };
  if (use.name === NO_ACTION) return { ok: false, error: 'MODEL_NO_MATCH', reason: String(use.input?.reason || '') };
  return { ok: true, name: String(use.name), args: use.input && typeof use.input === 'object' ? use.input : {} };
}

const SYSTEM_CHOOSE_AMONG = [
  'You answer one multiple-choice question for a bookkeeper by calling the tool with exactly one of the offered values.',
  'You never compute, round, convert or invent any amount, rate or date.',
].join(' ');

export async function chooseAmong({ question, options, instructions = '' }) {
  const values = (options || []).map((o) => String(o.value));
  if (!String(question || '').trim() || !values.length) return { ok: false, error: 'EMPTY_QUESTION' };
  const called = await callModel({
    system: `${SYSTEM_CHOOSE_AMONG} ${instructions}`.trim(),
    tools: [{ name: 'choose', description: 'The one option that fits.', input_schema: { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: 'string', enum: values } } } }],
    tool_choice: { type: 'tool', name: 'choose' },
    messages: [{ role: 'user', content: `${question}\n\nOptions:\n${(options || []).map((o) => `- ${o.value}: ${o.label}`).join('\n')}` }],
  });
  if (!called.ok) return called;
  const use = toolUseOf(called.response);
  const value = use && use.name === 'choose' ? String(use.input?.value ?? '') : '';
  if (!values.includes(value)) return { ok: false, error: 'MODEL_NO_MATCH' };
  return { ok: true, value };
}

const SYSTEM_TRANSLATE = [
  'You translate one message between a small business owner and their bookkeeping assistant.',
  'Translate the meaning faithfully and keep every number, amount, date, invoice or bill id, GSTIN, name and currency symbol exactly as written, in the same digits.',
  'Keep line breaks, bullet marks and quotation marks. Add nothing and leave nothing out.',
].join(' ');

export async function translateWithModel({ text, from, to }) {
  const value = String(text || '');
  if (!value.trim()) return { ok: true, text: value };
  const called = await callModel({
    system: `${SYSTEM_TRANSLATE} Translate from ${from} to ${to}.`,
    tools: [{ name: 'translation', description: 'The translated text.', input_schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } } }],
    tool_choice: { type: 'tool', name: 'translation' },
    messages: [{ role: 'user', content: value.slice(0, 20000) }],
  });
  if (!called.ok) return called;
  const use = toolUseOf(called.response);
  if (!use || use.name !== 'translation' || typeof use.input?.text !== 'string') return { ok: false, error: 'MODEL_NO_TOOL' };
  return { ok: true, text: use.input.text };
}

const SYSTEM_READ = [
  'You read one business document and copy what it says into the structure asked for.',
  'Copy figures exactly as printed; never total, split, convert or infer a number that is not on the page.',
  'Leave a field out when the page does not show it. Dates are YYYY-MM-DD.',
].join(' ');

function documentBlock(content) {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(content || '').trim());
  if (!match) return { type: 'text', text: String(content || '').slice(0, 60000) };
  const mediaType = match[1].toLowerCase();
  const data = match[2].replace(/\s+/g, '');
  if (mediaType === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: mediaType, data } };
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

export async function extractWithModel({ content, schema, name, instructions = '' }) {
  const called = await callModel({
    system: `${SYSTEM_READ} ${instructions}`.trim(),
    tools: [{ name, description: 'The structured contents of the document.', input_schema: schema }],
    tool_choice: { type: 'tool', name },
    messages: [{ role: 'user', content: [documentBlock(content), { type: 'text', text: 'Read this document.' }] }],
  });
  if (!called.ok) return called;
  const use = toolUseOf(called.response);
  if (!use || use.name !== name) return { ok: false, error: 'MODEL_NO_TOOL' };
  return { ok: true, extracted: use.input && typeof use.input === 'object' ? use.input : {} };
}
