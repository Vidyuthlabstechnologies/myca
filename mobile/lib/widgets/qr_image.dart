import 'package:flutter/material.dart';
import 'package:qr/qr.dart' as qr;

import '../theme.dart';

class QrPainter extends CustomPainter {
  QrPainter(this.data) : _image = qr.QrImage(qr.QrCode.fromData(data: data, errorCorrectLevel: qr.QrErrorCorrectLevel.L));

  final String data;
  final qr.QrImage _image;

  @override
  void paint(Canvas canvas, Size size) {
    final count = _image.moduleCount;
    if (count == 0) return;
    final cell = size.shortestSide / count;
    final left = (size.width - cell * count) / 2;
    final top = (size.height - cell * count) / 2;
    final ink = Paint()
      ..color = PaletteSet.light.ink
      ..isAntiAlias = false;
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (!_image.isDark(row, col)) continue;
        canvas.drawRect(Rect.fromLTWH(left + col * cell, top + row * cell, cell, cell), ink);
      }
    }
  }

  @override
  bool shouldRepaint(QrPainter oldDelegate) => oldDelegate.data != data;
}

class QrSquare extends StatelessWidget {
  const QrSquare({super.key, required this.data, required this.label, this.size = 220});

  final String data;
  final String label;
  final double size;

  static const quietZone = 24.0;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      image: true,
      child: Container(
        width: size + quietZone * 2,
        height: size + quietZone * 2,
        padding: const EdgeInsets.all(quietZone),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(radiusControl),
          border: Border.all(color: Palette.line),
        ),
        child: CustomPaint(size: Size.square(size), painter: QrPainter(data)),
      ),
    );
  }
}
