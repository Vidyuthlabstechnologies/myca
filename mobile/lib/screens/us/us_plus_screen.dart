import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_services.dart';
import '../../app_state.dart';
import '../../billing/store_billing.dart';
import '../../format.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../us/us_plus.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import '../plan_screen.dart' show buyInApp;
import 'us_fields.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

num _num(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

String _errorText(Object err) => err is MycaApiException ? err.message : 'Something went wrong. Try again.';

class UsPlusScreen extends StatefulWidget {
  const UsPlusScreen({super.key, required this.taxYear, this.plus, this.store});

  final int taxYear;
  final UsPlusService? plus;
  final StoreBilling? store;

  @override
  State<UsPlusScreen> createState() => _UsPlusScreenState();
}

class _UsPlusScreenState extends State<UsPlusScreen> {
  UsPlusService? _plus;
  Future<(UsPlusStatus, UsOffers)>? _loaded;
  String _sessionId = '';
  bool _busy = false;
  String _note = '';
  final _joined = <String>{};
  StoreBilling? _store;
  PurchaseRecorder? _recorder;
  String _playPrice = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final cloud = AppScope.of(context).cloud;
    _plus ??= widget.plus ?? (cloud == null ? const NoUsPlus() : CloudUsPlus(cloud));
    _store ??= widget.store ?? (buyInApp && cloud != null ? PlayBilling() : null);
    _loaded ??= _load();
  }

  @override
  void dispose() {
    _recorder?.stop();
    super.dispose();
  }

  Future<void> _startPlay(UsPlusStatus plus) async {
    final store = _store;
    if (_recorder != null || store == null || !plus.onPlay || plus.productId.isEmpty) return;
    try {
      if (!await store.available()) return;
      final products = await store.products({plus.productId});
      _recorder = PurchaseRecorder(
        store: store,
        accepts: (productId) => productId == plus.productId,
        record: (productId, token) async {
          await _plus!.recordPlay(productId, token);
          if (mounted) _reload();
        },
        onResult: (purchase, error) {
          if (!mounted) return;
          setState(() {
            _busy = false;
            _note = switch (purchase.state) {
              StorePurchaseState.pending => 'Google Play is processing the payment. Plus turns on as soon as it clears.',
              StorePurchaseState.failed => 'Google Play did not complete the payment. Nothing was charged.',
              StorePurchaseState.purchased => error == null ? '' : _errorText(error),
              StorePurchaseState.canceled => '',
            };
          });
        },
      )..start();
      if (mounted) setState(() => _playPrice = products[plus.productId]?.price ?? '');
    } on Object {
      return;
    }
  }

  Future<void> _subscribeInPlay(UsPlusStatus plus) async {
    final store = _store;
    if (store == null) return;
    setState(() {
      _busy = true;
      _note = '';
    });
    final started = await store.buy(plus.productId, _plus!.accountId).catchError((_) => false);
    if (!started && mounted) {
      setState(() {
        _busy = false;
        _note = 'Google Play could not open the payment. Check that you are signed in to the Play Store and try again.';
      });
    }
  }

  Future<(UsPlusStatus, UsOffers)> _load() async {
    final status = await _plus!.status();
    await _startPlay(status);
    final offers = await _plus!.offers().catchError((_) => const UsOffers(waitlist: defaultWaitlist));
    return (status, offers);
  }

  void _reload() => setState(() {
        _loaded = _load();
      });

  Future<void> _run(Future<void> Function() work) async {
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      await work();
    } on Object catch (err) {
      if (mounted) setState(() => _note = _errorText(err));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _subscribe() => _run(() async {
        final state = AppScope.of(context);
        final (url, sessionId) = await _plus!.startCheckout();
        final opened = url.isNotEmpty && await state.openLink(Uri.parse(url));
        if (!mounted) return;
        setState(() {
          _sessionId = sessionId;
          if (!opened) _note = 'The card payment page could not be opened. Try again.';
        });
      });

  Future<void> _confirm() => _run(() async {
        await _plus!.confirm(_sessionId);
        if (mounted) {
          setState(() => _sessionId = '');
          _reload();
        }
      });

  Future<void> _cancel() => _run(() async {
        await _plus!.cancel();
        if (mounted) _reload();
      });

  Future<void> _join(String product) => _run(() async {
        await _plus!.joinWaitlist(product);
        if (mounted) setState(() => _joined.add(product));
      });

  Future<void> _openTool(Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

  Widget _status(UsPlusStatus plus) {
    final text = Theme.of(context).textTheme;
    final children = <Widget>[];
    if (plus.subscribed) {
      final until = plus.until.length >= 10 ? longDate(plus.until.substring(0, 10)) : '';
      children.add(Text(plus.renews ? 'MyCA Plus is on. It renews${until.isEmpty ? '' : ' on $until'}.' : 'MyCA Plus is on until $until. It will not renew.', key: const Key('usPlus.on'), style: text.titleMedium));
      if (plus.renews && plus.manageUrl.isNotEmpty) {
        children.addAll([
          const SizedBox(height: 10),
          OutlinedButton(key: const Key('usPlus.manage'), onPressed: () => AppScope.of(context).openLink(Uri.parse(plus.manageUrl)), child: const Text('Cancel or manage in Google Play')),
        ]);
      } else if (plus.renews) {
        children.addAll([
          const SizedBox(height: 10),
          OutlinedButton(key: const Key('usPlus.cancel'), onPressed: _busy ? null : _cancel, child: const Text('Cancel renewal')),
          Text('You keep Plus until the end of the year you paid for.', style: text.bodySmall?.copyWith(color: Palette.muted)),
        ]);
      }
    } else if (plus.buyable && plus.onPlay) {
      children.addAll([
        FilledButton(
          key: const Key('usPlus.subscribePlay'),
          onPressed: _busy || _store == null ? null : () => _subscribeInPlay(plus),
          child: Text('Get MyCA Plus, ${_playPrice.isEmpty ? '\$${plus.priceUsd}' : _playPrice} a year'),
        ),
        const SizedBox(height: 6),
        Text(_store == null ? 'MyCA Plus cannot be bought in this app on this device yet.' : 'Renews automatically every year at ${_playPrice.isEmpty ? '\$${plus.priceUsd}' : _playPrice} until you cancel. Paid through Google Play; cancel any time in Play before the renewal date and you keep Plus until the end of the year you paid for.', key: const Key('usPlus.playNote'), style: text.bodySmall?.copyWith(color: Palette.muted)),
      ]);
    } else if (plus.buyable) {
      children.addAll([
        FilledButton(key: const Key('usPlus.subscribe'), onPressed: _busy ? null : _subscribe, child: Text('Get MyCA Plus, \$${plus.priceUsd} a year')),
        if (_sessionId.isNotEmpty) ...[
          const SizedBox(height: 8),
          OutlinedButton(key: const Key('usPlus.paid'), onPressed: _busy ? null : _confirm, child: const Text("I've paid, continue")),
        ],
        const SizedBox(height: 6),
        Text('Renews automatically every year at \$${plus.priceUsd} until you cancel. Paid by card through Stripe; cancel any time in one tap here and you keep Plus until the end of the year you paid for.', style: text.bodySmall?.copyWith(color: Palette.muted)),
      ]);
    } else if (!plus.active) {
      children.add(Text('MyCA Plus is not on sale yet.', style: text.bodyMedium));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('MyCA Plus')),
      body: SafeArea(
        child: FutureBuilder<(UsPlusStatus, UsOffers)>(
          future: _loaded,
          builder: (context, loaded) {
            if (loaded.hasError) return UsLoadError(message: _errorText(loaded.error!), onRetry: _reload);
            if (!loaded.hasData) return const Center(child: CircularProgressIndicator());
            final (plus, offers) = loaded.data!;
            final open = plus.active;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text('Help with the IRS all year', style: text.headlineMedium),
                const SizedBox(height: 6),
                Text('\$${plus.priceUsd} a year, on its own or with your return.', style: text.bodyMedium?.copyWith(color: Palette.muted)),
                const SizedBox(height: 16),
                _status(plus),
                if (_note.isNotEmpty) ...[const SizedBox(height: 10), Text(_note, key: const Key('usPlus.note'), style: text.bodySmall?.copyWith(color: Palette.danger))],
                const SizedBox(height: 20),
                Panel(
                  children: [
                    RowCard(
                      key: const Key('usPlus.letter'),
                      leading: const TintTile(tint: Tint.taxes, mark: Mark.paper),
                      title: 'Read an IRS letter',
                      subtitle: 'Snap a photo. Get what it means, a check against your return and a draft reply',
                      trailing: open ? const Chevron() : const Icon(Icons.lock_outline, semanticLabel: 'Plus only'),
                      onTap: open ? () => _openTool(UsLetterScreen(taxYear: widget.taxYear)) : null,
                    ),
                    RowCard(
                      key: const Key('usPlus.withholding'),
                      leading: const TintTile(tint: Tint.ask, mark: Mark.employee),
                      title: 'Check my withholding',
                      subtitle: 'After a new job or a raise: will you owe in April?',
                      trailing: open ? const Chevron() : const Icon(Icons.lock_outline, semanticLabel: 'Plus only'),
                      onTap: open ? () => _openTool(UsWithholdingScreen(taxYear: widget.taxYear + 1)) : null,
                    ),
                    RowCard(
                      key: const Key('usPlus.estimates'),
                      leading: const TintTile(tint: Tint.ask, mark: Mark.urgent),
                      title: 'Quarterly estimates',
                      subtitle: 'What to pay on side income each quarter, with reminders',
                      trailing: open ? const Chevron() : const Icon(Icons.lock_outline, semanticLabel: 'Plus only'),
                      onTap: open ? () => _openTool(UsEstimatesScreen(taxYear: widget.taxYear + 1)) : null,
                    ),
                  ],
                ),
                if (offers.waitlist.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const SectionLabel('Coming in 2028'),
                  for (final (id, title) in offers.waitlist)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Expanded(child: Text(title, style: text.titleSmall)),
                          _joined.contains(id)
                              ? Text("We'll let you know", key: Key('usWaitlist.joined.$id'), style: text.bodySmall?.copyWith(color: context.myca.accent))
                              : TextButton(key: Key('usWaitlist.$id'), onPressed: _busy ? null : () => _join(id), child: const Text('Tell me when')),
                        ],
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ToolScaffold extends StatelessWidget {
  const _ToolScaffold({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: SafeArea(child: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: children)),
      );
}

Widget _result(BuildContext context, Key key, List<Widget> children) => Container(
      key: key,
      margin: const EdgeInsets.only(top: 18),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.myca.accentSoft, borderRadius: BorderRadius.circular(radiusCard)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );

class UsLetterScreen extends StatefulWidget {
  const UsLetterScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsLetterScreen> createState() => _UsLetterScreenState();
}

class _UsLetterScreenState extends State<UsLetterScreen> {
  bool _busy = false;
  String _note = '';
  Map<String, dynamic>? _letter;

  Future<void> _pick() async {
    final state = AppScope.of(context);
    final picked = await state.pickAnyFile();
    if (picked == null || !mounted) return;
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final sha = await state.api.upload(picked.name, dataUrlOf(picked));
      final answer = await state.api.query('read_irs_letter', {'documentId': sha, 'taxYear': widget.taxYear});
      if (answer is Map && answer['ok'] == false) throw MycaApiException('${answer['hint'] ?? answer['error'] ?? 'The letter could not be read.'}');
      if (mounted) setState(() => _letter = toolData(answer));
    } on Object catch (err) {
      if (mounted) setState(() => _note = _errorText(err));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final letter = _letter;
    final differences = letter?['differences'] is List ? (letter!['differences'] as List).map(_map).toList() : const <Map<String, dynamic>>[];
    final reply = '${letter?['draftReply'] ?? ''}';
    return _ToolScaffold(title: 'IRS letter', children: [
      Text('Take a photo of every page of the letter, or pick the PDF.', style: text.bodyMedium),
      const SizedBox(height: 6),
      Text('Your Social Security number is never read.', style: text.bodySmall?.copyWith(color: Palette.muted)),
      const SizedBox(height: 14),
      FilledButton(key: const Key('usLetter.pick'), onPressed: _busy ? null : _pick, child: Text(_busy ? 'Reading the letter…' : 'Choose the letter')),
      if (_note.isNotEmpty) ...[const SizedBox(height: 10), Text(_note, key: const Key('usLetter.note'), style: text.bodySmall?.copyWith(color: Palette.danger))],
      if (letter != null)
        _result(context, const Key('usLetter.result'), [
          Text('${letter['notice'] ?? 'IRS letter'}', style: text.titleMedium),
          const SizedBox(height: 6),
          Text('${letter['plainEnglish'] ?? ''}', style: text.bodyMedium),
          if ('${letter['deadline'] ?? ''}'.length >= 10) ...[
            const SizedBox(height: 8),
            Text('Reply by ${longDate('${letter['deadline']}'.substring(0, 10))}', style: text.titleSmall?.copyWith(color: Palette.warn)),
          ],
          if (letter['amountIrsSays'] != null && _num(letter['amountIrsSays']) != 0) ...[
            const SizedBox(height: 4),
            Text('The IRS says: ${dollars(_num(letter['amountIrsSays']))}', style: text.bodyMedium),
          ],
          const SizedBox(height: 8),
          Text(letter['matchesReturn'] == true ? 'This matches the return you filed.' : 'This does not match the return you filed.', key: const Key('usLetter.match'), style: text.titleSmall),
          for (final d in differences)
            Text('${d['kind'] ?? ''} from ${d['payer'] ?? 'a payer'}: the IRS has ${dollars(_num(d['amountIrsHas']))}, your return has ${dollars(_num(d['amountInMyca']))}', style: text.bodySmall),
          if (reply.isNotEmpty) ...[
            const SizedBox(height: 12),
            const SectionLabel('Draft reply'),
            SelectableText(reply, key: const Key('usLetter.reply'), style: text.bodyMedium),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => AppScope.of(context).shareText(reply), child: const Text('Share the reply')),
          ],
          const SizedBox(height: 8),
          Text('Check it before you send it. MyCA does not contact the IRS for you.', style: text.bodySmall?.copyWith(color: Palette.muted)),
        ]),
    ]);
  }
}

class _MoneyField extends StatelessWidget {
  const _MoneyField(this.fieldKey, this.controller, this.label, {this.whole = false});

  final String fieldKey;
  final TextEditingController controller;
  final String label;
  final bool whole;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          key: Key(fieldKey),
          controller: controller,
          keyboardType: TextInputType.numberWithOptions(decimal: !whole),
          decoration: InputDecoration(labelText: label, prefixText: whole ? null : '\$ '),
        ),
      );
}

num _amount(TextEditingController c) => num.tryParse(c.text.replaceAll(',', '').trim()) ?? 0;

class UsWithholdingScreen extends StatefulWidget {
  const UsWithholdingScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsWithholdingScreen> createState() => _UsWithholdingScreenState();
}

class _UsWithholdingScreenState extends State<UsWithholdingScreen> {
  final _pay = TextEditingController();
  final _withheld = TextEditingController();
  final _periods = TextEditingController();
  final _ytdWages = TextEditingController();
  final _ytdWithheld = TextEditingController();
  final _other = TextEditingController();
  bool _busy = false;
  String _note = '';
  Map<String, dynamic>? _out;

  @override
  void dispose() {
    for (final c in [_pay, _withheld, _periods, _ytdWages, _ytdWithheld, _other]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _check() async {
    final api = AppScope.of(context).api;
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final answer = await api.query('us_withholding_check', {
        'taxYear': widget.taxYear,
        'payPerPeriod': _amount(_pay),
        'withheldPerPeriod': _amount(_withheld),
        'periodsLeft': _amount(_periods).toInt(),
        'ytdWages': _amount(_ytdWages),
        'ytdWithheld': _amount(_ytdWithheld),
        'otherIncome': _amount(_other),
      });
      if (answer is Map && answer['ok'] == false) throw MycaApiException('${answer['hint'] ?? answer['error'] ?? 'The check could not run.'}');
      if (mounted) setState(() => _out = toolData(answer));
    } on Object catch (err) {
      if (mounted) setState(() => _note = _errorText(err));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final out = _out;
    final gap = _num(out?['gap']);
    final extra = _num(out?['extraPerPaycheck']);
    return _ToolScaffold(title: 'Withholding check', children: [
      Text('Use your latest pay stub for ${widget.taxYear}.', style: text.bodyMedium),
      const SizedBox(height: 14),
      _MoneyField('usWithholding.pay', _pay, 'Pay per paycheck, before tax'),
      _MoneyField('usWithholding.withheld', _withheld, 'Federal tax withheld per paycheck'),
      _MoneyField('usWithholding.periods', _periods, 'Paychecks left this year', whole: true),
      _MoneyField('usWithholding.ytdWages', _ytdWages, 'Pay so far this year'),
      _MoneyField('usWithholding.ytdWithheld', _ytdWithheld, 'Federal tax withheld so far'),
      _MoneyField('usWithholding.other', _other, 'Other income this year (optional)'),
      FilledButton(key: const Key('usWithholding.check'), onPressed: _busy ? null : _check, child: Text(_busy ? 'Checking…' : 'Check')),
      if (_note.isNotEmpty) ...[const SizedBox(height: 10), Text(_note, style: text.bodySmall?.copyWith(color: Palette.danger))],
      if (out != null)
        _result(context, const Key('usWithholding.result'), [
          Text(gap > 0 ? 'You are on track to owe about ${dollars(gap)} in April.' : 'You are on track for a refund of about ${dollars(-gap)}.', style: text.titleMedium),
          const SizedBox(height: 6),
          Text('Projected tax ${dollars(_num(out['projectedTax']))}. Projected withholding ${dollars(_num(out['projectedWithholding']))}.', style: text.bodySmall),
          if (extra > 0) ...[
            const SizedBox(height: 8),
            Text('To even it out, ask your employer to withhold an extra ${dollars(extra)} per paycheck: line 4(c) of a new Form W-4.', key: const Key('usWithholding.extra'), style: text.bodyMedium),
          ],
        ]),
    ]);
  }
}

class UsEstimatesScreen extends StatefulWidget {
  const UsEstimatesScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsEstimatesScreen> createState() => _UsEstimatesScreenState();
}

class _UsEstimatesScreenState extends State<UsEstimatesScreen> {
  final _income = TextEditingController();
  bool _busy = false;
  bool _reminded = false;
  String _note = '';
  List<UsQuarter>? _quarters;

  @override
  void dispose() {
    _income.dispose();
    super.dispose();
  }

  Future<void> _work() async {
    final api = AppScope.of(context).api;
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final answer = await api.query('us_estimated_payments', {'taxYear': widget.taxYear, 'expectedSideIncome': _amount(_income)});
      if (answer is Map && answer['ok'] == false) throw MycaApiException('${answer['hint'] ?? answer['error'] ?? 'The estimate could not run.'}');
      final data = toolData(answer);
      final rows = data['quarters'] is List ? (data['quarters'] as List).map(_map).toList() : const <Map<String, dynamic>>[];
      if (mounted) setState(() => _quarters = [for (final q in rows) if (q['past'] != true) UsQuarter('${q['due'] ?? ''}', _num(q['amount']))]);
    } on Object catch (err) {
      if (mounted) setState(() => _note = _errorText(err));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remind() async {
    final api = AppScope.of(context).api;
    setState(() => _busy = true);
    try {
      for (final q in _quarters!) {
        final due = DateTime.tryParse(q.due);
        if (due == null || q.amount <= 0) continue;
        await saveAndConfirm(api, 'add_reminder', {'text': 'Pay ${dollars(q.amount)} federal estimated tax (Form 1040-ES) by ${longDate(q.due)}', 'due': isoDay(due.subtract(const Duration(days: 7)))});
      }
      if (mounted) setState(() => _reminded = true);
    } on Object catch (err) {
      if (mounted) setState(() => _note = _errorText(err));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final quarters = _quarters;
    return _ToolScaffold(title: 'Quarterly estimates', children: [
      Text('Freelance, gig or other income with no tax taken out in ${widget.taxYear}.', style: text.bodyMedium),
      const SizedBox(height: 14),
      _MoneyField('usEstimates.income', _income, 'Expected side income for the year'),
      FilledButton(key: const Key('usEstimates.work'), onPressed: _busy ? null : _work, child: const Text('Work it out')),
      if (_note.isNotEmpty) ...[const SizedBox(height: 10), Text(_note, style: text.bodySmall?.copyWith(color: Palette.danger))],
      if (quarters != null)
        _result(context, const Key('usEstimates.result'), [
          if (quarters.every((q) => q.amount <= 0))
            Text('No estimated payments are needed this year.', style: text.titleMedium)
          else ...[
            for (final q in quarters) Text('${longDate(q.due)}: ${dollars(q.amount)}', style: text.titleSmall?.copyWith(fontFeatures: moneyFigures)),
            const SizedBox(height: 10),
            _reminded
                ? Text('Reminders added a week before each date.', key: const Key('usEstimates.reminded'), style: text.bodySmall)
                : OutlinedButton(key: const Key('usEstimates.remind'), onPressed: _busy ? null : _remind, child: const Text('Remind me before each one')),
          ],
        ]),
    ]);
  }
}
