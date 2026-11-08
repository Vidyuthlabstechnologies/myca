import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', '08000', '08001', '08003', '08004', '08006', '57P01', '57P02', '57P03', '53300']);
const CONNECTION_MESSAGES = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'Client has encountered a connection error and is not queryable',
]);

pg.types.setTypeParser(20, (value) => Number(value));

function serverBusy(cause) {
  const err = new Error('SERVER_BUSY', { cause });
  err.statusCode = 503;
  err.body = { ok: false, error: 'SERVER_BUSY' };
  return err;
}

function translated(err) {
  if (!err) return err;
  const lost = err.code ? CONNECTION_CODES.has(err.code) : CONNECTION_MESSAGES.has(err.message);
  return lost ? serverBusy(err) : err;
}

export function createDb(connectionString, { max = 10, connectionTimeoutMillis = 5000, onError = () => {} } = {}) {
  const pool = new pg.Pool({ connectionString, max, connectionTimeoutMillis });
  pool.on('error', onError);
  const query = (text, params) => pool.query(text, params).catch((err) => { throw translated(err); });
  const acquire = () => pool.connect().catch((err) => { throw translated(err); });
  return {
    query,
    async tx(run) {
      const client = await acquire();
      let broken = null;
      const onClientError = (err) => {
        broken = broken || err;
      };
      client.on('error', onClientError);
      const step = (text, params) => client.query(text, params).catch((err) => { throw translated(err); });
      try {
        await step('begin');
        const out = await run(step);
        await step('commit');
        return out;
      } catch (err) {
        const out = translated(err);
        if (out !== err) broken = broken || err;
        await client.query('rollback').catch((rollbackErr) => {
          broken = broken || rollbackErr;
        });
        throw out;
      } finally {
        client.removeListener('error', onClientError);
        client.release(broken || undefined);
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
