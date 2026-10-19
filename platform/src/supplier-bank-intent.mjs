import { isNegated, isQuestion, normalizeChat } from './intent.mjs';

const PAID_TO = /^([A-Za-z][A-Za-z0-9 .&'-]{1,60}?)\s+(?:is|are|gets?)\s+paid\s+(?:to|into|at|via)\s+(.+)$/i;
const ACCOUNT = /\b(?:a\/c|account|acct)\.?\s*(?:no\.?|number)?\s*[:#]?\s*(\d[\d ]{0,24})/i;
const IFSC = /\bifsc\s*[:#]?\s*([A-Za-z]{4}0[A-Za-z0-9]{6})\b/i;
const UPI = /\bupi\s*(?:id)?\s*[:#]?\s*([a-z0-9._-]{2,64}@[a-z]{2,32})/i;
const FILE = /^(?:supplier\s+)?payout\s+file\b|^(?:bulk\s+)?neft\s+file\b|\bpayout\s+file\s+for\s+(?:the\s+)?suppliers\b/i;

export function planSupplierBankFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw) || isQuestion(raw)) return null;
  if (FILE.test(raw)) return { kind: 'tool', name: 'supplier_payout_file', args: {} };
  const said = raw.match(PAID_TO);
  if (!said) return null;
  const name = said[1].trim();
  const known = (state.purchases || []).some((bill) => String(bill.partyName || '').trim().toLowerCase() === name.toLowerCase());
  if (!known) return null;
  const rest = said[2];
  const account = (rest.match(ACCOUNT) || [])[1];
  const ifsc = (rest.match(IFSC) || [])[1];
  const upi = (rest.match(UPI) || [])[1];
  if (!account && !upi) return { kind: 'reply', reply: `Say the account and IFSC, or the UPI id, for example "${name} is paid to account 1234567890 IFSC HDFC0001234". I have recorded nothing.`, tools: [] };
  const args = { partyName: name };
  if (account) args.account = account.replace(/\s/g, '');
  if (ifsc) args.ifsc = ifsc.toUpperCase();
  if (upi) args.upi = upi.toLowerCase();
  return { kind: 'tool', name: 'set_supplier_bank', args };
}
