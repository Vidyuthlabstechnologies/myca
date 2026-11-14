import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../format.dart';
import '../theme.dart';
import 'uk_common.dart';

const _bandWords = <String, String>{
  'starter': 'Starter rate',
  'basic': 'Basic rate',
  'intermediate': 'Intermediate rate',
  'higher': 'Higher rate',
  'advanced': 'Advanced rate',
  'additional': 'Additional rate',
  'top': 'Top rate',
  'starting-rate': 'Starting rate for savings',
  'personal-savings-allowance': 'Personal Savings Allowance',
  'dividend-allowance': 'Dividend allowance',
};

const _incomeWords = <String, String>{
  'non-savings': 'Earnings, profits and rent',
  'savings': 'Savings interest',
  'dividends': 'Dividends',
};

String bandWords(String band) => _bandWords[band] ?? band.replaceAll('-', ' ');

class UkEstimate {
  const UkEstimate(this.data);

  final Map<String, dynamic> data;

  num get incomeTax => ukNum(data['incomeTax']);
  num get class4 => ukNum(ukMap(data['class4'])['total']);
  num get class2 => ukNum(data['class2Voluntary']);
  num get studentLoan => ukNum(ukMap(data['studentLoan'])['due']);
  num get childBenefitCharge => ukNum(data['highIncomeChildBenefitCharge']);
  num get capitalGainsTax => ukNum(ukMap(data['capitalGains'])['tax']);
  num get total => ukNum(data['totalLiability']);
  num get atSource => ukNum(data['deductedAtSource']);
  num get poaMade => ukNum(data['paymentsOnAccountMade']);
  num get balancing => ukNum(data['balancingPayment']);
  bool get refund => data['refundDue'] == true;
  String get dueBy => ukText(data['dueBy']);
  num get firstPaymentDue => ukNum(data['firstPaymentDue']);
  Map<String, dynamic> get nextYear => ukMap(data['nextYear']);
  num get poaEach => ukNum(nextYear['paymentOnAccountEach']);
  List<String> get poaDates => [for (final d in (nextYear['dueDates'] as List? ?? const [])) '$d'];
  List<Map<String, dynamic>> get bands => ukMaps(data['incomeTaxBands']);
  List<String> get notes => [for (final n in (data['notes'] as List? ?? const [])) '$n'];
  bool get unreviewed => data['unreviewed'] == true;
  num get personalAllowance => ukNum(ukMap(data['allowances'])['personalAllowance']);
  num get totalIncome => ukNum(ukMap(data['income'])['total']);
}

class UkEstimateScreen extends StatefulWidget {
  const UkEstimateScreen({super.key, required this.taxYear});

  final String taxYear;

  @override
  State<UkEstimateScreen> createState() => _UkEstimateScreenState();
}

class _UkEstimateScreenState extends State<UkEstimateScreen> {
  late String _year = widget.taxYear;
  final _c = {
    for (final key in ['employment', 'turnover', 'expenses', 'propertyIncome', 'propertyExpenses', 'savings', 'dividends', 'gains', 'paye', 'childBenefit', 'pension']) key: TextEditingController(),
  };
  bool _busy = false;
  String _problem = '';
  UkEstimate? _estimate;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  double _v(String key) => poundsOf(_c[key]!.text) ?? 0;

  Map<String, Object?> _args() {
    final income = <String, Object?>{
      if (_v('employment') > 0) 'employment': _v('employment'),
      if (_v('turnover') > 0 || _v('expenses') > 0) 'selfEmployment': {'turnover': _v('turnover'), 'expenses': _v('expenses')},
      if (_v('propertyIncome') > 0 || _v('propertyExpenses') > 0) 'property': {'income': _v('propertyIncome'), 'expenses': _v('propertyExpenses')},
      if (_v('savings') > 0) 'savingsInterest': _v('savings'),
      if (_v('dividends') > 0) 'dividends': _v('dividends'),
    };
    return {
      'taxYear': _year,
      'income': income,
      if (_v('paye') > 0) 'taxPaid': {'paye': _v('paye')},
      if (_v('gains') > 0) 'gains': {'other': _v('gains')},
      if (_v('childBenefit') > 0) 'childBenefit': _v('childBenefit'),
      if (_v('pension') > 0) 'pensionContributionsNet': _v('pension'),
    };
  }

  Future<void> _work() async {
    if (_c.values.any((c) => poundsInvalid(c.text))) {
      setState(() => _problem = 'Some amounts need a look.');
      return;
    }
    setState(() {
      _busy = true;
      _problem = '';
    });
    final result = await ukQuery(AppScope.of(context).api, 'gb_tax_estimate', _args());
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (ukOk(result)) {
        _estimate = UkEstimate(toolData(result));
      } else {
        _estimate = null;
        _problem = ukErrorWords(result, fallback: 'The estimate could not be worked out.');
      }
    });
  }

  Widget _field(String key, String label, [String? helper]) => UkMoneyField(controller: _c[key]!, label: label, helper: helper, onChanged: (_) => setState(() {}));

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final years = [widget.taxYear, gbTaxYearBefore(widget.taxYear)];
    final estimate = _estimate;
    return Scaffold(
      appBar: AppBar(title: const Text('Self Assessment estimate')),
      body: ListView(
        padding: ukPagePadding,
        children: [
          DropdownButtonFormField<String>(
            key: const Key('uk.estimate.year'),
            initialValue: _year,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Tax year'),
            items: [for (final y in years) DropdownMenuItem(value: y, child: Text('$y (${gbTaxYearWords(y)})', overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() {
              _year = v ?? _year;
              _estimate = null;
            }),
          ),
          const SizedBox(height: 16),
          Text('Income for the year', style: text.titleMedium),
          const SizedBox(height: 8),
          _field('employment', 'Pay from employment', 'Before tax, from your P60'),
          _field('turnover', 'Self-employed turnover', 'Everything your business took in'),
          _field('expenses', 'Self-employed allowable expenses'),
          _field('propertyIncome', 'Rent from UK property'),
          _field('propertyExpenses', 'Property expenses', 'Not mortgage interest'),
          _field('savings', 'Savings interest'),
          _field('dividends', 'Dividends'),
          _field('gains', 'Capital gains', 'Gains on shares or other assets, after costs'),
          const SizedBox(height: 4),
          Text('Already paid and other details', style: text.titleMedium),
          const SizedBox(height: 8),
          _field('paye', 'Tax taken off through PAYE', 'From your P60 or P45'),
          _field('childBenefit', 'Child Benefit received in the year'),
          _field('pension', 'Personal pension contributions', 'What you paid in, before the tax relief your provider claims'),
          if (_problem.isNotEmpty) UkProblem(_problem),
          UkWideButton(label: _busy ? 'Working it out…' : 'Work out my tax', onPressed: _busy ? null : _work),
          if (estimate != null) _EstimateView(estimate: estimate),
          const UkFooter(),
        ],
      ),
    );
  }
}

class _EstimateView extends StatelessWidget {
  const _EstimateView({required this.estimate});

  final UkEstimate estimate;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final e = estimate;
    final headline = e.refund ? 'About ${pounds(-e.balancing)} back from HMRC' : '${pounds(e.balancing)} to pay by ${gbDay(e.dueBy)}';
    return Column(
      key: const Key('uk.estimate.result'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 12),
        UkCard(
          tone: Palette.accentSoft,
          children: [
            Text('ESTIMATE FOR ${ukText(e.data['taxYear'])}', style: text.labelSmall),
            const SizedBox(height: 6),
            Text(headline, key: const Key('uk.estimate.headline'), style: text.headlineSmall),
            if (!e.refund && e.firstPaymentDue > e.balancing) UkNote('With the first payment on account, ${pounds(e.firstPaymentDue)} is due by ${gbDay(e.dueBy)}.'),
            if (e.unreviewed) const UkNote(unreviewedWords, warn: true),
          ],
        ),
        UkCard(
          children: [
            Text('How it adds up', style: text.titleMedium),
            const SizedBox(height: 6),
            UkFigure(label: 'Total income', amount: e.totalIncome),
            UkFigure(label: 'Personal Allowance', amount: e.personalAllowance),
            UkFigure(label: 'Income tax', amount: e.incomeTax),
            UkFigure(label: 'Class 4 National Insurance', amount: e.class4),
            if (e.class2 > 0) UkFigure(label: 'Voluntary Class 2 National Insurance', amount: e.class2),
            if (e.studentLoan > 0) UkFigure(label: 'Student loan repayment', amount: e.studentLoan),
            if (e.childBenefitCharge > 0) UkFigure(label: 'High Income Child Benefit Charge', amount: e.childBenefitCharge),
            if (e.capitalGainsTax > 0) UkFigure(label: 'Capital Gains Tax', amount: e.capitalGainsTax),
            const Divider(),
            UkFigure(label: 'Total tax for the year', amount: e.total, strong: true),
            if (e.atSource > 0) UkFigure(label: 'Less tax already taken off', amount: -e.atSource),
            if (e.poaMade > 0) UkFigure(label: 'Less payments on account made', amount: -e.poaMade),
            UkFigure(label: e.refund ? 'Refund due' : 'Balancing payment', amount: e.balancing.abs(), strong: true),
          ],
        ),
        UkCard(
          children: [
            Text('Payments on account', style: text.titleMedium),
            const SizedBox(height: 6),
            if (e.poaEach > 0)
              Text('${pounds(e.poaEach)} on ${e.poaDates.map(gbDay).join(' and ')}, towards next year\'s bill.', key: const Key('uk.estimate.poa'), style: text.bodyLarge)
            else
              Text(ukText(e.nextYear['why']).isEmpty ? 'None are due for next year.' : ukText(e.nextYear['why']), key: const Key('uk.estimate.poa'), style: text.bodyLarge),
          ],
        ),
        if (e.bands.isNotEmpty)
          UkCard(
            children: [
              Text('Income tax by band', style: text.titleMedium),
              for (final row in e.bands)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${bandWords(ukText(row['band']))}${row['ratePercent'] is num ? ' at ${_rate(row['ratePercent'] as num)}%' : ''}', style: text.bodyLarge),
                      Text('${_incomeWords[ukText(row['income'])] ?? ukText(row['income'])}: ${pounds(ukNum(row['amount']))}, tax ${pounds(ukNum(row['tax']))}', style: text.bodyMedium),
                    ],
                  ),
                ),
            ],
          ),
        if (e.notes.isNotEmpty)
          UkCard(
            children: [
              Text('Notes', style: text.titleMedium),
              for (final note in e.notes) UkNote(note),
            ],
          ),
        const UkNote('This is an estimate from the figures you entered. Your Self Assessment return or MTD final declaration settles the tax.'),
      ],
    );
  }

  static String _rate(num value) => value == value.roundToDouble() ? value.round().toString() : value.toString();
}
