import 'package:flutter/widgets.dart';

import '../api/models.dart';
import '../brand.dart' show greetingFor;
import '../format.dart' as format;
import '../india/india_strings.dart';
import '../registers.dart' as registers;
import '../registers.dart' show RegisterKind;

class UaeStrings {
  const UaeStrings(this.ar, {this.india = 'en'});

  factory UaeStrings.of(BuildContext context) =>
      UaeStrings(Localizations.maybeLocaleOf(context)?.languageCode == 'ar', india: indiaLang(context));

  final bool ar;

  /// The India language code ('en' outside India). Lines fall back to the India tables keyed by the English line.
  final String india;

  bool get hi => india == 'hi';

  String _(String en, String arabic) => ar ? arabic : inLine(india, en);

  /// A line with names or amounts in it: [template] names each part in braces so an Indian language can
  /// reorder them, for example `_t('Move {what} to', {'what': what}, 'انقل $what إلى')`.
  String _t(String template, Map<String, Object?> parts, String arabic) => ar ? arabic : inFill(inLine(india, template), parts);

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

  String daysLeft(int days) => days == 1 ? _('1 day left', 'متبقٍ يوم واحد') : _t('{n} days left', {'n': days}, _arDaysLeft(days));

  String _arDaysLeft(int days) {
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

  String standardRated(String emirate) => _t('Standard rated supplies in {emirate}', {'emirate': emirate}, 'التوريدات الخاضعة للنسبة الأساسية في $emirate');

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
  String boxLabel(String key) => _t('Box {key}', {'key': key}, 'البند $key');
  String dueOn(String date) => _t('Due {date}', {'date': date}, 'تاريخ الاستحقاق $date');
  String periodRange(String from, String to) => _t('{from} to {to}', {'from': from, 'to': to}, 'من $from إلى $to');
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
    'Sandbox: MyCA checks the e-invoice and records it here. It is not sent to any Accredited Service Provider, it is not a real tax invoice and nothing reaches the FTA.',
    'بيئة اختبار: يفحص MyCA الفاتورة الإلكترونية ويسجّلها هنا. لا تُرسل إلى أي مزوّد خدمة معتمد، وليست فاتورة ضريبية حقيقية ولا يصل شيء إلى الهيئة.',
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
  String trnLength(int n) => _t('A TRN has 15 digits; this one has {n}.', {'n': n}, 'يتكوّن الرقم الضريبي من 15 رقمًا، والمُدخل $n.');
  String get trnFifteen => _('15 digits', '15 رقمًا');
  String get supplierInvoiceNo => _('Supplier\'s invoice number', 'رقم فاتورة المورّد');
  String get saleEmirate => _('Emirate the sale is made from', 'الإمارة التي تمّ منها البيع');
  String get chooseEmirate => _('Choose the emirate', 'اختر الإمارة');
  String get date => _('Date', 'التاريخ');
  String get currency => _('Currency', 'العملة');
  String exchangeRate(String currency) => _t('AED for 1 {currency}', {'currency': currency}, 'الدرهم مقابل 1 $currency');
  String get paymentTerms => _('Payment terms in days (optional)', 'مدة السداد بالأيام (اختياري)');
  String get boughtDescription => _('What was bought', 'وصف المشتريات');
  String lineTitle(int n) => _t('Line {n}', {'n': n}, 'السطر $n');
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
  String badQuantity(int n) => _t('Line {n}: enter a quantity above zero.', {'n': n}, 'السطر $n: أدخل كمية أكبر من صفر.');
  String badPrice(int n) => _t('Line {n}: enter the price in numbers, for example 1250.50.', {'n': n}, 'السطر $n: أدخل السعر بالأرقام، مثل 1250.50.');
  String get badDate => _('Enter the date as YYYY-MM-DD, for example 2026-11-14.', 'أدخل التاريخ بصيغة YYYY-MM-DD، مثل 2026-11-14.');
  String get badRate => _('Enter the exchange rate as a number above zero, for example 3.6725.', 'أدخل سعر الصرف رقمًا أكبر من صفر، مثل 3.6725.');
  String get badTerms => _('Payment terms are whole days from 0 to 365.', 'مدة السداد أيام كاملة من 0 إلى 365.');
  String get nothingSaved => _('Nothing was saved', 'لم يُحفظ شيء');
  String get worthChecking => _('Worth checking', 'يستحق المراجعة');
  String saleRecorded(String id) => _t('Invoice {id} is in your books.', {'id': id}, 'أُضيفت الفاتورة $id إلى دفاترك.');
  String billRecorded(String id) => _t('Bill {id} is in your books.', {'id': id}, 'أُضيفت فاتورة المشتريات $id إلى دفاترك.');
  String creditRecorded(String id) => _t('Credit note {id} is in your books.', {'id': id}, 'أُضيف الإشعار الدائن $id إلى دفاترك.');
  String get openInvoice => _('Open the invoice', 'افتح الفاتورة');
  String get another => _('Start another', 'ابدأ من جديد');
  String lineProblem(int n, String field, String why) => _t('Line {n}, {field}: {why}', {'n': n, 'field': field, 'why': why}, 'السطر $n، $field: $why');

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

  String invoiceTitle(String id) => _t('Invoice {id}', {'id': id}, 'الفاتورة $id');
  String get dueDateLabel => _('Due date', 'تاريخ الاستحقاق');
  String get taxInvoice => _('Tax invoice', 'فاتورة ضريبية');
  String status(String code) => switch (code) {
    'paid' => _('Paid', 'مدفوعة'),
    'partial' => _('Part paid', 'مدفوعة جزئيًا'),
    'cancelled' => _('Cancelled', 'ملغاة'),
    'settled' => _('Settled', 'مسوّاة'),
    _ => _('Unpaid', 'غير مدفوعة'),
  };
  String trnOf(String trn) => _t('TRN {trn}', {'trn': trn}, 'الرقم الضريبي $trn');
  String get noTrn => _('No TRN', 'بدون رقم ضريبي');
  String get creditNote => _('Credit note', 'إشعار دائن');
  String get creditNotes => _('Credit notes', 'الإشعارات الدائنة');
  String get issueCreditNote => _('Issue a credit note', 'أصدر إشعارًا دائنًا');
  String get creditAmount => _('Amount with VAT (optional)', 'المبلغ شاملًا الضريبة (اختياري)');
  String creditAmountHint(String left) => _t('Up to {left}. Leave blank to credit all that is left.', {'left': left}, 'بحد أقصى $left. اتركه فارغًا لإصدار إشعار بكامل المتبقي.');
  String get creditReason => _('Why it is reduced', 'سبب التخفيض');
  String get creditReasonHint => _('For example goods returned or a price agreed lower', 'مثل إرجاع بضائع أو الاتفاق على سعر أقل');
  String get leftOnInvoice => _('Left on the invoice', 'المتبقي من الفاتورة');
  String get received => _('Received', 'المحصّل');
  String get notInBooks => _('This invoice is not in your books yet.', 'هذه الفاتورة ليست في دفاترك بعد.');
  String get lines => _('Lines', 'الأسطر');
  String inCurrency(String currency, String rate) => _t('{currency} at {rate} AED', {'currency': currency, 'rate': rate}, '$currency بسعر $rate درهم');
  String creditNoteTitle(String id) => _t('Credit note {id}', {'id': id}, 'الإشعار الدائن $id');
  String get creditNoteNotInBooks => _('This credit note is not in your books.', 'هذا الإشعار الدائن ليس في دفاترك.');
  String get documentNumber => _('Number', 'الرقم');
  String get dateOfSupply => _('Date of supply', 'تاريخ التوريد');
  String get seller => _('Seller', 'البائع');
  String get buyer => _('Buyer', 'المشتري');
  String get noAddress => _('No address', 'بدون عنوان');
  String get originalInvoice => _('Original invoice', 'الفاتورة الأصلية');
  String get originalInvoiceDate => _('Date of the original invoice', 'تاريخ الفاتورة الأصلية');
  String get originalTotal => _('Original invoice total in AED', 'إجمالي الفاتورة الأصلية بالدرهم');
  String get originalVat => _('VAT on the original invoice in AED', 'ضريبة الفاتورة الأصلية بالدرهم');
  String get creditReasonLabel => _('Reason', 'السبب');
  String get cancelsInFull => _('Cancels the original invoice in full', 'يلغي الفاتورة الأصلية بالكامل');
  String get netAed => _('Net before VAT in AED', 'الصافي قبل الضريبة بالدرهم');
  String get vatAed => _('VAT in AED', 'الضريبة بالدرهم');
  String get creditedLabel => _('Credited', 'المخفَّض بإشعارات دائنة');
  String get balanceDue => _('Balance due in AED', 'الرصيد المستحق بالدرهم');
  String quantityTimes(String qty, String price) => _t('Qty {qty} × {price}', {'qty': qty, 'price': price}, 'الكمية $qty × $price');
  String unitPriceAed(String price) => _t('{price} a unit', {'price': price}, '$price للوحدة');
  String vatRateOf(String rate) => _t('VAT {rate}%', {'rate': rate}, 'الضريبة $rate%');
  String get openCreditNote => _('Open the credit note', 'افتح الإشعار الدائن');
  String get missingTitle => _('Missing from this document', 'بيانات ناقصة في هذا المستند');
  String missingItem(String code, {bool creditNote = false}) => switch (code) {
    'SELLER_TRN' => creditNote
        ? _('Your TRN is missing, so this is not a tax credit note. Add the TRN in the business profile.', 'رقمك الضريبي غير موجود، لذا لا يُعدّ هذا إشعارًا دائنًا ضريبيًا. أضف الرقم في ملف المنشأة.')
        : _('Your TRN is missing, so this is not a tax invoice. Add the TRN in the business profile.', 'رقمك الضريبي غير موجود، لذا لا تُعدّ هذه فاتورة ضريبية. أضف الرقم في ملف المنشأة.'),
    'SELLER_ADDRESS' => _('Your address is missing. Add it in the business profile.', 'عنوانك غير موجود. أضفه في ملف المنشأة.'),
    'BUYER_ADDRESS' => creditNote
        ? _('The buyer\'s address is missing. A tax credit note must show it; add it to the customer.', 'عنوان المشتري غير موجود. يجب أن يتضمنه الإشعار الدائن الضريبي؛ أضفه إلى بيانات العميل.')
        : _('The buyer\'s address is missing. A full tax invoice must show it; add it to the customer.', 'عنوان المشتري غير موجود. يجب أن تتضمنه الفاتورة الضريبية الكاملة؛ أضفه إلى بيانات العميل.'),
    _ => _('Something the document needs is missing.', 'بعض البيانات المطلوبة في المستند غير موجودة.'),
  };

  String get whoSoldTo => _('Who did you sell to?', 'لمن بعت؟');
  String get whoBoughtFrom => _('Who did you buy from?', 'ممّن اشتريت؟');
  String get searchOrType => _('Search or type a new name', 'ابحث أو اكتب اسمًا جديدًا');
  String typeName(bool sales) => sales ? _('Type the customer\'s name', 'اكتب اسم العميل') : _('Type the supplier\'s name', 'اكتب اسم المورّد');
  String addNamed(String name) => _t('Add “{name}”', {'name': name}, 'أضف «$name»');
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

  static const _monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  String longDate(String iso) {
    if (!ar) return format.longDate(iso);
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso.trim());
    final month = match == null ? 0 : int.parse(match.group(2)!);
    if (match == null || month < 1 || month > 12) return iso;
    return '${int.parse(match.group(3)!)} ${_monthsAr[month - 1]} ${match.group(1)}';
  }

  String readableDay(String text) => ar && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text.trim()) ? longDate(text) : format.readableDay(text);

  String monthLabel(String period) {
    if (!ar) return format.monthLabel(period);
    final parts = period.split('-');
    final month = parts.length == 2 ? int.tryParse(parts[1]) : null;
    if (month == null || month < 1 || month > 12) return period;
    return '${_monthsAr[month - 1]} ${parts[0]}';
  }

  String greeting(DateTime now) {
    if (!ar && india == 'en') return greetingFor(now);
    if (now.hour < 5) return _('Working late', 'تعمل حتى وقت متأخر');
    if (now.hour < 12) return _('Good morning', 'صباح الخير');
    if (now.hour < 17) return _('Good afternoon', 'مساء الخير');
    return _('Good evening', 'مساء الخير');
  }

  String get yourBusiness => _('Your business', 'منشأتك');
  String get newEntry => _('New entry', 'قيد جديد');
  String sharedByOwner(String date) => _t(
    'Shared by the owner as of {date}. Entries after that are not shown, and changes are made by the owner.',
    {'date': date},
    'شاركها المالك حتى $date. لا تظهر القيود اللاحقة، والتعديلات يجريها المالك.',
  );
  String get gotIt => _('Got it', 'حسنًا');
  String get send => _('Send', 'إرسال');
  String get askAnything => _('Tell or ask MyCA anything', 'أخبر MyCA أو اسأله عن أي شيء');
  String get sold => _('Sold', 'بعت');
  String get bought => _('Bought', 'اشتريت');
  String get spent => _('Spent', 'أنفقت');
  String get paidStaff => _('Paid staff', 'رواتب الموظفين');
  String lastFigure(String amount) => _t('last {amount}', {'amount': amount}, 'السابق $amount');
  String get owedToYou => _('Owed to you', 'المستحق لك');
  String get noInvoiceWaiting => _('No invoice is waiting for payment.', 'لا توجد فاتورة بانتظار السداد.');
  String get youOweSuppliers => _('You owe suppliers', 'المستحق للمورّدين');
  String get noBillWaiting => _('No bill is waiting to be paid.', 'لا توجد فاتورة مشتريات بانتظار السداد.');
  String get firstSale => _('Log your first sale', 'سجّل أول عملية بيع');
  String get firstSaleLine => _('Name the customer, enter the amount, confirm.', 'اكتب اسم العميل، وأدخل المبلغ، ثم أكّد.');
  String get yourBooks => _('Your books', 'دفاترك');
  String get moneyAndFollowUp => _('Money and follow-up', 'المال والمتابعة');
  String get sales => _('Sales', 'المبيعات');
  String get purchases => _('Purchases', 'المشتريات');
  String get expenses => _('Expenses', 'المصروفات');
  String get cash => _('Cash', 'النقد');
  String get cashSubtitle => _('Bank and cash, the next 30 days, and can I afford it', 'البنك والنقد، والأيام الثلاثون القادمة، وهل أستطيع تحمّل التكلفة');
  String get bankSubtitle => _('Your statement next to your books, matched and not matched', 'كشف حسابك بجانب دفاترك، المطابق وغير المطابق');
  String get repeatingEntries => _('Repeating entries', 'القيود المتكررة');
  String get repeatingSubtitle => _('Invoices, bills and expenses posted on their dates', 'فواتير ومصروفات تُسجَّل في مواعيدها');
  String get reports => _('Reports', 'التقارير');
  String get reportsSubtitle => _('Saved reports run by name, compared with the period before', 'تقارير محفوظة تُشغَّل باسمها، مقارنةً بالفترة السابقة');
  String get statements => _('Statements', 'القوائم المالية');
  String get statementsSubtitle => _('Profit and loss, balance sheet, cash flow, customer statements', 'الأرباح والخسائر، والميزانية العمومية، والتدفقات النقدية، وكشوف حسابات العملاء');
  String get reminders => _('Reminders', 'التذكيرات');
  String get remindersSubtitle => _('Anything you asked to be reminded of', 'كل ما طلبت التذكير به');
  String get booksCheck => _('Books check', 'فحص الدفاتر');
  String get booksCheckSubtitle => _('What needs you, worked out from your books', 'ما يحتاج إلى اهتمامك، مستخلصًا من دفاترك');
  String get dueTodayTitle => _('Due today', 'مستحق اليوم');
  String thisWeek(int overdue) => overdue > 0 ? _t('This week · {overdue} overdue', {'overdue': overdue}, 'هذا الأسبوع · متأخر: $overdue') : _('This week', 'هذا الأسبوع');
  String booksToday(bool closed, int needs) => closed
      ? _('Books today · closed', 'دفاتر اليوم · مقفلة')
      : needs == 1
      ? _t('Books today · {n} needs you', {'n': needs}, 'دفاتر اليوم · تحتاج إليك: $needs')
      : _t('Books today · {n} need you', {'n': needs}, 'دفاتر اليوم · تحتاج إليك: $needs');
  String closeCash(String bank, String owed) => _t('Bank {bank} · customers owe {owed}', {'bank': bank, 'owed': owed}, 'البنك $bank · مستحق على العملاء $owed');
  String closeSource(bool recorded, String on) => recorded
      ? _('As recorded; give today\'s bank balance for the real figure', 'كما هو مسجّل؛ أدخل رصيد البنك اليوم للحصول على الرقم الفعلي')
      : _t('From the balance on {on} plus what was recorded since', {'on': on}, 'من الرصيد في $on مضافًا إليه ما سُجّل بعده');
  String owesOn(String who, String amount, String id) => _t('{who} owes {amount} on {id}', {'who': who, 'amount': amount, 'id': id}, 'على $who مبلغ $amount عن $id');

  String registerSubtitle(List<Invoice> documents, RegisterKind kind) {
    if (!ar) return registers.registerSubtitle(documents, kind, india);
    if (documents.isEmpty) return kind == RegisterKind.sales ? 'لا مبيعات بعد' : 'لا مشتريات بعد';
    final parties = registers.partiesOf(documents);
    final latest = parties.first;
    final count = kind == RegisterKind.sales ? 'العملاء: ${parties.length}' : 'المورّدون: ${parties.length}';
    return '$count · ${latest.name}: ${format.rupees(latest.latest!.total)}';
  }

  String expensesSubtitle(List<Expense> expenses) {
    if (!ar) return registers.expensesSubtitle(expenses, india);
    if (expenses.isEmpty) return 'لا مصروفات بعد';
    final threads = registers.headThreadsOf(expenses);
    final latest = threads.first;
    return 'البنود: ${threads.length} · ${accountName(latest.name)}: ${format.rupees(latest.latest.amount)}';
  }

  String headSubtitle(registers.HeadThread thread) {
    if (!ar) return registers.headSubtitle(thread, india);
    return 'القيود: ${thread.expenses.length} · ${format.rupees(thread.total)} · آخرها ${longDate(thread.latest.date)}';
  }

  String lastEntryLine(Invoice doc, RegisterKind kind) {
    if (!ar) return registers.lastEntryLine(doc, kind, india);
    final what = kind == RegisterKind.sales ? 'الفاتورة' : 'فاتورة المشتريات';
    final state = doc.cancelled ? 'cancelled' : doc.paid ? 'paid' : doc.partial ? 'partial' : 'unpaid';
    return '$what ${doc.id}، ${format.rupees(doc.total)}، ${status(state)}';
  }

  String unpaidCount(int n) => _t('{n} unpaid', {'n': n}, 'غير مدفوعة: $n');
  String searchParties(bool sales) => sales ? _('Search customers', 'ابحث في العملاء') : _('Search suppliers', 'ابحث في المورّدين');
  String noPartiesRegister(bool sales) => sales
      ? _('No customers yet. Add one to record your first sale.', 'لا يوجد عملاء بعد. أضف عميلًا لتسجيل أول عملية بيع.')
      : _('No suppliers yet. Add one to record your first bill.', 'لا يوجد مورّدون بعد. أضف مورّدًا لتسجيل أول فاتورة مشتريات.');
  String get noOneByThatName => _('No one by that name.', 'لا أحد بهذا الاسم.');

  String get whatHappened => _('What happened?', 'ماذا حدث؟');
  String get iSold => _('I sold something', 'بعت شيئًا');
  String get iSoldSubtitle => _('Raise an invoice for a customer', 'أصدر فاتورة لعميل');
  String get iBought => _('I bought something', 'اشتريت شيئًا');
  String get iBoughtSubtitle => _('Add a supplier bill', 'أضف فاتورة مورّد');
  String get iPaidExpense => _('I paid an expense', 'دفعت مصروفًا');
  String get iPaidExpenseSubtitle => _('Rent, fuel, anything without a supplier bill', 'إيجار أو وقود أو أي شيء بلا فاتورة مورّد');
  String get justAsk => _('Just ask', 'اسأل فحسب');
  String get justAskSubtitle => _('Type anything, MyCA will sort it', 'اكتب أي شيء، وسيتولّى MyCA ترتيبه');

  String stamp(String? code) => switch (code) {
    'Accepted' => _('Accepted', 'مقبول'),
    'Declined' => _('Declined', 'مرفوض'),
    'Invoiced' => _('Invoiced', 'صدرت فاتورته'),
    'Expired' => _('Expired', 'منتهي'),
    'Cancelled' => _('Cancelled', 'ملغاة'),
    'Came back' => _('Came back', 'أُعيد'),
    'Open' => _('Open', 'مفتوح'),
    'Paid' => _('Paid', 'مدفوعة'),
    'Part paid' => _('Part paid', 'مدفوعة جزئيًا'),
    'Unpaid' => _('Unpaid', 'غير مدفوعة'),
    'Cash' => _('Cash', 'نقدًا'),
    _ => code ?? '',
  };
  String get postIt => _('Post it', 'سجّله');
  String get yes => _('Yes', 'نعم');

  String get expense => _('Expense', 'مصروف');
  String get expenseHead => _('Expense head', 'بند المصروف');
  String get noExpensesYet => _('No expenses yet. Add one and MyCA will put it under the right head: rent, salaries, travel and so on.', 'لا مصروفات بعد. أضف مصروفًا وسيضعه MyCA تحت البند الصحيح: الإيجار والرواتب والسفر وغيرها.');
  String nothingUnder(String head) => _t('Nothing under {head} yet.', {'head': head}, 'لا شيء تحت $head بعد.');
  String get tapToMoveHead => _('Tap to move it to the right head', 'اضغط لنقله إلى البند الصحيح');
  String moveTo(String what) => _t('Move {what} to', {'what': what}, 'انقل $what إلى');
  String moveSaid(String what, String head) => _t('Move {what} to {head}', {'what': what, 'head': head}, 'انقل $what إلى $head');
  String get whatFor => _('What was it for', 'ما الغرض منه');
  String get paidTo => _('Paid to (optional)', 'المدفوع له (اختياري)');
  String get fromBank => _('From bank', 'من البنك');
  String get fromCash => _('From cash', 'من النقد');
  String headChip(String? head) => head == null ? _('Head: automatic', 'البند: تلقائي') : _t('Head: {head}', {'head': head}, 'البند: $head');
  String underHead(String head) => _t('Under {head} · change', {'head': head}, 'تحت $head · تغيير');
  String get sayWhatFor => _('Say what the expense was for.', 'اذكر الغرض من المصروف.');
  String get enterAmount => _('Enter the amount.', 'أدخل المبلغ.');
  String expenseSaid(String what, String amount, bool bank) => bank
      ? _t('{what}: {amount} from bank', {'what': what, 'amount': amount}, '$what: $amount من البنك')
      : _t('{what}: {amount} from cash', {'what': what, 'amount': amount}, '$what: $amount من النقد');
  String putUnder(String head) => _t('Put it under {head}', {'head': head}, 'ضعه تحت $head');
  String get whichHead => _('Which head?', 'أي بند؟');
  String get headsNotLoaded => _('The heads could not be loaded.', 'تعذّر تحميل البنود.');
  String get headsRemembered => _('MyCA remembers your choice for the same payee or wording.', 'يتذكّر MyCA اختيارك للمستفيد نفسه أو الوصف نفسه.');

  String get yesterday => _('Yesterday', 'أمس');
  String daysAgo(int days) => _t('{days} days ago', {'days': days}, 'قبل $days أيام');
  String get today => _('Today', 'اليوم');
  String get tomorrow => _('Tomorrow', 'غدًا');
  String get inAWeek => _('In a week', 'بعد أسبوع');
  String get pickADay => _('Pick a day', 'اختر يومًا');
  String get remindMe => _('Remind me', 'ذكّرني');
  String get whatAbout => _('What about', 'بخصوص ماذا');
  String get sayWhatToRemind => _('Say what to remind you about.', 'اذكر ما تريد التذكير به.');
  String get chooseADay => _('Choose a day.', 'اختر يومًا.');
  String get openTheBill => _('Open the bill', 'افتح الفاتورة');
  String get markDone => _('Mark done', 'تم');
  String get noReminders => _('No reminders. Add one here, or say "remind me to call Rajesh tomorrow" in Ask.', 'لا توجد تذكيرات. أضف تذكيرًا هنا، أو قل «ذكّرني بالاتصال بأحمد غدًا» في خانة السؤال.');
  String get reminder => _('Reminder', 'تذكير');
  String remindSaid(String text) => _t('Remind me: {text}', {'text': text}, 'ذكّرني: $text');

  String bubbleLabel(String? label) => ar || india != 'en' ? threadLabel(label) : (label ?? '');

  String get statementOfAccount => _('Statement of account', 'كشف الحساب');
  String billTitle(String id) => _t('Bill {id}', {'id': id}, 'فاتورة المشتريات $id');
  String get tapToView => _('Tap to view or send', 'اضغط للعرض أو الإرسال');
  String get tapToOpen => _('Tap to open', 'اضغط للفتح');
  String stillOwed(String amount) => _t('{amount} still owed', {'amount': amount}, 'المتبقي $amount');
  String creditNoteAgainst(String id, String doc, String reason) => _t('Credit note {id} against {doc}: {reason}', {'id': id, 'doc': doc, 'reason': reason}, 'إشعار دائن $id على $doc: $reason');
  String cancelledDoc(String doc, String reason) => _t('Cancelled {doc}: {reason}', {'doc': doc, 'reason': reason}, 'أُلغيت $doc: $reason');
  String _mode(String mode) => switch (mode) {
    'bank' => _('bank', 'عبر البنك'),
    'cash' => _('cash', 'نقدًا'),
    _ => mode,
  };
  String receivedAgainst(String mode, String doc) => _t('Received by {mode} against {doc}', {'mode': _mode(mode), 'doc': doc}, 'مُحصّل ${_mode(mode)} عن $doc');
  String paidAgainst(String mode, String doc) => _t('Paid by {mode} against {doc}', {'mode': _mode(mode), 'doc': doc}, 'مدفوع ${_mode(mode)} عن $doc');
  String receivedSaid(String amount, String mode, String doc) => _t('Received {amount} by {mode} against {doc}', {'amount': amount, 'mode': _mode(mode), 'doc': doc}, 'استلمت $amount ${_mode(mode)} عن $doc');
  String paidSaid(String amount, String mode, String doc) => _t('Paid {amount} by {mode} against {doc}', {'amount': amount, 'mode': _mode(mode), 'doc': doc}, 'دفعت $amount ${_mode(mode)} عن $doc');
  String nothingLogged(bool sales, String name) => sales
      ? _t('Nothing logged for {name} yet. Enter the sale below and you will see it before it is posted.', {'name': name}, 'لم يُسجَّل شيء لـ$name بعد. أدخل عملية البيع أدناه وستراها قبل تسجيلها.')
      : _t('Nothing logged for {name} yet. Enter the bill below and you will see it before it is posted.', {'name': name}, 'لم يُسجَّل شيء لـ$name بعد. أدخل فاتورة المشتريات أدناه وستراها قبل تسجيلها.');
  String documentChip(bool sales, bool again) => sales
      ? (again ? _('Another sale', 'بيع آخر') : _('Sale', 'بيع'))
      : (again ? _('Another bill', 'فاتورة مشتريات أخرى') : _('Bill', 'فاتورة مشتريات'));
  String paymentChip(bool sales) => sales ? _('Payment received', 'دفعة مستلمة') : _('Paid', 'دفعت');
  String termsChip(int? days) => days == null ? _('Set terms', 'حدّد مهلة السداد') : _t('Terms: {terms}', {'terms': termsLabel(days)}, 'المهلة: ${termsLabel(days)}');
  String termsLabel(int? days) => !ar ? format.termsLabel(days) : days == null ? '' : days == 0 ? 'مستحق عند الاستلام' : 'خلال $days يومًا';
  String paymentTitle(bool sales) => sales ? _('Payment received', 'دفعة مستلمة') : _('Payment made', 'دفعة مسدّدة');
  String againstDocument(bool sales) => sales ? _('Against invoice', 'مقابل الفاتورة') : _('Against bill', 'مقابل فاتورة المشتريات');
  String owedOn(String id, String amount) => _t('{id} · {amount} owed', {'id': id, 'amount': amount}, '$id · المتبقي $amount');
  String amountReceivedOrPaid(bool sales) => sales ? _('Amount received', 'المبلغ المحصّل') : _('Amount paid', 'المبلغ المدفوع');
  String enterAmountReceivedOrPaid(bool sales) => sales ? _('Enter the amount received.', 'أدخل المبلغ المحصّل.') : _('Enter the amount paid.', 'أدخل المبلغ المدفوع.');
  String get cancel => _('Cancel', 'إلغاء');
  String howLongToPay(String name) => _t('How long does {name} have to pay?', {'name': name}, 'ما المهلة الممنوحة لـ$name للسداد؟');
  String get termsNote => _('New invoices get a due date. Invoices already raised keep theirs.', 'تحصل الفواتير الجديدة على تاريخ استحقاق، وتحتفظ الفواتير الصادرة بتواريخها.');
  String get postedDot => _('Posted.', 'تم التسجيل.');
  String dueWords(String dueDate, DateTime today, {required bool open}) {
    if (!ar) return format.dueWords(dueDate, today, open: open);
    if (dueDate.isEmpty || !open) return '';
    final parts = dueDate.split('-').map(int.parse).toList();
    final days = DateTime(parts[0], parts[1], parts[2]).difference(DateTime(today.year, today.month, today.day)).inDays;
    if (days < 0) return 'متأخرة منذ ${-days} ${-days == 1 ? 'يوم' : 'أيام'}';
    if (days == 0) return dueToday;
    return dueOn(longDate(dueDate));
  }

  String get noOpenQuestions => _('No open questions. Ask your accountant from an invoice or a flagged item; MyCA attaches the details.', 'لا توجد أسئلة مفتوحة. اسأل محاسبك من فاتورة أو بند يحتاج إلى مراجعة؛ يرفق MyCA التفاصيل.');
  String get accountantSees => _('Your accountant or registered tax agent sees these in MyCA once you have invited them from People.', 'يرى محاسبك أو وكيلك الضريبي المسجّل هذه الأسئلة في MyCA بعد دعوته من صفحة الأشخاص.');
  String accountantStatus(String status) => switch (status) {
    'answered' => _('Answered', 'تمت الإجابة'),
    'closed' => _('Closed', 'مغلق'),
    _ => _('Waiting for your accountant', 'بانتظار محاسبك'),
  };
  String get askYourAccountant => _('Ask your accountant', 'اسأل محاسبك');
  String askAbout(String about) => _t('About {about}. MyCA attaches the details.', {'about': about}, 'بخصوص $about. يرفق MyCA التفاصيل.');
  String get yourQuestion => _('Your question', 'سؤالك');
  String get attaching => _('Attaching…', 'جارٍ الإرفاق…');
  String get attachFile => _('Attach a file', 'أرفق ملفًا');
  String get atMostFive => _('At most five files on one question.', 'خمسة ملفات على الأكثر للسؤال الواحد.');
  String get writeQuestion => _('Write what you want to ask.', 'اكتب ما تريد أن تسأل عنه.');
  String get sendToAccountant => _('Send to your accountant?', 'أترسله إلى محاسبك؟');
  String get notSent => _('Not sent.', 'لم يُرسل.');
  String attached(String names) => _t('Attached: {names}', {'names': names}, 'المرفقات: $names');
  String replyOn(String date) => _t('Reply · {date}', {'date': date}, 'رد · $date');
  String get copyToSend => _('Copy to send', 'انسخ للإرسال');
  String get close => _('Close', 'إغلاق');
  String get reply => _('Reply', 'رد');
  String get copiedForAccountant => _('Copied. Paste it into WhatsApp or email if your accountant is not on MyCA yet.', 'تم النسخ. الصقه في واتساب أو البريد الإلكتروني إن لم يكن محاسبك على MyCA بعد.');

  String starter(String text) => switch (text) {
    'How is business?' => _('How is business?', 'كيف حال العمل؟'),
    'Who owes me?' => _('Who owes me?', 'من المدين لي؟'),
    'Who should I chase?' => _('Who should I chase?', 'من يجب أن أطالبه بالسداد؟'),
    'Who do I need to pay?' => _('Who do I need to pay?', 'لمن يجب أن أدفع؟'),
    'Cash forecast' => _('Cash forecast', 'توقعات النقد'),
    'Can I make payroll?' => _('Can I make payroll?', 'هل أستطيع دفع الرواتب؟'),
    'What should I reorder?' => _('What should I reorder?', 'ماذا يجب أن أعيد طلبه؟'),
    'How much tax should I set aside?' => _('How much tax should I set aside?', 'كم يجب أن أدّخر للضريبة؟'),
    'Close the month' => _('Close the month', 'أقفل الشهر'),
    'My reminders' => _('My reminders', 'تذكيراتي'),
    'Show deadlines' => _('Show deadlines', 'اعرض المواعيد'),
    _ => text,
  };
  String get askMyCa => _('Ask MyCA', 'اسأل MyCA');
  String get messageMyCa => _('Message MyCA', 'راسل MyCA');

  String signedInAs(String name) => _t('Signed in as {name}', {'name': name}, 'تم تسجيل الدخول باسم $name');
  String get people => _('People', 'الأشخاص');
  String get peopleSubtitle => _('Who can work in these books', 'من يمكنه العمل في هذه الدفاتر');
  String get inviteOwner => _('Invite a business owner', 'ادعُ صاحب منشأة');
  String get inviteOwnerSubtitle => _('Share your invite code, or use one you were sent', 'شارك رمز دعوتك، أو استخدم رمزًا أُرسل إليك');
  String get security => _('Security', 'الأمان');
  String get securitySubtitle => _('Two-step sign-in and where you are signed in', 'التحقق بخطوتين والأجهزة التي سجّلت الدخول منها');
  String get connections => _('Connections', 'الاتصالات');
  String get connectionsSubtitle => _('A POS or an inbox that feeds these books', 'نقطة بيع أو بريد وارد يغذّي هذه الدفاتر');
  String get yourBusinesses => _('Your businesses', 'منشآتك');
  String get yourBusinessesSubtitle => _('Switch business or answer an invitation', 'بدّل المنشأة أو ردّ على دعوة');
  String get setScreenLock => _('Set a screen lock on this phone to protect MyCA with it.', 'اضبط قفل الشاشة على هذا الهاتف لحماية MyCA به.');
  String get bringInMore => _('Bring in more books', 'استورد مزيدًا من الدفاتر');
  String get bringInMoreSubtitle => _('Tally, Zoho or a bank statement', 'من Tally أو Zoho أو كشف حساب بنكي');
  String get briefFailed => _('Could not change the Monday brief setting.', 'تعذّر تغيير إعداد ملخص الإثنين.');
  String get mondayBrief => _('Monday brief on WhatsApp', 'ملخص الإثنين على واتساب');
  String get mondayBriefSubtitle => _(
    'Every Monday at 7 am: cash and runway, sales against last week, who owes you and for how long, what is due, and the one thing to do.',
    'كل يوم إثنين الساعة 7 صباحًا: النقد والمدة التي يكفيها، والمبيعات مقارنةً بالأسبوع الماضي، ومن المدين لك ومنذ متى، وما هو مستحق، والأمر الأهم الذي يجب فعله.',
  );
  String get crashReports => _('Send crash reports', 'أرسل تقارير الأعطال');
  String get crashReportsAe => _('Only what went wrong in the app. Names, amounts, TRNs and phone numbers are removed before it leaves the phone.', 'ما حدث من خطأ في التطبيق فقط. تُحذف الأسماء والمبالغ والأرقام الضريبية وأرقام الهواتف قبل أن يغادر الهاتف.');
  String get appLock => _('App lock', 'قفل التطبيق');
  String get appLockSubtitle => _('Ask for your fingerprint, face or screen lock to open MyCA', 'اطلب بصمتك أو وجهك أو قفل الشاشة لفتح MyCA');

  String get enterAnAmount => _('Enter an amount.', 'أدخل مبلغًا.');
  String get couldNotWorkThatOut => _('That could not be worked out.', 'تعذّر احتساب ذلك.');
  String get useTheseBalances => _('Use these balances?', 'أتستخدم هذه الأرصدة؟');
  String get useThem => _('Use them', 'استخدمها');
  String get forecastFailed => _('The forecast could not be worked out.', 'تعذّر احتساب التوقعات.');
  String get bankAndCashNow => _('BANK AND CASH NOW', 'البنك والنقد الآن');
  String bankAndCash(String bank, String cash) => _t('Bank {bank} · cash in hand {cash}', {'bank': bank, 'cash': cash}, 'البنك $bank · النقد في الصندوق $cash');
  String fromBalanceOn(String date) => _t('From the balance you gave on {date}, with what was recorded since.', {'date': date}, 'من الرصيد الذي أدخلته في $date، مع ما سُجّل بعده.');
  String get updateBalance => _('Update balance', 'حدّث الرصيد');
  String get tellBalance => _('Tell MyCA your balance today', 'أخبر MyCA برصيدك اليوم');
  String nextDays(int days) => _t('NEXT {days} DAYS', {'days': days}, 'الأيام الـ$days القادمة');
  String get comingIn => _('Coming in', 'الوارد');
  String get goingOut => _('Going out', 'الصادر');
  String onDate(String date) => _t('On {date}', {'date': date}, 'في $date');
  String lowestOn(String date) => _t('Lowest, on {date}', {'date': date}, 'الأدنى، في $date');
  String overdueNotCounted(String amount) => _t('Overdue and not counted: {amount}. MyCA cannot tell when it will be paid.', {'amount': amount}, 'متأخر وغير محتسب: $amount. لا يستطيع MyCA معرفة موعد سداده.');
  String get canIAfford => _('CAN I AFFORD IT?', 'هل أستطيع تحمّل التكلفة؟');
  String get amountToSpend => _('Amount to spend', 'المبلغ المراد إنفاقه');
  String cashWhen(String key) => switch (key) {
    'Today' => today,
    'Next month' => _('Next month', 'الشهر القادم'),
    'In 3 months' => _('In 3 months', 'بعد 3 أشهر'),
    _ => key,
  };
  String get enterBalances => _('Enter the bank balance, the cash in hand, or both.', 'أدخل رصيد البنك أو النقد في الصندوق أو كليهما.');
  String get yourBalanceToday => _('Your balance today', 'رصيدك اليوم');
  String get balanceSheetNote => _('As your bank app or passbook shows it. This posts nothing to your books.', 'كما يظهر في تطبيق البنك أو دفتر الحساب. لا يُسجَّل شيء في دفاترك.');
  String get bankBalance => _('Bank balance', 'رصيد البنك');
  String get cashInHand => _('Cash in hand', 'النقد في الصندوق');

  String bankFilter(String key) => switch (key) {
    'all' => _('All', 'الكل'),
    'unmatched' => _('Not matched yet', 'غير مطابق بعد'),
    'matched' => _('Matched', 'مطابق'),
    'booked' => _('Booked', 'مسجّل'),
    'ignored' => _('Ignored', 'مستبعد'),
    _ => key,
  };
  String bankEmpty(String key) => switch (key) {
    'all' => _('No statement lines yet.', 'لا توجد أسطر كشف بعد.'),
    'unmatched' => _('Nothing waiting to be matched.', 'لا شيء بانتظار المطابقة.'),
    'matched' => _('No matched lines yet.', 'لا توجد أسطر مطابقة بعد.'),
    'booked' => _('No booked lines yet.', 'لا توجد أسطر مسجّلة بعد.'),
    'ignored' => _('No ignored lines.', 'لا توجد أسطر مستبعدة.'),
    _ => '',
  };
  String accountLabel(String label) => switch (label) {
    'Cash' => _('Cash', 'النقد'),
    'Bank' => _('Bank', 'البنك'),
    _ => label,
  };
  String accountKind(String kind) => switch (kind) {
    'bank' => _('Bank account', 'حساب بنكي'),
    'cash' => _('Cash', 'النقد'),
    'wallet' => _('Wallet', 'محفظة'),
    _ => _('Bank account', 'حساب بنكي'),
  };
  String windowWords(bool older) => older ? _('Showing two years', 'عرض سنتين') : _('Showing the last 90 days', 'عرض آخر 90 يومًا');
  String get bringInStatement => _('Bring in a statement', 'استورد كشف حساب');
  String get recordTransfer => _('Record a transfer', 'سجّل تحويلًا');
  String get bookBankCharges => _('Book bank charges', 'سجّل الرسوم البنكية');
  String get rules => _('Rules', 'القواعد');
  String get addAccount => _('Add an account', 'أضف حسابًا');
  String get saveAsExcel => _('Save as Excel', 'احفظ بصيغة Excel');
  String get saveAsCsv => _('Save as CSV', 'احفظ بصيغة CSV');
  String get bankEmptyNote => _('Bring in a bank statement and MyCA shows it next to your books.', 'استورد كشف حساب بنكي وسيعرضه MyCA بجانب دفاترك.');
  String showOlder(bool older) => older ? _('Show recent', 'اعرض الأحدث') : _('Show older', 'اعرض الأقدم');
  String inBooksNotOnStatement(bool noLines) => noLines ? _('In the books, not on a statement yet', 'في الدفاتر، وليس في أي كشف بعد') : _('In the books, not on the statement', 'في الدفاتر، وليس في الكشف');
  String statementBalanceOn(String on) => on.isEmpty ? _('Statement balance', 'رصيد الكشف') : _t('Statement balance on {date}', {'date': longDate(on)}, 'رصيد الكشف في ${longDate(on)}');
  String get inTheBooks => _('In the books', 'في الدفاتر');
  String get difference => _('Difference', 'الفرق');
  String bankStatus(String status) => switch (status) {
    'unmatched' => _('Not matched yet', 'غير مطابق بعد'),
    'matched' => _('Matched', 'مطابق'),
    'booked' => _('Booked', 'مسجّل'),
    'ignored' => _('Ignored', 'مستبعد'),
    _ => status,
  };
  String _side(bool isIn, num moneyIn, num moneyOut) => isIn
      ? _t('in {amount}', {'amount': format.rupees(moneyIn)}, 'وارد ${format.rupees(moneyIn)}')
      : _t('out {amount}', {'amount': format.rupees(moneyOut)}, 'صادر ${format.rupees(moneyOut)}');
  bool get _english => !ar && india == 'en';
  String bankLineTitle(BankLine line) => !_english && line.narration.trim().isEmpty && line.refNo.isEmpty ? _('Statement line', 'سطر كشف') : line.title;
  String bankLineSubtitle(BankLine line) => _english ? line.subtitle : '${longDate(line.date)} · ${_side(line.isIn, line.moneyIn, line.moneyOut)} · ${bankStatus(line.status)}';
  String bankLineDetail(BankLine line) => _english ? line.detailWords : [longDate(line.date), _side(line.isIn, line.moneyIn, line.moneyOut), if (line.refNo.isNotEmpty) _t('ref {ref}', {'ref': line.refNo}, 'مرجع ${line.refNo}')].join(' · ');
  String _docKind(String docKind) => switch (docKind) {
    'receipt' => _('Receipt', 'تحصيل'),
    'payment' => _('Payment', 'دفعة'),
    'expense' => _('Expense', 'مصروف'),
    'settlement' => _('Payout', 'تسوية'),
    'transfer' => _('Transfer', 'تحويل'),
    'salary' => _('Salary', 'راتب'),
    'gst' => _('GST payment', 'دفعة ضريبة'),
    _ => _('Entry', 'قيد'),
  };
  String bankBooksTitle(BankBooksRow row) => _english ? row.title : [_docKind(row.docKind), if (row.docId.isNotEmpty) row.docId, if (row.party.isNotEmpty) '· ${row.party}'].join(' ');
  String bankBooksSubtitle(BankBooksRow row) => _english ? row.subtitle : '${longDate(row.date)} · ${_side(row.moneyIn > 0, row.moneyIn, row.moneyOut)}';
  String statementBalanceWords(BankTotals totals) => !_english && totals.statementBalance == null ? _('No statement yet', 'لا كشف بعد') : totals.statementBalanceWords;
  String unmatchedWords(BankTotals totals) {
    if (_english) return totals.unmatchedWords;
    if (totals.unmatched > 0) return _t('{n} not matched yet', {'n': totals.unmatched}, 'غير مطابق: ${totals.unmatched}');
    return totals.lines == 0 ? _('Nothing to match yet', 'لا شيء للمطابقة بعد') : _('All matched', 'كلها مطابقة');
  }
  String bankMatchWords(BankMatch match) {
    if (_english) return match.words;
    final by = match.ruleId.isEmpty ? '' : ' بالقاعدة ${match.ruleId}';
    final ruled = match.ruleId.isNotEmpty;
    final parts = {'id': match.id, 'rule': match.ruleId};
    return switch (match.kind) {
      'books' => _t('Already in the books: {id}', parts, 'موجود في الدفاتر: ${match.id}'),
      'receipt' => ruled ? _t('Receipt against {id} by rule {rule}', parts, 'تحصيل مقابل ${match.id}$by') : _t('Receipt against {id}', parts, 'تحصيل مقابل ${match.id}'),
      'payment' => ruled ? _t('Payment against {id} by rule {rule}', parts, 'دفعة مقابل ${match.id}$by') : _t('Payment against {id}', parts, 'دفعة مقابل ${match.id}'),
      'expense' => ruled ? _t('Expense {id} by rule {rule}', parts, 'مصروف ${match.id}$by') : _t('Expense {id}', parts, 'مصروف ${match.id}'),
      'charge' => (ruled ? _t('Bank charge {id} by rule {rule}', parts, 'رسوم بنكية ${match.id}$by') : _t('Bank charge {id}', parts, 'رسوم بنكية ${match.id}')).replaceAll('  ', ' ').trim(),
      'interest' => ruled ? _t('Interest earned by rule {rule}', parts, 'فائدة مكتسبة$by') : interestEarned,
      'transfer' => ruled ? _t('Transfer {id} by rule {rule}', parts, 'تحويل ${match.id}$by') : _t('Transfer {id}', parts, 'تحويل ${match.id}'),
      'auto' => _('Posted to a guessed head', 'سُجّل تحت بند مُقدَّر'),
      'ignore' => match.note.isNotEmpty
          ? _t('Ignored: {note}', {'note': match.note}, 'مستبعد: ${match.note}')
          : ruled
          ? _t('Ignored by rule {rule}', parts, 'مستبعد$by')
          : _('Ignored', 'مستبعد'),
      _ => match.kind,
    };
  }
  String bankSuggestionWords(BankSuggestion suggestion) {
    if (_english) return suggestion.words;
    final party = suggestion.partyName;
    return switch (suggestion.kind) {
      'books' => suggestion.date.isEmpty
          ? _t('Already in the books: {kind} {id}', {'kind': _docKind(suggestion.docKind), 'id': suggestion.docId}, 'موجود في الدفاتر: ${_docKind(suggestion.docKind)} ${suggestion.docId}')
          : _t('Already in the books: {kind} {id} on {date}', {'kind': _docKind(suggestion.docKind), 'id': suggestion.docId, 'date': longDate(suggestion.date)}, 'موجود في الدفاتر: ${_docKind(suggestion.docKind)} ${suggestion.docId} في ${longDate(suggestion.date)}'),
      'receipt' => suggestion.invoiceIds.isEmpty
          ? _t('Receipt from {party}', {'party': party}, 'تحصيل من $party')
          : _t('Receipt {ids} from {party}', {'ids': suggestion.invoiceIds.join(', '), 'party': party}, 'تحصيل ${suggestion.invoiceIds.join('، ')} من $party'),
      'payment' => suggestion.billIds.isEmpty
          ? _t('Payment to {party}', {'party': party}, 'دفعة إلى $party')
          : _t('Payment {ids} to {party}', {'ids': suggestion.billIds.join(', '), 'party': party}, 'دفعة ${suggestion.billIds.join('، ')} إلى $party'),
      'charge' => bankCharge,
      'interest' => interestEarned,
      'transfer' => _('Transfer to another account', 'تحويل إلى حساب آخر'),
      _ => suggestion.why.isEmpty ? suggestion.kind : suggestion.why,
    };
  }
  String get runningBalanceOff => _('The running balance does not tie at this line. Check the statement.', 'الرصيد الجاري لا يتطابق عند هذا السطر. راجع الكشف.');
  String get unlink => _('Unlink', 'ألغِ الربط');
  String get postedFromLine => _('It was posted to your books from this line. To change it, reverse that entry the normal way.', 'سُجّل في دفاترك من هذا السطر. لتغييره، اعكس ذلك القيد بالطريقة المعتادة.');
  String get likelyMatches => _('Likely matches', 'مطابقات محتملة');
  String get orRecordAs => _('Or record it as', 'أو سجّله على أنه');
  String get receiptFromCustomer => _('Receipt from a customer…', 'تحصيل من عميل…');
  String get paymentToSupplier => _('Payment to a supplier…', 'دفعة إلى مورّد…');
  String get expenseEllipsis => _('Expense…', 'مصروف…');
  String get bankCharge => _('Bank charge', 'رسوم بنكية');
  String get interestEarned => _('Interest earned', 'فائدة مكتسبة');
  String get transferEllipsis => _('Transfer…', 'تحويل…');
  String get ignore => _('Ignore', 'استبعد');
  String rememberFor(String hint) => hint.isEmpty ? _('Remember this for similar lines', 'تذكّر هذا للأسطر المشابهة') : _t('Remember this for {hint}', {'hint': hint}, 'تذكّر هذا لـ$hint');
  String get leaveLineOut => _('Leave this line out of the books', 'استبعد هذا السطر من الدفاتر');
  String get staysIgnored => _('It stays on the statement as ignored, so the difference still ties.', 'يبقى في الكشف مستبعدًا، فيظل الفرق متطابقًا.');
  String get whyOptional => _('Why (optional)', 'السبب (اختياري)');
  String get whyOptionalHint => _('For example a personal payment, or already in the books by hand', 'مثل دفعة شخصية، أو مسجّل يدويًا في الدفاتر');
  String get ignoreThisLine => _('Ignore this line', 'استبعد هذا السطر');
  String get enterAmountMoved => _('Enter the amount moved.', 'أدخل المبلغ المحوّل.');
  String get pickBothAccounts => _('Pick the account it came from and the account it went to.', 'اختر الحساب المحوّل منه والحساب المحوّل إليه.');
  String get pickTwoAccounts => _('Pick two different accounts.', 'اختر حسابين مختلفين.');
  String get unreadableDate => _('That is not a date I can read. Use the form 2026-11-03.', 'لا يمكن قراءة هذا التاريخ. استخدم الصيغة 2026-11-03.');
  String get transferNote => _('Money moved between your own accounts is recorded once, not as a sale or an expense.', 'يُسجَّل المال المحوّل بين حساباتك مرة واحدة، لا كبيع ولا كمصروف.');
  String get from => _('From', 'من');
  String get to => _('To', 'إلى');
  String get dateHint => _('Year, month and day, like 2026-11-03', 'السنة والشهر واليوم، مثل 2026-11-03');
  String get referenceOptional => _('Reference (optional)', 'المرجع (اختياري)');
  String get referenceHint => _('The UTR or cheque number, if you have it', 'رقم المرجع أو الشيك إن وُجد');
  String transferSaid(String amount, String from, String to) => _t('Transfer {amount} from {from} to {to}', {'amount': amount, 'from': from, 'to': to}, 'تحويل $amount من $from إلى $to');
  String get bookChargesSaid => _('Book the bank charges and interest', 'سجّل الرسوم البنكية والفوائد');
  String removeRuleSaid(String id) => _t('Remove the rule {id}', {'id': id}, 'احذف القاعدة $id');
  String ruleSaid(String words) => _t('Rule: {words}', {'words': words}, 'قاعدة: $words');
  String addAccountSaid(String label) => _t('Add the account {label}', {'label': label}, 'أضف الحساب $label');
  String unlinkSaid(String id) => _t('Unlink {id}', {'id': id}, 'ألغِ ربط $id');
  String bankMatchSaid(String kind, {String party = '', String head = '', String account = '', bool isIn = true, String note = ''}) => switch (kind) {
    'receipt' => _t('Receipt from {party}', {'party': party}, 'تحصيل من $party'),
    'payment' => _t('Payment to {party}', {'party': party}, 'دفعة إلى $party'),
    'expense' => _t('Expense under {head}', {'head': head}, 'مصروف تحت $head'),
    'charge' => bankCharge,
    'interest' => interestEarned,
    'transfer' => isIn ? _t('Transfer from {account}', {'account': account}, 'تحويل من $account') : _t('Transfer to {account}', {'account': account}, 'تحويل إلى $account'),
    'ignore' => note.isEmpty ? ignore : _t('Ignore: {note}', {'note': note}, 'استبعد: $note'),
    _ => kind,
  };
  String get whichHeadIsIt => _('Which head is it?', 'تحت أي بند هو؟');
  String accountFromOrTo(bool isIn) => isIn ? _('Which account did it come from?', 'من أي حساب ورد؟') : _('Which account did it go to?', 'إلى أي حساب ذهب؟');
  String get whichHeadExpense => _('Which head is the expense under?', 'تحت أي بند المصروف؟');
  String get enterNarrationWords => _('Enter the words that appear in the narration.', 'أدخل الكلمات الواردة في وصف العملية.');
  String get sayWhichCustomer => _('Say which customer the money is from.', 'اذكر العميل الذي ورد منه المال.');
  String get sayWhichSupplier => _('Say which supplier the money goes to.', 'اذكر المورّد الذي يذهب إليه المال.');
  String get pickHeadExpense => _('Pick the head for the expense.', 'اختر بند المصروف.');
  String get pickOtherAccount => _('Pick the other account.', 'اختر الحساب الآخر.');
  String get rulesNote => _('A rule books a statement line on its own when the words match. Rules run on every statement you bring in and in the daily run.', 'تسجّل القاعدة سطر الكشف تلقائيًا عند تطابق الكلمات. تعمل القواعد على كل كشف تستورده وفي التشغيل اليومي.');
  String get noRulesYet => _('No rules yet.', 'لا توجد قواعد بعد.');
  String get remove => _('Remove', 'احذف');
  String get addRule => _('Add a rule', 'أضف قاعدة');
  String get when => _('When', 'عندما');
  String get then => _('Then', 'عندئذٍ');
  String get narrationWords => _('Words in the narration', 'كلمات في وصف العملية');
  String get narrationWordsHint => _('For example SHARMA TRADERS or SMS CHARGES', 'مثل SHARMA TRADERS أو SMS CHARGES');
  String get recordItAs => _('Record it as', 'سجّله على أنه');
  String ruleSide(String key) => switch (key) {
    'any' => _('Money in or out', 'مال وارد أو صادر'),
    'in' => _('Money in', 'مال وارد'),
    'out' => _('Money out', 'مال صادر'),
    _ => key,
  };
  String ruleKind(String key) => switch (key) {
    'receipt' => _('Receipt from a customer', 'تحصيل من عميل'),
    'payment' => _('Payment to a supplier', 'دفعة إلى مورّد'),
    'expense' => _('Expense', 'مصروف'),
    'charge' => bankCharge,
    'interest' => interestEarned,
    'transfer' => _('Transfer to another account', 'تحويل إلى حساب آخر'),
    'ignore' => ignore,
    _ => key,
  };
  String ruleParty(String kind) => kind == 'receipt' ? customer : kind == 'payment' ? supplier : paidTo;
  String get whyLeftOut => _('Why it is left out (optional)', 'سبب الاستبعاد (اختياري)');
  String ruleWords(BankRule rule) {
    if (_english) return rule.words;
    final low = rule.minAmount;
    final high = rule.maxAmount;
    final when = [
      if (rule.contains.isNotEmpty) _t('containing “{text}”', {'text': rule.contains}, 'تحتوي «${rule.contains}»') else if (rule.pattern.isNotEmpty) _t('matching {pattern}', {'pattern': rule.pattern}, 'تطابق ${rule.pattern}'),
      if (low != null && high != null)
        _t('between {low} and {high}', {'low': format.rupees(low), 'high': format.rupees(high)}, 'بين ${format.rupees(low)} و${format.rupees(high)}')
      else if (low != null)
        _t('of {amount} or more', {'amount': format.rupees(low)}, 'بمبلغ ${format.rupees(low)} أو أكثر')
      else if (high != null)
        _t('up to {amount}', {'amount': format.rupees(high)}, 'حتى ${format.rupees(high)}'),
    ].join(' ');
    final then = switch (rule.kind) {
      'receipt' => _t('a receipt from {party}', {'party': rule.partyName}, 'تحصيل من ${rule.partyName}'),
      'payment' => _t('a payment to {party}', {'party': rule.partyName}, 'دفعة إلى ${rule.partyName}'),
      'expense' => rule.head.isEmpty ? _('an expense', 'مصروف') : _t('an expense under head {head}', {'head': rule.head}, 'مصروف تحت البند ${rule.head}'),
      'charge' => _('a bank charge', 'رسوم بنكية'),
      'interest' => _('interest earned', 'فائدة مكتسبة'),
      'transfer' => rule.otherAccount.isEmpty ? _('a transfer', 'تحويل') : _t('a transfer with account {account}', {'account': rule.otherAccount}, 'تحويل مع الحساب ${rule.otherAccount}'),
      'ignore' => rule.note.isEmpty ? _('ignored', 'مستبعد') : _t('ignored ({note})', {'note': rule.note}, 'مستبعد (${rule.note})'),
      _ => rule.kind,
    };
    final side = ruleSide(rule.side == '' ? 'any' : rule.side);
    return when.isEmpty
        ? _t('{side} is {then}', {'side': side, 'then': then}, '$side ← $then')
        : _t('{side} {when} is {then}', {'side': side, 'when': when, 'then': then}, '$side $when ← $then');
  }
  String ruleHits(BankRule rule) => rule.hits == 1
      ? _t('{n} line so far', {'n': rule.hits}, 'الأسطر حتى الآن: ${rule.hits}')
      : _t('{n} lines so far', {'n': rule.hits}, 'الأسطر حتى الآن: ${rule.hits}');
  String get accountNameNeeded => _('Give the account a name, for example HDFC current.', 'سمِّ الحساب، مثل الحساب الجاري لدى البنك.');
  String get addAccountNote => _('Another bank account, a cash box or a wallet. Money moved between your accounts is then recorded once.', 'حساب بنكي آخر أو صندوق نقد أو محفظة. يُسجَّل المال المحوّل بين حساباتك عندئذٍ مرة واحدة.');
  String get accountNameHint => _('For example HDFC current or Paytm wallet', 'مثل الحساب الجاري أو المحفظة الإلكترونية');
  String get lastFourDigits => _('Last 4 digits of the account number (optional)', 'آخر 4 أرقام من رقم الحساب (اختياري)');

  String get excelNotPrepared => _('The Excel file could not be prepared.', 'تعذّر إعداد ملف Excel.');
  String get excelNotRead => _('The Excel file could not be read.', 'تعذّرت قراءة ملف Excel.');
  String excelSaved(String name) => _t('Saved {name}. Open it in Excel or send it to your accountant.', {'name': name}, 'تم حفظ $name. افتحه في Excel أو أرسله إلى محاسبك.');
  String get notSaved => _('Not saved.', 'لم يُحفظ.');

  String get reportFailed => _('The report could not be run.', 'تعذّر تشغيل التقرير.');
  String deleteReportSaid(String name) => _t('Delete the report {name}', {'name': name}, 'احذف التقرير $name');
  String saveReportSaid(String name) => _t('Save the report {name}', {'name': name}, 'احفظ التقرير $name');
  String wasAmount(String amount) => _t('was {amount}', {'amount': amount}, 'كان $amount');
  String moreRows(int n) => _t('{n} more', {'n': n}, 'المزيد: $n');
  String get excelForFullList => _('Save as Excel for the full list', 'احفظ بصيغة Excel للقائمة الكاملة');
  String get saveAReport => _('Save a report', 'احفظ تقريرًا');
  String get builtIn => _('Built-in', 'مدمجة');
  String get auditTrail => _('Audit trail', 'سجل التدقيق');
  String get auditTrailSubtitle => _('Who changed what and when, with a check for edits to the log', 'من غيّر ماذا ومتى، مع فحص لأي تعديل على السجل');
  String get noSavedReports => _('No saved reports yet. Tap + to save one: sales by customer this month, expenses by head this quarter, and so on.', 'لا توجد تقارير محفوظة بعد. اضغط + لحفظ تقرير: المبيعات حسب العميل هذا الشهر، أو المصروفات حسب البند هذا الربع، وهكذا.');
  String get yourReports => _('Your reports', 'تقاريرك');
  String deleteNamed(String name) => _t('Delete {name}', {'name': name}, 'احذف $name');
  String get what => _('What', 'ماذا');
  String get groupedBy => _('Grouped by', 'مجمّعة حسب');
  String get period => _('Period', 'الفترة');
  String get compareBefore => _('Compare with the period before', 'قارن بالفترة السابقة');
  String reportOption(String option) => switch (option) {
    'sales' => _('sales', 'المبيعات'),
    'purchases' => _('purchases', 'المشتريات'),
    'expenses' => _('expenses', 'المصروفات'),
    'owed' => _('owed', 'المستحق لك'),
    'owing' => _('owing', 'المستحق عليك'),
    'customer' => _('customer', 'العميل'),
    'supplier' => _('supplier', 'المورّد'),
    'head' => _('head', 'البند'),
    'month' => _('month', 'الشهر'),
    'none' => _('none', 'بلا تجميع'),
    'this-month' => _('this month', 'هذا الشهر'),
    'last-month' => _('last month', 'الشهر الماضي'),
    'this-quarter' => _('this quarter', 'هذا الربع'),
    'this-year' => _('this year', 'هذه السنة'),
    'last-year' => _('last year', 'السنة الماضية'),
    _ => ar ? option : option.replaceAll('-', ' '),
  };
  String reportWords(SavedReport report) {
    if (_english) return report.words;
    final metric = reportOption(report.metric);
    final groupBy = reportOption(report.groupBy);
    final period = reportOption(report.period);
    final parts = {'metric': metric, 'groupBy': groupBy, 'period': period};
    final grouped = report.groupBy != 'none' && report.groupBy.isNotEmpty;
    if (grouped && report.compare) return _t('{metric} by {groupBy}, {period}, compared', parts, '$metric حسب $groupBy، $period، مع المقارنة');
    if (grouped) return _t('{metric} by {groupBy}, {period}', parts, '$metric حسب $groupBy، $period');
    if (report.compare) return _t('{metric}, {period}, compared', parts, '$metric، $period، مع المقارنة');
    return ar ? '$metric، $period' : '$metric, $period';
  }
  String reportComparison(ReportResult result) {
    if (_english) return reportComparisonWords(result, format.rupees);
    final compare = result.compare;
    if (compare == null) return '';
    final money = format.rupees(compare.total);
    final pct = compare.changePct;
    if (pct == null) return _t('was {amount} on {label}', {'amount': money, 'label': compare.label}, 'كان $money في ${compare.label}');
    final size = pct.abs().toStringAsFixed(pct.abs() == pct.abs().roundToDouble() ? 0 : 1);
    final parts = {'size': size, 'label': compare.label, 'amount': money};
    if (pct == 0) return _t('unchanged on {label}, {amount}', parts, 'دون تغيير مقارنةً بـ${compare.label}، $money');
    if (pct > 0) return _t('up {size}% on {label}, {amount}', parts, 'ارتفاع $size% مقارنةً بـ${compare.label}، $money');
    return _t('down {size}% on {label}, {amount}', parts, 'انخفاض $size% مقارنةً بـ${compare.label}، $money');
  }

  String auditPeriod(String key) => switch (key) {
    'this-month' => _('This month', 'هذا الشهر'),
    'last-month' => _('Last month', 'الشهر الماضي'),
    'this-quarter' => _('This quarter', 'هذا الربع'),
    'this-year' => _('This year', 'هذه السنة'),
    'changes' => _('Changes', 'التغييرات'),
    'all' => _('Everything', 'كل شيء'),
    _ => key,
  };
  String chainWords(AuditTrail trail) {
    if (_english) return trail.chainWords;
    if (!trail.chainOk) return _t('Log chain broken at {at}', {'at': trail.brokenAt}, 'السلسلة مكسورة عند ${trail.brokenAt}');
    final earlier = trail.unchained;
    final caveats = [
      if (trail.chained > 0) _('the client an event is filed under is not sealed', 'العميل الذي يُسجَّل تحته الحدث غير مختوم'),
      if (earlier == 1) _t('{n} earlier event was recorded before sealing and is not covered', {'n': earlier}, 'أحداث سابقة سُجّلت قبل الختم ولا تشملها السلسلة: $earlier'),
      if (earlier > 1) _t('{n} earlier events were recorded before sealing and are not covered', {'n': earlier}, 'أحداث سابقة سُجّلت قبل الختم ولا تشملها السلسلة: $earlier'),
    ];
    final notes = caveats.map((said) => ar ? '؛ $said' : '; $said').join();
    return trail.chained == 1
        ? _t('Log chain verified ({n} event{notes})', {'n': trail.chained, 'notes': notes}, 'تم التحقق من سلسلة السجل (الأحداث: ${trail.chained}$notes)')
        : _t('Log chain verified ({n} events{notes})', {'n': trail.chained, 'notes': notes}, 'تم التحقق من سلسلة السجل (الأحداث: ${trail.chained}$notes)');
  }
  String get ledgerFailsAccountant => _('The record of entries fails its integrity check. Ask your accountant before recording more.', 'سجل القيود لا يجتاز فحص السلامة. استشر محاسبك قبل تسجيل المزيد.');
  String get nothingChanged => _('Nothing changed in this period.', 'لم يتغيّر شيء في هذه الفترة.');
  String get showMore => _('Show more', 'اعرض المزيد');
  String latestShown(int n) => _t('The latest {n} are shown. Save as Excel for the full list.', {'n': n}, 'يُعرض أحدث $n. احفظ بصيغة Excel للقائمة الكاملة.');
  String get auditIntro => _('Who changed what and when. Every change made through MyCA is listed, and the log is checked for edits.', 'من غيّر ماذا ومتى. يُدرج كل تغيير أُجري عبر MyCA، ويُفحص السجل بحثًا عن أي تعديل.');
  String get auditNotLoaded => _('The audit trail could not be loaded.', 'تعذّر تحميل سجل التدقيق.');

  String statementTitle(String en) => switch (en) {
    'Profit and loss' => _('Profit and loss', 'الأرباح والخسائر'),
    'Balance sheet' => _('Balance sheet', 'الميزانية العمومية'),
    'Cash flow' => _('Cash flow', 'التدفقات النقدية'),
    'Customer statement' => _('Customer statement', 'كشف حساب العميل'),
    'This year' => _('This year', 'هذه السنة'),
    'Last year' => _('Last year', 'السنة الماضية'),
    'This month' => _('This month', 'هذا الشهر'),
    'Last month' => _('Last month', 'الشهر الماضي'),
    'Income' => _('Income', 'الإيرادات'),
    'Expenses' => _('Expenses', 'المصروفات'),
    'Result' => _('Result', 'النتيجة'),
    'Net profit' => _('Net profit', 'صافي الربح'),
    'Net loss' => _('Net loss', 'صافي الخسارة'),
    'Assets' => _('Assets', 'الأصول'),
    'Liabilities' => _('Liabilities', 'الالتزامات'),
    'Equity' => _('Equity', 'حقوق الملكية'),
    'At the start' => _('At the start', 'في البداية'),
    'Cash and bank' => _('Cash and bank', 'النقد والبنك'),
    'From running the business' => _('From running the business', 'من تشغيل النشاط'),
    'Assets and deposits' => _('Assets and deposits', 'الأصول والودائع'),
    'Owner' => _('Owner', 'المالك'),
    'At the end' => _('At the end', 'في النهاية'),
    'Opening' => _('Opening', 'الرصيد الافتتاحي'),
    'Balance at the start' => _('Balance at the start', 'الرصيد في البداية'),
    'Entries' => _('Entries', 'القيود'),
    'Closing' => _('Closing', 'الرصيد الختامي'),
    'Balance at the end' => _('Balance at the end', 'الرصيد في النهاية'),
    'Total' => _('Total', 'الإجمالي'),
    _ => en,
  };
  String get undatedLeftOut => _('Some entries have no date and are left out of this period.', 'بعض القيود بلا تاريخ ومستبعدة من هذه الفترة.');
  String get doesNotBalance => _('It does not balance. Ask your accountant to look at the books.', 'الميزانية غير متوازنة. اطلب من محاسبك مراجعة الدفاتر.');
  String get doesNotTie => _('The movements do not add up to the closing balance. Ask your accountant to look.', 'الحركات لا تساوي الرصيد الختامي. اطلب من محاسبك المراجعة.');
  String inOut(String moneyIn, String moneyOut) => _t('In {moneyIn} · out {moneyOut}', {'moneyIn': moneyIn, 'moneyOut': moneyOut}, 'وارد $moneyIn · صادر $moneyOut');
  String chargedOrPaid(bool charged, String amount) => charged ? _t('charged {amount}', {'amount': amount}, 'مستحق $amount') : _t('paid {amount}', {'amount': amount}, 'مدفوع $amount');
  String get statementFailed => _('This statement could not be prepared.', 'تعذّر إعداد هذه القائمة.');
  String statementSaved(String name) => _t('Saved {name}. Send it to your accountant or the customer.', {'name': name}, 'تم حفظ $name. أرسله إلى محاسبك أو إلى العميل.');
  String get asAtEndOf => _('As at the end of', 'كما في نهاية');
  String get typeCustomerName => _('Type the customer\'s name to see their statement.', 'اكتب اسم العميل لعرض كشف حسابه.');
  String get nothingInPeriod => _('Nothing in this period', 'لا شيء في هذه الفترة');

  String repeatEvery(String key) => switch (key) {
    'week' => _('Every week', 'كل أسبوع'),
    'month' => _('Every month', 'كل شهر'),
    'quarter' => _('Every quarter', 'كل ربع سنة'),
    'half-year' => _('Every six months', 'كل ستة أشهر'),
    'year' => _('Every year', 'كل سنة'),
    _ => key,
  };
  String recurringKind(String kind) => switch (kind) {
    'invoice' => _('Invoice to', 'فاتورة إلى'),
    'bill' => _('Bill from', 'فاتورة مشتريات من'),
    _ => _('Expense', 'مصروف'),
  };
  String get enterAmountEachTime => _('Enter the amount paid each time.', 'أدخل المبلغ المدفوع في كل مرة.');
  String get sayWhatItIsFor => _('Say what it is for, for example broadband or rent.', 'اذكر الغرض منه، مثل الإنترنت أو الإيجار.');
  String recurringExpenseSaid(String amount, String what, String every) => _t('Expense: {amount} for {what}, {every}', {'amount': amount, 'what': what, 'every': every.toLowerCase()}, 'مصروف: $amount لـ$what، $every');
  String recurringSubtitle(String every, {required bool active, required String status, required String next, required int count, required String lastError}) => [
    every,
    if (active) _t('next {next}', {'next': next}, 'التالي $next') else if (status == 'ended') _('ended', 'انتهى') else _('stopped', 'متوقف'),
    if (count > 0) _t('{count} made', {'count': count}, 'المُنشأ: $count'),
    if (lastError.isNotEmpty) _t('last try failed: {lastError}', {'lastError': lastError}, 'فشلت المحاولة الأخيرة: $lastError'),
  ].join(' · ');
  String get recurringIntro => _('Invoices, bills and expenses that repeat are posted on their dates by the daily run, exactly as if you entered them. Set a repeating invoice or bill from the customer or supplier page.', 'تُسجَّل الفواتير والمصروفات المتكررة في مواعيدها عبر التشغيل اليومي، كما لو أدخلتها بنفسك. اضبط فاتورة متكررة من صفحة العميل أو المورّد.');
  String get nothingRepeats => _('Nothing repeats yet.', 'لا شيء يتكرر بعد.');
  String stopSaid(String id) => _t('Stop {id}', {'id': id}, 'أوقف $id');
  String get stop => _('Stop', 'أوقف');
  String get addRepeatingExpense => _('Add a repeating expense', 'أضف مصروفًا متكررًا');
  String get whatItIsFor => _('What it is for', 'الغرض منه');
  String get whatItIsForHint => _('For example broadband, shop rent or software', 'مثل الإنترنت أو إيجار المحل أو البرمجيات');
  String get amountEachTime => _('Amount paid each time', 'المبلغ المدفوع في كل مرة');
  String get repeat => _('Repeat', 'التكرار');
  String get repeatHint => _('From today, paid from the bank', 'من اليوم، يُدفع من البنك');
  String get booksCheckTitle => _('Your books check', 'فحص دفاترك');
  String get checkFailed => _('The check could not be run.', 'تعذّر إجراء الفحص.');
  String asOf(String date) => _t('AS OF {date}', {'date': date}, 'حتى $date');
  String get workedOutNothingChanged => _('Everything below is worked out from your books. Nothing has been changed or filed.', 'كل ما يلي مستخلص من دفاترك. لم يُغيَّر أو يُقدَّم أي شيء.');

  String accountName(String name) => switch (name) {
    'Cash' => _('Cash', 'النقد'),
    'Bank' => _('Bank', 'البنك'),
    'Trade receivables' => _('Trade receivables', 'الذمم المدينة التجارية'),
    'Trade payables' => _('Trade payables', 'الذمم الدائنة التجارية'),
    'VAT input recoverable' => _('VAT input recoverable', 'ضريبة المدخلات القابلة للاسترداد'),
    'VAT output payable' => _('VAT output payable', 'ضريبة المخرجات المستحقة'),
    'Capital' => _('Capital', 'رأس المال'),
    'Profit to date' => _('Profit to date', 'الأرباح حتى تاريخه'),
    'Sales' => _('Sales', 'المبيعات'),
    'Interest income' => _('Interest income', 'إيرادات الفوائد'),
    'Purchases' => _('Purchases', 'المشتريات'),
    'Operating expenses' => _('Operating expenses', 'المصروفات التشغيلية'),
    'Other expenses' => _('Other expenses', 'مصروفات أخرى'),
    'Rent' => _('Rent', 'الإيجار'),
    'Salaries and wages' => _('Salaries and wages', 'الرواتب والأجور'),
    'Electricity and water' => _('Electricity and water', 'الكهرباء والماء'),
    'Telephone and internet' => _('Telephone and internet', 'الهاتف والإنترنت'),
    'Travel and conveyance' => _('Travel and conveyance', 'السفر والتنقل'),
    'Repairs and maintenance' => _('Repairs and maintenance', 'الإصلاح والصيانة'),
    'Professional fees' => _('Professional fees', 'الأتعاب المهنية'),
    'Bank charges' => _('Bank charges', 'الرسوم البنكية'),
    'Office and stationery' => _('Office and stationery', 'المكتب والقرطاسية'),
    'Advertising and marketing' => _('Advertising and marketing', 'الإعلان والتسويق'),
    'Freight and delivery' => _('Freight and delivery', 'الشحن والتوصيل'),
    'Insurance' => _('Insurance', 'التأمين'),
    'Software and subscriptions' => _('Software and subscriptions', 'البرمجيات والاشتراكات'),
    'Packing material' => _('Packing material', 'مواد التغليف'),
    'Food and refreshments' => _('Food and refreshments', 'الطعام والضيافة'),
    'Staff welfare and gifts' => _('Staff welfare and gifts', 'رعاية الموظفين والهدايا'),
    'Club and fitness memberships' => _('Club and fitness memberships', 'عضويات الأندية واللياقة'),
    'Car running and insurance' => _('Car running and insurance', 'تشغيل السيارة وتأمينها'),
    'Personal and household' => _('Personal and household', 'مصروفات شخصية ومنزلية'),
    'Received from customers' => _('Received from customers', 'المحصّل من العملاء'),
    'Other income and cash sales' => _('Other income and cash sales', 'إيرادات أخرى ومبيعات نقدية'),
    'Paid to suppliers' => _('Paid to suppliers', 'المدفوع للمورّدين'),
    'Expenses paid' => _('Expenses paid', 'المصروفات المدفوعة'),
    'Taxes, salaries and other dues' => _('Taxes, salaries and other dues', 'الضرائب والرواتب والمستحقات الأخرى'),
    'Deposits, advances and assets' => _('Deposits, advances and assets', 'الودائع والسلف والأصول'),
    'Owner\'s money in and out' => _('Owner\'s money in and out', 'أموال المالك الداخلة والخارجة'),
    'Usual expenses' => _('Usual expenses', 'المصروفات المعتادة'),
    _ => name,
  };

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
