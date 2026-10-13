import 'marks.dart';
import 'theme.dart';

enum BooksSource { tally, zoho, usBooks, otherApp, spreadsheet, paper, fresh }

class ImportOption {
  const ImportOption({
    required this.title,
    required this.howTo,
    required this.extensions,
    required this.tool,
    this.extraArgs = const {},
  });

  final String title;
  final String howTo;
  final List<String> extensions;
  final String tool;
  final Map<String, Object?> extraArgs;

  Map<String, Object?> argsFor(String documentSha256) => {'documentSha256': documentSha256, ...extraArgs};
}

class MigrationPath {
  const MigrationPath({
    required this.source,
    required this.title,
    required this.subtitle,
    required this.mark,
    required this.tint,
    required this.promise,
    required this.imports,
  });

  final BooksSource source;
  final String title;
  final String subtitle;
  final Mark mark;
  final Tint tint;
  final String promise;
  final List<ImportOption> imports;
}

const tallyCsv = ImportOption(
  title: 'Tally Day Book (CSV)',
  howTo: 'In Tally: Display > Day Book > Export > Format: CSV.',
  extensions: ['csv'],
  tool: 'import_tally',
);

const tallyXml = ImportOption(
  title: 'TallyPrime vouchers (XML)',
  howTo: 'In TallyPrime: Export > Transactions > Format: XML.',
  extensions: ['xml'],
  tool: 'import_tally_xml',
);

const zohoCsv = ImportOption(
  title: 'Zoho Books invoices (CSV)',
  howTo: 'In Zoho Books: Sales > Invoices > Export Invoices > CSV.',
  extensions: ['csv'],
  tool: 'import_zoho',
);

const usInvoicesCsv = ImportOption(
  title: 'QuickBooks or Xero invoices (CSV)',
  howTo: 'In QuickBooks Online: Sales > Invoices > Export to Excel, saved as CSV. In Xero: Business > Invoices > Export. Sales tax is applied from the rates you recorded; invoices whose tax differs are held back by number.',
  extensions: ['csv'],
  tool: 'import_us_invoices',
);

const bankCsv = ImportOption(
  title: 'Bank statement (CSV)',
  howTo:
      'Download the statement from your bank as CSV for the months you want.',
  extensions: ['csv'],
  tool: 'import_bank',
  extraArgs: {'type': 'csv'},
);

const migrationPaths = [
  MigrationPath(
    source: BooksSource.tally,
    title: 'Tally',
    subtitle: 'Tally ERP 9 or TallyPrime',
    mark: Mark.tally,
    tint: Tint.purchases,
    promise:
        'Bring your vouchers across from a Day Book export. Each row is checked before it is posted.',
    imports: [tallyCsv, tallyXml, bankCsv],
  ),
  MigrationPath(
    source: BooksSource.zoho,
    title: 'Zoho Books',
    subtitle: 'Invoices exported as CSV',
    mark: Mark.cloudBooks,
    tint: Tint.sales,
    promise:
        'Bring your invoices across from a Zoho export. Each invoice is checked before it is posted.',
    imports: [zohoCsv, bankCsv],
  ),
  MigrationPath(
    source: BooksSource.usBooks,
    title: 'QuickBooks or Xero',
    subtitle: 'For a US business: invoices exported as CSV',
    mark: Mark.cloudBooks,
    tint: Tint.sales,
    promise:
        'Bring your invoices across from a QuickBooks Online or Xero export. Each invoice is checked against the sales tax rates you recorded before it is posted.',
    imports: [usInvoicesCsv, bankCsv],
  ),
  MigrationPath(
    source: BooksSource.otherApp,
    title: 'Another billing app',
    subtitle: 'Vyapar, Khatabook, Busy, Marg and others',
    mark: Mark.otherApp,
    tint: Tint.ask,
    promise:
        'MyCA cannot read this app\'s export yet. Start from your bank statement so your money trail is in, '
        'then add sales and bills as you go. If the app can export a Tally-format Day Book, use that instead.',
    imports: [bankCsv, tallyCsv],
  ),
  MigrationPath(
    source: BooksSource.spreadsheet,
    title: 'Excel or Google Sheets',
    subtitle: 'Registers kept in a spreadsheet',
    mark: Mark.spreadsheet,
    tint: Tint.ask,
    promise:
        'MyCA cannot read a free-form sheet yet. Start from your bank statement, then add sales and bills as you go.',
    imports: [bankCsv],
  ),
  MigrationPath(
    source: BooksSource.paper,
    title: 'Paper, or my CA has them',
    subtitle: 'Bill books, files, or with an accountant',
    mark: Mark.paper,
    tint: Tint.expense,
    promise:
        'Ask your CA for a Tally Day Book export and bring it in, or start from your bank statement.',
    imports: [tallyCsv, tallyXml, bankCsv],
  ),
  MigrationPath(
    source: BooksSource.fresh,
    title: 'Starting fresh',
    subtitle: 'New business, or a clean start',
    mark: Mark.fresh,
    tint: Tint.sales,
    promise:
        'Nothing to bring across. Your first sale or bill starts the books.',
    imports: [],
  ),
];

MigrationPath pathFor(BooksSource source) =>
    migrationPaths.firstWhere((path) => path.source == source);

const _gstinPattern = r'^[0-9]{2}[A-Z0-9]{13}$';

String? gstinShapeError(String value) {
  final text = value.trim().toUpperCase();
  if (text.isEmpty) return null;
  return RegExp(_gstinPattern).hasMatch(text)
      ? null
      : 'A GSTIN has 15 characters and starts with the state code.';
}
