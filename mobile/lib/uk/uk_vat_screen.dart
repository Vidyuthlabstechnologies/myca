import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'hmrc_device.dart';
import 'uk_common.dart';
import 'uk_connect_screen.dart';

const vatBoxLabels = <int, String>{
  1: 'VAT due on sales',
  2: 'VAT due on goods brought into Northern Ireland from the EU',
  3: 'Total VAT due (box 1 plus box 2)',
  4: 'VAT reclaimed on purchases',
  5: 'Net VAT to pay or reclaim',
  6: 'Total sales, excluding VAT',
  7: 'Total purchases, excluding VAT',
  8: 'Goods supplied from Northern Ireland to the EU, excluding VAT',
  9: 'Goods brought into Northern Ireland from the EU, excluding VAT',
};

const vatRates = <(String, String)>[
  ('standard', 'Standard rate'),
  ('reduced', 'Reduced rate'),
  ('zero', 'Zero rate'),
  ('exempt', 'Exempt'),
  ('outside-scope', 'Outside the scope of VAT'),
];

const vatDeclarationWords = 'When I send this VAT information I am making a legal declaration that it is true and complete. A false declaration can result in prosecution.';

String wholePounds(num amount) => pounds(amount).replaceFirst(RegExp(r'\.00$'), '');

class VatObligation {
  const VatObligation({required this.periodKey, required this.start, required this.end, required this.due, required this.status});

  factory VatObligation.fromJson(Map<String, dynamic> map) => VatObligation(
    periodKey: ukText(map['periodKey']),
    start: ukText(map['start']),
    end: ukText(map['end']),
    due: ukText(map['due']),
    status: ukText(map['status']),
  );

  final String periodKey;
  final String start;
  final String end;
  final String due;
  final String status;

  bool get open => status != 'fulfilled';
}

class UkVatScreen extends StatefulWidget {
  const UkVatScreen({super.key, required this.taxYear});

  final String taxYear;

  @override
  State<UkVatScreen> createState() => _UkVatScreenState();
}

class _UkVatScreenState extends State<UkVatScreen> {
  Future<HmrcStatus>? _status;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _status ??= loadHmrcStatus(_api);
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) setState(() => _status = loadHmrcStatus(_api));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('VAT returns')),
      body: FutureBuilder<HmrcStatus>(
        future: _status,
        builder: (context, snap) {
          final status = snap.data;
          if (status == null) return const Center(child: CircularProgressIndicator());
          final obligations = status.vatObligations.map(VatObligation.fromJson).toList()
            ..sort((a, b) => a.open == b.open ? a.due.compareTo(b.due) : (a.open ? -1 : 1));
          return ListView(
            padding: ukPagePadding,
            children: [
              Text(hmrcStatusWords(status), style: text.titleMedium),
              UkNote(syncWords(status)),
              const SizedBox(height: 8),
              const SectionLabel('Your VAT periods'),
              if (obligations.isEmpty)
                UkCard(
                  children: [
                    Text('No VAT periods yet', style: text.titleMedium),
                    const UkNote('Connect to HMRC and sync to see the periods HMRC expects a return for.'),
                    UkWideButton(label: 'Connect or sync', outlined: true, onPressed: () => _open(UkConnectScreen(taxYear: widget.taxYear))),
                  ],
                )
              else
                Panel(
                  children: [
                    for (final o in obligations)
                      RowCard(
                        key: Key('uk.vat.obligation.${o.periodKey}'),
                        leading: TintTile(tint: o.open ? Tint.taxes : Tint.ask, mark: o.open ? Mark.comingUp : Mark.confirm),
                        title: '${gbDay(o.start)} to ${gbDay(o.end)}',
                        subtitle: o.open ? 'Due ${gbDay(o.due)}' : 'Sent to HMRC',
                        badge: StatusTag(text: o.open ? 'Open' : 'Sent', color: o.open ? Palette.warn : Palette.accent),
                        trailing: o.open ? const Chevron() : null,
                        onTap: o.open ? () => _open(UkVatReturnScreen(obligation: o)) : null,
                      ),
                  ],
                ),
              const SizedBox(height: 16),
              UkWideButton(label: 'Prepare a return for another period', outlined: true, onPressed: () => _open(const UkVatReturnScreen())),
              const UkFooter(),
            ],
          );
        },
      ),
    );
  }
}

class _Line {
  final net = TextEditingController();
  String rate = 'standard';
  bool blocked = false;

  void dispose() => net.dispose();
}

class UkVatReturnScreen extends StatefulWidget {
  const UkVatReturnScreen({super.key, this.obligation});

  final VatObligation? obligation;

  @override
  State<UkVatReturnScreen> createState() => _UkVatReturnScreenState();
}

class _UkVatReturnScreenState extends State<UkVatReturnScreen> {
  final _sales = <_Line>[_Line()];
  final _purchases = <_Line>[_Line()];
  final _periodKey = TextEditingController();
  DateTime? _periodEnd;
  Map<String, dynamic>? _prepared;
  bool _declared = false;
  bool _busy = false;
  String _problem = '';
  ChatPreview? _preview;
  Map<String, dynamic>? _receipt;
  bool _simulated = false;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void initState() {
    super.initState();
    _periodKey.text = widget.obligation?.periodKey ?? '';
  }

  @override
  void dispose() {
    for (final l in [..._sales, ..._purchases]) {
      l.dispose();
    }
    _periodKey.dispose();
    super.dispose();
  }

  void _changed() => setState(() {
    _prepared = null;
    _declared = false;
    _preview = null;
  });

  List<Map<String, Object?>> _lines(List<_Line> lines, {bool purchases = false}) => [
    for (final l in lines)
      if ((poundsOf(l.net.text) ?? 0) != 0) {'net': poundsOf(l.net.text), 'rate': l.rate, if (purchases && l.blocked) 'blocked': true},
  ];

  String get _to => widget.obligation?.end ?? (_periodEnd == null ? '' : isoDate(_periodEnd!));

  Future<void> _check() async {
    if ([..._sales, ..._purchases].any((l) => poundsInvalid(l.net.text, allowNegative: true))) {
      setState(() => _problem = 'Some amounts need a look.');
      return;
    }
    final key = _periodKey.text.trim().toUpperCase();
    if (key.isEmpty) {
      setState(() => _problem = 'Enter the period key HMRC gave for this return.');
      return;
    }
    setState(() {
      _busy = true;
      _problem = '';
    });
    final result = await ukQuery(_api, 'gb_vat_return_check', {
      'periodKey': key,
      if (widget.obligation != null) 'from': widget.obligation!.start,
      if (_to.isNotEmpty) 'to': _to,
      'sales': _lines(_sales),
      'purchases': _lines(_purchases, purchases: true),
    });
    if (!mounted) return;
    setState(() {
      _busy = false;
      _declared = false;
      _preview = null;
      if (ukOk(result)) {
        _prepared = toolData(result);
      } else {
        _prepared = null;
        _problem = ukErrorWords(result, fallback: 'The return could not be prepared.');
      }
    });
  }

  bool get _ready => _prepared?['ready'] == true;

  Future<void> _propose() async {
    final prepared = _prepared;
    if (prepared == null || !_ready || !_declared || _busy) return;
    setState(() {
      _busy = true;
      _problem = '';
    });
    try {
      final device = await hmrcDeviceReader(context);
      final reply = await _api.propose('submit_gb_vat_return', {'body': prepared['body'], 'declaration': true, 'device': device});
      if (!mounted) return;
      setState(() {
        _preview = reply.preview;
        if (reply.preview == null) _problem = reply.reply.isEmpty ? 'The return cannot be sent yet.' : reply.reply;
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _problem = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    final preview = _preview;
    if (preview == null) return;
    setState(() => _busy = true);
    try {
      final reply = await _api.confirm(preview.token);
      if (!mounted) return;
      setState(() {
        _preview = null;
        if (reply.posted) {
          _receipt = reply.toolResult('submit_gb_vat_return');
          _simulated = reply.tools.any((t) => t['name'] == 'submit_gb_vat_return' && ukMap(t['result'])['mock'] == true);
        } else {
          _problem = replyProblem(reply, 'submit_gb_vat_return');
        }
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _problem = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    setState(() => _preview = null);
    try {
      await _api.discard();
    } on MycaApiException {
      return;
    }
  }

  Future<void> _pickEnd() async {
    final now = AppScope.of(context).now();
    final picked = await showDatePicker(context: context, initialDate: _periodEnd ?? now, firstDate: DateTime(now.year - 4), lastDate: DateTime(now.year + 1, 12, 31));
    if (picked != null && mounted) {
      setState(() => _periodEnd = picked);
      _changed();
    }
  }

  Widget _lineRow(_Line line, int index, List<_Line> list, String kind) {
    final text = Theme.of(context).textTheme;
    return UkCard(
      children: [
        Text('${kind == 'sales' ? 'Sales' : 'Purchases'} line ${index + 1}', style: text.titleSmall),
        const SizedBox(height: 8),
        TextField(
          key: Key('uk.vat.$kind.$index.net'),
          controller: line.net,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,£ -]')), LengthLimitingTextInputFormatter(16)],
          onChanged: (_) => _changed(),
          decoration: InputDecoration(
            labelText: 'Amount excluding VAT',
            prefixText: '£ ',
            errorText: poundsInvalid(line.net.text, allowNegative: true) ? 'Enter an amount in pounds, like 1250.50' : null,
          ),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String>(
          key: Key('uk.vat.$kind.$index.rate'),
          initialValue: line.rate,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'VAT rate'),
          items: [for (final r in vatRates) DropdownMenuItem(value: r.$1, child: Text(r.$2, overflow: TextOverflow.ellipsis))],
          onChanged: (v) {
            line.rate = v ?? line.rate;
            _changed();
          },
        ),
        if (kind == 'purchases')
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: line.blocked,
            onChanged: (v) {
              line.blocked = v ?? false;
              _changed();
            },
            title: const Text('VAT on this cannot be reclaimed'),
            subtitle: const Text('For example business entertainment or buying a car'),
          ),
        if (list.length > 1)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () {
                list.removeAt(index).dispose();
                _changed();
              },
              child: const Text('Remove line'),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final o = widget.obligation;
    final receipt = _receipt;
    return Scaffold(
      appBar: AppBar(title: Text(receipt != null ? 'VAT return sent' : 'Prepare VAT return')),
      body: ListView(
        padding: ukPagePadding,
        children: receipt != null
            ? [VatReceiptView(receipt: receipt, simulated: _simulated), UkWideButton(label: 'Done', onPressed: () => Navigator.of(context).maybePop())]
            : [
                if (o != null) ...[
                  Text('${gbDay(o.start)} to ${gbDay(o.end)}', style: text.titleMedium),
                  UkNote('Due ${gbDay(o.due)} · period ${o.periodKey}'),
                ] else ...[
                  TextField(
                    key: const Key('uk.vat.periodKey'),
                    controller: _periodKey,
                    textCapitalization: TextCapitalization.characters,
                    inputFormatters: [LengthLimitingTextInputFormatter(4)],
                    onChanged: (_) => _changed(),
                    decoration: const InputDecoration(labelText: 'Period key', helperText: 'Four characters HMRC gives with each VAT period, like 26A1'),
                  ),
                  const SizedBox(height: 10),
                  UkWideButton(label: _periodEnd == null ? 'Choose the last day of the period' : 'Period ends ${readableDay(isoDate(_periodEnd!))}', outlined: true, onPressed: _pickEnd),
                ],
                const SizedBox(height: 10),
                const SectionLabel('Sales'),
                const UkNote('Enter each sale, or one total for each VAT rate.'),
                for (var i = 0; i < _sales.length; i++) _lineRow(_sales[i], i, _sales, 'sales'),
                UkWideButton(label: 'Add a sales line', outlined: true, onPressed: () => setState(() => _sales.add(_Line()))),
                const SizedBox(height: 8),
                const SectionLabel('Purchases'),
                for (var i = 0; i < _purchases.length; i++) _lineRow(_purchases[i], i, _purchases, 'purchases'),
                UkWideButton(label: 'Add a purchases line', outlined: true, onPressed: () => setState(() => _purchases.add(_Line()))),
                const SizedBox(height: 8),
                if (_problem.isNotEmpty) UkProblem(_problem),
                UkWideButton(label: _busy && _prepared == null ? 'Checking…' : 'Check the return', onPressed: _busy ? null : _check),
                if (_prepared != null) ..._review(context, _prepared!),
                const UkFooter(),
              ],
      ),
    );
  }

  List<Widget> _review(BuildContext context, Map<String, dynamic> prepared) {
    final text = Theme.of(context).textTheme;
    final boxes = ukMap(prepared['boxes']);
    final problems = ukMaps(prepared['problems']);
    final direction = ukText(prepared['direction']);
    final box5 = ukNum(boxes['5']);
    final preview = _preview;
    return [
      const SizedBox(height: 8),
      UkCard(
        key: const Key('uk.vat.review'),
        children: [
          Text('THE NINE BOXES', style: text.labelSmall),
          const SizedBox(height: 6),
          Text(direction == 'refund' ? 'HMRC owes you ${pounds(box5)}' : direction == 'nil' ? 'Nothing to pay' : '${pounds(box5)} to pay', key: const Key('uk.vat.direction'), style: text.headlineSmall),
          if (ukText(prepared['dueBy']).isNotEmpty) UkNote('Return and payment due ${gbDay(ukText(prepared['dueBy']))}'),
          if (ukMap(prepared['flatRate']).isNotEmpty) UkNote('Flat Rate Scheme at ${ukText(ukMap(prepared['flatRate'])['ratePercent'])}% of turnover including VAT.'),
          const Divider(),
          for (final box in vatBoxLabels.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: AmountRow(
                align: CrossAxisAlignment.start,
                start: Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Text('Box ${box.key}. ${box.value}', style: text.bodyLarge),
                ),
                amount: box.key >= 6 ? wholePounds(ukNum(boxes['${box.key}'])) : pounds(ukNum(boxes['${box.key}'])),
                style: (box.key == 5 ? text.titleMedium : text.bodyLarge)?.copyWith(fontFeatures: moneyFigures),
              ),
            ),
          for (final note in [for (final n in (prepared['notes'] as List? ?? const [])) '$n']) UkNote(note),
          if (prepared['unreviewed'] == true) const UkNote(unreviewedWords, warn: true),
        ],
      ),
      if (problems.isNotEmpty)
        UkCard(
          tone: Palette.dangerSoft,
          children: [
            Text('Fix these before sending', style: text.titleMedium?.copyWith(color: Palette.danger)),
            for (final p in problems) UkNote(ukText(p['why'])),
          ],
        ),
      if (_ready && preview == null) ...[
        CheckboxListTile(
          key: const Key('uk.vat.declare'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _declared,
          onChanged: (v) => setState(() => _declared = v ?? false),
          title: const Text(vatDeclarationWords),
        ),
        if (!_declared) const UkNote('Tick the declaration to send the return.'),
        UkWideButton(key: const Key('uk.vat.submit'), label: _busy ? 'Getting it ready…' : 'Send to HMRC', onPressed: _declared && !_busy ? _propose : null),
        const UkNote('Once sent, a VAT return cannot be changed. Mistakes are put right on a later return.'),
      ],
      if (preview != null) UkPreviewCard(preview: preview, busy: _busy, onSend: _send, onCancel: _cancel, sendLabel: 'Confirm and send'),
    ];
  }
}

class VatReceiptView extends StatelessWidget {
  const VatReceiptView({super.key, required this.receipt, this.simulated = false});

  final Map<String, dynamic> receipt;
  final bool simulated;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final processed = DateTime.tryParse(ukText(receipt['processingDate']));
    final where = hmrcEnvironmentLabel(ukText(receipt['environment']));
    final rows = <(String, String)>[
      ('Period', ukText(receipt['periodKey'])),
      ('Received by HMRC', processed == null ? '' : '${readableDay(isoDate(processed.toLocal()))} at ${processed.toLocal().hour.toString().padLeft(2, '0')}:${processed.toLocal().minute.toString().padLeft(2, '0')}'),
      ('Receipt number', ukText(receipt['formBundleNumber'])),
      ('Charge reference', ukText(receipt['chargeRefNumber'])),
      ('Payment', switch (ukText(receipt['paymentIndicator'])) { 'DD' => 'By Direct Debit', 'BANK' => 'HMRC pays to your bank', _ => '' }),
      ('Net VAT', receipt['netVatDue'] is num ? pounds(receipt['netVatDue'] as num) : ''),
      ('Sent to', where),
      ('Correlation ID', ukText(receipt['correlationId'])),
    ];
    return UkCard(
      key: const Key('uk.vat.receipt'),
      tone: Palette.accentSoft,
      children: [
        Text('HMRC has your VAT return', style: text.headlineSmall),
        if (simulated) const UkNote('Sent to the MyCA simulator, not to HMRC. Nothing was filed.', warn: true),
        const SizedBox(height: 8),
        for (final row in rows)
          if (row.$2.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(row.$1, style: text.labelSmall),
                  Text(row.$2, style: text.bodyLarge),
                ],
              ),
            ),
        const UkNote('Keep the receipt number. HMRC may ask for it.'),
      ],
    );
  }
}
