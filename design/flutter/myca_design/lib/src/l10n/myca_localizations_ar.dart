// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class MycaLocalizationsAr extends MycaLocalizations {
  MycaLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get actionContinue => 'متابعة';

  @override
  String get actionSave => 'حفظ';

  @override
  String get actionCancel => 'إلغاء';

  @override
  String get actionApprove => 'موافقة';

  @override
  String get actionEdit => 'تعديل';

  @override
  String get actionShare => 'مشاركة';

  @override
  String get actionTryAgain => 'حاول مرة أخرى';

  @override
  String get actionAskBahi => 'اسأل باهي';

  @override
  String get statusDraft => 'مسودة';

  @override
  String get statusDue => 'مستحق';

  @override
  String get statusOverdue => 'متأخر';

  @override
  String get statusFiled => 'تم التقديم';

  @override
  String get statusPaid => 'مدفوع';

  @override
  String get statusNeedsReview => 'يحتاج إلى مراجعة';

  @override
  String get moneyIn => 'الوارد';

  @override
  String get moneyOut => 'الصادر';

  @override
  String get balance => 'الرصيد';

  @override
  String get nothingYet => 'لا شيء هنا بعد';

  @override
  String get errorOffline => 'أنت غير متصل. سنحتفظ بهذا ونرسله عند عودتك.';

  @override
  String get errorGeneric => 'حدث خطأ من جهتنا. دفاترك في أمان.';

  @override
  String get approvalPromise => 'لا يُقدَّم أو يُدفع أي شيء حتى توافق عليه.';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName مستحق في $date';
  }

  @override
  String dataStaysIn(String country) {
    return 'تبقى بياناتك في $country.';
  }

  @override
  String bahiHello(String name) {
    return 'مرحبًا $name، أنا باهي. أرتّب دفاترك.';
  }
}
