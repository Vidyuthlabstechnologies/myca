import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { isPlainObject } from './validate.mjs';

function resolvePath(jsonPath) {
  if (jsonPath instanceof URL) return jsonPath.protocol === 'file:' ? fileURLToPath(jsonPath) : null;
  return typeof jsonPath === 'string' && jsonPath !== '' ? jsonPath : null;
}

function refuseNetwork() {
  throw new Error('GOLDEN_NETWORK_FORBIDDEN: golden cases must not make network calls');
}

function goldenCases(document) {
  if (Array.isArray(document)) return document;
  if (isPlainObject(document) && Array.isArray(document.cases)) return document.cases;
  return null;
}

async function runCase(goldenCase, index, compute) {
  const shaped = isPlainObject(goldenCase);
  const name = shaped && typeof goldenCase.name === 'string' ? goldenCase.name : null;
  const citation = shaped && typeof goldenCase.citation === 'string' && goldenCase.citation.trim() !== '' ? goldenCase.citation : null;
  const where = { index, name, citation };
  if (!shaped || !Object.hasOwn(goldenCase, 'input') || !Object.hasOwn(goldenCase, 'expected') || citation === null) {
    return { ...where, error: 'GOLDEN_CASE_INVALID' };
  }
  let actual;
  try {
    actual = await compute(goldenCase.input);
  } catch (error) {
    return { ...where, error: 'GOLDEN_COMPUTE_THREW', message: error instanceof Error ? error.message : String(error) };
  }
  if (isDeepStrictEqual(actual, goldenCase.expected)) return null;
  return { ...where, error: 'GOLDEN_MISMATCH', expected: goldenCase.expected, actual };
}

export async function runGolden(jsonPath, compute) {
  if (typeof compute !== 'function') return { ok: false, error: 'GOLDEN_COMPUTE_INVALID' };
  const path = resolvePath(jsonPath);
  if (path === null) return { ok: false, error: 'GOLDEN_UNREADABLE', path: String(jsonPath) };
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, error: 'GOLDEN_UNREADABLE', path };
  }
  let document;
  try {
    document = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'GOLDEN_JSON_INVALID', path };
  }
  const cases = goldenCases(document);
  if (cases === null) return { ok: false, error: 'GOLDEN_SHAPE_INVALID', path };
  if (cases.length === 0) return { ok: false, error: 'GOLDEN_EMPTY', path };
  const failures = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = refuseNetwork;
  try {
    for (const [index, goldenCase] of cases.entries()) {
      const failure = await runCase(goldenCase, index, compute);
      if (failure) failures.push(failure);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  return { ok: failures.length === 0, path, total: cases.length, passed: cases.length - failures.length, failures };
}
