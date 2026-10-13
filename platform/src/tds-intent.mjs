import { isNegated, isQuestion, normalizeChat, receiptAmount, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const SECTION = /\b(?:u\/s|under|section|sec\.?)?\s*(194\s*-?\s*[ACIJ])\b/i;
const PAN = /\bPAN\s*[:#-]?\s*([A-Z]{5}\s?[0-9]{4}\s?[A-Z])\b/i;
const TAN = /\bTAN\s*[:#-]?\s*([A-Z]{4}\s?[0-9]{5}\s?[A-Z])\b/i;
const CHALLAN = /\b(?:challan|cin)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9 /-]{4,40}?)(?=\s*(?:,|$|\bon\b|\bfor\b|\bdated\b))/i;

function sectionOf(text) {
  const found = text.match(SECTION);
  return found ? found[1].replace(/[\s-]/g, '').toUpperCase() : '';
}

const ENTRY_TOOLS = ['create_purchase', 'post_expense'];

export function withoutTds(text) {
  return String(text || '')
    .replace(/\bPAN\s*[:#-]?\s*[A-Z]{5}\s?[0-9]{4}\s?[A-Z]\b/gi, ' ')
    .replace(/\b(?:u\/s|under|section|sec\.?)?\s*194\s*-?\s*[ACIJ]\b/gi, ' ')
    .replace(/\b(?:with|deduct|less)?\s*tds\b/gi, ' ')
    .replace(/\s*,\s*(?=,|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function planEntryWithTds(planText, text) {
  const first = planText(text);
  if (!/\btds\b/i.test(String(text || ''))) return first;
  const cleaned = withoutTds(text);
  const again = cleaned && cleaned !== text ? planText(cleaned) : first;
  const entry = again && again.kind === 'tool' && ENTRY_TOOLS.includes(again.name) ? again : first;
  return withTdsFromText(entry, text);
}

export function withTdsFromText(plan, text) {
  const raw = normalizeChat(text);
  if (!plan || plan.kind !== 'tool' || !ENTRY_TOOLS.includes(plan.name)) return plan;
  if (!/\btds\b/i.test(raw) || /\b(?:no|without)\s+tds\b/i.test(raw)) return plan;
  const section = sectionOf(raw);
  const pan = (raw.match(PAN) || [])[1];
  if (!section) {
    return { kind: 'reply', reply: 'Say which TDS section applies: 194C for a contractor, 194J for professional or technical fees, 194I for rent, or 194A for interest. I have recorded nothing.', tools: [] };
  }
  const args = { ...plan.args, tdsSection: section };
  if (pan) args.payeePan = pan.replace(/\s+/g, '').toUpperCase();
  if (section === '194J') {
    const category = /\btechnical\b|\broyalt/i.test(raw) ? 'technical' : /\bdirector\b/i.test(raw) ? 'director' : /\bprofessional\b|\bprofession\b|\bconsult|\blegal\b|\baudit\b/i.test(raw) ? 'professional' : '';
    if (category) args.tdsCategory = category;
  }
  if (section === '194I') {
    const asset = /\bplant\b|\bmachine|\bequipment\b/i.test(raw) ? 'plant' : /\bbuilding\b|\boffice\b|\bshop\b|\bland\b|\bfurniture\b|\bgodown\b|\bwarehouse\b|\bpremises\b/i.test(raw) ? 'building' : '';
    if (asset) args.tdsAsset = asset;
  }
  return { ...plan, args };
}

export function planTdsFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\btds\b/i.test(raw) || isNegated(raw)) return null;
  if (/\b(?:we|i)\s+(?:also\s+)?deduct\s+tds\b|\btds\s+deductor\b|\bour\s+tan\b|\btan\s+is\b/i.test(raw)) {
    const tan = (raw.match(TAN) || [])[1];
    if (!tan) return { kind: 'reply', reply: 'Say the TAN as well, for example "we deduct TDS, TAN MUMA12345B". I have recorded nothing.', tools: [] };
    return { kind: 'tool', name: 'set_tds_deductor', args: { tan: tan.replace(/\s+/g, '').toUpperCase() } };
  }
  if (/\bdeposit(?:ed)?\b.*\btds\b|\btds\b.*\bdeposit(?:ed)?\b|\bpaid\s+(?:the\s+)?tds\b|\btds\s+paid\b|\btds\b.*\bchallan\b/i.test(raw) && !SECTION.test(raw) && !isQuestion(raw)) {
    const challan = (raw.match(CHALLAN) || [])[1];
    if (!challan) return { kind: 'reply', reply: 'Say the challan reference as well, for example "deposited TDS 12000, challan 0510308 05112026 12345". I have recorded nothing.', tools: [] };
    const amount = receiptAmount(raw.replace(CHALLAN, ' '));
    return {
      kind: 'tool',
      name: 'record_tds_deposit',
      args: {
        challan: challan.replace(/[\s/-]+/g, '').toUpperCase(),
        date: receiptDate(raw.replace(CHALLAN, ' '), localToday()),
        ...(amount == null ? {} : { amount }),
        ...(/\bcash\b/i.test(raw) ? { mode: 'cash' } : {}),
      },
    };
  }
  if (/\b(?:return|statement|review|quarter(?:ly)?|26q|24q|form)\b/i.test(raw)) return null;
  if (/^(?:my\s+|show\s+(?:my\s+)?|how\s+much\s+)?tds\b|\btds\s+(?:due|payable|to\s+deposit|summary)\b/i.test(raw)) {
    return { kind: 'tool', name: 'tds_summary', args: {} };
  }
  return null;
}
