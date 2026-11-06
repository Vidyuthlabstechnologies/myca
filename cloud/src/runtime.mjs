const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);

export function isProduction(env = process.env) {
  return Boolean(env.K_SERVICE) || TRUE_WORDS.has(String(env.MYCA_PRODUCTION || '').trim().toLowerCase());
}

export function hostingName(env = process.env) {
  if (env.K_SERVICE) return 'Cloud Run';
  if (isProduction(env)) return 'production';
  return 'development';
}

export function serviceRevision(env = process.env) {
  return String(env.K_REVISION || env.MYCA_REVISION || '').trim() || 'dev';
}

function databaseHost(connectionString) {
  try {
    const url = new URL(connectionString);
    const socket = url.searchParams.get('host');
    if (socket && socket.startsWith('/')) return { local: true };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return { local: host === 'localhost' || host === '127.0.0.1' || host === '::1', sslmode: url.searchParams.get('sslmode') || '' };
  } catch {
    return { local: false, sslmode: '' };
  }
}

export function databaseSsl(env = process.env) {
  const ca = String(env.MYCA_DATABASE_CA || '').trim();
  return ca ? { ca, rejectUnauthorized: true } : undefined;
}

export function databaseTlsProblem(env = process.env, connectionString = env.MYCA_DATABASE_URL || '') {
  if (!isProduction(env)) return '';
  const host = databaseHost(String(connectionString));
  if (host.local) return '';
  if (databaseSsl(env)) return '';
  if (host.sslmode === 'verify-full' || host.sslmode === 'verify-ca') return '';
  return 'In production the database must be reached over a local socket or over TLS that verifies the server: set MYCA_DATABASE_CA to the database CA bundle.';
}
