import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';

import 'fake_cloud.dart';

Future<CloudSession> _session(FakeCloud cloud, Set<String> refusedEndings, int status) async {
  var refusing = false;
  final client = MockClient((request) async {
    if (refusing && refusedEndings.any(request.url.path.endsWith)) {
      return http.Response('<html><body>Rate exceeded.</body></html>', status, headers: {'content-type': 'text/html'});
    }
    final copy = http.Request(request.method, request.url)
      ..headers.addAll(request.headers)
      ..bodyBytes = request.bodyBytes;
    return http.Response.fromStream(await cloud.client.send(copy));
  });
  final session = CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: client);
  await session.requestCode('9876543210');
  await session.verifyCode(FakeCloud.code);
  await session.createBusiness(name: 'Asha Traders', state: '29');
  refusing = true;
  return session;
}

void main() {
  for (final status in [404, 408, 413, 429]) {
    test('a $status with a page instead of JSON is an error, never an empty set of books', () async {
      final session = await _session(FakeCloud(), {'/snapshot', '/query', '/propose', '/confirm'}, status);
      await expectLater(session.api.snapshot(), throwsA(isA<MycaApiException>()));
      await expectLater(session.api.query('gst_period_summary'), throwsA(isA<MycaApiException>()));
      await expectLater(session.api.propose('create_invoice', {'partyName': 'Kiran', 'lines': <Object?>[]}), throwsA(isA<MycaApiException>()));
      await expectLater(session.api.confirm('abcdefabcdef'), throwsA(isA<MycaApiException>()));
    });
  }

  test('a 429 page says to wait and try again', () async {
    final session = await _session(FakeCloud(), {'/snapshot'}, 429);
    await expectLater(
      session.api.snapshot(),
      throwsA(isA<MycaApiException>().having((e) => e.code, 'code', 'SERVER_BUSY')),
    );
  });
}
