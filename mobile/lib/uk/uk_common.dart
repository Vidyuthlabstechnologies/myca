import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets.dart';

const builtForMtd = 'Built for Making Tax Digital.';

const unreviewedWords = 'These rates are not yet reviewed by a UK tax adviser.';

Map<String, dynamic> ukMap(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> ukMaps(Object? value) => value is List ? [for (final v in value) if (v is Map) v.cast<String, dynamic>()] : const [];

String ukText(Object? value) => value == null ? '' : '$value';

num ukNum(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

num? ukNumOrNull(Object? value) => value is num ? value : null;

String gbTaxYearOn(DateTime day) {
  final start = day.month > 4 || (day.month == 4 && day.day >= 6) ? day.year : day.year - 1;
  return '$start-${((start + 1) % 100).toString().padLeft(2, '0')}';
}

String gbTaxYearBefore(String label) {
  final start = int.tryParse(label.split('-').first) ?? 0;
  final before = start - 1;
  return '$before-${((before + 1) % 100).toString().padLeft(2, '0')}';
}

String gbTaxYearWords(String label) {
  final start = int.tryParse(label.split('-').first);
  if (start == null) return label;
  return '6 Apr $start to 5 Apr ${start + 1}';
}

String gbDay(String iso) => iso.isEmpty ? '' : readableDay(iso.length >= 10 ? iso.substring(0, 10) : iso);

String gbDatesIn(String text) => text.replaceAllMapped(RegExp(r'\b\d{4}-\d{2}-\d{2}\b'), (m) => gbDay(m.group(0)!));

final _poundsAllowed = RegExp(r'^-?\d+(\.\d{1,2})?$');

String _poundsClean(String text) => text.replaceAll(RegExp(r'[£,\s]'), '');

double? poundsOf(String text) {
  final clean = _poundsClean(text);
  if (clean.isEmpty || !_poundsAllowed.hasMatch(clean)) return null;
  return double.parse(clean);
}

bool poundsInvalid(String text, {bool allowNegative = false}) {
  final clean = _poundsClean(text);
  if (clean.isEmpty) return false;
  if (!_poundsAllowed.hasMatch(clean)) return true;
  return !allowNegative && clean.startsWith('-');
}

String hmrcEnvironmentLabel(String environment) => switch (environment) {
  'mock' => 'MyCA simulator',
  'test' => 'HMRC sandbox',
  'live' => 'HMRC',
  _ => environment.isEmpty ? '' : environment,
};

const _errorWords = <String, String>{
  'BAD_TAX_YEAR': 'Choose a tax year such as 2026-27.',
  'RULES_MISSING_FOR_YEAR': 'MyCA does not have the rates for that tax year yet.',
  'RULES_MISSING': 'MyCA does not have the rules for that date yet.',
  'BAD_RESIDENCE': 'Choose where you live: England, Wales, Northern Ireland or Scotland.',
  'GB_VRN_MISSING': 'Save your VAT registration number in your details first.',
  'GB_NINO_MISSING': 'Save your National Insurance number in your details first.',
  'GB_TAXPAYER_IDS_MISSING': 'Save a VAT number or a National Insurance number in your details first.',
  'HMRC_NOT_CONFIGURED': 'The connection to HMRC is not set up on this MyCA service yet.',
  'HMRC_STATE_MISMATCH': 'That code is from a different sign-in. Start connecting again.',
  'VAT_RETURN_ALREADY_SENT': 'The return for this period has already been sent.',
  'VAT_PERIOD_ALREADY_FILED': 'HMRC already has a return for this period.',
  'VAT_RETURN_NOT_READY': 'The return needs fixing before HMRC will take it.',
  'FLAT_RATE_NEEDED': 'Save your flat rate percentage in your details first.',
  'BAD_PERIOD': 'Check the period dates.',
  'PERIOD_OUTSIDE_TAX_YEAR': 'The period must fall inside the tax year.',
  'BAD_BUSINESS_ID': 'Choose the business HMRC knows you by. Sync with HMRC to list them.',
  'BUSINESS_KIND_MISMATCH': 'That business is a different kind at HMRC.',
  'CONSOLIDATED_AND_ITEMISED': 'Give either one expenses total or each expense, not both.',
  'DECLARATION_REQUIRED': 'Tick the declaration first.',
  'CALCULATION_NOT_FOUND': 'Ask HMRC for the final calculation first.',
  'WRONG_CALCULATION_TYPE': 'The final declaration needs the final calculation, not an in-year one.',
  'FINAL_DECLARATION_ALREADY_SENT': 'The final declaration for this tax year has already been sent.',
  'HMRC_SYNC_FAILED': 'HMRC did not answer. Try again in a few minutes.',
  'GB_TAXPAYER_INVALID': 'Some numbers need a look.',
};

String ukErrorWords(Object? result, {String fallback = 'That did not work. Try again.'}) {
  final map = ukMap(result);
  final code = ukText(map['error']);
  if (_errorWords.containsKey(code)) return _errorWords[code]!;
  final hint = ukText(map['hint']);
  if (hint.isNotEmpty) return hint;
  final message = ukText(map['message']);
  return message.isNotEmpty ? message : fallback;
}

bool ukOk(Object? result) => ukMap(result)['ok'] != false && ukMap(result)['data'] is Map;

Future<Object?> ukQuery(MycaApi api, String tool, [Map<String, Object?> args = const {}]) async {
  try {
    return await api.query(tool, args);
  } on MycaApiException catch (err) {
    return {'ok': false, 'error': 'REQUEST_FAILED', 'message': err.message};
  }
}

Future<ChatReply> proposeAndConfirm(MycaApi api, String tool, Map<String, Object?> args) async {
  final reply = await api.propose(tool, args);
  final preview = reply.preview;
  if (preview == null) return reply;
  return api.confirm(preview.token);
}

String replyProblem(ChatReply reply, String tool, {String fallback = 'Nothing was sent. Try again.'}) {
  for (final t in reply.tools) {
    if (t['name'] == tool && ukMap(t['result'])['ok'] == false) return ukErrorWords(t['result'], fallback: reply.reply.isEmpty ? fallback : reply.reply);
  }
  return reply.reply.isEmpty ? fallback : reply.reply;
}

class UkMoneyField extends StatelessWidget {
  const UkMoneyField({super.key, required this.controller, required this.label, this.helper, this.error, this.onChanged});

  final TextEditingController controller;
  final String label;
  final String? helper;
  final String? error;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,£ ]')), LengthLimitingTextInputFormatter(16)],
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        prefixText: '£ ',
        helperText: helper,
        helperMaxLines: 3,
        errorText: error ?? (poundsInvalid(controller.text) ? 'Enter an amount in pounds, like 1250.50' : null),
        errorMaxLines: 3,
      ),
    ),
  );
}

class UkCard extends StatelessWidget {
  const UkCard({super.key, required this.children, this.tone});

  final List<Widget> children;
  final Color? tone;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Material(
      color: tone ?? Palette.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard), side: const BorderSide(color: Palette.line)),
      child: SizedBox(
        width: double.infinity,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
        ),
      ),
    ),
  );
}

class UkFigure extends StatelessWidget {
  const UkFigure({super.key, required this.label, required this.amount, this.strong = false});

  final String label;
  final num amount;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final style = (strong ? text.titleMedium : text.bodyLarge)?.copyWith(fontFeatures: moneyFigures);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: AmountRow(
        align: CrossAxisAlignment.start,
        start: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Text(label, style: strong ? text.titleMedium : text.bodyLarge),
        ),
        amount: pounds(amount),
        style: style,
      ),
    );
  }
}

class UkNote extends StatelessWidget {
  const UkNote(this.words, {super.key, this.warn = false});

  final String words;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 6),
      child: Text(words, style: text.bodyMedium?.copyWith(color: warn ? Palette.warn : Palette.muted)),
    );
  }
}

class UkProblem extends StatelessWidget {
  const UkProblem(this.words, {super.key});

  final String words;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: Palette.dangerSoft, borderRadius: BorderRadius.circular(radiusControl)),
    child: Text(words, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Palette.danger)),
  );
}

class UkPreviewCard extends StatelessWidget {
  const UkPreviewCard({super.key, required this.preview, required this.busy, required this.onSend, required this.onCancel, this.sendLabel = 'Send to HMRC'});

  final ChatPreview preview;
  final bool busy;
  final VoidCallback onSend;
  final VoidCallback onCancel;
  final String sendLabel;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return UkCard(
      tone: Palette.warnSoft,
      children: [
        Text('NOT SENT YET', style: text.labelSmall),
        const SizedBox(height: 6),
        Text(preview.summary, style: text.titleMedium),
        for (final effect in preview.effects) UkNote(effect),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton(key: const Key('uk.preview.send'), onPressed: busy ? null : onSend, child: Text(sendLabel)),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(key: const Key('uk.preview.cancel'), onPressed: busy ? null : onCancel, child: const Text('Cancel')),
        ),
      ],
    );
  }
}

class UkWideButton extends StatelessWidget {
  const UkWideButton({super.key, required this.label, required this.onPressed, this.outlined = false});

  final String label;
  final VoidCallback? onPressed;
  final bool outlined;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: SizedBox(
      width: double.infinity,
      child: outlined ? OutlinedButton(onPressed: onPressed, child: Text(label, textAlign: TextAlign.center)) : FilledButton(onPressed: onPressed, child: Text(label, textAlign: TextAlign.center)),
    ),
  );
}

class UkFooter extends StatelessWidget {
  const UkFooter({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 18),
    child: Text(builtForMtd, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Palette.muted)),
  );
}

const ukPagePadding = EdgeInsets.fromLTRB(16, 12, 16, 40);
