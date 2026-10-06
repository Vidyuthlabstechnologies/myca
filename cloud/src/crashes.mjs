import { createDb } from './db.mjs';
import { createCrashReports } from './crash-reports.mjs';

const url = String(process.env.MYCA_DATABASE_URL || '').trim();
if (!url) throw new Error('MYCA_DATABASE_URL is required');
const limit = Math.max(1, Math.min(200, Number(process.argv[2]) || 20));
const db = createDb(url, { max: 1 });
try {
  const rows = await createCrashReports({ db }).recent(limit);
  if (!rows.length) console.log('No crash reports.');
  for (const row of rows) {
    console.log(`${row.last_seen.toISOString()}  ×${row.occurrences}  ${row.kind}  ${row.app_version}  ${row.error_type}: ${row.message}`);
    console.log(row.stack.split('\n').slice(0, 6).map((line) => `    ${line}`).join('\n'));
  }
} finally {
  await db.close();
}
