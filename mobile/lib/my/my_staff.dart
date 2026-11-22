import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class MyStaffMember {
  const MyStaffMember({this.name = '', this.wages = '', this.category = 1, this.children = '', this.taxNumber = '', this.ic = '', this.passport = '', this.country = ''});

  factory MyStaffMember.fromJson(Map<String, dynamic> map) {
    final category = map['category'];
    return MyStaffMember(
      name: '${map['name'] ?? ''}',
      wages: '${map['wages'] ?? ''}',
      category: category is int && category >= 1 && category <= 3 ? category : 1,
      children: '${map['children'] ?? ''}',
      taxNumber: '${map['taxNumber'] ?? ''}',
      ic: '${map['ic'] ?? ''}',
      passport: '${map['passport'] ?? ''}',
      country: '${map['country'] ?? ''}',
    );
  }

  final String name;
  final String wages;
  final int category;
  final String children;
  final String taxNumber;
  final String ic;
  final String passport;
  final String country;

  Map<String, Object?> toJson() => {'name': name, 'wages': wages, 'category': category, 'children': children, 'taxNumber': taxNumber, 'ic': ic, 'passport': passport, 'country': country};
}

class MyStaffList {
  const MyStaffList({this.employerNo = '', this.staff = const []});

  final String employerNo;
  final List<MyStaffMember> staff;
}

abstract class MyStaffStore {
  Future<MyStaffList?> load(String business);
  Future<void> save(String business, MyStaffList list);
}

class DeviceMyStaffStore implements MyStaffStore {
  const DeviceMyStaffStore();

  static const _storage = FlutterSecureStorage();

  static String _key(String business) => 'my.staff.${business.trim().toLowerCase()}';

  @override
  Future<MyStaffList?> load(String business) async {
    try {
      final text = await _storage.read(key: _key(business)).timeout(const Duration(seconds: 3));
      if (text == null || text.isEmpty) return null;
      final map = jsonDecode(text);
      if (map is! Map) return null;
      final rows = map['staff'];
      return MyStaffList(
        employerNo: '${map['employerNo'] ?? ''}',
        staff: [if (rows is List) for (final row in rows) if (row is Map) MyStaffMember.fromJson(row.cast<String, dynamic>())],
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(String business, MyStaffList list) async {
    try {
      await _storage.write(key: _key(business), value: jsonEncode({'employerNo': list.employerNo, 'staff': [for (final member in list.staff) member.toJson()]}));
    } catch (_) {
      return;
    }
  }
}

class MemoryMyStaffStore implements MyStaffStore {
  final saved = <String, MyStaffList>{};

  @override
  Future<MyStaffList?> load(String business) async => saved[business];

  @override
  Future<void> save(String business, MyStaffList list) async => saved[business] = list;
}

MyStaffStore myStaffStore = const DeviceMyStaffStore();
