export const PRIVACY_NOTICE = {
  document: 'privacy',
  version: 'draft-2026-11-14',
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
      body: 'Your mobile number, or the name and email address of the Google account you choose, to sign you in. Your name, so people you work with know who recorded what. The books of the businesses you keep in MyCA: invoices, bills, expenses, receipts and payments, the customers and suppliers named in them, and files you upload. Which phone you signed in on, and a record of every change made to the books and by whom. Crash reports, with names, amounts, GSTINs and phone numbers removed, only if you switch them on. Which setup steps you have reached in the app, such as adding a business, starting a trial or paying, with no names or amounts, and the invite code you joined with, if any, so we can see where people get stuck.',
    },
    {
      heading: 'Why we use it',
      body: 'To keep your books, prepare your GST figures, remind you of due dates, let the people you invite work with you, keep your account secure, fix problems in the app, and see in totals across everyone where people get stuck. We do not sell your information or use it for advertising.',
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

export const PRIVACY_NOTICE_US = {
  document: 'privacy',
  version: 'us-draft-2026-11-14',
  region: 'US',
  title: 'How MyCA uses your information (United States)',
  status: 'Draft for legal review. Not yet approved for release.',
  controller: '[The US company: legal name and US address, to be confirmed before release.]',
  sections: [
    {
      heading: 'Who we are',
      body: 'MyCA US is provided by [the US company, to be confirmed before release]. When you prepare a US tax return in MyCA we act as your tax return preparer. When you file, our IRS-authorized e-file partner, [Column Tax or April, to be confirmed], signs Form 8879 with you and sends your return to the IRS.',
    },
    {
      heading: 'What we collect',
      body: 'To sign you in: your Google account name and email, or your phone number. To prepare your return: names, dates of birth and Social Security numbers or ITINs for you, your spouse and your dependents; your address and filing status; the W-2, 1099 and 1098 forms and other documents you add; your answers to the interview; and the bank routing and account number you give for a refund or a payment. To sign and file: what the IRS asks every online filer for, which is your signature PIN, last year\'s AGI or PIN, any Identity Protection PIN, and the device identifier, IP address and time of signing. Our e-file partner collects these on its own filing screen. We also keep a record of every change and who made it.',
    },
    {
      heading: 'How we use it',
      body: 'Only to prepare your return, show you how each figure was worked out, file it with the IRS when you tell us to, tell you whether the IRS accepted it, and keep your account secure. Federal law (Internal Revenue Code section 7216) does not let us use or share your tax return information for anything else, such as marketing, without a separate signed consent from you. We do not sell your information and we do not use it for advertising.',
    },
    {
      heading: 'Who it is shared with',
      body: 'Our IRS-authorized e-file partner, when you choose to file: we pass on your names, dates of birth, address, dependents, tax forms and our estimate so you do not type them again, and your Social Security number only if you agree; the partner may use them only to file your return. The IRS, through that partner. Google Cloud, which hosts MyCA. Anthropic, whose AI model reads the forms you photograph and answers your questions; Social Security numbers and ITINs are removed before anything is sent to it, and it may not keep or train on what it receives. People you invite to your return, such as your spouse or your tax professional, who see Social Security numbers only as the last four digits. Nobody else, unless the law requires it.',
    },
    {
      heading: 'How it is protected',
      body: 'Your return is encrypted when stored and when it travels. Social Security numbers and ITINs are sealed again with a separate key and are shown only as the last four digits. Signing in can be protected with a second step, and filing needs one. Our safeguards follow the IRS Publication 4557 and the FTC Safeguards Rule, and are set out in our written information security plan.',
    },
    {
      heading: 'Where it is kept',
      body: 'On Google Cloud servers in the United States. MyCA US keeps US returns in a US region only, and staff outside the United States cannot reach them.',
    },
    {
      heading: 'How long we keep it',
      body: 'While you use MyCA, and then for at least three years after the return is filed, because federal law requires a preparer to keep a copy of each return and the signed Form 8879 for that long. After that it is deleted. [Retention periods to be confirmed by counsel.]',
    },
    {
      heading: 'Your choices',
      body: 'You can see, correct and download your information in the app, and delete your account in the app; records the law requires us to keep are kept for that time and then deleted. Residents of California and other states with privacy laws can ask us what we hold and ask us to delete it by writing to us below.',
    },
    {
      heading: 'Contact',
      body: 'Privacy contact: [Name], [email]. [To be appointed before release.]',
    },
  ],
};

const NOTICES = [PRIVACY_NOTICE, PRIVACY_NOTICE_US];

export function noticeFor(region) {
  return String(region || '').toUpperCase() === 'US' ? PRIVACY_NOTICE_US : PRIVACY_NOTICE;
}

const EXEMPT = new Set(['GET me', 'DELETE me', 'POST me/consent', 'POST crash-reports', 'GET reference/states']);

export function consentExempt(method, parts) {
  return EXEMPT.has(`${method} ${parts.slice(1).join('/')}`);
}

export function createConsent({ db, now = () => Date.now() }) {
  async function accepted(userId) {
    const { rowCount } = await db.query(
      'select 1 from consents where user_id = $1 and document = $2 and version = any($3::text[])',
      [userId, PRIVACY_NOTICE.document, NOTICES.map((notice) => notice.version)],
    );
    return rowCount > 0;
  }

  return {
    accepted,
    async status(userId) {
      return { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, accepted: await accepted(userId) };
    },
    async accept(userId, deviceId, body = {}) {
      const notice = NOTICES.find((n) => n.document === body.document && n.version === body.version);
      if (!notice) {
        return { ok: false, error: 'NOTICE_CHANGED', version: PRIVACY_NOTICE.version };
      }
      await db.query(
        `insert into consents (user_id, document, version, device_id, accepted_at) values ($1, $2, $3, $4, $5)
         on conflict (user_id, document, version) do nothing`,
        [userId, notice.document, notice.version, deviceId || null, new Date(now())],
      );
      return { ok: true, document: notice.document, version: notice.version };
    },
  };
}
