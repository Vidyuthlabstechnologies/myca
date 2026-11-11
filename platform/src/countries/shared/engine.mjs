import { countryOf, countryPack, taxYearOf } from '../../country.mjs';
import { localToday } from '../../dates.mjs';
import { countryCapabilities } from '../manifests.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function countryProfile(state, args = {}) {
  const pack = countryPack(countryOf(state));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? args.date : localToday();
  return {
    ok: true,
    data: {
      country: pack.code,
      name: pack.name,
      status: pack.status,
      currency: pack.currency,
      symbol: pack.symbol,
      languages: [...pack.languages],
      taxId: pack.taxId,
      taxName: pack.taxName,
      yearLabel: pack.yearLabel,
      yearStarts: { month: pack.yearStartMonth, day: pack.yearStartDay },
      date,
      taxYear: taxYearOf(pack.code, date),
      serves: [...pack.segments],
      app: pack.app.label,
      filing: pack.filing.map((entry) => ({ id: entry.id, authority: entry.authority, route: entry.route })),
      capabilities: countryCapabilities(pack.code),
    },
  };
}

function countryProfileWords(result) {
  const d = result.data;
  return [
    `${d.name}: ${d.currency}, the ${d.yearLabel} starts on ${d.yearStarts.day} ${MONTHS[d.yearStarts.month - 1]}; ${d.date} falls in ${d.taxYear}.`,
    `Main indirect tax: ${d.taxName}. Tax id: ${d.taxId}.`,
    ...d.filing.map((entry) => `· ${entry.authority}: ${entry.route}`),
  ].join('\n');
}

export const ENGINE = Object.freeze({
  country: '*',
  run: Object.freeze({ country_profile: countryProfile }),
  preview: Object.freeze({}),
  words: Object.freeze({ country_profile: countryProfileWords }),
});
