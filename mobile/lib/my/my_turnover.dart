import 'package:shared_preferences/shared_preferences.dart';

class MyTurnover {
  const MyTurnover({required this.annual, this.related});

  final num annual;
  final num? related;
}

abstract class MyTurnoverStore {
  Future<MyTurnover?> load(String business);
  Future<void> save(String business, MyTurnover turnover);
}

class DeviceMyTurnoverStore implements MyTurnoverStore {
  const DeviceMyTurnoverStore();

  static String _key(String business, String part) => 'my.turnover.$part.${business.trim().toLowerCase()}';

  @override
  Future<MyTurnover?> load(String business) async {
    try {
      final prefs = await SharedPreferences.getInstance().timeout(const Duration(seconds: 3));
      final annual = num.tryParse(prefs.getString(_key(business, 'annual')) ?? '');
      if (annual == null) return null;
      return MyTurnover(annual: annual, related: num.tryParse(prefs.getString(_key(business, 'related')) ?? ''));
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(String business, MyTurnover turnover) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key(business, 'annual'), '${turnover.annual}');
      final related = turnover.related;
      if (related == null) {
        await prefs.remove(_key(business, 'related'));
      } else {
        await prefs.setString(_key(business, 'related'), '$related');
      }
    } catch (_) {
      return;
    }
  }
}

class MemoryMyTurnoverStore implements MyTurnoverStore {
  final saved = <String, MyTurnover>{};

  @override
  Future<MyTurnover?> load(String business) async => saved[business];

  @override
  Future<void> save(String business, MyTurnover turnover) async => saved[business] = turnover;
}

MyTurnoverStore myTurnoverStore = const DeviceMyTurnoverStore();
