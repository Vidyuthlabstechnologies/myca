import { booksKeyFromEnv, isSealed, openState, resealState } from './books-seal.mjs';
import { createSecondFactor } from './second-factor.mjs';

const BOOKS_TABLES = ['books', 'shared_books'];
const UNUSED_SECRET = 'x'.repeat(32);

function opens(run) {
  try {
    run();
    return true;
  } catch {
    return false;
  }
}

export async function resealAll({ db, oldKey = '', newKey, apply = false }) {
  const next = booksKeyFromEnv({ MYCA_BOOKS_KEY: newKey });
  if (!next) throw new Error('the new key is required');
  if (next === oldKey) throw new Error('the new key is the same as the old one');
  const before = createSecondFactor({ db, secret: UNUSED_SECRET, booksKey: oldKey });
  const after = createSecondFactor({ db, secret: UNUSED_SECRET, booksKey: next });
  const report = { applied: false };
  await db.tx(async (q) => {
    for (const table of BOOKS_TABLES) {
      const counts = { rows: 0, resealed: 0, sealedForTheFirstTime: 0, alreadyUnderNewKey: 0 };
      const found = await q(`select business_id as "businessId", state from ${table} order by business_id for update`);
      for (const row of found.rows) {
        counts.rows += 1;
        if (isSealed(row.state) && opens(() => openState(next, row.businessId, row.state))) {
          counts.alreadyUnderNewKey += 1;
          continue;
        }
        const sealed = resealState(oldKey, next, row.businessId, row.state);
        openState(next, row.businessId, sealed);
        counts[isSealed(row.state) ? 'resealed' : 'sealedForTheFirstTime'] += 1;
        if (apply) await q(`update ${table} set state = $2::jsonb where business_id = $1`, [row.businessId, JSON.stringify(sealed)]);
      }
      report[table] = counts;
    }
    const counts = { rows: 0, resealed: 0, sealedForTheFirstTime: 0, alreadyUnderNewKey: 0 };
    const found = await q('select user_id as "userId", secret_sealed as sealed from user_totp order by user_id for update');
    for (const row of found.rows) {
      counts.rows += 1;
      const wasSealed = isSealed(row.sealed);
      if (wasSealed && opens(() => after.openSecret(row.userId, row.sealed))) {
        counts.alreadyUnderNewKey += 1;
        continue;
      }
      const sealed = after.sealSecret(row.userId, before.openSecret(row.userId, row.sealed));
      after.openSecret(row.userId, sealed);
      counts[wasSealed ? 'resealed' : 'sealedForTheFirstTime'] += 1;
      if (apply) await q('update user_totp set secret_sealed = $2 where user_id = $1', [row.userId, sealed]);
    }
    report.user_totp = counts;
  });
  report.applied = Boolean(apply);
  return report;
}
