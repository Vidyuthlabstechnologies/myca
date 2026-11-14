import 'package:flutter/material.dart';

import '../../app_state.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import 'us_fields.dart';

num _num(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

class UsStateSheet {
  const UsStateSheet({required this.state, required this.taxYear, required this.filingStatus, required this.federal, required this.w2s});

  final String state;
  final int taxYear;
  final String filingStatus;
  final List<(String, String, num)> federal;
  final List<(String, String, num, num)> w2s;

  String get stateName => usStates.firstWhere((s) => s.$1 == state, orElse: () => (state, state)).$2;

  String asText() {
    final out = StringBuffer()
      ..writeln('$stateName state return: numbers from your $taxYear federal return')
      ..writeln('Filing status: ${filingStatusLabel(filingStatus)}')
      ..writeln();
    for (final (line, label, amount) in federal) {
      out.writeln('Form 1040 line $line, $label: ${dollars(amount)}');
    }
    for (final (payer, st, wages, withheld) in w2s) {
      out.writeln('W-2 from $payer ($st): state wages ${dollars(wages)}, state tax withheld ${dollars(withheld)}');
    }
    return out.toString();
  }
}

const _federalLines = [('1z', 'Wages'), ('9', 'Total income'), ('10', 'Adjustments to income'), ('11', 'Adjusted gross income'), ('12', 'Standard or itemized deduction'), ('15', 'Taxable income'), ('24', 'Total tax'), ('25a', 'Federal tax withheld on W-2s')];

UsStateSheet buildStateSheet({required String state, required int taxYear, required UsReturnStatus status, required UsReview review, required List<UsTaxForm> forms}) => UsStateSheet(
      state: state,
      taxYear: taxYear,
      filingStatus: status.filingStatus,
      federal: [
        for (final (line, label) in _federalLines)
          if (review.line('1040', line) != null) (line, review.line('1040', line)!.label.isEmpty ? label : review.line('1040', line)!.label, review.line('1040', line)!.amount),
      ],
      w2s: [
        for (final f in forms)
          if (f.kind == 'W-2') (f.payer.isEmpty ? 'an employer' : f.payer, '${f.amounts['state'] ?? ''}', _num(f.amounts['stateWages']), _num(f.amounts['stateWithheld'])),
      ],
    );

class UsStateSheetScreen extends StatefulWidget {
  const UsStateSheetScreen({super.key, required this.taxYear, required this.state});

  final int taxYear;
  final String state;

  @override
  State<UsStateSheetScreen> createState() => _UsStateSheetScreenState();
}

class _UsStateSheetScreenState extends State<UsStateSheetScreen> {
  Future<UsStateSheet>? _sheet;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sheet ??= _load();
  }

  Future<UsStateSheet> _load() async {
    final api = AppScope.of(context).api;
    final year = widget.taxYear;
    final results = await Future.wait<Object>([loadReturnStatus(api, year), loadReview(api, year), loadTaxForms(api, year)]);
    return buildStateSheet(state: widget.state, taxYear: year, status: results[0] as UsReturnStatus, review: results[1] as UsReview, forms: results[2] as List<UsTaxForm>);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Your state return')),
      body: SafeArea(
        child: FutureBuilder<UsStateSheet>(
          future: _sheet,
          builder: (context, loaded) {
            if (loaded.hasError) return UsLoadError(message: usLoadProblem(loaded.error, 'The sheet could not be made.'), onRetry: () => setState(() { _sheet = _load(); }));
            if (!loaded.hasData) return const Center(child: CircularProgressIndicator());
            final sheet = loaded.data!;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text('${sheet.stateName} carry-over sheet', style: text.headlineMedium),
                const SizedBox(height: 6),
                Text(stateReturnNote, style: text.bodyMedium),
                const SizedBox(height: 16),
                Panel(
                  children: [
                    for (final (line, label, amount) in sheet.federal)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        child: AmountRow(
                          start: Text('Line $line · $label', style: text.bodyMedium?.copyWith(color: Palette.ink)),
                          amount: dollars(amount),
                          style: text.titleSmall?.copyWith(fontFeatures: moneyFigures),
                        ),
                      ),
                  ],
                ),
                if (sheet.w2s.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  const SectionLabel('State wages and withholding (W-2 boxes 15 to 17)'),
                  for (final (payer, st, wages, withheld) in sheet.w2s)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text('$payer${st.isEmpty ? '' : ' ($st)'}: wages ${dollars(wages)}, tax withheld ${dollars(withheld)}', style: text.bodyMedium),
                    ),
                ],
                const SizedBox(height: 18),
                OutlinedButton(key: const Key('usState.share'), onPressed: () => AppScope.of(context).shareText(sheet.asText()), child: const Text('Share or save this sheet')),
                const SizedBox(height: 10),
                Text('Most state returns start from your federal adjusted gross income. Check your state\'s instructions for what else it asks.', style: text.bodySmall?.copyWith(color: Palette.muted)),
              ],
            );
          },
        ),
      ),
    );
  }
}
