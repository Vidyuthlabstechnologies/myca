// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Malay (`ms`).
class MycaLocalizationsMs extends MycaLocalizations {
  MycaLocalizationsMs([String locale = 'ms']) : super(locale);

  @override
  String get actionContinue => 'Teruskan';

  @override
  String get actionSave => 'Simpan';

  @override
  String get actionCancel => 'Batal';

  @override
  String get actionApprove => 'Luluskan';

  @override
  String get actionEdit => 'Sunting';

  @override
  String get actionShare => 'Kongsi';

  @override
  String get actionTryAgain => 'Cuba lagi';

  @override
  String get actionAskBahi => 'Tanya Bahi';

  @override
  String get statusDraft => 'Draf';

  @override
  String get statusDue => 'Perlu dibayar';

  @override
  String get statusOverdue => 'Tertunggak';

  @override
  String get statusFiled => 'Telah difailkan';

  @override
  String get statusPaid => 'Dibayar';

  @override
  String get statusNeedsReview => 'Perlu disemak';

  @override
  String get moneyIn => 'Wang masuk';

  @override
  String get moneyOut => 'Wang keluar';

  @override
  String get balance => 'Baki';

  @override
  String get nothingYet => 'Belum ada apa-apa di sini';

  @override
  String get errorOffline =>
      'Anda di luar talian. Kami simpan ini dan hantar apabila anda kembali.';

  @override
  String get errorGeneric =>
      'Ada masalah di pihak kami. Buku akaun anda selamat.';

  @override
  String get approvalPromise =>
      'Tiada apa yang difailkan atau dibayar tanpa kelulusan anda.';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName perlu dibayar pada $date';
  }

  @override
  String dataStaysIn(String country) {
    return 'Data anda kekal di $country.';
  }

  @override
  String bahiHello(String name) {
    return 'Hai $name, saya Bahi. Saya kemaskan buku akaun anda.';
  }
}
