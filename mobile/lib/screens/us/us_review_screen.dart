import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/us_filing_fee.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import 'us_forms_screen.dart';
import 'us_interview_screen.dart';
import 'us_profile_screen.dart';
import 'us_sign_screen.dart';

class UsReviewScreen extends StatefulWidget {
  const UsReviewScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsReviewScreen> createState() => _UsReviewScreenState();
}

class _UsReviewScreenState extends State<UsReviewScreen> {
  Future<UsReview>? _review;
  String _note = '';
  bool _saving = false;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _review ??= loadReview(_api, widget.taxYear);
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) {
      setState(() {
        _review = loadReview(_api, widget.taxYear);
      });
    }
  }

  Widget? _fixScreen(String step) => switch (step) {
    'profile' => UsProfileScreen(taxYear: widget.taxYear),
    'forms' => UsFormsScreen(taxYear: widget.taxYear),
    'interview' => UsInterviewScreen(taxYear: widget.taxYear),
    _ => null,
  };

  Future<void> _pdf() async {
    final state = AppScope.of(context);
    setState(() {
      _saving = true;
      _note = '';
    });
    try {
      final data = toolData(await _api.query('us_return_pdf', {'taxYear': widget.taxYear}));
      final encoded = '${data['base64'] ?? ''}';
      if (encoded.isEmpty) {
        if (mounted) setState(() => _note = 'The PDF is not ready yet. Finish the steps above first.');
        return;
      }
      await state.pdf.share('Form-1040-${widget.taxYear}.pdf', base64Decode(encoded));
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } on FormatException {
      if (mounted) setState(() => _note = 'The PDF could not be opened. Try again.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Review your return')),
      body: SafeArea(
        child: FutureBuilder<UsReview>(
          future: _review,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (loaded.hasError) {
              return EmptyNote(text: loaded.error is MycaApiException ? (loaded.error as MycaApiException).message : 'Your return could not be worked out yet.');
            }
            final review = loaded.data!;
            final byForm = <String, List<UsReviewLine>>{};
            for (final l in review.lines) {
              byForm.putIfAbsent(l.form.isEmpty ? 'Form 1040' : l.form, () => []).add(l);
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Container(
                  key: const Key('usReview.result'),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: review.owed > 0 ? Palette.warnSoft : context.myca.accentSoft,
                    borderRadius: BorderRadius.circular(radiusCard),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(review.owed > 0 ? 'You owe the IRS' : 'Your federal refund', style: text.bodyLarge),
                      const SizedBox(height: 4),
                      Text(dollars(review.owed > 0 ? review.owed : review.refund), style: text.displaySmall?.copyWith(fontFeatures: moneyFigures)),
                      if (review.owed > 0) ...[
                        const SizedBox(height: 6),
                        Text('Due by April 15. You can pay from your bank when you file.', style: text.bodySmall),
                      ],
                    ],
                  ),
                ),
                if (!review.canFile) ...[const SizedBox(height: 16), UsUnsupportedNotice(forms: review.unsupported)],
                if (review.checks.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  const SectionLabel('Needs a look'),
                  for (final c in review.checks)
                    Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: c.blocking ? Palette.dangerSoft : Palette.warnSoft,
                        borderRadius: BorderRadius.circular(radiusControl),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.message, style: text.titleSmall),
                          if (c.fix.isNotEmpty) ...[const SizedBox(height: 4), Text(c.fix, style: text.bodySmall)],
                          if (_fixScreen(c.step) != null)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(onPressed: () => _open(_fixScreen(c.step)!), child: const Text('Fix this')),
                            ),
                        ],
                      ),
                    ),
                ],
                for (final entry in byForm.entries) ...[
                  const SizedBox(height: 20),
                  SectionLabel(entry.key),
                  Panel(
                    children: [
                      for (final l in entry.value)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          child: AmountRow(
                            start: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(l.line.isEmpty ? l.label : 'Line ${l.line} · ${l.label}', style: text.bodyMedium?.copyWith(color: Palette.ink)),
                                if (l.source.isNotEmpty) Text(l.source, style: text.bodySmall),
                              ],
                            ),
                            amount: dollars(l.amount),
                            style: text.titleSmall?.copyWith(fontFeatures: moneyFigures),
                          ),
                        ),
                    ],
                  ),
                ],
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(_note, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                ],
                const SizedBox(height: 22),
                OutlinedButton(key: const Key('usReview.pdf'), onPressed: _saving ? null : _pdf, child: Text(_saving ? 'Preparing…' : 'Download Form 1040 (PDF)')),
                const SizedBox(height: 10),
                FilledButton(
                  key: const Key('usReview.sign'),
                  onPressed: review.blocked || !review.canFile ? null : () => _open(UsSignScreen(taxYear: widget.taxYear)),
                  child: Text(!review.canFile ? "MyCA can't file this return yet" : review.blocked ? 'Fix the items above to sign' : 'Looks right: sign and file'),
                ),
                const SizedBox(height: 10),
                Text('Every figure here is worked out by MyCA\'s tax engine from your forms and answers. The AI assistant explains them but never sets them.', style: text.bodySmall?.copyWith(color: Palette.muted)),
              ],
            );
          },
        ),
      ),
    );
  }
}
