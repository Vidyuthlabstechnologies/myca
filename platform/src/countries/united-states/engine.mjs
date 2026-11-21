import { setUsStateResidency, usStateResidencyPreview, usStateCoverage, usStateFilingPackage, usStateQuestions, usStateReturnFor, usStateReturnsWords } from './state-returns.mjs';

export const ENGINE = Object.freeze({
  country: 'US',
  run: Object.freeze({
    set_us_state_residency: setUsStateResidency,
    us_state_coverage: () => usStateCoverage(),
    us_state_filing_package: usStateFilingPackage,
    us_state_questions: usStateQuestions,
    us_state_returns: usStateReturnFor,
  }),
  preview: Object.freeze({
    set_us_state_residency: usStateResidencyPreview,
  }),
  words: Object.freeze({
    us_state_returns: (result) => (result.ok && result.data ? usStateReturnsWords(result.data) : ''),
  }),
});
