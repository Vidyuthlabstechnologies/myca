const TIMEOUT_MS = 15000;

function masked(phone) {
  const digits = String(phone || '');
  return `${digits.slice(0, 3)}…${digits.slice(-2)}`;
}

async function post(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`sms provider answered ${res.status}: ${text.slice(0, 200)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function createTwilioSender({ accountSid, authToken, from, fetchImpl = fetch, log = () => {} }) {
  if (!accountSid || !authToken || !from) throw new Error('twilio needs MYCA_SMS_TWILIO_SID, MYCA_SMS_TWILIO_TOKEN and MYCA_SMS_TWILIO_FROM');
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  async function sendText(phone, text) {
    const body = new URLSearchParams({ To: phone, From: from, Body: text });
    await post(fetchImpl, `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    log({ sms: 'sent', provider: 'twilio', to: masked(phone) });
  }
  return {
    provider: 'twilio',
    send: (phone, code) => sendText(phone, `${code} is your MyCA sign-in code. It expires in five minutes.`),
    sendText,
  };
}

export function createMsg91Sender({ authKey, templateId, fetchImpl = fetch, log = () => {} }) {
  if (!authKey || !templateId) throw new Error('msg91 needs MYCA_SMS_MSG91_AUTHKEY and MYCA_SMS_MSG91_TEMPLATE_ID');
  return {
    provider: 'msg91',
    async send(phone, code) {
      const mobile = String(phone).replace(/^\+/, '');
      const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=${encodeURIComponent(mobile)}&otp_expiry=5`;
      await post(fetchImpl, url, {
        method: 'POST',
        headers: { authkey: authKey, 'content-type': 'application/json' },
        body: JSON.stringify({ OTP: code }),
      });
      log({ sms: 'sent', provider: 'msg91', to: masked(phone) });
    },
  };
}

export function smsSenderFromEnv(rawEnv = process.env, { fetchImpl = fetch, log = () => {} } = {}) {
  const env = Object.fromEntries(Object.entries(rawEnv).map(([key, value]) => [key, value === 'unset' ? '' : value]));
  const provider = String(env.MYCA_SMS_PROVIDER || '').trim().toLowerCase();
  if (!provider) return null;
  if (provider === 'twilio') return createTwilioSender({ accountSid: env.MYCA_SMS_TWILIO_SID, authToken: env.MYCA_SMS_TWILIO_TOKEN, from: env.MYCA_SMS_TWILIO_FROM, fetchImpl, log });
  if (provider === 'msg91') return createMsg91Sender({ authKey: env.MYCA_SMS_MSG91_AUTHKEY, templateId: env.MYCA_SMS_MSG91_TEMPLATE_ID, fetchImpl, log });
  throw new Error(`unknown MYCA_SMS_PROVIDER "${provider}": use twilio or msg91`);
}
