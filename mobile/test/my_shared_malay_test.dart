import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/google_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/ask_screen.dart';
import 'package:myca/screens/invitation_cards.dart';
import 'package:myca/screens/name_screen.dart';
import 'package:myca/screens/phone_sign_in_screen.dart';
import 'package:myca/screens/privacy_notice_screen.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';
import 'my_support.dart';

class _Google implements GoogleAuth {
  @override
  Future<String?> idToken() async => null;

  @override
  Future<void> signOut() async {}
}

AppState hostedState(FakeCloud cloud, {String edition = 'MY', String language = 'ms', bool google = true}) => AppState(
  cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: cloud.client),
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => myNow,
  edition: edition,
  languages: MemoryLanguageStore(language),
  google: google ? _Google() : null,
);

class _ReportButton extends StatelessWidget {
  const _ReportButton();

  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: TextButton(onPressed: () => reportAnswer(context, 'The SST-02 is due on 30/11/2026.'), child: const Text('open'))));
}

void main() {
  testWidgets('a Malaysian reading Malay signs in with Google in Malay, with no mobile number box', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: hostedState(cloud)));
    await settle(tester);
    expect(find.byType(PhoneSignInScreen), findsOneWidget);
    expect(find.text('Log masuk'), findsOneWidget);
    expect(find.text('Teruskan dengan Google'), findsOneWidget);
    expect(find.text('Gunakan akaun Google anda. Tiada kata laluan baharu untuk diingat.'), findsOneWidget);
    expect(find.text('Baca cara MyCA menggunakan data anda (dasar privasi)'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('+91'), findsNothing);
  });

  testWidgets('with only mobile sign-in, a Malaysian number goes with +60 and the screen reads in Malay', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: hostedState(cloud, google: false)));
    await settle(tester);
    expect(find.text('Nombor telefon bimbit anda'), findsOneWidget);
    expect(find.text('+60  '), findsOneWidget);
    await tester.enterText(find.byType(TextField), '012-345 6789');
    await tester.tap(find.text('Hantar kod'));
    await settle(tester);
    expect(cloud.requestedPhones, ['+60123456789']);
  });

  testWidgets('the Malaysian app in English keeps the English sign-in words', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: hostedState(cloud, language: 'en')));
    await settle(tester);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
  });

  testWidgets('the Indian app is not changed by Malay', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: hostedState(cloud, edition: 'IN', language: 'ms')));
    await settle(tester);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Or use your mobile number'), findsOneWidget);
    expect(find.text('+91  '), findsOneWidget);
  });

  testWidgets('the privacy notice consent reads in Malay and names Malaysian identifiers', (tester) async {
    final cloud = FakeCloud();
    final state = hostedState(cloud);
    await tester.pumpWidget(myApp(state, const PrivacyNoticeScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('Hantar juga laporan ranap'), findsOneWidget);
    expect(find.textContaining('nombor MyKad'), findsOneWidget);
    expect(find.textContaining('GSTIN'), findsNothing);
    expect(find.text('Bukan sekarang, log keluar'), findsOneWidget);
    await reveal(tester, find.byKey(const ValueKey('consent.agree')));
    expect(find.text('Saya bersetuju'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(myApp(hostedState(FakeCloud()), const PrivacyNoticeScreen(readOnly: true), language: 'ms'));
    await settle(tester);
    expect(find.text('Notis privasi'), findsOneWidget);
  });

  testWidgets('the Malaysian notice opens in the app language, switches language, and needs the 18+ and sensitive-data ticks', (tester) async {
    final cloud = FakeCloud();
    final state = hostedState(cloud);
    await tester.runAsync(() async {
      await state.cloud!.requestCode('9876543210');
      await state.cloud!.verifyCode(FakeCloud.code);
    });
    await tester.pumpWidget(myApp(state, const PrivacyNoticeScreen(), language: 'ms'));
    await settle(tester);
    expect(cloud.noticeLanguages, ['ms'], reason: 'a Malay app asks for the Malay notice');
    expect(find.text('Cara MyCA menggunakan data peribadi anda (Malaysia)'), findsOneWidget);
    await reveal(tester, find.byKey(const ValueKey('consent.agree')));
    FilledButton agree() => tester.widget<FilledButton>(find.byKey(const ValueKey('consent.agree')));
    expect(agree().onPressed, isNull, reason: 'nothing is accepted before both boxes are ticked');
    await reveal(tester, find.byKey(const ValueKey('consent.adult')));
    await tester.tap(find.byKey(const ValueKey('consent.adult')));
    await tester.pump();
    expect(agree().onPressed, isNull, reason: 'explicit consent to sensitive data is its own tick');
    await reveal(tester, find.byKey(const ValueKey('consent.sensitive')));
    expect(find.textContaining('persetujuan nyata'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('consent.sensitive')));
    await tester.pump();
    expect(agree().onPressed, isNotNull);
    await reveal(tester, find.byKey(const ValueKey('consent.agree')));
    await tester.tap(find.byKey(const ValueKey('consent.agree')));
    await settle(tester);
    expect(cloud.consents, contains('privacy@my-test'));
  });

  testWidgets('the Malaysian notice can be read in English from a Malay app', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(myApp(hostedState(cloud), const PrivacyNoticeScreen(readOnly: true), language: 'ms'));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('consent.language')));
    await settle(tester);
    expect(cloud.noticeLanguages, ['ms', 'en']);
    expect(find.text('How MyCA uses your information (Malaysia)'), findsOneWidget);
    expect(find.text('Baca dalam Bahasa Melayu'), findsOneWidget);
  });

  testWidgets('the name screen reads in Malay and asks for a name in Malay', (tester) async {
    await tester.pumpWidget(myApp(hostedState(FakeCloud()), const NameScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('Apakah nama panggilan anda?'), findsOneWidget);
    expect(find.text('Nama anda'), findsOneWidget);
    await tester.tap(find.text('Teruskan'));
    await settle(tester);
    expect(find.text('Masukkan nama anda.'), findsOneWidget);
  });

  testWidgets('invitations read in Malay', (tester) async {
    const invitations = [
      InvitationRef(id: '1', businessName: 'Teratai Digital Sdn Bhd', role: 'accountant', invitedBy: 'Aisyah'),
      InvitationRef(id: '2', businessName: 'Kedai Runcit Mawar', role: 'staff', invitedBy: ''),
    ];
    await tester.pumpWidget(myApp(hostedState(FakeCloud()), Scaffold(body: InvitationCards(invitations: invitations, onChanged: ({required joined}) async {})), language: 'ms'));
    await settle(tester);
    expect(find.text('Aisyah menjemput anda sebagai akauntan.'), findsOneWidget);
    expect(find.text('Anda dijemput sebagai kakitangan.'), findsOneWidget);
    expect(find.text('Sertai'), findsNWidgets(2));
    expect(find.text('Tolak'), findsNWidgets(2));
  });

  testWidgets('reporting an answer reads in Malay and still sends the reason in English', (tester) async {
    final reports = <Map<String, Object?>>[];
    final state = AppState(
      api: MyTestApi(),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      now: () => myNow,
      edition: 'MY',
      languages: MemoryLanguageStore('ms'),
      sendAnswerReport: (report) async => reports.add(report),
    );
    await tester.pumpWidget(myApp(state, const _ReportButton(), language: 'ms'));
    await settle(tester);
    await tester.tap(find.text('open'));
    await settle(tester);
    expect(find.text('Laporkan jawapan ini'), findsOneWidget);
    expect(find.textContaining('tanpa buku akaun anda'), findsOneWidget);
    await tester.tap(find.text('Salah atau mengelirukan'));
    await settle(tester);
    expect(reports.single['stack'], 'ai-answer-report Wrong or misleading');
    expect(find.text('Terima kasih. Jawapan ini telah dilaporkan untuk disemak.'), findsOneWidget);
  });
}
