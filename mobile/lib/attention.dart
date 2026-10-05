import 'api/models.dart';

const _severityRank = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3};
const _urgentRank = 1;
const upcomingLimit = 4;

int severityRank(ExceptionItem item) =>
    _severityRank[item.severity] ?? _severityRank.length;

bool isUrgent(ExceptionItem item) => severityRank(item) <= _urgentRank;

List<ExceptionItem> needsYou(Today today) {
  final open = today.exceptions.where((item) => item.open).toList();
  open.sort(compareNeedsYou);
  return open;
}

int compareNeedsYou(ExceptionItem a, ExceptionItem b) {
  final bySeverity = severityRank(a).compareTo(severityRank(b));
  if (bySeverity != 0) return bySeverity;
  return b.moneyAtRisk.compareTo(a.moneyAtRisk);
}

List<Deadline> comingUp(Today today) => today.deadlines
    .where((deadline) => deadline.onTrack)
    .take(upcomingLimit)
    .toList();
