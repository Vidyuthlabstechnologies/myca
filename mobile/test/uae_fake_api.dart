import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/uae/uae_emirates.dart';

import 'fake_api.dart';

class UaeFakeApi extends FakeMycaApi {
  UaeFakeApi({super.emptyBooks}) : super(signedIn: true) {
    country = 'AE';
    companyName = 'Al Noor Trading LLC';
  }

  static const uaeToken = 'uae-token-1';

  final aeProposals = <Proposal>[];
  final aeConfirmed = <Proposal>[];
  final issued = <Map<String, Object?>>[];
  Map<String, Object?>? savedProfile;
  Proposal? _aeHeld;
  bool failDeadlines = false;

  static const _emirates = [
    ['1a', 'AUH', 'Abu Dhabi', 'أبوظبي'],
    ['1b', 'DXB', 'Dubai', 'دبي'],
    ['1c', 'SHJ', 'Sharjah', 'الشارقة'],
    ['1d', 'AJM', 'Ajman', 'عجمان'],
    ['1e', 'UAQ', 'Umm Al Quwain', 'أم القيوين'],
    ['1f', 'RAK', 'Ras Al Khaimah', 'رأس الخيمة'],
    ['1g', 'FUJ', 'Fujairah', 'الفجيرة'],
  ];

  static int _fils(Object? value) => ((value is num ? value : 0) * 100).round();

  static double _aed(int fils) => fils / 100;

  static int _vatOf(int net) => (net * 5 / 100).round();

  Map<String, Object?> _vatReturn(Map<String, Object?> args) {
    final period = '${args['period']}';
    final match = RegExp(r'^(\d{4})-(\d{2})/(\d{4})-(\d{2})$').firstMatch(period);
    if (match == null) return {'ok': false, 'error': 'BAD_PERIOD', 'hint': 'Write the tax period as 2026-01/2026-03.'};
    final endYear = int.parse(match.group(3)!);
    final endMonth = int.parse(match.group(4)!);
    final end = DateTime(endYear, endMonth + 1, 0);
    final due = end.add(const Duration(days: 28));
    String iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final boxes = <String, List<int>>{for (final e in _emirates) e[0]: [0, 0, 0], for (final k in ['2', '3', '4', '5', '6', '7', '9', '10']) k: [0, 0, 0]};
    final warnings = <String>[];
    final problems = <Map<String, Object?>>[];
    final lines = (args['lines'] as List? ?? const []);
    for (var at = 0; at < lines.length; at++) {
      final line = lines[at] as Map;
      final net = _fils(line['net']);
      final treatment = line['treatment'] ?? 'standard';
      if (line['kind'] == 'supply') {
        if (treatment == 'standard') {
          final emirate = _emirates.where((e) => e[1] == line['emirate']).firstOrNull;
          if (emirate == null) {
            problems.add({'line': at, 'field': 'emirate', 'why': 'A standard-rated sale is reported by the emirate of the establishment that made it.'});
            continue;
          }
          boxes[emirate[0]]![0] += net;
          boxes[emirate[0]]![1] += _vatOf(net);
        } else if (treatment == 'zero-rated') {
          boxes['4']![0] += net;
        } else if (treatment == 'exempt') {
          boxes['5']![0] += net;
        }
      } else {
        final target = switch (treatment) { 'reverse-charge' => '3', 'import' => '6', 'import-adjustment' => '7', _ => '9' };
        final vat = _vatOf(net);
        if (target == '9') {
          boxes['9']![0] += net;
          boxes['9']![1] += vat;
        } else {
          boxes[target]![0] += net;
          boxes[target]![1] += vat;
          boxes['10']![0] += net;
          boxes['10']![1] += vat;
        }
      }
    }
    if (problems.isNotEmpty) return {'ok': false, 'error': 'VAT_RETURN_LINES_INVALID', 'problems': problems, 'hint': 'Fix these lines; nothing was totalled.'};
    final tourist = args['touristRefunds'];
    if (tourist is Map) {
      boxes['2']![0] = -_fils(tourist['net']).abs();
      boxes['2']![1] = -_fils(tourist['vat']).abs();
    }
    if (boxes['6']![0] != 0) warnings.add('Box 6 is filled by EmaraTax from customs declarations; check it matches the import VAT shown there.');
    int sum(List<String> keys, int part) => keys.fold(0, (total, key) => total + boxes[key]![part]);
    final ones = [for (final e in _emirates) e[0]];
    final box8 = [sum([...ones, '2', '3', '4', '5', '6', '7'], 0), sum([...ones, '2', '3', '6', '7'], 1), 0];
    final box11 = [sum(['9', '10'], 0), sum(['9', '10'], 1), 0];
    final payable = box8[1] - box11[1];
    if (payable < 0) warnings.add('Box 14 is a refund position. Choose in box 15 whether to claim it now or carry it forward.');
    Map<String, Object?> out(List<int> b) => {'net': _aed(b[0]), 'vat': _aed(b[1]), 'adjustment': _aed(b[2])};
    final start = DateTime(int.parse(match.group(1)!), int.parse(match.group(2)!), 1);
    return {
      'ok': true,
      'data': {
        'form': 'VAT201',
        'period': period,
        'start': iso(start),
        'end': iso(end),
        'due': iso(due),
        'boxes': {for (final entry in boxes.entries) entry.key: out(entry.value), '8': out(box8), '11': out(box11)},
        'totalDue': _aed(box8[1]),
        'totalRecoverable': _aed(box11[1]),
        'payable': _aed(payable),
        'refund': payable < 0,
        'emirates': [for (final e in _emirates) {'box': e[0], 'code': e[1], 'en': e[2], 'ar': e[3]}],
        'warnings': warnings,
        'unreviewed': true,
      },
    };
  }

  Map<String, Object?> _ct(Map<String, Object?> args) {
    final start = '${args['periodStart'] ?? ''}';
    final end = '${args['periodEnd'] ?? ''}';
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(start) || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(end)) {
      return {'ok': false, 'error': 'BAD_PERIOD', 'hint': 'Give the tax period as periodStart and periodEnd dates (YYYY-MM-DD).'};
    }
    final endDay = DateTime.parse(end);
    final dueDay = DateTime(endDay.year, endDay.month + 10, 0);
    final due = '${dueDay.year}-${dueDay.month.toString().padLeft(2, '0')}-${dueDay.day.toString().padLeft(2, '0')}';
    final revenue = _fils(args['revenue']);
    final adjusted = _fils(args['accountingProfit']) - _fils(args['exemptIncome']) + _fils(args['nonDeductibleExpenses']);
    final losses = _fils(args['lossesBroughtForward']);
    final base = {'periodStart': start, 'periodEnd': end, 'due': due, 'revenue': _aed(revenue), 'accountingProfit': _aed(_fils(args['accountingProfit'])), 'adjustedProfit': _aed(adjusted)};
    final warnings = <String>[];
    final sbrOpen = revenue <= 300000000 && args['qualifyingFreeZonePerson'] != true && end.compareTo('2029-12-31') <= 0;
    if (args['electSmallBusinessRelief'] == true) {
      if (sbrOpen) {
        return {
          'ok': true,
          'data': {...base, 'relief': 'small-business-relief', 'taxableIncome': 0, 'tax': 0, 'payable': 0, 'lossUsed': 0, 'lossCarriedForward': _aed(losses), 'lossForfeited': _aed(adjusted < 0 ? -adjusted : 0), 'warnings': ['A Corporate Tax return is still filed on EmaraTax by the due date, with the relief elected.'], 'unreviewed': true},
        };
      }
      warnings.add('Small Business Relief cannot be elected: Revenue is above the AED 3,000,000 cap.');
    }
    var taxable = adjusted;
    var used = 0;
    var carried = losses;
    if (taxable <= 0) {
      carried = losses + (taxable < 0 ? -taxable : 0);
      taxable = 0;
    } else if (losses > 0) {
      used = [losses, (taxable * 75 / 100).round()].reduce((a, b) => a < b ? a : b);
      taxable -= used;
      carried = losses - used;
    }
    var tax = 0;
    var zero = 0;
    var relief = 'none';
    if (args['qualifyingFreeZonePerson'] == true) {
      zero = [_fils(args['qualifyingIncome']), taxable].reduce((a, b) => a < b ? a : b);
      tax = ((taxable - zero) * 9 / 100).round();
      relief = 'qualifying-free-zone-person';
    } else {
      tax = taxable > 37500000 ? ((taxable - 37500000) * 9 / 100).round() : 0;
    }
    return {
      'ok': true,
      'data': {...base, 'relief': relief, 'taxableIncome': _aed(taxable), 'zeroRatedQualifyingIncome': _aed(zero), 'tax': _aed(tax), 'payable': _aed(tax), 'lossUsed': _aed(used), 'lossCarriedForward': _aed(carried), 'warnings': warnings, 'unreviewed': true},
    };
  }

  Map<String, Object?> _deadlines(Map<String, Object?> args) {
    final today = DateTime.parse('${args['today']}');
    Map<String, Object?> item(String id, String what, DateTime date) {
      final days = date.difference(today).inDays;
      final iso = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      return {'id': id, 'what': what, 'date': iso, 'daysLeft': days, 'overdue': days < 0};
    }
    final items = <Map<String, Object?>>[];
    if (args['vatPeriodEnd'] is String) {
      items.add(item('vat-return', 'VAT return (VAT 201) and payment on EmaraTax', DateTime.parse('${args['vatPeriodEnd']}').add(const Duration(days: 28))));
    }
    if (args['ctPeriodEnd'] is String) {
      final end = DateTime.parse('${args['ctPeriodEnd']}');
      items.add(item('ct-return', 'Corporate Tax return and payment on EmaraTax', DateTime(end.year, end.month + 10, 0)));
    }
    if (args['revenue'] != null) {
      items.add(item('einvoice-asp', 'Appoint an Accredited Service Provider for e-invoicing', DateTime(2027, 3, 31)));
      items.add(item('einvoice-live', 'Send and receive every B2B and B2G invoice as a PINT AE e-invoice', DateTime(2027, 7, 1)));
    }
    items.sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
    return {'ok': true, 'data': {'today': args['today'], 'items': items}};
  }

  Map<String, Object?> _trn(String raw) {
    final trn = raw.replaceAll(RegExp(r'[\s-]'), '');
    if (trn.isEmpty) return {'valid': false, 'trn': trn, 'why': 'Enter the 15-digit Tax Registration Number from the FTA certificate.'};
    if (!RegExp(r'^\d+$').hasMatch(trn)) return {'valid': false, 'trn': trn, 'why': 'A TRN has digits only.'};
    if (trn.length != 15) return {'valid': false, 'trn': trn, 'why': 'A TRN has 15 digits; this one has ${trn.length}.'};
    return {'valid': true, 'trn': trn, 'tin': trn.substring(0, 10), 'endpoint': '0235:${trn.substring(0, 10)}', 'warnings': trn.startsWith('100') ? const [] : ['FTA TRNs issued so far start with 100; check the certificate.']};
  }

  Map<String, Object?> _einvoice(Map<String, Object?> args) {
    final problems = <Map<String, Object?>>[];
    final buyer = (args['buyer'] as Map?) ?? const {};
    if ('${args['number'] ?? ''}'.trim().isEmpty) problems.add({'field': 'number', 'why': 'The invoice number is required and must be unique.'});
    if (savedProfile == null) problems.add({'field': 'seller', 'why': 'Save the business profile first (name, TRN, trade licence, address).'});
    if ('${buyer['name'] ?? ''}'.trim().isEmpty) problems.add({'field': 'buyer.name', 'why': 'The registered legal name is required.'});
    if ('${buyer['addressLine'] ?? ''}'.trim().isEmpty) problems.add({'field': 'buyer.addressLine', 'why': 'The first address line is required.'});
    if ('${buyer['city'] ?? ''}'.trim().isEmpty) problems.add({'field': 'buyer.city', 'why': 'The city is required.'});
    if (buyer['trn'] != null && _trn('${buyer['trn']}')['valid'] != true) problems.add({'field': 'buyer.trn', 'why': _trn('${buyer['trn']}')['why']});
    final lines = (args['lines'] as List? ?? const []);
    var net = 0;
    var tax = 0;
    for (var at = 0; at < lines.length; at++) {
      final line = lines[at] as Map;
      if ('${line['name'] ?? ''}'.trim().isEmpty) problems.add({'field': 'lines[$at].name', 'why': 'Name the goods or service.'});
      final quantity = line['quantity'] is num ? line['quantity'] as num : 0;
      if (quantity <= 0) problems.add({'field': 'lines[$at].quantity', 'why': 'Quantity must be more than zero; to reduce an invoice, issue a credit note.'});
      final lineNet = (quantity * _fils(line['unitPrice'])).round();
      net += lineNet;
      if (line['taxCategory'] == 'S') tax += _vatOf(lineNet);
    }
    if (problems.isNotEmpty) return {'ok': false, 'error': 'EINVOICE_INVALID', 'problems': problems, 'warnings': const []};
    final warnings = buyer['trn'] == null ? ['The buyer has no TIN, so the invoice goes to the FTA endpoint for buyers not yet on the network. Ask the buyer for its TRN.'] : const <String>[];
    return {
      'ok': true,
      'data': {
        'ready': true,
        'mode': 'sandbox',
        'totals': {'currency': 'AED', 'net': _aed(net), 'tax': _aed(tax), 'payable': _aed(net + tax), 'taxAed': _aed(tax), 'payableAed': _aed(net + tax)},
        'warnings': warnings,
      },
    };
  }

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    switch (name) {
      case 'ae_vat_return':
        queries.add(name);
        queryArgs.add(QueryCall(name, args));
        return _vatReturn(args);
      case 'ae_ct_estimate':
        queries.add(name);
        queryArgs.add(QueryCall(name, args));
        return _ct(args);
      case 'ae_deadlines':
        queries.add(name);
        queryArgs.add(QueryCall(name, args));
        if (failDeadlines) return {'ok': false, 'error': 'BAD_DATE'};
        return _deadlines(args);
      case 'ae_business_profile':
        return {'ok': true, 'data': {'saved': savedProfile != null, 'business': savedProfile}};
      case 'validate_ae_trn':
        queries.add(name);
        queryArgs.add(QueryCall(name, args));
        return {'ok': true, 'data': _trn('${args['trn'] ?? ''}')};
      case 'ae_einvoice_check':
        queries.add(name);
        queryArgs.add(QueryCall(name, args));
        return _einvoice(args);
      case 'ae_einvoice_list':
        queries.add(name);
        return {'ok': true, 'data': {'mode': 'sandbox', 'einvoices': issued}};
      case 'ae_penalty_estimate':
        queries.add(name);
        return {'ok': true, 'data': {'kind': args['kind'], 'penalty': 1000, 'why': 'A first late VAT return is AED 1,000.'}};
      case 'week_ahead':
        queries.add(name);
        return {'ok': true, 'data': {'items': const <Object?>[]}};
      case 'daily_close':
        queries.add(name);
        return {'ok': true, 'data': {'checklist': const <Object?>[]}};
      case 'ae_vat_registration':
        queries.add(name);
        return {'ok': true, 'data': {'status': 'must-register', 'mandatoryThreshold': 375000, 'voluntaryThreshold': 187500}};
    }
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    if (name != 'set_ae_business_profile' && name != 'issue_ae_einvoice') return super.propose(name, args);
    final proposal = Proposal(name, args);
    aeProposals.add(proposal);
    if (name == 'set_ae_business_profile') {
      final trn = args['trn'];
      if (trn != null && _trn('$trn')['valid'] != true) {
        return ChatReply.fromJson({'reply': 'I did not save anything, because:\n· trn: ${_trn('$trn')['why']}', 'posted': false, 'blocked': true});
      }
      _aeHeld = proposal;
      return ChatReply.fromJson({
        'reply': 'Save ${args['name']} as the UAE business profile.',
        'posted': false,
        'awaitingConfirmation': true,
        'preview': {'token': uaeToken, 'summary': 'Save ${args['name']}${trn == null ? '' : ' (TRN $trn)'} as the UAE business profile.', 'effects': ['VAT returns, corporate tax estimates and e-invoices use these details.'], 'figures': {}},
      });
    }
    final checked = _einvoice(args);
    if (checked['ok'] != true) {
      return ChatReply.fromJson({'reply': 'E-invoice ${args['number']} is not ready.', 'posted': false, 'blocked': true});
    }
    _aeHeld = proposal;
    final totals = (checked['data'] as Map)['totals'] as Map;
    return ChatReply.fromJson({
      'reply': 'Record (sandbox) e-invoice ${args['number']}.',
      'posted': false,
      'awaitingConfirmation': true,
      'preview': {'token': uaeToken, 'summary': 'Record (sandbox) e-invoice ${args['number']} for AED ${(totals['payableAed'] as num).toStringAsFixed(2)}.', 'effects': ['Checked against PINT AE and saved with a UUID; nothing is sent to the FTA.'], 'figures': {}},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    final held = _aeHeld;
    if (token != uaeToken || held == null) return super.confirm(token);
    _aeHeld = null;
    aeConfirmed.add(held);
    if (held.tool == 'set_ae_business_profile') {
      savedProfile = held.args;
      return ChatReply.fromJson({'reply': 'Saved the UAE business profile.', 'posted': true});
    }
    final totals = ((_einvoice(held.args)['data'] as Map)['totals'] as Map);
    issued.insert(0, {'number': held.args['number'], 'issueDate': held.args['issueDate'], 'uuid': '3f2a9c1e-4b7d-4a10-a2b3-9c8d7e6f5a41', 'status': 'sandbox-reported', 'mode': 'sandbox', 'totals': totals});
    return ChatReply.fromJson({'reply': 'Recorded e-invoice ${held.args['number']} in the sandbox.', 'posted': true});
  }

  @override
  Future<ChatReply> discard() async {
    if (_aeHeld != null) {
      _aeHeld = null;
      return ChatReply.fromJson({'reply': 'Discarded.', 'posted': false});
    }
    return super.discard();
  }
}

AppState uaeState(UaeFakeApi api) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 11, 14, 10, 30),
  edition: 'AE',
);

const uaeSizes = <(String, Size)>[
  ('320x568', Size(320, 568)),
  ('360x640', Size(360, 640)),
  ('375x667', Size(375, 667)),
  ('390x844', Size(390, 844)),
  ('412x915', Size(412, 915)),
  ('430x932', Size(430, 932)),
  ('600x960', Size(600, 960)),
  ('800x1280', Size(800, 1280)),
  ('844x390', Size(844, 390)),
];

Future<void> uaeView(WidgetTester tester, {Size size = const Size(390, 844), String language = 'en', double textScale = 1.0}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.localesTestValue = [Locale(language, 'AE')];
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  addTearDown(() => uaeProfile.value = null);
}

Future<UaeFakeApi> openUaeApp(WidgetTester tester, {UaeFakeApi? api}) async {
  final fake = api ?? UaeFakeApi();
  await tester.pumpWidget(MycaApp(state: uaeState(fake)));
  await tester.pumpAndSettle();
  return fake;
}

Future<void> openUaeTaxes(WidgetTester tester) async {
  final panel = find.byKey(const ValueKey('home.uae'));
  await tester.ensureVisible(panel);
  await tester.pumpAndSettle();
  await tester.tap(panel);
  await tester.pumpAndSettle();
}

Future<void> openUaeScreen(WidgetTester tester, String key) async {
  await openUaeTaxes(tester);
  final row = find.byKey(ValueKey('uae.open.$key'));
  await tester.scrollUntilVisible(row, 200, scrollable: uaeList);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pumpAndSettle();
}

final uaeList = find.byWidgetPredicate((widget) => widget is Scrollable && widget.axisDirection == AxisDirection.down).last;
