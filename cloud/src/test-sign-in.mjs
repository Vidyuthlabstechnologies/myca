import { timingSafeEqual } from 'node:crypto';
import { normalizePhone } from './auth.mjs';

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);
const CODE = /^\d{6}$/;
const WEAK = new Set(['000000', '111111', '123456', '654321', '999999']);

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text === 'unset' ? '' : text;
};

function phonesIn(value) {
  return [...new Set(clean(value).split(',').map((part) => normalizePhone(part)).filter(Boolean))];
}

function codeProblem(name, code) {
  if (!CODE.test(code)) return `${name} must be six digits.`;
  if (WEAK.has(code)) return `${name} is too easy to guess; pick another six digits.`;
  return '';
}

export function testSignInFromEnv(env = process.env, environment = 'local') {
  const testPhones = phonesIn(env.MYCA_TEST_PHONES);
  const testCode = clean(env.MYCA_TEST_CODE);
  const reviewerOn = TRUE_WORDS.has(clean(env.MYCA_REVIEWER_SIGN_IN).toLowerCase());
  const reviewerPhone = normalizePhone(clean(env.MYCA_REVIEWER_PHONE));
  const reviewerCode = clean(env.MYCA_REVIEWER_CODE);
  const problems = [];
  if (testPhones.length) {
    if (environment === 'production') problems.push('MYCA_TEST_PHONES is refused in production; use MYCA_REVIEWER_SIGN_IN for the Play reviewer.');
    else {
      const problem = codeProblem('MYCA_TEST_CODE', testCode);
      if (problem) problems.push(problem);
    }
  }
  if (reviewerOn) {
    if (!reviewerPhone) problems.push('MYCA_REVIEWER_SIGN_IN is on but MYCA_REVIEWER_PHONE is not an Indian mobile number.');
    const problem = codeProblem('MYCA_REVIEWER_CODE', reviewerCode);
    if (problem) problems.push(problem);
  }
  const fixed = new Map();
  if (!problems.length) {
    if (environment !== 'production') for (const phone of testPhones) fixed.set(phone, { code: testCode, kind: 'test' });
    if (reviewerOn) fixed.set(reviewerPhone, { code: reviewerCode, kind: 'reviewer' });
  }
  return createTestSignIn(fixed, problems.join(' '));
}

export function createTestSignIn(fixed = new Map(), problem = '') {
  return {
    problem,
    enabled: fixed.size > 0,
    fixedFor(phone) {
      return fixed.get(phone) || null;
    },
    isReviewer(phone) {
      return fixed.get(phone)?.kind === 'reviewer';
    },
    matches(phone, code) {
      const entry = fixed.get(phone);
      if (!entry) return false;
      const a = Buffer.from(String(code ?? ''));
      const b = Buffer.from(entry.code);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
