export const MIN_BODY_BUDGET_BYTES = 16 * 1024 * 1024;
export const FALLBACK_BODY_BUDGET_BYTES = 64 * 1024 * 1024;
export const BODY_BUDGET_MEMORY_DIVISOR = 16;
export const BODY_BUDGET_ENV = 'MYCA_BODY_BUDGET_BYTES';

export function createBodyBudget(limitBytes) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) throw new RangeError('the body budget must be a positive whole number of bytes');
  let held = 0;
  return {
    limit: limitBytes,
    held: () => held,
    reserve(bytes, { force = false } = {}) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) return null;
      if (!force && held + bytes > limitBytes) return null;
      held += bytes;
      let given = false;
      return () => {
        if (given) return;
        given = true;
        held -= bytes;
      };
    },
  };
}

export function bodyBudgetFromEnvironment(env = process.env) {
  const given = String(env?.[BODY_BUDGET_ENV] ?? '').trim();
  if (!/^[0-9]+$/.test(given)) return 0;
  const bytes = Number(given);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : 0;
}

export function defaultBodyBudgetBytes({ constrainedMemory, env = process.env, ceiling = Infinity } = {}) {
  const override = bodyBudgetFromEnvironment(env);
  if (override) return override;
  const memory = Number(constrainedMemory);
  if (!Number.isFinite(memory) || memory <= 0) return FALLBACK_BODY_BUDGET_BYTES;
  return Math.min(ceiling, Math.max(MIN_BODY_BUDGET_BYTES, Math.floor(memory / BODY_BUDGET_MEMORY_DIVISOR)));
}
