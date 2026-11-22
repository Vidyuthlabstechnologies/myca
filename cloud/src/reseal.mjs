import { createDb } from './db.mjs';
import { booksKeyFromEnv } from './books-seal.mjs';
import { resealAll } from './books-reseal.mjs';

const url = String(process.env.MYCA_DATABASE_URL || '').trim();
if (!url) throw new Error('MYCA_DATABASE_URL is required');
const newKey = String(process.env.MYCA_BOOKS_KEY_NEW || '').trim();
if (!newKey) throw new Error('MYCA_BOOKS_KEY_NEW is required');
const apply = process.argv.includes('--apply');
const db = createDb(url, { max: 1 });
try {
  const report = await resealAll({ db, oldKey: booksKeyFromEnv(process.env), newKey, apply });
  console.log(JSON.stringify(report));
  console.log(apply ? 'Every row now opens with the new key.' : 'Nothing was changed. Run again with --apply to write.');
} finally {
  await db.close();
}
