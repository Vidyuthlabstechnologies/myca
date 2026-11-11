import 'package:flutter/material.dart';

import 'theme.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40, this.tile, this.stroke});

  final double size;
  final Color? tile;
  final Color? stroke;

  @override
  Widget build(BuildContext context) {
    final p = context.myca;
    return Semantics(
      label: 'MyCA',
      image: true,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _BrandMarkPainter(tile ?? p.ink, stroke ?? p.onInk)),
      ),
    );
  }
}

class _BrandMarkPainter extends CustomPainter {
  _BrandMarkPainter(this.tile, this.stroke);

  final Color tile;
  final Color stroke;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48);
    canvas.drawRRect(RRect.fromLTRBR(0, 0, 48, 48, const Radius.circular(11)), Paint()..color = tile);
    canvas.drawPath(
      Path()
        ..moveTo(13, 34)
        ..lineTo(13, 15)
        ..lineTo(24, 28)
        ..lineTo(35, 15)
        ..lineTo(35, 34),
      Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.4
        ..strokeCap = StrokeCap.square
        ..strokeJoin = StrokeJoin.miter,
    );
  }

  @override
  bool shouldRepaint(_BrandMarkPainter old) => old.tile != tile || old.stroke != stroke;
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 20, this.showCountry = false});

  final double size;
  final bool showCountry;

  @override
  Widget build(BuildContext context) {
    final country = context.mycaCountry;
    final suffix = country.facts.appLabel.replaceFirst('MyCA', '').trim();
    final style = Theme.of(context).textTheme.titleLarge?.copyWith(
      fontSize: size,
      fontWeight: FontWeight.w600,
      letterSpacing: -size * 0.02,
      height: 1,
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: size * 1.3),
        SizedBox(width: size * 0.45),
        Text('MyCA', style: style),
        if (showCountry && suffix.isNotEmpty) ...[
          SizedBox(width: size * 0.3),
          Text(suffix, style: style?.copyWith(color: context.myca.accent, fontWeight: FontWeight.w500)),
        ],
      ],
    );
  }
}
