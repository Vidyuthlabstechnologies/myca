import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'theme.dart';

enum Mark {
  sales,
  purchases,
  taxes,
  ask,
  expense,
  confirm,
  tally,
  cloudBooks,
  otherApp,
  spreadsheet,
  paper,
  fresh,
  bringIn,
  urgent,
  dueSoon,
  comingUp,
  people,
  switchBooks,
}

class MarkIcon extends StatelessWidget {
  const MarkIcon({
    super.key,
    required this.mark,
    this.color = Palette.ink,
    this.size = 24,
  });

  final Mark mark;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: _MarkPainter(mark, color)),
    );
  }
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.mark, this.color);

  final Mark mark;
  final Color color;

  late final Paint _line = Paint()
    ..color = color
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.5
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;

  late final Paint _dot = Paint()..color = color;

  RRect _box(double l, double t, double r, double b, double radius) =>
      RRect.fromLTRBR(l, t, r, b, Radius.circular(radius));

  void _path(Canvas canvas, List<double> points, {bool close = false}) {
    final path = Path()..moveTo(points[0], points[1]);
    for (var i = 2; i < points.length; i += 2) {
      path.lineTo(points[i], points[i + 1]);
    }
    if (close) path.close();
    canvas.drawPath(path, _line);
  }

  void _seg(Canvas canvas, double x1, double y1, double x2, double y2) =>
      canvas.drawLine(Offset(x1, y1), Offset(x2, y2), _line);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24);
    switch (mark) {
      case Mark.sales:
        _path(canvas, [
          6,
          21,
          6,
          3.5,
          18,
          3.5,
          18,
          21,
          15.6,
          19.2,
          13.2,
          21,
          10.8,
          19.2,
          8.4,
          21,
          6,
          21,
        ]);
        _seg(canvas, 9, 8, 15, 8);
        _seg(canvas, 9, 11.5, 15, 11.5);
        _seg(canvas, 9, 15, 12.5, 15);
      case Mark.purchases:
        _path(canvas, [
          4.5,
          8.5,
          19.5,
          8.5,
          20.5,
          20.5,
          3.5,
          20.5,
        ], close: true);
        canvas.drawArc(
          const Rect.fromLTRB(8.5, 3.5, 15.5, 11.5),
          math.pi,
          math.pi,
          false,
          _line,
        );
      case Mark.taxes:
        canvas.drawCircle(const Offset(12, 12), 8.75, _line);
        _seg(canvas, 15, 8.6, 9, 15.4);
        canvas.drawCircle(const Offset(9.1, 9.3), 1.15, _dot);
        canvas.drawCircle(const Offset(14.9, 14.7), 1.15, _dot);
      case Mark.ask:
        final bubble = Path()
          ..moveTo(8, 17.5)
          ..lineTo(5.5, 17.5)
          ..arcToPoint(
            const Offset(3.5, 15.5),
            radius: const Radius.circular(2),
          )
          ..lineTo(3.5, 6.5)
          ..arcToPoint(const Offset(5.5, 4.5), radius: const Radius.circular(2))
          ..lineTo(18.5, 4.5)
          ..arcToPoint(
            const Offset(20.5, 6.5),
            radius: const Radius.circular(2),
          )
          ..lineTo(20.5, 15.5)
          ..arcToPoint(
            const Offset(18.5, 17.5),
            radius: const Radius.circular(2),
          )
          ..lineTo(12.5, 17.5)
          ..lineTo(8, 21)
          ..close();
        canvas.drawPath(bubble, _line);
      case Mark.expense:
        canvas.drawCircle(const Offset(12, 12), 8.75, _line);
        _seg(canvas, 9, 15, 15, 9);
        _path(canvas, [10.2, 9, 15, 9, 15, 13.8]);
      case Mark.confirm:
        canvas.drawRRect(_box(3.75, 3.75, 20.25, 20.25, 4), _line);
        _path(canvas, [8, 12.3, 10.9, 15.2, 16, 9.2]);
      case Mark.tally:
        canvas.drawRRect(_box(8, 3.5, 20, 16, 2), _line);
        _path(canvas, [5.5, 7.5, 4.5, 7.5, 4.5, 20.5, 16.5, 20.5, 16.5, 19]);
        _seg(canvas, 11, 8, 17, 8);
        _seg(canvas, 11, 11.5, 15, 11.5);
      case Mark.cloudBooks:
        final cloud = Path()
          ..moveTo(7, 18.5)
          ..arcToPoint(
            const Offset(6.2, 10.6),
            radius: const Radius.circular(4),
          )
          ..arcToPoint(
            const Offset(16.6, 9.3),
            radius: const Radius.circular(5.4),
          )
          ..arcToPoint(
            const Offset(17.2, 18.5),
            radius: const Radius.circular(4.6),
          )
          ..close();
        canvas.drawPath(cloud, _line);
      case Mark.otherApp:
        canvas.drawRRect(_box(7, 2.75, 17, 21.25, 2.4), _line);
        _seg(canvas, 10.8, 18, 13.2, 18);
      case Mark.spreadsheet:
        canvas.drawRRect(_box(3.75, 4.5, 20.25, 19.5, 2), _line);
        _seg(canvas, 3.75, 9.5, 20.25, 9.5);
        _seg(canvas, 3.75, 14.5, 20.25, 14.5);
        _seg(canvas, 9.5, 4.5, 9.5, 19.5);
      case Mark.paper:
        _path(canvas, [
          13.5,
          3,
          6,
          3,
          6,
          21,
          18,
          21,
          18,
          7.5,
          13.5,
          3,
          13.5,
          7.5,
          18,
          7.5,
        ]);
        _seg(canvas, 9, 12.5, 15, 12.5);
        _seg(canvas, 9, 16, 13, 16);
      case Mark.fresh:
        _seg(canvas, 12, 5, 12, 19);
        _seg(canvas, 5, 12, 19, 12);
      case Mark.bringIn:
        _path(canvas, [4, 14.5, 4, 19.5, 20, 19.5, 20, 14.5]);
        _seg(canvas, 12, 4, 12, 14.5);
        _path(canvas, [8.2, 10.8, 12, 14.6, 15.8, 10.8]);
      case Mark.urgent:
        _path(canvas, [12, 4, 21, 19.5, 3, 19.5], close: true);
        _seg(canvas, 12, 10, 12, 14);
        canvas.drawCircle(const Offset(12, 16.7), 0.95, _dot);
      case Mark.dueSoon:
        canvas.drawCircle(const Offset(12, 12), 8.75, _line);
        _path(canvas, [12, 7.2, 12, 12, 15.2, 13.9]);
      case Mark.comingUp:
        canvas.drawRRect(_box(3.75, 5.25, 20.25, 20.25, 2), _line);
        _seg(canvas, 3.75, 10, 20.25, 10);
        _seg(canvas, 8, 3.2, 8, 7);
        _seg(canvas, 16, 3.2, 16, 7);
      case Mark.people:
        canvas.drawCircle(const Offset(9, 8.2), 3.2, _line);
        canvas.drawArc(const Rect.fromLTRB(3, 13.5, 15, 25.5), math.pi, math.pi, false, _line);
        canvas.drawArc(const Rect.fromLTRB(13.2, 5.2, 19.2, 11.2), -math.pi / 2, math.pi, false, _line);
        canvas.drawArc(const Rect.fromLTRB(12.5, 13.5, 21, 25.5), -math.pi / 2, math.pi / 2, false, _line);
      case Mark.switchBooks:
        _path(canvas, [4, 8.5, 20, 8.5]);
        _path(canvas, [16.2, 4.7, 20, 8.5, 16.2, 12.3]);
        _path(canvas, [20, 15.5, 4, 15.5]);
        _path(canvas, [7.8, 11.7, 4, 15.5, 7.8, 19.3]);
    }
  }

  @override
  bool shouldRepaint(_MarkPainter old) =>
      old.mark != mark || old.color != color;
}
