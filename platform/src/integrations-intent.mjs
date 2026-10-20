import { isNegated, isQuestion, normalizeChat } from './intent.mjs';
import { saidPeriod } from './filing-intent.mjs';

const TALLY = /\b(?:push|send|export|post)\b.*\bto\s+tally\b|\btally\s+push\b|\bpush\s+tally\b/i;
const AGAIN = /\bagain\b|\bonce\s+more\b|\bre-?push\b/i;
const CERTS = /^(?:(?:my|list|show)\s+)?(?:dsc|signing)\s+(?:certificates?|tokens?)\s*\??$|^which\s+dsc\b/i;
const SIGN = /^(?:dsc\s+)?sign\s+(.+?)\s+with\s+(?:dsc\s+|certificate\s+|thumbprint\s+)?([0-9A-Fa-f]{40})\s*$/i;
const SHA = /^[0-9a-f]{64}$/i;

export function planIntegrationFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw)) return null;
  if (CERTS.test(raw)) return { kind: 'tool', name: 'dsc_certificates', args: {} };
  if (isQuestion(raw)) return null;
  const sign = raw.match(SIGN);
  if (sign) {
    const what = sign[1].trim();
    const args = { thumbprint: sign[2].toUpperCase() };
    if (SHA.test(what)) args.documentSha256 = what.toLowerCase();
    else if (state.pendingFile?.sha256) { args.documentSha256 = state.pendingFile.sha256; args.purpose = what; }
    else return { kind: 'reply', reply: `Attach or upload the document to sign first, then say "sign it with ${sign[2].toUpperCase()}". Nothing was signed.`, tools: [] };
    return { kind: 'tool', name: 'dsc_sign', args };
  }
  if (TALLY.test(raw)) {
    const args = {};
    const period = saidPeriod(raw);
    if (period) args.period = period;
    if (AGAIN.test(raw)) args.again = true;
    return { kind: 'tool', name: 'push_tally', args };
  }
  return null;
}
