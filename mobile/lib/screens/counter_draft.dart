import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class DraftLine {
  const DraftLine({required this.sku, required this.name, required this.price, required this.listPrice, required this.gstRate, required this.qty, this.hsn = '', this.unit = ''});

  factory DraftLine.fromJson(Map<dynamic, dynamic> map) => DraftLine(
    sku: '${map['sku'] ?? ''}',
    name: '${map['name'] ?? ''}',
    price: map['price'] as num,
    listPrice: map['listPrice'] is num ? map['listPrice'] as num : map['price'] as num,
    gstRate: map['gstRate'] as num,
    qty: map['qty'] as num,
    hsn: '${map['hsn'] ?? ''}',
    unit: '${map['unit'] ?? ''}',
  );

  final String sku;
  final String name;
  final num price;
  final num listPrice;
  final num gstRate;
  final num qty;
  final String hsn;
  final String unit;

  Map<String, Object?> toJson() => {'sku': sku, 'name': name, 'price': price, 'listPrice': listPrice, 'gstRate': gstRate, 'qty': qty, 'hsn': hsn, 'unit': unit};
}

class CounterDraft {
  const CounterDraft({required this.lines, this.customer = '', this.address = '', this.gstin = '', this.pay = 'cash'});

  factory CounterDraft.fromJson(Map<dynamic, dynamic> map) {
    final raw = map['lines'];
    final lines = <DraftLine>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is! Map) continue;
        try {
          final line = DraftLine.fromJson(item);
          if (line.sku.isNotEmpty && line.qty > 0 && line.price > 0) lines.add(line);
        } catch (_) {
          continue;
        }
      }
    }
    return CounterDraft(lines: lines, customer: '${map['customer'] ?? ''}', address: '${map['address'] ?? ''}', gstin: '${map['gstin'] ?? ''}', pay: const ['cash', 'upi', 'card', 'credit'].contains(map['pay']) ? '${map['pay']}' : 'cash');
  }

  final List<DraftLine> lines;
  final String customer;
  final String address;
  final String gstin;
  final String pay;

  bool get isEmpty => lines.isEmpty;

  Map<String, Object?> toJson() => {'lines': [for (final line in lines) line.toJson()], 'customer': customer, 'address': address, 'gstin': gstin, 'pay': pay};
}

class DraftShelf {
  const DraftShelf({this.current, this.parked = const []});

  final CounterDraft? current;
  final List<CounterDraft> parked;

  bool get isEmpty => (current == null || current!.isEmpty) && parked.isEmpty;
}

const maxParkedBills = 8;

abstract class CounterDraftStore {
  Future<DraftShelf> load(String business);
  Future<void> save(String business, DraftShelf shelf);
}

class PreferencesDraftStore implements CounterDraftStore {
  const PreferencesDraftStore();

  static const _key = 'counter.drafts.v1';

  @override
  Future<DraftShelf> load(String business) async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw == null || raw.isEmpty) return const DraftShelf();
      final map = jsonDecode(raw);
      if (map is! Map || map['business'] != business) return const DraftShelf();
      final current = map['current'] is Map ? CounterDraft.fromJson(map['current'] as Map) : null;
      final parked = [
        if (map['parked'] is List)
          for (final item in map['parked'] as List)
            if (item is Map) CounterDraft.fromJson(item),
      ].where((draft) => !draft.isEmpty).take(maxParkedBills).toList();
      return DraftShelf(current: current == null || current.isEmpty ? null : current, parked: parked);
    } catch (_) {
      return const DraftShelf();
    }
  }

  @override
  Future<void> save(String business, DraftShelf shelf) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (shelf.isEmpty) {
        await prefs.remove(_key);
        return;
      }
      await prefs.setString(_key, jsonEncode({'business': business, 'current': shelf.current?.toJson(), 'parked': [for (final draft in shelf.parked) draft.toJson()]}));
    } catch (_) {
      return;
    }
  }
}

class MemoryDraftStore implements CounterDraftStore {
  final shelves = <String, DraftShelf>{};
  int saves = 0;

  @override
  Future<DraftShelf> load(String business) async => shelves[business] ?? const DraftShelf();

  @override
  Future<void> save(String business, DraftShelf shelf) async {
    saves += 1;
    shelves[business] = shelf;
  }
}
