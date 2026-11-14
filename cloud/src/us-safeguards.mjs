import { deploymentEnvironment } from './environment.mjs';

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);
export const US_SECOND_STEP_TOOLS = Object.freeze(['sign_us_return', 'file_us_return']);

export function usSecondStepRequired(env = process.env) {
  if (deploymentEnvironment(env) === 'production') return true;
  return TRUE_WORDS.has(String(env.MYCA_US_REQUIRE_SECOND_STEP ?? '').trim().toLowerCase());
}

export const SECOND_STEP_FOR_FILING = Object.freeze({
  ok: false,
  error: 'SECOND_STEP_REQUIRED',
  hint: 'Turn on two-step sign-in under Security before you sign or e-file. The IRS asks every online filer to protect their account with a second step.',
});
