const SLICE_NAME = /^[a-z][A-Za-z0-9]*$/;
const NOTHING = Object.freeze({});

function named(name) {
  const text = String(name || '');
  if (!SLICE_NAME.test(text)) throw new Error(`BAD_SLICE_NAME:${text}`);
  return text;
}

export function countrySlice(state, name) {
  const key = named(name);
  const all = state && state.countryData;
  return all && typeof all === 'object' && Object.hasOwn(all, key) ? all[key] : NOTHING;
}

export function openCountrySlice(state, name, initial = () => ({})) {
  const key = named(name);
  if (!state.countryData || typeof state.countryData !== 'object' || Array.isArray(state.countryData)) state.countryData = {};
  if (!Object.hasOwn(state.countryData, key)) state.countryData[key] = initial();
  return state.countryData[key];
}
