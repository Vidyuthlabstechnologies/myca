const N = '([\\d,]+(?:\\.\\d+)?)';
const D = '(\\d{4}-\\d{2}-\\d{2})';

export function langOf(args) {
  return args && args.lang === 'ar' ? 'ar' : 'en';
}

const aed = (value) => `${value} درهم`;
const months = (count) => (Number(count) === 1 ? 'شهر واحد' : Number(count) === 2 ? 'شهرين' : `${count} أشهر`);
const lines = (count) => (Number(count) === 1 ? 'سطر واحد' : `${count} أسطر`);

const TREATMENT_AR = Object.freeze({
  standard: 'خاضع للنسبة الأساسية',
  'zero-rated': 'خاضع للنسبة الصفرية',
  exempt: 'معفى',
  'out-of-scope': 'خارج النطاق',
  'reverse-charge': 'آلية الاحتساب العكسي',
  import: 'استيراد',
  'import-adjustment': 'تعديل على الاستيراد',
});

function list(text) {
  return text.split(/,\s*/).map((item) => TREATMENT_AR[item.trim()] || item.trim()).join('، ');
}

export const ERROR_HINTS = Object.freeze({
  ALREADY_CREDITED: { en: 'This invoice is already fully credited.', ar: 'صدرت إشعارات دائنة بكامل قيمة هذه الفاتورة.' },
  BAD_AMOUNT: { en: 'The amount is not a number above zero.', ar: 'المبلغ ليس رقمًا أكبر من صفر.' },
  BAD_AMOUNTS: { en: 'Some amounts are not numbers, or are negative.', ar: 'بعض المبالغ ليست أرقامًا أو أنها سالبة.' },
  BAD_CURRENCY: { en: 'Use the three-letter ISO currency code, for example AED or USD.', ar: 'استخدم رمز العملة المكوّن من ثلاثة أحرف، مثل AED أو USD.' },
  BAD_DATE: { en: 'Write the date as YYYY-MM-DD.', ar: 'اكتب التاريخ بالصيغة YYYY-MM-DD.' },
  BAD_EMIRATE: { en: 'Choose the emirate: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.', ar: 'اختر الإمارة: AUH أو DXB أو SHJ أو AJM أو UAQ أو RAK أو FUJ.' },
  BAD_LINES: { en: 'Fix the lines listed; nothing was posted.', ar: 'صحّح الأسطر المذكورة؛ لم يُسجَّل شيء.' },
  BUSINESS_PROFILE_INCOMPLETE: { en: 'Complete the business profile; nothing was saved.', ar: 'أكمل ملف المنشأة؛ لم يُحفظ شيء.' },
  CREDIT_BEFORE_INVOICE: { en: 'A credit note cannot be dated before its invoice.', ar: 'لا يجوز أن يسبق تاريخ الإشعار الدائن تاريخ فاتورته.' },
  DUPLICATE_ID: { en: 'That number is already used in these books.', ar: 'هذا الرقم مستخدم من قبل في هذه الدفاتر.' },
  EINVOICE_INVALID: { en: 'Fix the fields listed before the e-invoice can be issued.', ar: 'صحّح الحقول المذكورة قبل إصدار الفاتورة الإلكترونية.' },
  EMIRATE_REQUIRED: { en: 'Say which emirate the sale was made from, or save the business profile with its emirate.', ar: 'حدّد الإمارة التي تمت منها عملية البيع، أو احفظ ملف المنشأة مع الإمارة.' },
  EXCHANGE_RATE_REQUIRED: { en: 'A foreign-currency document needs the AED exchange rate.', ar: 'المستند بعملة أجنبية يحتاج إلى سعر الصرف مقابل الدرهم.' },
  INVALID_DATE: { en: 'Write the date as YYYY-MM-DD.', ar: 'اكتب التاريخ بالصيغة YYYY-MM-DD.' },
  INVOICE_CANCELLED: { en: 'This invoice is cancelled.', ar: 'هذه الفاتورة ملغاة.' },
  INVOICE_NOT_FOUND: { en: 'There is no invoice with that number.', ar: 'لا توجد فاتورة بهذا الرقم.' },
  LEDGER_REJECT: { en: 'The books did not accept the entry, so nothing was changed.', ar: 'لم تقبل الدفاتر القيد، فلم يتغير شيء.' },
  MORE_THAN_INVOICE: { en: 'The credit note is larger than what is left on the invoice.', ar: 'الإشعار الدائن أكبر من المتبقي في الفاتورة.' },
  NOT_A_UAE_INVOICE: { en: 'That invoice was not made as a UAE invoice.', ar: 'هذه الفاتورة لم تُنشأ كفاتورة إماراتية.' },
  NO_LINES: { en: 'Add at least one line.', ar: 'أضف سطرًا واحدًا على الأقل.' },
  PERIOD_LOCKED: { en: 'That date is in a locked period.', ar: 'هذا التاريخ ضمن فترة مقفلة.' },
  RULE_NOT_IN_FORCE: { en: 'No rule is in force for that date.', ar: 'لا توجد قاعدة سارية في هذا التاريخ.' },
  UNKNOWN_PENALTY: { en: 'Choose vat-late-return, vat-late-payment, ct-late-return or ct-late-payment.', ar: 'اختر نوع الغرامة: تأخر إقرار ضريبة القيمة المضافة أو سدادها، أو تأخر إقرار ضريبة الشركات أو سدادها.' },
  ZERO_AMOUNT: { en: 'The total is zero; add a price.', ar: 'الإجمالي صفر؛ أضف السعر.' },
});

const EXACT = new Map(Object.entries({
  'Not a number.': 'ليس رقمًا.',
  'Cannot be negative.': 'لا يجوز أن يكون سالبًا.',
  'Each line is an object.': 'كل سطر يجب أن يكون عنصرًا مستقلًا.',
  'Write the date as YYYY-MM-DD.': 'اكتب التاريخ بالصيغة YYYY-MM-DD.',
  'The recoverable share is a whole number of basis points from 0 to 10000.': 'الحصة القابلة للاسترداد عدد صحيح من نقاط الأساس بين 0 و10000.',
  'A supply under the domestic reverse charge is accounted for by the buyer; record it as zero VAT out of scope of your boxes and keep the invoice narrative.': 'التوريد الخاضع لآلية الاحتساب العكسي المحلية يحتسبه المشتري؛ سجّله دون ضريبة خارج خاناتك واحتفظ بعبارة الفاتورة.',
  'A standard-rated sale is reported by the emirate of the establishment that made it: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.': 'يُصرَّح عن البيع الخاضع للنسبة الأساسية حسب إمارة المنشأة التي قامت به: AUH أو DXB أو SHJ أو AJM أو UAQ أو RAK أو FUJ.',
  'Only standard-rated sales (box 1) and expenses (box 9) carry an adjustment.': 'التعديلات تخص فقط المبيعات الخاضعة للنسبة الأساسية (الخانة 1) والمصروفات (الخانة 9).',
  'Each line is a supply (a sale) or an expense (a purchase).': 'كل سطر إما توريد (بيع) أو مصروف (شراء).',
  'Box 6 is filled by EmaraTax from customs declarations; check it matches the import VAT shown there.': 'تملأ منصة EmaraTax الخانة 6 من البيانات الجمركية؛ تحقق من مطابقتها لضريبة الاستيراد المعروضة هناك.',
  'Box 14 is a refund position. Choose in box 15 whether to claim it now (a refund request on EmaraTax) or carry it forward.': 'الخانة 14 تمثل رصيدًا مستردًا. اختر في الخانة 15 بين طلب استرداده الآن عبر EmaraTax أو ترحيله.',
  'Fix these lines; nothing was totalled.': 'صحّح هذه الأسطر؛ لم يُحتسب أي إجمالي.',
  'Give the period\'s sales and purchases as a list of lines.': 'أدخل مبيعات الفترة ومشترياتها كقائمة أسطر، أو اختر التعبئة من الدفاتر.',
  'Write the tax period as 2026-01/2026-03, 2026-Q1 or 2026-01 for a monthly period.': 'اكتب الفترة الضريبية بالصيغة 2026-01/2026-03 أو 2026-Q1، أو 2026-01 للفترة الشهرية.',
  'The period ends before it starts.': 'تنتهي الفترة قبل أن تبدأ.',
  'A VAT tax period is at most twelve months.': 'الفترة الضريبية لضريبة القيمة المضافة لا تتجاوز اثني عشر شهرًا.',
  'UAE VAT started on 1 January 2018.': 'بدأ تطبيق ضريبة القيمة المضافة في الإمارات في 1 يناير 2018.',
  'The business or its registered tax agent files this on EmaraTax; MyCA prepares it.': 'تقدّم المنشأة أو وكيلها الضريبي المسجّل هذا الإقرار عبر EmaraTax؛ ويُعدّه MyCA.',
  'Small Business Relief is not in force for this period.': 'إعفاء الأعمال الصغيرة غير سارٍ لهذه الفترة.',
  'Only a UAE resident person can elect Small Business Relief.': 'لا يختار إعفاء الأعمال الصغيرة إلا الشخص المقيم في الدولة.',
  'A Qualifying Free Zone Person cannot elect Small Business Relief.': 'لا يجوز للشخص المؤهل في المنطقة الحرة اختيار إعفاء الأعمال الصغيرة.',
  'Revenue passed AED 3 million in an earlier tax period, so the relief is no longer open.': 'تجاوزت الإيرادات 3 ملايين درهم في فترة ضريبية سابقة، فلم يعد الإعفاء متاحًا.',
  'A member of a multinational group with consolidated revenue of AED 3.15 billion or more cannot elect the relief.': 'لا يجوز لعضو مجموعة متعددة الجنسيات تبلغ إيراداتها المجمعة 3.15 مليار درهم أو أكثر اختيار الإعفاء.',
  'A business split artificially to stay under the cap cannot elect the relief.': 'لا يجوز للأعمال المجزأة اصطناعيًا للبقاء تحت الحد اختيار الإعفاء.',
  'Give the tax period as periodStart and periodEnd dates (YYYY-MM-DD), usually the financial year.': 'أدخل الفترة الضريبية بتاريخي البداية والنهاية (YYYY-MM-DD)، وهي عادةً السنة المالية.',
  'A tax period is twelve months; only a first or changed period may run to eighteen.': 'الفترة الضريبية اثنا عشر شهرًا؛ ويجوز أن تمتد الفترة الأولى أو المعدّلة إلى ثمانية عشر شهرًا.',
  'UAE Corporate Tax applies to tax periods starting on or after 1 June 2023.': 'تطبَّق ضريبة الشركات في الإمارات على الفترات الضريبية التي تبدأ في 1 يونيو 2023 أو بعده.',
  'A loss made in a Small Business Relief period cannot be carried forward. Not electing keeps the loss for later years.': 'لا تُرحَّل الخسارة المتكبدة في فترة إعفاء الأعمال الصغيرة. عدم اختيار الإعفاء يحفظ الخسارة للسنوات اللاحقة.',
  'This business qualifies for Small Business Relief, which would make the tax AED 0. Elect it on the return if it suits (losses of relief years are not carried forward).': 'هذه المنشأة مؤهلة لإعفاء الأعمال الصغيرة، فتصبح الضريبة 0 درهم. اختره في الإقرار إن كان مناسبًا (خسائر سنوات الإعفاء لا تُرحَّل).',
  'Qualifying income is larger than the adjusted profit; it was capped at the adjusted profit.': 'الدخل المؤهل أكبر من الربح المعدّل، فتم حصره في حدود الربح المعدّل.',
  'Brought-forward losses offset at most 75% of taxable income; the rest is carried forward.': 'الخسائر المرحّلة تخصم بحد أقصى 75% من الدخل الخاضع للضريبة، ويُرحَّل الباقي.',
  'A Qualifying Free Zone Person pays 0% on qualifying income and 9% on the rest, without the AED 375,000 nil band. Keep the substance and audited accounts the regime requires.': 'يدفع الشخص المؤهل في المنطقة الحرة 0% على الدخل المؤهل و9% على الباقي، دون شريحة الإعفاء البالغة 375,000 درهم. حافظ على الجوهر الاقتصادي والحسابات المدققة التي يتطلبها النظام.',
  'Foreign tax credit is capped at the UAE tax due; the excess cannot be carried forward or refunded.': 'الخصم الضريبي الأجنبي محدود بالضريبة المستحقة في الدولة؛ ولا يُرحَّل الفائض ولا يُسترد.',
  'Give dueDate and doneOn (the day it was or will be filed or paid) as YYYY-MM-DD.': 'أدخل تاريخ الاستحقاق وتاريخ التقديم أو السداد الفعلي أو المتوقع بالصيغة YYYY-MM-DD.',
  'These penalty amounts apply from 14 April 2026; earlier penalties follow the old schedule.': 'تُطبَّق مبالغ الغرامات هذه اعتبارًا من 14 أبريل 2026؛ وتخضع الغرامات السابقة للجدول القديم.',
  'Not late, so no penalty.': 'لا تأخير، فلا غرامة.',
  'A repeat late VAT return within 24 months is AED 2,000.': 'غرامة تكرار التأخر في تقديم إقرار ضريبة القيمة المضافة خلال 24 شهرًا 2,000 درهم.',
  'A first late VAT return is AED 1,000.': 'غرامة أول تأخر في تقديم إقرار ضريبة القيمة المضافة 1,000 درهم.',
  'Give the unpaid tax in AED.': 'أدخل الضريبة غير المسددة بالدرهم.',
  'No Accredited Service Provider is connected yet, so live e-invoices cannot be sent. Sandbox mode (MYCA_PROVIDER_ENV=test or MYCA_MOCK_MODE=1) checks and records them without sending.': 'لم يُربط بعد أي مزود خدمة معتمد، فلا يمكن إرسال الفواتير الإلكترونية الفعلية. وضع التجربة يتحقق منها ويسجلها دون إرسال.',
  'This number was already issued with different content. Use a new number, or a credit note to correct it.': 'صدر هذا الرقم من قبل بمحتوى مختلف. استخدم رقمًا جديدًا، أو إشعارًا دائنًا للتصحيح.',
  'Sandbox: checked against PINT AE and recorded, not sent to an Accredited Service Provider or the FTA.': 'وضع التجربة: تم التحقق وفق PINT AE والتسجيل، دون إرسال إلى مزود خدمة معتمد أو إلى الهيئة الاتحادية للضرائب.',
  'Enter the 15-digit Tax Registration Number from the FTA certificate.': 'أدخل رقم التسجيل الضريبي المكوّن من 15 رقمًا من شهادة الهيئة الاتحادية للضرائب.',
  'A TRN has digits only.': 'رقم التسجيل الضريبي يتكون من أرقام فقط.',
  'A TRN cannot be all zeros.': 'لا يجوز أن يكون رقم التسجيل الضريبي أصفارًا فقط.',
  'FTA TRNs issued so far start with 100; check the certificate.': 'أرقام التسجيل الضريبي الصادرة حتى الآن تبدأ بـ 100؛ تحقق من الشهادة.',
  'A TIN is the first 10 digits of the TRN.': 'الرقم الضريبي هو أول 10 أرقام من رقم التسجيل الضريبي.',
  'A TIN is 10 digits, the first 10 of the TRN.': 'الرقم الضريبي 10 أرقام، وهي أول 10 أرقام من رقم التسجيل الضريبي.',
  'The TIN must be the first 10 digits of the TRN.': 'يجب أن يكون الرقم الضريبي أول 10 أرقام من رقم التسجيل الضريبي.',
  'Save the business profile first (name, TRN, trade licence, address).': 'احفظ ملف المنشأة أولًا (الاسم، رقم التسجيل الضريبي، الرخصة التجارية، العنوان).',
  'The buyer is required.': 'بيانات المشتري مطلوبة.',
  'The registered legal name is required.': 'الاسم القانوني المسجّل مطلوب.',
  'Use the two-letter ISO country code.': 'استخدم رمز الدولة المكوّن من حرفين.',
  'The first address line is required.': 'السطر الأول من العنوان مطلوب.',
  'The city is required.': 'المدينة مطلوبة.',
  'The emirate is required: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.': 'الإمارة مطلوبة: AUH أو DXB أو SHJ أو AJM أو UAQ أو RAK أو FUJ.',
  'The seller\'s TRN, or its TIN when not VAT registered, is required.': 'رقم التسجيل الضريبي للبائع مطلوب، أو رقمه الضريبي إن لم يكن مسجلًا في ضريبة القيمة المضافة.',
  'The trade licence (or Emirates ID, passport or Cabinet Decision) number is required.': 'رقم الرخصة التجارية مطلوب (أو الهوية الإماراتية أو جواز السفر أو قرار مجلس الوزراء).',
  'The buyer has no TIN, so the invoice goes to the FTA endpoint for buyers not yet on the network. Ask the buyer for its TRN.': 'ليس للمشتري رقم ضريبي، فتُرسل الفاتورة إلى عنوان الهيئة للمشترين غير المنضمين إلى الشبكة بعد. اطلب من المشتري رقم تسجيله الضريبي.',
  'The document is an invoice or a credit-note.': 'المستند إما فاتورة أو إشعار دائن.',
  'Sales to consumers are outside UAE e-invoicing for now. Issue a normal tax invoice (a simplified one up to AED 10,000).': 'المبيعات للمستهلكين خارج نطاق الفوترة الإلكترونية حاليًا. أصدر فاتورة ضريبية عادية (مبسطة حتى 10,000 درهم).',
  'The invoice number is required and must be unique.': 'رقم الفاتورة مطلوب ويجب ألا يتكرر.',
  'Keep the invoice number to 50 characters.': 'لا يتجاوز رقم الفاتورة 50 حرفًا.',
  'Write the issue date as YYYY-MM-DD.': 'اكتب تاريخ الإصدار بالصيغة YYYY-MM-DD.',
  'Write the due date as YYYY-MM-DD.': 'اكتب تاريخ الاستحقاق بالصيغة YYYY-MM-DD.',
  'The payment due date cannot be before the issue date.': 'لا يجوز أن يسبق تاريخ استحقاق الدفع تاريخ الإصدار.',
  'Use the ISO 4217 currency code.': 'استخدم رمز العملة وفق ISO 4217.',
  'A foreign-currency invoice needs the AED exchange rate, because VAT and totals are also shown in AED.': 'الفاتورة بعملة أجنبية تحتاج إلى سعر الصرف مقابل الدرهم، لأن الضريبة والإجماليات تظهر بالدرهم أيضًا.',
  'A credit note names the invoice it corrects.': 'يذكر الإشعار الدائن الفاتورة التي يصححها.',
  'A Peppol endpoint is a four-digit scheme, a colon and the identifier (0235:1234567890).': 'عنوان Peppol يتكون من رمز من أربعة أرقام ونقطتين ثم المعرّف (0235:1234567890).',
  'A tax invoice to a VAT-registered buyer shows the buyer\'s TRN.': 'الفاتورة الضريبية لمشترٍ مسجّل تُظهر رقم تسجيله الضريبي.',
  'At least one line is required.': 'مطلوب سطر واحد على الأقل.',
  'Name the goods or service.': 'اذكر اسم السلعة أو الخدمة.',
  'Give the credited quantity as a positive number.': 'أدخل الكمية المشمولة بالإشعار الدائن كرقم موجب.',
  'Quantity must be more than zero; to reduce an invoice, issue a credit note.': 'يجب أن تكون الكمية أكبر من صفر؛ ولتخفيض فاتورة أصدر إشعارًا دائنًا.',
  'The net unit price is a number of AED or the invoice currency, not negative.': 'صافي سعر الوحدة رقم بالدرهم أو بعملة الفاتورة، وليس سالبًا.',
  'A discount is a positive amount.': 'الخصم مبلغ موجب.',
  'The item type is G (goods), S (services) or B (both).': 'نوع البند: G (سلع) أو S (خدمات) أو B (كلاهما).',
  'A reverse-charge line needs the narrative that the buyer accounts for the VAT, and the type of goods.': 'سطر الاحتساب العكسي يحتاج إلى عبارة أن المشتري يحتسب الضريبة، وإلى نوع السلع.',
  'The discount is larger than the line amount.': 'الخصم أكبر من مبلغ السطر.',
  'Supplies to a buyer outside the UAE are often zero rated (exports); check the standard-rated lines.': 'التوريدات لمشترٍ خارج الدولة تخضع غالبًا للنسبة الصفرية (صادرات)؛ راجع الأسطر الخاضعة للنسبة الأساسية.',
  'The legal name on the trade licence is required.': 'الاسم القانوني كما في الرخصة التجارية مطلوب.',
  'Choose the emirate: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.': 'اختر الإمارة: AUH أو DXB أو SHJ أو AJM أو UAQ أو RAK أو FUJ.',
  'Write the financial year end as MM-DD, for example 12-31.': 'اكتب نهاية السنة المالية بالصيغة MM-DD، مثل 12-31.',
  'Name the free zone (for example DMCC, JAFZA, IFZA).': 'اذكر اسم المنطقة الحرة (مثل DMCC أو JAFZA أو IFZA).',
  'The quantity is a number above zero.': 'الكمية رقم أكبر من صفر.',
  'The price is a number, zero or more.': 'السعر رقم يساوي صفرًا أو أكثر.',
  'The VAT on the bill is a number, zero or more.': 'ضريبة القيمة المضافة في الفاتورة رقم يساوي صفرًا أو أكثر.',
  'The business profile has no TRN yet, so this is not a tax invoice until the TRN is added.': 'لا يحتوي ملف المنشأة على رقم تسجيل ضريبي بعد، فلا تُعد هذه فاتورة ضريبية حتى يضاف الرقم.',
  'A tax invoice above AED 10,000 should carry the buyer\'s details; add the buyer TRN if they are registered.': 'الفاتورة الضريبية التي تزيد على 10,000 درهم تتضمن بيانات المشتري؛ أضف رقم تسجيله الضريبي إن كان مسجلًا.',
  'VAT is recovered only with a tax invoice that shows the supplier\'s TRN; add it.': 'لا تُسترد الضريبة إلا بفاتورة ضريبية تُظهر رقم التسجيل الضريبي للمورد؛ أضفه.',
  'Blocked input VAT (entertainment, private motor vehicles) is booked as cost and not recovered.': 'ضريبة المدخلات المحظورة (الضيافة، السيارات الخاصة) تُسجَّل كتكلفة ولا تُسترد.',
  'Say why the invoice is reduced, for example goods returned or a price agreed lower.': 'اذكر سبب تخفيض الفاتورة، مثل إرجاع البضاعة أو الاتفاق على سعر أقل.',
  'Say which emirate the sale was made from, or save the business profile with its emirate.': 'حدّد الإمارة التي تمت منها عملية البيع، أو احفظ ملف المنشأة مع الإمارة.',
  'VAT return (VAT 201) and payment on EmaraTax': 'إقرار ضريبة القيمة المضافة (VAT 201) والسداد عبر EmaraTax',
  'Corporate Tax return and payment on EmaraTax': 'إقرار ضريبة الشركات والسداد عبر EmaraTax',
  'Appoint an Accredited Service Provider for e-invoicing': 'تعيين مزود خدمة معتمد للفوترة الإلكترونية',
  'Send and receive every B2B and B2G invoice as a PINT AE e-invoice': 'إرسال واستلام كل فاتورة بين الشركات ومع الجهات الحكومية كفاتورة إلكترونية وفق PINT AE',
}));

const PATTERNS = [
  [new RegExp(`^Line (\\d+): VAT of AED ${N} is not 5% of AED ${N} \\(expected AED ${N}\\)\\. The return uses the invoice figure; check it\\.$`), (m) => `السطر ${m[1]}: ضريبة قدرها ${aed(m[2])} لا تساوي 5% من ${aed(m[3])} (المتوقع ${aed(m[4])}). يعتمد الإقرار رقم الفاتورة؛ تحقق منه.`],
  [new RegExp(`^Line (\\d+): VAT of AED ${N} is not 5% of AED ${N}; the bill figure is used\\.$`), (m) => `السطر ${m[1]}: ضريبة قدرها ${aed(m[2])} لا تساوي 5% من ${aed(m[3])}؛ اعتُمد رقم الفاتورة.`],
  [/^This is a (\d+)-month period\. The FTA assigns quarters or months; use another length only if your FTA certificate says so\.$/, (m) => `هذه فترة مدتها ${months(m[1])}. تحدد الهيئة فترات ربع سنوية أو شهرية؛ لا تستخدم مدة أخرى إلا إذا نصت عليها شهادتك.`],
  [/^(\d+) lines? (?:is|are) dated outside (\S+)\. VAT is reported in the period of the tax point; move them if they belong elsewhere\.$/, (m) => `${lines(m[1])} بتاريخ خارج الفترة ${m[2]}. يُصرَّح عن الضريبة في فترة تاريخ التوريد؛ انقلها إن كانت تخص فترة أخرى.`],
  [/^(\d+) out-of-scope or non-recoverable lines? (?:was|were) left out of the boxes\.$/, (m) => `استُبعد ${lines(m[1])} خارج النطاق أو غير قابل للاسترداد من الخانات.`],
  [new RegExp(`^AED ${N} of input VAT is blocked \\(for example entertainment or private motor vehicles\\) and is not recovered\\.$`), (m) => `${aed(m[1])} من ضريبة المدخلات محظورة (مثل الضيافة أو السيارات الخاصة) ولا تُسترد.`],
  [new RegExp(`^Import VAT on your purchase lines \\(AED ${N}\\) differs from the customs figure \\(AED ${N}\\)\\. Box 6 uses the customs figure that EmaraTax fills in; recover only what customs shows\\.$`), (m) => `ضريبة الاستيراد في أسطر مشترياتك (${aed(m[1])}) تختلف عن الرقم الجمركي (${aed(m[2])}). تعتمد الخانة 6 الرقم الجمركي الذي تملؤه EmaraTax؛ استرد فقط ما تُظهره الجمارك.`],
  [new RegExp(`^With annual turnover of AED ${N} the FTA normally assigns (monthly|quarterly) periods\\.$`), (m) => `مع إيرادات سنوية قدرها ${aed(m[1])} تحدد الهيئة عادةً فترات ${m[2] === 'monthly' ? 'شهرية' : 'ربع سنوية'}.`],
  [/^A sale is one of (.+)\.$/, (m) => `البيع أحد الأنواع التالية: ${list(m[1])}.`],
  [/^A purchase is one of (.+)\.$/, (m) => `الشراء أحد الأنواع التالية: ${list(m[1])}.`],
  [/^The VAT treatment is one of (.+)\.$/, (m) => `المعاملة الضريبية إحدى ما يلي: ${list(m[1])}.`],
  [/^The legal registration type is one of (.+)\.$/, (m) => `نوع التسجيل القانوني أحد ما يلي: ${m[1]}.`],
  [/^The tax category is one of (.+)\.$/, (m) => `الفئة الضريبية إحدى ما يلي: ${m[1]}.`],
  [/^Line (\d+): give the reason for (.+) \(for example "Export of services"\)\.$/, (m) => `السطر ${m[1]}: اذكر سبب هذه الفئة (${m[2]})، مثل "تصدير خدمات".`],
  [/^A TRN has 15 digits; this one has (\d+)\.$/, (m) => `رقم التسجيل الضريبي 15 رقمًا؛ وهذا الرقم فيه ${m[1]}.`],
  [new RegExp(`^Taxable supplies are below the voluntary threshold of AED ${N}\\.$`), (m) => `التوريدات الخاضعة للضريبة أقل من حد التسجيل الاختياري البالغ ${aed(m[1])}.`],
  [new RegExp(`^Taxable supplies of the last 12 months passed AED ${N}\\. Apply on EmaraTax within (\\d+) days of passing it\\.$`), (m) => `تجاوزت التوريدات الخاضعة للضريبة في آخر 12 شهرًا ${aed(m[1])}. قدّم الطلب عبر EmaraTax خلال ${m[2]} يومًا من تجاوزه.`],
  [new RegExp(`^Supplies expected in the next 30 days pass AED ${N}\\. Apply on EmaraTax before the end of those 30 days\\.$`), (m) => `التوريدات المتوقعة في الثلاثين يومًا القادمة تتجاوز ${aed(m[1])}. قدّم الطلب عبر EmaraTax قبل انتهاء هذه المدة.`],
  [new RegExp(`^Taxable supplies or expenses pass AED ${N}, so voluntary registration is open; it lets the business recover input VAT\\.$`), (m) => `التوريدات أو المصروفات الخاضعة للضريبة تتجاوز ${aed(m[1])}، فالتسجيل الاختياري متاح؛ ويتيح للمنشأة استرداد ضريبة المدخلات.`],
  [new RegExp(`^Revenue of AED ${N} is above the AED ${N} cap\\.$`), (m) => `الإيرادات البالغة ${aed(m[1])} تتجاوز الحد البالغ ${aed(m[2])}.`],
  [new RegExp(`^The relief covers tax periods ending on or before ${D}\\.$`), (m) => `يشمل الإعفاء الفترات الضريبية المنتهية في ${m[1]} أو قبله.`],
  [new RegExp(`^The relief covers tax periods starting on or after ${D}\\.$`), (m) => `يشمل الإعفاء الفترات الضريبية التي تبدأ في ${m[1]} أو بعده.`],
  [/^Small Business Relief cannot be elected: (.+)$/, (m) => { const rest = sentences(m[1]); return rest === null ? null : `لا يمكن اختيار إعفاء الأعمال الصغيرة: ${rest}`; }],
  [new RegExp(`^Non-qualifying revenue of AED ${N} passes the de minimis limit of AED ${N} \\(5% of revenue or AED 5 million, whichever is lower\\)\\. The business stops being a Qualifying Free Zone Person for this period and the next four, and all income is taxed at the normal rates\\.$`), (m) => `الإيرادات غير المؤهلة البالغة ${aed(m[1])} تتجاوز حد الحد الأدنى البالغ ${aed(m[2])} (5% من الإيرادات أو 5 ملايين درهم، أيهما أقل). تفقد المنشأة صفة الشخص المؤهل في المنطقة الحرة لهذه الفترة والفترات الأربع التالية، ويخضع كل الدخل للنسب العادية.`],
  [/^AED 500 for each of the first (\d+) months?(?: and AED 1,000 for each of the (\d+) after)?\.$/, (m) => `500 درهم عن كل شهر من أول ${months(m[1])}${m[2] ? ` و1,000 درهم عن كل شهر من ${months(m[2])} بعدها` : ''}.`],
  [/^14% a year on the unpaid tax, charged monthly and not compounded, for (\d+) months?\.$/, (m) => `14% سنويًا على الضريبة غير المسددة، تُحتسب شهريًا دون تراكم، لمدة ${months(m[1])}.`],
  [/^(\d+) entr(?:y|ies) in (\S+) were not made as UAE sales or purchases and carry no VAT treatment, so they are left out\. Re-enter them as UAE documents or add them as lines\.$/, (m) => `${m[1]} من القيود في ${m[2]} لم تُسجَّل كمبيعات أو مشتريات إماراتية وليس لها معاملة ضريبية، فاستُبعدت. أعد إدخالها كمستندات إماراتية أو أضفها كأسطر.`],
];

function sentences(text) {
  const parts = String(text).split(/(?<=\.)\s+(?=[A-Z])/);
  const out = [];
  for (const part of parts) {
    const done = translateOne(part);
    if (done === null) return null;
    out.push(done);
  }
  return out.join(' ');
}

function translateOne(text) {
  if (EXACT.has(text)) return EXACT.get(text);
  for (const [pattern, make] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return make(match);
  }
  return null;
}

export function toArabic(text) {
  if (typeof text !== 'string' || !text) return text;
  const whole = translateOne(text);
  if (whole !== null) return whole;
  const split = sentences(text);
  return split === null ? text : split;
}

const TEXT_KEYS = new Set(['why', 'hint', 'what', 'filedBy']);
const LIST_KEYS = new Set(['warnings', 'reasons', 'smallBusinessReliefReasons']);

function walk(value) {
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (TEXT_KEYS.has(key) && typeof inner === 'string') out[key] = toArabic(inner);
    else if (LIST_KEYS.has(key) && Array.isArray(inner)) out[key] = inner.map((item) => (typeof item === 'string' ? toArabic(item) : walk(item)));
    else if (key === 'xml' || key === 'document') out[key] = inner;
    else out[key] = walk(inner);
  }
  return out;
}

export function localise(result, lang) {
  if (!result || typeof result !== 'object') return result;
  const withHint = !result.ok && !result.hint && ERROR_HINTS[result.error] ? { ...result, hint: ERROR_HINTS[result.error][lang] } : result;
  if (lang !== 'ar') return withHint;
  return { ...walk(withHint), lang: 'ar' };
}
