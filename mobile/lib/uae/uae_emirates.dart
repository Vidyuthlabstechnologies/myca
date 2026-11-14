import 'package:flutter/foundation.dart';

class Emirate {
  const Emirate(this.code, this.box, this.en, this.ar);

  final String code;
  final String box;
  final String en;
  final String ar;

  String name(bool arabic) => arabic ? ar : en;
}

const emirates = [
  Emirate('AUH', '1a', 'Abu Dhabi', 'أبوظبي'),
  Emirate('DXB', '1b', 'Dubai', 'دبي'),
  Emirate('SHJ', '1c', 'Sharjah', 'الشارقة'),
  Emirate('AJM', '1d', 'Ajman', 'عجمان'),
  Emirate('UAQ', '1e', 'Umm Al Quwain', 'أم القيوين'),
  Emirate('RAK', '1f', 'Ras Al Khaimah', 'رأس الخيمة'),
  Emirate('FUJ', '1g', 'Fujairah', 'الفجيرة'),
];

Emirate? emirateByCode(String? code) {
  for (final emirate in emirates) {
    if (emirate.code == code) return emirate;
  }
  return null;
}

final uaeProfile = ValueNotifier<Map<String, dynamic>?>(null);
