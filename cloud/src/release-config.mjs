const lower = (value) => String(value ?? '').trim().toLowerCase();

function hostOf(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// What a Cloud Run service says about itself: its plain environment values and its addresses.
export function serviceFacts(description) {
  const containers = description?.spec?.template?.spec?.containers || description?.template?.containers || [];
  const env = {};
  for (const item of containers[0]?.env || []) {
    if (item && item.name && Object.hasOwn(item, 'value')) env[item.name] = String(item.value);
  }
  const addresses = [description?.status?.url, ...(description?.status?.address ? [description.status.address.url] : []), ...(Array.isArray(description?.status?.urls) ? description.status.urls : [])].filter(Boolean);
  return { env, addresses };
}

// Checks, at the moment a release is built, that the app and the server it will talk to agree.
// A mismatch here is the difference between sign-in working for everyone and for nobody.
export function releaseConfigProblems({ app, service, requireLive = false }) {
  const problems = [];
  const notes = [];
  const { env, addresses } = service;

  const accepted = String(env.MYCA_GOOGLE_CLIENT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!accepted.length) problems.push('The server accepts no Google client id, so nobody could sign in with Google. Set google_client_ids on the server.');
  else if (!app.googleServerClientId) problems.push('The app is built with no Google client id, so it has no Google sign-in. Set the MYCA_GOOGLE_SERVER_CLIENT_ID repository variable.');
  else if (!accepted.includes(app.googleServerClientId)) problems.push(`The app is built with Google client id ${app.googleServerClientId}, but the server accepts ${accepted.join(', ')}. Sign-in would fail for everyone. Make them the same.`);

  const appHost = hostOf(app.cloudUrl);
  const serverHosts = [...new Set([hostOf(env.MYCA_PUBLIC_URL), ...addresses.map(hostOf)].filter(Boolean))];
  if (!appHost) problems.push('The app has no https server address. Set the MYCA_CLOUD_URL repository variable.');
  else if (serverHosts.length && !serverHosts.includes(appHost)) problems.push(`The app will call ${appHost}, but the server is reached at ${serverHosts.join(' or ')}. Point MYCA_CLOUD_URL at the server.`);

  const mode = lower(env.MYCA_PROVIDER_ENV) || 'off';
  if (mode === 'live') notes.push('The server is in live mode.');
  else if (requireLive) problems.push(`The server is in ${mode} mode, and this release requires live. Set provider_mode = "live" on the server first.`);
  else notes.push(`The server is in ${mode} mode, so this app would reach the test portal, not the real one.`);

  if (lower(env.MYCA_ENVIRONMENT) && lower(env.MYCA_ENVIRONMENT) !== 'production') problems.push(`The server says it is the ${lower(env.MYCA_ENVIRONMENT)} stack, not production. This release must not point at it.`);

  return { ok: problems.length === 0, problems, notes };
}
