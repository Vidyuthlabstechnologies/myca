import { exportTallyXml, tallyVouchers } from './tally-export.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { mockModeEnabled } from './runtime-config.mjs';
import { performExternalAction } from './action-gate.mjs';
import { normalizeClientId } from './books.mjs';

const DEFAULT_URL = 'http://127.0.0.1:9000';

export function tallyUrl(args = {}) {
  const configured = process.env.MYCA_TALLY_HOST ? `http://${process.env.MYCA_TALLY_HOST}:${process.env.MYCA_TALLY_PORT || 9000}` : '';
  const given = String(args.url || configured || DEFAULT_URL).trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(given);
  } catch {
    return { ok: false, error: 'BAD_TALLY_URL', url: given };
  }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    return { ok: false, error: 'TALLY_NOT_LOCAL', url: given, hint: 'Tally is reached on this machine only, for example http://127.0.0.1:9000.' };
  }
  return { ok: true, url: parsed.origin };
}

function tagNumber(xml, tag) {
  const found = new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`, 'i').exec(xml);
  return found ? Number(found[1]) : 0;
}

export function parseTallyReply(xml) {
  const text = String(xml || '');
  const lineErrors = [...text.matchAll(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/gi)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean);
  return {
    created: tagNumber(text, 'CREATED'),
    altered: tagNumber(text, 'ALTERED'),
    errors: tagNumber(text, 'ERRORS') || lineErrors.length,
    lineErrors: lineErrors.slice(0, 10),
  };
}

function pushesOf(state) {
  state.tallyPushes = state.tallyPushes && typeof state.tallyPushes === 'object' ? state.tallyPushes : {};
  return state.tallyPushes;
}

export function planTallyPush(state, args = {}) {
  const period = String(args.period || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(period)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.' };
  const target = tallyUrl(args);
  if (!target.ok) return target;
  if (!String(state.company?.name || '').trim()) return { ok: false, error: 'COMPANY_NAME_REQUIRED', hint: 'Tally imports into the company by name; set the business name first.' };
  const { vouchers, ledgers } = tallyVouchers(state, period);
  if (!vouchers.length) return { ok: false, error: 'NOTHING_TO_PUSH', period };
  const earlier = pushesOf(state)[period] || null;
  if (earlier && !args.again) return { ok: false, error: 'ALREADY_PUSHED', period, pushedOn: earlier.on, created: earlier.created, hint: 'Tally would receive the vouchers a second time. Say "push again" only after deleting them in Tally.' };
  return { ok: true, plan: { period, url: target.url, vouchers: vouchers.length, ledgers: ledgers.size, company: state.company.name, again: Boolean(earlier) } };
}

export async function pushTally(state, args = {}, actor) {
  const planned = planTallyPush(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const file = exportTallyXml(state, { period: plan.period });
  if (!file.ok) return file;
  const xml = file.data?.xml || file.xml;
  const reply = await performExternalAction(state, {
    actionId: 'tally_push',
    actor,
    params: { period: plan.period, url: plan.url, vouchers: plan.vouchers, ledgers: plan.ledgers },
    clientId: normalizeClientId(state.activeClientId),
    metadata: { company: plan.company },
    fixture: () => ({ ok: true, text: `<RESPONSE><CREATED>${plan.vouchers + plan.ledgers}</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>` }),
  }, (transports) => transports.tally.send(plan.url, xml));
  if (!reply.ok) return { ...reply, url: plan.url, hint: reply.error === 'TALLY_UNREACHABLE' || reply.error === 'TALLY_TIMEOUT' ? 'Open Tally with the company loaded and its HTTP server on (F12 Configuration, Advanced Configuration, port 9000).' : reply.hint };
  const parsed = parseTallyReply(reply.text);
  const record = { period: plan.period, on: localToday(), url: plan.url, vouchers: plan.vouchers, ledgers: plan.ledgers, created: parsed.created, altered: parsed.altered, errors: parsed.errors, lineErrors: parsed.lineErrors, mock: mockModeEnabled() };
  if (parsed.errors) return { ok: false, error: 'TALLY_REJECTED', ...record };
  pushesOf(state)[plan.period] = record;
  return { ok: true, push: record, mock: record.mock };
}

export function tallyPushWords(result, money) {
  const p = result.push;
  return `${p.mock ? 'Simulated: ' : ''}${p.period}: ${p.vouchers} ${p.vouchers === 1 ? 'voucher' : 'vouchers'} and ${p.ledgers} ledgers sent to Tally at ${p.url}; Tally created ${p.created} and altered ${p.altered}.${p.mock ? ' Nothing was sent.' : ' Check the Day Book in Tally before relying on it.'}`;
}
