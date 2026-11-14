import { countryOf } from './country.mjs';

const ZERO_SUPPLY = new Set(['nil', 'exempt', 'non-gst']);
const text = (value) => String(value ?? '').trim();

export const COMPOSITION_DECLARATION = 'Composition taxable person, not eligible to collect tax on supplies';

export function isIndianSale(state, inv) {
  return countryOf(state) !== 'US' && inv && inv.kind !== 'purchase';
}

export function documentTitleOf(state, inv) {
  if (!isIndianSale(state, inv)) return 'Invoice';
  const sellerGstin = text(inv.registrationGstin || state.company?.gstin);
  if (!sellerGstin) return 'Invoice';
  if (state.company?.composition === true) return 'Bill of supply';
  if (inv.export) return 'Tax invoice';
  const lines = inv.lines || [];
  if (lines.length && lines.every((line) => Number(line.gstRate) === 0 && ZERO_SUPPLY.has(text(line.supply)))) return 'Bill of supply';
  return 'Tax invoice';
}

export function hsnShownOn(state, inv, template) {
  if (template.showHsn !== false) return true;
  return isIndianSale(state, inv) && Boolean(text(inv.partyGstin));
}

export function exportEndorsementOf(state, inv) {
  if (!isIndianSale(state, inv) || !inv.export) return '';
  if (inv.export.withTax) return 'Supply meant for export on payment of IGST';
  const lut = text(inv.export.lutNumber || state.company?.lutNumber);
  return `Supply meant for export under bond or letter of undertaking without payment of IGST${lut ? ` (LUT ${lut})` : ''}`;
}

export function reverseChargeLineOf(state, inv) {
  if (!isIndianSale(state, inv) || !text(inv.registrationGstin || state.company?.gstin)) return '';
  return `Tax payable on reverse charge: ${inv.reverseCharge === true ? 'Yes' : 'No'}`;
}

export function einvoiceProofOf(inv, prefix = '') {
  const field = (name) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  return { ackDate: text(inv[field('ackDate')]), signedQrCode: text(inv[field('signedQrCode')]) };
}
