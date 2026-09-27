const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/i;

export function normalizeChat(text) {
  return String(text || '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+-\s+(books|itc|ap|gst input|follow).*$/i, '')
    .trim();
}

const PARTY_KEYWORDS = /^(at|rate|for|from|to|gstin|gst|invoice|purchase|bill|sale|sales)$/i;

function cleanPartyName(candidate) {
  if (!candidate) return '';
  const name = String(candidate).trim().replace(/[.,]$/, '');
  if (!name || PARTY_KEYWORDS.test(name)) return '';
  return name;
}

const QUESTION_OPENERS = /^\s*(?:what|which|when|where|why|who|whose|whom|how|is|are|was|were|am|has|have|had|does|did|do|can|could|should|would|will|may|might|shall|show|list|tell|explain|status|any|anything)\b/i;
const NEGATIONS = /\b(?:do\s*not|don'?t|never|stop|avoid|cancel|without|no\s+need)\b/i;

// A question about the books must never change the books.
export function isQuestion(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return false;
  if (/\?\s*$/.test(raw)) return true;
  return QUESTION_OPENERS.test(raw);
}

export function isNegated(text) {
  return NEGATIONS.test(String(text == null ? '' : text));
}

export function parseDocument(text) {
  const raw = normalizeChat(text);
  const gstinMatch = raw.match(GSTIN_RE);
  const gstin = gstinMatch ? gstinMatch[1].toUpperCase() : '';
  const rest = gstin ? raw.replace(gstinMatch[0], ' ') : raw;
  const at = rest.match(/(?:\bat\b|@|\brate\b)\s*₹?\s*([\d,]+(?:\.\d+)?)/i) || rest.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  const gstMatch = rest.match(/gst\s*(\d{1,2})\s*%/i);
  const partyMatch = rest.match(
    /(?:purchase|invoice|bill)\s+(?:from|for|to)\s+([A-Za-z][A-Za-z0-9 .&'-]{1,50}?)(?=\s+(?:gstin|,|\d)|$)/i,
  ) || rest.match(/from\s+([A-Za-z][A-Za-z0-9 .&'-]{1,50}?)(?=\s+(?:gstin|,|\d)|$)/i)
    || rest.match(/(?:purchase|invoice|bill)\s+([A-Za-z][A-Za-z0-9 .&'-]{1,50}?)(?=,|\s+(?:gstin|at|@|rate|gst|\d)|$)/i);
  if (!at) return null;
  const qtyWord = rest.match(/(\d+(?:\.\d+)?)\s*(?:rolls?|pcs|pieces|units|qty|kg)/i);
  return {
    partyName: cleanPartyName(partyMatch ? partyMatch[1] : '') || 'Walk-in',
    partyGstin: gstin,
    partyState: gstin.slice(0, 2),
    lines: [{
      description: 'Supply',
      qty: qtyWord ? Number(qtyWord[1]) : 1,
      rate: Number(String(at[1]).replace(/,/g, '')),
      gstRate: gstMatch ? Number(gstMatch[1]) : 18,
    }],
  };
}

export function isPurchaseIntent(text) {
  const t = normalizeChat(text).toLowerCase();
  if (/\b(purchase|purchases|vendor|supplier|itc)\b/.test(t)) return true;
  if (/\bbill from\b|\bbuy from\b/.test(t)) return true;
  return false;
}

export function isSaleIntent(text) {
  const t = normalizeChat(text).toLowerCase();
  if (isPurchaseIntent(t)) return false;
  return /\b(invoice|raise bill|create bill|tax invoice|sell|sales? to)\b/.test(t);
}

export const ROUTES = [
  { re: /\btrial\s*balance\b|\bdoes (the )?books? tie\b/i, tool: 'trial_balance' },
  { re: /\bchart of accounts\b|\bcoa\b/i, tool: 'chart_of_accounts' },
  { re: /\bjournal\b|\bday book\b/i, tool: 'journal' },
  { re: /\blist invoices\b|\bshow invoices\b/i, tool: 'list_invoices' },
  { re: /\bgst payable\b|\bgst liability\b|\bhow much gst\b/i, tool: 'gst_payable' },
  { re: /\bgstr-?1\s*json\b|\bexport gstr/i, tool: 'export_gstr1_json' },
  { re: /\bgstr-?1\b|\bprepare gstr 1\b/i, tool: 'prepare_gstr1' },
  { re: /\bprobe govt\b|\bconnect gst\b|\bgovt status\b|\bnic sandbox\b/i, tool: 'govt_probe' },
  { re: /\bnic auth\b|\be-?invoice auth\b/i, tool: 'govt_nic_auth' },
  { re: /\bfiling pack\b|\bfile gst\b/i, tool: 'filing_pack' },
  { re: /\bsandbox\b.*\b(adapter|operation|handoff|plan)\b|\badapter\b.*\bsandbox\b/i, tool: 'sandbox_adapter_plan' },
  { re: /\b(sandbox|quicko|provider catalog|provider map|provider coverage|api provider)\b/i, tool: 'provider_catalog' },
  { re: /\b(api|integration|connector|requirements?|prd).*(readiness|needed|needs|status|ids?)|\bwhat apis\b/i, tool: 'integration_readiness' },
  { re: /\bgstr-?3b\b/i, tool: 'prepare_gstr3b' },
  { re: /\bitr\b|\bregime compare\b/i, tool: 'prepare_itr' },
  { re: /\btds\b/i, tool: 'monitor_tds' },
  { re: /\bdeadline|\bdue date\b/i, tool: 'deadlines' },
  { re: /\breconcil|\bgstr-?2b\b|\brule 37/i, tool: 'gst_reconcile' },
  { re: /\baudit\b|\bworking paper\b|\bcaro\b|\b3cd\b/i, tool: 'audit_books' },
  { re: /\bapprovals?\b|\bpending approvals?\b/i, tool: 'approval_list' },
  { re: /\bcompany\b|\bour gstin\b/i, tool: 'company_profile' },
];
