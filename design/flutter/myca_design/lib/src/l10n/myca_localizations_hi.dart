// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class MycaLocalizationsHi extends MycaLocalizations {
  MycaLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get actionContinue => 'जारी रखें';

  @override
  String get actionSave => 'सहेजें';

  @override
  String get actionCancel => 'रद्द करें';

  @override
  String get actionApprove => 'स्वीकृत करें';

  @override
  String get actionEdit => 'बदलें';

  @override
  String get actionShare => 'शेयर करें';

  @override
  String get actionTryAgain => 'फिर से कोशिश करें';

  @override
  String get actionAskBahi => 'बही से पूछें';

  @override
  String get statusDraft => 'ड्राफ़्ट';

  @override
  String get statusDue => 'देय';

  @override
  String get statusOverdue => 'बकाया';

  @override
  String get statusFiled => 'फ़ाइल हो गया';

  @override
  String get statusPaid => 'भुगतान हो गया';

  @override
  String get statusNeedsReview => 'देखना ज़रूरी';

  @override
  String get moneyIn => 'आया पैसा';

  @override
  String get moneyOut => 'गया पैसा';

  @override
  String get balance => 'शेष';

  @override
  String get nothingYet => 'अभी यहाँ कुछ नहीं है';

  @override
  String get errorOffline =>
      'आप ऑफ़लाइन हैं। हम इसे रख लेंगे और नेटवर्क आते ही भेज देंगे।';

  @override
  String get errorGeneric =>
      'हमारी तरफ़ से कुछ गड़बड़ हुई। आपकी बही सुरक्षित है।';

  @override
  String get approvalPromise =>
      'आपकी मंज़ूरी के बिना कुछ भी फ़ाइल या भुगतान नहीं होगा।';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName $date को देय';
  }

  @override
  String dataStaysIn(String country) {
    return 'आपका डेटा $country में ही रहता है।';
  }

  @override
  String bahiHello(String name) {
    return 'नमस्ते $name, मैं बही हूँ। मैं आपकी बही-खाता संभालता हूँ।';
  }
}
