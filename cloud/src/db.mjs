import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

pg.types.setTypeParser(20, (value) => Number(value));

export function createDb(connectionString, { max = 10, onError = () => {} } = {}) {
  const pool = new pg.Pool({ connectionString, max });
  pool.on('error', onError);
  const query = (text, params) => pool.query(text, params);
  return {
    query,
    async tx(run) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await run((text, params) => client.query(text, params));
        await client.query('commit');
        return out;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function migrate(db) {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const applied = [];
  for (const name of names) {
    const ran = await db.tx(async (q) => {
      await q('lock table schema_migrations in exclusive mode');
      const seen = await q('select 1 from schema_migrations where name = $1', [name]);
      if (seen.rowCount) return false;
      await q(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
      await q('insert into schema_migrations (name) values ($1)', [name]);
      return true;
    });
    if (ran) applied.push(name);
  }
  return applied;
}
