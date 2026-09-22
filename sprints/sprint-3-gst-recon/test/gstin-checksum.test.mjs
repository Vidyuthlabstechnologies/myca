import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGstin } from '../src/gstin.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function officialCheckCharacter(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36];
}

function withCheck(first14) {
  return first14 + officialCheckCharacter(first14);
}

function seededPan(seed) {
  let x = seed;
  const next = (n) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % n;
  };
  const letter = () => ALPHABET[10 + next(26)];
  const digit = () => ALPHABET[next(10)];
  return `${letter()}${letter()}${letter()}${letter()}${letter()}${digit()}${digit()}${digit()}${digit()}${letter()}`;
}

test('C1: the GSTN sample GSTIN 27AAPFU0939F1ZV is valid (check character V)', () => {
  assert.equal(officialCheckCharacter('27AAPFU0939F1Z'), 'V');
  const result = validateGstin('27AAPFU0939F1ZV');
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.checkDigitOk, true);
});

test('C1: the old README example 27AAACH7409R1Z3 is invalid; its correct form ends in 1', () => {
  assert.equal(officialCheckCharacter('27AAACH7409R1Z'), '1');
  assert.equal(validateGstin('27AAACH7409R1Z3').ok, false);
  assert.equal(validateGstin('27AAACH7409R1Z3').errors[0].code, 'CHECK_DIGIT_MISMATCH');
  assert.equal(validateGstin('27AAACH7409R1Z1').ok, true);
});

test('C1: 2000 generated GSTINs with official check characters are accepted and a wrong check character is rejected', () => {
  const codes = ['01', '07', '24', '27', '29', '33', '36', '37', '38', '97', '99'];
  for (let i = 0; i < 2000; i++) {
    const first14 = `${codes[i % codes.length]}${seededPan(i + 1)}${ALPHABET[1 + (i % 9)]}${i % 5 === 0 ? 'C' : 'Z'}`;
    const good = withCheck(first14);
    assert.equal(validateGstin(good).ok, true, good);
    const wrong = ALPHABET[(ALPHABET.indexOf(good[14]) + 1) % 36];
    assert.equal(validateGstin(first14 + wrong).ok, false, first14 + wrong);
  }
});

test('C1: state codes 38 (Ladakh), 97 and 99 are accepted; 00 and 28 are not', () => {
  for (const code of ['38', '97', '99']) assert.equal(validateGstin(withCheck(`${code}AAPFU0939F1Z`)).ok, true, code);
  for (const code of ['00', '28', '39', '96']) {
    const result = validateGstin(withCheck(`${code}AAPFU0939F1Z`));
    assert.equal(result.ok, false, code);
    assert.equal(result.errors[0].code, 'INVALID_STATE', code);
  }
  assert.equal(validateGstin(withCheck('38AAPFU0939F1Z')).stateName, 'Ladakh');
});

test('C1: a 14th character other than Z (for example a TCS operator GSTIN) is not rejected on that ground', () => {
  const tcs = withCheck('07AAPFU0939F1C');
  const result = validateGstin(tcs);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.some((e) => e.code === 'INVALID_Z'), false);
});
