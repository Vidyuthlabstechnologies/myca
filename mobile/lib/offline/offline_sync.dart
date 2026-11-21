import 'dart:async';

import '../api/myca_api.dart';
import 'offline_billing.dart';

const kitFreshFor = Duration(hours: 4);
const firstRetry = Duration(seconds: 30);
const longestRetry = Duration(minutes: 15);

class OfflineSync {
  OfflineSync(this.offline, this.api, {DateTime Function()? now, this.deviceName = 'Phone', this.timers = true}) : now = now ?? DateTime.now {
    offline.addListener(_changed);
  }

  final OfflineBilling offline;
  final MycaApi api;
  final DateTime Function() now;
  final String deviceName;
  final bool timers;
  Timer? _timer;
  Duration _wait = firstRetry;
  bool _running = false;
  bool? _wasOnline;
  int _waiting = 0;

  void _changed() {
    final online = offline.online;
    final cameBack = _wasOnline == false && online == true;
    _wasOnline = online;
    final more = offline.waitingCount > _waiting;
    _waiting = offline.waitingCount;
    if (!timers) return;
    if (cameBack || (more && online != false)) unawaited(kick());
    if (offline.waitingCount > 0 && _timer == null) _schedule();
  }

  bool get _kitStale {
    final at = DateTime.tryParse(offline.kitAt);
    return !offline.ready || at == null || now().difference(at) > kitFreshFor;
  }

  Future<void> kick() async {
    if (_running || offline.business.isEmpty) return;
    _running = true;
    try {
      if (_kitStale) {
        try {
          await offline.prepare(api, deviceName: deviceName);
        } on MycaApiException catch (err) {
          if (isUnreachable(err)) offline.markOnline(false);
        }
      }
      if (offline.waitingCount > 0 && offline.ready) {
        final outcome = await offline.sync(api);
        _wait = outcome.reachedServer ? firstRetry : _longer(_wait);
      } else {
        _wait = firstRetry;
      }
    } finally {
      _running = false;
      _timer?.cancel();
      _timer = null;
      if (offline.waitingCount > 0) _schedule();
    }
  }

  Duration _longer(Duration wait) {
    final doubled = wait * 2;
    return doubled > longestRetry ? longestRetry : doubled;
  }

  void _schedule() {
    if (!timers) return;
    _timer?.cancel();
    _timer = Timer(_wait, () {
      _timer = null;
      unawaited(kick());
    });
  }

  void dispose() {
    _timer?.cancel();
    offline.removeListener(_changed);
  }
}
