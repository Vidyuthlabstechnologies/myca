export const LEGAL_INDIA = Object.freeze({
  company: 'ML Dynamic Solutions Private Limited',
  cin: '[CIN, to be filled before release]',
  registeredOffice: '606, 6th Floor, Gowra Fountainhead, Patrika Nagar, Madhapur, HITEC City, Hyderabad, Telangana 500081 [confirm this is the registered office]',
  supportEmail: '[support email, to be filled before release]',
  grievanceOfficer: Object.freeze({
    name: '[Grievance Officer name, to be appointed before release]',
    designation: 'Grievance Officer',
    email: '[grievance email, to be filled before release]',
    phone: '[phone, optional]',
  }),
  replyWithinDays: 30,
  acknowledgeWithinHours: 48,
});

export const PRIVACY_NOTICE = {
  document: 'privacy',
  version: 'india-2026-11-14',
  region: 'IN',
  requiresAdult: true,
  title: 'How MyCA uses your information',
  status: 'Draft for legal review. Not yet approved for release.',
  controller: `${LEGAL_INDIA.company}, ${LEGAL_INDIA.registeredOffice}`,
  contact: LEGAL_INDIA,
  sections: [
    {
      heading: 'Who we are',
      body: `MyCA is software provided by ${LEGAL_INDIA.company} (CIN ${LEGAL_INDIA.cin}), ${LEGAL_INDIA.registeredOffice}. We are the data fiduciary for your account: we decide why and how your information is used, and we are responsible for it. For the people named in your books, such as your customers, suppliers and staff, you decide what is recorded and we process it for you. MyCA is not a firm of Chartered Accountants and does not give tax or legal advice.`,
    },
    {
      heading: 'What we collect, and why',
      body: 'Each item is used only for the purpose next to it. Your mobile number, or the name and email of the Google account you choose: to sign you in and keep your account secure. Your name: so the people you work with see who recorded what. A random id for each phone you sign in on: so you can see and sign out your devices. The books of your businesses (invoices, bills, expenses, payroll, bank lines, tax figures, GSTIN and PAN, and the customers, suppliers and staff named in them) and the files you upload: to keep your books, prepare and, when you confirm, file your returns, and remind you of due dates. Messages you send the assistant: to carry out what you ask. Your Google Play subscription: to know which plan you have paid for. Crash reports, only if you switch them on, with names, amounts, GSTINs and phone numbers removed: to fix the app. Which setup steps you reach, with no names or amounts, and the invite code you joined with: to see in totals where people get stuck. A record of every change to the books and who looked at them: for security and so you can check it. We do not collect location, contacts, SMS or advertising ids, and we do not sell your information or use it for advertising.',
    },
    {
      heading: 'Who we share it with',
      body: 'Only what a feature needs, and only when you use it. Members you invite to a business see what their role allows. Google checks a Google sign-in and a Play subscription. The SMS provider receives your number and the code, for phone sign-in. The GST Suvidha Provider (Quicko) receives the return, your GSTIN and the OTP step, when you file a GST return or make an e-way bill. The NIC e-invoice and e-way bill systems receive the invoice, when you make an IRN or e-way bill. The language model provider receives the text of a chat message that matches no built-in action and the bill you ask MyCA to read, only when the service has a model switched on; it never works out a figure. The WhatsApp gateway and the email relay receive the message and the recipient, when you send one. Services you connect yourself receive what that connection syncs. Google Cloud hosts everything on our behalf. Nobody else, unless the law requires it.',
    },
    {
      heading: 'Where it is kept',
      body: 'Your account and books are stored on Google Cloud servers in Mumbai, India, and our logs are kept in India. Two features can send information outside India, and only when you use them: the language model provider, which may process a chat message or a bill in the United States, and the email relay, which runs on a worldwide network. MyCA does not file a return or send anything to the government unless you confirm it first.',
    },
    {
      heading: 'How long we keep it',
      body: 'While you use MyCA. When you delete a business or your account it disappears from the app at once and is erased for good thirty days later; signing in again within those thirty days cancels an account deletion. Backups age out within fourteen days after that. Security logs and the record of who looked at your books are kept for one year, as the law asks. Tax law asks you, the taxpayer, to keep your records for six years or more, so download a copy before you delete; the download is free and complete. [Retention periods to be confirmed by counsel.]',
    },
    {
      heading: 'Your rights and how to use them',
      body: `Under the Digital Personal Data Protection Act, 2023 you can ask what we hold and who we shared it with, have it corrected, completed or erased, withdraw this consent, nominate someone to act for you if you die or cannot act, and complain. In the app: Settings, then Your privacy rights, where every request gets a reference number. You can also write to the Grievance Officer below. We acknowledge within ${LEGAL_INDIA.acknowledgeWithinHours} hours and reply within ${LEGAL_INDIA.replyWithinDays} days. You withdraw consent by deleting your account in Settings, as easily as you gave it; withdrawing does not affect what was done before. If you are not satisfied with our answer, you can complain to the Data Protection Board of India.`,
    },
    {
      heading: 'Age',
      body: 'MyCA is for people aged 18 or over who keep books for a business. Please do not use it if you are under 18.',
    },
    {
      heading: 'If something goes wrong',
      body: 'If your information is ever exposed in a breach, we will tell you without delay inside the app and by email where we have it, with what happened, what it means for you and what you can do, and we will report it to the Data Protection Board of India and to CERT-In as the law requires.',
    },
    {
      heading: 'Contact',
      body: `${LEGAL_INDIA.grievanceOfficer.designation}: ${LEGAL_INDIA.grievanceOfficer.name}, ${LEGAL_INDIA.grievanceOfficer.email}, ${LEGAL_INDIA.company}, ${LEGAL_INDIA.registeredOffice}. Support: ${LEGAL_INDIA.supportEmail}.`,
    },
  ],
};

export const PRIVACY_NOTICE_US = {
  document: 'privacy',
  version: 'us-draft-2026-11-14.2',
  region: 'US',
  requiresAdult: true,
  title: 'How MyCA uses your information (United States)',
  status: 'Draft for legal review. Not yet approved for release.',
  controller: '[The US company: legal name and US address, to be confirmed before release.]',
  sections: [
    {
      heading: 'Who we are',
      body: 'MyCA US is provided by [the US company, to be confirmed before release]. When you prepare a US tax return in MyCA we act as your tax return preparer. When you file, our IRS-authorized e-file partner, [Column Tax or April, to be confirmed], signs Form 8879 with you and sends your return to the IRS. MyCA US is for adults 18 and over.',
    },
    {
      heading: 'What we collect',
      body: 'To sign you in: your Google account name and email, or your phone number. To prepare your return: names, dates of birth and Social Security numbers or ITINs for you, your spouse and your dependents; your address and filing status; the W-2, 1099 and 1098 forms and other documents you add; your answers to the interview; and the bank routing and account number you give for a refund or a payment. To sign and file: what the IRS asks every online filer for, which is your signature PIN, last year\'s AGI or PIN, any Identity Protection PIN, and the device identifier, IP address and time of signing. Our e-file partner collects these on its own filing screen. We also keep a record of every change and who made it, which phone you signed in on, and, only if you switch them on, crash reports with names, amounts and numbers removed.',
    },
    {
      heading: 'How we use it',
      body: 'Only to prepare your return, show you how each figure was worked out, file it with the IRS when you tell us to, tell you whether the IRS accepted it, and keep your account secure. Federal law (Internal Revenue Code section 7216) does not let us use or share your tax return information for anything else, such as marketing, without a separate signed consent from you. We do not sell your information, we do not share it for advertising, and we do not use it to profile you. Your Social Security number and other sensitive information are used only to provide the service you asked for.',
    },
    {
      heading: 'Who it is shared with',
      body: 'Our IRS-authorized e-file partner, when you choose to file: we pass on your names, dates of birth, address, dependents, tax forms and our estimate so you do not type them again; the partner may use them only to file your return. Your Social Security numbers are passed on only if you sign a separate consent, which you can withdraw in the app at any time. The IRS, through that partner. Google Cloud, which hosts MyCA. Anthropic, whose AI model reads the forms you photograph and answers your questions; Social Security numbers and ITINs are removed before anything is sent to it, and it may not keep or train on what it receives. Stripe, Google Play or Apple when you pay, which receive payment details but not your return. People you invite to your return, such as your spouse or your tax professional, who see Social Security numbers only as the last four digits. Nobody else, unless the law requires it.',
    },
    {
      heading: 'How it is protected',
      body: 'We maintain physical, electronic and procedural safeguards that comply with applicable law and federal standards. Your return is encrypted when stored and when it travels. Social Security numbers and ITINs are sealed again with a separate key and are shown only as the last four digits. Signing in can be protected with a second step, and signing or filing a return needs one. Our safeguards follow IRS Publication 4557 and the FTC Safeguards Rule, and are set out in our written information security plan. If your information is ever exposed, we will tell you and the authorities as the law requires.',
    },
    {
      heading: 'Where it is kept',
      body: 'On Google Cloud servers in the United States. MyCA US keeps US returns in a US region only, and staff outside the United States cannot reach them.',
    },
    {
      heading: 'How long we keep it',
      body: 'While you use MyCA. If you delete your account or your return, we delete it thirty days later, unless MyCA itself sent the return to the IRS: then federal law requires us to keep the return and your signed Form 8879 for three years from the filing due date or the date the IRS received it, whichever is later, and we delete them after that. When our e-file partner files your return, the partner keeps those records under its own policy. Backups are overwritten within two weeks. [Retention periods to be confirmed by counsel.]',
    },
    {
      heading: 'Your choices and your rights',
      body: 'You can see, correct and download everything we hold about you in the app, and delete your account in the app. Wherever you live, you can also ask us by email (below) to tell you what we hold, to correct it or to delete it; we answer within 45 days, and we will not treat you differently for asking. Someone you authorize can ask for you. Records the law requires us to keep are kept for that time and then deleted. Because we do not sell or share your information for advertising, and use sensitive information only to provide the service, there is nothing to opt out of.',
    },
    {
      heading: 'Children',
      body: 'MyCA US is not for children. We do not knowingly collect information from a child under 13. A child\'s details are entered only by a parent or guardian, as a dependent on the parent\'s return.',
    },
    {
      heading: 'Changes to this notice',
      body: 'If we change this notice, the app shows you the new one and asks you to agree before you continue.',
    },
    {
      heading: 'Contact',
      body: 'Privacy contact: [Name], [email]. [To be appointed before release.]',
    },
  ],
};

const NOTICES = [PRIVACY_NOTICE, PRIVACY_NOTICE_US];

export function legalLinks(siteUrl) {
  const base = String(siteUrl || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/.test(base)) return {};
  return { privacy: `${base}/privacy`, terms: `${base}/terms`, refunds: `${base}/refunds`, disclaimer: `${base}/disclaimer`, grievance: `${base}/grievance`, deleteAccount: `${base}/delete-account` };
}

export function noticeFor(region) {
  return String(region || '').toUpperCase() === 'US' ? PRIVACY_NOTICE_US : PRIVACY_NOTICE;
}

const EXEMPT = new Set(['GET me', 'DELETE me', 'POST me/consent', 'POST crash-reports', 'GET reference/states', 'GET me/privacy-requests', 'POST me/privacy-requests']);

export function consentExempt(method, parts) {
  return EXEMPT.has(`${method} ${parts.slice(1).join('/')}`);
}

export function noticesFor(countries = []) {
  const codes = (Array.isArray(countries) ? countries : []).map((code) => String(code).toUpperCase());
  const list = NOTICES.filter((notice) => (notice.region === 'US' ? codes.includes('US') : codes.some((code) => code !== 'US')));
  return list.length ? list : NOTICES;
}

export function createConsent({ db, now = () => Date.now(), notices = NOTICES }) {
  const primary = notices[0];

  async function accepted(userId) {
    const { rowCount } = await db.query(
      'select 1 from consents where user_id = $1 and document = $2 and version = any($3::text[])',
      [userId, primary.document, notices.map((notice) => notice.version)],
    );
    return rowCount > 0;
  }

  return {
    accepted,
    primary,
    async status(userId) {
      return { document: primary.document, version: primary.version, accepted: await accepted(userId) };
    },
    async accept(userId, deviceId, body = {}) {
      const notice = notices.find((n) => n.document === body.document && n.version === body.version);
      if (!notice) {
        return { ok: false, error: 'NOTICE_CHANGED', version: primary.version };
      }
      if (notice.requiresAdult && body.adult !== true) {
        return { ok: false, error: 'ADULT_REQUIRED', hint: 'Confirm that you are 18 or over to use MyCA. If the box is missing, update the app.' };
      }
      await db.query(
        `insert into consents (user_id, document, version, device_id, accepted_at, adult_declared) values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, document, version) do nothing`,
        [userId, notice.document, notice.version, deviceId || null, new Date(now()), body.adult === true],
      );
      return { ok: true, document: notice.document, version: notice.version };
    },
  };
}
