// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class MycaLocalizationsZh extends MycaLocalizations {
  MycaLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get actionContinue => '继续';

  @override
  String get actionSave => '保存';

  @override
  String get actionCancel => '取消';

  @override
  String get actionApprove => '批准';

  @override
  String get actionEdit => '编辑';

  @override
  String get actionShare => '分享';

  @override
  String get actionTryAgain => '重试';

  @override
  String get actionAskBahi => '问 Bahi';

  @override
  String get statusDraft => '草稿';

  @override
  String get statusDue => '待缴';

  @override
  String get statusOverdue => '逾期';

  @override
  String get statusFiled => '已申报';

  @override
  String get statusPaid => '已付';

  @override
  String get statusNeedsReview => '需要查看';

  @override
  String get moneyIn => '收入';

  @override
  String get moneyOut => '支出';

  @override
  String get balance => '余额';

  @override
  String get nothingYet => '这里还没有内容';

  @override
  String get errorOffline => '你已离线。我们会先保存，联网后再发送。';

  @override
  String get errorGeneric => '我们这边出了问题。你的账簿是安全的。';

  @override
  String get approvalPromise => '未经你批准，不会申报或付款。';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName 应于 $date 缴纳';
  }

  @override
  String dataStaysIn(String country) {
    return '你的数据保存在$country境内。';
  }

  @override
  String bahiHello(String name) {
    return '$name 你好，我是 Bahi，帮你把账整理好。';
  }
}
