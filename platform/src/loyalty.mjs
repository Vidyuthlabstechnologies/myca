import { appendAuditEvent } from './ca-api.mjs';
import { countryOf } from './country.mjs';
import { createInvoice, UNNAMED_BUYERS } from './invoice.mjs';
import { creditedAgainst } from './credit-notes.mjs';
import { localToday, postingDate } from './dates.mjs';
import { salaryPrivate } from './employees.mjs';

export const LOYALTY_DEFAULTS = Object.freeze({
  enabled: false,
  earnPoints: 1,
  earnPerRupees: 100,
  earnOn: 'taxable',
  pointValue: 1,
  minRedeemPoints: 0,
  maxRedeemPercent: 50,
  expiryMonths: 12,
});

export const EXPIRING_SOON_DAYS = 30;
const EARN_ON = ['taxable', 'total'];
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const text = (value) => String(value ?? '').trim();

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function loyaltyServes(state) {
  return countryOf(state) === 'IN';
}

function book(state) {
  if (!state.loyalty || typeof state.loyalty !== 'object') state.loyalty = { settings: null, entries: [], seq: 0 };
  if (!Array.isArray(state.loyalty.entries)) state.loyalty.entries = [];
  return state.loyalty;
}

function entriesOf(state) {
  return Array.isArray(state.loyalty?.entries) ? state.loyalty.entries : [];
}

export function loyaltySettings(state) {
  const saved = state.loyalty?.settings;
  return { ...LOYALTY_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}), configured: Boolean(saved) };
}

function pointValuePaise(settings) {
  return Math.round(Number(settings.pointValue) * 100);
}

export function pointsValue(settings, points) {
  return round2((Number(points) * pointValuePaise(settings)) / 100);
}

export function addMonths(isoDate, months) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const total = (m - 1) + Number(months);
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function addDays(isoDate, days) {
  const at = new Date(`${isoDate}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function isNamedCustomer(name) {
  return !UNNAMED_BUYERS.includes(text(name).toLowerCase());
}

function sameName(a, b) {
  return text(a).toLowerCase() === text(b).toLowerCase();
}

export function customerOf(state, { partyName, partyGstin } = {}) {
  const gstin = text(partyGstin).toUpperCase();
  const parties = state.parties || [];
  if (gstin) return parties.find((p) => text(p.gstin).toUpperCase() === gstin) || null;
  return parties.find((p) => !text(p.gstin) && sameName(p.name, partyName)) || parties.find((p) => sameName(p.name, partyName)) || null;
}

function keyOf(party) {
  return String(party.accountId ?? party.name);
}

function nextEntryId(state) {
  const ledger = book(state);
  ledger.seq = Number(ledger.seq || 0) + 1;
  return `LP-${String(ledger.seq).padStart(5, '0')}`;
}

function addEntry(state, entry) {
  const row = { id: nextEntryId(state), ...entry };
  book(state).entries.push(row);
  return row;
}

function ordered(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function consume(lots, wanted, preferInvoiceId) {
  const used = [];
  let left = wanted;
  const order = [...lots].filter((lot) => lot.left > 0).sort((a, b) => {
    const pa = preferInvoiceId && a.invoiceId === preferInvoiceId ? 0 : 1;
    const pb = preferInvoiceId && b.invoiceId === preferInvoiceId ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn) || a.order - b.order;
    if (a.expiresOn || b.expiresOn) return a.expiresOn ? -1 : 1;
    return a.order - b.order;
  });
  for (const lot of order) {
    if (left <= 0) break;
    const take = Math.min(lot.left, left);
    lot.left -= take;
    left -= take;
    used.push({ points: take, expiresOn: lot.expiresOn });
  }
  return { used, short: left };
}

export function replayCustomer(entries, asOf) {
  const lots = [];
  let deficit = 0;
  let expired = 0;
  let earned = 0;
  let redeemed = 0;
  const lapse = (day) => {
    for (const lot of lots) {
      if (lot.left > 0 && lot.expiresOn && lot.expiresOn <= day) {
        expired += lot.left;
        lot.left = 0;
      }
    }
  };
  for (const [order, entry] of ordered(entries).entries()) {
    if (entry.date > asOf) break;
    lapse(entry.date);
    const points = Number(entry.points || 0);
    if (entry.kind === 'earn') earned += points;
    if (entry.kind === 'redeem') redeemed += -points;
    if (points > 0) {
      const lot = { left: points, expiresOn: entry.expiresOn || null, invoiceId: entry.invoiceId || '', order };
      const paid = Math.min(deficit, lot.left);
      deficit -= paid;
      lot.left -= paid;
      lots.push(lot);
    } else if (points < 0) {
      const taken = consume(lots, -points, entry.kind === 'reverse' ? entry.invoiceId : '');
      deficit += taken.short;
    }
  }
  lapse(addDays(asOf, 1));
  const live = lots.filter((lot) => lot.left > 0);
  const balance = live.reduce((sum, lot) => sum + lot.left, 0) - deficit;
  return { balance, deficit, expired, earned, redeemed, lots: live.map((lot) => ({ points: lot.left, expiresOn: lot.expiresOn })) };
}

function customerEntries(state, key) {
  return entriesOf(state).filter((entry) => entry.customerKey === key);
}

function lastDateOf(entries, fallback) {
  return entries.reduce((last, entry) => (entry.date > last ? entry.date : last), fallback);
}

export function availablePoints(state, party, date) {
  const entries = customerEntries(state, keyOf(party));
  const atDate = replayCustomer(entries, date);
  const latest = replayCustomer(entries, lastDateOf(entries, date));
  return { balance: Math.min(atDate.balance, latest.balance), expired: atDate.expired, atDate };
}

function expiringSoon(lots, asOf) {
  const until = addDays(asOf, EXPIRING_SOON_DAYS);
  const byDay = new Map();
  for (const lot of lots) {
    if (!lot.expiresOn || lot.expiresOn > until) continue;
    byDay.set(lot.expiresOn, (byDay.get(lot.expiresOn) || 0) + lot.points);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([on, points]) => ({ points, on }));
}

export function pointsEarnedOn(settings, base) {
  const basePaise = Math.round(Number(base || 0) * 100);
  const stepPaise = Math.round(Number(settings.earnPerRupees) * 100);
  if (!(basePaise > 0) || !(stepPaise > 0)) return 0;
  return Math.floor((basePaise * Number(settings.earnPoints)) / stepPaise);
}

function earnBase(settings, invoice) {
  return settings.earnOn === 'total' ? Number(invoice.total || 0) : Number(invoice.taxable || 0);
}

export function grossTaxableOf(lines = []) {
  return (lines || []).reduce((sum, line) => {
    const qty = Number(line?.qty == null || line?.qty === '' ? 1 : line.qty);
    const rate = Number(line?.rate);
    return Number.isFinite(qty) && Number.isFinite(rate) ? sum + Math.round(qty * rate * 100) : sum;
  }, 0);
}

export const REDEEM_REASONS = {
  BAD_POINTS: 'Points to use are a whole number above zero.',
  LOYALTY_OFF: 'Loyalty points are switched off. Turn them on in loyalty settings first.',
  LOYALTY_NEEDS_CUSTOMER: 'Points belong to a named customer; a walk-in sale cannot use them.',
  LOYALTY_NOT_ON_EXPORT: 'Points cannot be used on an export invoice.',
  CUSTOMER_HAS_NO_POINTS: 'This customer has no points yet.',
  BELOW_MINIMUM: 'Fewer points than the minimum that can be used at one time.',
  POINTS_SHORT: 'The customer does not have that many points.',
  POINTS_EXPIRED: 'Some of the customer\'s points have expired, so there are not enough left.',
  OVER_MAX_SHARE: 'That is more of the bill than points may pay for.',
};

export function planRedemption(state, input = {}, date = postingDate(input.date)) {
  const points = Number(input.redeemPoints);
  if (!Number.isInteger(points) || points <= 0) return fail('BAD_POINTS', { hint: REDEEM_REASONS.BAD_POINTS });
  if (!loyaltyServes(state)) return fail('NOT_FOR_COUNTRY', { hint: 'Loyalty points are for Indian shops.' });
  const settings = loyaltySettings(state);
  if (!settings.enabled) return fail('LOYALTY_OFF', { hint: REDEEM_REASONS.LOYALTY_OFF });
  if (!isNamedCustomer(input.partyName)) return fail('LOYALTY_NEEDS_CUSTOMER', { hint: REDEEM_REASONS.LOYALTY_NEEDS_CUSTOMER });
  if (input.exportSale) return fail('LOYALTY_NOT_ON_EXPORT', { hint: REDEEM_REASONS.LOYALTY_NOT_ON_EXPORT });
  const party = customerOf(state, input);
  if (!party) return fail('CUSTOMER_HAS_NO_POINTS', { partyName: text(input.partyName), hint: REDEEM_REASONS.CUSTOMER_HAS_NO_POINTS });
  if (points < Number(settings.minRedeemPoints || 0)) return fail('BELOW_MINIMUM', { points, minRedeemPoints: settings.minRedeemPoints, hint: `At least ${settings.minRedeemPoints} points must be used at a time; ${points} is fewer.` });
  const day = date || localToday();
  const available = availablePoints(state, party, day);
  if (available.balance < points) {
    const expired = available.balance + available.expired >= points && available.expired > 0;
    return fail(expired ? 'POINTS_EXPIRED' : 'POINTS_SHORT', { points, balance: Math.max(0, available.balance), expired: available.expired, partyName: party.name, hint: expired ? `${party.name} has ${Math.max(0, available.balance)} points left; ${available.expired} expired.` : `${party.name} has ${Math.max(0, available.balance)} points, fewer than ${points}.` });
  }
  const unit = pointValuePaise(settings);
  const valuePaise = points * unit;
  const grossPaise = grossTaxableOf(input.lines);
  const capPaise = Math.min(Math.floor((grossPaise * Number(settings.maxRedeemPercent)) / 100), grossPaise - 1);
  if (valuePaise > capPaise) {
    const maxPoints = Math.max(0, Math.floor(capPaise / unit));
    return fail('OVER_MAX_SHARE', { points, maxPoints, maxRedeemPercent: settings.maxRedeemPercent, hint: `Points may pay for at most ${settings.maxRedeemPercent}% of the bill before GST; on this bill that is ${maxPoints} points (₹${(maxPoints * unit / 100).toFixed(2)}).` });
  }
  return { ok: true, redemption: { points, valuePaise, value: valuePaise / 100, party, balanceBefore: available.balance, balanceAfter: available.balance - points, settings } };
}

function earnFor(state, invoice) {
  if (!loyaltyServes(state)) return null;
  const settings = loyaltySettings(state);
  if (!settings.enabled || !invoice || !isNamedCustomer(invoice.partyName)) return null;
  const points = pointsEarnedOn(settings, earnBase(settings, invoice));
  if (points <= 0) return null;
  const party = (state.parties || []).find((p) => p.accountId === invoice.partyAccountId) || customerOf(state, invoice);
  if (!party) return null;
  return addEntry(state, {
    kind: 'earn',
    customerKey: keyOf(party),
    partyName: party.name,
    invoiceId: invoice.id,
    date: invoice.date,
    points,
    basis: settings.earnOn,
    base: round2(earnBase(settings, invoice)),
    expiresOn: Number(settings.expiryMonths) > 0 ? addMonths(invoice.date, settings.expiryMonths) : null,
  });
}

export function loyaltyInvoice(state, args = {}) {
  const { redeemPoints, ...rest } = args || {};
  const wantsRedeem = redeemPoints != null && redeemPoints !== '' && Number(redeemPoints) !== 0;
  let redemption = null;
  if (wantsRedeem) {
    const date = postingDate(rest.date);
    if (!date) return fail('INVALID_DATE', { date: rest.date });
    const planned = planRedemption(state, { ...rest, redeemPoints }, date);
    if (!planned.ok) return planned;
    redemption = planned.redemption;
  }
  const made = createInvoice(state, rest, redemption ? { loyaltyDiscountPaise: redemption.valuePaise, loyaltyPoints: redemption.points } : {});
  if (made.ok === false) return made;
  const loyalty = afterInvoice(state, made.invoice, redemption);
  return loyalty ? { ...made, loyalty } : made;
}

function afterInvoice(state, invoice, redemption) {
  let redeemed = null;
  if (redemption) {
    const key = keyOf(redemption.party);
    const before = replayCustomer(customerEntries(state, key), invoice.date);
    const trial = consume(before.lots.map((lot, order) => ({ left: lot.points, expiresOn: lot.expiresOn, order })), redemption.points, '');
    const never = trial.used.some((use) => !use.expiresOn);
    const latest = trial.used.reduce((last, use) => (use.expiresOn && use.expiresOn > last ? use.expiresOn : last), '');
    redeemed = addEntry(state, { kind: 'redeem', customerKey: key, partyName: redemption.party.name, invoiceId: invoice.id, date: invoice.date, points: -redemption.points, value: redemption.value, restoreExpiresOn: never || !latest ? null : latest });
  }
  const earned = earnFor(state, invoice);
  if (!earned && !redeemed) return null;
  const party = (state.parties || []).find((p) => p.accountId === invoice.partyAccountId) || redemption?.party;
  const balance = party ? replayCustomer(customerEntries(state, keyOf(party)), lastDateOf(customerEntries(state, keyOf(party)), invoice.date)).balance : 0;
  return { earned: earned ? earned.points : 0, redeemed: redeemed ? -redeemed.points : 0, redeemedValue: redeemed ? redeemed.value : 0, balance, expiresOn: earned?.expiresOn || null };
}

export function loyaltyAfterInvoice(state, result) {
  if (!result || result.ok === false || !result.invoice) return result;
  const loyalty = afterInvoice(state, result.invoice, null);
  return loyalty ? { ...result, loyalty } : result;
}

export function loyaltyAfterCreditNote(state, result) {
  if (!result || result.ok === false || !result.creditNote || !loyaltyServes(state)) return result;
  const note = result.creditNote;
  const invoice = (state.invoices || []).find((item) => item.id === note.invoiceId);
  if (!invoice) return result;
  const rows = entriesOf(state).filter((entry) => entry.invoiceId === invoice.id);
  const earned = rows.filter((entry) => entry.kind === 'earn');
  const redeemed = rows.filter((entry) => entry.kind === 'redeem');
  if (!earned.length && !redeemed.length) return result;
  const fraction = note.cancels || invoice.status === 'cancelled' ? 1 : Math.min(1, creditedAgainst(state, invoice.id) / Number(invoice.total || 1));
  const changes = { reversed: 0, restored: 0 };
  const earnedPoints = earned.reduce((sum, entry) => sum + entry.points, 0);
  const reversedSoFar = -rows.filter((entry) => entry.kind === 'reverse').reduce((sum, entry) => sum + entry.points, 0);
  const reverseNow = Math.round(earnedPoints * fraction) - reversedSoFar;
  const base = earned[0] || redeemed[0];
  if (reverseNow > 0) {
    addEntry(state, { kind: 'reverse', customerKey: base.customerKey, partyName: base.partyName, invoiceId: invoice.id, creditNoteId: note.id, date: note.date, points: -reverseNow });
    changes.reversed = reverseNow;
  }
  const redeemedPoints = -redeemed.reduce((sum, entry) => sum + entry.points, 0);
  const restoredSoFar = rows.filter((entry) => entry.kind === 'restore').reduce((sum, entry) => sum + entry.points, 0);
  const restoreNow = Math.round(redeemedPoints * fraction) - restoredSoFar;
  if (restoreNow > 0) {
    addEntry(state, { kind: 'restore', customerKey: base.customerKey, partyName: base.partyName, invoiceId: invoice.id, creditNoteId: note.id, date: note.date, points: restoreNow, expiresOn: redeemed[0].restoreExpiresOn || null });
    changes.restored = restoreNow;
  }
  if (!changes.reversed && !changes.restored) return result;
  const entries = customerEntries(state, base.customerKey);
  return { ...result, loyalty: { ...changes, partyName: base.partyName, balance: replayCustomer(entries, lastDateOf(entries, note.date)).balance } };
}

const SETTING_FIELDS = ['enabled', 'earnPoints', 'earnPerRupees', 'earnOn', 'pointValue', 'minRedeemPoints', 'maxRedeemPercent', 'expiryMonths'];

function checkSettings(next) {
  if (typeof next.enabled !== 'boolean') return 'BAD_ENABLED';
  if (!Number.isInteger(next.earnPoints) || next.earnPoints < 1 || next.earnPoints > 1000) return 'BAD_EARN_POINTS';
  if (!Number.isFinite(next.earnPerRupees) || next.earnPerRupees < 1 || next.earnPerRupees > 1000000) return 'BAD_EARN_PER_RUPEES';
  if (!EARN_ON.includes(next.earnOn)) return 'BAD_EARN_ON';
  if (!Number.isFinite(next.pointValue) || Math.round(next.pointValue * 100) < 1 || next.pointValue > 1000 || Math.abs(next.pointValue * 100 - Math.round(next.pointValue * 100)) > 1e-6) return 'BAD_POINT_VALUE';
  if (!Number.isInteger(next.minRedeemPoints) || next.minRedeemPoints < 0 || next.minRedeemPoints > 1000000) return 'BAD_MIN_REDEEM';
  if (!Number.isFinite(next.maxRedeemPercent) || next.maxRedeemPercent <= 0 || next.maxRedeemPercent > 100) return 'BAD_MAX_SHARE';
  if (!Number.isInteger(next.expiryMonths) || next.expiryMonths < 0 || next.expiryMonths > 120) return 'BAD_EXPIRY';
  return '';
}

export const SETTINGS_REASONS = {
  OWNER_ONLY: 'Only the owner can change loyalty points.',
  NOT_FOR_COUNTRY: 'Loyalty points are for Indian shops.',
  NOTHING_TO_CHANGE: 'Say what to change: on or off, the earn rate, the value of a point, the minimum, the most of a bill points can pay, or the expiry.',
  BAD_ENABLED: 'Say on or off.',
  BAD_EARN_POINTS: 'Points earned are a whole number from 1 to 1000.',
  BAD_EARN_PER_RUPEES: 'Points are earned per ₹1 to ₹10,00,000 of the bill.',
  BAD_EARN_ON: 'Points are earned on the value before GST (taxable) or on the bill total.',
  BAD_POINT_VALUE: 'A point is worth from ₹0.01 to ₹1,000, in paise.',
  BAD_MIN_REDEEM: 'The minimum to use is a whole number of points, 0 or more.',
  BAD_MAX_SHARE: 'The most of a bill points can pay is above 0% and at most 100%.',
  BAD_EXPIRY: 'Expiry is 0 (never) to 120 months.',
};

export function planLoyaltySettings(state, args = {}) {
  if (!loyaltyServes(state)) return fail('NOT_FOR_COUNTRY', { hint: SETTINGS_REASONS.NOT_FOR_COUNTRY });
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: SETTINGS_REASONS.OWNER_ONLY });
  const said = SETTING_FIELDS.filter((key) => args[key] != null && args[key] !== '');
  if (!said.length) return fail('NOTHING_TO_CHANGE', { hint: SETTINGS_REASONS.NOTHING_TO_CHANGE });
  const current = loyaltySettings(state);
  const before = Object.fromEntries(SETTING_FIELDS.map((key) => [key, current[key]]));
  const next = { ...before };
  for (const key of said) next[key] = key === 'enabled' ? args[key] : key === 'earnOn' ? String(args[key]).toLowerCase() : Number(args[key]);
  const problem = checkSettings(next);
  if (problem) return fail(problem, { hint: SETTINGS_REASONS[problem] });
  next.pointValue = Math.round(next.pointValue * 100) / 100;
  return { ok: true, plan: { before, next, changed: SETTING_FIELDS.filter((key) => before[key] !== next[key]), firstTime: !current.configured } };
}

export function setLoyaltySettings(state, args = {}) {
  const planned = planLoyaltySettings(state, args);
  if (!planned.ok) return planned;
  const { before, next, changed } = planned.plan;
  const on = postingDate(args.on) || localToday();
  book(state).settings = { ...next, updatedOn: on };
  appendAuditEvent(state, { actorId: state.__actor?.userId || args.actorId || 'owner', action: 'loyalty.settings', metadata: { changed, before, after: next } });
  return { ok: true, settings: loyaltySettings(state), before, changed };
}

export const ADJUST_REASONS = {
  OWNER_ONLY: 'Only the owner can add or take away points by hand.',
  NOT_FOR_COUNTRY: 'Loyalty points are for Indian shops.',
  LOYALTY_OFF: 'Loyalty points are switched off. Turn them on in loyalty settings first.',
  CUSTOMER_REQUIRED: 'Say which customer.',
  CUSTOMER_NOT_FOUND: 'That customer is not in these books.',
  BAD_POINTS: 'Points are a whole number, more or less than zero.',
  REASON_REQUIRED: 'Give the reason for the change; it is kept with the points.',
  POINTS_SHORT: 'The customer does not have that many points to take away.',
  INVALID_DATE: 'That is not a date I can read.',
};

export function planLoyaltyAdjust(state, args = {}) {
  if (!loyaltyServes(state)) return fail('NOT_FOR_COUNTRY', { hint: ADJUST_REASONS.NOT_FOR_COUNTRY });
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: ADJUST_REASONS.OWNER_ONLY });
  const settings = loyaltySettings(state);
  if (!settings.enabled) return fail('LOYALTY_OFF', { hint: ADJUST_REASONS.LOYALTY_OFF });
  if (!text(args.partyName)) return fail('CUSTOMER_REQUIRED', { hint: ADJUST_REASONS.CUSTOMER_REQUIRED });
  const party = isNamedCustomer(args.partyName) ? customerOf(state, args) : null;
  if (!party) return fail('CUSTOMER_NOT_FOUND', { partyName: text(args.partyName), hint: ADJUST_REASONS.CUSTOMER_NOT_FOUND });
  const points = Number(args.points);
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 10000000) return fail('BAD_POINTS', { hint: ADJUST_REASONS.BAD_POINTS });
  const reason = text(args.reason).slice(0, 200);
  if (!reason) return fail('REASON_REQUIRED', { hint: ADJUST_REASONS.REASON_REQUIRED });
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date, hint: ADJUST_REASONS.INVALID_DATE });
  const available = availablePoints(state, party, date);
  if (points < 0 && available.balance < -points) return fail('POINTS_SHORT', { points, balance: Math.max(0, available.balance), partyName: party.name, hint: `${party.name} has ${Math.max(0, available.balance)} points, fewer than ${-points}.` });
  const expiresOn = points > 0 && Number(settings.expiryMonths) > 0 ? addMonths(date, settings.expiryMonths) : null;
  return { ok: true, plan: { party, points, reason, date, expiresOn, balanceBefore: available.balance, balanceAfter: available.balance + points, settings } };
}

export function loyaltyAdjust(state, args = {}) {
  const planned = planLoyaltyAdjust(state, args);
  if (!planned.ok) return planned;
  const { party, points, reason, date, expiresOn } = planned.plan;
  const by = state.__actor?.userId || args.actorId || 'owner';
  const entry = addEntry(state, { kind: 'adjust', customerKey: keyOf(party), partyName: party.name, date, points, reason, by, ...(expiresOn ? { expiresOn } : {}) });
  appendAuditEvent(state, { actorId: by, action: 'loyalty.adjust', metadata: { entryId: entry.id, partyName: party.name, points, reason, date } });
  const entries = customerEntries(state, entry.customerKey);
  return { ok: true, entry, partyName: party.name, balance: replayCustomer(entries, lastDateOf(entries, date)).balance };
}

function customerRow(state, party, key, asOf, settings) {
  const entries = customerEntries(state, key);
  const replayed = replayCustomer(entries, asOf);
  const balance = Math.max(0, replayed.balance);
  return {
    partyName: party?.name || entries[entries.length - 1]?.partyName || key,
    balance,
    value: pointsValue(settings, balance),
    earned: replayed.earned,
    redeemed: replayed.redeemed,
    expired: replayed.expired,
    expiringSoon: expiringSoon(replayed.lots, asOf),
    entries,
  };
}

export function whatsappBalanceLine(row, settings, shopName = '') {
  const shop = text(shopName) || 'our shop';
  const soon = row.expiringSoon[0];
  const expiry = soon ? ` ${soon.points} ${soon.points === 1 ? 'point expires' : 'points expire'} on ${soon.on}; use them on your next visit.` : '';
  return `Namaste ${row.partyName}, you have ${row.balance} loyalty ${row.balance === 1 ? 'point' : 'points'} worth ₹${pointsValue(settings, row.balance).toFixed(2)} at ${shop}.${expiry}`;
}

export function loyaltyBalance(state, args = {}) {
  if (!loyaltyServes(state)) return fail('NOT_FOR_COUNTRY', { hint: 'Loyalty points are for Indian shops.' });
  const asOf = args.asOf == null || args.asOf === '' ? localToday() : postingDate(args.asOf);
  if (!asOf) return fail('INVALID_DATE', { asOf: args.asOf });
  const settings = loyaltySettings(state);
  const publicSettings = Object.fromEntries([...SETTING_FIELDS, 'configured'].map((key) => [key, settings[key]]));
  if (text(args.partyName)) {
    const party = customerOf(state, args);
    if (!party) return fail('CUSTOMER_NOT_FOUND', { partyName: text(args.partyName), hint: ADJUST_REASONS.CUSTOMER_NOT_FOUND });
    const row = customerRow(state, party, keyOf(party), asOf, settings);
    const history = row.entries.slice(-10).reverse().map(({ id, kind, invoiceId, creditNoteId, date, points, expiresOn, reason, value }) => ({ id, kind, date, points, ...(invoiceId ? { invoiceId } : {}), ...(creditNoteId ? { creditNoteId } : {}), ...(expiresOn ? { expiresOn } : {}), ...(reason ? { reason } : {}), ...(value != null ? { value } : {}) }));
    const { entries, ...rest } = row;
    return { ok: true, data: { asOf, settings: publicSettings, customer: { ...rest, history, whatsapp: whatsappBalanceLine(row, settings, state.company?.name) } } };
  }
  const keys = [...new Set(entriesOf(state).map((entry) => entry.customerKey))];
  const parties = new Map((state.parties || []).map((p) => [keyOf(p), p]));
  const rows = keys.map((key) => {
    const { entries, ...rest } = customerRow(state, parties.get(key), key, asOf, settings);
    return rest;
  }).sort((a, b) => b.balance - a.balance || a.partyName.localeCompare(b.partyName));
  const limit = Math.max(1, Math.min(500, Number.isInteger(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 50));
  const outstanding = rows.reduce((sum, row) => sum + row.balance, 0);
  const soon = rows.reduce((sum, row) => sum + row.expiringSoon.reduce((s, item) => s + item.points, 0), 0);
  return {
    ok: true,
    data: {
      asOf,
      settings: publicSettings,
      customers: rows.slice(0, limit),
      count: rows.length,
      outstandingPoints: outstanding,
      liability: pointsValue(settings, outstanding),
      expiringSoonPoints: soon,
      expiringSoonDays: EXPIRING_SOON_DAYS,
    },
  };
}

function earnRateWords(settings) {
  const per = Number(settings.earnPerRupees).toLocaleString('en-IN');
  return `${settings.earnPoints} ${settings.earnPoints === 1 ? 'point' : 'points'} for every ₹${per} ${settings.earnOn === 'total' ? 'of the bill total' : 'of the bill before GST'}`;
}

export function loyaltySettingsWords(settings, money) {
  if (!settings.enabled) return 'Loyalty points are off: no sale earns points and none can be used.';
  const expiry = Number(settings.expiryMonths) > 0 ? `they expire ${settings.expiryMonths} ${settings.expiryMonths === 1 ? 'month' : 'months'} after they are earned` : 'they never expire';
  const minimum = Number(settings.minRedeemPoints) > 0 ? `at least ${settings.minRedeemPoints} at a time` : 'any number at a time';
  return `Loyalty points are on: customers earn ${earnRateWords(settings)}. One point is worth ${money(settings.pointValue)} off a later bill, ${minimum}, paying up to ${settings.maxRedeemPercent}% of a bill before GST; ${expiry}. Walk-in sales earn nothing.`;
}

export function loyaltyBalanceWords(data, money) {
  if (data.customer) {
    const c = data.customer;
    const soon = c.expiringSoon.length ? ` ${c.expiringSoon.map((item) => `${item.points} expire on ${item.on}`).join('; ')}.` : '';
    return `${c.partyName} has ${c.balance} ${c.balance === 1 ? 'point' : 'points'} worth ${money(c.value)} (earned ${c.earned}, used ${c.redeemed}${c.expired ? `, expired ${c.expired}` : ''}).${soon}\nTo send: ${c.whatsapp}`;
  }
  if (!data.count) return data.settings.enabled ? 'No customer has earned points yet.' : 'Loyalty points are off, and no customer has any.';
  const top = data.customers.slice(0, 5).map((row) => `${row.partyName} ${row.balance}`).join(', ');
  return `${data.count} ${data.count === 1 ? 'customer holds' : 'customers hold'} ${data.outstandingPoints} points, worth ${money(data.liability)} if all are used: that is what the shop owes in points as of ${data.asOf}. Most points: ${top}.${data.expiringSoonPoints ? ` ${data.expiringSoonPoints} points expire in the next ${data.expiringSoonDays} days.` : ''}`;
}

export function loyaltyAdjustWords(result) {
  const p = result.entry.points;
  return `${p > 0 ? `Added ${p}` : `Took away ${-p}`} ${Math.abs(p) === 1 ? 'point' : 'points'} ${p > 0 ? 'to' : 'from'} ${result.partyName} (${result.entry.reason}). Balance now ${result.balance}.`;
}

export function loyaltyInvoiceWords(loyalty, money) {
  if (!loyalty) return '';
  const parts = [];
  if (loyalty.redeemed) parts.push(`${loyalty.redeemed} points used for ${money(loyalty.redeemedValue)} off before GST`);
  if (loyalty.earned) parts.push(`${loyalty.earned} points earned`);
  return parts.length ? ` Loyalty: ${parts.join(', ')}; balance ${loyalty.balance}.` : '';
}

export function loyaltyCreditWords(loyalty) {
  if (!loyalty) return '';
  const parts = [];
  if (loyalty.reversed) parts.push(`${loyalty.reversed} points earned on it taken back`);
  if (loyalty.restored) parts.push(`${loyalty.restored} points used on it given back`);
  return parts.length ? ` Loyalty: ${parts.join(', ')}; ${loyalty.partyName} now has ${loyalty.balance}.` : '';
}

export function redemptionPreviewWords(state, args, date) {
  const planned = planRedemption(state, args, date);
  if (!planned.ok) return { blocker: planned.hint || REDEEM_REASONS[planned.error] || planned.error };
  return { redemption: planned.redemption };
}

export function earnPreview(state, args, { taxable, total }) {
  if (!loyaltyServes(state)) return 0;
  const settings = loyaltySettings(state);
  if (!settings.enabled || !isNamedCustomer(args.partyName)) return 0;
  return pointsEarnedOn(settings, settings.earnOn === 'total' ? total : taxable);
}
