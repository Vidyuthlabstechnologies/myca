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
  version: 'india-2026-11-23',
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
      body: 'Each item is used only for the purpose next to it. Your mobile number, or the name and email of the Google account you choose: to sign you in and keep your account secure. Your name: so the people you work with see who recorded what. A random id for each phone you sign in on: so you can see and sign out your devices. The books of your businesses (invoices, bills, expenses, payroll, bank lines, tax figures, GSTIN and PAN, and the customers, suppliers and staff named in them) and the files you upload: to keep your books, prepare and, when you confirm, file your returns, and remind you of due dates. The owner\'s date of birth, only if you give it: to apply the senior and super senior citizen income tax rules to a proprietor\'s return and advance tax. Messages you send the assistant: to carry out what you ask. Your Google Play subscription: to know which plan you have paid for. Crash reports, only if you switch them on, with names, amounts, GSTINs and phone numbers removed: to fix the app. Which setup steps you reach, with no names or amounts, and the invite code you joined with: to see in totals where people get stuck. A record of every change to the books and who looked at them: for security and so you can check it. We do not collect location, contacts, SMS or advertising ids, and we do not sell your information or use it for advertising.',
    },
    {
      heading: 'Who we share it with',
      body: 'Only what a feature needs, and only when you use it. Members you invite to a business see what their role allows. Google checks a Google sign-in and a Play subscription. The SMS provider receives your number and the code, for phone sign-in. The GST Suvidha Provider (Quicko) receives the return, your GSTIN and the OTP step, when you file a GST return or make an e-way bill. The NIC e-invoice and e-way bill systems receive the invoice, when you make an IRN or e-way bill. The language model provider (Anthropic) receives the text of a chat message that matches no built-in action and the bill you ask MyCA to read, only when the service has a model switched on; Aadhaar numbers are removed before anything is sent to it, it may not train on what it receives, and it never works out a figure. The WhatsApp gateway and the email relay receive the message and the recipient, when you send one. Services you connect yourself receive what that connection syncs. Google Cloud hosts everything on our behalf. Nobody else, unless the law requires it.',
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
      body: `Under the Digital Personal Data Protection Act, 2023 you can ask what we hold and who we shared it with, have it corrected, completed or erased, withdraw this consent, nominate someone to act for you if you die or cannot act, and complain. In the app: Settings, then Your privacy rights, where every request gets a reference number. You can also write to the Grievance Officer below. We acknowledge within ${LEGAL_INDIA.acknowledgeWithinHours} hours and reply within ${LEGAL_INDIA.replyWithinDays} days. You withdraw consent by deleting your account in Settings, as easily as you gave it; withdrawing does not affect what was done before. If you are not satisfied with our answer, you can complain to the Data Protection Board of India. You may also give, review or withdraw consent through a consent manager registered with the Board. You can ask for this notice in English or in any language listed in the Eighth Schedule to the Constitution, and we will send it to you.`,
    },
    {
      heading: 'Age',
      body: 'MyCA is for people aged 18 or over who keep books for a business and act for themselves. Please do not use it if you are under 18. If you are the lawful guardian of a person with a disability, open the account in your own name; we do not knowingly process the personal data of a child, or of a person with a disability who has a lawful guardian, without that parent\'s or guardian\'s verifiable consent.',
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
  version: 'us-draft-2026-11-22',
  region: 'US',
  requiresAdult: true,
  title: 'How MyCA uses your information (United States)',
  status: 'Draft for legal review. Not yet approved for release.',
  controller: 'Quanzo AI. [US postal address to be confirmed before release.]',
  sections: [
    {
      heading: 'Who we are',
      body: 'MyCA US is provided by Quanzo AI. When you prepare a US tax return in MyCA we act as your tax return preparer. When you file, our e-file partner, Column Tax [partner agreement to be signed before release], signs Form 8879 with you and sends your return to the IRS. MyCA US is for adults 18 and over.',
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
      body: 'Our e-file partner, when you choose to file: we pass on your names, dates of birth, address, dependents, tax forms and our estimate so you do not type them again; the partner may use them only to file your return. Your Social Security numbers are passed on only if you sign a separate consent, which you can withdraw in the app at any time. The IRS, through that partner. Google Cloud, which hosts MyCA. Anthropic, whose AI model reads the forms you photograph and answers your questions; Social Security numbers and ITINs are removed before anything is sent to it, and it may not keep or train on what it receives. Stripe, Google Play or Apple when you pay, which receive payment details but not your return. People you invite to your return, such as your spouse or your tax professional, who see Social Security numbers only as the last four digits. Nobody else, unless the law requires it.',
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
  breachNotification: { commissionerWithinHours: 72, usersWithinDays: 7 },
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
      body: 'If a personal data breach happens, we notify the Personal Data Protection Commissioner within 72 hours of becoming aware of it, and when the breach is likely to cause you significant harm we tell you within 7 days of notifying the Commissioner, with what happened and what you can do.',
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
      body: 'Jika berlaku pelanggaran data peribadi, kami memaklumkan Pesuruhjaya Perlindungan Data Peribadi dalam masa 72 jam selepas mengetahuinya, dan apabila pelanggaran itu mungkin menyebabkan kemudaratan yang ketara kepada anda, kami memaklumkan anda dalam masa 7 hari selepas memaklumkan Pesuruhjaya, berserta apa yang berlaku dan apa yang boleh anda lakukan.',
    },
    {
      heading: 'Hubungi',
      body: `Pegawai Perlindungan Data: ${MY_DPO_EMAIL}, ML Dynamic Solutions Private Limited. [Pegawai dan alamat ini akan disahkan sebelum diterbitkan.]`,
    },
  ],
};

const AE_VERSION = 'ae-draft-2026-11-15.2';
const AE_CONTROLLER = 'ML Dynamic Solutions Private Limited, a company registered in India, 606, 6th Floor, Gowra Fountainhead, Patrika Nagar, Madhapur, HITEC City, Hyderabad, Telangana 500081, India';
const AE_PRIVACY_EMAIL = '[privacy email, to be confirmed before release]';

export const PRIVACY_NOTICE_AE = {
  document: 'privacy',
  version: AE_VERSION,
  region: 'AE',
  language: 'en',
  requiresAdult: true,
  title: 'How MyCA uses your personal data (UAE)',
  status: 'Draft for legal review under Federal Decree-Law No. 45 of 2021. Not yet approved for release.',
  law: 'Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data',
  controller: AE_CONTROLLER,
  dataProtectionOfficer: { email: AE_PRIVACY_EMAIL, confirmed: false },
  storage: { provider: 'Google Cloud', region: 'me-central1', place: 'Doha, Qatar', transferBasis: 'Federal Decree-Law No. 45 of 2021, Article 23' },
  retention: { years: 5, corporateTaxYears: 7, backupsDays: 14, crashReportsDays: 90, erasureAfterDeletionDays: 30 },
  sections: [
    {
      heading: 'Who we are',
      body: `MyCA UAE is provided by ${AE_CONTROLLER}. For your account (your name, email, phone and plan) we are the controller. For the contents of your books (your customers', suppliers' and employees' names, Tax Registration Numbers, contact details and amounts) your business is the controller and we process that data on your business's instructions. Contact: ${AE_PRIVACY_EMAIL}.`,
    },
    {
      heading: 'What MyCA is, and what it is not',
      body: 'MyCA UAE is bookkeeping and tax preparation software. It keeps your books, prepares your VAT 201 and Corporate Tax figures and checks your invoices for e-invoicing readiness. MyCA is not a registered tax agent and does not file returns for you: you, or your registered tax agent, review and file on the Federal Tax Authority\'s EmaraTax portal. MyCA never asks for your EmaraTax or UAE Pass password and does not move or hold money. While MyCA runs in sandbox mode, invoices are checked by the MyCA server and shown to you, and are not sent to anyone else.',
    },
    {
      heading: 'What we collect and why',
      body: 'Your Google account name and email, or your phone number, to sign you in and show who did what. A random device id, so you can see and sign out your devices. Your books (invoices, bills, expenses, payroll, bank lines, VAT and Corporate Tax figures, TRN and trade licence details), because that is the service you asked for and UAE tax law requires records. Documents you choose to upload, to import entries. Messages to the assistant, to do what you ask. Google Play subscription records, to know your plan. Crash reports and marketing messages only if you turn them on. We do not collect your location, contacts or advertising identifiers, we do not sell your data, and we do not use your books to train AI models.',
    },
    {
      heading: 'Who else sees your data',
      body: 'People you invite to your business see what their role allows. Google checks a Google sign-in and a Google Play subscription. Google Cloud hosts MyCA. The SMS provider receives your number and sign-in code when phone sign-in is on. The language model provider receives a chat message or bill image only when you use those features. An Accredited Service Provider for e-invoicing receives invoice data only after we connect one and you switch it on. Authorities receive data only when UAE law requires it.',
    },
    {
      heading: 'Where it is kept',
      body: 'On Google Cloud servers in Doha, Qatar (region me-central1), because Google Cloud has no region in the UAE today. This is a transfer outside the UAE; we rely on our contract with Google Cloud, which requires protection at least equal to UAE law (Federal Decree-Law No. 45 of 2021, Article 23), and on the transfer being needed to provide the service. We plan to move UAE data to a data centre in the UAE and will tell you in the app when we do. Businesses in the DIFC or ADGM can ask for our data processing addendum.',
    },
    {
      heading: 'How long we keep it',
      body: 'Your books are kept while your business is on MyCA. UAE law expects tax records to be kept for at least 5 years after the tax period ends, and 7 years for Corporate Tax and real estate records; before you delete a business MyCA reminds you and offers a full download. Backups are kept for 14 days and crash reports for 90 days. When you delete your account, your name, phone number, email and Google account link are erased 30 days later; signing in again within those 30 days cancels the deletion.',
    },
    {
      heading: 'Your rights',
      body: 'Under Federal Decree-Law No. 45 of 2021 you can ask to know what we hold about you, get a copy or have it sent to another provider, correct it, delete it, restrict or stop processing including marketing, and withdraw consent. We answer within 30 days. You can complain to the UAE Data Office or the authority that replaces it.',
    },
    {
      heading: 'Security',
      body: 'Data travels over HTTPS and is encrypted at rest. Access is limited by role and logged. Sign-in codes expire in five minutes. If a breach affects your data, we tell you and the authority what happened and what we are doing.',
    },
    {
      heading: 'Children and changes',
      body: 'MyCA UAE is for businesses and people aged 18 and over. When anything material changes, we show the new version in the app in English and Arabic and ask you to accept it before continuing.',
    },
  ],
};

export const PRIVACY_NOTICE_AE_AR = {
  ...PRIVACY_NOTICE_AE,
  language: 'ar',
  title: 'كيف يستخدم MyCA بياناتك الشخصية (الإمارات)',
  status: 'مسودة للمراجعة القانونية بموجب المرسوم بقانون اتحادي رقم 45 لسنة 2021. لم تُعتمد للنشر بعد.',
  law: 'المرسوم بقانون اتحادي رقم 45 لسنة 2021 بشأن حماية البيانات الشخصية',
  sections: [
    {
      heading: 'من نحن',
      body: `يقدّم تطبيق MyCA الإمارات ${AE_CONTROLLER}. بالنسبة لحسابك (اسمك وبريدك الإلكتروني وهاتفك وباقتك) فإننا المتحكّم في البيانات. أمّا محتوى دفاترك (أسماء عملائك ومورّديك وموظفيك، وأرقام التسجيل الضريبي، وبيانات التواصل، والمبالغ) فإن منشأتك هي المتحكّم، ونعالج هذه البيانات وفق تعليمات منشأتك. للتواصل: ${AE_PRIVACY_EMAIL}.`,
    },
    {
      heading: 'ما هو MyCA وما ليس هو',
      body: 'MyCA الإمارات برنامج لمسك الدفاتر وإعداد الضرائب. يحفظ دفاترك، ويُعدّ أرقام إقرار ضريبة القيمة المضافة (VAT 201) وضريبة الشركات، ويتحقق من جاهزية فواتيرك للفوترة الإلكترونية. MyCA ليس وكيلًا ضريبيًا مسجّلًا ولا يقدّم الإقرارات نيابةً عنك: أنت، أو وكيلك الضريبي المسجّل، تراجع الإقرار وتقدّمه عبر بوابة "إمارات تاكس" التابعة للهيئة الاتحادية للضرائب. لا يطلب MyCA أبدًا كلمة مرور "إمارات تاكس" أو "الهوية الرقمية (UAE Pass)"، ولا ينقل الأموال ولا يحتفظ بها. ما دام MyCA يعمل في الوضع التجريبي، تُفحص الفواتير على خادم MyCA وتُعرض عليك ولا تُرسل إلى أي جهة أخرى.',
    },
    {
      heading: 'ما نجمعه ولماذا',
      body: 'اسم حساب Google وبريده، أو رقم هاتفك، لتسجيل دخولك وبيان من قام بأي إجراء. معرّف عشوائي للجهاز، لتتمكن من رؤية أجهزتك وتسجيل الخروج منها. دفاترك (الفواتير والمشتريات والمصروفات والرواتب والحركات البنكية وأرقام ضريبة القيمة المضافة وضريبة الشركات ورقم التسجيل الضريبي وبيانات الرخصة التجارية)، لأنها الخدمة التي طلبتها ولأن قانون الضرائب في الإمارات يوجب حفظ السجلات. المستندات التي تختار رفعها، لاستيراد القيود. رسائلك إلى المساعد، لتنفيذ ما تطلبه. سجلات اشتراك Google Play، لمعرفة باقتك. تقارير الأعطال والرسائل التسويقية فقط إذا فعّلتها. لا نجمع موقعك أو جهات اتصالك أو معرّفات الإعلانات، ولا نبيع بياناتك، ولا نستخدم دفاترك لتدريب نماذج الذكاء الاصطناعي.',
    },
    {
      heading: 'من يطّلع أيضًا على بياناتك',
      body: 'الأشخاص الذين تدعوهم إلى منشأتك يرون ما تسمح به صلاحياتهم. تتحقق Google من تسجيل الدخول عبر Google ومن اشتراك Google Play. تستضيف Google Cloud تطبيق MyCA. يتلقى مزوّد الرسائل النصية رقمك ورمز الدخول عند تفعيل الدخول بالهاتف. يتلقى مزوّد النموذج اللغوي رسالة المحادثة أو صورة الفاتورة فقط عند استخدامك لهاتين الميزتين. يتلقى مزوّد خدمة معتمد للفوترة الإلكترونية بيانات الفاتورة فقط بعد ربطه وتفعيلك له. وتتلقى الجهات الرسمية البيانات فقط عندما يوجب قانون الإمارات ذلك.',
    },
    {
      heading: 'أين تُحفظ بياناتك',
      body: 'على خوادم Google Cloud في الدوحة، قطر (المنطقة me-central1)، لأن Google Cloud لا تملك منطقة داخل الإمارات حاليًا. يُعدّ ذلك نقلًا للبيانات خارج الدولة، ونستند فيه إلى عقدنا مع Google Cloud الذي يُلزمها بحماية لا تقل عن قانون الإمارات (المرسوم بقانون اتحادي رقم 45 لسنة 2021، المادة 23)، وإلى أن النقل لازم لتقديم الخدمة. ونعتزم نقل بيانات الإمارات إلى مركز بيانات داخل الدولة وسنبلغك داخل التطبيق عند ذلك. يمكن للمنشآت في مركز دبي المالي العالمي (DIFC) أو سوق أبوظبي العالمي (ADGM) طلب ملحق معالجة البيانات الخاص بنا.',
    },
    {
      heading: 'مدة الاحتفاظ',
      body: 'تُحفظ دفاترك ما دامت منشأتك على MyCA. يُلزم قانون الإمارات بحفظ السجلات الضريبية خمس سنوات على الأقل بعد انتهاء الفترة الضريبية، وسبع سنوات لسجلات ضريبة الشركات والعقارات، ويذكّرك MyCA بذلك قبل حذف أي منشأة ويعرض عليك تنزيل كل البيانات. تُحفظ النسخ الاحتياطية 14 يومًا وتقارير الأعطال 90 يومًا. عند حذف حسابك يُمحى اسمك ورقم هاتفك وبريدك وربط حساب Google بعد 30 يومًا، ويلغي تسجيل دخولك خلال هذه المدة طلبَ الحذف.',
    },
    {
      heading: 'حقوقك',
      body: 'بموجب المرسوم بقانون اتحادي رقم 45 لسنة 2021 يحق لك أن تطلب معرفة ما نحتفظ به عنك، والحصول على نسخة منه أو نقله إلى مزوّد آخر، وتصحيحه، وحذفه، وتقييد المعالجة أو إيقافها بما في ذلك التسويق، وسحب موافقتك. نرد خلال 30 يومًا. ويمكنك تقديم شكوى إلى مكتب الإمارات للبيانات أو الجهة التي تحل محله.',
    },
    {
      heading: 'الأمان',
      body: 'تنتقل البيانات عبر HTTPS وتُحفظ مشفّرة. يُقيَّد الوصول حسب الصلاحيات ويُسجَّل. تنتهي صلاحية رموز الدخول خلال خمس دقائق. وإذا تعرّضت بياناتك لاختراق، نبلغك ونبلغ الجهة المختصة بما حدث وبما نتخذه من إجراءات.',
    },
    {
      heading: 'الأطفال والتغييرات',
      body: 'MyCA الإمارات مخصّص للمنشآت وللأشخاص بعمر 18 عامًا فأكثر. عند أي تغيير جوهري، نعرض الإصدار الجديد داخل التطبيق باللغتين العربية والإنجليزية ونطلب موافقتك عليه قبل المتابعة.',
    },
  ],
};

const NOTICES = [PRIVACY_NOTICE, PRIVACY_NOTICE_US, PRIVACY_NOTICE_MY, PRIVACY_NOTICE_AE];

export function legalLinks(siteUrl) {
  const base = String(siteUrl || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/.test(base)) return {};
  return { privacy: `${base}/privacy`, terms: `${base}/terms`, refunds: `${base}/refunds`, disclaimer: `${base}/disclaimer`, grievance: `${base}/grievance`, deleteAccount: `${base}/delete-account` };
}

export function noticeFor(region, language) {
  const code = String(region || '').trim().toUpperCase();
  if (code === 'US') return PRIVACY_NOTICE_US;
  if (code === 'MY') return String(language || '').trim().toLowerCase().startsWith('ms') ? PRIVACY_NOTICE_MY_MS : PRIVACY_NOTICE_MY;
  if (code === 'AE') return String(language || '').trim().toLowerCase().startsWith('ar') ? PRIVACY_NOTICE_AE_AR : PRIVACY_NOTICE_AE;
  return PRIVACY_NOTICE;
}

const EXEMPT = new Set(['GET me', 'DELETE me', 'POST me/consent', 'POST crash-reports', 'GET reference/states', 'GET me/privacy-requests', 'POST me/privacy-requests']);

export function consentExempt(method, parts) {
  return EXEMPT.has(`${method} ${parts.slice(1).join('/')}`);
}

export function noticesFor(countries = []) {
  const codes = (Array.isArray(countries) ? countries : []).map((code) => String(code).toUpperCase());
  const own = new Set(['US', 'MY', 'AE']);
  const list = NOTICES.filter((notice) => (own.has(notice.region) ? codes.includes(notice.region) : codes.some((code) => !own.has(code))));
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
