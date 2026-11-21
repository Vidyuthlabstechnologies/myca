import 'hi_account.dart';
import 'hi_core.dart';
import 'hi_entries.dart';
import 'hi_money.dart';
import 'hi_people.dart';
import 'hi_shared.dart';
import 'hi_taxes.dart';

/// Every Hindi line of the India app. Each area keeps its own file so several people can work at once.
/// The Hindi key set is the India key set: every other Indian language must cover the same keys.
final Map<String, String> hindi = Map.unmodifiable({...hiCore, ...hiShared, ...hiTaxes, ...hiPeople, ...hiEntries, ...hiMoney, ...hiAccount});
