// Entry point for build_itr_json: ITR-1, ITR-2, ITR-3 and ITR-4.
import { buildItr34Return, buildItrReturnWordsInner } from './itr-return-builder.mjs';
import { buildItr1 } from './itr-return-individual.mjs';

export function buildItrReturn(state, args = {}) {
  const form = String(args.form || '').replace(/\s|-/g, '').toUpperCase();
  if (form === 'ITR1') return buildItr1(args);
  return buildItr34Return(state, args);
}

export const buildItrReturnWords = buildItrReturnWordsInner;
