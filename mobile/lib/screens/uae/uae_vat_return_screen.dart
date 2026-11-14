import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../theme.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import '../../widgets.dart';
import 'uae_widgets.dart';

class UaeVatReturn {
  const UaeVatReturn({required this.data, required this.failure, required this.problems});

  final Map<String, dynamic> data;
  final String failure;
  final List<String> problems;

  bool get ok => data.isNotEmpty;
}

Future<UaeVatReturn> loadUaeVatReturn(MycaApi api, String period, List<Map<String, Object?>> lines, {Map<String, Object?>? touristRefunds, bool fromBooks = false, String lang = 'en'}) async {
  try {
    final result = await api.query('ae_vat_return', {
      'period': period,
      if (fromBooks) 'fromBooks': true else 'lines': lines,
      'touristRefunds': ?touristRefunds,
      if (lang == 'ar') 'lang': 'ar',
    });
    return UaeVatReturn(data: toolData(result), failure: uaeFailure(result), problems: uaeProblems(result));
  } on MycaApiException catch (err) {
    return UaeVatReturn(data: const {}, failure: err.message, problems: const []);
  }
}

class UaeVatReturnScreen extends StatefulWidget {
  const UaeVatReturnScreen({super.key, this.quarter});

  final UaeQuarter? quarter;

  @override
  State<UaeVatReturnScreen> createState() => _UaeVatReturnScreenState();
}

class _UaeVatReturnScreenState extends State<UaeVatReturnScreen> {
  late UaeQuarter _quarter;
  Future<UaeVatReturn>? _return;
  bool _editing = false;
  bool _fromBooks = true;
  bool _prefilling = false;
  final _sales = {for (final emirate in emirates) emirate.code: TextEditingController()};
  final _zero = TextEditingController();
  final _exempt = TextEditingController();
  final _touristNet = TextEditingController();
  final _touristVat = TextEditingController();
  final _expenses = TextEditingController();
  final _reverse = TextEditingController();
  final _imports = TextEditingController();
  final _importAdjust = TextEditingController();
  String _note = '';

  List<TextEditingController> get _all => [..._sales.values, _zero, _exempt, _touristNet, _touristVat, _expenses, _reverse, _imports, _importAdjust];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_return != null) return;
    _quarter = widget.quarter ?? UaeQuarter.containing(AppScope.of(context).now()).previous;
    _return = _loadBooks();
  }

  Future<UaeVatReturn> _loadBooks() => loadUaeVatReturn(AppScope.of(context).api, _quarter.period, const [], fromBooks: true, lang: UaeStrings.of(context).ar ? 'ar' : 'en');

  void _useBooks() {
    setState(() {
      _fromBooks = true;
      _editing = false;
      _note = '';
      _return = _loadBooks();
    });
  }

  Future<void> _startEditing() async {
    setState(() {
      _editing = true;
      _prefilling = true;
    });
    final s = UaeStrings.of(context);
    try {
      final data = toolData(await AppScope.of(context).api.query('ae_vat_lines', {'period': _quarter.period, if (s.ar) 'lang': 'ar'}));
      if (mounted && _all.every((c) => c.text.trim().isEmpty)) _prefill(uaeRows(data['lines']));
    } on MycaApiException {
      _prefilling = false;
    }
    if (mounted) setState(() => _prefilling = false);
  }

  void _prefill(List<Map<String, dynamic>> lines) {
    final sums = <TextEditingController, num>{};
    for (final line in lines) {
      final supply = uaeText(line['kind']) == 'supply';
      final treatment = uaeText(line['treatment']).isEmpty ? 'standard' : uaeText(line['treatment']);
      final TextEditingController? target = supply
          ? switch (treatment) {
              'standard' => _sales[uaeText(line['emirate'])],
              'zero-rated' => _zero,
              'exempt' => _exempt,
              _ => null,
            }
          : switch (treatment) {
              'standard' => _expenses,
              'reverse-charge' => _reverse,
              'import' => _imports,
              'import-adjustment' => _importAdjust,
              _ => null,
            };
      if (target != null) sums[target] = (sums[target] ?? 0) + uaeNum(line['net']);
    }
    for (final entry in sums.entries) {
      if (entry.value != 0) entry.key.text = (entry.value * 100).round() % 100 == 0 ? '${entry.value.round()}' : entry.value.toStringAsFixed(2);
    }
  }

  @override
  void dispose() {
    for (final c in _all) {
      c.dispose();
    }
    super.dispose();
  }

  Future<UaeVatReturn> _load(List<Map<String, Object?>> lines, {Map<String, Object?>? tourist}) =>
      loadUaeVatReturn(AppScope.of(context).api, _quarter.period, lines, touristRefunds: tourist);

  List<Map<String, Object?>>? _lines() {
    final lines = <Map<String, Object?>>[];
    void add(TextEditingController c, Map<String, Object?> line) {
      final value = parseDirhams(c.text);
      if (value == null) throw const FormatException();
      if (value != 0) lines.add({...line, 'net': value});
    }
    try {
      for (final entry in _sales.entries) {
        add(entry.value, {'kind': 'supply', 'treatment': 'standard', 'emirate': entry.key});
      }
      add(_zero, {'kind': 'supply', 'treatment': 'zero-rated'});
      add(_exempt, {'kind': 'supply', 'treatment': 'exempt'});
      add(_expenses, {'kind': 'expense', 'treatment': 'standard'});
      add(_reverse, {'kind': 'expense', 'treatment': 'reverse-charge'});
      add(_imports, {'kind': 'expense', 'treatment': 'import'});
      add(_importAdjust, {'kind': 'expense', 'treatment': 'import-adjustment'});
    } on FormatException {
      return null;
    }
    return lines;
  }

  void _workItOut() {
    final s = UaeStrings.of(context);
    final lines = _lines();
    final touristNet = parseDirhams(_touristNet.text);
    final touristVat = parseDirhams(_touristVat.text);
    if (lines == null || touristNet == null || touristVat == null) {
      setState(() => _note = s.badAmount);
      return;
    }
    final tourist = touristNet == 0 && touristVat == 0 ? null : <String, Object?>{'net': touristNet, 'vat': touristVat};
    setState(() {
      _note = '';
      _editing = false;
      _fromBooks = false;
      _return = _load(lines, tourist: tourist);
    });
  }

  void _move(UaeQuarter to) {
    setState(() {
      _quarter = to;
      for (final c in _all) {
        c.clear();
      }
      _note = '';
      _return = _fromBooks ? _loadBooks() : _load(const []);
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    final latest = UaeQuarter.containing(AppScope.of(context).now());
    return Scaffold(
      appBar: AppBar(title: Text(s.vatReturnTitle, maxLines: 2)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          SectionLabel(s.quarter),
          Container(
            decoration: BoxDecoration(color: Palette.surface, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: Palette.line)),
            child: Row(
              children: [
                IconButton(
                  key: const ValueKey('uae.vat.previous'),
                  tooltip: s.ar ? 'الربع السابق' : 'Previous quarter',
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () => _move(_quarter.previous),
                ),
                Expanded(
                  child: Text(f.quarter(_quarter), key: const ValueKey('uae.vat.quarter'), textAlign: TextAlign.center, style: text.titleMedium),
                ),
                IconButton(
                  key: const ValueKey('uae.vat.next'),
                  tooltip: s.ar ? 'الربع التالي' : 'Next quarter',
                  icon: const Icon(Icons.chevron_right),
                  onPressed: _quarter == latest ? null : () => _move(_quarter.next),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                key: const ValueKey('uae.vat.books'),
                label: Text(s.fillFromBooks),
                selected: _fromBooks && !_editing,
                onSelected: (_) => _useBooks(),
              ),
              if (!_editing)
                OutlinedButton.icon(
                  key: const ValueKey('uae.vat.edit'),
                  onPressed: _startEditing,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(s.ar ? 'أدخل أرقام الربع' : 'Enter the quarter\'s figures'),
                ),
            ],
          ),
          if (_editing) ...[
            const SizedBox(height: 14),
            if (_prefilling) const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())) else _form(s, text),
          ],
          if (_note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_note, key: const ValueKey('uae.vat.note'), style: text.bodyMedium?.copyWith(color: Palette.danger)),
          ],
          const SizedBox(height: 18),
          FutureBuilder<UaeVatReturn>(
            future: _return,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
              }
              final result = snap.data;
              if (result == null || !result.ok) {
                if (result != null && result.problems.isNotEmpty) return UaeNotes(title: s.couldNotWorkOut, notes: result.problems, danger: true);
                return UaeError(detail: result?.failure ?? '', onRetry: () => setState(() { _return = _fromBooks ? _loadBooks() : _load(_lines() ?? const []); }));
              }
              return _boxes(result.data, s, f, text);
            },
          ),
        ],
      ),
    );
  }

  Widget _form(UaeStrings s, TextTheme text) {
    return Column(
      key: const ValueKey('uae.vat.form'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(s.ar ? 'المبيعات الخاضعة للنسبة الأساسية قبل الضريبة، حسب الإمارة' : 'Standard-rated sales before VAT, by emirate', style: text.titleSmall),
        const SizedBox(height: 10),
        for (final emirate in emirates)
          UaeMoneyField(fieldKey: ValueKey('uae.vat.sales.${emirate.code}'), controller: _sales[emirate.code]!, label: emirate.name(s.ar)),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.zero'), controller: _zero, label: s.box('4')),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.exempt'), controller: _exempt, label: s.box('5')),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.touristNet'), controller: _touristNet, label: s.ar ? 'قيمة التوريدات المستردة ضريبتها للسياح' : 'Value of supplies refunded to tourists'),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.touristVat'), controller: _touristVat, label: s.ar ? 'الضريبة المستردة للسياح' : 'VAT refunded to tourists'),
        const SizedBox(height: 6),
        Text(s.ar ? 'المشتريات والواردات قبل الضريبة' : 'Purchases and imports before VAT', style: text.titleSmall),
        const SizedBox(height: 10),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.expenses'), controller: _expenses, label: s.box('9')),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.reverse'), controller: _reverse, label: s.ar ? 'خدمات وسلع مستوردة خاضعة للاحتساب العكسي' : 'Imported services and goods under the reverse charge'),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.imports'), controller: _imports, label: s.box('6')),
        UaeMoneyField(fieldKey: const ValueKey('uae.vat.importAdjust'), controller: _importAdjust, label: s.box('7'), signed: true),
        FilledButton(key: const ValueKey('uae.vat.work'), onPressed: _workItOut, child: Text(s.workItOut)),
      ],
    );
  }

  Widget _boxes(Map<String, dynamic> data, UaeStrings s, UaeFormat f, TextTheme text) {
    final boxes = uaeMap(data['boxes']);
    String money(Object? value) => f.money(uaeNum(value));
    Widget row(String key, String label, {bool vat = true, bool adjustment = false, bool strong = false}) {
      final box = uaeMap(boxes[key]);
      final adjust = uaeNum(box['adjustment']);
      return UaeBoxRow(
        box: key,
        label: label,
        amount: money(box['net']),
        vat: vat ? money(box['vat']) : null,
        adjustment: adjustment && adjust != 0 ? money(adjust) : null,
        strong: strong,
      );
    }
    final names = {for (final row in uaeRows(data['emirates'])) uaeText(row['box']): s.ar ? uaeText(row['ar']) : uaeText(row['en'])};
    final refund = data['refund'] == true;
    final payable = uaeNum(data['payable']);
    final warnings = [for (final w in (data['warnings'] as List? ?? const [])) '$w'];
    final books = uaeMap(data['fromBooks']);
    return Column(
      key: const ValueKey('uae.vat.boxes'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (books.isNotEmpty) ...[
          Text(
            s.fromBooksCounts(uaeNum(books['invoices']).toInt(), uaeNum(books['creditNotes']).toInt(), uaeNum(books['purchases']).toInt()),
            key: const ValueKey('uae.vat.fromBooks'),
            style: text.bodyMedium,
          ),
          const SizedBox(height: 12),
        ],
        UaePanel(children: [
          UaeFigure(
            key: const ValueKey('uae.vat.due'),
            label: s.dueOn(f.date(uaeText(data['due']), short: false)),
            caption: s.periodRange(f.date(uaeText(data['start'])), f.date(uaeText(data['end']))),
            value: '',
          ),
        ]),
        const SizedBox(height: 18),
        SectionLabel(s.outputs),
        UaePanel(children: [
          for (final emirate in emirates) row(emirate.box, s.standardRated(names[emirate.box] ?? emirate.name(s.ar)), adjustment: true),
          row('2', s.box('2')),
          row('3', s.box('3')),
          row('4', s.box('4'), vat: false),
          row('5', s.box('5'), vat: false),
          row('6', s.box('6')),
          row('7', s.box('7')),
          row('8', s.box('8'), adjustment: true, strong: true),
        ]),
        const SizedBox(height: 18),
        SectionLabel(s.inputs),
        UaePanel(children: [
          row('9', s.box('9'), adjustment: true),
          row('10', s.box('10')),
          row('11', s.box('11'), adjustment: true, strong: true),
        ]),
        const SizedBox(height: 18),
        SectionLabel(s.netDue),
        UaePanel(children: [
          UaeFigure(caption: s.boxLabel('12'), label: s.box('12'), value: money(data['totalDue']), valueKey: const ValueKey('uae.vat.12')),
          UaeFigure(caption: s.boxLabel('13'), label: s.box('13'), value: money(data['totalRecoverable']), valueKey: const ValueKey('uae.vat.13')),
          UaeFigure(caption: s.boxLabel('14'), label: refund ? s.refundable : s.payable, value: money(refund ? -payable : payable), strong: true, valueKey: const ValueKey('uae.vat.14')),
        ]),
        const SizedBox(height: 14),
        Text(s.filedOnEmaraTax, key: const ValueKey('uae.vat.emaratax'), style: text.bodyMedium),
        if (data['unreviewed'] == true) ...[
          const SizedBox(height: 6),
          Text(s.unreviewed, style: text.bodySmall),
        ],
        if (warnings.isNotEmpty) ...[
          const SizedBox(height: 14),
          UaeNotes(key: const ValueKey('uae.vat.warnings'), title: s.checkBeforeFiling, notes: warnings),
        ],
      ],
    );
  }
}
