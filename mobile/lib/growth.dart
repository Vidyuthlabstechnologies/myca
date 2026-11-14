import 'package:shared_preferences/shared_preferences.dart';

const usFunnelAllowed = bool.fromEnvironment('MYCA_US_FUNNEL');

abstract class FunnelStore {
  Future<Set<String>> sent();
  Future<void> markSent(Iterable<String> steps);
}

class DeviceFunnelStore implements FunnelStore {
  static const _key = 'funnel.sent';

  @override
  Future<Set<String>> sent() async => ((await SharedPreferences.getInstance()).getStringList(_key) ?? const []).toSet();

  @override
  Future<void> markSent(Iterable<String> steps) async {
    final prefs = await SharedPreferences.getInstance();
    final all = {...(prefs.getStringList(_key) ?? const <String>[]), ...steps}.toList()..sort();
    await prefs.setStringList(_key, all);
  }
}

class MemoryFunnelStore implements FunnelStore {
  final Set<String> steps = {};

  @override
  Future<Set<String>> sent() async => {...steps};

  @override
  Future<void> markSent(Iterable<String> given) async => steps.addAll(given);
}

typedef SendFunnelSteps = Future<void> Function(List<Map<String, Object?>> steps);

class FunnelTracker {
  FunnelTracker({required this.store, required String edition, this.usAllowed = usFunnelAllowed}) : edition = edition.toUpperCase() == 'US' ? 'us' : 'india';

  final FunnelStore store;
  final String edition;
  final bool usAllowed;
  final Set<String> _inFlight = {};

  bool get active => edition == 'india' || usAllowed;

  Future<int> reach(Iterable<String> steps, SendFunnelSteps send, {String source = ''}) async {
    if (!active) return 0;
    final done = await store.sent();
    final fresh = [
      for (final step in {...steps})
        if (!done.contains(step) && !_inFlight.contains(step)) step,
    ];
    if (fresh.isEmpty) return 0;
    _inFlight.addAll(fresh);
    try {
      await send([
        for (final step in fresh) {'step': step, 'edition': edition, if (source.isNotEmpty) 'source': source},
      ]);
      await store.markSent(fresh);
      return fresh.length;
    } catch (_) {
      return 0;
    } finally {
      _inFlight.removeAll(fresh);
    }
  }
}

class ReferralInfo {
  const ReferralInfo({required this.code, required this.link, required this.invited, required this.converted, required this.reward, this.firm = false, this.creditsEarned = 0});

  factory ReferralInfo.fromJson(Map<String, dynamic> map) => ReferralInfo(
        code: '${map['code'] ?? ''}',
        link: map['link'] is String ? map['link'] as String : null,
        invited: map['invited'] is num ? (map['invited'] as num).toInt() : 0,
        converted: map['converted'] is num ? (map['converted'] as num).toInt() : 0,
        reward: map['reward'] is String && (map['reward'] as String).isNotEmpty ? map['reward'] as String : null,
        firm: map['firm'] == true,
        creditsEarned: map['credits'] is Map && (map['credits'] as Map)['earned'] is num ? ((map['credits'] as Map)['earned'] as num).toInt() : 0,
      );

  final String code;
  final String? link;
  final int invited;
  final int converted;
  final String? reward;
  final bool firm;
  final int creditsEarned;

  String? get firmLine => firm ? 'Each client who joins with your code and pays earns your firm a credit. ${creditsEarned == 1 ? '1 credit' : '$creditsEarned credits'} earned so far.' : null;

  String shareText({required bool us}) {
    final where = link ?? (us ? 'MyCA US on the app store' : 'MyCA on Google Play');
    final what = us ? 'I file my taxes with MyCA.' : 'I keep my books and GST in MyCA.';
    return '$what Get it at $where and use my invite code $code when you sign up.';
  }
}

String referralClaimMessage(String error) => switch (error) {
      'BAD_CODE' => 'An invite code has 8 letters and numbers. Check it and try again.',
      'CODE_NOT_FOUND' => 'MyCA does not know that code. Check it with the person who sent it.',
      'OWN_CODE' => 'That is your own code. Share it with someone else.',
      'ALREADY_CLAIMED' => 'You have already used an invite code.',
      'CLAIM_WINDOW_CLOSED' => 'Invite codes can be used in the first 30 days after you join.',
      'RATE_LIMITED' => 'Too many tries. Wait an hour and try again.',
      _ => 'MyCA could not use that code right now. Try again later.',
    };
