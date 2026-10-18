import { isNegated, isQuestion, normalizeChat } from './intent.mjs';

const PLAN = /^(?:what\s+(?:should\s+i|to|do\s+i\s+need\s+to)\s+(?:re)?order|restock(?:\s+plan)?|re-?order\s+plan|stock\s+running\s+(?:out|low)|what(?:'s| is)\s+running\s+(?:out|low)|kya\s+order\s+karna\s+hai|stock\s+khatam\s+ho\s+raha\s+hai)\s*\??$/i;
const ORDER = /^(?:order|reorder|purchase\s+order(?:\s+for)?)\s+(\d{1,6})\s+(?:units?\s+|pcs\s+|pieces\s+)?(?:of\s+)?([A-Za-z0-9][A-Za-z0-9._-]{0,39})(?:\s+from\s+([A-Za-z][A-Za-z0-9 .&'-]{1,60}?))?(?:\s+at\s+(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?))?\s*$/i;
const SUPPLY = /^([A-Za-z0-9][A-Za-z0-9._-]{0,39})\s+(?:comes|is)\s+from\s+([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)(?:,?\s+(?:lead\s+(?:time\s+)?)?(\d{1,3})\s+days)?(?:,?\s+pack\s+(?:of\s+)?(\d{1,5}))?(?:,?\s+(?:moq|minimum(?:\s+order)?)\s+(\d{1,6}))?\s*$/i;

export function planRestockFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw)) return null;
  if (PLAN.test(raw)) return { kind: 'tool', name: 'restock_plan', args: {} };
  if (isQuestion(raw)) return null;
  const order = raw.match(ORDER);
  if (order) {
    const sku = order[2].toUpperCase();
    const known = state.skus && typeof state.skus === 'object' && Object.hasOwn(state.skus, sku);
    const moved = (state.stockMoves || []).some((m) => m.sku === sku);
    if (!known && !moved) return null;
    const supplier = (order[3] || state.skus?.[sku]?.supply?.supplier || '').trim();
    if (!supplier) return { kind: 'reply', reply: `Say the supplier, for example "order ${order[1]} of ${sku} from Ravi Packaging", or record the supplier once with "${sku} comes from Ravi Packaging, 10 days". I have recorded nothing.`, tools: [] };
    const line = { sku, qty: Number(order[1]) };
    if (order[4]) line.rate = Number(order[4].replace(/,/g, ''));
    return { kind: 'tool', name: 'record_purchase_order', args: { supplier, lines: [line] } };
  }
  const supply = raw.match(SUPPLY);
  if (supply) {
    const sku = supply[1].toUpperCase();
    const known = state.skus && typeof state.skus === 'object' && Object.hasOwn(state.skus, sku);
    const moved = (state.stockMoves || []).some((m) => m.sku === sku);
    if (!known && !moved) return null;
    const args = { sku, supplier: supply[2].trim() };
    if (supply[3]) args.leadDays = Number(supply[3]);
    if (supply[4]) args.pack = Number(supply[4]);
    if (supply[5]) args.moq = Number(supply[5]);
    return { kind: 'tool', name: 'set_sku_supply', args };
  }
  return null;
}
