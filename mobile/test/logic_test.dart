import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/http_myca_api.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_config.dart';
import 'package:myca/attention.dart';
import 'package:myca/format.dart';

import 'fake_api.dart';

void main() {
  test('rupees uses Indian digit grouping', () {
    expect(rupees(0), '₹0.00');
    expect(rupees(590), '₹590.00');
    expect(rupees(80690), '₹80,690.00');
    expect(rupees(525000), '₹5,25,000.00');
    expect(rupees(12345678.5), '₹1,23,45,678.50');
    expect(rupees(-1500), '-₹1,500.00');
  });

  test('monthLabel names the return period', () {
    expect(monthLabel('2026-08'), 'August 2026');
    expect(monthLabel('2026-12'), 'December 2026');
    expect(monthLabel('2026-13'), '2026-13');
    expect(monthLabel('soon'), 'soon');
  });

  test('dueLabel words overdue, today and future', () {
    expect(dueLabel(-24), '24 days overdue');
    expect(dueLabel(0), 'Due today');
    expect(dueLabel(1), 'Due tomorrow');
    expect(dueLabel(6), 'Due in 6 days');
  });

  test('needs-you is the open exception queue, most severe then most money first', () async {
    final items = needsYou(await loadToday(FakeMycaApi()));
    expect(items.map((i) => i.id).toList(), ['EXC-000001', 'EXC-000004', 'EXC-000003']);
    expect(isUrgent(items.first), isTrue);
    expect(isUrgent(items.last), isFalse);
  });

  test('coming up shows only on-track deadlines so nothing is listed twice', () async {
    final upcoming = comingUp(await loadToday(FakeMycaApi()));
    expect(upcoming.single.label, 'GSTR-3B (monthly)');
    expect(upcoming.single.period, '2026-09');
  });

  test('a failed tool yields no figure instead of zeros', () {
    expect(periodGstFrom({'ok': false, 'error': 'X'}), isNull);
    expect(deadlinesFrom({'ok': false}), isEmpty);
  });

  test('chat reply exposes a preview only while awaiting confirmation', () {
    final posted = ChatReply.fromJson({'reply': 'Posted', 'posted': true, 'preview': {'token': 't'}});
    expect(posted.preview, isNull);
    final waiting = ChatReply.fromJson({
      'reply': 'r',
      'awaitingConfirmation': true,
      'preview': {'token': 't', 'summary': 's', 'effects': ['e']},
    });
    expect(waiting.preview?.token, 't');
    expect(waiting.preview?.effects, ['e']);
  });

  group('HttpMycaApi', () {
    const config = AppConfig(baseUrl: 'http://127.0.0.1:4780', clientToken: 'token-for-tests');

    test('sends the client token and the tool payload', () async {
      late http.Request seen;
      final api = HttpMycaApi(config, client: MockClient((request) async {
        seen = request;
        return http.Response(jsonEncode({'ok': true, 'data': {}}), 200);
      }));
      await api.query('gst_period_summary', {'period': '2026-08'});
      expect(seen.url.toString(), 'http://127.0.0.1:4780/api/query');
      expect(seen.headers['x-myca-client'], 'token-for-tests');
      expect(jsonDecode(seen.body), {'name': 'gst_period_summary', 'args': {'period': '2026-08'}});
    });

    test('turns a refusal into the server error message', () async {
      final api = HttpMycaApi(config, client: MockClient((request) async {
        return http.Response(jsonEncode({'error': 'missing or stale MyCA client token'}), 403);
      }));
      expect(api.snapshot(), throwsA(isA<MycaApiException>().having((e) => e.message, 'message', contains('stale'))));
    });

    test('reports an unreachable server in plain words', () async {
      final api = HttpMycaApi(config, client: MockClient((request) async {
        throw http.ClientException('connection refused');
      }));
      expect(api.snapshot(), throwsA(isA<MycaApiException>().having((e) => e.message, 'message', contains('Cannot reach'))));
    });
  });
}
