class UaeNoticeSection {
  const UaeNoticeSection(this.heading, this.body);

  final String heading;
  final String body;
}

String uaeNoticeTitle(bool ar) => ar ? 'إشعار الخصوصية لتطبيق MyCA الإمارات' : 'MyCA UAE privacy notice';

List<UaeNoticeSection> uaeNoticeSections(bool ar) => ar ? _arabic : _english;

const _english = [
  UaeNoticeSection('Version', 'Effective date: [date of publication]. Version 1.'),
  UaeNoticeSection(
    'Who we are',
    'MyCA UAE is provided by ML Dynamic Solutions Private Limited, a company registered in India, [registered address] ("MyCA", "we"). [When a UAE entity exists: and by [UAE entity name, licence number, free zone], which contracts with UAE customers.]\n\nContact: [privacy email]. Data Protection Officer: [name or service], [email].',
  ),
  UaeNoticeSection(
    'What MyCA is, and what it is not',
    'MyCA UAE is bookkeeping and tax preparation software for businesses in the UAE. You enter or import your sales, purchases, expenses and bank lines; MyCA keeps your books, prepares your VAT 201 and Corporate Tax figures and checks your invoices for e-invoicing readiness.\n\nMyCA is not a registered tax agent and does not file returns for you. You, or your registered tax agent, review and file on the Federal Tax Authority\'s EmaraTax portal. MyCA never asks for your EmaraTax or UAE Pass password. MyCA does not move or hold money.\n\nE-invoicing: while MyCA runs in sandbox mode, invoices are checked and shown on your device and are not sent to anyone. When we connect to an Accredited Service Provider, we will update this notice and ask you before any invoice is sent.',
  ),
  UaeNoticeSection(
    'Two roles',
    'For your account (your name, email, phone, plan), MyCA is the controller.\n\nFor the contents of your books (your customers\', suppliers\' and employees\' names, Tax Registration Numbers, contact details and amounts), your business is the controller and MyCA processes that data on your business\'s instructions. If one of your customers or staff asks us about their data, we will pass the request to you.',
  ),
  UaeNoticeSection(
    'What we collect and why',
    'Google account name and email, or phone number: to sign you in and show who did what in a business. Basis: contract with you.\n\n'
        'A random device id our server makes at sign-in: to let you see and sign out your devices. Basis: contract; security.\n\n'
        'Your books (invoices, bills, expenses, payroll, bank lines, VAT and Corporate Tax figures, TRN, trade licence details): the service you asked for. Basis: contract; UAE tax record-keeping law.\n\n'
        'Documents you choose to upload (bank statements, bills, photos of bills): to import entries or read a bill into a draft. Basis: contract.\n\n'
        'Messages to the assistant: to do what you ask; recent messages are kept for context. Basis: contract.\n\n'
        'Google Play subscription records: to know which plan you have paid for. Basis: contract.\n\n'
        'Crash reports, only if you turn them on (off by default): to fix crashes. Emails, tokens, TRNs, phone numbers and amounts are removed on your phone before sending. Basis: your consent, which you can withdraw in Settings.\n\n'
        'Marketing emails or WhatsApp messages, only if you opt in: news and tips about MyCA. Basis: your consent, which you can withdraw at any time.\n\n'
        'We do not collect your location, contacts, SMS, call logs, advertising identifiers or anything from other apps. We do not sell your data, run advertising in the app, or use your books to train AI models.',
  ),
  UaeNoticeSection(
    'Automated suggestions',
    'MyCA\'s assistant and bill reader suggest categories and entries. A person always confirms an entry, and you approve every return before you file it. Tax figures are calculated by MyCA\'s rules engine, not by a language model. No decision with legal effect is made about you automatically.',
  ),
  UaeNoticeSection(
    'Who else sees your data',
    'Each is reached only when you use the feature, and only with what that feature needs.\n\n'
        '• People you invite to your business (staff, your accountant, your tax agent) see what their role allows.\n'
        '• Google: to check a Google sign-in and a Google Play subscription.\n'
        '• Our hosting provider, Google Cloud, which stores everything above for us (see "Where your data is kept").\n'
        '• The SMS provider, when phone sign-in is on: your phone number and the sign-in code.\n'
        '• The language model provider, [name, country], when a chat message matches no built-in action or you ask MyCA to read a bill: that text or image only.\n'
        '• The email relay, when you send an email from the app: the message and the addresses.\n'
        '• An Accredited Service Provider for e-invoicing, [name], only after we connect one and you switch it on: the invoice data needed for the Peppol network.\n'
        '• Authorities, only when UAE law requires it and through due process.',
  ),
  UaeNoticeSection(
    'Where your data is kept',
    'Your data is stored by Google Cloud in Doha, Qatar (region me-central1), because Google Cloud has no region in the UAE today. We plan to move UAE data to a data centre in the UAE [target date, when contracted] and will tell you in the app when we do.\n\n'
        'Storing data in Qatar is a transfer outside the UAE. We rely on our contract with Google Cloud, which requires protection at least equal to UAE law (Federal Decree-Law No. 45 of 2021, Article 23), and on the transfer being needed to provide the service you asked for. If the language model provider is outside the UAE and Qatar, the same contract safeguards apply.\n\n'
        'If your business is in the DIFC or ADGM, ask us for our DIFC/ADGM data processing addendum.',
  ),
  UaeNoticeSection(
    'How long we keep it',
    '• Your books are kept while your business is on MyCA.\n'
        '• UAE law expects businesses to keep tax records for at least 5 years after the tax period ends, and 7 years for Corporate Tax and real estate records. When you delete a business, MyCA reminds you of this and offers a full download first. The duty to keep records is your business\'s.\n'
        '• Database backups are kept for 14 days. Crash reports are kept for 90 days.\n'
        '• When you delete your account it disappears from the app at once and you are signed out everywhere; 30 days later your name, phone number, email and Google account link are erased. Signing in again within the 30 days cancels the deletion.',
  ),
  UaeNoticeSection(
    'Your rights',
    'Under Federal Decree-Law No. 45 of 2021 you can ask to:\n\n'
        '• know what we hold about you and how we use it;\n'
        '• get a copy, or have it sent to another provider in a readable format (in the app: Businesses, Download everything);\n'
        '• correct it (most of it you can change yourself in the app);\n'
        '• delete it (in the app: Businesses, Delete my account, or at https://[site]/delete-account);\n'
        '• restrict or stop processing, including any marketing;\n'
        '• withdraw consent you gave, without affecting what was done before.\n\n'
        'Write to [privacy email]. We answer within 30 days. If you are not satisfied, you can complain to the UAE data protection authority (the UAE Data Office or the authority that replaces it).',
  ),
  UaeNoticeSection(
    'Security',
    'Data travels over HTTPS and is encrypted at rest. Access is limited by role and logged in an audit trail. Sign-in codes expire in five minutes. If a breach affects your data, we will tell you and the authority, with what happened and what we are doing.',
  ),
  UaeNoticeSection('Children', 'MyCA UAE is for businesses and people aged 18 and over.'),
  UaeNoticeSection(
    'Changes',
    'When anything material changes, we will show the new version in the app, in English and Arabic, and ask you to accept it before continuing.',
  ),
];

const _arabic = [
  UaeNoticeSection('الإصدار', 'تاريخ السريان: [تاريخ النشر]. الإصدار 1.'),
  UaeNoticeSection(
    'من نحن',
    'يقدّم تطبيق MyCA الإمارات شركة ML Dynamic Solutions Private Limited، وهي شركة مسجّلة في الهند، وعنوانها [العنوان المسجّل] ("MyCA" أو "نحن"). [عند تأسيس كيان في الإمارات: وكذلك [اسم الكيان، رقم الرخصة، المنطقة الحرة]، الذي يتعاقد مع العملاء في الإمارات.]\n\nللتواصل: [بريد الخصوصية]. مسؤول حماية البيانات: [الاسم أو الجهة]، [البريد الإلكتروني].',
  ),
  UaeNoticeSection(
    'ما هو MyCA وما ليس هو',
    'MyCA الإمارات برنامج لمسك الدفاتر وإعداد الضرائب للشركات في دولة الإمارات. تُدخل مبيعاتك ومشترياتك ومصروفاتك وحركات حسابك البنكي أو تستوردها، فيحفظ MyCA دفاترك، ويُعدّ أرقام إقرار ضريبة القيمة المضافة (VAT 201) وضريبة الشركات، ويتحقق من جاهزية فواتيرك للفوترة الإلكترونية.\n\n'
        'MyCA ليس وكيلًا ضريبيًا مسجّلًا ولا يقدّم الإقرارات نيابةً عنك. أنت، أو وكيلك الضريبي المسجّل، تراجع الإقرار وتقدّمه عبر بوابة "إمارات تاكس" التابعة للهيئة الاتحادية للضرائب. لا يطلب MyCA أبدًا كلمة مرور "إمارات تاكس" أو "الهوية الرقمية (UAE Pass)". ولا ينقل MyCA الأموال ولا يحتفظ بها.\n\n'
        'الفوترة الإلكترونية: ما دام MyCA يعمل في الوضع التجريبي، تُفحص الفواتير وتُعرض على جهازك ولا تُرسل إلى أي جهة. وعندما نرتبط بمزوّد خدمة معتمد، سنحدّث هذا الإشعار ونستأذنك قبل إرسال أي فاتورة.',
  ),
  UaeNoticeSection(
    'دوران مختلفان',
    'بالنسبة لحسابك (اسمك وبريدك الإلكتروني وهاتفك وباقتك)، فإن MyCA هو المتحكّم في البيانات.\n\n'
        'أمّا محتوى دفاترك (أسماء عملائك ومورّديك وموظفيك، وأرقام التسجيل الضريبي، وبيانات التواصل، والمبالغ)، فإن منشأتك هي المتحكّم، ويعالج MyCA هذه البيانات وفق تعليمات منشأتك. وإذا سألنا أحد عملائك أو موظفيك عن بياناته، نحيل طلبه إليك.',
  ),
  UaeNoticeSection(
    'ما نجمعه ولماذا',
    'اسم حساب Google وبريده، أو رقم الهاتف: لتسجيل دخولك وبيان من قام بأي إجراء في المنشأة. الأساس القانوني: العقد المبرم معك.\n\n'
        'معرّف عشوائي للجهاز ينشئه خادمنا عند الدخول: لتتمكن من رؤية أجهزتك وتسجيل الخروج منها. الأساس القانوني: العقد؛ الأمان.\n\n'
        'دفاترك (الفواتير، والمشتريات، والمصروفات، والرواتب، والحركات البنكية، وأرقام ضريبة القيمة المضافة وضريبة الشركات، ورقم التسجيل الضريبي، وبيانات الرخصة التجارية): الخدمة التي طلبتها. الأساس القانوني: العقد؛ قانون حفظ السجلات الضريبية في الإمارات.\n\n'
        'المستندات التي تختار رفعها (كشوف الحساب، الفواتير، صور الفواتير): لاستيراد القيود أو قراءة فاتورة وتحويلها إلى مسودة. الأساس القانوني: العقد.\n\n'
        'رسائلك إلى المساعد: لتنفيذ ما تطلبه؛ تُحفظ الرسائل الأخيرة للسياق. الأساس القانوني: العقد.\n\n'
        'سجلات اشتراك Google Play: لمعرفة الباقة التي دفعت ثمنها. الأساس القانوني: العقد.\n\n'
        'تقارير الأعطال، فقط إذا فعّلتها (معطّلة افتراضيًا): لإصلاح الأعطال. تُحذف عناوين البريد والرموز وأرقام التسجيل الضريبي وأرقام الهاتف والمبالغ على هاتفك قبل الإرسال. الأساس القانوني: موافقتك، ويمكنك سحبها من الإعدادات.\n\n'
        'رسائل تسويقية بالبريد أو واتساب، فقط إذا وافقت: أخبار ونصائح عن MyCA. الأساس القانوني: موافقتك، ويمكنك سحبها في أي وقت.\n\n'
        'لا نجمع موقعك أو جهات اتصالك أو رسائلك النصية أو سجل مكالماتك أو معرّفات الإعلانات أو أي شيء من التطبيقات الأخرى. لا نبيع بياناتك، ولا نعرض إعلانات في التطبيق، ولا نستخدم دفاترك لتدريب نماذج الذكاء الاصطناعي.',
  ),
  UaeNoticeSection(
    'الاقتراحات الآلية',
    'يقترح مساعد MyCA وقارئ الفواتير التصنيفات والقيود، ويؤكد شخصٌ كل قيد دائمًا، وتعتمد أنت كل إقرار قبل تقديمه. تُحسب الأرقام الضريبية بواسطة محرّك القواعد في MyCA وليس بنموذج لغوي. لا يُتخذ بشأنك أي قرار ذي أثر قانوني بصورة آلية.',
  ),
  UaeNoticeSection(
    'من يطّلع أيضًا على بياناتك',
    'لا نصل إلى أي جهة إلا عند استخدامك للميزة المعنية، وبالقدر الذي تحتاجه فقط.\n\n'
        '• الأشخاص الذين تدعوهم إلى منشأتك (الموظفون، محاسبك، وكيلك الضريبي) يرون ما تسمح به صلاحياتهم.\n'
        '• Google: للتحقق من تسجيل الدخول عبر Google ومن اشتراك Google Play.\n'
        '• مزوّد الاستضافة، Google Cloud، الذي يحفظ كل ما سبق نيابةً عنّا (انظر "أين تُحفظ بياناتك").\n'
        '• مزوّد الرسائل النصية عند تفعيل الدخول برقم الهاتف: رقم هاتفك ورمز الدخول.\n'
        '• مزوّد النموذج اللغوي، [الاسم، الدولة]، عندما لا تطابق رسالتك أي إجراء مدمج أو تطلب قراءة فاتورة: ذلك النص أو تلك الصورة فقط.\n'
        '• خدمة إرسال البريد، عندما ترسل بريدًا من التطبيق: الرسالة والعناوين.\n'
        '• مزوّد خدمة معتمد للفوترة الإلكترونية، [الاسم]، فقط بعد ربطه وتفعيلك له: بيانات الفاتورة اللازمة لشبكة Peppol.\n'
        '• الجهات الرسمية، فقط عندما يوجب قانون الإمارات ذلك ووفق الإجراءات النظامية.',
  ),
  UaeNoticeSection(
    'أين تُحفظ بياناتك',
    'تُحفظ بياناتك لدى Google Cloud في الدوحة، قطر (المنطقة me-central1)، لأن Google Cloud لا تملك منطقة داخل الإمارات حاليًا. ونعتزم نقل بيانات عملاء الإمارات إلى مركز بيانات داخل الدولة [الموعد المستهدف عند التعاقد]، وسنبلغك داخل التطبيق عند ذلك.\n\n'
        'يُعدّ حفظ البيانات في قطر نقلًا لها خارج الدولة. ونستند في ذلك إلى عقدنا مع Google Cloud الذي يُلزمها بحماية لا تقل عن قانون الإمارات (المرسوم بقانون اتحادي رقم 45 لسنة 2021، المادة 23)، وإلى أن النقل لازم لتقديم الخدمة التي طلبتها. وإذا كان مزوّد النموذج اللغوي خارج الإمارات وقطر، تسري الضمانات التعاقدية نفسها.\n\n'
        'إذا كانت منشأتك في مركز دبي المالي العالمي (DIFC) أو سوق أبوظبي العالمي (ADGM)، اطلب منّا ملحق معالجة البيانات الخاص بهما.',
  ),
  UaeNoticeSection(
    'مدة الاحتفاظ',
    '• تُحفظ دفاترك ما دامت منشأتك مسجّلة على MyCA.\n'
        '• يُلزم قانون الإمارات المنشآت بحفظ السجلات الضريبية خمس سنوات على الأقل بعد انتهاء الفترة الضريبية، وسبع سنوات لسجلات ضريبة الشركات والعقارات. عند حذف منشأة، يذكّرك MyCA بذلك ويعرض عليك تنزيل كل البيانات أولًا. وتقع مسؤولية حفظ السجلات على منشأتك.\n'
        '• تُحفظ النسخ الاحتياطية لقاعدة البيانات 14 يومًا، وتقارير الأعطال 90 يومًا.\n'
        '• عند حذف حسابك يختفي من التطبيق فورًا ويُسجَّل خروجك من كل الأجهزة، وبعد 30 يومًا يُمحى اسمك ورقم هاتفك وبريدك وربط حساب Google نهائيًا. ويلغي تسجيل دخولك خلال هذه المدة طلبَ الحذف.',
  ),
  UaeNoticeSection(
    'حقوقك',
    'بموجب المرسوم بقانون اتحادي رقم 45 لسنة 2021 يحق لك أن تطلب:\n\n'
        '• معرفة ما نحتفظ به عنك وكيف نستخدمه؛\n'
        '• الحصول على نسخة منه، أو نقله إلى مزوّد آخر بصيغة مقروءة (في التطبيق: المنشآت، تنزيل كل البيانات)؛\n'
        '• تصحيحه (ويمكنك تعديل معظمه بنفسك داخل التطبيق)؛\n'
        '• حذفه (في التطبيق: المنشآت، حذف حسابي، أو عبر https://[site]/delete-account)؛\n'
        '• تقييد المعالجة أو إيقافها، بما في ذلك أي تسويق؛\n'
        '• سحب موافقتك، دون أن يمسّ ذلك ما تمّ قبل السحب.\n\n'
        'راسلنا على [بريد الخصوصية]، ونرد خلال 30 يومًا. وإذا لم تكن راضيًا، يمكنك تقديم شكوى إلى الجهة المختصة بحماية البيانات في الإمارات (مكتب الإمارات للبيانات أو الجهة التي تحل محله).',
  ),
  UaeNoticeSection(
    'الأمان',
    'تنتقل البيانات عبر HTTPS وتُحفظ مشفّرة. يُقيَّد الوصول حسب الصلاحيات ويُسجَّل في سجل تدقيق. تنتهي صلاحية رموز الدخول خلال خمس دقائق. وإذا تعرّضت بياناتك لاختراق، نبلغك ونبلغ الجهة المختصة بما حدث وبما نتخذه من إجراءات.',
  ),
  UaeNoticeSection('الأطفال', 'MyCA الإمارات مخصّص للمنشآت وللأشخاص بعمر 18 عامًا فأكثر.'),
  UaeNoticeSection(
    'التغييرات',
    'عند أي تغيير جوهري، نعرض الإصدار الجديد داخل التطبيق باللغتين العربية والإنجليزية، ونطلب موافقتك عليه قبل المتابعة.',
  ),
];
