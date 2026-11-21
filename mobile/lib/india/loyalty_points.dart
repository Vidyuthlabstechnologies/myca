import 'dart:async';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import 'india_strings.dart';

bool loyaltyEdition(BuildContext context) {
  final scope = AppScope.of(context);
  return scope.edition == 'IN' && (scope.snapshot?.company.country ?? 'IN') == 'IN';
}

num _num(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

class LoyaltyRules {
  const LoyaltyRules({
    this.enabled = false,
    this.configured = false,
    this.earnPoints = 1,
    this.earnPerRupees = 100,
    this.earnOn = 'taxable',
    this.pointValue = 1,
    this.minRedeemPoints = 0,
    this.maxRedeemPercent = 50,
    this.expiryMonths = 12,
  });

  factory LoyaltyRules.fromJson(Object? json) {
    final map = json is Map ? json : const {};
    return LoyaltyRules(
      enabled: map['enabled'] == true,
      configured: map['configured'] == true,
      earnPoints: _num(map['earnPoints'] ?? 1),
      earnPerRupees: _num(map['earnPerRupees'] ?? 100),
      earnOn: '${map['earnOn'] ?? 'taxable'}',
      pointValue: _num(map['pointValue'] ?? 1),
      minRedeemPoints: _num(map['minRedeemPoints'] ?? 0),
      maxRedeemPercent: _num(map['maxRedeemPercent'] ?? 50),
      expiryMonths: _num(map['expiryMonths'] ?? 12),
    );
  }

  final bool enabled;
  final bool configured;
  final num earnPoints;
  final num earnPerRupees;
  final String earnOn;
  final num pointValue;
  final num minRedeemPoints;
  final num maxRedeemPercent;
  final num expiryMonths;
}

class LoyaltyCustomer {
  const LoyaltyCustomer({required this.partyName, required this.balance, required this.value, this.expiringSoon = const [], this.whatsapp = ''});

  factory LoyaltyCustomer.fromJson(Object? json) {
    final map = json is Map ? json : const {};
    final soon = map['expiringSoon'];
    return LoyaltyCustomer(
      partyName: '${map['partyName'] ?? ''}',
      balance: _num(map['balance']).toInt(),
      value: _num(map['value']),
      expiringSoon: [
        if (soon is List)
          for (final item in soon)
            if (item is Map) (points: _num(item['points']).toInt(), on: '${item['on'] ?? ''}'),
      ],
      whatsapp: '${map['whatsapp'] ?? ''}',
    );
  }

  final String partyName;
  final int balance;
  final num value;
  final List<({int points, String on})> expiringSoon;
  final String whatsapp;
}

int usablePoints({required int balance, required LoyaltyRules rules, required num billBeforeGst}) {
  final unitPaise = (rules.pointValue * 100).round();
  if (unitPaise <= 0 || balance <= 0) return 0;
  final grossPaise = (billBeforeGst * 100).round();
  final capPaise = (grossPaise * rules.maxRedeemPercent / 100).floor();
  final cap = [capPaise, grossPaise - 1].reduce((a, b) => a < b ? a : b);
  final byBill = cap <= 0 ? 0 : cap ~/ unitPaise;
  return balance < byBill ? balance : byBill;
}

class LoyaltyPointsField extends StatefulWidget {
  const LoyaltyPointsField({super.key, required this.partyName, required this.billBeforeGst, required this.onChanged, this.debounce = const Duration(milliseconds: 500)});

  final String partyName;
  final num billBeforeGst;
  final ValueChanged<int?> onChanged;
  final Duration debounce;

  @override
  State<LoyaltyPointsField> createState() => _LoyaltyPointsFieldState();
}

class _LoyaltyPointsFieldState extends State<LoyaltyPointsField> {
  final _points = TextEditingController();
  Timer? _wait;
  String _askedFor = '';
  LoyaltyRules? _rules;
  LoyaltyCustomer? _customer;
  bool _use = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _schedule();
  }

  @override
  void didUpdateWidget(LoyaltyPointsField old) {
    super.didUpdateWidget(old);
    if (old.partyName != widget.partyName) _schedule();
  }

  @override
  void dispose() {
    _wait?.cancel();
    _points.dispose();
    super.dispose();
  }

  bool get _named {
    final name = widget.partyName.trim().toLowerCase();
    return name.isNotEmpty && !const ['walk-in', 'walk-in customer', 'cash', 'cash sale', 'cash customer'].contains(name);
  }

  void _schedule() {
    _wait?.cancel();
    final name = widget.partyName.trim();
    if (name == _askedFor) return;
    if (!_named) {
      _askedFor = name;
      if (_customer != null || _use) _wait = Timer(Duration.zero, _clear);
      return;
    }
    _wait = Timer(widget.debounce, () => _load(name));
  }

  void _clear() {
    if (!mounted) return;
    setState(() {
      _customer = null;
      _use = false;
    });
    widget.onChanged(null);
  }

  Future<void> _load(String name) async {
    if (!mounted || !loyaltyEdition(context)) return;
    _askedFor = name;
    Map<String, dynamic> data;
    try {
      data = toolData(await AppScope.of(context).api.query('loyalty_balance', {'partyName': name}));
    } on MycaApiException {
      data = const {};
    }
    if (!mounted || name != widget.partyName.trim()) return;
    setState(() {
      _rules = data.isEmpty ? null : LoyaltyRules.fromJson(data['settings']);
      _customer = data['customer'] is Map ? LoyaltyCustomer.fromJson(data['customer']) : null;
      _use = false;
    });
    widget.onChanged(null);
  }

  void _report() {
    final points = int.tryParse(_points.text.trim());
    widget.onChanged(_use && points != null && points > 0 ? points : null);
  }

  @override
  Widget build(BuildContext context) {
    final rules = _rules;
    final customer = _customer;
    if (!loyaltyEdition(context) || rules == null || !rules.enabled || customer == null) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    final usable = usablePoints(balance: customer.balance, rules: rules, billBeforeGst: widget.billBeforeGst);
    final soon = customer.expiringSoon.isEmpty ? '' : ' ${customer.expiringSoon.first.points} ${inText(context, 'expire on')} ${customer.expiringSoon.first.on}.';
    return Card(
      key: const Key('loyalty-card'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${customer.partyName}: ${customer.balance} ${inText(context, 'points')} (${rupees(customer.value)}).$soon', key: const Key('loyalty-points-line'), style: text.bodyMedium),
            if (customer.balance > 0 && customer.balance >= rules.minRedeemPoints)
              SwitchListTile(
                key: const Key('loyalty-use'),
                contentPadding: EdgeInsets.zero,
                title: Text(inText(context, 'Use points')),
                subtitle: Text('${inText(context, 'Up to')} $usable ${inText(context, 'points on this bill')}'),
                value: _use,
                onChanged: usable <= 0
                    ? null
                    : (on) {
                        setState(() {
                          _use = on;
                          if (on && _points.text.trim().isEmpty) _points.text = '$usable';
                        });
                        _report();
                      },
              ),
            if (_use)
              TextField(
                key: const Key('loyalty-redeem'),
                controller: _points,
                keyboardType: TextInputType.number,
                onChanged: (_) => _report(),
                decoration: InputDecoration(
                  labelText: inText(context, 'Points to use'),
                  helperText: '${inText(context, 'One point is')} ${rupees(rules.pointValue)}. ${inText(context, 'GST is charged on the bill after the points.')}',
                ),
              ),
          ],
        ),
      ),
    );
  }
}
