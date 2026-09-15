const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const STATE_CODES = {
  '01': 'Jammu And Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra And Nagar Haveli And Daman And Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman And Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh'
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function validateGstin(gstin) {
  const errors = [];
  const normalized = (gstin || '').trim().toUpperCase().replace(/\s/g, '');

  let stateCode = '';
  let stateName = '';
  let pan = '';
  let panOk = false;
  let checkDigitOk = false;

  if (normalized.length !== 15) {
    errors.push({ code: 'INVALID_LENGTH', field: 'gstin', message: `GSTIN must be 15 characters, got ${normalized.length}` });
    return { ok: false, gstin: normalized, stateCode, stateName, pan, panOk, checkDigitOk, errors };
  }

  stateCode = normalized.slice(0, 2);
  if (!STATE_CODES[stateCode]) {
    errors.push({ code: 'INVALID_STATE', field: 'stateCode', message: `Invalid GST state code: ${stateCode}` });
  } else {
    stateName = STATE_CODES[stateCode];
  }

  pan = normalized.slice(2, 12);
  if (!PAN_RE.test(pan)) {
    errors.push({ code: 'INVALID_PAN', field: 'pan', message: `Invalid PAN: ${pan}` });
  } else {
    panOk = true;
  }

  if (normalized[13] !== 'Z') {
    errors.push({ code: 'INVALID_Z', field: 'entity', message: `Position 14 must be 'Z', got '${normalized[13]}'` });
  }

  const first14 = normalized.slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    sum += (i % 2 === 0 ? 1 : 2) * ALPHABET.indexOf(first14[i]);
  }
  const expectedCheck = ALPHABET[(36 - (sum % 36)) % 36];
  const actualCheck = normalized[14];

  if (actualCheck !== expectedCheck) {
    checkDigitOk = false;
    errors.push({ code: 'CHECK_DIGIT_MISMATCH', field: 'checkDigit', message: `Expected check digit '${expectedCheck}', got '${actualCheck}'` });
  } else {
    checkDigitOk = true;
  }

  const ok = errors.length === 0;

  return { ok, gstin: normalized, stateCode, stateName, pan, panOk, checkDigitOk, errors };
}
