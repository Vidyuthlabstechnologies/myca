import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'hmrc_device.dart';
import 'uk_common.dart';
import 'uk_connect_screen.dart';

const finalDeclarationWords = 'I declare that the information I have given for this tax year, through my quarterly updates and this final declaration, is correct and complete to the best of my knowledge and belief. I understand that I may have to pay financial penalties and face prosecution if I give false information.';

const selfEmploymentIncomeFields = <(String, String)>[
  ('turnover', 'Turnover'),
  ('other', 'Other business income'),
];

const selfEmploymentExpenseFields = <(String, String)>[
  ('costOfGoods', 'Cost of goods bought to resell or use'),
  ('paymentsToSubcontractors', 'Payments to subcontractors'),
  ('wagesAndStaffCosts', 'Wages and staff costs'),
  ('carVanTravelExpenses', 'Car, van and travel'),
  ('premisesRunningCosts', 'Rent, rates, power and insurance'),
  ('maintenanceCosts', 'Repairs and maintenance'),
  ('adminCosts', 'Phone, stationery and other office costs'),
  ('advertisingCosts', 'Advertising and marketing'),
  ('interestOnBankOtherLoans', 'Interest on loans'),
  ('financeCharges', 'Bank and card charges'),
  ('irrecoverableDebts', 'Bad debts'),
  ('professionalFees', 'Accountancy, legal and other fees'),
  ('otherExpenses', 'Other allowable expenses'),
];

const propertyIncomeFields = <(String, String)>[
  ('periodAmount', 'Rent received'),
  ('otherIncome', 'Other property income'),
];

const propertyExpenseFields = <(String, String)>[
  ('premisesRunningCosts', 'Rent, rates, insurance and ground rent'),
  ('repairsAndMaintenance', 'Repairs and maintenance'),
  ('professionalFees', 'Legal, management and other fees'),
  ('costOfServices', 'Cost of services provided'),
  ('travelCosts', 'Travel'),
  ('other', 'Other allowable expenses'),
  ('residentialFinancialCost', 'Mortgage interest and other finance costs'),
];

String calculationTypeWords(String type) => switch (type) {
  'in-year' => 'In-year calculation',
  'intent-to-finalise' => 'Final calculation',
  'intent-to-amend' => 'Calculation for an amendment',
  _ => 'Calculation',
};

class UkMtdScreen extends StatefulWidget {
  const UkMtdScreen({super.key, required this.taxYear});

  final String taxYear;

  @override
  State<UkMtdScreen> createState() => _UkMtdScreenState();
}

class _UkMtdScreenState extends State<UkMtdScreen> {
  late String _year = widget.taxYear;
  Future<Object?>? _periods;
  Future<HmrcStatus>? _status;
  final _turnover = TextEditingController();
  final _property = TextEditingController();
  Map<String, dynamic>? _mandate;
  Map<String, dynamic>? _calculation;
  String _problem = '';
  bool _busy = false;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _periods ??= ukQuery(_api, 'gb_mtd_periods', {'taxYear': _year});
    _status ??= loadHmrcStatus(_api);
  }

  @override
  void dispose() {
    _turnover.dispose();
    _property.dispose();
    super.dispose();
  }

  void _reload() => setState(() {
    _periods = ukQuery(_api, 'gb_mtd_periods', {'taxYear': _year});
    _status = loadHmrcStatus(_api);
  });

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _reload();
  }

  Future<void> _checkMandate() async {
    if (poundsInvalid(_turnover.text) || poundsInvalid(_property.text)) {
      setState(() => _problem = 'Some amounts need a look.');
      return;
    }
    setState(() => _problem = '');
    final result = await ukQuery(_api, 'gb_mtd_mandate', {'selfEmploymentTurnover': poundsOf(_turnover.text) ?? 0, 'propertyIncome': poundsOf(_property.text) ?? 0});
    if (!mounted) return;
    setState(() {
      if (ukOk(result)) {
        _mandate = toolData(result);
      } else {
        _problem = ukErrorWords(result);
      }
    });
  }

  Future<void> _calculate() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _problem = '';
    });
    try {
      final device = await hmrcDeviceReader(context);
      final reply = await proposeAndConfirm(_api, 'trigger_gb_itsa_calculation', {'taxYear': _year, 'calculationType': 'in-year', 'device': device});
      if (!mounted) return;
      setState(() {
        if (reply.posted) {
          _calculation = reply.toolResult('trigger_gb_itsa_calculation');
        } else {
          _problem = replyProblem(reply, 'trigger_gb_itsa_calculation', fallback: 'HMRC did not work out a calculation.');
        }
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _problem = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final years = [widget.taxYear, gbTaxYearBefore(widget.taxYear)];
    final mandate = _mandate;
    return Scaffold(
      appBar: AppBar(title: const Text('MTD for Income Tax')),
      body: ListView(
        padding: ukPagePadding,
        children: [
          DropdownButtonFormField<String>(
            key: const Key('uk.mtd.year'),
            initialValue: _year,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Tax year'),
            items: [for (final y in years) DropdownMenuItem(value: y, child: Text(y))],
            onChanged: (v) {
              _year = v ?? _year;
              _calculation = null;
              _reload();
            },
          ),
          const SizedBox(height: 16),
          if (_problem.isNotEmpty) UkProblem(_problem),
          FutureBuilder<HmrcStatus>(
            future: _status,
            builder: (context, statusSnap) => FutureBuilder<Object?>(
              future: _periods,
              builder: (context, snap) {
                if (!snap.hasData && snap.connectionState != ConnectionState.done) return const UkCard(children: [LinearProgressIndicator()]);
                final status = statusSnap.data;
                if (!ukOk(snap.data)) return UkCard(children: [UkNote(ukErrorWords(snap.data, fallback: 'The quarters could not be loaded.'), warn: true)]);
                final data = toolData(snap.data);
                final periods = ukMaps(data['periods']);
                final obligations = status?.itsaObligations ?? const <Map<String, dynamic>>[];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionLabel('Quarterly updates'),
                    UkNote(data['calendarQuarters'] == true ? 'Calendar quarters. Each update covers the tax year so far.' : 'Standard quarters. Each update covers the tax year so far.'),
                    Panel(
                      children: [
                        for (final p in periods)
                          Builder(
                            builder: (context) {
                              final to = ukText(p['to']);
                              final sent = obligations.any((o) => ukText(o['to']) == to && ukText(o['status']) == 'fulfilled');
                              return RowCard(
                                key: Key('uk.mtd.quarter.${ukText(p['quarter'])}'),
                                leading: TintTile(tint: sent ? Tint.ask : Tint.taxes, mark: sent ? Mark.confirm : Mark.comingUp),
                                title: 'Quarter ${ukText(p['quarter'])}: to ${gbDay(to)}',
                                subtitle: sent ? 'Sent to HMRC' : 'Due ${gbDay(ukText(p['dueBy']))}',
                                trailing: const Chevron(),
                                onTap: () => _open(UkQuarterScreen(taxYear: _year, period: p, businesses: status?.itsaBusinesses ?? const [])),
                              );
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    UkNote('Final declaration due ${gbDay(ukText(data['finalDeclarationBy']))}.'),
                    if (status != null && !status.connected) ...[
                      const UkNote('Connect to HMRC to send updates.', warn: true),
                      UkWideButton(label: 'Connect to HMRC', outlined: true, onPressed: () => _open(UkConnectScreen(taxYear: _year))),
                    ],
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          const SectionLabel('HMRC\'s calculation'),
          UkCard(
            children: [
              const UkNote('HMRC works out your Income Tax and National Insurance from the updates sent so far.'),
              if (_calculation != null) CalculationView(calculation: _calculation!),
              UkWideButton(label: _busy ? 'Asking HMRC…' : 'Ask HMRC for a calculation', outlined: true, onPressed: _busy ? null : _calculate),
            ],
          ),
          const SectionLabel('Final declaration'),
          UkCard(
            children: [
              const UkNote('After the last quarter, confirm your figures for the year with HMRC. This takes the place of the Self Assessment return.'),
              UkWideButton(label: 'Start the final declaration', onPressed: () => _open(UkFinalDeclarationScreen(taxYear: _year))),
            ],
          ),
          const SectionLabel('Must I use Making Tax Digital?'),
          UkCard(
            children: [
              const UkNote('Add up self-employed turnover and rent from property for the year, before expenses.'),
              UkMoneyField(key: const Key('uk.mtd.turnover'), controller: _turnover, label: 'Self-employed turnover', onChanged: (_) => setState(() {})),
              UkMoneyField(key: const Key('uk.mtd.property'), controller: _property, label: 'Property income', onChanged: (_) => setState(() {})),
              UkWideButton(label: 'Check', outlined: true, onPressed: _checkMandate),
              if (mandate != null) ...[
                Text(mandate['mustJoinFrom'] == null ? 'Not required yet' : 'Required from ${gbDay(ukText(mandate['mustJoinFrom']))}', key: const Key('uk.mtd.mandate'), style: text.titleMedium),
                UkNote(ukText(mandate['why'])),
                if (mandate['unreviewed'] == true) const UkNote(unreviewedWords, warn: true),
              ],
            ],
          ),
          const UkFooter(),
        ],
      ),
    );
  }
}

class CalculationView extends StatelessWidget {
  const CalculationView({super.key, required this.calculation});

  final Map<String, dynamic> calculation;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final c = calculation;
    final total = ukNumOrNull(c['totalIncomeTaxAndNicsDue']);
    return Column(
      key: const Key('uk.mtd.calculation'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(calculationTypeWords(ukText(c['calculationType'])), style: text.titleMedium),
        if (ukText(c['status']) == 'requested') UkNote(ukText(c['hint']).isEmpty ? 'HMRC is still working it out. Try again in a minute.' : ukText(c['hint'])),
        if (ukNumOrNull(c['totalTaxableIncome']) != null) UkFigure(label: 'Taxable income', amount: ukNum(c['totalTaxableIncome'])),
        if (ukNumOrNull(c['incomeTax']) != null) UkFigure(label: 'Income tax', amount: ukNum(c['incomeTax'])),
        if (ukNumOrNull(c['nics']) != null) UkFigure(label: 'National Insurance', amount: ukNum(c['nics'])),
        if (total != null) UkFigure(label: 'Total Income Tax and National Insurance', amount: total, strong: true),
        const SizedBox(height: 8),
      ],
    );
  }
}

class UkQuarterScreen extends StatefulWidget {
  const UkQuarterScreen({super.key, required this.taxYear, required this.period, required this.businesses});

  final String taxYear;
  final Map<String, dynamic> period;
  final List<Map<String, dynamic>> businesses;

  @override
  State<UkQuarterScreen> createState() => _UkQuarterScreenState();
}

class _UkQuarterScreenState extends State<UkQuarterScreen> {
  String _kind = 'self-employment';
  String? _businessId;
  final _typedBusiness = TextEditingController();
  final _amounts = <String, TextEditingController>{};
  Map<String, dynamic>? _prepared;
  ChatPreview? _preview;
  Map<String, dynamic>? _receipt;
  String _problem = '';
  bool _busy = false;

  MycaApi get _api => AppScope.of(context).api;

  TextEditingController _amount(String key) => _amounts.putIfAbsent('$_kind.$key', TextEditingController.new);

  List<Map<String, dynamic>> get _matching => [for (final b in widget.businesses) if (ukText(b['typeOfBusiness']) == _kind) b];

  String get _from => ukText(widget.period['cumulativeFrom']).isEmpty ? ukText(widget.period['from']) : ukText(widget.period['cumulativeFrom']);

  String get _to => ukText(widget.period['to']);

  String get _business => _matching.isEmpty ? _typedBusiness.text.trim() : (_businessId ?? ukText(_matching.first['businessId']));

  @override
  void dispose() {
    _typedBusiness.dispose();
    for (final c in _amounts.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _changed() => setState(() {
    _prepared = null;
    _preview = null;
  });

  Map<String, double> _values(List<(String, String)> fields) => {
    for (final f in fields)
      if ((poundsOf(_amount(f.$1).text) ?? 0) > 0) f.$1: poundsOf(_amount(f.$1).text)!,
  };

  Future<void> _check() async {
    final fields = _kind == 'self-employment' ? [...selfEmploymentIncomeFields, ...selfEmploymentExpenseFields] : [...propertyIncomeFields, ...propertyExpenseFields];
    if (fields.any((f) => poundsInvalid(_amount(f.$1).text))) {
      setState(() => _problem = 'Some amounts need a look.');
      return;
    }
    setState(() {
      _busy = true;
      _problem = '';
    });
    final args = <String, Object?>{
      'kind': _kind,
      'taxYear': widget.taxYear,
      'periodStartDate': _from,
      'periodEndDate': _to,
      if (_kind == 'self-employment') 'transactions': [for (final e in _values([...selfEmploymentIncomeFields, ...selfEmploymentExpenseFields]).entries) {'field': e.key, 'amount': e.value}],
      if (_kind == 'uk-property') 'income': _values(propertyIncomeFields),
      if (_kind == 'uk-property') 'expenses': _values(propertyExpenseFields),
    };
    final result = await ukQuery(_api, 'gb_itsa_quarter_check', args);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ukOk(result)) {
        _prepared = toolData(result);
      } else {
        _prepared = null;
        _problem = ukErrorWords(result, fallback: 'The update could not be prepared.');
      }
    });
  }

  bool get _ready => _prepared != null && _prepared!['ready'] != false;

  Future<void> _propose() async {
    final prepared = _prepared;
    if (prepared == null || !_ready || _busy) return;
    if (_business.isEmpty) {
      setState(() => _problem = 'Choose the business HMRC knows you by. Sync with HMRC to list them.');
      return;
    }
    setState(() {
      _busy = true;
      _problem = '';
    });
    try {
      final device = await hmrcDeviceReader(context);
      final reply = await _api.propose('submit_gb_itsa_update', {'kind': _kind, 'businessId': _business, 'taxYear': widget.taxYear, 'body': prepared['body'], 'device': device});
      if (!mounted) return;
      setState(() {
        _preview = reply.preview;
        if (reply.preview == null) _problem = reply.reply.isEmpty ? 'The update cannot be sent yet.' : reply.reply;
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
          _receipt = reply.toolResult('submit_gb_itsa_update');
        } else {
          _problem = replyProblem(reply, 'submit_gb_itsa_update');
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

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final receipt = _receipt;
    final prepared = _prepared;
    final preview = _preview;
    final income = _kind == 'self-employment' ? selfEmploymentIncomeFields : propertyIncomeFields;
    final expenses = _kind == 'self-employment' ? selfEmploymentExpenseFields : propertyExpenseFields;
    return Scaffold(
      appBar: AppBar(title: Text('Quarter ${ukText(widget.period['quarter'])} update')),
      body: ListView(
        padding: ukPagePadding,
        children: receipt != null
            ? [
                UkCard(
                  key: const Key('uk.mtd.receipt'),
                  tone: Palette.accentSoft,
                  children: [
                    Text('HMRC has your update', style: text.headlineSmall),
                    UkNote('${gbDay(_from)} to ${gbDay(ukText(receipt['periodEnd']).isEmpty ? _to : ukText(receipt['periodEnd']))}'),
                    if (ukText(receipt['environment']) == 'mock') const UkNote('Sent to the MyCA simulator, not to HMRC.', warn: true),
                    if (ukText(receipt['correlationId']).isNotEmpty) UkNote('Reference ${ukText(receipt['correlationId'])}'),
                    UkNote(ukText(receipt['hint']).isEmpty ? 'Updates are cumulative: the next one replaces this from the start of the tax year.' : ukText(receipt['hint'])),
                  ],
                ),
                UkWideButton(label: 'Done', onPressed: () => Navigator.of(context).maybePop()),
              ]
            : [
                Text('${gbDay(_from)} to ${gbDay(_to)}', style: text.titleMedium),
                UkNote('Due ${gbDay(ukText(widget.period['dueBy']))}. Enter totals for the tax year so far, not just this quarter.'),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  key: const Key('uk.quarter.kind'),
                  initialValue: _kind,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Which income'),
                  items: const [
                    DropdownMenuItem(value: 'self-employment', child: Text('Self-employment')),
                    DropdownMenuItem(value: 'uk-property', child: Text('UK property')),
                  ],
                  onChanged: (v) {
                    _kind = v ?? _kind;
                    _businessId = null;
                    _changed();
                  },
                ),
                const SizedBox(height: 12),
                if (_matching.isNotEmpty)
                  DropdownButtonFormField<String>(
                    key: const Key('uk.quarter.business'),
                    initialValue: _business,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Business at HMRC'),
                    items: [
                      for (final b in _matching)
                        DropdownMenuItem(value: ukText(b['businessId']), child: Text(ukText(b['tradingName']).isEmpty ? ukText(b['businessId']) : '${ukText(b['tradingName'])} (${ukText(b['businessId'])})', overflow: TextOverflow.ellipsis)),
                    ],
                    onChanged: (v) => setState(() => _businessId = v),
                  )
                else
                  TextField(
                    key: const Key('uk.quarter.businessId'),
                    controller: _typedBusiness,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'HMRC business ID', helperText: 'Sync with HMRC to fill this in for you', helperMaxLines: 2),
                  ),
                const SizedBox(height: 16),
                const SectionLabel('Income'),
                for (final f in income) UkMoneyField(key: Key('uk.quarter.${f.$1}'), controller: _amount(f.$1), label: f.$2, onChanged: (_) => _changed()),
                const SectionLabel('Expenses'),
                for (final f in expenses) UkMoneyField(key: Key('uk.quarter.${f.$1}'), controller: _amount(f.$1), label: f.$2, onChanged: (_) => _changed()),
                if (_problem.isNotEmpty) UkProblem(_problem),
                UkWideButton(label: _busy && prepared == null ? 'Checking…' : 'Check the update', onPressed: _busy ? null : _check),
                if (prepared != null) ...[
                  UkCard(
                    key: const Key('uk.quarter.review'),
                    children: [
                      Text('WHAT HMRC WILL SEE', style: text.labelSmall),
                      if (ukMap(prepared['totals']).isNotEmpty) ...[
                        UkFigure(label: 'Income', amount: ukNum(ukMap(prepared['totals'])['income'])),
                        UkFigure(label: 'Expenses', amount: ukNum(ukMap(prepared['totals'])['expenses'])),
                        UkFigure(label: 'Profit so far', amount: ukNum(ukMap(prepared['totals'])['profit']), strong: true),
                      ],
                      if (prepared['consolidated'] == true) const UkNote('Expenses go to HMRC as one total, because turnover is under the VAT registration threshold.'),
                      for (final p in ukMaps(prepared['problems'])) UkNote(ukText(p['why']), warn: true),
                    ],
                  ),
                  if (_ready && preview == null) UkWideButton(key: const Key('uk.quarter.submit'), label: _busy ? 'Getting it ready…' : 'Send to HMRC', onPressed: _busy ? null : _propose),
                  if (preview != null) UkPreviewCard(preview: preview, busy: _busy, onSend: _send, onCancel: _cancel, sendLabel: 'Confirm and send'),
                ],
                const UkFooter(),
              ],
      ),
    );
  }
}

class UkFinalDeclarationScreen extends StatefulWidget {
  const UkFinalDeclarationScreen({super.key, required this.taxYear});

  final String taxYear;

  @override
  State<UkFinalDeclarationScreen> createState() => _UkFinalDeclarationScreenState();
}

class _UkFinalDeclarationScreenState extends State<UkFinalDeclarationScreen> {
  Map<String, dynamic>? _calculation;
  bool _declared = false;
  bool _busy = false;
  String _problem = '';
  ChatPreview? _preview;
  Map<String, dynamic>? _receipt;

  MycaApi get _api => AppScope.of(context).api;

  String get _calculationId => ukText(_calculation?['calculationId']);

  bool get _usable => _calculationId.isNotEmpty && ukText(_calculation?['status']) != 'requested';

  Future<void> _step(Future<void> Function() run) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _problem = '';
    });
    try {
      await run();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _problem = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _calculate() => _step(() async {
    final device = await hmrcDeviceReader(context);
    final reply = await proposeAndConfirm(_api, 'trigger_gb_itsa_calculation', {'taxYear': widget.taxYear, 'calculationType': 'intent-to-finalise', 'device': device});
    if (!mounted) return;
    setState(() {
      _declared = false;
      if (reply.posted) {
        _calculation = reply.toolResult('trigger_gb_itsa_calculation');
      } else {
        _problem = replyProblem(reply, 'trigger_gb_itsa_calculation', fallback: 'HMRC did not work out a calculation.');
      }
    });
  });

  Future<void> _propose() => _step(() async {
    if (!_declared || !_usable) return;
    final device = await hmrcDeviceReader(context);
    final reply = await _api.propose('submit_gb_final_declaration', {'taxYear': widget.taxYear, 'calculationId': _calculationId, 'declaration': true, 'device': device});
    if (!mounted) return;
    setState(() {
      _preview = reply.preview;
      if (reply.preview == null) _problem = reply.reply.isEmpty ? 'The final declaration cannot be sent yet.' : reply.reply;
    });
  });

  Future<void> _send() => _step(() async {
    final preview = _preview;
    if (preview == null) return;
    final reply = await _api.confirm(preview.token);
    if (!mounted) return;
    setState(() {
      _preview = null;
      if (reply.posted) {
        _receipt = reply.toolResult('submit_gb_final_declaration');
      } else {
        _problem = replyProblem(reply, 'submit_gb_final_declaration');
      }
    });
  });

  Future<void> _cancel() async {
    setState(() => _preview = null);
    try {
      await _api.discard();
    } on MycaApiException {
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final receipt = _receipt;
    final preview = _preview;
    return Scaffold(
      appBar: AppBar(title: Text('Final declaration ${widget.taxYear}')),
      body: ListView(
        padding: ukPagePadding,
        children: receipt != null
            ? [
                UkCard(
                  key: const Key('uk.final.receipt'),
                  tone: Palette.accentSoft,
                  children: [
                    Text('HMRC has your final declaration', style: text.headlineSmall),
                    UkNote('Tax year ${ukText(receipt['taxYear']).isEmpty ? widget.taxYear : ukText(receipt['taxYear'])}'),
                    if (receipt['totalDue'] is num) UkFigure(label: 'Income Tax and National Insurance', amount: receipt['totalDue'] as num, strong: true),
                    if (ukText(receipt['environment']) == 'mock') const UkNote('Sent to the MyCA simulator, not to HMRC.', warn: true),
                    if (ukText(receipt['correlationId']).isNotEmpty) UkNote('Reference ${ukText(receipt['correlationId'])}'),
                    if (ukText(receipt['at']).isNotEmpty) UkNote('Sent ${gbDay(ukText(receipt['at']))}'),
                    const UkNote('Any balancing payment is due by 31 January.'),
                  ],
                ),
                UkWideButton(label: 'Done', onPressed: () => Navigator.of(context).maybePop()),
              ]
            : [
                Text('Step 1. Get HMRC\'s final calculation', style: text.titleMedium),
                const UkNote('HMRC works out the tax for the whole year from your updates. Check it before you declare.'),
                if (_calculation != null) CalculationView(calculation: _calculation!),
                UkWideButton(label: _calculation == null ? 'Ask HMRC for the final calculation' : 'Ask again', outlined: _calculation != null, onPressed: _busy ? null : _calculate),
                const SizedBox(height: 16),
                Text('Step 2. Declare', style: text.titleMedium),
                const SizedBox(height: 6),
                CheckboxListTile(
                  key: const Key('uk.final.declare'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _declared,
                  onChanged: _usable && preview == null ? (v) => setState(() => _declared = v ?? false) : null,
                  title: const Text(finalDeclarationWords),
                ),
                if (!_usable) const UkNote('Get the final calculation first.'),
                if (_problem.isNotEmpty) UkProblem(_problem),
                if (preview == null)
                  UkWideButton(key: const Key('uk.final.submit'), label: _busy ? 'Working…' : 'Send final declaration', onPressed: _declared && _usable && !_busy ? _propose : null)
                else
                  UkPreviewCard(preview: preview, busy: _busy, onSend: _send, onCancel: _cancel, sendLabel: 'Confirm and send'),
                const UkNote('This cannot be undone. An amendment is a new submission within 12 months of the deadline.'),
                const UkFooter(),
              ],
      ),
    );
  }
}
