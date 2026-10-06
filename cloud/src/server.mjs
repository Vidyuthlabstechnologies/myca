import { createServer } from 'node:http';
import { createApi } from './api.mjs';
import { createConsoleSender } from './auth.mjs';
import { createDb, migrate } from './db.mjs';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function otpSender() {
  if (process.env.MYCA_DEV_OTP === '1') return createConsoleSender();
  throw new Error('no SMS sender is configured; set MYCA_DEV_OTP=1 for local development only');
}

const db = createDb(required('MYCA_DATABASE_URL'));
await migrate(db);
const handler = createApi({
  db,
  secret: required('MYCA_TOKEN_SECRET'),
  otpSender: otpSender(),
  log: (entry) => console.log(JSON.stringify(entry)),
  version: process.env.K_REVISION || 'dev',
});
const port = Number(process.env.PORT || 8080);
createServer(handler).listen(port, () => console.log(JSON.stringify({ listening: port })));
