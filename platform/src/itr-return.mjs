import { buildItr34Return, buildItrReturnWordsInner } from './itr-return-builder.mjs';
import { buildItr1 } from './itr-return-individual.mjs';
import { buildItr2 } from './itr-return-itr2.mjs';

export function buildItrReturn(state, args = {}) {
  const form = String(args.form || '').replace(/\s|-/g, '').toUpperCase();
  if (form === 'ITR1') return buildItr1(args);
  if (form === 'ITR2') return buildItr2(args);
  return buildItr34Return(state, args);
}

export const buildItrReturnWords = buildItrReturnWordsInner;
