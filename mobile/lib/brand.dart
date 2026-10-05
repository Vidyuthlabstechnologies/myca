import 'package:flutter/material.dart';

import 'theme.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: _BrandMarkPainter()),
    );
  }
}

class _BrandMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48);
    canvas.drawRRect(
      RRect.fromLTRBR(0, 0, 48, 48, const Radius.circular(11)),
      Paint()..color = Palette.ink,
    );
    canvas.drawPath(
      Path()
        ..moveTo(13, 34)
        ..lineTo(13, 15)
        ..lineTo(24, 28)
        ..lineTo(35, 15)
        ..lineTo(35, 34),
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.4
        ..strokeCap = StrokeCap.square
        ..strokeJoin = StrokeJoin.miter,
    );
  }

  @override
  bool shouldRepaint(_BrandMarkPainter old) => false;
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: size * 1.3),
        SizedBox(width: size * 0.45),
        Text(
          'MyCA',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontSize: size,
            fontWeight: FontWeight.w600,
            letterSpacing: -size * 0.02,
            height: 1,
          ),
        ),
      ],
    );
  }
}

String greetingFor(DateTime now) {
  if (now.hour < 5) return 'Working late';
  if (now.hour < 12) return 'Good morning';
  if (now.hour < 17) return 'Good afternoon';
  return 'Good evening';
}
