import { createServer } from 'node:http';
import { createApi } from './api.mjs';
import { createConsoleSender } from './auth.mjs';
import { createDb, migrate } from './db.mjs';
import { clientIdsFrom } from './google.mjs';
import { smsSenderFromEnv } from './sms-sender.mjs';
import { whatsAppConfigFromEnv, createWhatsAppSender } from './whatsapp.mjs';

const STARTUP_ATTEMPTS = 10;
const STARTUP_WAIT_MS = 3000;
const SHUTDOWN_GRACE_MS = 25000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function otpSender() {
  if (process.env.MYCA_DEV_OTP === '1') return createConsoleSender();
  return smsSenderFromEnv(process.env, { log });
}

const log = (entry) => console.log(JSON.stringify(entry));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function migrateWithRetry(db) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const applied = await migrate(db);
      log({ migrated: applied, attempt });
      return;
    } catch (err) {
      if (attempt >= STARTUP_ATTEMPTS) throw err;
      log({ startup: 'database not ready', attempt, error: String(err && err.message ? err.message : err) });
      await wait(STARTUP_WAIT_MS);
    }
  }
}

const db = createDb(required('MYCA_DATABASE_URL'));
await migrateWithRetry(db);
const handler = createApi({
  db,
  secret: required('MYCA_TOKEN_SECRET'),
  otpSender: otpSender(),
  googleClientIds: clientIdsFrom(process.env.MYCA_GOOGLE_CLIENT_IDS),
  jobToken: String(process.env.MYCA_JOB_TOKEN || '').trim(),
  inboundEmail: { domain: String(process.env.MYCA_INBOUND_EMAIL_DOMAIN || '').trim(), relayToken: String(process.env.MYCA_INBOUND_RELAY_TOKEN || '').trim() },
  whatsapp: whatsAppConfigFromEnv(process.env),
  whatsappSender: (() => { const cfg = whatsAppConfigFromEnv(process.env); return cfg.phoneNumberId && cfg.accessToken ? createWhatsAppSender({ phoneNumberId: cfg.phoneNumberId, accessToken: cfg.accessToken, log }) : null; })(),
  log,
  version: process.env.K_REVISION || 'dev',
});
const port = Number(process.env.PORT || 8080);
const server = createServer(handler);
server.keepAliveTimeout = 65000;
server.listen(port, () => log({ listening: port }));

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log({ shutdown: signal });
  const deadline = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
  deadline.unref();
  server.close(() => {
    db.close().catch(() => {}).finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
