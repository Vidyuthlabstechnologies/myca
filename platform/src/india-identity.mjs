const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const CANDIDATE = /(?<![\w-])(?<!\d[.,])([2-9]\d{3})([ -]?)(\d{4})\2(\d{4})(?![\w-]|[.,]\d)/g;
const TOKEN = /\[AADHAAR-(\d{1,3})\]/g;

export function isAadhaar(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i += 1) c = D[c][P[i % 8][rev[i]]];
  return c === 0;
}

export function maskAadhaar(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  return /^\d{12}$/.test(digits) ? `XXXX XXXX ${digits.slice(8)}` : '';
}

function swapText(text, vault) {
  return String(text).replace(CANDIDATE, (match, a, _sep, b, c) => {
    const digits = `${a}${b}${c}`;
    if (!isAadhaar(digits)) return match;
    let index = vault.indexOf(digits);
    if (index < 0) index = vault.push(digits) - 1;
    return `[AADHAAR-${index + 1}]`;
  });
}

function swapBlock(block, vault) {
  if (typeof block === 'string') return swapText(block, vault);
  if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') return { ...block, text: swapText(block.text, vault) };
  if (block && typeof block === 'object' && block.type === 'tool_result') {
    const content = Array.isArray(block.content) ? block.content.map((item) => swapBlock(item, vault)) : swapBlock(block.content, vault);
    return { ...block, content };
  }
  if (block && typeof block === 'object' && block.type === 'tool_use' && block.input) return { ...block, input: swapDeep(block.input, vault) };
  return block;
}

function swapDeep(value, vault, depth = 0) {
  if (depth > 20) return value;
  if (typeof value === 'string') return swapText(value, vault);
  if (Array.isArray(value)) return value.map((item) => swapDeep(item, vault, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, swapDeep(item, vault, depth + 1)]));
  return value;
}

export function pseudonymiseAadhaar(body) {
  const vault = [];
  if (!body || typeof body !== 'object') return { body, vault };
  const out = { ...body };
  if (typeof out.system === 'string') out.system = swapText(out.system, vault);
  else if (Array.isArray(out.system)) out.system = out.system.map((block) => swapBlock(block, vault));
  if (Array.isArray(out.messages)) {
    out.messages = out.messages.map((message) => ({
      ...message,
      content: Array.isArray(message.content) ? message.content.map((block) => swapBlock(block, vault)) : swapBlock(message.content, vault),
    }));
  }
  return { body: out, vault };
}

function restoreText(text, vault) {
  return String(text).replace(TOKEN, (match, n) => vault[Number(n) - 1] || match);
}

export function restoreAadhaar(value, vault, depth = 0) {
  if (!vault.length || depth > 20) return value;
  if (typeof value === 'string') return restoreText(value, vault);
  if (Array.isArray(value)) return value.map((item) => restoreAadhaar(item, vault, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreAadhaar(item, vault, depth + 1)]));
  return value;
}
