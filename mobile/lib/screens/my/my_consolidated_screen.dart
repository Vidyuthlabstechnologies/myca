import 'dart:convert';

import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_book.dart';
import '../../my/my_codes.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_einvoice_detail_screen.dart';
import 'my_widgets.dart';

class _ReceiptLine {
  final amount = TextEditingController();
  final largest = TextEditingController();
  final receipts = TextEditingController();
  final description = TextEditingController();
  final rate = TextEditingController();
  String taxType = '06';

  void dispose() {
    for (final controller in [amount, largest, receipts, description, rate]) {
      controller.dispose();
    }
  }
}

List<String> endedMonths(DateTime now, {int count = 3}) => [
  for (var back = 1; back <= count; back++)
    () {
      final month = DateTime(now.year, now.month - back);
      return '${month.year.toString().padLeft(4, '0')}-${month.month.toString().padLeft(2, '0')}';
    }(),
];

class MyConsolidatedScreen extends StatefulWidget {
  const MyConsolidatedScreen({super.key});

  @override
  State<MyConsolidatedScreen> createState() => _MyConsolidatedScreenState();
}

class _MyConsolidatedScreenState extends State<MyConsolidatedScreen> {
  String? _month;
  final _lines = <_ReceiptLine>[_ReceiptLine()];
  final _lateReason = TextEditingController();
  bool _late = false;
  Map<String, String> _errors = const {};
  List<MyProblem> _problems = const [];
  String _error = '';
  bool _busy = false;
  bool _asking = false;
  String _heldToken = '';
  String _heldFor = '';
  final _endKey = GlobalKey();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _month ??= endedMonths(AppScope.of(context).now()).first;
  }

  @override
  void dispose() {
    for (final line in _lines) {
      line.dispose();
    }
    _lateReason.dispose();
    super.dispose();
  }

  void _changed() {
    if (_problems.isNotEmpty || _error.isNotEmpty || _heldToken.isNotEmpty) {
      setState(() {
        _problems = const [];
        _error = '';
        _heldToken = '';
      });
    }
  }

  void _reveal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _endKey.currentContext;
      if (target != null && target.mounted) Scrollable.ensureVisible(target, alignment: 1, duration: const Duration(milliseconds: 200));
    });
  }

  Map<String, String> _validate(MyStrings t) {
    final errors = <String, String>{};
    for (final (index, line) in _lines.indexed) {
      final amount = parseMyAmount(line.amount.text);
      final largest = parseMyAmount(line.largest.text);
      if (amount == null || amount < 0) {
        errors['line$index.amount'] = t.amountBad;
      } else if (amount > myLargestAmount) {
        errors['line$index.amount'] = t.amountTooLarge;
      }
      if (largest == null || largest < 0) {
        errors['line$index.largest'] = t.amountBad;
      } else if (amount != null && largest > amount) {
        errors['line$index.largest'] = t.largestTooBig;
      }
      if (line.taxType != '06' && line.taxType != 'E') {
        final rate = parseMyAmount(line.rate.text);
        if (rate == null || rate < 0 || rate > 100) errors['line$index.rate'] = t.taxRateBad;
      }
    }
    if (_late && _lateReason.text.trim().isEmpty) errors['lateReason'] = t.lateReasonMissing;
    return errors;
  }

  Map<String, Object?> _args(MyStrings t) => {
    'month': _month,
    'lines': [
      for (final line in _lines)
        {
          'amount': parseMyAmount(line.amount.text),
          'largestTransaction': parseMyAmount(line.largest.text),
          'description': line.description.text.trim().isEmpty ? t.salesToPublic : line.description.text.trim(),
          if (line.receipts.text.trim().isNotEmpty) 'receipts': line.receipts.text.trim(),
          'taxType': line.taxType,
          if (line.taxType != '06' && line.taxType != 'E') 'taxRateBasisPoints': ((parseMyAmount(line.rate.text) ?? 0) * 100).round(),
          if (line.taxType == 'E') 'exemptionReason': t.salesToPublic,
        },
    ],
    if (_late) 'acknowledgeLate': true,
    if (_late) 'lateReason': _lateReason.text.trim(),
  };

  Future<void> _send() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final errors = _validate(t);
    setState(() {
      _errors = errors;
      _error = '';
      _problems = const [];
    });
    if (errors.isNotEmpty) return;
    final state = AppScope.of(context);
    final tools = MyTools(state.api);
    final args = _args(t);
    final fingerprint = jsonEncode(args);
    setState(() => _busy = true);
    try {
      if (_heldToken.isEmpty || _heldFor != fingerprint) {
        final held = await tools.proposeConsolidated(args);
        if (!mounted) return;
        setState(() => _asking = true);
        final sure = await _confirmSheet(t, held);
        if (mounted) setState(() => _asking = false);
        if (sure != true || !mounted) {
          await tools.discard();
          return;
        }
        _heldToken = held.token;
        _heldFor = fingerprint;
      }
      final record = await tools.confirmConsolidated(_heldToken);
      _heldToken = '';
      if (!mounted) return;
      final year = _month!.substring(0, 4);
      final month = _month!.substring(5, 7);
      final saved = record ?? MyEinvoice(number: 'CONS-$year$month', buyerName: 'General Public', status: 'submitted', kind: 'consolidated', at: state.now().toUtc().toIso8601String());
      rememberEinvoice(state, saved);
      await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => MyEinvoiceDetailScreen(record: saved)));
    } on MyToolFailure catch (failure) {
      _heldToken = '';
      if (mounted) {
        setState(() {
          _problems = failure.problems;
          _error = failure.code == 'BLOCKED' ? (failure.problems.isEmpty ? failure.detail : '') : t.errorText(failure.code);
          if (failure.code == 'CONSOLIDATION_WINDOW_CLOSED') _late = true;
        });
        _reveal();
      }
    } on MycaApiException catch (error) {
      if (mounted) {
        setState(() => _error = myErrorMessage(t, error));
        _reveal();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirmSheet(MyStrings t, MyHeld held) {
    num figure(String key) => held.figures[key] is num ? held.figures[key] as num : 0;
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) {
        final text = Theme.of(context).textTheme;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(t.confirmConsolidatedTitle, style: text.titleLarge),
                  const SizedBox(height: 8),
                  if (held.summary.isNotEmpty) Text(held.summary, style: text.bodyLarge),
                  if (held.figures.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    MyAmountLine(label: t.net, amount: ringgit(figure('net'))),
                    MyAmountLine(label: t.tax, amount: ringgit(figure('tax'))),
                    MyAmountLine(label: t.payable, amount: ringgit(figure('payable')), strong: true),
                  ],
                  for (final effect in held.effects) ...[const SizedBox(height: 8), Text('· $effect', style: text.bodyMedium)],
                  if (mySandbox(this.context)) ...[const SizedBox(height: 8), MyNote(t.sandboxBanner)],
                  const SizedBox(height: 16),
                  FilledButton(key: const Key('myCons.confirm'), onPressed: () => Navigator.of(context).pop(true), child: Text(t.confirmSend)),
                  const SizedBox(height: 8),
                  OutlinedButton(onPressed: () => Navigator.of(context).pop(false), child: Text(t.notYet)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _money(String key, TextEditingController controller, String label, {String? helper}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      key: Key('myCons.$key'),
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: (_) => _changed(),
      decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 3, errorText: _errors[key], errorMaxLines: 3),
    ),
  );

  Widget _line(MyStrings t, int index, _ReceiptLine line) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MyPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(t.lineN(index + 1), style: text.titleSmall)),
                if (_lines.length > 1)
                  IconButton(
                    key: Key('myCons.line$index.remove'),
                    tooltip: t.removeValue,
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () {
                      setState(() => _lines.removeAt(index).dispose());
                      _changed();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _money('line$index.amount', line.amount, t.receiptsTotal),
            _money('line$index.largest', line.largest, t.largestReceipt, helper: t.largestReceiptHelp),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextField(
                key: Key('myCons.line$index.receipts'),
                controller: line.receipts,
                maxLength: 100,
                onChanged: (_) => _changed(),
                decoration: InputDecoration(labelText: t.receiptRange, counterText: ''),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextField(
                key: Key('myCons.line$index.description'),
                controller: line.description,
                maxLength: 300,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => _changed(),
                decoration: InputDecoration(labelText: '${t.description} (${t.optional.toLowerCase()})', hintText: t.salesToPublic, counterText: ''),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: MyPicker<String>(
                key: Key('myCons.line$index.taxType'),
                label: t.taxType,
                value: line.taxType,
                items: [for (final code in myTaxTypes) (code, t.taxTypeName(code))],
                onChanged: (value) {
                  setState(() => line.taxType = value ?? '06');
                  _changed();
                },
              ),
            ),
            if (line.taxType != '06' && line.taxType != 'E') _money('line$index.rate', line.rate, t.taxRate),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final months = endedMonths(AppScope.of(context).now());
    return Scaffold(
      appBar: AppBar(title: Text(t.consolidatedTitle, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            if (mySandbox(context)) ...[MyNote(t.sandboxBanner), const SizedBox(height: 12)],
            MyNote(t.consolidatedIntro),
            const SizedBox(height: 12),
            MyPicker<String>(
              key: const Key('myCons.month'),
              label: t.month,
              value: _month,
              items: [for (final month in months) (month, t.monthLabel(int.parse(month.substring(0, 4)), int.parse(month.substring(5, 7))))],
              onChanged: (value) {
                setState(() => _month = value ?? _month);
                _changed();
              },
            ),
            MySection(t.lines),
            for (final (index, line) in _lines.indexed) _line(t, index, line),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('myCons.addLine'),
                onPressed: _lines.length >= 50
                    ? null
                    : () {
                        setState(() => _lines.add(_ReceiptLine()));
                        _changed();
                      },
                icon: const Icon(Icons.add),
                label: Text(t.addLine),
              ),
            ),
            SwitchListTile(
              key: const Key('myCons.late'),
              contentPadding: EdgeInsets.zero,
              title: Text(t.late),
              subtitle: Text(t.lateHelp),
              value: _late,
              onChanged: (on) {
                setState(() => _late = on);
                _changed();
              },
            ),
            if (_late)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  key: const Key('myCons.lateReason'),
                  controller: _lateReason,
                  maxLength: 300,
                  maxLines: 3,
                  minLines: 1,
                  onChanged: (_) => _changed(),
                  decoration: InputDecoration(labelText: t.lateReason, errorText: _errors['lateReason'], errorMaxLines: 2),
                ),
              ),
            const SizedBox(height: 4),
            if (_problems.isNotEmpty) ...[
              MyProblems(key: const Key('myCons.problems'), title: t.fixCount(_problems.length), problems: _problems),
              const SizedBox(height: 12),
            ],
            if (_error.isNotEmpty) ...[
              MyErrorBox(message: _error),
              const SizedBox(height: 12),
            ],
            KeyedSubtree(
              key: _endKey,
              child: MyBusyButton(
                key: const Key('myCons.send'),
                label: _heldToken.isEmpty ? t.checkAndSend : t.tryAgain,
                busyLabel: t.sending,
                busy: _busy && !_asking,
                onPressed: _busy ? null : _send,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
