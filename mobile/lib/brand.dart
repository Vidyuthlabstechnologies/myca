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
    canvas.scale(size.width / 96);
    canvas.drawRRect(
      RRect.fromLTRBR(0, 0, 96, 96, const Radius.circular(22)),
      Paint()..color = PaletteSet.light.accent,
    );
    final white = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(
      Path()
        ..moveTo(48, 28)
        ..cubicTo(40, 22, 30, 21, 20, 23)
        ..lineTo(20, 67)
        ..cubicTo(30, 65, 40, 66, 48, 72),
      white,
    );
    final page = Path()
      ..moveTo(48, 28)
      ..cubicTo(56, 22, 66, 21, 76, 23)
      ..lineTo(76, 67)
      ..cubicTo(66, 65, 56, 66, 48, 72)
      ..close();
    canvas.drawPath(page, Paint()..color = Colors.white);
    canvas.drawPath(page, white);
    canvas.drawLine(const Offset(48, 28), const Offset(48, 72), white);
    canvas.drawPath(
      Path()
        ..moveTo(55, 49)
        ..lineTo(62, 56)
        ..lineTo(74, 41),
      Paint()
        ..color = PaletteSet.light.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    final rule = Paint()
      ..color = Colors.white.withValues(alpha: 0.6)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(const Offset(27, 37), const Offset(40, 37), rule);
    canvas.drawLine(const Offset(27, 46), const Offset(40, 46), rule);
    canvas.drawLine(const Offset(27, 55), const Offset(36, 55), rule);
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
        Text.rich(
          TextSpan(
            text: 'My',
            children: [
              TextSpan(
                text: 'CA',
                style: TextStyle(color: Palette.accent),
              ),
            ],
          ),
          semanticsLabel: 'MyCA',
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
