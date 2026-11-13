function appOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

function isAppUrl(url, port) {
  try {
    return new URL(String(url || '')).origin === appOrigin(port);
  } catch {
    return false;
  }
}

function externalTarget(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {
    return '';
  }
}

function fromApp(event, port) {
  const frame = event && event.senderFrame;
  return Boolean(frame && !frame.parent && isAppUrl(frame.url, port));
}

module.exports = { appOrigin, isAppUrl, externalTarget, fromApp };
