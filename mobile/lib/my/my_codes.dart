import 'dart:convert';

import 'package:flutter/services.dart';

const myStates = <(String, String)>[
  ('01', 'Johor'),
  ('02', 'Kedah'),
  ('03', 'Kelantan'),
  ('04', 'Melaka'),
  ('05', 'Negeri Sembilan'),
  ('06', 'Pahang'),
  ('07', 'Pulau Pinang'),
  ('08', 'Perak'),
  ('09', 'Perlis'),
  ('10', 'Selangor'),
  ('11', 'Terengganu'),
  ('12', 'Sabah'),
  ('13', 'Sarawak'),
  ('14', 'Wilayah Persekutuan Kuala Lumpur'),
  ('15', 'Wilayah Persekutuan Labuan'),
  ('16', 'Wilayah Persekutuan Putrajaya'),
];

String myStateName(String code) {
  for (final (key, name) in myStates) {
    if (key == code) return name;
  }
  return code;
}

const myTaxTypes = <String>['01', '02', '03', '04', '05', '06', 'E'];

const myUnitCodes = <String>['C62', 'EA', 'H87', 'SET', 'KGM', 'GRM', 'LTR', 'MTR', 'MTK', 'HUR', 'DAY', 'MON', 'ANN', 'LS', 'XBX', 'TNE'];

const myIdTypes = <String>['BRN', 'NRIC', 'PASSPORT', 'ARMY'];

const myPaymentMethods = <String>['01', '02', '03', '04', '05', '06', '07', '08'];

const myCommonCurrencies = <String>['MYR', 'USD', 'SGD', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'THB', 'IDR', 'HKD', 'INR'];

const myServiceCategories = <String>[
  'general',
  'food-and-beverage',
  'telecommunication',
  'parking',
  'logistics',
  'construction',
  'rental-or-leasing',
  'financial',
  'insurance',
  'beauty-and-wellness',
  'healthcare',
  'healthcare-non-citizen',
  'education',
  'education-non-citizen',
  'credit-card',
];

const myDocumentTypes = <String>[
  'invoice',
  'credit-note',
  'debit-note',
  'refund-note',
  'self-billed-invoice',
  'self-billed-credit-note',
  'self-billed-debit-note',
  'self-billed-refund-note',
];

const myAdjustmentTypes = {'credit-note', 'debit-note', 'refund-note', 'self-billed-credit-note', 'self-billed-debit-note', 'self-billed-refund-note'};

const myGeneralPublicTin = 'EI00000000010';
const myForeignBuyerTin = 'EI00000000020';
const myForeignSupplierTin = 'EI00000000030';
const myGovernmentTin = 'EI00000000040';

const myReliefs = <String>[
  'disabledIndividual',
  'spouse',
  'disabledSpouse',
  'educationFees',
  'medicalSelfSpouseChild',
  'medicalParents',
  'disabilityEquipment',
  'lifestyle',
  'sportsLifestyle',
  'evChargingOrComposting',
  'lifeInsuranceAndEpf',
  'prsAndDeferredAnnuity',
  'educationAndMedicalInsurance',
  'socso',
  'sspnNetSavings',
  'childcareFees',
  'breastfeedingEquipment',
  'firstHomeLoanInterest',
];

const myChildReliefs = <String>['childUnder18', 'childHigherEducation', 'disabledChild'];

const myIncomeHeads = <String>['employment', 'business', 'rental', 'interestAndDividends', 'other'];

class MsicCode {
  const MsicCode(this.code, this.name);

  final String code;
  final String name;
}

List<MsicCode>? _msic;

Future<List<MsicCode>> loadMsicCodes([AssetBundle? bundle]) async {
  final cached = _msic;
  if (cached != null) return cached;
  final bytes = await (bundle ?? rootBundle).load('assets/my/msic.json');
  final raw = utf8.decode(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes));
  final decoded = jsonDecode(raw) as Map<String, dynamic>;
  final rows = [
    for (final row in decoded['msic'] as List)
      if (row is List && row.length == 2) MsicCode('${row[0]}', '${row[1]}'),
  ];
  return _msic = rows;
}

List<MsicCode> searchMsic(List<MsicCode> codes, String query) {
  final words = query.trim().toLowerCase().split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();
  if (words.isEmpty) return codes;
  return [
    for (final code in codes)
      if (words.every((word) => code.code.startsWith(word) || code.name.toLowerCase().contains(word))) code,
  ];
}

final _tin = RegExp(r'^(?:IG\d{9,11}|(?:C|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|J|LE)\d{8,12}|EI\d{11})$');
final _sst = RegExp(r'^[A-Z]\d{2}-\d{4}-\d{8}$');
final _phone = RegExp(r'^\+?[0-9]{8,15}$');
final _postcode = RegExp(r'^\d{5}$');
final _brnNew = RegExp(r'^\d{12}$');
final _brnOld = RegExp(r'^[A-Z]{0,3}\d{1,9}-?[A-Z]$');

String tidyMyId(String value) => value.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');

bool isMyTinShape(String value) => _tin.hasMatch(tidyMyId(value));

bool isMySstShape(String value) {
  final parts = value.split(';').map(tidyMyId).where((part) => part.isNotEmpty).toList();
  return parts.isNotEmpty && parts.length <= 2 && parts.every(_sst.hasMatch);
}

bool isMyPhoneShape(String value) => _phone.hasMatch(value.replaceAll(RegExp(r'[\s()-]'), ''));

String tidyMyPhone(String value) => value.replaceAll(RegExp(r'[\s()-]'), '');

bool isMyPostcodeShape(String value) => _postcode.hasMatch(value.trim());

bool isMyBrnShape(String value) {
  final tidy = tidyMyId(value);
  return _brnNew.hasMatch(tidy) || _brnOld.hasMatch(tidy);
}

bool isMyNricShape(String value) => RegExp(r'^\d{12}$').hasMatch(value.replaceAll('-', '').trim());

bool isMyMsicShape(String value) => RegExp(r'^\d{5}$').hasMatch(value.trim());
