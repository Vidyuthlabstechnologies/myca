import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'devices.dart';
import 'screen_walks.dart';

final amount = RegExp(r'^[-−+]?₹[\d,]+(\.\d+)?$');

List<String> brokenAmounts(WidgetTester tester) {
  final broken = <String>[];
  for (final paragraph in tester.allRenderObjects.whereType<RenderParagraph>()) {
    final words = paragraph.text.toPlainText().trim();
    if (!amount.hasMatch(words) || !paragraph.hasSize) continue;
    final tops = paragraph.getBoxesForSelection(TextSelection(baseOffset: 0, extentOffset: words.length)).map((box) => box.top.round()).toSet();
    if (tops.length > 1) {
      final creator = paragraph.debugCreator;
      var where = '';
      if (creator is DebugCreator) {
        creator.element.visitAncestorElements((parent) {
          final json = parent.toDiagnosticsNode().toJsonMap(InspectorSerializationDelegate(service: WidgetInspectorService.instance));
          final location = json['creationLocation'];
          if (location is Map && '${location['file']}'.contains('/lib/')) {
            where = '${'${location['file']}'.split('/lib/').last}:${location['line']}';
            return false;
          }
          return true;
        });
      }
      broken.add('$words at $where');
    }
  }
  return broken;
}

void main() {
  final runs = [
    for (final device in devices) (device, 1.0),
    (mediumPhone, 1.3),
    (compactPhone, 2.0),
    (foldCover, 2.0),
    (phoneLandscape, 2.0),
    (tabletLandscape, 2.0),
  ];
  for (final (device, scale) in runs) {
    group('${device.name} at ${scale}x text', () {
      for (final entry in screens.entries) {
        testWidgets('${entry.key}: nothing overflows', (tester) async {
          useDevice(tester, device, textScale: scale);
          await open(tester);
          await entry.value(tester);
          await tester.pumpAndSettle();
          final error = tester.takeException();
          expect(error, isNull, reason: '$error');
          expect(brokenAmounts(tester), isEmpty, reason: 'an amount breaks across lines');
        });
      }
    });
  }
}
