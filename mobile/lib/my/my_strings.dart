import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

class MyStrings {
  const MyStrings(this.languageCode);

  final String languageCode;

  bool get ms => languageCode == 'ms';

  static const english = MyStrings('en');
  static const malay = MyStrings('ms');

  static const supportedLanguages = ['en', 'ms'];

  static const delegate = _MyStringsDelegate();

  static MyStrings of(BuildContext context) => Localizations.of<MyStrings>(context, MyStrings) ?? english;

  String _t(String en, String malay) => ms ? malay : en;

  String get appName => 'MyCA Malaysia';
  String get language => _t('Language', 'Bahasa');
  String get englishName => 'English';
  String get malayName => 'Bahasa Melayu';
  String get continueLabel => _t('Continue', 'Teruskan');
  String get cancel => _t('Cancel', 'Batal');
  String get save => _t('Save', 'Simpan');
  String get close => _t('Close', 'Tutup');
  String get tryAgain => _t('Try again', 'Cuba lagi');
  String get signOut => _t('Sign out', 'Log keluar');
  String get required => _t('Required', 'Wajib diisi');
  String get offline => _t('Cannot reach MyCA. Check your connection and try again. Nothing was sent.', 'Tidak dapat menghubungi MyCA. Semak sambungan anda dan cuba lagi. Tiada apa yang dihantar.');
  String get sandboxBanner => _t('Sandbox with sample books: nothing is sent to LHDN', 'Kotak pasir dengan buku contoh: tiada apa dihantar ke LHDN');
  String get leaveSandbox => _t('Leave the sandbox', 'Keluar dari kotak pasir');
  String get unreviewed => _t('Not yet reviewed by a Malaysian tax agent.', 'Belum disemak oleh ejen cukai Malaysia.');
  String get loadFailed => _t('Could not load this. Try again.', 'Tidak dapat dimuatkan. Cuba lagi.');
  String get notAvailableYet => _t('This is not available on the server yet.', 'Ini belum tersedia di pelayan.');
  String get outOfReach => _t('MyCA is out of reach', 'MyCA tidak dapat dihubungi');
  String get menu => _t('More', 'Lagi');
  String get pick => _t('Choose', 'Pilih');
  String get none => _t('Not stated', 'Tidak dinyatakan');
  String get optional => _t('Optional', 'Pilihan');
  String get yes => _t('Yes', 'Ya');
  String get no => _t('No', 'Tidak');

  String get welcomeTitle => _t('Your e-invoices,\nSST and tax,\nkept simple.', 'e-Invois, SST\ndan cukai anda,\ndengan mudah.');
  String get welcomeBody => _t(
    'Send LHDN e-invoices from your phone, prepare SST-02 on time and see your income tax before you file.',
    'Hantar e-Invois LHDN dari telefon anda, sediakan SST-02 tepat pada masanya dan lihat cukai pendapatan anda sebelum memfailkan.',
  );
  String get welcomePointEinvoice => _t('e-Invoices sent to LHDN MyInvois, with the QR code for your buyer', 'e-Invois dihantar ke LHDN MyInvois, dengan kod QR untuk pembeli anda');
  String get welcomePointSst => _t('SST-02 prepared for each two-month period, with its due date', 'SST-02 disediakan bagi setiap tempoh dua bulan, dengan tarikh akhirnya');
  String get welcomePointTax => _t('Income tax prepared in MyCA, you file in MyTax', 'Cukai pendapatan disediakan dalam MyCA, anda failkan dalam MyTax');
  String get welcomePointConfirm => _t('Nothing goes to LHDN until you confirm', 'Tiada apa dihantar ke LHDN sehingga anda sahkan');
  String get getStarted => _t('Get started', 'Mula');
  String get trySandbox => _t('Explore with sample books first', 'Cuba dengan buku contoh dahulu');
  String get setupTime => _t('About three minutes to set up', 'Kira-kira tiga minit untuk bermula');

  String get setupTitle => _t('Tell us about the business', 'Maklumat perniagaan anda');
  String get setupBody => _t('These details go on every e-invoice you send to LHDN.', 'Butiran ini dicetak pada setiap e-Invois yang anda hantar ke LHDN.');
  String get invited => _t('You have been invited', 'Anda telah dijemput');
  String get companyName => _t('Registered business name', 'Nama perniagaan berdaftar');
  String get companyNameHelp => _t('As registered with SSM', 'Seperti didaftarkan dengan SSM');
  String get companyNameMissing => _t('Enter the registered business name.', 'Masukkan nama perniagaan berdaftar.');
  String get tin => _t('Tax identification number (TIN)', 'Nombor pengenalan cukai (TIN)');
  String get tinHelp => _t('For example C20880050010, or IG115002000 for a sole proprietor', 'Contohnya C20880050010, atau IG115002000 bagi pemilik tunggal');
  String get tinBad => _t('That is not an LHDN TIN. Companies start with C, individuals with IG, followed by digits.', 'Itu bukan TIN LHDN. Syarikat bermula dengan C, individu dengan IG, diikuti nombor.');
  String get idType => _t('Registration type', 'Jenis pendaftaran');
  String get idValue => _t('Registration number', 'Nombor pendaftaran');
  String get brnHelp => _t('The 12-digit SSM number, e.g. 202001234567', 'Nombor SSM 12 digit, contohnya 202001234567');
  String get brnBad => _t('Write the 12-digit SSM number, e.g. 202001234567.', 'Tulis nombor SSM 12 digit, contohnya 202001234567.');
  String get nricBad => _t('A MyKad number has 12 digits.', 'Nombor MyKad mempunyai 12 digit.');
  String get idValueMissing => _t('Enter the registration number.', 'Masukkan nombor pendaftaran.');
  String get sst => _t('SST registration number', 'Nombor pendaftaran SST');
  String get sstHelp => _t('Leave empty if you are not registered for SST', 'Biarkan kosong jika anda tidak berdaftar SST');
  String get sstBad => _t('Write it as W10-1808-31000001. Separate two numbers with ;', 'Tulis seperti W10-1808-31000001. Asingkan dua nombor dengan ;');
  String get ttx => _t('Tourism tax registration number', 'Nombor pendaftaran cukai pelancongan');
  String get msic => _t('Business activity (MSIC code)', 'Aktiviti perniagaan (kod MSIC)');
  String get msicPick => _t('Choose your business activity', 'Pilih aktiviti perniagaan anda');
  String get msicSearch => _t('Search by code or activity', 'Cari mengikut kod atau aktiviti');
  String get msicNone => _t('No activity matches that search.', 'Tiada aktiviti sepadan dengan carian itu.');
  String get msicMissing => _t('Choose the business activity.', 'Pilih aktiviti perniagaan.');
  String get msicLoadFailed => _t('Could not load the MSIC list.', 'Tidak dapat memuatkan senarai MSIC.');
  String get address => _t('Address', 'Alamat');
  String get addressLine => _t('Street address', 'Alamat jalan');
  String get addressMissing => _t('Enter the street address.', 'Masukkan alamat jalan.');
  String get postcode => _t('Postcode', 'Poskod');
  String get postcodeBad => _t('A Malaysian postcode has 5 digits.', 'Poskod Malaysia mempunyai 5 digit.');
  String get city => _t('City', 'Bandar');
  String get cityMissing => _t('Enter the city.', 'Masukkan bandar.');
  String get state => _t('State', 'Negeri');
  String get stateMissing => _t('Choose the state.', 'Pilih negeri.');
  String get phone => _t('Phone number', 'Nombor telefon');
  String get phoneHelp => _t('With the country code, e.g. +60123456789', 'Dengan kod negara, contohnya +60123456789');
  String get phoneBad => _t('Digits only, with an optional +, 8 to 15 long.', 'Nombor sahaja, boleh bermula dengan +, 8 hingga 15 digit.');
  String get email => _t('Email', 'E-mel');
  String get emailBad => _t('That email address does not look right.', 'Alamat e-mel itu tidak betul.');
  String get checkingTin => _t('Checking the TIN with LHDN…', 'Menyemak TIN dengan LHDN…');
  String get tinNotFound => _t('LHDN does not know this TIN with that registration number. Check both and try again.', 'LHDN tidak mengenali TIN ini dengan nombor pendaftaran itu. Semak kedua-duanya dan cuba lagi.');
  String get tinValid => _t('LHDN knows this TIN.', 'TIN ini dikenali oleh LHDN.');
  String get settingUp => _t('Setting up…', 'Sedang disediakan…');
  String get saving => _t('Saving…', 'Sedang disimpan…');
  String get saveDetails => _t('Save details', 'Simpan butiran');
  String get profileTitle => _t('Business details', 'Butiran perniagaan');
  String get profileSaved => _t('Saved. Every new e-invoice uses these details.', 'Disimpan. Setiap e-Invois baharu menggunakan butiran ini.');
  String get setupFoot => _t(
    'Your data is kept in Google Cloud Singapore under the PDPA. LHDN only receives an e-invoice when you confirm it.',
    'Data anda disimpan di Google Cloud Singapura di bawah PDPA. LHDN hanya menerima e-Invois apabila anda mengesahkannya.',
  );

  String idTypeName(String code) => switch (code) {
    'BRN' => _t('SSM business registration', 'Pendaftaran perniagaan SSM'),
    'NRIC' => _t('MyKad', 'MyKad'),
    'PASSPORT' => _t('Passport', 'Pasport'),
    'ARMY' => _t('Army number', 'Nombor tentera'),
    _ => code,
  };

  String get homeEinvoice => _t('e-Invoice', 'e-Invois');
  String get newEinvoice => _t('New e-invoice', 'e-Invois baharu');
  String get allEinvoices => _t('All e-invoices', 'Semua e-Invois');
  String get noEinvoices => _t('No e-invoices yet. Your first one takes about a minute.', 'Belum ada e-Invois. Yang pertama mengambil masa kira-kira seminit.');
  String get exemptionNote => _t(
    'Businesses with annual turnover under RM3 million are exempt from e-invoicing (raised from RM1 million on 1 September 2026). You can still send e-invoices if your buyers ask for them.',
    'Perniagaan dengan jualan tahunan bawah RM3 juta dikecualikan daripada e-Invois (dinaikkan daripada RM1 juta pada 1 September 2026). Anda masih boleh menghantar e-Invois jika pembeli memintanya.',
  );
  String get homeSst => _t('Sales and service tax', 'Cukai jualan dan perkhidmatan');
  String sstDue(String period, String date) => _t('SST-02 for $period is due $date', 'SST-02 bagi $period perlu difailkan pada $date');
  String get prepareSst => _t('Prepare SST-02', 'Sediakan SST-02');
  String get mustIRegister => _t('Do I need to register for SST?', 'Perlukah saya mendaftar SST?');
  String get homeTax => _t('Income tax', 'Cukai pendapatan');
  String get homeTaxBody => _t('See your tax for the year of assessment before you file in MyTax.', 'Lihat cukai anda bagi tahun taksiran sebelum memfailkan dalam MyTax.');
  String get estimateTax => _t('Estimate my tax', 'Anggarkan cukai saya');
  String get homeBusiness => _t('Business', 'Perniagaan');
  String get profileMissing => _t('Add your e-invoice details before you send an e-invoice.', 'Tambah butiran e-Invois anda sebelum menghantar e-Invois.');
  String get profileReady => _t('e-Invoice details saved', 'Butiran e-Invois disimpan');
  String get addDetails => _t('Add details', 'Tambah butiran');
  String get plan => _t('Plan and billing', 'Pelan dan bil');
  String einvoiceCount(int count) => ms ? '$count e-Invois' : (count == 1 ? '1 e-invoice' : '$count e-invoices');

  String statusName(String status) => switch (status.toLowerCase()) {
    'valid' => _t('Valid', 'Sah'),
    'invalid' => _t('Invalid', 'Tidak sah'),
    'submitted' || 'in progress' || 'inprogress' || 'pending' => _t('In progress', 'Dalam proses'),
    'cancelled' => _t('Cancelled', 'Dibatalkan'),
    'rejected' => _t('Rejected', 'Ditolak'),
    'rejection requested' => _t('Rejection asked', 'Penolakan dipohon'),
    _ => status.isEmpty ? _t('Not sent', 'Belum dihantar') : status,
  };

  String get createTitle => _t('New e-invoice', 'e-Invois baharu');
  String get documentType => _t('Document', 'Dokumen');
  String documentTypeName(String type) => switch (type) {
    'invoice' => _t('Invoice', 'Invois'),
    'credit-note' => _t('Credit note', 'Nota kredit'),
    'debit-note' => _t('Debit note', 'Nota debit'),
    'refund-note' => _t('Refund note', 'Nota bayaran balik'),
    'self-billed-invoice' => _t('Self-billed invoice', 'Invois bil kendiri'),
    'self-billed-credit-note' => _t('Self-billed credit note', 'Nota kredit bil kendiri'),
    'self-billed-debit-note' => _t('Self-billed debit note', 'Nota debit bil kendiri'),
    'self-billed-refund-note' => _t('Self-billed refund note', 'Nota bayaran balik bil kendiri'),
    _ => type,
  };
  String get number => _t('Invoice number', 'Nombor invois');
  String get numberMissing => _t('Enter the invoice number.', 'Masukkan nombor invois.');
  String get numberTooLong => _t('The invoice number can be at most 50 characters.', 'Nombor invois paling panjang 50 aksara.');
  String get originalUuid => _t('LHDN UUID of the original e-invoice', 'UUID LHDN bagi e-Invois asal');
  String get originalUuidBad => _t('The UUID has 26 letters and digits, as shown on the original e-invoice.', 'UUID mempunyai 26 huruf dan nombor, seperti pada e-Invois asal.');
  String get buyer => _t('Buyer', 'Pembeli');
  String get seller => _t('Seller', 'Penjual');
  String buyerKindName(String kind) => switch (kind) {
    'business' => _t('Business', 'Perniagaan'),
    'individual' => _t('Individual', 'Individu'),
    'public' => _t('General public (B2C)', 'Orang awam (B2C)'),
    'foreign' => _t('Foreign buyer', 'Pembeli asing'),
    _ => kind,
  };
  String get buyerName => _t('Name', 'Nama');
  String get buyerNameMissing => _t('Enter the buyer name.', 'Masukkan nama pembeli.');
  String get buyerTin => _t('TIN', 'TIN');
  String get buyerTinMissing => _t('Enter the buyer TIN.', 'Masukkan TIN pembeli.');
  String get buyerCountry => _t('Country code, e.g. SGP', 'Kod negara, contohnya SGP');
  String get buyerCountryBad => _t('Use the three-letter ISO country code, e.g. SGP or USA.', 'Gunakan kod negara ISO tiga huruf, contohnya SGP atau USA.');
  String get publicNote => _t(
    'For a buyer who does not ask for an e-invoice. LHDN\'s General Public TIN EI00000000010 is used.',
    'Untuk pembeli yang tidak meminta e-Invois. TIN Orang Awam LHDN EI00000000010 digunakan.',
  );
  String get foreignNote => _t('LHDN\'s foreign buyer TIN EI00000000020 is used.', 'TIN pembeli asing LHDN EI00000000020 digunakan.');
  String get consolidated => _t('Consolidated e-invoice for the month', 'e-Invois disatukan bagi bulan ini');
  String get consolidatedNote => _t(
    'For sales to the general public over a month. Send it within 7 days after the month ends. A sale above RM10,000 needs its own e-invoice.',
    'Untuk jualan kepada orang awam sepanjang bulan. Hantar dalam 7 hari selepas bulan tamat. Jualan melebihi RM10,000 memerlukan e-Invois sendiri.',
  );
  String get currency => _t('Currency', 'Mata wang');
  String get exchangeRate => _t('Exchange rate to ringgit', 'Kadar pertukaran kepada ringgit');
  String exchangeRateHelp(String code) => _t('RM for 1 $code', 'RM bagi 1 $code');
  String get exchangeRateBad => _t('Enter the exchange rate, more than zero.', 'Masukkan kadar pertukaran, lebih daripada sifar.');
  String get paymentMethod => _t('Payment method', 'Kaedah pembayaran');
  String paymentMethodName(String code) => switch (code) {
    '01' => _t('Cash', 'Tunai'),
    '02' => _t('Cheque', 'Cek'),
    '03' => _t('Bank transfer', 'Pindahan bank'),
    '04' => _t('Credit card', 'Kad kredit'),
    '05' => _t('Debit card', 'Kad debit'),
    '06' => _t('e-Wallet', 'e-Dompet'),
    '07' => _t('Digital bank', 'Bank digital'),
    '08' => _t('Others', 'Lain-lain'),
    _ => none,
  };
  String get lines => _t('Lines', 'Butiran');
  String get addLine => _t('Add a line', 'Tambah butiran');
  String get removeLine => _t('Remove this line', 'Buang butiran ini');
  String lineN(int n) => _t('Line $n', 'Butiran $n');
  String get description => _t('Description', 'Keterangan');
  String get descriptionMissing => _t('Describe what was sold.', 'Terangkan apa yang dijual.');
  String get classification => _t('Classification', 'Klasifikasi');
  String get classificationPick => _t('Choose the classification', 'Pilih klasifikasi');
  String get quantity => _t('Quantity', 'Kuantiti');
  String get quantityBad => _t('More than zero.', 'Lebih daripada sifar.');
  String get unit => _t('Unit', 'Unit');
  String get unitPrice => _t('Unit price', 'Harga seunit');
  String get amountBad => _t('Enter an amount of zero or more.', 'Masukkan jumlah sifar atau lebih.');
  String get amountTooLarge => _t('That amount is too large.', 'Jumlah itu terlalu besar.');
  String get taxType => _t('Tax type', 'Jenis cukai');
  String taxTypeName(String code) => switch (code) {
    '01' => _t('Sales tax', 'Cukai jualan'),
    '02' => _t('Service tax', 'Cukai perkhidmatan'),
    '03' => _t('Tourism tax', 'Cukai pelancongan'),
    '04' => _t('High-value goods tax', 'Cukai barangan bernilai tinggi'),
    '05' => _t('Sales tax on low-value goods', 'Cukai jualan barangan bernilai rendah'),
    '06' => _t('Not applicable', 'Tidak berkenaan'),
    'E' => _t('Tax exemption', 'Pengecualian cukai'),
    _ => code,
  };
  String get taxRate => _t('Tax rate %', 'Kadar cukai %');
  String get taxRateBad => _t('Between 0 and 100.', 'Antara 0 dan 100.');
  String get exemptionReason => _t('Why it is exempt', 'Sebab dikecualikan');
  String get exemptionMissing => _t('Say why the line is exempt.', 'Nyatakan sebab butiran dikecualikan.');
  String unitName(String code) => switch (code) {
    'C62' => _t('Unit', 'Unit'),
    'EA' => _t('Each', 'Setiap satu'),
    'H87' => _t('Piece', 'Keping'),
    'SET' => _t('Set', 'Set'),
    'KGM' => _t('Kilogram', 'Kilogram'),
    'GRM' => _t('Gram', 'Gram'),
    'LTR' => _t('Litre', 'Liter'),
    'MTR' => _t('Metre', 'Meter'),
    'MTK' => _t('Square metre', 'Meter persegi'),
    'HUR' => _t('Hour', 'Jam'),
    'DAY' => _t('Day', 'Hari'),
    'MON' => _t('Month', 'Bulan'),
    'ANN' => _t('Year', 'Tahun'),
    'LS' => _t('Lump sum', 'Sekaligus'),
    'XBX' => _t('Box', 'Kotak'),
    'TNE' => _t('Tonne', 'Tan'),
    _ => code,
  };
  String get check => _t('Check against LHDN rules', 'Semak dengan peraturan LHDN');
  String get checking => _t('Checking…', 'Menyemak…');
  String get ready => _t('Ready to send', 'Sedia untuk dihantar');
  String fixCount(int count) => ms ? '$count perkara perlu dibetulkan sebelum LHDN menerimanya' : (count == 1 ? '1 thing to fix before LHDN will accept it' : '$count things to fix before LHDN will accept it');
  String get net => _t('Before tax', 'Sebelum cukai');
  String get tax => _t('Tax', 'Cukai');
  String get payable => _t('Payable', 'Perlu dibayar');
  String get send => _t('Send to LHDN', 'Hantar ke LHDN');
  String get sending => _t('Sending…', 'Sedang dihantar…');
  String get confirmSendTitle => _t('Send this e-invoice to LHDN?', 'Hantar e-Invois ini ke LHDN?');
  String get confirmSend => _t('Yes, send it', 'Ya, hantar');
  String get notYet => _t('Not yet', 'Belum lagi');
  String get rejectedByLhdn => _t('LHDN rejected the e-invoice', 'LHDN menolak e-Invois ini');
  String get changedSinceCheck => _t('You changed the e-invoice since the check. Check it again before sending.', 'Anda mengubah e-Invois selepas semakan. Semak sekali lagi sebelum menghantar.');

  String errorText(String code) => switch (code) {
    'EINVOICE_ALREADY_SENT' => _t('This invoice number was already sent to LHDN. Use a new number.', 'Nombor invois ini sudah dihantar ke LHDN. Gunakan nombor baharu.'),
    'SIGNING_CERTIFICATE_MISSING' => _t('A digital signing certificate is needed before e-invoices can go to LHDN. Ask your accountant to set it up.', 'Sijil tandatangan digital diperlukan sebelum e-Invois boleh dihantar ke LHDN. Minta akauntan anda menyediakannya.'),
    'APPROVAL_REQUIRED' || 'APPROVAL_NOT_FOUND' || 'APPROVAL_NOT_ACTIVE' => _t('Your accountant has to approve this before it goes to LHDN.', 'Akauntan anda perlu meluluskan ini sebelum dihantar ke LHDN.'),
    'EXTERNAL_TIMEOUT' => _t('LHDN did not answer in time. Check the status before you send it again.', 'LHDN tidak menjawab tepat pada masanya. Semak status sebelum menghantar semula.'),
    'EINVOICE_REJECTED' => rejectedByLhdn,
    'EINVOICE_FIELDS_MISSING' || 'EINVOICE_PROFILE_INCOMPLETE' => _t('Some details are missing or wrong.', 'Ada butiran yang tiada atau salah.'),
    'BAD_SUBMISSION_UID' => _t('That submission number is not one LHDN gave.', 'Nombor penyerahan itu bukan daripada LHDN.'),
    'BAD_DOCUMENT_UUID' => originalUuidBad,
    'CANCEL_REASON_REQUIRED' => cancelReasonMissing,
    'CANCEL_WINDOW_CLOSED' || 'CANCEL_PERIOD_OVER' => cancelClosed,
    'WINDOW_CLOSED' => _t('The 72 hours LHDN allows after validation are over.', 'Tempoh 72 jam yang dibenarkan LHDN selepas pengesahan telah tamat.'),
    'USE_CONSOLIDATED_TOOL' => _t('A month of sales to the general public goes on the monthly consolidated e-invoice.', 'Jualan sebulan kepada orang awam dimasukkan dalam e-Invois disatukan bulanan.'),
    'CONSOLIDATION_MONTH_NOT_ENDED' => _t('That month has not ended yet. Send its consolidated e-invoice after the month ends.', 'Bulan itu belum tamat. Hantar e-Invois disatukannya selepas bulan tamat.'),
    'CONSOLIDATION_WINDOW_CLOSED' => _t('This is past the 7 days LHDN allows after the month ends. Say why it is late to send it now.', 'Ini melebihi 7 hari yang dibenarkan LHDN selepas bulan tamat. Nyatakan sebab lewat untuk menghantarnya sekarang.'),
    'CONSOLIDATION_NOT_ALLOWED' => _t('LHDN does not allow this kind of sale in a consolidated e-invoice. Issue an e-invoice for each sale.', 'LHDN tidak membenarkan jualan jenis ini dalam e-Invois disatukan. Keluarkan e-Invois bagi setiap jualan.'),
    'BAD_MONTH' => _t('Choose the month the receipts belong to.', 'Pilih bulan bagi resit tersebut.'),
    'EINVOICE_PROFILE_MISSING' => _t('Save your business details first.', 'Simpan butiran perniagaan anda dahulu.'),
    'EINVOICE_NOT_YOURS' => _t('You issued this e-invoice. Cancel it instead of rejecting it.', 'Anda yang mengeluarkan e-Invois ini. Batalkannya dan bukan menolaknya.'),
    'EINVOICE_WRONG_STATE' => _t('This e-invoice was already cancelled or rejected.', 'e-Invois ini telah dibatalkan atau ditolak.'),
    'REJECT_REASON_REQUIRED' => _t('Give the reason, in at most 300 characters.', 'Berikan sebabnya, tidak melebihi 300 aksara.'),
    'SANDBOX_ONLY' => _t('That only works in the sandbox.', 'Itu hanya berfungsi dalam kotak pasir.'),
    'RULE_NOT_IN_FORCE' || 'BAD_YEAR_OF_ASSESSMENT' => ruleMissing,
    'BAD_PERIOD' => _t('A taxable period is two months, such as January and February.', 'Tempoh bercukai ialah dua bulan, seperti Januari dan Februari.'),
    'BAD_DATE' => dateBad,
    'LINES_NEED_FIXING' => _t('Some lines need fixing.', 'Beberapa butiran perlu dibetulkan.'),
    'UNKNOWN_SERVICE_CATEGORY' => _t('Choose the kind of service again.', 'Pilih jenis perkhidmatan sekali lagi.'),
    'SALES_TAX_RATE_NOT_IN_FORCE' => _t('That sales tax rate is not in force on that date.', 'Kadar cukai jualan itu tidak berkuat kuasa pada tarikh itu.'),
    'NOT_QUERYABLE' || 'UNKNOWN_TOOL' || 'NOT_PROPOSABLE' => notAvailableYet,
    'SIGN_IN_REQUIRED' || 'SIGNED_OUT' => _t('Sign in again to continue.', 'Log masuk semula untuk meneruskan.'),
    'EXPIRED' || 'TOKEN_MISMATCH' => _t('That preview is more than ten minutes old. Check it again.', 'Pratonton itu lebih sepuluh minit. Semak sekali lagi.'),
    _ => _t('MyCA could not do that ($code). Nothing was sent.', 'MyCA tidak dapat melakukannya ($code). Tiada apa yang dihantar.'),
  };

  String fieldName(String field) {
    final line = RegExp(r'^lines\[(\d+)\]\.?(.*)$').firstMatch(field);
    if (line != null) {
      final n = int.parse(line.group(1)!) + 1;
      final rest = line.group(2)!;
      return rest.isEmpty ? lineN(n) : '${lineN(n)}: ${fieldName(rest)}';
    }
    final party = RegExp(r'^(supplier|buyer)\.(.+)$').firstMatch(field);
    if (party != null) {
      final who = party.group(1) == 'buyer' ? buyer : _t('Your business', 'Perniagaan anda');
      return '$who: ${fieldName(party.group(2)!)}';
    }
    return switch (field) {
      'supplier' => _t('Your business', 'Perniagaan anda'),
      'buyer' => buyer,
      'name' => buyerName,
      'tin' => 'TIN',
      'idType' => idType,
      'idValue' => idValue,
      'msic' => 'MSIC',
      'phone' => phone,
      'email' => email,
      'address.state' => state,
      'address.city' => city,
      'address.country' => _t('Country', 'Negara'),
      'description' => description,
      'classification' => classification,
      'taxType' => taxType,
      'unitCode' => unit,
      'quantity' => quantity,
      'unitPrice' => unitPrice,
      'exemptionReason' => exemptionReason,
      'number' => number,
      'currency' => currency,
      'exchangeRate' => exchangeRate,
      'original.uuid' => originalUuid,
      'paymentMethod' => paymentMethod,
      'lines' => lines,
      'type' => documentType,
      _ => field,
    };
  }

  String detailTitle(String number) => _t('e-Invoice $number', 'e-Invois $number');
  String get uuid => _t('LHDN UUID', 'UUID LHDN');
  String get submission => _t('Submission', 'Penyerahan');
  String get sentAt => _t('Sent', 'Dihantar');
  String get total => _t('Total', 'Jumlah');
  String get refreshStatus => _t('Check the status again', 'Semak status sekali lagi');
  String get checkingStatus => _t('Asking LHDN…', 'Bertanya kepada LHDN…');
  String get statusValidBody => _t('LHDN has validated this e-invoice. Share the QR code or link with your buyer.', 'LHDN telah mengesahkan e-Invois ini. Kongsi kod QR atau pautan dengan pembeli anda.');
  String get statusInvalidBody => _t('LHDN found problems. Fix them and send it again as a new e-invoice.', 'LHDN menemui masalah. Betulkan dan hantar semula sebagai e-Invois baharu.');
  String get statusProgressBody => _t('LHDN is still validating it. This usually takes a few seconds.', 'LHDN masih mengesahkannya. Biasanya ini mengambil masa beberapa saat.');
  String get statusCancelledBody => _t('This e-invoice is cancelled at LHDN.', 'e-Invois ini telah dibatalkan di LHDN.');
  String get statusRejectedBody => _t('LHDN did not accept this submission. Fix what LHDN said and send it again.', 'LHDN tidak menerima penyerahan ini. Betulkan perkara yang dinyatakan LHDN dan hantar semula.');
  String get whatLhdnSaid => _t('What LHDN said', 'Kata LHDN');
  String get qrTitle => _t('Validation QR code', 'Kod QR pengesahan');
  String get shareLink => _t('Share the validation link', 'Kongsi pautan pengesahan');
  String get linkCopied => _t('Link copied.', 'Pautan disalin.');
  String get shareFailed => _t('Sharing is not available on this phone, so the link is copied instead.', 'Perkongsian tidak tersedia pada telefon ini, jadi pautan telah disalin.');
  String get cancelEinvoice => _t('Cancel this e-invoice', 'Batalkan e-Invois ini');
  String rejectWindow(int hours, int minutes) => _t('You can reject it for another $hours h $minutes min.', 'Anda boleh menolaknya dalam masa $hours j $minutes min lagi.');
  String cancelWindow(int hours, int minutes) => _t('You can cancel it for another $hours h $minutes min.', 'Anda boleh membatalkannya dalam masa $hours j $minutes min lagi.');
  String get cancelClosed => _t('The 72-hour cancel window has closed. Issue a credit note to correct it.', 'Tempoh pembatalan 72 jam telah tamat. Keluarkan nota kredit untuk membetulkannya.');
  String get issueCreditNote => _t('Issue a credit note', 'Keluarkan nota kredit');
  String cancelTitle(String number) => _t('Cancel e-invoice $number?', 'Batalkan e-Invois $number?');
  String get cancelReason => _t('Reason for cancelling', 'Sebab pembatalan');
  String get cancelReasonHelp => _t('LHDN and your buyer see this reason.', 'LHDN dan pembeli anda akan melihat sebab ini.');
  String get cancelReasonMissing => _t('Give the reason for cancelling.', 'Nyatakan sebab pembatalan.');
  String get cancelAtLhdn => _t('Cancel at LHDN', 'Batalkan di LHDN');
  String get keepIt => _t('Keep it', 'Kekalkan');
  String get cancelledDone => _t('Cancelled at LHDN.', 'Dibatalkan di LHDN.');
  String get rejectEinvoice => _t('Reject this e-invoice', 'Tolak e-Invois ini');
  String rejectTitle(String number) => _t('Reject e-invoice $number?', 'Tolak e-Invois $number?');
  String get rejectReason => _t('Reason for rejecting', 'Sebab penolakan');
  String get rejectAtLhdn => _t('Send the rejection', 'Hantar penolakan');
  String get rejectedDone => _t('Rejection sent. The supplier can cancel it and send a new one.', 'Penolakan dihantar. Pembekal boleh membatalkannya dan menghantar yang baharu.');
  String get supplier => _t('Supplier', 'Pembekal');

  String get listTitle => _t('e-Invoices', 'e-Invois');
  String get issued => _t('Sent', 'Dihantar');
  String get received => _t('Received', 'Diterima');
  String get issuedEmpty => _t('No e-invoices sent yet.', 'Belum ada e-Invois dihantar.');
  String get receivedEmpty => _t('e-Invoices your suppliers send you will appear here.', 'e-Invois yang dihantar oleh pembekal anda akan dipaparkan di sini.');
  String get localListNote => _t('Showing e-invoices sent from this phone. The full list from LHDN is not available on the server yet.', 'Memaparkan e-Invois yang dihantar dari telefon ini. Senarai penuh daripada LHDN belum tersedia di pelayan.');

  String get sstTitle => _t('SST', 'SST');
  String get registrationTitle => _t('Must I register for SST?', 'Perlukah saya mendaftar SST?');
  String get chargeKind => _t('What do you charge?', 'Apa yang anda kenakan?');
  String get kindService => _t('Service tax', 'Cukai perkhidmatan');
  String get kindSales => _t('Sales tax', 'Cukai jualan');
  String get serviceCategory => _t('Kind of service', 'Jenis perkhidmatan');
  String serviceCategoryName(String code) => switch (code) {
    'general' => _t('Other taxable services', 'Perkhidmatan bercukai lain'),
    'food-and-beverage' => _t('Food and beverage', 'Makanan dan minuman'),
    'telecommunication' => _t('Telecommunication', 'Telekomunikasi'),
    'parking' => _t('Parking', 'Tempat letak kereta'),
    'logistics' => _t('Logistics', 'Logistik'),
    'construction' => _t('Construction', 'Pembinaan'),
    'rental-or-leasing' => _t('Rental or leasing', 'Sewaan atau pajakan'),
    'financial' => _t('Financial services', 'Perkhidmatan kewangan'),
    'insurance' => _t('Insurance and takaful', 'Insurans dan takaful'),
    'beauty-and-wellness' => _t('Beauty and wellness', 'Kecantikan dan kesejahteraan'),
    'healthcare' => _t('Private healthcare', 'Penjagaan kesihatan swasta'),
    'healthcare-non-citizen' => _t('Private healthcare for non-citizens', 'Penjagaan kesihatan swasta untuk bukan warganegara'),
    'education' => _t('Private education', 'Pendidikan swasta'),
    'education-non-citizen' => _t('Private education for non-citizens', 'Pendidikan swasta untuk bukan warganegara'),
    'credit-card' => _t('Credit and charge cards', 'Kad kredit dan kad caj'),
    _ => code,
  };
  String get last12 => _t('Taxable value in the last 12 months (RM)', 'Nilai bercukai dalam 12 bulan lepas (RM)');
  String get checkRegistration => _t('Check', 'Semak');
  String get mustRegister => _t('You must register for SST', 'Anda mesti mendaftar SST');
  String get noNeedToRegister => _t('You do not need to register yet', 'Anda belum perlu mendaftar');
  String threshold(String amount) => _t('Threshold $amount', 'Ambang $amount');
  String yourValue(String amount) => _t('Your last 12 months $amount', '12 bulan lepas anda $amount');
  String get returnTitle => _t('SST-02 return', 'Penyata SST-02');
  String get period => _t('Taxable period', 'Tempoh bercukai');
  String periodName(String from, String to) => '$from – $to';
  String get addSstLine => _t('Add a taxable value', 'Tambah nilai bercukai');
  String get value => _t('Taxable value (RM)', 'Nilai bercukai (RM)');
  String get salesRate => _t('Sales tax rate', 'Kadar cukai jualan');
  String get date => _t('Date (dd/mm/yyyy)', 'Tarikh (hh/bb/tttt)');
  String get dateBad => _t('Write the date as dd/mm/yyyy.', 'Tulis tarikh sebagai hh/bb/tttt.');
  String get dateOutside => _t('The date must be inside the taxable period.', 'Tarikh mesti dalam tempoh bercukai.');
  String get cards => _t('Number of cards', 'Bilangan kad');
  String get prepare => _t('Prepare SST-02', 'Sediakan SST-02');
  String get preparing => _t('Preparing…', 'Sedang disediakan…');
  String get salesTax => _t('Sales tax', 'Cukai jualan');
  String get serviceTax => _t('Service tax', 'Cukai perkhidmatan');
  String get totalSst => _t('Total SST', 'Jumlah SST');
  String dueOn(String date) => _t('Due $date', 'Perlu difailkan pada $date');
  String get fileInMySst => _t('You file this in MySST (mysst.customs.gov.my). MyCA prepares it; Royal Malaysian Customs has no filing API.', 'Anda memfailkannya dalam MySST (mysst.customs.gov.my). MyCA menyediakannya; Kastam Diraja Malaysia tiada API pemfailan.');
  String get sstEmpty => _t('Add the taxable values for the period, then prepare the return.', 'Tambah nilai bercukai bagi tempoh itu, kemudian sediakan penyata.');
  String rateLine(String rate) => _t('at $rate', 'pada $rate');
  String flatLine(String amount) => _t('$amount a card', '$amount sekeping kad');
  String daysLeft(int days) => days < 0
      ? _t('${-days} days overdue', 'Lewat ${-days} hari')
      : days == 0
          ? _t('Due today', 'Perlu hari ini')
          : _t('$days days left', '$days hari lagi');

  String monthShort(int month) => (ms
          ? const ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
          : const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])[(month - 1).clamp(0, 11)];
  String periodLabel(DateTime from, DateTime to) => '${monthShort(from.month)} ${from.year} – ${monthShort(to.month)} ${to.year}';
  String get removeValue => _t('Remove this value', 'Buang nilai ini');
  String get registrationTab => _t('Registration', 'Pendaftaran');
  String get returnTab => _t('SST-02', 'SST-02');

  String get taxTitle => _t('Income tax estimate', 'Anggaran cukai pendapatan');
  String get yearOfAssessment => _t('Year of assessment', 'Tahun taksiran');
  String get residentLabel => _t('Resident in Malaysia for the year', 'Pemastautin di Malaysia bagi tahun ini');
  String get residentHelp => _t('Usually 182 days or more in Malaysia', 'Biasanya 182 hari atau lebih di Malaysia');
  String get incomeSection => _t('Income (RM)', 'Pendapatan (RM)');
  String incomeName(String head) => switch (head) {
    'employment' => _t('Employment income', 'Pendapatan penggajian'),
    'business' => _t('Business income', 'Pendapatan perniagaan'),
    'rental' => _t('Rental income', 'Pendapatan sewa'),
    'interestAndDividends' => _t('Interest and dividends', 'Faedah dan dividen'),
    'other' => _t('Other income', 'Pendapatan lain'),
    _ => head,
  };
  String get reliefsSection => _t('Reliefs you are claiming (RM)', 'Pelepasan yang dituntut (RM)');
  String get individualReliefNote => _t('Individual relief is added for you.', 'Pelepasan individu ditambah secara automatik.');
  String reliefName(String key) => switch (key) {
    'individual' => _t('Individual and dependants', 'Individu dan tanggungan'),
    'disabledIndividual' => _t('Disabled individual', 'Individu kurang upaya'),
    'spouse' => _t('Spouse or alimony', 'Pasangan atau nafkah bekas isteri'),
    'disabledSpouse' => _t('Disabled spouse', 'Pasangan kurang upaya'),
    'educationFees' => _t('Education fees (self)', 'Yuran pendidikan (sendiri)'),
    'medicalSelfSpouseChild' => _t('Medical expenses (self, spouse, child)', 'Perbelanjaan perubatan (sendiri, pasangan, anak)'),
    'medicalParents' => _t('Medical and care for parents', 'Perubatan dan penjagaan ibu bapa'),
    'disabilityEquipment' => _t('Equipment for a disabled person', 'Peralatan untuk orang kurang upaya'),
    'lifestyle' => _t('Lifestyle: books, devices, internet', 'Gaya hidup: buku, peranti, internet'),
    'sportsLifestyle' => _t('Sports equipment and activities', 'Peralatan dan aktiviti sukan'),
    'evChargingOrComposting' => _t('EV charging or composting', 'Pengecasan EV atau pengkomposan'),
    'lifeInsuranceAndEpf' => _t('Life insurance and EPF', 'Insurans hayat dan KWSP'),
    'prsAndDeferredAnnuity' => _t('PRS and deferred annuity', 'PRS dan anuiti tertangguh'),
    'educationAndMedicalInsurance' => _t('Education and medical insurance', 'Insurans pendidikan dan perubatan'),
    'socso' => _t('SOCSO and EIS', 'PERKESO dan SIP'),
    'sspnNetSavings' => _t('SSPN net savings', 'Simpanan bersih SSPN'),
    'childcareFees' => _t('Childcare and kindergarten fees', 'Yuran taska dan tadika'),
    'breastfeedingEquipment' => _t('Breastfeeding equipment', 'Peralatan penyusuan susu ibu'),
    'firstHomeLoanInterest' => _t('First home loan interest', 'Faedah pinjaman rumah pertama'),
    'childUnder18' => _t('Children under 18', 'Anak bawah 18 tahun'),
    'childHigherEducation' => _t('Children 18 and over in higher education', 'Anak 18 tahun ke atas dalam pengajian tinggi'),
    'disabledChild' => _t('Disabled children', 'Anak kurang upaya'),
    _ => key,
  };
  String get childrenSection => _t('Children (number)', 'Anak (bilangan)');
  String get spouseHasIncome => _t('My spouse has income of their own', 'Pasangan saya mempunyai pendapatan sendiri');
  String get zakat => _t('Zakat or fitrah paid (RM)', 'Zakat atau fitrah dibayar (RM)');
  String get pcb => _t('PCB already deducted by your employer (RM)', 'PCB yang telah dipotong oleh majikan (RM)');
  String get estimate => _t('Estimate my tax', 'Anggarkan cukai saya');
  String get estimating => _t('Working it out…', 'Sedang dikira…');
  String get enterIncome => _t('Enter at least one income.', 'Masukkan sekurang-kurangnya satu pendapatan.');
  String get totalIncome => _t('Total income', 'Jumlah pendapatan');
  String get totalReliefs => _t('Total reliefs', 'Jumlah pelepasan');
  String get chargeable => _t('Chargeable income', 'Pendapatan bercukai');
  String get taxOnChargeable => _t('Tax on chargeable income', 'Cukai atas pendapatan bercukai');
  String get rebate => _t('Rebate', 'Rebat');
  String get zakatAllowed => _t('Zakat', 'Zakat');
  String get taxPayable => _t('Tax payable', 'Cukai perlu dibayar');
  String get pcbPaid => _t('PCB paid', 'PCB dibayar');
  String toPay(String amount) => _t('You still have $amount to pay', 'Anda masih perlu membayar $amount');
  String refundDue(String amount) => _t('You should get $amount back', 'Anda sepatutnya menerima $amount semula');
  String get nothingDue => _t('Nothing more to pay', 'Tiada lagi yang perlu dibayar');
  String get fileInMyTax => _t('Prepared in MyCA, you file in MyTax (mytax.hasil.gov.my). MyCA does not e-file income tax for you.', 'Disediakan dalam MyCA, anda failkan dalam MyTax (mytax.hasil.gov.my). MyCA tidak memfailkan cukai pendapatan untuk anda.');
  String allowedOf(String allowed, String cap) => _t('Allowed $allowed of the $cap cap', 'Dibenarkan $allowed daripada had $cap');
  String get spouseReliefNotAllowed => _t('Not allowed while your spouse has income.', 'Tidak dibenarkan jika pasangan anda berpendapatan.');
  String get ruleMissing => _t('MyCA has no checked figures for that year of assessment yet.', 'MyCA belum mempunyai angka yang disemak bagi tahun taksiran itu.');
  String get form => _t('Form', 'Borang');

  String get planTitle => _t('Plan and billing', 'Pelan dan bil');
  String planName(String id) => switch (id) {
    'my-sme' => _t('SME', 'PKS'),
    'my-growth' => _t('Growth', 'Pertumbuhan'),
    'my-firm' => _t('Firm', 'Firma'),
    _ => id,
  };
  String perMonth(String amount) => _t('$amount a month', '$amount sebulan');
  String onPlay(String price) => _t('$price on Google Play', '$price di Google Play');
  String planFeature(String key) => switch (key) {
    'einvoice' => _t('e-Invoices to LHDN MyInvois with QR codes', 'e-Invois ke LHDN MyInvois dengan kod QR'),
    'sst' => _t('SST-02 prepared with due dates', 'SST-02 disediakan dengan tarikh akhir'),
    'tax' => _t('Income tax estimate for MyTax', 'Anggaran cukai pendapatan untuk MyTax'),
    'starter' => _t('Everything in SME', 'Semua dalam PKS'),
    'consolidated' => _t('Monthly consolidated e-invoices', 'e-Invois disatukan bulanan'),
    'team' => _t('Your staff in the same books', 'Kakitangan anda dalam buku yang sama'),
    'business' => _t('Everything in Growth', 'Semua dalam Pertumbuhan'),
    'agent' => _t('Your tax agent in the same books', 'Ejen cukai anda dalam buku yang sama'),
    'support' => _t('Priority support', 'Sokongan keutamaan'),
    _ => key,
  };
  String subscribe(String plan) => _t('Subscribe to $plan', 'Langgan $plan');
  String get current => _t('Current plan', 'Pelan semasa');
  String get playNote => _t('Paid through Google Play. Cancel any time in Google Play.', 'Dibayar melalui Google Play. Batalkan bila-bila masa di Google Play.');
  String get sandboxNoBuy => _t('Purchases are off in the sandbox.', 'Pembelian dimatikan dalam kotak pasir.');
  String get ownerOnly => _t('Only the owner can change the plan.', 'Hanya pemilik boleh menukar pelan.');
  String get playUnavailable => _t('Google Play billing is not available here. Plans are bought in the MyCA Malaysia Android app.', 'Pembayaran Google Play tidak tersedia di sini. Pelan dibeli dalam aplikasi Android MyCA Malaysia.');
  String get purchasePending => _t('Google Play is processing the payment. The plan starts as soon as it clears.', 'Google Play sedang memproses bayaran. Pelan bermula sebaik sahaja ia selesai.');
  String get purchaseFailed => _t('Google Play did not complete the payment. Nothing was charged.', 'Google Play tidak melengkapkan bayaran. Tiada caj dikenakan.');
  String get purchaseOpenFailed => _t('Google Play could not open the payment. Check that you are signed in to the Play Store and try again.', 'Google Play tidak dapat membuka bayaran. Pastikan anda log masuk ke Play Store dan cuba lagi.');
  String purchaseDone(String plan) => _t('Thank you. $plan is on for this business.', 'Terima kasih. $plan kini aktif untuk perniagaan ini.');
  String get manage => _t('Manage or cancel in Google Play', 'Urus atau batal di Google Play');
  String get statusRejectionRequestedBody => _t('You asked the supplier to cancel this e-invoice. It stays valid until the supplier cancels it.', 'Anda telah meminta pembekal membatalkan e-Invois ini. Ia kekal sah sehingga pembekal membatalkannya.');
  String get reasonGiven => _t('Reason given', 'Sebab diberikan');
  String get newWhich => _t('What do you want to send?', 'Apakah yang ingin anda hantar?');
  String get einvoiceToBuyer => _t('e-Invoice to a buyer', 'e-Invois kepada pembeli');
  String get einvoiceToBuyerNote => _t('A business, a person who asks for one, or a foreign buyer.', 'Perniagaan, individu yang memintanya, atau pembeli asing.');
  String get consolidatedNoteShort => _t('One e-invoice to the general public for a month of receipts.', 'Satu e-Invois kepada orang awam bagi resit sebulan.');
  String get selfBilled => _t('Self-billed e-invoice', 'e-Invois bil kendiri');
  String get comingSoon => _t('Coming to the app soon. Ask Bahi meanwhile.', 'Akan tiba dalam aplikasi tidak lama lagi. Tanya Bahi buat masa ini.');
  String get useConsolidated => _t('Make the monthly consolidated e-invoice instead', 'Buat e-Invois disatukan bulanan');
  String get consolidatedTitle => _t('Monthly consolidated e-invoice', 'e-Invois disatukan bulanan');
  String get consolidatedIntro => _t(
    'For sales to buyers who did not ask for an e-invoice. One e-invoice to the general public (TIN EI00000000010) covers the month. LHDN expects it within 7 days after the month ends, and a receipt above RM10,000 needs its own e-invoice.',
    'Untuk jualan kepada pembeli yang tidak meminta e-Invois. Satu e-Invois kepada orang awam (TIN EI00000000010) meliputi sebulan. LHDN menjangkakannya dalam 7 hari selepas bulan tamat, dan resit melebihi RM10,000 memerlukan e-Invois sendiri.',
  );
  String get month => _t('Month of the receipts', 'Bulan resit');
  String monthLabel(int year, int month) => '${monthShort(month)} $year';
  String get receiptsTotal => _t('Total of the receipts before tax (MYR)', 'Jumlah resit sebelum cukai (MYR)');
  String get largestReceipt => _t('Largest single receipt (MYR)', 'Resit tunggal terbesar (MYR)');
  String get largestReceiptHelp => _t('LHDN needs it to check the RM10,000 limit.', 'LHDN memerlukannya untuk menyemak had RM10,000.');
  String get largestTooBig => _t('The largest receipt cannot be more than the total.', 'Resit terbesar tidak boleh melebihi jumlah.');
  String get receiptRange => _t('Receipt numbers (optional), e.g. R0001-R0420', 'Nombor resit (pilihan), cth. R0001-R0420');
  String get salesToPublic => _t('Sales to the general public', 'Jualan kepada orang awam');
  String get late => _t('It is late: send it anyway and record why', 'Ia lewat: hantar juga dan catat sebabnya');
  String get lateHelp => _t('Only when the 7 days after the month have passed. The reason stays in the audit trail.', 'Hanya apabila 7 hari selepas bulan telah berlalu. Sebabnya kekal dalam jejak audit.');
  String get lateReason => _t('Why it is late', 'Sebab lewat');
  String get lateReasonMissing => _t('Say why it is late.', 'Nyatakan sebab lewat.');
  String get checkAndSend => _t('Check and send to LHDN', 'Semak dan hantar ke LHDN');
  String get confirmConsolidatedTitle => _t('Send the consolidated e-invoice to LHDN?', 'Hantar e-Invois disatukan ke LHDN?');
  String get next12 => _t('Expected in the next 12 months (optional)', 'Dijangka dalam 12 bulan akan datang (pilihan)');
  String get receivedNote => _t('A received e-invoice can be rejected once, within 72 hours of validation. It stays valid until the supplier cancels it.', 'e-Invois yang diterima boleh ditolak sekali, dalam 72 jam selepas pengesahan. Ia kekal sah sehingga pembekal membatalkannya.');
}

class _MyStringsDelegate extends LocalizationsDelegate<MyStrings> {
  const _MyStringsDelegate();

  @override
  bool isSupported(Locale locale) => MyStrings.supportedLanguages.contains(locale.languageCode);

  @override
  Future<MyStrings> load(Locale locale) => SynchronousFuture(locale.languageCode == 'ms' ? MyStrings.malay : MyStrings.english);

  @override
  bool shouldReload(_MyStringsDelegate old) => false;
}
