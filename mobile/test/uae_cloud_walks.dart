import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/lock/app_lock.dart';
import 'package:myca/main.dart';
import 'package:myca/uae/uae_cloud_strings.dart';

import 'cloud_test.dart' show sessionOn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'lock_test.dart' show FakeLock;
import 'uae_fake_api.dart';
import 'uae_walks.dart';

typedef UaeCloudWalk = Future<void> Function(WidgetTester tester);

const uaeOwner = 'Mariam Al Suwaidi';

const uaeCloudData = [
  uaeOwner,
  'Omar Haddad',
  'Khalid Rahman',
  'AB2CD3EF',
  'JBSW Y3DP EHPK 3PXP',
  'mk_testsecret4',
  ...FakeCloud.freshRecoveryCodes,
];

FakeCloud uaeFakeCloud() {
  final cloud = FakeCloud()
    ..userName = uaeOwner
    ..referralInvited = 3
    ..caMode = 'weekly'
    ..sharedAsOf = '2026-11-10T09:30:00.000Z';
  cloud.members.add({'id': 'u2', 'name': 'Omar Haddad', 'role': 'staff'});
  cloud.openInvites.add({'id': 'inv-1', 'phoneHint': 'xxxxxxx567', 'role': 'accountant'});
  cloud.myInvitations.add({'id': 'inv-9', 'businessName': 'Desert Rose Interiors', 'invitedBy': 'Khalid Rahman', 'role': 'accountant'});
  cloud.inboundKeys.addAll([
    {'id': 'key-1', 'label': 'صندوق المحل', 'source': 'pos', 'enabled': true, 'todayCount': 3, 'todayTotal': 1575, 'email': ''},
    {'id': 'key-2', 'label': 'بريد الفواتير', 'source': 'documents', 'enabled': true, 'todayCount': 0, 'todayTotal': 0, 'email': 'bills7f3a@inbox.example.test'},
    {'id': 'key-3', 'label': 'الفرع القديم', 'source': 'pos', 'enabled': false, 'todayCount': 0, 'todayTotal': 0, 'email': ''},
  ]);
  cloud.privacyRequests.add({'reference': 'DPR-20261101-0001', 'kind': 'access', 'status': 'answered', 'message': '', 'reply': 'أرسلنا الملخص إلى بريدك.', 'createdAt': '2026-11-01T00:00:00.000Z', 'dueAt': '2026-12-01T00:00:00.000Z'});
  return cloud;
}

Future<FakeCloud> openUaeCloudApp(
  WidgetTester tester, {
  bool signedIn = true,
  bool accepted = true,
  AppLock lock = const NoAppLock(),
  bool lockOn = false,
  void Function(FakeCloud cloud)? setUp,
}) async {
  final cloud = uaeFakeCloud();
  setUp?.call(cloud);
  final tokens = MemoryTokenStore();
  if (signedIn) {
    final session = sessionOn(cloud, tokens);
    await session.requestCode('+971501234567');
    await session.verifyCode(FakeCloud.code);
    await session.createBusiness(name: 'Al Noor Trading LLC', country: 'AE');
  }
  cloud.noticeAccepted = accepted;
  final state = AppState(
    api: UaeFakeApi(hostedUser: const FirmUser(userId: 'u1', name: uaeOwner, role: 'owner', locked: false)),
    cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client),
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true, isLockEnabled: lockOn),
    pickTextFile: (_) async => null,
    lock: lock,
    now: () => DateTime(2026, 11, 14, 10, 30),
    openLink: (_) async => true,
    edition: 'AE',
  );
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
  return cloud;
}

bool _missing(Finder target) {
  try {
    return target.evaluate().isEmpty;
  } on StateError {
    return true;
  }
}

Future<void> uaeShow(WidgetTester tester, Finder target) async {
  for (var step = 0; step < 80 && _missing(target); step++) {
    final positions = [
      for (final element in find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).evaluate())
        if (((element as StatefulElement).state as ScrollableState).position case final position when position.hasContentDimensions && position.maxScrollExtent > 0) position,
    ];
    if (positions.isEmpty) break;
    final position = positions.last;
    if (position.pixels >= position.maxScrollExtent) {
      if (step > 40) break;
      position.jumpTo(0);
    } else {
      position.jumpTo((position.pixels + position.viewportDimension * 0.5).clamp(0, position.maxScrollExtent));
    }
    await tester.pump();
  }
  await tester.ensureVisible(target.first);
  await tester.pumpAndSettle();
}

Future<void> uaeCloudTap(WidgetTester tester, Finder target) async {
  await uaeShow(tester, target);
  await tester.tap(target.first);
  await tester.pumpAndSettle();
}

Future<void> uaeCloudEnter(WidgetTester tester, Finder target, String text) async {
  await uaeShow(tester, target);
  await tester.enterText(target.first, text);
  await tester.pump();
}

Future<void> openUaeSheetRow(WidgetTester tester, String row) async {
  await tester.tap(find.byTooltip(uaeWords(tester).yourBusiness));
  await tester.pumpAndSettle();
  await uaeCloudTap(tester, find.text(row));
}

Future<void> uaeTapText(WidgetTester tester, String text) => uaeCloudTap(tester, find.text(text));

Future<void> uaePhoneSignIn(WidgetTester tester) async {
  final s = uaeWords(tester);
  await uaeCloudEnter(tester, find.byType(TextField), '050 123 4567');
  await uaeCloudTap(tester, find.widgetWithText(FilledButton, s.sendCode));
  await uaeCloudEnter(tester, find.byType(TextField), FakeCloud.code);
  await uaeCloudTap(tester, find.widgetWithText(FilledButton, s.signIn));
}

final Map<String, UaeCloudWalk> uaeCloudWalks = {
  'business sheet, signed in': (t) async {
    await openUaeCloudApp(t);
    await uaeCloudTap(t, find.byTooltip(uaeWords(t).yourBusiness));
  },
  'people': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).people);
  },
  'people invite sheet': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).people);
    await uaeCloudTap(t, find.byType(FloatingActionButton));
  },
  'people invite with a wrong number': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).people);
    await uaeCloudTap(t, find.byType(FloatingActionButton));
    await uaeCloudEnter(t, find.byType(TextField).last, '12345');
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).invite));
  },
  'people role sheet': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).people);
    await uaeTapText(t, 'Omar Haddad');
  },
  'people remove dialog': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).people);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).removePerson));
  },
  'invite': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).inviteOwner);
  },
  'invite, own code': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).inviteOwner);
    await uaeCloudEnter(t, find.byKey(const Key('claim-code')), 'AB2CD3EF');
    await uaeCloudTap(t, find.widgetWithText(OutlinedButton, uaeWords(t).useThisCode));
  },
  'security': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).security);
  },
  'security, two-step on': (t) async {
    await openUaeCloudApp(t, setUp: (cloud) => cloud.twoStepEnabled = true);
    await openUaeSheetRow(t, uaeWords(t).security);
  },
  'security code dialog': (t) async {
    await openUaeCloudApp(t, setUp: (cloud) => cloud.twoStepEnabled = true);
    await openUaeSheetRow(t, uaeWords(t).security);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).turnOff));
  },
  'security wrong code': (t) async {
    await openUaeCloudApp(t, setUp: (cloud) => cloud.twoStepEnabled = true);
    await openUaeSheetRow(t, uaeWords(t).security);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).turnOff));
    await uaeCloudEnter(t, find.byType(TextField).last, '111111');
    await t.pump();
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).turnOff));
  },
  'security sign out dialog': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).security);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).signOut));
  },
  'two-step setup': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).security);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).turnOn));
  },
  'recovery codes': (t) async {
    final cloud = await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).security);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).turnOn));
    await uaeCloudEnter(t, find.byType(TextField).last, cloud.totpCode);
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).turnOn));
  },
  'connections': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).connections);
  },
  'connections new key sheet': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).connections);
    await uaeCloudTap(t, find.byType(FloatingActionButton));
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).createKey));
  },
  'connections key made': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).connections);
    await uaeCloudTap(t, find.byType(FloatingActionButton));
    await uaeCloudEnter(t, find.byType(TextField).last, 'صندوق الفرع');
    await uaeCloudTap(t, find.widgetWithText(ChoiceChip, uaeWords(t).sourceLabel('documents')));
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).createKey));
  },
  'connections turn off dialog': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).connections);
    await uaeCloudTap(t, find.widgetWithText(TextButton, uaeWords(t).turnOff));
  },
  'businesses': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
  },
  'businesses delete dialog': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
    await uaeTapText(t, uaeWords(t).deleteBusinessTitle('Al Noor Trading LLC'));
  },
  'businesses delete account dialog': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
    await uaeTapText(t, uaeWords(t).deleteMyAccount);
  },
  'privacy rights': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
    await uaeCloudTap(t, find.byKey(const Key('legal.rights')));
  },
  'privacy request dialog': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
    await uaeCloudTap(t, find.byKey(const Key('legal.rights')));
    await uaeCloudTap(t, find.byKey(const ValueKey('rights.ask.grievance')));
  },
  'privacy request sent': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
    await uaeCloudTap(t, find.byKey(const Key('legal.rights')));
    await uaeCloudTap(t, find.byKey(const ValueKey('rights.ask.access')));
    await t.tap(find.byKey(const ValueKey('rights.send')));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
  },
  'privacy notice': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).yourBusinesses);
    await uaeCloudTap(t, find.byKey(const Key('legal.rights')));
    await uaeCloudTap(t, find.byKey(const ValueKey('rights.notice')));
  },
  'privacy notice to accept': (t) async {
    await openUaeCloudApp(t, accepted: false);
  },
  'bring in more books': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).bringInMore);
  },
  'bring in more books, bank statement': (t) async {
    await openUaeCloudApp(t);
    await openUaeSheetRow(t, uaeWords(t).bringInMore);
    await uaeTapText(t, uaeWords(t).migrationTitle('otherApp'));
  },
  'phone sign-in': (t) async {
    await openUaeCloudApp(t, signedIn: false, setUp: (cloud) => cloud.googleOn = false);
  },
  'phone sign-in, wrong number': (t) async {
    await openUaeCloudApp(t, signedIn: false, setUp: (cloud) => cloud.googleOn = false);
    await uaeCloudEnter(t, find.byType(TextField), '12345');
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).sendCode));
  },
  'phone sign-in code': (t) async {
    await openUaeCloudApp(t, signedIn: false, setUp: (cloud) => cloud.googleOn = false);
    await uaeCloudEnter(t, find.byType(TextField), '050 123 4567');
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).sendCode));
  },
  'phone sign-in, wrong code': (t) async {
    await openUaeCloudApp(t, signedIn: false, setUp: (cloud) => cloud.googleOn = false);
    await uaeCloudEnter(t, find.byType(TextField), '050 123 4567');
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).sendCode));
    await uaeCloudEnter(t, find.byType(TextField), '000000');
    await uaeCloudTap(t, find.widgetWithText(FilledButton, uaeWords(t).signIn));
  },
  'second step sign-in': (t) async {
    await openUaeCloudApp(t, signedIn: false, setUp: (cloud) => cloud
      ..googleOn = false
      ..secondStepOn = true);
    await uaePhoneSignIn(t);
  },
  'name': (t) async {
    await openUaeCloudApp(t, signedIn: false, setUp: (cloud) => cloud
      ..googleOn = false
      ..userName = '');
    await uaePhoneSignIn(t);
  },
  'lock': (t) async {
    await openUaeCloudApp(t, lock: FakeLock(answers: [false]), lockOn: true);
  },
  'pin sign-in': (t) async {
    await openUaeApp(t, api: UaeFakeApi(signedIn: false));
  },
  'pin sign-in, wrong pin': (t) async {
    await openUaeApp(t, api: UaeFakeApi(signedIn: false));
    await uaeCloudEnter(t, find.byType(TextField), '0000');
    await uaeCloudTap(t, find.byType(FilledButton));
  },
};
