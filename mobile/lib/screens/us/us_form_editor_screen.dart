import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import 'us_fields.dart';

class UsFormEditorScreen extends StatefulWidget {
  const UsFormEditorScreen({
    super.key,
    required this.taxYear,
    required this.kind,
    this.fields = const {},
    this.documentSha = '',
    this.id = '',
    this.owner = 'taxpayer',
    this.readNote = '',
    this.joint = false,
  });

  final bool joint;

  final int taxYear;
  final UsFormKind kind;
  final Map<String, Object?> fields;
  final String documentSha;
  final String id;
  final String owner;
  final String readNote;

  @override
  State<UsFormEditorScreen> createState() => _UsFormEditorScreenState();
}

class _UsFormEditorScreenState extends State<UsFormEditorScreen> {
  final _controllers = <String, TextEditingController>{};
  final _initialText = <String, String>{};
  final _choices = <String, String?>{};
  final _checks = <String, bool>{};
  final _codeRows = <String, List<(TextEditingController, TextEditingController)>>{};
  final _errors = <String, String>{};
  final _changes = ValueNotifier<int>(0);
  late String _owner = widget.owner;
  late String _saved;
  String _note = '';
  bool _busy = false;
  bool _done = false;

  bool get _various => !widget.kind.ownRecords;

  static bool _isCodeList(UsFieldSpec f, Object? value) => f.key == 'box12' || (f.type == 'code' && value is List);

  static String _typedDate(Object? value) {
    final text = value == null ? '' : '$value';
    if (text.toUpperCase() == 'VARIOUS') return 'Various';
    return RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text) ? usDate(text) : text;
  }

  @override
  void initState() {
    super.initState();
    for (final f in widget.kind.fields) {
      final value = widget.fields[f.key];
      if (f.type == 'state' || f.type == 'term') {
        _choices[f.key] = value == null || '$value'.isEmpty ? null : '$value';
      } else if (f.choices != null) {
        _choices[f.key] = f.choices!.any((c) => c.$1 == '$value') ? '$value' : null;
      } else if (f.type == 'yesno') {
        _checks[f.key] = value == true;
      } else if (_isCodeList(f, value)) {
        _codeRows[f.key] = [
          for (final row in value is List ? value : const [])
            if (row is Map) (TextEditingController(text: '${row['code'] ?? ''}'), TextEditingController(text: dollarsTyped(row['amount']))),
        ];
      } else if (f.known) {
        _controllers[f.key] = TextEditingController(text: f.type == 'money' ? dollarsTyped(value) : f.type == 'date' ? _typedDate(value) : (value == null ? '' : '$value'));
      } else if (value == null || value is String || value is num) {
        _controllers[f.key] = TextEditingController(text: value == null ? '' : '$value');
      }
      final c = _controllers[f.key];
      if (c != null) _initialText[f.key] = c.text;
    }
    _saved = widget.documentSha.isEmpty ? _snapshot() : '';
  }

  Iterable<TextEditingController> get _allControllers => [
        ..._controllers.values,
        for (final rows in _codeRows.values)
          for (final (code, amount) in rows) ...[code, amount],
      ];

  String _snapshot() => typedSnapshot(_allControllers, [_owner, ..._choices.values, ..._checks.values, for (final rows in _codeRows.values) rows.length]);

  bool get _dirty => !_done && _snapshot() != _saved;

  void _changed() => _changes.value++;

  @override
  void dispose() {
    for (final c in _allControllers) {
      c.dispose();
    }
    _changes.dispose();
    super.dispose();
  }

  String _requiredMessage(UsFieldSpec f) => switch (f.type) {
        'money' => f.box.isEmpty ? 'Enter the amount. Use 0 if it is blank on your form.' : 'Enter the amount in box ${f.box}. Use 0 if it is blank on your form.',
        'ein' => 'Enter the nine-digit EIN from the form.',
        'date' => 'Enter the date as MM/DD/YYYY.',
        _ => f.box.isEmpty ? 'Copy this from your form.' : 'Copy box ${f.box} from your form.',
      };

  void _readCodeRows(UsFieldSpec f, Map<String, Object?> values) {
    final rows = <Map<String, Object?>>[];
    for (final (code, amount) in _codeRows[f.key]!) {
      final typedCode = code.text.trim().toUpperCase();
      final typedAmount = amount.text.trim();
      if (typedCode.isEmpty && typedAmount.isEmpty) continue;
      final money = parseDollars(typedAmount);
      if (!RegExp(r'^[A-Z]{1,2}$').hasMatch(typedCode) || money == null) {
        _errors[f.key] = 'Each line needs the letter code, like D or DD, and its amount.';
        return;
      }
      rows.add({'code': typedCode, 'amount': money});
    }
    if (rows.isEmpty && f.required) _errors[f.key] = _requiredMessage(f);
    values[f.key] = rows;
  }

  Future<void> _save() async {
    _errors.clear();
    final values = <String, Object?>{
      for (final entry in widget.fields.entries)
        if (!widget.kind.fields.any((f) => f.key == entry.key)) entry.key: entry.value,
    };
    for (final f in widget.kind.fields) {
      if (f.type == 'state' || f.type == 'term' || f.choices != null) {
        final v = _choices[f.key];
        if (v != null) values[f.key] = v;
        if (f.required && v == null) _errors[f.key] = 'Choose one.';
        continue;
      }
      if (f.type == 'yesno') {
        values[f.key] = _checks[f.key] ?? false;
        continue;
      }
      if (_codeRows.containsKey(f.key)) {
        _readCodeRows(f, values);
        continue;
      }
      final controller = _controllers[f.key];
      if (controller == null) {
        if (widget.fields.containsKey(f.key)) values[f.key] = widget.fields[f.key];
        continue;
      }
      final typed = controller.text.trim();
      if (!f.known) {
        if (typed == _initialText[f.key] && widget.fields.containsKey(f.key)) {
          values[f.key] = widget.fields[f.key];
        } else if (typed.isNotEmpty) {
          values[f.key] = typed;
        } else if (f.required) {
          _errors[f.key] = _requiredMessage(f);
        }
        continue;
      }
      if (typed.isEmpty) {
        if (f.required) _errors[f.key] = _requiredMessage(f);
        continue;
      }
      if (f.type == 'date') {
        if (_various && typed.toLowerCase() == 'various') {
          values[f.key] = 'VARIOUS';
        } else {
          final iso = isoFromUsDate(typed);
          if (iso == null) {
            _errors[f.key] = _various ? 'Enter the date as MM/DD/YYYY, or Various.' : 'Enter the date as MM/DD/YYYY.';
          } else {
            values[f.key] = iso;
          }
        }
      } else if (f.type == 'money') {
        final amount = parseDollars(typed);
        if (amount == null) {
          _errors[f.key] = 'Enter dollars and cents, like 1234.56.';
        } else {
          values[f.key] = amount;
        }
      } else if (f.type == 'ein') {
        final digits = typed.replaceAll(RegExp(r'\D'), '');
        if (digits.length != 9) {
          _errors[f.key] = 'An EIN has nine digits, like 12-3456789.';
        } else {
          values[f.key] = '${digits.substring(0, 2)}-${digits.substring(2)}';
        }
      } else if (f.type == 'days') {
        final days = int.tryParse(typed);
        if (days == null || days > 366) {
          _errors[f.key] = 'Enter a whole number of days, up to 366.';
        } else {
          values[f.key] = days;
        }
      } else if (f.type == 'code') {
        values[f.key] = typed.toUpperCase();
      } else {
        values[f.key] = typed;
      }
    }
    if (_errors.isNotEmpty) return setState(() => _note = 'Some boxes need a look. They are marked in red.');
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(AppScope.of(context).api, 'add_us_tax_form', {
        'taxYear': widget.taxYear,
        'kind': widget.kind.kind,
        if (widget.id.isNotEmpty) 'id': widget.id,
        'owner': _owner,
        'payer': values['payer'] ?? '',
        'fields': values,
        if (widget.documentSha.isNotEmpty) 'documentSha256': widget.documentSha,
      });
      if (!mounted) return;
      if (reply.posted) {
        _done = true;
        return Navigator.of(context).pop(true);
      }
      setState(() => _note = reply.reply.isEmpty ? 'Not saved. Check your connection and tap Save again.' : reply.reply);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _codeRowsField(UsFieldSpec f) {
    final text = Theme.of(context).textTheme;
    final rows = _codeRows[f.key]!;
    return Column(
      key: Key('usForm.${f.key}'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(f.boxLabel, style: text.titleSmall),
        if (f.box.isNotEmpty) Text(f.label, style: text.bodySmall?.copyWith(color: context.myca.muted)),
        Text('A letter code and an amount on each line, like D and 5000. Leave it empty if the box is blank.', style: text.bodySmall?.copyWith(color: context.myca.muted)),
        for (var i = 0; i < rows.length; i++)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 84,
                  child: TextField(
                    key: Key('usForm.${f.key}.$i.code'),
                    controller: rows[i].$1,
                    textCapitalization: TextCapitalization.characters,
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z]')), LengthLimitingTextInputFormatter(2)],
                    decoration: const InputDecoration(labelText: 'Code'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(child: MoneyField(key: Key('usForm.${f.key}.$i.amount'), controller: rows[i].$2, label: 'Amount')),
                IconButton(
                  key: Key('usForm.${f.key}.$i.remove'),
                  tooltip: 'Remove this line',
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() {
                    final (code, amount) = rows.removeAt(i);
                    code.dispose();
                    amount.dispose();
                    _changed();
                  }),
                ),
              ],
            ),
          ),
        if (_errors[f.key] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_errors[f.key]!, style: TextStyle(color: context.myca.danger))),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            key: Key('usForm.${f.key}.add'),
            onPressed: rows.length >= 8
                ? null
                : () => setState(() {
                      rows.add((TextEditingController(), TextEditingController()));
                      _changed();
                    }),
            child: Text(rows.isEmpty ? 'Add a code' : 'Add another code'),
          ),
        ),
      ],
    );
  }

  Widget _field(UsFieldSpec f) {
    final label = f.boxLabel;
    final helper = f.box.isEmpty ? null : f.label;
    if (_codeRows.containsKey(f.key)) return _codeRowsField(f);
    final choices = f.choices;
    if (choices != null) {
      return DropdownButtonFormField<String>(
        key: Key('usForm.${f.key}'),
        initialValue: _choices[f.key],
        isExpanded: true,
        decoration: InputDecoration(labelText: f.label, helperText: f.box.isEmpty ? null : 'Line ${f.box}', errorText: _errors[f.key]),
        items: [for (final (value, name) in choices) DropdownMenuItem(value: value, child: Text(name))],
        onChanged: (v) => setState(() {
          _choices[f.key] = v;
          _changed();
        }),
      );
    }
    switch (f.type) {
      case 'state':
        return UsStateField(
          key: Key('usForm.${f.key}'),
          value: _choices[f.key],
          label: label,
          helperText: helper,
          errorText: _errors[f.key],
          onChanged: (v) => setState(() {
            _choices[f.key] = v;
            _changed();
          }),
        );
      case 'term':
        return DropdownButtonFormField<String>(
          key: Key('usForm.${f.key}'),
          initialValue: _choices[f.key],
          isExpanded: true,
          decoration: InputDecoration(labelText: label, helperText: helper, errorText: _errors[f.key]),
          items: const [
            DropdownMenuItem(value: 'short', child: Text('Short-term (held one year or less)')),
            DropdownMenuItem(value: 'long', child: Text('Long-term (held more than a year)')),
          ],
          onChanged: (v) => setState(() {
            _choices[f.key] = v;
            _changed();
          }),
        );
      case 'yesno':
        return CheckboxListTile(
          key: Key('usForm.${f.key}'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _checks[f.key] ?? false,
          onChanged: (v) => setState(() {
            _checks[f.key] = v ?? false;
            _changed();
          }),
          title: Text(f.label),
          subtitle: Text(widget.kind.ownRecords ? 'Tick it if this applies.' : f.box.isEmpty ? 'Tick it if it is checked on your form.' : 'Box ${f.box}. Tick it if it is checked on your form.'),
        );
      case 'money':
        return MoneyField(key: Key('usForm.${f.key}'), controller: _controllers[f.key]!, label: label, helper: helper, errorText: _errors[f.key]);
      case 'days':
        return TextField(
          key: Key('usForm.${f.key}'),
          controller: _controllers[f.key],
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
          decoration: InputDecoration(labelText: f.label, helperText: 'Days in the year, 0 to 366', errorText: _errors[f.key]),
        );
      case 'date':
        return TextField(
          key: Key('usForm.${f.key}'),
          controller: _controllers[f.key],
          keyboardType: TextInputType.datetime,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9/A-Za-z]')), LengthLimitingTextInputFormatter(10)],
          decoration: InputDecoration(labelText: label, hintText: 'MM/DD/YYYY', helperText: _various ? (helper == null ? 'MM/DD/YYYY, or Various' : '$helper. MM/DD/YYYY, or Various') : helper ?? 'MM/DD/YYYY', errorText: _errors[f.key]),
        );
      case 'ein':
        return TextField(
          key: Key('usForm.${f.key}'),
          controller: _controllers[f.key],
          keyboardType: TextInputType.number,
          inputFormatters: [EinInputFormatter()],
          decoration: InputDecoration(labelText: label, hintText: '12-3456789', helperText: helper ?? 'Nine digits, like 12-3456789', errorText: _errors[f.key]),
        );
      default:
        final controller = _controllers[f.key];
        if (controller == null) {
          return InputDecorator(
            key: Key('usForm.${f.key}'),
            decoration: InputDecoration(labelText: label, helperText: 'Kept as it is. Update the app to change this box.'),
            child: Text(f.label),
          );
        }
        return TextField(
          key: Key('usForm.${f.key}'),
          controller: controller,
          textCapitalization: f.type == 'text' ? TextCapitalization.words : TextCapitalization.characters,
          decoration: InputDecoration(labelText: label, helperText: helper, errorText: _errors[f.key]),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final withSpouse = widget.joint || _owner == 'spouse';
    return UsLeaveGuard(
      dirty: () => _dirty,
      listenable: Listenable.merge([_changes, ..._allControllers]),
      child: Scaffold(
        appBar: AppBar(title: Text(widget.id.isEmpty ? 'Add ${widget.kind.title}' : 'Edit ${widget.kind.title}')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Text(widget.kind.description, style: text.bodyLarge),
              if (widget.readNote.isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  key: const Key('usForm.readNote'),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: context.myca.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
                  child: Text(widget.readNote, style: text.bodyMedium?.copyWith(color: context.myca.ink)),
                ),
              ],
              const SizedBox(height: 16),
              if (withSpouse) ...[
                const SectionLabel('Whose form is this?'),
                RadioGroup<String>(
                  key: const Key('usForm.owner'),
                  groupValue: _owner,
                  onChanged: (picked) => setState(() {
                    _owner = picked ?? _owner;
                    _changed();
                  }),
                  child: const Column(
                    children: [
                      RadioListTile<String>(key: Key('usForm.owner.taxpayer'), contentPadding: EdgeInsets.zero, value: 'taxpayer', title: Text('Mine')),
                      RadioListTile<String>(key: Key('usForm.owner.spouse'), contentPadding: EdgeInsets.zero, value: 'spouse', title: Text('My spouse\'s')),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],
              for (final f in widget.kind.fields) ...[_field(f), const SizedBox(height: 12)],
              if (_note.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(_note, key: const Key('usForm.note'), style: TextStyle(color: context.myca.danger, fontWeight: FontWeight.w500)),
              ],
              const SizedBox(height: 18),
              FilledButton(key: const Key('usForm.save'), onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save')),
              const SizedBox(height: 10),
              Text(widget.kind.ownRecords ? 'Take the amounts from your own records: leases, receipts and statements. Leave a line empty if it does not apply.' : 'Copy each box exactly as printed. Leave a box empty if it is blank on your form.', style: text.bodySmall?.copyWith(color: context.myca.muted)),
            ],
          ),
        ),
      ),
    );
  }
}
