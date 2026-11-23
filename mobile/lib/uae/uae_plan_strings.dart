import 'uae_strings.dart';

class UaePlan {
  const UaePlan({required this.id, required this.productId, required this.monthlyAed, required this.members});

  final String id;
  final String productId;
  final int monthlyAed;
  final int members;
}

const uaePlans = <UaePlan>[
  UaePlan(id: 'ae-starter', productId: 'myca_ae_starter_monthly', monthlyAed: 299, members: 2),
  UaePlan(id: 'ae-business', productId: 'myca_ae_business_monthly', monthlyAed: 799, members: 5),
  UaePlan(id: 'ae-firm', productId: 'myca_ae_firm_monthly', monthlyAed: 2499, members: 25),
];

String wholeDirhams(int amount) {
  final digits = '$amount';
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

extension UaePlanStrings on UaeStrings {
  String _p(String en, String arabic) => ar ? arabic : en;

  String get planTitle => _p('Plan and billing', 'الباقة والفوترة');
  String get planRowSubtitle => _p('Your plan, trial and prices in AED', 'باقتك وفترتك التجريبية والأسعار بالدرهم');

  String planName(String id) => switch (id) {
    'ae-starter' => _p('Starter', 'المبتدئة'),
    'ae-business' => _p('Business', 'الأعمال'),
    'ae-firm' => _p('Firm', 'المكاتب'),
    _ => id,
  };

  String planPrice(UaePlan plan) => ar ? '\u2066AED\u00a0${wholeDirhams(plan.monthlyAed)}\u2069 شهريًا' : 'AED ${wholeDirhams(plan.monthlyAed)} a month';

  String playPrice(String price) => ar ? '\u2066$price\u2069 شهريًا عبر Google Play' : '$price a month on Google Play';

  String planFor(String id) => switch (id) {
    'ae-starter' => _p('One business, up to 2 people', 'منشأة واحدة، حتى شخصين'),
    'ae-business' => _p('A growing business, up to 5 people', 'منشأة نامية، حتى 5 أشخاص'),
    'ae-firm' => _p('Tax agents and accounting firms, up to 25 people', 'الوكلاء الضريبيون ومكاتب المحاسبة، حتى 25 شخصًا'),
    _ => '',
  };

  List<String> planIncludes(String id) => switch (id) {
    'ae-starter' => [
      _p('Books, tax invoices, bills and credit notes with VAT', 'الدفاتر والفواتير الضريبية وفواتير المشتريات والإشعارات الدائنة مع ضريبة القيمة المضافة'),
      _p('VAT 201 worked out from your books, ready for you or your tax agent to file on EmaraTax', 'إقرار VAT 201 محسوب من دفاترك وجاهز لتقدّمه أنت أو وكيلك الضريبي عبر إمارات تاكس'),
      _p('Corporate tax estimate with Small Business Relief and free zone checks', 'تقدير ضريبة الشركات مع إعفاء الأعمال الصغيرة وفحوص المناطق الحرة'),
      _p('Deadlines and penalty guide', 'المواعيد ودليل الغرامات'),
    ],
    'ae-business' => [
      _p('Everything in Starter', 'كل ما في الباقة المبتدئة'),
      _p('PINT AE e-invoice checks, ready for your Accredited Service Provider', 'فحص الفواتير الإلكترونية وفق PINT AE، جاهزة لمزوّد الخدمة المعتمد'),
      _p('More people in the same books', 'أشخاص أكثر في الدفاتر نفسها'),
      _p('Priority help', 'دعم ذو أولوية'),
    ],
    'ae-firm' => [
      _p('Everything in Business', 'كل ما في باقة الأعمال'),
      _p('Your team works in each client\'s books; the agent files under their own FTA tax agency', 'يعمل فريقك في دفاتر كل عميل؛ ويقدّم الوكيل الإقرارات باسم وكالته الضريبية لدى الهيئة'),
    ],
    _ => const [],
  };

  String get plansNotOpen => _p(
    'Plans open when MyCA UAE launches on Google Play. Until then it runs in sandbox mode and nothing is charged.',
    'تُتاح الباقات عند إطلاق MyCA الإمارات على Google Play. وحتى ذلك الحين يعمل في الوضع التجريبي ولا تُحصَّل أي رسوم.',
  );

  String get planTerms => _p(
    'Each plan starts with a 14-day free trial. Google Play shows the final price in AED, including any VAT, before you pay. Cancel any time in Google Play, Subscriptions; the plan runs to the end of the month you paid for. Google Play handles refunds.',
    'تبدأ كل باقة بفترة تجريبية مجانية مدتها 14 يومًا. يعرض Google Play السعر النهائي بالدرهم، شاملًا أي ضريبة قيمة مضافة، قبل الدفع. يمكنك الإلغاء في أي وقت من Google Play، الاشتراكات؛ وتستمر الباقة حتى نهاية الشهر المدفوع. ويتولى Google Play المبالغ المستردة.',
  );

  String get planNotAgent => _p(
    'MyCA is software, not a registered tax agent. You, or your registered tax agent, file every return on EmaraTax.',
    'MyCA برنامج وليس وكيلًا ضريبيًا مسجّلًا. تقدّم أنت أو وكيلك الضريبي المسجّل كل الإقرارات عبر إمارات تاكس.',
  );

  String subscribe(String plan) => ar ? 'اشترك في باقة $plan' : 'Subscribe to $plan';
  String get currentPlan => _p('Current', 'الحالية');
  String get ownerOnlyPlan => _p('Only the owner can change the plan.', 'يغيّر المالك وحده الباقة.');
  String get purchasePending => _p('Google Play is processing the payment. The plan starts as soon as it clears.', 'يعالج Google Play الدفع. تبدأ الباقة فور اكتماله.');
  String get purchaseFailed => _p('Google Play did not complete the payment. Nothing was charged.', 'لم يُكمل Google Play الدفع. لم يُحصَّل أي مبلغ.');
  String get purchaseOpenFailed => _p('Google Play could not open the payment. Check that you are signed in to the Play Store and try again.', 'تعذّر على Google Play فتح الدفع. تأكّد من تسجيل دخولك إلى متجر Play وحاول مرة أخرى.');
  String get purchaseUnconfirmed => _p('The payment went through but MyCA could not confirm it yet. It will be picked up automatically.', 'تم الدفع لكن MyCA لم يتمكن من تأكيده بعد. سيُعتمد تلقائيًا.');
  String purchaseDone(String plan) => ar ? 'شكرًا لك. باقة ${plan.isEmpty ? '' : '$plan '}مفعّلة لهذه المنشأة.' : 'Thank you. ${plan.isEmpty ? 'The plan' : plan} is on for this business.';

  String trialLeft(int days) => ar
      ? (days == 1 ? 'الفترة التجريبية المجانية: متبقٍ يوم واحد.' : days == 2 ? 'الفترة التجريبية المجانية: متبقٍ يومان.' : days <= 10 ? 'الفترة التجريبية المجانية: متبقٍ $days أيام.' : 'الفترة التجريبية المجانية: متبقٍ $days يومًا.')
      : (days == 1 ? 'Free trial: 1 day left.' : 'Free trial: $days days left.');
  String get trialEnded => _p('The free trial has ended, so the books are read-only: you can still see, ask and export. Choose a plan to post again.', 'انتهت الفترة التجريبية المجانية، فأصبحت الدفاتر للقراءة فقط: يمكنك العرض والسؤال والتصدير. اختر باقة لتسجّل من جديد.');
  String get managePlan => _p('Manage in Google Play', 'الإدارة في Google Play');
}
