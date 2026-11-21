import { countryOf } from './country.mjs';
import { aatoFor, hsnDigitsNeeded } from './aato.mjs';

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

export function hsnDigitIssues(state, inv) {
  if (!isIndianSale(state, inv) || !text(inv.registrationGstin || state.company?.gstin)) return [];
  const aato = aatoFor(state, inv.date);
  const need = hsnDigitsNeeded(aato.rupees, inv.date);
  const digits = need ? need.digits : 4;
  const b2c = !text(inv.partyGstin) && !inv.export;
  const mayOmit = b2c && (need ? need.b2cMayOmit : true);
  const issues = [];
  (inv.lines || []).forEach((line, index) => {
    const hsn = text(line.hsn);
    if (!hsn) {
      if (!mayOmit) issues.push({ line: index + 1, hsn, code: 'HSN_MISSING', need: digits });
      return;
    }
    if (!/^\d+$/.test(hsn) || hsn.length > 8) issues.push({ line: index + 1, hsn, code: 'HSN_INVALID', need: digits });
    else if (hsn.length < digits && !mayOmit) issues.push({ line: index + 1, hsn, code: 'HSN_TOO_SHORT', need: digits });
  });
  if (!issues.length) return [];
  const basis = need ? (aato.estimated ? `aggregate turnover for FY ${aato.fy} estimated from these books` : `aggregate turnover for FY ${aato.fy} as entered`) : `aggregate turnover for FY ${aato.fy} not on file, so 4 digits are assumed`;
  return issues.map((issue) => ({ ...issue, aatoFy: aato.fy, aatoSource: aato.source, words: `Line ${issue.line}: ${issue.code === 'HSN_MISSING' ? 'no HSN or SAC code' : issue.code === 'HSN_INVALID' ? `${issue.hsn} is not an HSN or SAC code` : `HSN ${issue.hsn} is shorter than ${issue.need} digits`}; a tax invoice needs ${issue.need} digits (${basis}; Notification 78/2020-Central Tax).` }));
}
