import 'package:flutter/widgets.dart';

class UaeStrings {
  const UaeStrings(this.ar);

  factory UaeStrings.of(BuildContext context) =>
      UaeStrings(Localizations.maybeLocaleOf(context)?.languageCode == 'ar');

  final bool ar;

  String _(String en, String arabic) => ar ? arabic : en;

  String get taxesTitle => _('UAE taxes', 'الضرائب في الإمارات');
  String get taxesKicker => _('UAE TAXES', 'الضرائب في الإمارات');
  String get taxesPanel => _('VAT return, corporate tax, e-invoicing and dates', 'إقرار ضريبة القيمة المضافة وضريبة الشركات والفوترة الإلكترونية والمواعيد');
  String get taxesIntro => _(
    'Worked out from your books by MyCA\'s rules. MyCA files nothing: the business, or its registered tax agent, files every return on EmaraTax.',
    'تُحتسب من دفاترك وفق قواعد MyCA. لا يقدّم MyCA أي إقرار؛ تقدّم المنشأة أو وكيلها الضريبي المسجّل كل الإقرارات عبر منصة إمارات تاكس.',
  );
  String get comingUp => _('Coming up', 'المواعيد القادمة');
  String get noDates => _('Add your business profile and a VAT quarter to see your dates.', 'أضف ملف المنشأة وربع السنة الضريبي لعرض مواعيدك.');
  String get vatReturnDue => _('VAT return (VAT 201) and payment', 'إقرار ضريبة القيمة المضافة (\u2066VAT\u00a0201\u2069) والسداد');
  String get ctReturnDue => _('Corporate tax return and payment', 'إقرار ضريبة الشركات والسداد');
  String get einvoiceAsp => _('Appoint an Accredited Service Provider for e-invoicing', 'تعيين مزوّد خدمة معتمد للفوترة الإلكترونية');
  String get einvoiceLive => _('E-invoicing starts for every B2B and B2G invoice', 'بدء الفوترة الإلكترونية لكل فواتير الشركات والجهات الحكومية');
  String get einvoiceWave => _('For revenue under AED 50 million', 'للإيرادات التي تقل عن 50 مليون درهم');
  String get datePassed => _('The date has passed', 'انقضى الموعد');
  String get dueToday => _('Due today', 'مستحق اليوم');

  String daysLeft(int days) {
    if (!ar) return days == 1 ? '1 day left' : '$days days left';
    if (days == 1) return 'متبقٍ يوم واحد';
    if (days == 2) return 'متبقٍ يومان';
    if (days >= 3 && days <= 10) return 'متبقٍ $days أيام';
    return 'متبقٍ $days يومًا';
  }

  String get vatReturnTitle => _('VAT return (VAT 201)', 'إقرار ضريبة القيمة المضافة (\u2066VAT\u00a0201\u2069)');
  String get vatReturnSubtitle => _('Boxes 1 to 14 for a quarter, from your sales and bills', 'البنود من 1 إلى 14 لربع السنة، من مبيعاتك وفواتير مشترياتك');
  String get ctTitle => _('Corporate tax estimate', 'تقدير ضريبة الشركات');
  String get ctSubtitle => _('9% above AED 375,000, Small Business Relief and free zones', '9% على ما يزيد على 375,000 درهم، والإعفاء للأعمال الصغيرة، والمناطق الحرة');
  String get profileTitle => _('Business profile', 'ملف المنشأة');
  String get profileSubtitle => _('Legal name, TRN, emirate and trade licence', 'الاسم القانوني والرقم الضريبي والإمارة والرخصة التجارية');
  String get einvoiceTitle => _('E-invoice (PINT AE)', 'الفاتورة الإلكترونية (\u2066PINT\u00a0AE\u2069)');
  String get einvoiceSubtitle => _('Check an invoice and issue it in the sandbox', 'افحص الفاتورة وأصدرها في بيئة الاختبار');

  String get quarter => _('Tax period', 'الفترة الضريبية');
  String get outputs => _('VAT on sales and all other outputs', 'ضريبة القيمة المضافة على التوريدات وجميع المخرجات الأخرى');
  String get inputs => _('VAT on expenses and all other inputs', 'ضريبة القيمة المضافة على المصروفات وجميع المدخلات الأخرى');
  String get netDue => _('Net VAT due', 'صافي الضريبة المستحقة');
  String get amount => _('Amount', 'المبلغ');
  String get vat => _('VAT', 'الضريبة');
  String get adjustment => _('Adjustment', 'التعديل');

  String standardRated(String emirate) => _('Standard rated supplies in $emirate', 'التوريدات الخاضعة للنسبة الأساسية في $emirate');

  String box(String key) => switch (key) {
    '2' => _('Tax refunds provided to tourists under the Tax Refunds for Tourists Scheme', 'المبالغ المستردة للسياح وفقًا لنظام استرداد الضريبة للسياح'),
    '3' => _('Supplies subject to the reverse charge provisions', 'التوريدات الخاضعة لآلية الاحتساب العكسي'),
    '4' => _('Zero rated supplies', 'التوريدات الخاضعة للنسبة الصفرية'),
    '5' => _('Exempt supplies', 'التوريدات المعفاة'),
    '6' => _('Goods imported into the UAE', 'السلع المستوردة إلى الدولة'),
    '7' => _('Adjustments to goods imported into the UAE', 'التعديلات على السلع المستوردة إلى الدولة'),
    '8' => _('Totals', 'المجموع'),
    '9' => _('Standard rated expenses', 'المصروفات الخاضعة للنسبة الأساسية'),
    '10' => _('Supplies subject to the reverse charge provisions', 'التوريدات الخاضعة لآلية الاحتساب العكسي'),
    '11' => _('Totals', 'المجموع'),
    '12' => _('Total value of due tax for the period', 'إجمالي قيمة الضريبة المستحقة عن الفترة'),
    '13' => _('Total value of recoverable tax for the period', 'إجمالي قيمة الضريبة القابلة للاسترداد عن الفترة'),
    _ => key,
  };

  String get payable => _('Payable tax for the period', 'الضريبة المستحقة الدفع عن الفترة');
  String get refundable => _('Refundable tax for the period', 'الضريبة القابلة للاسترداد عن الفترة');
  String boxLabel(String key) => _('Box $key', 'البند $key');
  String dueOn(String date) => _('Due $date', 'تاريخ الاستحقاق $date');
  String periodRange(String from, String to) => _('$from to $to', 'من $from إلى $to');
  String get filedOnEmaraTax => _(
    'The business, or its registered tax agent, files this return on EmaraTax and pays by the due date. MyCA prepares it and does not submit it.',
    'تقدّم المنشأة أو وكيلها الضريبي المسجّل هذا الإقرار عبر منصة إمارات تاكس وتسدّد الضريبة قبل تاريخ الاستحقاق. يُعِدّ MyCA الإقرار ولا يقدّمه.',
  );
  String get checkBeforeFiling => _('Check before you file', 'راجع قبل التقديم');
  String get couldNotWorkOut => _('Could not work this out.', 'تعذّر الاحتساب.');
  String get tryAgain => _('Try again', 'حاول مرة أخرى');
  String get noLines => _('No sales or bills in this period yet.', 'لا توجد مبيعات أو فواتير مشتريات في هذه الفترة بعد.');
  String get unreviewed => _('From dated rules a UAE tax adviser has not reviewed yet.', 'من قواعد مؤرّخة لم يراجعها مستشار ضريبي في الإمارات بعد.');

  String get periodStart => _('Tax period start', 'بداية الفترة الضريبية');
  String get periodEnd => _('Tax period end', 'نهاية الفترة الضريبية');
  String get revenue => _('Revenue', 'الإيرادات');
  String get accountingProfit => _('Accounting profit (loss as negative)', 'صافي الربح المحاسبي (الخسارة بإشارة سالبة)');
  String get exemptIncome => _('Exempt income', 'الدخل المعفى');
  String get nonDeductible => _('Non-deductible expenses', 'المصروفات غير القابلة للخصم');
  String get lossesBroughtForward => _('Tax losses brought forward', 'الخسائر الضريبية المرحّلة من فترات سابقة');
  String get electSbr => _('Elect Small Business Relief', 'اختيار الإعفاء للأعمال الصغيرة');
  String get sbrHint => _('Residents with revenue of AED 3 million or less, for periods ending by 31 December 2029', 'للمقيمين بإيرادات لا تتجاوز 3 ملايين درهم، عن الفترات المنتهية في موعد أقصاه 31 ديسمبر 2029');
  String get qfzp => _('Qualifying Free Zone Person', 'شخص مؤهل في منطقة حرة');
  String get qfzpHint => _('0% on qualifying income, 9% on the rest', '0% على الدخل المؤهل و9% على الباقي');
  String get qualifyingIncome => _('Qualifying income', 'الدخل المؤهل');
  String get workItOut => _('Work it out', 'احسب');
  String get taxableIncome => _('Taxable income', 'الدخل الخاضع للضريبة');
  String get adjustedProfit => _('Adjusted profit', 'الربح المعدّل');
  String get corporateTax => _('Corporate tax', 'ضريبة الشركات');
  String get ctPayable => _('Corporate tax payable', 'ضريبة الشركات المستحقة الدفع');
  String get reliefApplied => _('Relief applied', 'الإعفاء المطبّق');
  String get lossUsed => _('Losses used', 'الخسائر المستخدمة');
  String get lossCarried => _('Losses carried forward', 'الخسائر المرحّلة');
  String get lossForfeited => _('Loss not carried forward', 'خسارة لا تُرحّل');
  String get zeroRatedQualifying => _('Qualifying income at 0%', 'الدخل المؤهل بنسبة 0%');
  String get returnDue => _('Return and payment due', 'موعد تقديم الإقرار والسداد');
  String get ctBands => _(
    '0% on taxable income up to AED 375,000 and 9% above it. An estimate from the figures you entered; the return is filed on EmaraTax within nine months of the period end.',
    '0% على الدخل الخاضع للضريبة حتى 375,000 درهم و9% على ما يزيد على ذلك. تقدير مبني على الأرقام التي أدخلتها؛ يُقدَّم الإقرار عبر منصة إمارات تاكس خلال تسعة أشهر من نهاية الفترة.',
  );
  String get badAmount => _('Enter amounts in dirhams, for example 1250000.50.', 'أدخل المبالغ بالدرهم، مثل 1250000.50.');
  String get badDates => _('Enter the period as dates, for example 2026-01-01 and 2026-12-31, with the end after the start.', 'أدخل الفترة بتواريخ مثل 2026-01-01 و2026-12-31، على أن تكون النهاية بعد البداية.');

  String relief(String code) => switch (code) {
    'small-business-relief' => _('Small Business Relief', 'الإعفاء للأعمال الصغيرة'),
    'qualifying-free-zone-person' => _('Qualifying Free Zone Person', 'شخص مؤهل في منطقة حرة'),
    _ => _('None', 'لا يوجد'),
  };

  String get legalNameEn => _('Legal name in English', 'الاسم القانوني بالإنجليزية');
  String get legalNameAr => _('Legal name in Arabic', 'الاسم القانوني بالعربية');
  String get trn => _('Tax Registration Number (TRN)', 'رقم التسجيل الضريبي (\u2066TRN\u2069)');
  String get trnHint => _('15 digits from the FTA registration certificate', '15 رقمًا من شهادة التسجيل الضريبي الصادرة عن الهيئة');
  String get emirate => _('Emirate', 'الإمارة');
  String get tradeLicence => _('Trade licence number', 'رقم الرخصة التجارية');
  String get freeZone => _('Licensed in a free zone', 'مرخّصة في منطقة حرة');
  String get checkTrn => _('Check the TRN', 'تحقّق من الرقم الضريبي');
  String get trnLooksRight => _('The TRN is well formed', 'صيغة الرقم الضريبي صحيحة');
  String get trnWrong => _('The TRN is not right', 'الرقم الضريبي غير صحيح');
  String get preview => _('Preview', 'معاينة');
  String get saved => _('Saved.', 'تم الحفظ.');
  String get needName => _('Enter the legal name as it appears on the trade licence.', 'أدخل الاسم القانوني كما يظهر في الرخصة التجارية.');
  String get needEmirate => _('Choose the emirate of the main establishment.', 'اختر إمارة المنشأة الرئيسية.');

  String get invoiceNumber => _('Invoice number', 'رقم الفاتورة');
  String get issueDate => _('Issue date', 'تاريخ الإصدار');
  String get buyerName => _('Buyer\'s legal name', 'الاسم القانوني للمشتري');
  String get buyerTrn => _('Buyer\'s TRN', 'الرقم الضريبي للمشتري');
  String get description => _('What was supplied', 'وصف التوريد');
  String get quantity => _('Quantity', 'الكمية');
  String get unitPrice => _('Unit price before VAT', 'سعر الوحدة قبل الضريبة');
  String get vatRate => _('VAT', 'ضريبة القيمة المضافة');
  String get standard5 => _('5%', '5%');
  String get zeroRated => _('Zero rated', 'نسبة صفرية');
  String get exempt => _('Exempt', 'معفاة');
  String get check => _('Check', 'افحص');
  String get readyToIssue => _('Ready to issue as a PINT AE e-invoice', 'جاهزة للإصدار كفاتورة إلكترونية بصيغة \u2066PINT\u00a0AE\u2069');
  String get problemsToFix => _('Fix these before it can be issued', 'أصلح ما يلي قبل الإصدار');
  String get issueSandbox => _('Issue in the sandbox', 'أصدرها في بيئة الاختبار');
  String get sandboxNote => _(
    'Sandbox: the e-invoice goes to a test Accredited Service Provider. It is not a real tax invoice and nothing reaches the FTA.',
    'بيئة اختبار: تُرسل الفاتورة الإلكترونية إلى مزوّد خدمة معتمد تجريبي. ليست فاتورة ضريبية حقيقية ولا يصل شيء إلى الهيئة.',
  );
  String get issued => _('Issued in the sandbox', 'صدرت في بيئة الاختبار');
  String get totalWithVat => _('Total with VAT', 'الإجمالي شاملًا الضريبة');
  String get fromSale => _('Start from a sale', 'ابدأ من فاتورة مبيعات');

  String get notPostedYet => _('Not saved yet', 'لم يُحفظ بعد');
  String get posted => _('Done', 'تم');
  String get notPosted => _('Not done', 'لم يتم');
  String get discard => _('Discard', 'تجاهل');
  String get confirm => _('Confirm', 'تأكيد');

  String get newSaleTitle => _('New sale', 'فاتورة مبيعات جديدة');
  String get newBillTitle => _('New purchase bill', 'فاتورة مشتريات جديدة');
  String get customerName => _('Customer\'s name', 'اسم العميل');
  String get supplierName => _('Supplier\'s name', 'اسم المورّد');
  String get customerTrn => _('Customer\'s TRN (optional)', 'الرقم الضريبي للعميل (اختياري)');
  String get supplierTrn => _('Supplier\'s TRN', 'الرقم الضريبي للمورّد');
  String get supplierTrnHint => _('15 digits from the bill; needed to recover the VAT on it', '15 رقمًا من الفاتورة؛ مطلوب لاسترداد الضريبة المدرجة فيها');
  String get trnDigitsOnly => _('A TRN has digits only.', 'يتكوّن الرقم الضريبي من أرقام فقط.');
  String trnLength(int n) => _('A TRN has 15 digits; this one has $n.', 'يتكوّن الرقم الضريبي من 15 رقمًا، والمُدخل $n.');
  String get trnFifteen => _('15 digits', '15 رقمًا');
  String get supplierInvoiceNo => _('Supplier\'s invoice number', 'رقم فاتورة المورّد');
  String get saleEmirate => _('Emirate the sale is made from', 'الإمارة التي تمّ منها البيع');
  String get chooseEmirate => _('Choose the emirate', 'اختر الإمارة');
  String get date => _('Date', 'التاريخ');
  String get currency => _('Currency', 'العملة');
  String exchangeRate(String currency) => _('AED for 1 $currency', 'الدرهم مقابل 1 $currency');
  String get paymentTerms => _('Payment terms in days (optional)', 'مدة السداد بالأيام (اختياري)');
  String get boughtDescription => _('What was bought', 'وصف المشتريات');
  String lineTitle(int n) => _('Line $n', 'السطر $n');
  String get addLine => _('Add a line', 'أضف سطرًا');
  String get removeLine => _('Remove this line', 'احذف هذا السطر');
  String get treatment => _('VAT treatment', 'المعاملة الضريبية');
  String treatmentName(String code) => switch (code) {
    'standard' => _('Standard rated 5%', 'النسبة الأساسية 5%'),
    'zero-rated' => _('Zero rated 0%', 'النسبة الصفرية 0%'),
    'exempt' => _('Exempt', 'معفى'),
    'out-of-scope' => _('Out of scope', 'خارج نطاق الضريبة'),
    'reverse-charge' => _('Reverse charge (imported services)', 'احتساب عكسي (خدمات مستوردة)'),
    'import' => _('Imported goods', 'سلع مستوردة'),
    'import-adjustment' => _('Adjustment to imported goods', 'تعديل على سلع مستوردة'),
    _ => code,
  };
  String get vatOnBill => _('VAT on the bill (optional)', 'الضريبة في الفاتورة (اختياري)');
  String get vatOnBillHint => _('Leave blank to use 5%', 'اتركه فارغًا لاحتساب 5%');
  String get blockedVat => _('VAT not recoverable (entertainment, private car)', 'ضريبة غير قابلة للاسترداد (ضيافة، سيارة خاصة)');
  String get net => _('Net before VAT', 'الصافي قبل الضريبة');
  String get vat5 => _('VAT 5%', 'ضريبة القيمة المضافة 5%');
  String get totalAed => _('Total in AED', 'الإجمالي بالدرهم');
  String get selfAccountedVat => _('VAT you account for yourself', 'الضريبة المحتسبة ذاتيًا');
  String get recoverableVat => _('Recoverable input VAT', 'ضريبة المدخلات القابلة للاسترداد');
  String get billVat => _('VAT on the bill', 'الضريبة في الفاتورة');
  String get payableToSupplier => _('Payable to the supplier in AED', 'المستحق للمورّد بالدرهم');
  String get needCustomer => _('Enter the customer\'s name.', 'أدخل اسم العميل.');
  String get needSupplier => _('Enter the supplier\'s name.', 'أدخل اسم المورّد.');
  String badQuantity(int n) => _('Line $n: enter a quantity above zero.', 'السطر $n: أدخل كمية أكبر من صفر.');
  String badPrice(int n) => _('Line $n: enter the price in numbers, for example 1250.50.', 'السطر $n: أدخل السعر بالأرقام، مثل 1250.50.');
  String get badDate => _('Enter the date as YYYY-MM-DD, for example 2026-11-14.', 'أدخل التاريخ بصيغة YYYY-MM-DD، مثل 2026-11-14.');
  String get badRate => _('Enter the exchange rate as a number above zero, for example 3.6725.', 'أدخل سعر الصرف رقمًا أكبر من صفر، مثل 3.6725.');
  String get badTerms => _('Payment terms are whole days from 0 to 365.', 'مدة السداد أيام كاملة من 0 إلى 365.');
  String get nothingSaved => _('Nothing was saved', 'لم يُحفظ شيء');
  String get worthChecking => _('Worth checking', 'يستحق المراجعة');
  String saleRecorded(String id) => _('Invoice $id is in your books.', 'أُضيفت الفاتورة $id إلى دفاترك.');
  String billRecorded(String id) => _('Bill $id is in your books.', 'أُضيفت فاتورة المشتريات $id إلى دفاترك.');
  String creditRecorded(String id) => _('Credit note $id is in your books.', 'أُضيف الإشعار الدائن $id إلى دفاترك.');
  String get openInvoice => _('Open the invoice', 'افتح الفاتورة');
  String get another => _('Start another', 'ابدأ من جديد');
  String lineProblem(int n, String field, String why) => _('Line $n, $field: $why', 'السطر $n، $field: $why');

  String fieldName(String field) => switch (field) {
    'description' => _('description', 'الوصف'),
    'qty' => _('quantity', 'الكمية'),
    'rate' => _('price', 'السعر'),
    'treatment' => _('VAT treatment', 'المعاملة الضريبية'),
    'vat' => _('VAT on the bill', 'الضريبة في الفاتورة'),
    'recoveryBasisPoints' => _('recoverable share', 'النسبة القابلة للاسترداد'),
    _ => field,
  };

  String writeError(String code, {String currency = ''}) => switch (code) {
    'NO_LINES' => _('Add at least one line.', 'أضف سطرًا واحدًا على الأقل.'),
    'BAD_LINES' => _('Some lines need fixing.', 'بعض الأسطر تحتاج إلى تصحيح.'),
    'EMIRATE_REQUIRED' => _('Choose the emirate the sale is made from, or save it in the business profile.', 'اختر الإمارة التي تمّ منها البيع، أو احفظها في ملف المنشأة.'),
    'BAD_EMIRATE' => _('The emirate must be one of the seven emirates.', 'يجب أن تكون الإمارة إحدى الإمارات السبع.'),
    'BAD_TRN' => _('The TRN is not right: it has 15 digits, from the FTA certificate.', 'الرقم الضريبي غير صحيح: يتكوّن من 15 رقمًا من شهادة الهيئة.'),
    'EXCHANGE_RATE_REQUIRED' => _('Enter the AED exchange rate for ${currency.isEmpty ? 'this currency' : currency}.', 'أدخل سعر صرف الدرهم مقابل ${currency.isEmpty ? 'هذه العملة' : currency}.'),
    'ZERO_AMOUNT' => _('The amount is zero. Enter a price on at least one line.', 'المبلغ صفر. أدخل سعرًا في سطر واحد على الأقل.'),
    'DUPLICATE_ID' => _('That number is already used in your books.', 'هذا الرقم مستخدم في دفاترك.'),
    'PERIOD_LOCKED' => _('The books are closed for this date. Use a date after the closed period.', 'الدفاتر مقفلة لهذا التاريخ. استخدم تاريخًا بعد الفترة المقفلة.'),
    'INVOICE_NOT_FOUND' => _('That invoice is not in your books.', 'هذه الفاتورة غير موجودة في دفاترك.'),
    'MORE_THAN_INVOICE' => _('The credit note is more than what is left on the invoice.', 'قيمة الإشعار الدائن أكبر من المتبقي من الفاتورة.'),
    'REASON_REQUIRED' => _('Say why the invoice is reduced, for example goods returned.', 'اذكر سبب تخفيض الفاتورة، مثل إرجاع بضائع.'),
    'ALREADY_CREDITED' => _('This invoice is already fully credited.', 'صدر إشعار دائن بكامل قيمة هذه الفاتورة من قبل.'),
    'INVALID_DATE' => badDate,
    'BAD_CURRENCY' => _('Write the currency as three letters, for example USD.', 'اكتب العملة بثلاثة أحرف، مثل USD.'),
    'BAD_AMOUNT' => _('Enter the amount as a number above zero.', 'أدخل المبلغ رقمًا أكبر من صفر.'),
    _ => '',
  };

  String invoiceTitle(String id) => _('Invoice $id', 'الفاتورة $id');
  String get dueDateLabel => _('Due date', 'تاريخ الاستحقاق');
  String get taxInvoice => _('Tax invoice', 'فاتورة ضريبية');
  String status(String code) => switch (code) {
    'paid' => _('Paid', 'مدفوعة'),
    'partial' => _('Part paid', 'مدفوعة جزئيًا'),
    'cancelled' => _('Cancelled', 'ملغاة'),
    _ => _('Unpaid', 'غير مدفوعة'),
  };
  String trnOf(String trn) => _('TRN $trn', 'الرقم الضريبي $trn');
  String get noTrn => _('No TRN', 'بدون رقم ضريبي');
  String get creditNote => _('Credit note', 'إشعار دائن');
  String get creditNotes => _('Credit notes', 'الإشعارات الدائنة');
  String get issueCreditNote => _('Issue a credit note', 'أصدر إشعارًا دائنًا');
  String get creditAmount => _('Amount with VAT (optional)', 'المبلغ شاملًا الضريبة (اختياري)');
  String creditAmountHint(String left) => _('Up to $left. Leave blank to credit all that is left.', 'بحد أقصى $left. اتركه فارغًا لإصدار إشعار بكامل المتبقي.');
  String get creditReason => _('Why it is reduced', 'سبب التخفيض');
  String get creditReasonHint => _('For example goods returned or a price agreed lower', 'مثل إرجاع بضائع أو الاتفاق على سعر أقل');
  String get leftOnInvoice => _('Left on the invoice', 'المتبقي من الفاتورة');
  String get received => _('Received', 'المحصّل');
  String get notInBooks => _('This invoice is not in your books yet.', 'هذه الفاتورة ليست في دفاترك بعد.');
  String get lines => _('Lines', 'الأسطر');
  String inCurrency(String currency, String rate) => _('$currency at $rate AED', '$currency بسعر $rate درهم');

  String get whoSoldTo => _('Who did you sell to?', 'لمن بعت؟');
  String get whoBoughtFrom => _('Who did you buy from?', 'ممّن اشتريت؟');
  String get searchOrType => _('Search or type a new name', 'ابحث أو اكتب اسمًا جديدًا');
  String typeName(bool sales) => sales ? _('Type the customer\'s name', 'اكتب اسم العميل') : _('Type the supplier\'s name', 'اكتب اسم المورّد');
  String addNamed(String name) => _('Add “$name”', 'أضف «$name»');
  String newParty(bool sales) => sales ? _('New customer', 'عميل جديد') : _('New supplier', 'مورّد جديد');
  String noPartiesYet(bool sales) => sales ? _('No customers yet. Type a name to add the first one.', 'لا يوجد عملاء بعد. اكتب اسمًا لإضافة أول عميل.') : _('No suppliers yet. Type a name to add the first one.', 'لا يوجد مورّدون بعد. اكتب اسمًا لإضافة أول مورّد.');
  String get name => _('Name', 'الاسم');
  String get enterName => _('Enter a name.', 'أدخل الاسم.');
  String get trnOptional => _('TRN (optional)', 'الرقم الضريبي (اختياري)');
  String get trnOptionalHint => _('Leave empty if they are not registered for VAT', 'اتركه فارغًا إن لم يكن مسجّلًا في ضريبة القيمة المضافة');
  String get continueLabel => _('Continue', 'متابعة');
  String get customer => _('Customer', 'العميل');
  String get supplier => _('Supplier', 'المورّد');
  String get notVatRegistered => _('Not registered for VAT', 'غير مسجّل في ضريبة القيمة المضافة');
  String get yourAccountant => _('Your accountant', 'محاسبك');
  String get yourAccountantSubtitle => _('Questions you asked and their answers', 'الأسئلة التي طرحتها وإجاباتها');
  String get bank => _('Bank', 'البنك');
  String get askIntro => _(
    'Ask about your VAT, corporate tax, deadlines or invoices. MyCA works from the rules it shows you; it is not a registered tax agent, so check anything important with one.',
    'اسأل عن ضريبة القيمة المضافة أو ضريبة الشركات أو المواعيد أو الفواتير. يعمل MyCA وفق القواعد التي يعرضها لك، وهو ليس وكيلًا ضريبيًا مسجّلًا، فراجع أي أمر مهم مع وكيل.',
  );
  String get amountPaidWithVat => _('Amount paid, with any VAT', 'المبلغ المدفوع شاملًا أي ضريبة');
  String get expenseVatNote => _(
    'An expense is booked at the amount paid, with no VAT recovered. For a supplier bill with VAT you can recover, add a purchase bill with the supplier\'s TRN.',
    'يُسجّل المصروف بالمبلغ المدفوع دون استرداد أي ضريبة. لفاتورة مورّد تتضمن ضريبة قابلة للاسترداد، أضف فاتورة مشتريات برقم المورّد الضريبي.',
  );
  String get addPurchaseBill => _('Add a purchase bill', 'أضف فاتورة مشتريات');
  String get includingVat => _('Including any VAT', 'شاملًا أي ضريبة');

  String get welcomeTitle => _('Your books,\nkept as easily\nas a conversation.', 'دفاترك،\nبسهولة\nالمحادثة.');
  String get welcomeLine => _('Sales, purchases and VAT for your business, kept right without the paperwork.', 'مبيعات منشأتك ومشترياتها وضريبة القيمة المضافة، منظّمة دون أوراق.');
  String get welcomeSale => _('Log a sale the way you would send a message', 'سجّل عملية بيع كما ترسل رسالة');
  String get welcomeTaxes => _('VAT, corporate tax and due dates worked out for you', 'ضريبة القيمة المضافة وضريبة الشركات والمواعيد تُحتسب لك');
  String get welcomeConfirm => _('Nothing reaches your books until you say so', 'لا يدخل شيء إلى دفاترك حتى توافق');
  String get getStarted => _('Get started', 'ابدأ');
  String get setupMinutes => _('About two minutes to set up', 'نحو دقيقتين للإعداد');
  String get setupTitle => _('Tell us about the business', 'أخبرنا عن منشأتك');
  String get setupLine => _('The legal name goes on your tax invoices. Add the TRN and emirate in the business profile under UAE taxes.', 'يظهر الاسم القانوني على فواتيرك الضريبية. أضف الرقم الضريبي والإمارة في ملف المنشأة ضمن الضرائب في الإمارات.');
  String get businessName => _('Business name', 'اسم المنشأة');
  String get needBusinessName => _('Enter your business name.', 'أدخل اسم منشأتك.');
  String get settingUp => _('Setting up…', 'جارٍ الإعداد…');
  String get signOut => _('Sign out', 'تسجيل الخروج');

  String get fillFromBooks => _('Fill from my books', 'املأ من دفاتري');
  String get fillByHand => _('Enter the figures by hand', 'أدخل الأرقام يدويًا');
  String fromBooksCounts(int invoices, int creditNotes, int purchases) => _(
    'From your books: $invoices ${invoices == 1 ? 'invoice' : 'invoices'}, $creditNotes ${creditNotes == 1 ? 'credit note' : 'credit notes'}, $purchases ${purchases == 1 ? 'bill' : 'bills'}.',
    'من دفاترك: فواتير المبيعات $invoices، والإشعارات الدائنة $creditNotes، وفواتير المشتريات $purchases.',
  );

  String threadLabel(String? label) => switch (label) {
    'Not posted yet' => notPostedYet,
    'Posted' => posted,
    'Not posted' => notPosted,
    _ => label ?? '',
  };
}

final _arabicLetters = RegExp(r'[؀-ۿ]');

TextDirection directionOfText(String text, TextDirection ambient) =>
    _arabicLetters.hasMatch(text) ? TextDirection.rtl : (RegExp(r'[A-Za-z]').hasMatch(text) ? TextDirection.ltr : ambient);
