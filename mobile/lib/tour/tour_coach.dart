import 'dart:async';

import 'package:flutter/material.dart';

import 'package:myca_design/myca_design.dart' show Bahi;
import '../theme.dart';
import 'tour.dart';

class TourCoach extends StatelessWidget {
  const TourCoach({super.key, required this.tour});

  final TourController tour;

  @override
  Widget build(BuildContext context) {
    final step = tour.step;
    final media = MediaQuery.of(context);
    final top = step.place == TourPlace.top;
    final wide = media.size.width > 600;
    final card = _CoachCard(tour: tour, step: step);
    return Positioned(
      left: 0,
      right: 0,
      top: top ? media.padding.top + 58 : null,
      bottom: top ? null : media.padding.bottom + 12,
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: wide ? 520 : double.infinity),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 240),
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween(begin: Offset(0, top ? -0.08 : 0.08), end: Offset.zero).animate(animation),
                  child: child,
                ),
              ),
              child: KeyedSubtree(key: ValueKey(tour.index), child: card),
            ),
          ),
        ),
      ),
    );
  }
}

class _CoachCard extends StatefulWidget {
  const _CoachCard({required this.tour, required this.step});

  final TourController tour;
  final TourStep step;

  @override
  State<_CoachCard> createState() => _CoachCardState();
}

class _CoachCardState extends State<_CoachCard> {
  bool _talking = true;
  Timer? _quiet;

  TourController get tour => widget.tour;
  TourStep get step => widget.step;

  @override
  void initState() {
    super.initState();
    final words = step.say.split(' ').length;
    _quiet = Timer(Duration(milliseconds: (words * 140).clamp(900, 3200)), () {
      if (mounted) setState(() => _talking = false);
    });
  }

  @override
  void dispose() {
    _quiet?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);
    final mascot = (76 * scale).clamp(76.0, 104.0);
    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: Palette.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Palette.line),
          boxShadow: const [
            BoxShadow(color: Color(0x1F15181B), blurRadius: 24, offset: Offset(0, 10)),
            BoxShadow(color: Color(0x0F15181B), blurRadius: 4, offset: Offset(0, 1)),
          ],
        ),
        padding: const EdgeInsets.fromLTRB(10, 12, 14, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Bahi(mood: step.mood, size: mascot, talking: _talking),
                const SizedBox(width: 8),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${Bahi.name} · ${tour.index + 1} of ${tour.count}',
                          style: text.labelSmall?.copyWith(color: Palette.accent),
                        ),
                        const SizedBox(height: 4),
                        Semantics(
                          liveRegion: true,
                          child: Text(step.say, style: text.bodyLarge?.copyWith(height: 1.38)),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _Progress(index: tour.index, count: tour.count),
            const SizedBox(height: 6),
            OverflowBar(
              alignment: MainAxisAlignment.end,
              overflowAlignment: OverflowBarAlignment.end,
              spacing: 8,
              overflowSpacing: 4,
              children: [
                TextButton(
                  onPressed: () => tour.finish(),
                  style: TextButton.styleFrom(foregroundColor: Palette.muted, minimumSize: const Size(48, 44)),
                  child: const Text('End tour'),
                ),
                if (step.showMe != null)
                  OutlinedButton(
                    onPressed: tour.showMe,
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                    child: const Text('Show me'),
                  ),
                FilledButton(
                  onPressed: tour.next,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    backgroundColor: step.wait == TourWait.next ? Palette.accent : Palette.ink,
                  ),
                  child: Text(step.wait == TourWait.next ? step.nextLabel : 'Skip ahead'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.index, required this.count});

  final int index;
  final int count;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(3),
        child: TweenAnimationBuilder<double>(
          tween: Tween(end: (index + 1) / count),
          duration: const Duration(milliseconds: 300),
          builder: (context, value, _) => LinearProgressIndicator(
            value: value,
            minHeight: 4,
            backgroundColor: Palette.sunken,
            color: Palette.accent,
          ),
        ),
      ),
    );
  }
}
