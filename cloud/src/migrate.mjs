import { createDb, migrate } from './db.mjs';

const url = String(process.env.MYCA_DATABASE_URL || '').trim();
if (!url) {
  console.error('MYCA_DATABASE_URL is required');
  process.exit(2);
}
const db = createDb(url, { max: 2 });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `applied ${applied.join(', ')}` : 'nothing to apply');
} finally {
  await db.close();
}
