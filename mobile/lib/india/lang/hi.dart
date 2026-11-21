import 'hi_account.dart';
import 'hi_cloud.dart';
import 'hi_core.dart';
import 'hi_entries.dart';
import 'hi_money.dart';
import 'hi_people.dart';
import 'hi_shared.dart';
import 'hi_taxes.dart';

final Map<String, String> hindi = Map.unmodifiable({...hiCore, ...hiShared, ...hiTaxes, ...hiPeople, ...hiEntries, ...hiMoney, ...hiAccount, ...hiCloud});
