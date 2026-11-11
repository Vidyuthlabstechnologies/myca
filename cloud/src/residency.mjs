import { countryPack, isServedCountry, regionServes, servedPacks, DEFAULT_COUNTRY } from '../../platform/src/countries/index.mjs';
import { countryCapabilities } from '../../platform/src/countries/manifests.mjs';

const clean = (value) => String(value ?? '').trim();

export function hostedCountries(env = process.env) {
  const given = clean(env.MYCA_COUNTRIES).toUpperCase().split(/[\s,]+/).filter(Boolean);
  return given.length ? [...new Set(given)] : servedPacks().map((pack) => pack.code);
}

export function deploymentRegion(env = process.env) {
  return clean(env.MYCA_REGION || env.GOOGLE_CLOUD_REGION).toLowerCase();
}

export function residencyProblem(env = process.env) {
  const countries = hostedCountries(env);
  const unknown = countries.filter((code) => !isServedCountry(code));
  if (unknown.length) return `MYCA_COUNTRIES names countries MyCA does not serve yet: ${unknown.join(', ')}. Served: ${servedPacks().map((pack) => pack.code).join(', ')}.`;
  const region = deploymentRegion(env);
  if (!region || !clean(env.MYCA_COUNTRIES)) return '';
  const outside = countries.filter((code) => !regionServes(countryPack(code), region));
  if (outside.length) return `This deployment runs in ${region}, but the data of ${outside.map((code) => countryPack(code).name).join(', ')} must stay in its own country (${outside.map((code) => countryPack(code).residency.regionPrefixes.join(' or ') || 'no region yet').join('; ')}). Deploy each country separately.`;
  return '';
}

export function residencyRefusal(country, env = process.env) {
  const code = clean(country || DEFAULT_COUNTRY).toUpperCase();
  if (hostedCountries(env).includes(code)) return null;
  const pack = countryPack(code);
  return { ok: false, error: 'COUNTRY_HOSTED_ELSEWHERE', country: code, hint: pack ? `${pack.name} books are kept in ${pack.name}; use the ${pack.app.label} app.` : 'MyCA does not serve this country yet.' };
}

export function publicCountries(env = process.env) {
  const hosted = hostedCountries(env);
  return {
    ok: true,
    hosted,
    countries: servedPacks().map((pack) => ({
      code: pack.code,
      name: pack.name,
      status: pack.status,
      currency: pack.currency,
      symbol: pack.symbol,
      minorUnit: pack.minorUnit,
      locale: pack.locale,
      languages: pack.languages,
      yearStartMonth: pack.yearStartMonth,
      yearStartDay: pack.yearStartDay,
      yearLabel: pack.yearLabel,
      taxId: pack.taxId,
      taxName: pack.taxName,
      requiresState: pack.requiresState,
      segments: pack.segments,
      app: pack.app,
      prices: pack.billing.plans.map(({ id, kind, price, provider }) => ({ id, kind, price, provider })),
      filing: pack.filing.map(({ id, authority, route }) => ({ id, authority, route })),
      capabilities: countryCapabilities(pack.code),
      hostedHere: hosted.includes(pack.code),
    })),
  };
}
