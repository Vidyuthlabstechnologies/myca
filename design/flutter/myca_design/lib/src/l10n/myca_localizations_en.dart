// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class MycaLocalizationsEn extends MycaLocalizations {
  MycaLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get actionContinue => 'Continue';

  @override
  String get actionSave => 'Save';

  @override
  String get actionCancel => 'Cancel';

  @override
  String get actionApprove => 'Approve';

  @override
  String get actionEdit => 'Edit';

  @override
  String get actionShare => 'Share';

  @override
  String get actionTryAgain => 'Try again';

  @override
  String get actionAskBahi => 'Ask Bahi';

  @override
  String get statusDraft => 'Draft';

  @override
  String get statusDue => 'Due';

  @override
  String get statusOverdue => 'Overdue';

  @override
  String get statusFiled => 'Filed';

  @override
  String get statusPaid => 'Paid';

  @override
  String get statusNeedsReview => 'Needs a look';

  @override
  String get moneyIn => 'Money in';

  @override
  String get moneyOut => 'Money out';

  @override
  String get balance => 'Balance';

  @override
  String get nothingYet => 'Nothing here yet';

  @override
  String get errorOffline =>
      'You\'re offline. We\'ll keep this and send it when you\'re back.';

  @override
  String get errorGeneric =>
      'Something went wrong on our side. Your books are safe.';

  @override
  String get approvalPromise =>
      'Nothing is filed or paid until you approve it.';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName due on $date';
  }

  @override
  String dataStaysIn(String country) {
    return 'Your data stays in $country.';
  }

  @override
  String bahiHello(String name) {
    return 'Hi $name, I\'m Bahi. I keep your books tidy.';
  }
}
