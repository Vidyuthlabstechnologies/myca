import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import '../../my/my_turnover.dart';
import 'my_widgets.dart';

String _isoDay(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

String _ringgitWhole(num value) => value == value.roundToDouble() ? ringgit(value).replaceAll(RegExp(r'\.00$'), '') : ringgit(value);

class MyObligationCard extends StatefulWidget {
  const MyObligationCard({super.key, required this.business});

  final String business;

  @override
  State<MyObligationCard> createState() => _MyObligationCardState();
}

class _MyObligationCardState extends State<MyObligationCard> {
  bool _started = false;
  bool _loading = true;
  MyTurnover? _turnover;
  MyObligation? _answer;
  String _error = '';
  int _round = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _load();
  }

  @override
  void didUpdateWidget(MyObligationCard old) {
    super.didUpdateWidget(old);
    if (old.business == widget.business) return;
    setState(() {
      _round += 1;
      _loading = true;
      _turnover = null;
      _answer = null;
      _error = '';
    });
    _load();
  }

  Future<void> _load() async {
    final business = widget.business;
    final saved = await myTurnoverStore.load(business);
    if (!mounted || business != widget.business) return;
    setState(() => _turnover = saved);
    if (saved == null) {
      setState(() => _loading = false);
      return;
    }
    await _ask(saved);
  }

  Future<void> _ask(MyTurnover turnover) async {
    final state = AppScope.of(context);
    final t = MyStrings.of(context);
    final round = ++_round;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final answer = await MyTools(state.api).einvoiceRequired(annualTurnover: turnover.annual, date: _isoDay(state.now()), relatedCompanyTurnover: turnover.related);
      if (mounted && round == _round) setState(() => _answer = answer);
    } catch (error) {
      if (mounted && round == _round) setState(() => _error = error is MyToolFailure && error.code == 'RULE_NOT_IN_FORCE' ? t.obligationRuleMissing : myErrorMessage(t, error));
    } finally {
      if (mounted && round == _round) setState(() => _loading = false);
    }
  }

  Future<void> _edit() async {
    final entered = await showModalBottomSheet<MyTurnover>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TurnoverSheet(initial: _turnover),
    );
    if (entered == null || !mounted) return;
    setState(() {
      _turnover = entered;
      _answer = null;
    });
    await myTurnoverStore.save(widget.business, entered);
    if (mounted) await _ask(entered);
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    final turnover = _turnover;
    final answer = _answer;
    final children = <Widget>[];
    if (_loading && answer == null) {
      children.add(const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())));
    } else if (turnover == null) {
      children.addAll([
        Text(t.obligationAsk, style: text.bodyMedium),
        const SizedBox(height: 6),
        Text(t.exemptionNote, key: const Key('myHome.exemption'), style: text.bodySmall?.copyWith(color: palette.muted)),
        const SizedBox(height: 10),
        FilledButton.tonal(key: const Key('myHome.enterTurnover'), onPressed: _edit, child: Text(t.enterTurnover, textAlign: TextAlign.center)),
      ]);
    } else if (_error.isNotEmpty) {
      children.add(MyErrorBox(message: _error, onRetry: () => _ask(turnover)));
    } else if (answer != null) {
      final limit = _ringgitWhole(answer.exemptBelow);
      final amount = _ringgitWhole(turnover.annual);
      final later = !answer.exempt && !answer.required && answer.startsFrom.isNotEmpty;
      final (title, chip, background, foreground) = answer.exempt
          ? (t.obligationExemptTitle, t.obligationExempt, palette.accentSoft, palette.accent)
          : later
          ? (t.obligationLaterTitle(dayMonthYear(answer.startsFrom)), t.obligationLaterChip, palette.warnSoft, palette.warn)
          : (t.obligationRequiredTitle, t.obligationRequired, palette.warnSoft, palette.warn);
      final reason = answer.relatedBlocks ? t.reasonRelated : (answer.exempt ? t.reasonExempt(amount, limit) : t.reasonRequired(amount, limit));
      children.addAll([
        Wrap(
          spacing: 8,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Container(
              key: Key(answer.exempt ? 'myHome.obligation.exempt' : 'myHome.obligation.required'),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(99)),
              child: Text(chip, style: text.labelMedium?.copyWith(color: foreground, fontWeight: FontWeight.w600)),
            ),
            Text(title, style: text.titleSmall),
          ],
        ),
        const SizedBox(height: 6),
        Text(reason, key: const Key('myHome.obligation.reason'), style: text.bodyMedium),
        if (answer.exempt) ...[const SizedBox(height: 4), Text(t.exemptStillSend, style: text.bodySmall?.copyWith(color: palette.muted))],
        if (answer.unreviewed) ...[const SizedBox(height: 4), Text(t.unreviewed, style: text.bodySmall?.copyWith(color: palette.muted))],
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(key: const Key('myHome.changeTurnover'), onPressed: _edit, child: Text(t.changeTurnover)),
        ),
      ]);
    }
    return MyPanel(
      key: const Key('myHome.obligation'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
    );
  }
}

class _TurnoverSheet extends StatefulWidget {
  const _TurnoverSheet({this.initial});

  final MyTurnover? initial;

  @override
  State<_TurnoverSheet> createState() => _TurnoverSheetState();
}

class _TurnoverSheetState extends State<_TurnoverSheet> {
  late final _annual = TextEditingController(text: widget.initial == null ? '' : '${widget.initial!.annual}');
  late final _related = TextEditingController(text: widget.initial?.related == null ? '' : '${widget.initial!.related}');
  String _annualError = '';
  String _relatedError = '';

  @override
  void dispose() {
    _annual.dispose();
    _related.dispose();
    super.dispose();
  }

  void _save() {
    final t = MyStrings.of(context);
    final annual = parseMyAmount(_annual.text);
    final relatedTyped = _related.text.trim();
    final related = relatedTyped.isEmpty ? null : parseMyAmount(relatedTyped);
    final annualOk = annual != null && annual >= 0 && annual <= myLargestAmount;
    final relatedOk = relatedTyped.isEmpty || (related != null && related >= 0 && related <= myLargestAmount);
    setState(() {
      _annualError = annualOk ? '' : t.turnoverBad;
      _relatedError = relatedOk ? '' : t.turnoverBad;
    });
    if (!annualOk || !relatedOk) return;
    Navigator.of(context).pop(MyTurnover(annual: annual, related: related));
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(t.turnoverSheetTitle, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(
                key: const Key('myTurnover.annual'),
                controller: _annual,
                autofocus: true,
                maxLength: 18,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: t.turnoverLabel, helperText: t.turnoverHelp, helperMaxLines: 3, errorText: _annualError.isEmpty ? null : _annualError, errorMaxLines: 3, counterText: ''),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('myTurnover.related'),
                controller: _related,
                maxLength: 18,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: t.relatedLabel, helperText: t.relatedHelp, helperMaxLines: 4, errorText: _relatedError.isEmpty ? null : _relatedError, errorMaxLines: 3, counterText: ''),
              ),
              const SizedBox(height: 16),
              FilledButton(key: const Key('myTurnover.save'), onPressed: _save, child: Text(t.save)),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: Text(t.cancel)),
            ],
          ),
        ),
      ),
    );
  }
}
