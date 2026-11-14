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

export const PRIVACY_NOTICE_US = {
  document: 'privacy',
  version: 'us-draft-2026-11-11',
  region: 'US',
  title: 'How MyCA uses your information (United States)',
  status: 'Draft for legal review. Not yet approved for release.',
  controller: 'ML Dynamic Solutions Private Limited, 606, 6th Floor, Gowra Fountainhead, Patrika Nagar, Madhapur, HITEC City, Hyderabad, Telangana 500081, India',
  sections: [
    {
      heading: 'Who we are',
      body: 'MyCA is provided by ML Dynamic Solutions Private Limited. When you prepare a US tax return in MyCA we act as your tax return preparer and, when you sign, as the company that sends your return to the IRS.',
    },
    {
      heading: 'What we collect',
      body: 'To sign you in: your Google account name and email, or your phone number. To prepare your return: names, dates of birth and Social Security numbers or ITINs for you, your spouse and your dependents; your address and filing status; the W-2, 1099 and 1098 forms and other documents you add; your answers to the interview; and the bank routing and account number you give for a refund or a payment. To sign and file: your signature PIN, last year\'s AGI or PIN, any Identity Protection PIN, and the device identifier, IP address and time of signing, which the IRS asks every online provider to send. We also keep a record of every change and who made it.',
    },
    {
      heading: 'How we use it',
      body: 'Only to prepare your return, show you how each figure was worked out, file it with the IRS when you tell us to, tell you whether the IRS accepted it, and keep your account secure. Federal law (Internal Revenue Code section 7216) does not let us use or share your tax return information for anything else, such as marketing, without a separate signed consent from you. We do not sell your information and we do not use it for advertising.',
    },
    {
      heading: 'Who it is shared with',
      body: 'The IRS, when you file. Google Cloud, which hosts MyCA. Anthropic, whose AI model reads the forms you photograph and answers your questions; Social Security numbers and ITINs are removed before anything is sent to it, and it may not keep or train on what it receives. People you invite to your return, such as your spouse or your tax professional, who see Social Security numbers only as the last four digits. Nobody else, unless the law requires it.',
    },
    {
      heading: 'How it is protected',
      body: 'Your return is encrypted when stored and when it travels. Social Security numbers and ITINs are sealed again with a separate key and are shown only as the last four digits. Signing in can be protected with a second step, and filing needs one. Our safeguards follow the IRS Publication 4557 and the FTC Safeguards Rule, and are set out in our written information security plan.',
    },
    {
      heading: 'Where it is kept',
      body: '[To be confirmed before release: on Google Cloud servers in the United States.]',
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

const MY_VERSION = 'my-draft-2026-11-14';
const MY_CONTROLLER = 'ML Dynamic Solutions Private Limited, 606, 6th Floor, Gowra Fountainhead, Patrika Nagar, Madhapur, HITEC City, Hyderabad, Telangana 500081, India';
const MY_DPO_EMAIL = 'dpo@[domain to be confirmed]';

export const PRIVACY_NOTICE_MY = {
  document: 'privacy',
  version: MY_VERSION,
  region: 'MY',
  language: 'en',
  title: 'How MyCA uses your personal data (Malaysia)',
  status: 'Draft for legal review under the Personal Data Protection Act 2010 as amended in 2024. Not yet approved for release.',
  law: 'Personal Data Protection Act 2010 (Act 709), as amended by the Personal Data Protection (Amendment) Act 2024',
  controller: MY_CONTROLLER,
  dataProtectionOfficer: { email: MY_DPO_EMAIL, confirmed: false },
  storage: { provider: 'Google Cloud', region: 'asia-southeast1', place: 'Singapore', transferBasis: 'PDPA section 129' },
  retention: { years: 7, basis: ['Income Tax Act 1967 section 82', 'Sales Tax Act 2018 and Service Tax Act 2018 record-keeping requirements'] },
  breachNotification: { commissionerWithinHours: 72 },
  sections: [
    {
      heading: 'Who we are',
      body: `MyCA is provided by ${MY_CONTROLLER}. We are the data user (controller) of the personal data described here under the Personal Data Protection Act 2010 as amended in 2024 (the PDPA), and we are responsible for it.`,
    },
    {
      heading: 'What we collect',
      body: 'To sign you in: your mobile number, or the name and email address of the Google account you choose. To keep your books: the invoices, bills, expenses, receipts and payments you record, the customers and suppliers named in them with their tax identification numbers (TIN), business registration, MyKad or passport numbers and addresses, the e-invoices you issue or receive through LHDN MyInvois, and the files you upload. To estimate your income tax: the income, reliefs, zakat and monthly tax deductions you enter. We also keep which phone you signed in on and a record of every change to the books and who made it.',
    },
    {
      heading: 'Why we use it',
      body: 'To keep your books; to build, sign and submit e-invoices to LHDN MyInvois when you confirm them; to prepare your SST-02 figures and your income tax estimate; to remind you of due dates; to let the people you invite work with you; to keep your account secure; and to fix problems in the app. We do not sell your personal data and do not use it for advertising. Giving us these details is voluntary, but without them we cannot keep your books or issue e-invoices for you.',
    },
    {
      heading: 'Who it is shared with',
      body: 'LHDN (the Inland Revenue Board of Malaysia), when you submit, cancel or reject an e-invoice or check a TIN. Google Cloud, which hosts MyCA. The people you invite to your business, such as your staff or your tax agent. Nobody else, unless the law requires it.',
    },
    {
      heading: 'Where it is kept',
      body: 'On Google Cloud servers in Singapore (region asia-southeast1). Google Cloud has no region in Malaysia yet. Section 129 of the PDPA, as amended in 2024, allows personal data to be transferred to a place outside Malaysia whose law is substantially similar to the PDPA or ensures an adequate level of protection; we rely on Singapore\'s Personal Data Protection Act 2012 for that. We will move your data to a Malaysian region when one opens.',
    },
    {
      heading: 'How long we keep it',
      body: 'While you use MyCA, and then for seven years after the end of the year the records relate to, because section 82 of the Income Tax Act 1967 and the record-keeping rules of the Sales Tax Act 2018 and the Service Tax Act 2018 require business records, including e-invoices, to be kept for seven years. After that they are deleted. [Retention periods to be confirmed by counsel.]',
    },
    {
      heading: 'Your rights',
      body: 'You may ask for access to the personal data we hold about you and for a copy of it, ask us to correct it if it is inaccurate, incomplete, misleading or out of date, ask us to send it to another data user (data portability), and withdraw your consent at any time by deleting your account in the app; records the law requires us to keep are kept for that time. You may complain to the Personal Data Protection Commissioner of Malaysia.',
    },
    {
      heading: 'If something goes wrong',
      body: 'If a personal data breach happens, we notify the Personal Data Protection Commissioner within 72 hours of becoming aware of it, and we tell you without undue delay when the breach is likely to cause you significant harm.',
    },
    {
      heading: 'Contact',
      body: `Data Protection Officer: ${MY_DPO_EMAIL}, ML Dynamic Solutions Private Limited. [The officer and this address are to be confirmed before release.]`,
    },
  ],
};

export const PRIVACY_NOTICE_MY_MS = {
  ...PRIVACY_NOTICE_MY,
  language: 'ms',
  title: 'Cara MyCA menggunakan data peribadi anda (Malaysia)',
  status: 'Draf untuk semakan undang-undang di bawah Akta Perlindungan Data Peribadi 2010 seperti yang dipinda pada 2024. Belum diluluskan untuk diterbitkan.',
  law: 'Akta Perlindungan Data Peribadi 2010 (Akta 709), seperti yang dipinda oleh Akta Perlindungan Data Peribadi (Pindaan) 2024',
  sections: [
    {
      heading: 'Siapa kami',
      body: `MyCA disediakan oleh ${MY_CONTROLLER}. Kami ialah pengguna data (pengawal) bagi data peribadi yang diterangkan di sini di bawah Akta Perlindungan Data Peribadi 2010 seperti yang dipinda pada 2024 (APDP), dan kami bertanggungjawab ke atasnya.`,
    },
    {
      heading: 'Apa yang kami kumpul',
      body: 'Untuk log masuk: nombor telefon bimbit anda, atau nama dan alamat e-mel akaun Google yang anda pilih. Untuk menyimpan buku akaun anda: invois, bil, perbelanjaan, resit dan bayaran yang anda rekodkan, pelanggan dan pembekal yang dinamakan di dalamnya bersama nombor pengenalan cukai (TIN), nombor pendaftaran perniagaan, MyKad atau pasport dan alamat mereka, e-invois yang anda keluarkan atau terima melalui LHDN MyInvois, dan fail yang anda muat naik. Untuk menganggar cukai pendapatan anda: pendapatan, pelepasan, zakat dan potongan cukai bulanan yang anda masukkan. Kami juga menyimpan telefon yang anda gunakan untuk log masuk dan rekod setiap perubahan pada buku akaun serta siapa yang membuatnya.',
    },
    {
      heading: 'Mengapa kami menggunakannya',
      body: 'Untuk menyimpan buku akaun anda; untuk membina, menandatangani dan menghantar e-invois kepada LHDN MyInvois apabila anda mengesahkannya; untuk menyediakan angka SST-02 dan anggaran cukai pendapatan anda; untuk mengingatkan anda tentang tarikh akhir; untuk membolehkan orang yang anda jemput bekerja bersama anda; untuk memastikan akaun anda selamat; dan untuk membetulkan masalah dalam aplikasi. Kami tidak menjual data peribadi anda dan tidak menggunakannya untuk pengiklanan. Pemberian butiran ini adalah sukarela, tetapi tanpanya kami tidak dapat menyimpan buku akaun anda atau mengeluarkan e-invois untuk anda.',
    },
    {
      heading: 'Dengan siapa ia dikongsi',
      body: 'LHDN (Lembaga Hasil Dalam Negeri Malaysia), apabila anda menghantar, membatalkan atau menolak e-invois atau menyemak TIN. Google Cloud, yang mengehoskan MyCA. Orang yang anda jemput ke perniagaan anda, seperti kakitangan atau ejen cukai anda. Tiada orang lain, melainkan jika dikehendaki oleh undang-undang.',
    },
    {
      heading: 'Di mana ia disimpan',
      body: 'Di pelayan Google Cloud di Singapura (rantau asia-southeast1). Google Cloud belum mempunyai rantau di Malaysia. Seksyen 129 APDP, seperti yang dipinda pada 2024, membenarkan data peribadi dipindahkan ke tempat di luar Malaysia yang undang-undangnya pada substansinya serupa dengan APDP atau memastikan tahap perlindungan yang mencukupi; kami bergantung pada Akta Perlindungan Data Peribadi 2012 Singapura untuk itu. Kami akan memindahkan data anda ke rantau di Malaysia apabila ia dibuka.',
    },
    {
      heading: 'Berapa lama kami menyimpannya',
      body: 'Selagi anda menggunakan MyCA, dan kemudian selama tujuh tahun selepas akhir tahun yang berkaitan dengan rekod itu, kerana seksyen 82 Akta Cukai Pendapatan 1967 dan peraturan penyimpanan rekod Akta Cukai Jualan 2018 dan Akta Cukai Perkhidmatan 2018 menghendaki rekod perniagaan, termasuk e-invois, disimpan selama tujuh tahun. Selepas itu ia dipadam. [Tempoh penyimpanan akan disahkan oleh peguam.]',
    },
    {
      heading: 'Hak anda',
      body: 'Anda boleh meminta akses kepada data peribadi yang kami simpan tentang anda dan salinannya, meminta kami membetulkannya jika ia tidak tepat, tidak lengkap, mengelirukan atau tidak terkini, meminta kami menghantarnya kepada pengguna data lain (kemudahalihan data), dan menarik balik persetujuan anda pada bila-bila masa dengan memadam akaun anda dalam aplikasi; rekod yang dikehendaki oleh undang-undang disimpan untuk tempoh itu. Anda boleh membuat aduan kepada Pesuruhjaya Perlindungan Data Peribadi Malaysia.',
    },
    {
      heading: 'Jika berlaku masalah',
      body: 'Jika berlaku pelanggaran data peribadi, kami memaklumkan Pesuruhjaya Perlindungan Data Peribadi dalam masa 72 jam selepas mengetahuinya, dan kami memaklumkan anda tanpa kelewatan yang tidak wajar apabila pelanggaran itu mungkin menyebabkan kemudaratan yang ketara kepada anda.',
    },
    {
      heading: 'Hubungi',
      body: `Pegawai Perlindungan Data: ${MY_DPO_EMAIL}, ML Dynamic Solutions Private Limited. [Pegawai dan alamat ini akan disahkan sebelum diterbitkan.]`,
    },
  ],
};

const NOTICES = [PRIVACY_NOTICE, PRIVACY_NOTICE_US, PRIVACY_NOTICE_MY];

export function noticeFor(region, language) {
  const code = String(region || '').trim().toUpperCase();
  if (code === 'US') return PRIVACY_NOTICE_US;
  if (code === 'MY') return String(language || '').trim().toLowerCase().startsWith('ms') ? PRIVACY_NOTICE_MY_MS : PRIVACY_NOTICE_MY;
  return PRIVACY_NOTICE;
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
