import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
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
  final _choices = <String, String?>{};
  final _errors = <String, String>{};
  late String _owner = widget.owner;
  String _note = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    for (final f in widget.kind.fields) {
      final value = widget.fields[f.key];
      if (f.type == 'state' || f.type == 'term') {
        _choices[f.key] = value == null || '$value'.isEmpty ? null : '$value';
      } else {
        _controllers[f.key] = TextEditingController(text: f.type == 'money' ? dollarsTyped(value) : (value == null ? '' : '$value'));
      }
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    _errors.clear();
    final values = <String, Object?>{};
    for (final f in widget.kind.fields) {
      if (f.type == 'state' || f.type == 'term') {
        final v = _choices[f.key];
        if (v != null) values[f.key] = v;
        if (f.required && v == null) _errors[f.key] = 'Choose one.';
        continue;
      }
      final typed = _controllers[f.key]!.text.trim();
      if (typed.isEmpty) {
        if (f.required) _errors[f.key] = f.type == 'money' ? 'Enter the amount in box ${f.box}. Use 0 if it is empty.' : 'Enter this from the form.';
        continue;
      }
      if (f.type == 'money') {
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
      } else {
        values[f.key] = typed;
      }
    }
    if (_errors.isNotEmpty) return setState(() => _note = 'Some boxes need a look.');
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
      if (reply.posted) return Navigator.of(context).pop(true);
      setState(() => _note = reply.reply.isEmpty ? 'Not saved. Try again.' : reply.reply);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(UsFieldSpec f) {
    final label = f.box.isEmpty ? f.label : 'Box ${f.box} · ${f.label}';
    switch (f.type) {
      case 'state':
        return UsStateField(key: Key('usForm.${f.key}'), value: _choices[f.key], label: label, errorText: _errors[f.key], onChanged: (v) => setState(() => _choices[f.key] = v));
      case 'term':
        return DropdownButtonFormField<String>(
          isExpanded: true,
          key: Key('usForm.${f.key}'),
          initialValue: _choices[f.key],
          decoration: InputDecoration(labelText: label, errorText: _errors[f.key]),
          items: const [
            DropdownMenuItem(value: 'short', child: Text('Short-term (held one year or less)')),
            DropdownMenuItem(value: 'long', child: Text('Long-term (held more than a year)')),
          ],
          onChanged: (v) => setState(() => _choices[f.key] = v),
        );
      case 'money':
        return MoneyField(key: Key('usForm.${f.key}'), controller: _controllers[f.key]!, label: label, errorText: _errors[f.key]);
      default:
        return TextField(
          key: Key('usForm.${f.key}'),
          controller: _controllers[f.key],
          textCapitalization: f.type == 'text' ? TextCapitalization.words : TextCapitalization.characters,
          keyboardType: f.type == 'ein' ? TextInputType.number : TextInputType.text,
          decoration: InputDecoration(labelText: label, errorText: _errors[f.key]),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final withSpouse = widget.joint || _owner == 'spouse';
    return Scaffold(
      appBar: AppBar(title: Text(widget.id.isEmpty ? 'Add ${widget.kind.title}' : 'Edit ${widget.kind.title}')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Text(widget.kind.description, style: text.bodyLarge),
            if (widget.readNote.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
                child: Text(widget.readNote, style: text.bodyMedium),
              ),
            ],
            const SizedBox(height: 16),
            if (withSpouse) ...[
              const SectionLabel('Whose form is this?'),
              SegmentedButton<String>(
                key: const Key('usForm.owner'),
                segments: const [
                  ButtonSegment(value: 'taxpayer', label: Text('Mine')),
                  ButtonSegment(value: 'spouse', label: Text('My spouse\'s')),
                ],
                selected: {_owner},
                onSelectionChanged: (picked) => setState(() => _owner = picked.first),
              ),
              const SizedBox(height: 16),
            ],
            for (final f in widget.kind.fields) ...[_field(f), const SizedBox(height: 12)],
            if (_note.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(_note, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
            ],
            const SizedBox(height: 18),
            FilledButton(key: const Key('usForm.save'), onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save')),
            const SizedBox(height: 10),
            Text('Copy each box exactly as printed. Leave a box empty if it is blank on your form.', style: text.bodySmall?.copyWith(color: Palette.muted)),
          ],
        ),
      ),
    );
  }
}
