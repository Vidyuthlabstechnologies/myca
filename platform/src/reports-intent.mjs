import { isNegated, isQuestion, normalizeChat } from './intent.mjs';
import { saidPeriod } from './filing-intent.mjs';

const SAVE = /^save\s+(?:this\s+)?report\s+(?:called\s+|named\s+|as\s+)?["“]?([^:"”]{1,60}?)["”]?\s*:\s*(.+)$/i;
const RUN = /^(?:run|show|open)\s+(?:the\s+)?report\s+["“]?(.+?)["”]?\s*$/i;
const LIST = /^(?:my|list|saved|show)\s+(?:saved\s+)?reports\s*\??$/i;
const DELETE = /^(?:delete|remove|forget)\s+(?:the\s+)?(?:saved\s+)?report\s+["“]?(.+?)["”]?\s*$/i;
const ATTACH = /^attach\s+(?:it|this|the\s+(?:document|photo|receipt|bill))\s+to\s+([A-Za-z]{2,6}-\d{3,})\s*$/i;
const METRIC = /\b(sales|purchases|expenses|owed|owing)\b/i;
const GROUP = /\bby\s+(customer|supplier|head|month)s?\b/i;
const PERIOD = /\b(this\s+month|last\s+month|this\s+quarter|this\s+year|last\s+year)\b/i;
const COMPARE = /\b(?:vs|versus|against|compared?\s+(?:with|to))\s+(?:the\s+)?(?:last|previous)\b/i;

export function planReportFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw)) return null;
  const attach = raw.match(ATTACH);
  if (attach) {
    const sha = state.pendingFile?.sha256 || '';
    if (!sha) return { kind: 'reply', reply: 'Read or attach the document first, then say which entry to keep it with. I have changed nothing.', tools: [] };
    return { kind: 'tool', name: 'attach_document', args: { documentSha256: sha, id: attach[1].toUpperCase() } };
  }
  if (LIST.test(raw)) return { kind: 'tool', name: 'list_reports', args: {} };
  if (isQuestion(raw)) return null;
  const del = raw.match(DELETE);
  if (del) return { kind: 'tool', name: 'delete_report', args: { name: del[1].trim() } };
  const run = raw.match(RUN);
  if (run) return { kind: 'tool', name: 'run_report', args: { name: run[1].trim() } };
  const save = raw.match(SAVE);
  if (save) {
    const spec = save[2];
    const metric = (spec.match(METRIC) || [])[1];
    if (!metric) return { kind: 'reply', reply: 'Say what the report is of: sales, purchases, expenses, owed or owing, for example "save report Top customers: sales by customer this month vs last month". I have saved nothing.', tools: [] };
    const args = { name: save[1].trim(), metric: metric.toLowerCase() };
    const group = (spec.match(GROUP) || [])[1];
    if (group) args.groupBy = group.toLowerCase();
    const period = (spec.match(PERIOD) || [])[1];
    const month = saidPeriod(spec);
    if (period) args.period = period.toLowerCase().replace(/\s+/g, '-');
    else if (month) args.period = month;
    if (COMPARE.test(spec)) args.compare = true;
    return { kind: 'tool', name: 'save_report', args };
  }
  return null;
}
