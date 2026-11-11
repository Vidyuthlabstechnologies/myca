export const PRIVACY_NOTICE = {
  document: 'privacy',
  version: 'draft-2026-10-07',
  title: 'How MyCA uses your information',
  status: 'Draft for legal review. Not yet approved for release.',
  controller: 'ML Dynamic Solutions Private Limited, 606, 6th Floor, Gowra Fountainhead, Patrika Nagar, Madhapur, HITEC City, Hyderabad, Telangana 500081',
  sections: [
    {
      heading: 'Who we are',
      body: 'MyCA is provided by ML Dynamic Solutions Private Limited, Hyderabad. We decide why and how your information is used, and we are responsible for it.',
    },
    {
      heading: 'What we collect',
      body: 'Your mobile number, or the name and email address of the Google account you choose, to sign you in. Your name, so people you work with know who recorded what. The books of the businesses you keep in MyCA: invoices, bills, expenses, receipts and payments, the customers and suppliers named in them, and files you upload. Which phone you signed in on, and a record of every change made to the books and by whom. Crash reports, with names, amounts, GSTINs and phone numbers removed, only if you switch them on.',
    },
    {
      heading: 'Why we use it',
      body: 'To keep your books, prepare your GST figures, remind you of due dates, let the people you invite work with you, keep your account secure, and fix problems in the app. We do not sell your information or use it for advertising.',
    },
    {
      heading: 'Where it is kept',
      body: 'On servers in India. MyCA does not file returns or send anything to the government or anyone else unless you confirm it first.',
    },
    {
      heading: 'How long we keep it',
      body: 'While you use MyCA. Tax and company law may require business records to be kept for a number of years after a period ends; where they do, the books are kept for that time and then deleted. [Retention periods to be confirmed by counsel.]',
    },
    {
      heading: 'Your rights',
      body: 'You can ask to see the information we hold about you, correct it, or have it erased, and you can withdraw this consent at any time by deleting your account in the app. Withdrawing does not affect what was done before. You can complain to our Grievance Officer, and if you are not satisfied, to the Data Protection Board of India.',
    },
    {
      heading: 'Contact',
      body: 'Grievance Officer: [Name], [email], ML Dynamic Solutions Private Limited, Hyderabad. [To be appointed before release.]',
    },
  ],
};

const EXEMPT = new Set(['GET me', 'DELETE me', 'POST me/consent', 'POST crash-reports', 'GET reference/states']);

export function consentExempt(method, parts) {
  return EXEMPT.has(`${method} ${parts.slice(1).join('/')}`);
}

export function createConsent({ db, now = () => Date.now() }) {
  async function accepted(userId) {
    const { rowCount } = await db.query(
      'select 1 from consents where user_id = $1 and document = $2 and version = $3',
      [userId, PRIVACY_NOTICE.document, PRIVACY_NOTICE.version],
    );
    return rowCount > 0;
  }

  return {
    accepted,
    async status(userId) {
      return { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, accepted: await accepted(userId) };
    },
    async accept(userId, deviceId, body = {}) {
      if (body.document !== PRIVACY_NOTICE.document || body.version !== PRIVACY_NOTICE.version) {
        return { ok: false, error: 'NOTICE_CHANGED', version: PRIVACY_NOTICE.version };
      }
      await db.query(
        `insert into consents (user_id, document, version, device_id, accepted_at) values ($1, $2, $3, $4, $5)
         on conflict (user_id, document, version) do nothing`,
        [userId, PRIVACY_NOTICE.document, PRIVACY_NOTICE.version, deviceId || null, new Date(now())],
      );
      return { ok: true, document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version };
    },
  };
}
