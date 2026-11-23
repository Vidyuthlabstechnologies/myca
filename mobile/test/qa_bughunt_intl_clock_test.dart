import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/screens/people_screen.dart';

String clock(DateTime at) => '${at.hour % 12 == 0 ? 12 : at.hour % 12}:${at.minute.toString().padLeft(2, '0')} ${at.hour < 12 ? 'am' : 'pm'}';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('India keeps showing India time for when the books were shared', () {
    moneyCountry = 'IN';
    expect(sharedWhen('2026-10-07T09:30:00.000Z'), '7 October 2026, 3:00 pm');
  });

  test('the UK and US apps show the phone\'s own time, not India time, for when the books were shared', () {
    const stamp = '2026-11-14T22:00:00.000Z';
    final local = DateTime.parse(stamp).toLocal();
    moneyCountry = 'GB';
    expect(sharedWhen(stamp), endsWith(clock(local)));
    expect(sharedWhen(stamp), isNot(endsWith('3:30 am')));
    moneyCountry = 'US';
    expect(sharedWhen(stamp), endsWith(clock(local)));
    expect(sharedOn(stamp), longDate(isoDate(local)));
  });

  test('the Malaysia app shows Malaysia time', () {
    moneyCountry = 'MY';
    expect(sharedWhen('2026-11-14T17:00:00.000Z'), '15/11/2026, 1:00 am');
  });
}
