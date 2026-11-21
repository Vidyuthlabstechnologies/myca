import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../us/us_amended.dart';
import '../../us/us_return.dart';
import '../../us/us_text_scaler.dart';
import '../../widgets.dart';
import 'us_fields.dart';
import 'us_forms_screen.dart';
import 'us_interview_screen.dart';
import 'us_profile_screen.dart';
import 'us_review_screen.dart';

class UsAmendedScreen extends StatefulWidget {
  const UsAmendedScreen({super.key, required this.taxYear, this.joint = false});

  final int taxYear;
  final bool joint;

  @override
  State<UsAmendedScreen> createState() => _UsAmendedScreenState();
}

class _UsAmendedScreenState extends State<UsAmendedScreen> {
  Future<UsAmended>? _amended;
  final _explanation = TextEditingController();
  final _filedOn = TextEditingController();
  final _paid = TextEditingController();
  final _apply = TextEditingController();
  final _original = {for (final (id, _, _) in amendedOriginalFields) id: TextEditingController()};
  final _children = TextEditingController();
  final _other = TextEditingController();
  final _errors = <String, String>{};
  String? _status;
  String _savedExplanation = '';
  bool _typeOriginal = false;
  bool _busy = false;
  String _note = '';

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _amended ??= _load();
  }

  @override
  void dispose() {
    for (final c in [_explanation, _filedOn, _paid, _apply, _children, _other, ..._original.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<UsAmended> _load() async {
    final amended = await loadAmended(_api, widget.taxYear);
    if (amended.started && _explanation.text == _savedExplanation) {
      _explanation.text = amended.explanation;
      _savedExplanation = amended.explanation;
    }
    return amended;
  }

  void _reload() => setState(() {
        _amended = _load();
      });

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _reload();
  }

  Map<String, Object?>? _typedOriginal() {
    final figures = <String, num>{};
    for (final (id, label, required) in amendedOriginalFields) {
      final typed = _original[id]!.text.trim();
      if (typed.isEmpty) {
        if (required) _errors['original.$id'] = 'Copy this from the return you filed.';
        continue;
      }
      final amount = id == 'agi' ? parseSignedDollars(typed) : parseDollars(typed);
      if (amount == null) {
        _errors['original.$id'] = '$label is an amount, like 1234.56.';
      } else {
        figures[id] = amount;
      }
    }
    if (_status == null) _errors['original.status'] = 'Choose the filing status on the return you filed.';
    int? count(TextEditingController c, String key) {
      if (c.text.trim().isEmpty) return null;
      final n = int.tryParse(c.text.trim());
      if (n == null || n < 0 || n > 20) _errors[key] = 'A number from 0 to 20.';
      return n;
    }

    final children = count(_children, 'original.children');
    final other = count(_other, 'original.other');
    if (_errors.isNotEmpty) return null;
    return amendedOriginalArgs(figures, filingStatus: _status ?? '', children: children, other: other);
  }

  String? _date(TextEditingController c, String key) {
    final typed = c.text.trim();
    if (typed.isEmpty) return null;
    final iso = isoFromUsDate(typed);
    if (iso == null) _errors[key] = 'Enter the date as MM/DD/YYYY.';
    return iso;
  }

  num? _amount(TextEditingController c, String key) {
    final typed = c.text.trim();
    if (typed.isEmpty) return null;
    final amount = parseDollars(typed);
    if (amount == null) _errors[key] = 'Enter dollars and cents, like 1234.56.';
    return amount;
  }

  Future<void> _send(String tool, Map<String, Object?> args, String failed) async {
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(_api, tool, {'taxYear': '${widget.taxYear}', ...args});
      if (!mounted) return;
      if (!reply.posted) {
        final explained = reply.reply.isNotEmpty ? reply.reply : reply.blockers.isNotEmpty ? reply.blockers.join(' ') : failed;
        setState(() {
          _note = explained;
          if (tool == 'start_us_amended_return' && !_typeOriginal && explained.contains('figures')) _typeOriginal = true;
        });
        return;
      }
      _savedExplanation = '';
      _explanation.clear();
      _filedOn.clear();
      _paid.clear();
      _apply.clear();
      _reload();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _start(UsAmended amended, {bool restart = false}) async {
    setState(_errors.clear);
    final args = <String, Object?>{if (restart) 'restart': true};
    if (_typeOriginal || !amended.acceptedInMyca) {
      final original = _typedOriginal();
      final filedOn = _date(_filedOn, 'filedOn');
      if (original == null || _errors.isNotEmpty) return setState(() => _note = 'Some figures need a look. They are marked in red.');
      args.addAll(original);
      if (filedOn != null) args['originalFiledOn'] = filedOn;
    }
    final explanation = _explanation.text.trim();
    if (explanation.isNotEmpty) args['explanation'] = explanation;
    await _send('start_us_amended_return', args, 'The amended return was not started. Check your connection and try again.');
  }

  Future<void> _restart(UsAmended amended) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Start the amendment over?'),
        content: const Text('The original figures are taken again and your explanation is cleared. The changes you made to the return stay.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Keep it')),
          TextButton(key: const Key('usAmend.confirmRestart'), onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Start over')),
        ],
      ),
    );
    if (sure == true && mounted) await _start(amended, restart: true);
  }

  Future<void> _save(UsAmended amended) async {
    setState(_errors.clear);
    final args = <String, Object?>{};
    final explanation = _explanation.text.trim();
    if (explanation != amended.explanation) args['explanation'] = explanation.isEmpty ? null : explanation;
    final filedOn = _date(_filedOn, 'filedOn');
    final paid = _amount(_paid, 'paid');
    final apply = _amount(_apply, 'apply');
    if (_errors.isNotEmpty) return setState(() => _note = 'Some boxes need a look. They are marked in red.');
    if (filedOn != null) args['originalFiledOn'] = filedOn;
    if (paid != null) args['paidWithReturn'] = paid;
    if (apply != null) args['applyToNextYear'] = apply;
    if (args.isEmpty) return setState(() => _note = 'Nothing new to save. Change the explanation or a date first.');
    await _send('set_us_amended_return', args, 'Not saved. Check your connection and tap Save again.');
  }

  Widget _result(UsAmended a) {
    final text = Theme.of(context).textTheme;
    final String label;
    final String amount;
    if (a.owed > 0) {
      label = 'You owe the IRS more';
      amount = dollars(a.owed);
    } else if (a.refund > 0) {
      label = 'Your extra refund';
      amount = dollars(a.refund);
    } else if (a.appliedToNextYear > 0) {
      label = 'Applied to next year\'s estimated tax';
      amount = dollars(a.appliedToNextYear);
    } else {
      label = 'No change to your refund or what you owe';
      amount = '';
    }
    final total = a.line('11');
    return Container(
      key: const Key('usAmend.result'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: a.owed > 0 ? context.myca.warnSoft : context.myca.accentSoft, borderRadius: BorderRadius.circular(radiusCard)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, key: const Key('usAmend.resultLabel'), style: text.bodyLarge?.copyWith(color: context.myca.ink)),
          if (amount.isNotEmpty) ...[
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(amount, key: const Key('usAmend.amount'), maxLines: 1, style: text.displaySmall?.copyWith(color: a.owed > 0 ? context.myca.warn : context.myca.accent, fontFeatures: moneyFigures)),
            ),
          ],
          if (total != null) ...[
            const SizedBox(height: 6),
            Text('Total tax ${dollars(total.original)} on the return you filed, ${dollars(total.corrected)} now.', style: text.bodyMedium?.copyWith(color: context.myca.ink)),
          ],
          if (a.claimBy.isNotEmpty && (a.refund > 0 || a.appliedToNextYear > 0)) ...[
            const SizedBox(height: 6),
            Text('Claim it by ${longDate(a.claimBy)}.', key: const Key('usAmend.claimBy'), style: text.bodySmall?.copyWith(color: context.myca.ink)),
          ],
        ],
      ),
    );
  }

  Widget _changes(UsAmended a) {
    final text = Theme.of(context).textTheme;
    final changed = a.changed;
    if (changed.isEmpty && !a.dependentsChanged) {
      return const EmptyNote(text: 'Nothing has changed yet. Fix your return below: each change shows here next to what you filed.');
    }
    return Panel(
      children: [
        for (final l in changed)
          Padding(
            key: Key('usAmend.line.${l.line}'),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Line ${l.line} · ${l.label}', style: text.bodyMedium?.copyWith(color: context.myca.ink)),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 12,
                  runSpacing: 2,
                  children: [
                    Text('Filed ${dollars(l.original)}', style: text.bodySmall?.copyWith(color: context.myca.muted, fontFeatures: moneyFigures)),
                    Text('Now ${dollars(l.corrected)}', style: text.bodySmall?.copyWith(color: context.myca.ink, fontFeatures: moneyFigures)),
                    Text('${l.change > 0 ? 'Up' : 'Down'} ${dollars(l.change.abs())}', style: text.bodySmall?.copyWith(color: l.change > 0 ? context.myca.warn : context.myca.accent, fontFeatures: moneyFigures)),
                  ],
                ),
              ],
            ),
          ),
        if (a.dependentsChanged)
          Padding(
            key: const Key('usAmend.dependents'),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Text('Your dependents changed. Part I lists them.', style: text.bodyMedium?.copyWith(color: context.myca.ink)),
          ),
      ],
    );
  }

  Widget _fixes() => Panel(
        children: [
          RowCard(
            key: const Key('usAmend.fix.forms'),
            leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
            title: 'Tax documents',
            subtitle: 'Add a form that came late or correct one you entered',
            trailing: const Chevron(),
            onTap: () => _open(UsFormsScreen(taxYear: widget.taxYear, joint: widget.joint)),
          ),
          RowCard(
            key: const Key('usAmend.fix.interview'),
            leading: const TintTile(tint: Tint.ask, mark: Mark.ask),
            title: 'A few questions',
            subtitle: 'A credit or deduction you missed',
            trailing: const Chevron(),
            onTap: () => _open(UsInterviewScreen(taxYear: widget.taxYear)),
          ),
          RowCard(
            key: const Key('usAmend.fix.profile'),
            leading: const TintTile(tint: Tint.ask, mark: Mark.people),
            title: 'About you',
            subtitle: 'Filing status or dependents',
            trailing: const Chevron(),
            onTap: () => _open(UsProfileScreen(taxYear: widget.taxYear)),
          ),
          RowCard(
            key: const Key('usAmend.fix.review'),
            leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
            title: 'Corrected Form 1040',
            subtitle: 'Every line of the return as it is now',
            trailing: const Chevron(),
            onTap: () => _open(UsReviewScreen(taxYear: widget.taxYear)),
          ),
        ],
      );

  Widget _check(AmendedCheck c) {
    final text = Theme.of(context).textTheme;
    return Container(
      key: Key('usAmend.check.${c.code}'),
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: c.blocking ? context.myca.dangerSoft : context.myca.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.message, style: text.bodyMedium?.copyWith(color: context.myca.ink)),
          if (c.fix.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(c.fix, style: text.bodySmall?.copyWith(color: context.myca.ink)),
          ],
        ],
      ),
    );
  }

  Widget _explanationField() => TextField(
        key: const Key('usAmend.explanation'),
        controller: _explanation,
        minLines: 3,
        maxLines: 8,
        maxLength: 4000,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          labelText: 'Why you are amending (Part II)',
          helperText: 'Say what changed and why, for example: added a 1099-INT from First Bank that arrived after I filed.',
          helperMaxLines: 3,
          alignLabelWithHint: true,
        ),
      );

  Widget _dateField(String key, String label) => TextField(
        key: Key('usAmend.$key'),
        controller: _filedOn,
        keyboardType: TextInputType.datetime,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9/]')), LengthLimitingTextInputFormatter(10)],
        decoration: InputDecoration(labelText: label, hintText: 'MM/DD/YYYY', errorText: _errors[key]),
      );

  List<Widget> _originalForm() {
    final text = Theme.of(context).textTheme;
    return [
      const SectionLabel('The return you filed'),
      Text('Copy these from the ${widget.taxYear} Form 1040 as you filed it, or as the IRS last changed it. Leave a line empty if it was blank.', style: text.bodyMedium),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(
        key: const Key('usAmend.original.status'),
        initialValue: _status,
        isExpanded: true,
        decoration: InputDecoration(labelText: 'Filing status on that return', errorText: _errors['original.status']),
        items: [for (final (code, label, _) in filingStatuses) DropdownMenuItem(value: code, child: Text(label))],
        onChanged: (v) => setState(() => _status = v),
      ),
      for (final (id, label, required) in amendedOriginalFields)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: MoneyField(key: Key('usAmend.original.$id'), controller: _original[id]!, label: label, helper: required ? 'Required' : null, errorText: _errors['original.$id'], signed: id == 'agi'),
        ),
      for (final (key, controller, label) in [('children', _children, 'Dependent children on that return'), ('other', _other, 'Other dependents on that return')])
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            key: Key('usAmend.original.$key'),
            controller: controller,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(2)],
            decoration: InputDecoration(labelText: label, errorText: _errors['original.$key']),
          ),
        ),
      const SizedBox(height: 8),
      _dateField('filedOn', 'Date you filed it'),
      const SizedBox(height: 16),
    ];
  }

  List<Widget> _notStarted(UsAmended a) {
    final text = Theme.of(context).textTheme;
    final typed = _typeOriginal || !a.acceptedInMyca;
    return [
      Text('Fix a return you already filed', style: text.titleLarge),
      const SizedBox(height: 8),
      Text('Form 1040-X corrects a filed return: a W-2 or 1099 that came late, a credit you missed, a dependent or your filing status. Change only what was wrong; MyCA works out the difference.', style: text.bodyLarge),
      const SizedBox(height: 12),
      if (a.acceptedInMyca && !_typeOriginal)
        Text('The IRS accepted the return MyCA filed, so it is the original. Nothing to copy.', key: const Key('usAmend.fromMyca'), style: text.bodyMedium?.copyWith(color: context.myca.muted))
      else
        ..._originalForm(),
      const SizedBox(height: 8),
      _explanationField(),
      if (_note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_note, key: const Key('usAmend.note'), style: TextStyle(color: context.myca.danger, fontWeight: FontWeight.w500))),
      const SizedBox(height: 16),
      FilledButton(key: const Key('usAmend.start'), onPressed: _busy ? null : () => _start(a), child: Text(_busy ? 'Starting…' : 'Start my amended return')),
      if (!typed) ...[
        const SizedBox(height: 4),
        TextButton(key: const Key('usAmend.typeOriginal'), onPressed: () => setState(() => _typeOriginal = true), child: const Text('The IRS changed my return after I filed')),
      ],
    ];
  }

  List<Widget> _started(UsAmended a) {
    final text = Theme.of(context).textTheme;
    final blocking = a.checks.where((c) => c.blocking).toList();
    final warnings = a.checks.where((c) => !c.blocking).toList();
    final needsDate = a.has('AMENDED_FILED_ON_REQUIRED') || a.has('AMENDED_FILED_ON_INVALID');
    return [
      _result(a),
      const SizedBox(height: 18),
      const SectionLabel('What changed'),
      _changes(a),
      const SizedBox(height: 18),
      const SectionLabel('Change your return'),
      _fixes(),
      if (a.returnErrors > 0) ...[
        const SizedBox(height: 8),
        Text('The corrected return has ${a.returnErrors == 1 ? 'one problem' : '${a.returnErrors} problems'}. Open Corrected Form 1040 to fix ${a.returnErrors == 1 ? 'it' : 'them'}.', key: const Key('usAmend.returnErrors'), style: TextStyle(color: context.myca.danger)),
      ],
      const SizedBox(height: 18),
      const SectionLabel('Explain the changes'),
      _explanationField(),
      if (needsDate) ...[
        const SizedBox(height: 8),
        _dateField('filedOn', 'Date you filed the original return'),
      ],
      if (a.has('AMENDED_PAYMENT_ASSUMED')) ...[
        const SizedBox(height: 8),
        MoneyField(key: const Key('usAmend.paid'), controller: _paid, label: 'Paid with the original return or after it', helper: 'Leave out interest and penalties (line 16)', errorText: _errors['paid']),
      ],
      if (a.refund > 0 || a.appliedToNextYear > 0) ...[
        const SizedBox(height: 8),
        MoneyField(key: const Key('usAmend.apply'), controller: _apply, label: 'Apply to next year\'s estimated tax', helper: 'Leave empty to get it all back (line 23)', errorText: _errors['apply']),
      ],
      if (_note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_note, key: const Key('usAmend.note'), style: TextStyle(color: context.myca.danger, fontWeight: FontWeight.w500))),
      const SizedBox(height: 12),
      FilledButton(key: const Key('usAmend.save'), onPressed: _busy ? null : () => _save(a), child: Text(_busy ? 'Saving…' : 'Save')),
      if (blocking.isNotEmpty || warnings.isNotEmpty) ...[
        const SizedBox(height: 18),
        SectionLabel(blocking.isEmpty ? 'Check before you file' : 'Before you can file'),
        for (final c in [...blocking, ...warnings]) _check(c),
      ],
      const SizedBox(height: 18),
      const SectionLabel('Filing it'),
      Container(
        key: const Key('usAmend.filing'),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: context.myca.surface, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: context.myca.line)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a.ready ? 'Ready to file.' : 'Fix what is listed above first.', style: text.titleMedium?.copyWith(color: context.myca.ink)),
            if (a.efileReason.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(a.efileReason, style: text.bodyMedium?.copyWith(color: context.myca.ink)),
            ],
            if (!a.efileAllowed) ...[
              const SizedBox(height: 4),
              Text('Mail the signed Form 1040-X with the corrected Form 1040 and every changed schedule.', style: text.bodySmall?.copyWith(color: context.myca.ink)),
            ],
          ],
        ),
      ),
      const SizedBox(height: 12),
      TextButton(key: const Key('usAmend.restart'), onPressed: _busy ? null : () => _restart(a), child: const Text('Start the amendment over')),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Amend your return')),
      body: SafeArea(
        child: FutureBuilder<UsAmended>(
          future: _amended,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (loaded.hasError) return UsLoadError(message: usLoadProblem(loaded.error, 'Your amended return could not be loaded.'), onRetry: _reload);
            final amended = loaded.data!;
            return ListView(
              key: const Key('usAmend.list'),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(wholeWords('${widget.taxYear} Form 1040-X'), key: const Key('usAmend.title'), style: text.headlineSmall),
                const SizedBox(height: 12),
                ...(amended.started ? _started(amended) : _notStarted(amended)),
              ],
            );
          },
        ),
      ),
    );
  }
}
