import '../format.dart' as format;
import '../india/india_strings.dart';
import 'uae_strings.dart';

extension UaeCloudStrings on UaeStrings {
  String _t(String en, String arabic) => ar ? arabic : inLine(india, en);

  String _plural(int n, String one, String many, {required String arOne, required String arTwo, required String arFew, required String arMany}) {
    if (!ar) return n == 1 ? '1 $one' : '$n $many';
    if (n == 1) return arOne;
    if (n == 2) return arTwo;
    if (n >= 3 && n <= 10) return '$n $arFew';
    return '$n $arMany';
  }

  String gulfTime(String timestamp, {bool withTime = false}) {
    final at = DateTime.tryParse(timestamp)?.toUtc().add(const Duration(hours: 4));
    if (at == null) return '';
    final day = longDate(format.isoDate(at));
    if (!withTime) return day;
    final minutes = at.minute.toString().padLeft(2, '0');
    final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
    return ar ? '$day، $hour:$minutes ${at.hour < 12 ? 'ص' : 'م'}' : '$day, $hour:$minutes ${at.hour < 12 ? 'am' : 'pm'}';
  }

  String get keep => _t('Keep', 'أبقِه');
  String get removePerson => _t('Remove', 'أزِل');
  String get leave => _t('Leave', 'غادر');
  String get delete => _t('Delete', 'احذف');
  String get done => _t('Done', 'تم');
  String get copy => _t('Copy', 'انسخ');
  String get copied => _t('Copied', 'تم النسخ');
  String get pleaseWait => _t('Please wait…', 'يرجى الانتظار…');
  String get saving => _t('Saving…', 'جارٍ الحفظ…');
  String get turnOn => _t('Turn on', 'فعّل');
  String get turnOff => _t('Turn off', 'أوقف');
  String get code => _t('Code', 'الرمز');
  String get signIn => _t('Sign in', 'تسجيل الدخول');
  String get open => _t('Open', 'افتح');

  String role(String role) => switch (role) {
    'owner' => _t('Owner', 'المالك'),
    'staff' => _t('Staff', 'موظف'),
    'accountant' => _t('Accountant', 'المحاسب'),
    _ => role,
  };

  String roleWord(String role) => switch (role) {
    'owner' => _t('owner', 'مالك'),
    'staff' => _t('staff', 'موظف'),
    'accountant' => _t('accountant', 'محاسب'),
    _ => role,
  };

  String roleHelp(String role) => switch (role) {
    'staff' => _t('Records sales, bills, payments and expenses.', 'يسجّل المبيعات وفواتير المشتريات والمدفوعات والمصروفات.'),
    'accountant' => _t('Works in the books like staff. For your accountant or registered tax agent.', 'يعمل في الدفاتر مثل الموظف. لمحاسبك أو وكيلك الضريبي المسجّل.'),
    _ => _t('Can do everything, including deleting the business and inviting others.', 'يستطيع فعل كل شيء، بما في ذلك حذف المنشأة ودعوة الآخرين.'),
  };

  String syncTitle(String mode) => switch (mode) {
    'live' => _t('As things happen', 'فور حدوثها'),
    'daily' => _t('Once a day', 'مرة في اليوم'),
    'weekly' => _t('Once a week', 'مرة في الأسبوع'),
    'month_close' => _t('At month end', 'في نهاية الشهر'),
    _ => _t('Only when I share', 'فقط عندما أشارك'),
  };

  String syncHelp(String mode) => switch (mode) {
    'live' => _t('Your accountant sees every entry at once.', 'يرى محاسبك كل قيد فورًا.'),
    'daily' => _t('The books as they stood at midnight.', 'الدفاتر كما كانت عند منتصف الليل.'),
    'weekly' => _t('The books as they stood at midnight on Monday.', 'الدفاتر كما كانت عند منتصف ليل الإثنين.'),
    'month_close' => _t('The books as they stood when the month closed.', 'الدفاتر كما كانت عند إقفال الشهر.'),
    _ => _t('The books as they were when you last pressed Share now.', 'الدفاتر كما كانت عندما ضغطت «شارك الآن» آخر مرة.'),
  };

  String get notSharedYet => _t('Not shared yet.', 'لم تُشارك بعد.');
  String accountantSeesAsOf(String when) => _t('Your accountant sees the books as of $when.', 'يرى محاسبك الدفاتر كما كانت في $when.');
  String get shareNow => _t('Share now', 'شارك الآن');
  String get thisPerson => _t('this person', 'هذا الشخص');
  String get thisPersonTitle => _t('This person', 'هذا الشخص');
  String removeWho(String name) => _t('Remove $name?', 'أتزيل $name؟');
  String get removeBody => _t('They lose access to these books at once. What they recorded stays.', 'يفقد الوصول إلى هذه الدفاتر فورًا، ويبقى ما سجّله.');
  String isRole(String name, String role) => _t('$name is ${roleWord(role)}', '$name بصفة ${roleWord(role)}');
  String get leaveBusiness => _t('Leave this business?', 'أتغادر هذه المنشأة؟');
  String get leaveBody => _t('You lose access to these books at once.', 'تفقد الوصول إلى هذه الدفاتر فورًا.');
  String get inviteSomeone => _t('Invite someone', 'ادعُ شخصًا');
  String get inThisBusiness => _t('In this business', 'في هذه المنشأة');
  String you(String name) => _t('${name.isEmpty ? 'You' : name} (you)', '${name.isEmpty ? 'أنت' : name} (أنت)');
  String get noNameYet => _t('No name yet', 'بلا اسم بعد');
  String get whatAccountantSees => _t('What your accountant sees', 'ما يراه محاسبك');
  String get invitedNotJoined => _t('Invited, not joined yet', 'مدعوون لم ينضموا بعد');
  String numberEnding(String digits) => _t('Number ending $digits', 'رقم ينتهي بـ\u2066$digits\u2069');
  String get inviteSheetNote => _t(
    'They sign in to MyCA with this number and choose to join. No message is sent yet, so tell them.',
    'يسجّل الدخول إلى MyCA بهذا الرقم ثم يختار الانضمام. لا تُرسل أي رسالة بعد، فأخبره بنفسك.',
  );
  String get theirMobile => _t('Their mobile number', 'رقم هاتفه المحمول');
  String get inviting => _t('Inviting…', 'جارٍ الدعوة…');
  String get invite => _t('Invite', 'ادعُ');
  String get uaePrefix => '+971  ';
  String get enterUaeMobile => _t('Enter a UAE mobile number, like 050 123 4567.', 'أدخل رقم هاتف محمول إماراتيًا، مثل \u2066050 123 4567\u2069.');

  String invitedAs(String by, String role) => by.isEmpty
      ? _t('You are invited as ${roleWord(role)}.', 'أنت مدعو بصفة ${roleWord(role)}.')
      : _t('$by invited you as ${roleWord(role)}.', 'دعاك $by بصفة ${roleWord(role)}.');
  String get decline => _t('Decline', 'ارفض');
  String get join => _t('Join', 'انضم');

  String get inviteTitle => _t('Invite', 'الدعوة');
  String get knowAnOwner => _t('Know a business owner who still keeps books by hand?', 'أتعرف صاحب منشأة لا يزال يمسك دفاتره يدويًا؟');
  String get sendYourCode => _t('Send them your code. When they join with it, you see it here.', 'أرسل إليه رمزك. وعندما ينضم به، تراه هنا.');
  String joinedWithCode(int invited, int converted) => _t(
    '$invited joined with your code, $converted of them on a paid plan.',
    'عدد من انضموا برمزك: $invited، منهم $converted على باقة مدفوعة.',
  );
  String firmCredits(int credits) => _t(
    'Each client who joins with your code and pays earns your firm a credit. ${credits == 1 ? '1 credit' : '$credits credits'} waiting for your next renewal.',
    'كل عميل ينضم برمزك ويدفع يكسب مكتبك رصيدًا. الأرصدة التي تنتظر تجديدك القادم: $credits.',
  );
  String get shareYourInvite => _t('Share your invite', 'شارك دعوتك');
  String get wereYouInvited => _t('Were you invited?', 'هل دُعيت؟');
  String get inviteCode => _t('Invite code', 'رمز الدعوة');
  String get inviteCodeHint => _t('8 letters and numbers', '8 أحرف وأرقام');
  String get useThisCode => _t('Use this code', 'استخدم هذا الرمز');
  String get claimThanks => _t('Thank you. The person who invited you will see that you joined.', 'شكرًا لك. سيرى من دعاك أنك انضممت.');
  String get codeCopied => _t('Code copied', 'تم نسخ الرمز');
  String shareInvite(String? link, String code) => _t(
    'I keep my books and VAT in MyCA. Get it at ${link ?? 'MyCA UAE on Google Play'} and use my invite code $code when you sign up.',
    'أمسك دفاتري وضريبة القيمة المضافة في MyCA. حمّله من ${link ?? 'MyCA UAE على Google Play'} واستخدم رمز دعوتي $code عند التسجيل.',
  );

  String get unlockToContinue => _t('Unlock to continue.', 'افتح القفل للمتابعة.');
  String get signOutDevice => _t('Sign out that device?', 'أتسجّل الخروج من ذلك الجهاز؟');
  String get signOutDeviceReason => _t('Sign out that device', 'تسجيل الخروج من ذلك الجهاز');
  String get signOutDeviceBody => _t('It stops working at once. Anyone holding it has to sign in again.', 'يتوقف عن العمل فورًا، وعلى من يحمله أن يسجّل الدخول من جديد.');
  String get turnOffTwoStep => _t('Turn off two-step sign-in?', 'أتوقف التحقق بخطوتين؟');
  String get twoStepIsOff => _t('Two-step sign-in is off.', 'التحقق بخطوتين متوقف.');
  String get makeNewCodes => _t('Make new recovery codes?', 'أتنشئ رموز استرداد جديدة؟');
  String get makeNew => _t('Make new', 'أنشئ رموزًا جديدة');
  String get signedOut => _t('Signed out.', 'تم تسجيل الخروج.');
  String signedOutDevices(int n) => _t(
    'Signed out ${n == 1 ? '1 device' : '$n devices'}.',
    'تم تسجيل الخروج من ${_plural(n, '', '', arOne: 'جهاز واحد', arTwo: 'جهازين', arFew: 'أجهزة', arMany: 'جهازًا')}.',
  );
  String signedInWhen(String day) => _t('Signed in $day', 'سجّل الدخول في $day');
  String lastActiveWhen(String day) => _t('last active $day', 'آخر نشاط في $day');
  String get twoStep => _t('Two-step sign-in', 'التحقق بخطوتين');
  String twoStepOn(int left) => _t(
    'On · $left recovery ${left == 1 ? 'code' : 'codes'} left',
    'مفعّل · ${_plural(left, '', '', arOne: 'متبقٍ رمز استرداد واحد', arTwo: 'متبقٍ رمزا استرداد', arFew: 'رموز استرداد متبقية', arMany: 'رمز استرداد متبقٍ')}',
  );
  String get twoStepOff => _t('Off · ask for an authenticator code at every sign-in', 'متوقف · فعّله ليُطلب رمز من تطبيق المصادقة عند كل تسجيل دخول');
  String get newRecoveryCodes => _t('New recovery codes', 'رموز استرداد جديدة');
  String get replacesCodes => _t('Replaces the ones you have', 'تحلّ محل الرموز التي لديك');
  String get whereSignedIn => _t('Where you are signed in', 'الأجهزة التي سجّلت الدخول منها');
  String get thisPhone => _t('This phone', 'هذا الهاتف');
  String get signOutOthers => _t('Sign out other devices', 'سجّل الخروج من الأجهزة الأخرى');
  String get codeHelper => _t('Code from your authenticator app or a recovery code', 'رمز من تطبيق المصادقة أو رمز استرداد');
  String deviceLabel(String label) => !ar ? label : switch (label) {
    'Android' => 'هاتف أندرويد',
    'iPhone' => 'آيفون',
    'iPad' => 'آيباد',
    _ => label,
  };

  String get turnOnTwoStep => _t('Turn on two-step sign-in', 'فعّل التحقق بخطوتين');
  String get noAuthenticatorApp => _t('No authenticator app could open this. Scan the code or copy the key instead.', 'لم يتمكن أي تطبيق مصادقة من فتح هذا. امسح الرمز أو انسخ المفتاح بدلًا من ذلك.');
  String get typeSixDigits => _t('Type the 6-digit code the app shows.', 'اكتب الرمز المكوّن من 6 أرقام الذي يعرضه التطبيق.');
  String get scanThis => _t(
    'Scan this with Google Authenticator, Authy or any authenticator app, or copy the key into it. Then type the code it shows.',
    'امسح هذا الرمز بتطبيق Google Authenticator أو Authy أو أي تطبيق مصادقة، أو انسخ المفتاح إليه. ثم اكتب الرمز الذي يعرضه.',
  );
  String get qrLabel => _t('QR code for your authenticator app', 'رمز QR لتطبيق المصادقة');
  String get copyKey => _t('Copy key', 'انسخ المفتاح');
  String get openInAuthenticator => _t('Open in authenticator app', 'افتح في تطبيق المصادقة');
  String get codeFromApp => _t('Code from the app', 'الرمز من التطبيق');

  String get recoveryCodes => _t('Recovery codes', 'رموز الاسترداد');
  String get saveRecoveryCodes => _t('Save these recovery codes', 'احفظ رموز الاسترداد هذه');
  String get recoveryCodesNote => _t(
    'Each one signs you in once if you lose your authenticator. Keep them somewhere safe; MyCA cannot show them again.',
    'كل رمز يتيح لك تسجيل الدخول مرة واحدة إذا فقدت تطبيق المصادقة. احفظها في مكان آمن؛ لا يستطيع MyCA عرضها مرة أخرى.',
  );
  String get copyAll => _t('Copy all', 'انسخ الكل');

  String sourceLabel(String source) => source == 'pos' ? _t('Sales from a POS', 'مبيعات من نقطة بيع') : _t('Documents in', 'مستندات واردة');
  String sourceHelp(String source) => source == 'pos'
      ? _t('A billing counter or POS posts each sale straight into the books. No confirmation per sale; you see the day\'s total here.', 'يسجّل جهاز الفوترة أو نقطة البيع كل عملية بيع في الدفاتر مباشرةً، دون تأكيد لكل عملية؛ وترى مجموع اليوم هنا.')
      : _t('A mail inbox or scanner drops bills and statements in. Nothing posts; you get a reminder to read each one.', 'يضع صندوق بريد أو ماسح ضوئي فواتير المشتريات والكشوف هنا. لا يُسجَّل شيء؛ وتصلك تذكرة لقراءة كل مستند.');
  String copiedText(String text) => _t('Copied $text', 'تم نسخ $text');
  String turnOffKey(String label) => _t('Turn off $label?', 'أتوقف $label؟');
  String get turnOffKeyBody => _t('Anything it sends from now on is refused. What it already recorded stays in the books.', 'يُرفض كل ما يرسله من الآن. ويبقى ما سجّله في الدفاتر.');
  String get connectSomething => _t('Connect something', 'اربط نظامًا');
  String get connectionsIntro => _t(
    'Other systems that put entries or documents into these books on their own. Each gets its own key; turn it off here any time.',
    'أنظمة أخرى تضيف قيودًا أو مستندات إلى هذه الدفاتر من تلقاء نفسها. لكل نظام مفتاحه الخاص، ويمكنك إيقافه من هنا في أي وقت.',
  );
  String get nothingConnected => _t('Nothing is connected yet.', 'لا يوجد أي نظام مرتبط بعد.');
  String get connected => _t('Connected', 'مرتبطة');
  String get turnedOff => _t('Turned off', 'متوقفة');
  String get off => _t('Off', 'متوقف');
  String posToday(int count, String total) => _t(
    'Today: ${count == 1 ? '1 sale' : '$count sales'}, $total',
    'اليوم: ${_plural(count, '', '', arOne: 'عملية بيع واحدة', arTwo: 'عمليتا بيع', arFew: 'عمليات بيع', arMany: 'عملية بيع')}، $total',
  );
  String forwardBillsTo(String email) => _t('Forward bills to $email', 'أعد توجيه الفواتير إلى $email');
  String get nameTheSystem => _t('Name the system, for example "Counter till".', 'سمِّ النظام، مثل «صندوق البيع».');
  String get whatIsIt => _t('What is it?', 'ما هو؟');
  String get whatIsItHint => _t('Counter till, Mail inbox', 'صندوق البيع، صندوق البريد');
  String get createKey => _t('Create key', 'أنشئ مفتاحًا');
  String isConnected(String label) => _t('$label is connected', 'تم ربط $label');
  String get giveKeyOnce => _t(
    'Give this key to the system once. It is shown only now; if it is lost, turn this connection off and make a new one.',
    'أعطِ هذا المفتاح للنظام مرة واحدة. لا يظهر إلا الآن؛ وإذا ضاع، أوقف هذا الربط وأنشئ ربطًا جديدًا.',
  );
  String get orForwardBills => _t('Or forward bills by mail to this address; it stays on the Connections list.', 'أو أعد توجيه الفواتير بالبريد إلى هذا العنوان؛ ويبقى في قائمة الاتصالات.');

  String aboutWhere(String kind, String detail) => switch (kind) {
    'none' => _t('server not reached', 'تعذّر الوصول إلى الخادم'),
    'test' => _t('test environment ($detail)', 'بيئة الاختبار ($detail)'),
    'sandbox' => _t('sandbox mode ($detail)', 'الوضع التجريبي ($detail)'),
    _ => _t('live service', 'الخدمة الفعلية'),
  };
  String deleteWho(String name) => _t('Delete $name?', 'أتحذف $name؟');
  String get deleteBusinessBody => _t(
    'Its books, documents and members go with it. Backups are kept for fourteen days, after which it cannot be recovered. UAE law expects the business to keep its tax records for at least five years, so download everything first.',
    'تُحذف معها دفاترها ومستنداتها وأعضاؤها. تُحفظ النسخ الاحتياطية أربعة عشر يومًا، ولا يمكن استعادتها بعد ذلك. يُلزم قانون الإمارات المنشأة بحفظ سجلاتها الضريبية خمس سنوات على الأقل، فنزّل كل البيانات أولًا.',
  );
  String savedExport(String file) => _t('Saved $file: your books, every uploaded file, members, connections and the audit trail.', 'تم حفظ $file: دفاترك، وكل ملف رفعته، والأعضاء، والاتصالات، وسجل التدقيق.');
  String get notAnExport => _t('That file is not a MyCA export or backup.', 'هذا الملف ليس تصديرًا أو نسخة احتياطية من MyCA.');
  String replaceWith(String name, String file) => _t('Replace $name with $file?', 'أتستبدل $name بالملف $file؟');
  String replaceBody(int invoices) => _t(
    'The books on MyCA become the ones in this file (${invoices == 1 ? '1 invoice' : '$invoices invoices'}). What is on MyCA now is kept in the audit trail and the fourteen-day backups, but the screens will show the file.',
    'تصبح الدفاتر على MyCA هي التي في هذا الملف (عدد الفواتير: $invoices). ويُحفظ ما على MyCA الآن في سجل التدقيق والنسخ الاحتياطية لأربعة عشر يومًا، لكن الشاشات ستعرض الملف.',
  );
  String get replace => _t('Replace', 'استبدل');
  String replacedFrom(String file, Object? invoices, Object? documents) => invoices == null
      ? _t('Replaced from $file: done.', 'تم الاستبدال من $file.')
      : _t('Replaced from $file: $invoices invoices, $documents documents.', 'تم الاستبدال من $file: الفواتير $invoices، والمستندات $documents.');
  String get deleteAccountTitle => _t('Delete your account?', 'أتحذف حسابك؟');
  String get deleteAccountBody => _t(
    'You are signed out everywhere. Your name, number, email and Google link are erased after 30 days; signing in again before then cancels it. A business where you are the only owner is deleted with you; one with another owner stays with them.',
    'يُسجَّل خروجك من كل الأجهزة. ويُمحى اسمك ورقمك وبريدك وربط حساب Google بعد 30 يومًا، ويلغي تسجيل دخولك قبل ذلك الحذف. تُحذف معك كل منشأة أنت مالكها الوحيد، وتبقى المنشأة التي لها مالك آخر معه.',
  );
  String get deleteAccount => _t('Delete account', 'احذف الحساب');
  String get invitations => _t('Invitations', 'الدعوات');
  String get businesses => _t('Businesses', 'المنشآت');
  String demoRole(String who) => _t('${role(who)} · Demo business, made-up figures', '${role(who)} · منشأة تجريبية بأرقام غير حقيقية');
  String get openTag => _t('Open', 'مفتوحة');
  String get demoTag => _t('Demo', 'تجريبية');
  String get yourData => _t('Your data', 'بياناتك');
  String downloadEverything(String name) => _t('Download everything about $name', 'نزّل كل ما يخص $name');
  String get downloadEverythingSubtitle => _t('One file with the books, documents, members and audit trail', 'ملف واحد فيه الدفاتر والمستندات والأعضاء وسجل التدقيق');
  String restoreFrom(String name) => _t('Restore $name from a file', 'استعد $name من ملف');
  String get restoreSubtitle => _t('A download from here, or a backup from the Windows app', 'ملف نزّلته من هنا، أو نسخة احتياطية من تطبيق Windows');
  String get leaving => _t('Leaving', 'المغادرة');
  String deleteBusinessTitle(String name) => _t('Delete $name', 'احذف $name');
  String get deleteBusinessSubtitle => _t('Removes its books and documents for everyone', 'يزيل دفاترها ومستنداتها للجميع');
  String get deleteMyAccount => _t('Delete my account', 'احذف حسابي');
  String get deleteMyAccountSubtitle => _t('Signs you out everywhere; businesses you alone own go with it', 'يسجّل خروجك من كل الأجهزة، وتُحذف معه المنشآت التي تملكها وحدك');
  String get privacyAndLegal => _t('Privacy and legal', 'الخصوصية والشؤون القانونية');
  String get yourPrivacyRights => _t('Your privacy rights', 'حقوقك في الخصوصية');
  String get privacyRightsSubtitle => _t('Privacy notice, terms, and requests to see, correct or erase your data', 'إشعار الخصوصية والشروط وطلبات الاطلاع على بياناتك أو تصحيحها أو محوها');
  String get aboutThisApp => _t('About this app', 'عن هذا التطبيق');

  String get rightsIntro => _t(
    'Under Federal Decree-Law No. 45 of 2021 on the protection of personal data. Every request gets a reference number and an answer within 30 days. If you are not satisfied, you can complain to the UAE Data Office.',
    'بموجب المرسوم بقانون اتحادي رقم 45 لسنة 2021 بشأن حماية البيانات الشخصية. يحصل كل طلب على رقم مرجعي ورد خلال 30 يومًا. وإذا لم تكن راضيًا، يمكنك تقديم شكوى إلى مكتب الإمارات للبيانات.',
  );
  String get readTheNotice => _t('Read the privacy notice', 'اقرأ إشعار الخصوصية');
  String get opensInBrowser => _t('Opens in the browser', 'يفتح في المتصفح');
  String legalLink(String key) => switch (key) {
    'terms' => _t('Terms of service', 'شروط الخدمة'),
    'refunds' => _t('Refunds and cancellation', 'الاسترداد والإلغاء'),
    _ => key,
  };
  String get askUs => _t('Ask us', 'اطلب منّا');
  static const privacyKinds = ['access', 'correction', 'erasure', 'withdraw', 'grievance'];
  String privacyKind(String kind) => switch (kind) {
    'access' => _t('See what MyCA holds about me', 'اطّلع على ما يحتفظ به MyCA عني'),
    'correction' => _t('Correct or complete my information', 'صحّح معلوماتي أو أكملها'),
    'erasure' => _t('Erase my information', 'امحُ معلوماتي'),
    'withdraw' => _t('Withdraw my consent', 'اسحب موافقتي'),
    'nominate' => _t('Nominate someone to act for me', 'رشّح من ينوب عني'),
    'grievance' => _t('Make a complaint', 'قدّم شكوى'),
    _ => kind,
  };
  String privacyKindHelp(String kind) => switch (kind) {
    'access' => _t('A summary of your personal data and who it was shared with', 'ملخص لبياناتك الشخصية ومن شوركت معه'),
    'correction' => _t('Tell us what is wrong', 'أخبرنا بما هو غير صحيح'),
    'erasure' => _t('Something you cannot delete yourself in the app', 'ما لا تستطيع حذفه بنفسك في التطبيق'),
    'withdraw' => _t('We stop using your information; your account is closed', 'نتوقف عن استخدام معلوماتك ويُغلق حسابك'),
    'grievance' => _t('Goes to our Data Protection Officer', 'تصل إلى مسؤول حماية البيانات لدينا'),
    _ => '',
  };
  String get whatHappenedLabel => _t('What happened', 'ماذا حدث');
  String get anythingToKnow => _t('Anything we should know (optional)', 'أي شيء يجب أن نعرفه (اختياري)');
  String requestSent(String reference) => _t('Sent. Your reference is $reference. We reply within 30 days.', 'تم الإرسال. رقمك المرجعي $reference. نرد خلال 30 يومًا.');
  String get yourRequests => _t('Your requests', 'طلباتك');
  String get requestsNotLoaded => _t('Your requests could not be loaded.', 'تعذّر تحميل طلباتك.');
  String get noneYet => _t('None yet.', 'لا شيء بعد.');
  String requestStatus(String status, String due) => switch (status) {
    'open' => due.isEmpty ? _t('Open', 'مفتوح') : _t('Open, answer due by $due', 'مفتوح، والرد مستحق بحلول ${longDate(due)}'),
    'answered' => _t('Answered', 'تمت الإجابة'),
    _ => _t('Closed', 'مغلق'),
  };
  String get notTaxAdvice => _t(
    'MyCA is software by ML Dynamic Solutions Private Limited. It is not a registered tax agent and does not give tax or legal advice. You approve every return before it is filed.',
    'MyCA برنامج من شركة ML Dynamic Solutions Private Limited. وهو ليس وكيلًا ضريبيًا مسجّلًا ولا يقدّم استشارات ضريبية أو قانونية. وأنت تعتمد كل إقرار قبل تقديمه.',
  );

  String get privacyNotice => _t('Privacy notice', 'إشعار الخصوصية');
  String get noticeNotLoaded => _t('The privacy notice could not be loaded.', 'تعذّر تحميل إشعار الخصوصية.');
  String get noticeDraft => _t('Draft for legal review.', 'مسودة قيد المراجعة القانونية.');
  String get alsoCrashReports => _t('Also send crash reports', 'أرسل تقارير الأعطال أيضًا');
  String get alsoCrashReportsNote => _t(
    'Off unless you tick it. Only what went wrong in the app, with names, amounts, TRNs and phone numbers removed. You can change this later under Your business.',
    'متوقف ما لم تحدده. ما حدث من خطأ في التطبيق فقط، بعد حذف الأسماء والمبالغ والأرقام الضريبية وأرقام الهواتف. يمكنك تغيير ذلك لاحقًا من «منشأتك».',
  );
  String get eighteenOrOver => _t('I am 18 or over', 'عمري 18 عامًا أو أكثر');
  String get iAgree => _t('I agree', 'أوافق');
  String get notNowSignOut => _t('Not now, sign me out', 'ليس الآن، سجّل خروجي');

  String accountHint({required bool apple, required bool google}) => apple && google
      ? _t('Use your Apple or Google account. No new password to remember.', 'استخدم حسابك في Apple أو Google، دون كلمة مرور جديدة تتذكرها.')
      : apple
          ? _t('Use your Apple account. No new password to remember.', 'استخدم حسابك في Apple، دون كلمة مرور جديدة تتذكرها.')
          : google
              ? _t('Use your Google account. No new password to remember.', 'استخدم حسابك في Google، دون كلمة مرور جديدة تتذكرها.')
              : _t('Use the account your firm gave you. No new password to remember.', 'استخدم الحساب الذي منحته لك جهة عملك، دون كلمة مرور جديدة تتذكرها.');
  String get enterAuthenticatorCode => _t('Enter your authenticator code', 'أدخل رمز تطبيق المصادقة');
  String get enterTheCode => _t('Enter the code', 'أدخل الرمز');
  String get yourMobileNumber => _t('Your mobile number', 'رقم هاتفك المحمول');
  String get authenticatorNote => _t('Open your authenticator app and type the 6-digit code. A recovery code works too.', 'افتح تطبيق المصادقة واكتب الرمز المكوّن من 6 أرقام. ويصلح رمز الاسترداد أيضًا.');
  String sentCodeTo(String phone) => _t('We sent a 6-digit code to $phone.', 'أرسلنا رمزًا من 6 أرقام إلى \u2066$phone\u2069.');
  String get weWillText => _t('We will text you a code to sign in. No password to remember.', 'سنرسل إليك رمزًا في رسالة نصية لتسجيل الدخول، دون كلمة مرور تتذكرها.');
  String get readPrivacy => _t('Read how MyCA uses your data (privacy policy)', 'اقرأ كيف يستخدم MyCA بياناتك (سياسة الخصوصية)');
  String get continueWithGoogle => _t('Continue with Google', 'المتابعة باستخدام Google');
  String get continueWithApple => _t('Continue with Apple', 'المتابعة باستخدام Apple');
  String firmAccount(String host) => host.isEmpty
      ? _t('Sign in with your firm\'s account', 'سجّل الدخول بحساب جهة عملك')
      : _t('Sign in with your firm\'s account ($host)', 'سجّل الدخول بحساب جهة عملك (\u2066$host\u2069)');
  String get orUseMobile => _t('Or use your mobile number', 'أو استخدم رقم هاتفك المحمول');
  String get signInUnavailable => _t('Sign-in is not available right now. Try again later.', 'تسجيل الدخول غير متاح الآن. حاول لاحقًا.');
  String get mobileNumber => _t('Mobile number', 'رقم الهاتف المحمول');
  String get sendCode => _t('Send code', 'أرسل الرمز');
  String get startOver => _t('Start over', 'ابدأ من جديد');
  String get differentNumber => _t('Use a different number', 'استخدم رقمًا آخر');

  String get welcomeBack => _t('Welcome back', 'مرحبًا بعودتك');
  String get noUsersYet => _t('No users are set up for this business yet.', 'لم يُضف أي مستخدم لهذه المنشأة بعد.');
  String get user => _t('User', 'المستخدم');
  String signingInAs(String name) => _t('Signing in as $name', 'تسجيل الدخول باسم $name');
  String get pin => _t('PIN', 'الرمز السري');
  String get signingIn => _t('Signing in…', 'جارٍ تسجيل الدخول…');
  String pinProblem(String code) => switch (code) {
    'USER_NOT_FOUND' => _t('That user does not exist.', 'هذا المستخدم غير موجود.'),
    'INVALID_PIN' => _t('Wrong PIN. Try again.', 'الرمز السري غير صحيح. حاول مرة أخرى.'),
    'PIN_NOT_SET' => _t('This user has no PIN yet. Set one in MyCA on Windows.', 'ليس لهذا المستخدم رمز سري بعد. اضبطه في MyCA على Windows.'),
    'USER_LOCKED_OUT' => _t('Too many wrong attempts. This user is locked.', 'محاولات خاطئة كثيرة. هذا المستخدم مقفل.'),
    _ => _t('Could not sign in ($code).', 'تعذّر تسجيل الدخول (\u2066$code\u2069).'),
  };

  String serverBanner(bool sandbox) => sandbox
      ? _t('Sandbox mode: nothing is filed with the government yet', 'الوضع التجريبي: لا يُقدَّم أي شيء إلى الجهات الحكومية بعد')
      : _t('Test environment: nothing is filed, paid or sent', 'بيئة الاختبار: لا يُقدَّم أو يُدفع أو يُرسل أي شيء');
  String get outOfReach => _t('MyCA is out of reach', 'تعذّر الوصول إلى MyCA');

  String get lockedTitle => _t('MyCA is locked', 'MyCA مقفل');
  String get lockFailed => _t('That did not work. Try again.', 'لم ينجح ذلك. حاول مرة أخرى.');
  String get lockNote => _t('Use your fingerprint, face or screen lock to open your books.', 'استخدم بصمتك أو وجهك أو قفل الشاشة لفتح دفاترك.');
  String get waiting => _t('Waiting…', 'بانتظار…');
  String get unlock => _t('Unlock', 'افتح القفل');
  String get signOutInstead => _t('Sign out instead', 'سجّل الخروج بدلًا من ذلك');

  String get whatToCallYou => _t('What should we call you?', 'بماذا نناديك؟');
  String get nameNote => _t('People you work with will see this name next to what you record.', 'سيرى من تعمل معهم هذا الاسم بجانب ما تسجّله.');
  String get yourName => _t('Your name', 'اسمك');
  String get enterYourName => _t('Enter your name.', 'أدخل اسمك.');

  String get bringInMoreAe => _t('A bank statement as CSV', 'كشف حساب بنكي بصيغة CSV');
  String get whereFrom => _t('Where is it coming from?', 'من أين تأتي البيانات؟');
  String get whereBooksToday => _t('Where are your books today?', 'أين دفاترك اليوم؟');
  String get previewedFirst => _t('Everything is previewed before it is added, and rows already in your books are skipped.', 'تُعرض كل البيانات قبل إضافتها، وتُتخطى الأسطر الموجودة في دفاترك.');
  String get pickClosest => _t('Pick the closest one. You can bring more in later.', 'اختر الأقرب. ويمكنك استيراد المزيد لاحقًا.');
  String get aboutTheBusiness => _t('Tell us about the business', 'أخبرنا عن المنشأة');
  String get onInvoices => _t('This goes on your invoices and returns.', 'يظهر هذا على فواتيرك وإقراراتك.');
  String notAccepted(String error) => _t('MyCA did not accept that ($error).', 'لم يقبل MyCA ذلك (\u2066$error\u2069).');
  String get openMyBooks => _t('Open my books', 'افتح دفاتري');
  String get skipForNow => _t('Skip for now', 'تخطَّ الآن');
  String get allSet => _t('You are all set', 'كل شيء جاهز');
  String get bringAcross => _t('Bring your books across', 'انقل دفاترك');
  String get bringItIn => _t('Bring it in', 'استورده');
  String get bankStatementCsv => _t('Bank statement (CSV)', 'كشف حساب بنكي (CSV)');
  String get bankStatementHow => _t(
    'Download the statement from your bank as CSV for the months you want. Most UAE banks offer it under Statements or e-Statements.',
    'نزّل كشف الحساب من بنكك بصيغة CSV للأشهر التي تريدها. تتيحه معظم البنوك في الإمارات ضمن «الكشوف» أو «الكشوف الإلكترونية».',
  );
  String migrationTitle(String key) => switch (key) {
    'spreadsheet' => _t('Excel, Google Sheets or a CSV file', 'Excel أو Google Sheets أو ملف CSV'),
    'otherApp' => _t('Another bookkeeping app', 'تطبيق محاسبة آخر'),
    'paper' => _t('Paper, or my accountant has them', 'ورقية، أو لدى محاسبي'),
    _ => _t('Starting fresh', 'بداية جديدة'),
  };
  String migrationSubtitle(String key) => switch (key) {
    'spreadsheet' => _t('Records kept in a spreadsheet', 'سجلات محفوظة في جدول بيانات'),
    'otherApp' => _t('Zoho Books, QuickBooks, Xero, Tally and others', 'Zoho Books وQuickBooks وXero وTally وغيرها'),
    'paper' => _t('Receipts, invoices, or with an accountant or tax agent', 'إيصالات وفواتير، أو لدى محاسب أو وكيل ضريبي'),
    _ => _t('New business, or a clean start', 'منشأة جديدة، أو بداية نظيفة'),
  };
  String migrationPromise(String key) => switch (key) {
    'spreadsheet' => _t('MyCA cannot read a free-form sheet yet. Start from your bank statement, then add sales and bills as you go.', 'لا يستطيع MyCA قراءة جدول حر التنسيق بعد. ابدأ من كشف حسابك البنكي، ثم أضف المبيعات وفواتير المشتريات أولًا بأول.'),
    'otherApp' => _t('MyCA cannot read this app\'s export yet. Start from your bank statement so your money trail is in, then add sales and bills as you go.', 'لا يستطيع MyCA قراءة ملف التصدير من هذا التطبيق بعد. ابدأ من كشف حسابك البنكي ليدخل أثر أموالك، ثم أضف المبيعات وفواتير المشتريات أولًا بأول.'),
    'paper' => _t('Start from your bank statement, then add sales and bills as you go. Keep the paper records: the FTA can ask to see them for five years.', 'ابدأ من كشف حسابك البنكي، ثم أضف المبيعات وفواتير المشتريات أولًا بأول. احتفظ بالسجلات الورقية: يحق للهيئة الاتحادية للضرائب طلب الاطلاع عليها خلال خمس سنوات.'),
    _ => _t('Nothing to bring across. Your first sale or bill starts the books.', 'لا شيء لنقله. تبدأ دفاترك بأول عملية بيع أو فاتورة مشتريات.'),
  };

  String cloudSaid(String message) => !ar || message.isEmpty ? message : switch (message) {
    'Enter a 10-digit Indian mobile number.' => 'أدخل رقم هاتف محمول إماراتيًا، مثل \u2066050 123 4567\u2069.',
    'Too many codes requested. Try again in an hour.' => 'طلبت رموزًا كثيرة. حاول مرة أخرى بعد ساعة.',
    'That code is not right. Check it and try again.' => 'الرمز غير صحيح. تحقّق منه وحاول مرة أخرى.',
    'That code has expired. Ask for a new one.' => 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
    'That code was already used. Ask for a new one.' => 'استُخدم هذا الرمز من قبل. اطلب رمزًا جديدًا.',
    'Too many wrong tries. Ask for a new code.' => 'محاولات خاطئة كثيرة. اطلب رمزًا جديدًا.',
    'This sign-in attempt is over. Tap Start over and sign in again.' => 'انتهت محاولة تسجيل الدخول هذه. اضغط «ابدأ من جديد» وسجّل الدخول مرة أخرى.',
    'That code was already used. Wait for the next one on your authenticator and try again.' => 'استُخدم هذا الرمز من قبل. انتظر الرمز التالي في تطبيق المصادقة وحاول مرة أخرى.',
    'Too many wrong codes. Wait 15 minutes, or sign in again with your authenticator code, then try again.' => 'رموز خاطئة كثيرة. انتظر 15 دقيقة، أو سجّل الدخول مجددًا برمز تطبيق المصادقة، ثم حاول مرة أخرى.',
    'Two-step sign-in is already on.' => 'التحقق بخطوتين مفعّل بالفعل.',
    'Two-step sign-in is off.' => 'التحقق بخطوتين متوقف.',
    'Start the two-step setup again.' => 'ابدأ إعداد التحقق بخطوتين من جديد.',
    'Too many wrong codes. Start the setup again.' => 'رموز خاطئة كثيرة. ابدأ الإعداد من جديد.',
    'That device is already signed out.' => 'سُجّل الخروج من هذا الجهاز بالفعل.',
    'Use Sign out to leave this phone.' => 'استخدم «تسجيل الخروج» لمغادرة هذا الهاتف.',
    'Sign-in by mobile number is not available yet. Continue with Google.' => 'تسجيل الدخول برقم الهاتف غير متاح بعد. تابع باستخدام Google.',
    'Google sign-in is not available yet.' => 'تسجيل الدخول باستخدام Google غير متاح بعد.',
    'Google could not confirm who you are. Try again.' => 'تعذّر على Google التحقق من هويتك. حاول مرة أخرى.',
    'That Google sign-in took too long. Try again.' => 'استغرق تسجيل الدخول باستخدام Google وقتًا طويلًا. حاول مرة أخرى.',
    'MyCA could not reach Google. Try again in a minute.' => 'تعذّر على MyCA الوصول إلى Google. حاول بعد دقيقة.',
    'Read and accept the privacy notice to continue.' => 'اقرأ إشعار الخصوصية ووافق عليه للمتابعة.',
    'The privacy notice has changed. Read the new one and accept it.' => 'تغيّر إشعار الخصوصية. اقرأ الإشعار الجديد ووافق عليه.',
    'Confirm that you are 18 or over to use MyCA.' => 'أكّد أن عمرك 18 عامًا أو أكثر لاستخدام MyCA.',
    'Tell us what went wrong or what should be corrected.' => 'أخبرنا بما حدث من خطأ أو بما يجب تصحيحه.',
    'You already have ten open requests. We will answer those first.' => 'لديك عشرة طلبات مفتوحة بالفعل. سنجيب عنها أولًا.',
    'Only the owner can change this.' => 'المالك وحده يستطيع تغيير ذلك.',
    'Choose staff or accountant.' => 'اختر موظفًا أو محاسبًا.',
    'That person is already in this business.' => 'هذا الشخص موجود في هذه المنشأة بالفعل.',
    'There are too many open invitations. Cancel one first.' => 'الدعوات المفتوحة كثيرة. ألغِ إحداها أولًا.',
    'That invitation is no longer open.' => 'لم تعد هذه الدعوة مفتوحة.',
    'That invitation has expired. Ask to be invited again.' => 'انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة.',
    'That person is no longer in this business.' => 'لم يعد هذا الشخص في هذه المنشأة.',
    'A business must keep at least one owner.' => 'يجب أن يبقى للمنشأة مالك واحد على الأقل.',
    'Enter your name.' => 'أدخل اسمك.',
    'This business is no longer available to you.' => 'لم تعد هذه المنشأة متاحة لك.',
    'Your accountant already sees the books as they change.' => 'يرى محاسبك الدفاتر بالفعل فور تغيّرها.',
    'MyCA is busy for a moment. Try again in a minute.' => 'MyCA مشغول للحظة. حاول بعد دقيقة.',
    'That was a lot of requests in a short time. Wait a minute and try again.' => 'طلبات كثيرة في وقت قصير. انتظر دقيقة وحاول مرة أخرى.',
    'Something went wrong on our side. Try again in a minute.' => 'حدث خطأ من جهتنا. حاول بعد دقيقة.',
    'That file is too large to restore from the app. Your books were not changed.' => 'الملف أكبر من أن يُستعاد من التطبيق. لم تتغير دفاترك.',
    'An invite code has 8 letters and numbers. Check it and try again.' => 'يتكوّن رمز الدعوة من 8 أحرف وأرقام. تحقّق منه وحاول مرة أخرى.',
    'MyCA does not know that code. Check it with the person who sent it.' => 'لا يعرف MyCA هذا الرمز. تحقّق منه مع من أرسله.',
    'That is your own code. Share it with someone else.' => 'هذا رمزك أنت. شاركه مع شخص آخر.',
    'You have already used an invite code.' => 'استخدمت رمز دعوة من قبل.',
    'Invite codes can be used in the first 30 days after you join.' => 'يمكن استخدام رموز الدعوة في أول 30 يومًا بعد انضمامك.',
    'Too many tries. Wait an hour and try again.' => 'محاولات كثيرة. انتظر ساعة وحاول مرة أخرى.',
    'MyCA could not use that code right now. Try again later.' => 'تعذّر على MyCA استخدام هذا الرمز الآن. حاول لاحقًا.',
    _ => _triesLeft(message) ?? (RegExp(r'[؀-ۿ]').hasMatch(message) ? message : 'تعذّر إتمام ذلك. حاول مرة أخرى.'),
  };

  String? _triesLeft(String message) {
    final match = RegExp(r'^That code is not right\. (\d+) tr(y|ies) left\.$').firstMatch(message);
    if (match == null) return null;
    final left = int.parse(match.group(1)!);
    return 'الرمز غير صحيح. ${_plural(left, '', '', arOne: 'متبقية محاولة واحدة', arTwo: 'متبقية محاولتان', arFew: 'محاولات متبقية', arMany: 'محاولة متبقية')}.';
  }
}
