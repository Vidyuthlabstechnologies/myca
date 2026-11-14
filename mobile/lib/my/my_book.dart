import '../app_state.dart';
import 'my_tools.dart';

final _books = Expando<List<MyEinvoice>>('myEinvoices');

List<MyEinvoice> myLocalBook(AppState state) => _books[state] ??= <MyEinvoice>[];

void rememberEinvoice(AppState state, MyEinvoice record) {
  final book = myLocalBook(state);
  book.removeWhere((row) => row.number == record.number && row.direction == record.direction);
  book.insert(0, record);
}

Duration myCancelLeft(MyEinvoice record, DateTime now) {
  final until = DateTime.tryParse(record.until);
  final validated = record.validatedTime;
  if (until == null && validated == null) return Duration.zero;
  final left = (until ?? validated!.add(const Duration(hours: 72))).difference(now.toUtc());
  return left.isNegative ? Duration.zero : left;
}
