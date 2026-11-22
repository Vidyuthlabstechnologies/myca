import '../marks.dart';
import '../migration.dart';
import '../theme.dart';
import 'uae_cloud_strings.dart';
import 'uae_strings.dart';

ImportOption uaeBankCsv(UaeStrings s) => ImportOption(
  title: s.bankStatementCsv,
  howTo: s.bankStatementHow,
  extensions: const ['csv'],
  tool: 'import_bank',
  extraArgs: const {'type': 'csv'},
);

List<MigrationPath> uaeMigrationPaths(UaeStrings s) {
  MigrationPath path(BooksSource source, String key, Mark mark, Tint tint, {bool bank = true}) => MigrationPath(
    source: source,
    title: s.migrationTitle(key),
    subtitle: s.migrationSubtitle(key),
    mark: mark,
    tint: tint,
    promise: s.migrationPromise(key),
    imports: bank ? [uaeBankCsv(s)] : const [],
  );
  return [
    path(BooksSource.spreadsheet, 'spreadsheet', Mark.spreadsheet, Tint.ask),
    path(BooksSource.otherApp, 'otherApp', Mark.otherApp, Tint.ask),
    path(BooksSource.paper, 'paper', Mark.paper, Tint.expense),
    path(BooksSource.fresh, 'fresh', Mark.fresh, Tint.sales, bank: false),
  ];
}
