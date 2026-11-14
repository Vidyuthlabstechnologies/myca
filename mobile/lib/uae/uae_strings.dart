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
