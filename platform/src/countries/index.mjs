import { INDIA } from './india.mjs';
import { UNITED_STATES } from './united-states.mjs';
import { UNITED_KINGDOM, CANADA, UNITED_ARAB_EMIRATES, AUSTRALIA } from './planned.mjs';

export const SEGMENTS = Object.freeze(['individual', 'business', 'accountant']);
export const PAYMENT_PROVIDERS = Object.freeze(['play', 'stripe']);
export const PACK_STATUSES = Object.freeze(['live', 'beta', 'planned']);
export const PACKS = Object.freeze([INDIA, UNITED_STATES, UNITED_KINGDOM, CANADA, UNITED_ARAB_EMIRATES, AUSTRALIA]);
export const DEFAULT_COUNTRY = 'IN';

const BY_CODE = new Map(PACKS.map((pack) => [pack.code, pack]));
const TOOL_OWNER = new Map(PACKS.flatMap((pack) => pack.tools.map((tool) => [tool, pack.code])));

export function countryPack(code) {
  return BY_CODE.get(String(code || '').trim().toUpperCase()) || null;
}

export function servedPacks() {
  return PACKS.filter((pack) => pack.status !== 'planned');
}

export function isServedCountry(code) {
  const pack = countryPack(code);
  return Boolean(pack && pack.status !== 'planned');
}

export function toolOwner(toolName) {
  return TOOL_OWNER.get(String(toolName || '')) || '';
}

export function packForFlavor(flavor) {
  const wanted = String(flavor || '').trim().toLowerCase();
  return PACKS.find((pack) => pack.app.flavor === wanted) || null;
}

export function regionServes(pack, region) {
  const name = String(region || '').trim().toLowerCase();
  return Boolean(pack && name && pack.residency.regionPrefixes.some((prefix) => name.startsWith(prefix)));
}

export function licencesNeeded(code) {
  const pack = countryPack(code);
  return pack ? pack.licences.filter((licence) => licence.status !== 'held') : [];
}

export function packProblems(packs = PACKS) {
  const problems = [];
  const seen = { code: new Set(), flavor: new Set(), androidId: new Set() };
  for (const pack of packs) {
    if (!/^[A-Z]{2}$/.test(pack.code)) problems.push(`${pack.code}: the code must be ISO 3166-1 alpha-2.`);
    if (!PACK_STATUSES.includes(pack.status)) problems.push(`${pack.code}: status must be one of ${PACK_STATUSES.join(', ')}.`);
    if (!/^[A-Z]{3}$/.test(pack.currency)) problems.push(`${pack.code}: the currency must be ISO 4217.`);
    if (!(pack.yearStartMonth >= 1 && pack.yearStartMonth <= 12)) problems.push(`${pack.code}: yearStartMonth must be 1 to 12.`);
    if (!(pack.yearStartDay >= 1 && pack.yearStartDay <= 28)) problems.push(`${pack.code}: yearStartDay must be 1 to 28.`);
    if (!pack.segments.length || !pack.segments.every((segment) => SEGMENTS.includes(segment))) problems.push(`${pack.code}: segments must be drawn from ${SEGMENTS.join(', ')}.`);
    if (pack.status === 'live' && pack.licences.some((licence) => licence.status === 'needed')) problems.push(`${pack.code}: a live country cannot still need a licence.`);
    for (const plan of pack.billing.plans) {
      if (!PAYMENT_PROVIDERS.includes(plan.provider) || !pack.billing.providers.includes(plan.provider)) problems.push(`${pack.code}: plan ${plan.id} names a payment provider the pack does not list.`);
      if (plan.sells === 'software' && plan.provider !== 'play') problems.push(`${pack.code}: plan ${plan.id} sells software inside a Play app, which Google requires to use Play billing.`);
      if (!['software', 'tax-filing'].includes(plan.sells)) problems.push(`${pack.code}: plan ${plan.id} must say whether it sells software or tax-filing.`);
    }
    for (const [key, value] of [['code', pack.code], ['flavor', pack.app.flavor], ['androidId', pack.app.androidId]]) {
      if (seen[key].has(value)) problems.push(`${pack.code}: ${key} ${value} is used by another pack.`);
      seen[key].add(value);
    }
    if (pack.status !== 'planned') {
      if (!pack.residency.regionPrefixes.length) problems.push(`${pack.code}: a served country needs a region its data may live in.`);
      if (!regionServes(pack, pack.residency.defaultRegion)) problems.push(`${pack.code}: the default region ${pack.residency.defaultRegion} is outside the country's own regions.`);
      if (!pack.billing.plans.length) problems.push(`${pack.code}: a served country needs at least one price.`);
      if (!pack.filing.length) problems.push(`${pack.code}: a served country needs a filing route.`);
    }
    if (pack.toolPolicy === 'unclaimed' && pack.tools.length) problems.push(`${pack.code}: a pack that serves every unclaimed tool lists none of its own.`);
    if (![...pack.tools].every((tool, index, list) => index === 0 || list[index - 1] < tool)) problems.push(`${pack.code}: keep tools sorted and unique, so that parallel branches merge cleanly.`);
  }
  for (const region of packs.flatMap((pack) => pack.residency.regionPrefixes.map((prefix) => [pack.code, prefix]))) {
    const clash = packs.find((other) => other.code !== region[0] && other.residency.regionPrefixes.some((prefix) => prefix.startsWith(region[1]) || region[1].startsWith(prefix)));
    if (clash) problems.push(`${region[0]}: region ${region[1]} overlaps ${clash.code}.`);
  }
  if (packs.filter((pack) => pack.toolPolicy === 'unclaimed').length > 1) problems.push('Only one pack may serve every unclaimed tool.');
  return problems;
}
