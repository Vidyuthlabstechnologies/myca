import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:rive/rive.dart' as rive;

enum BahiMood { happy, thinking, celebrate, worried, wave }

class Bahi extends StatefulWidget {
  const Bahi({super.key, this.mood = BahiMood.happy, this.size = 96, this.talking = false});

  final BahiMood mood;
  final double size;
  final bool talking;

  static const name = 'Bahi';
  static const package = 'myca_design';
  static const riveAsset = 'packages/$package/assets/mascot/bahi.riv';
  static bool live = true;

  static Future<rive.File?>? _file;

  static Future<rive.File?> _load() => _file ??= () async {
    try {
      if (!await rive.RiveNative.init()) return null;
      return await rive.File.asset(riveAsset, riveFactory: rive.Factory.rive);
    } on Object {
      return null;
    }
  }();

  @override
  State<Bahi> createState() => _BahiState();
}

class _BahiState extends State<Bahi> with SingleTickerProviderStateMixin {
  late final AnimationController _breath = AnimationController(vsync: this, duration: const Duration(milliseconds: 2600));
  rive.RiveWidgetController? _rive;
  rive.ViewModelInstance? _data;
  bool _still = false;

  @override
  void initState() {
    super.initState();
    if (Bahi.live) unawaited(_attach());
  }

  Future<void> _attach() async {
    final file = await Bahi._load();
    if (file == null || !mounted) return;
    try {
      final controller = rive.RiveWidgetController(file);
      final data = controller.dataBind(rive.DataBind.auto());
      setState(() {
        _rive = controller;
        _data = data;
      });
      _push();
    } on Object {
      return;
    }
  }

  void _push() {
    final data = _data;
    if (data == null) return;
    data.number('mood')?.value = widget.mood.index.toDouble();
    data.boolean('talking')?.value = widget.talking;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _still = !Bahi.live || (MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (_still) {
      _breath.stop();
      _breath.value = 0;
    } else if (!_breath.isAnimating) {
      _breath.repeat();
    }
  }

  @override
  void didUpdateWidget(Bahi old) {
    super.didUpdateWidget(old);
    if (old.mood != widget.mood || old.talking != widget.talking) _push();
  }

  @override
  void dispose() {
    _breath.dispose();
    _data?.dispose();
    _rive?.dispose();
    super.dispose();
  }

  String get _label => switch (widget.mood) {
    BahiMood.happy => '${Bahi.name}, smiling',
    BahiMood.thinking => '${Bahi.name}, thinking',
    BahiMood.celebrate => '${Bahi.name}, celebrating',
    BahiMood.worried => '${Bahi.name}, looking concerned',
    BahiMood.wave => '${Bahi.name}, waving hello',
  };

  @override
  Widget build(BuildContext context) {
    final controller = _rive;
    final size = widget.size;
    final Widget body;
    if (controller != null && !_still) {
      body = rive.RiveWidget(controller: controller, fit: rive.Fit.contain);
    } else {
      body = _Still(mood: widget.mood, size: size, breath: _breath);
    }
    return Semantics(
      image: true,
      label: _label,
      child: SizedBox.square(dimension: size, child: ExcludeSemantics(child: body)),
    );
  }
}

class _Still extends StatelessWidget {
  const _Still({required this.mood, required this.size, required this.breath});

  final BahiMood mood;
  final double size;
  final Animation<double> breath;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: breath,
      builder: (context, child) {
        final t = math.sin(breath.value * 2 * math.pi);
        final hop = mood == BahiMood.celebrate ? -size * 0.05 * t.abs() : 0.0;
        return Transform.translate(
          offset: Offset(0, hop),
          child: Transform(
            alignment: Alignment.bottomCenter,
            transform: Matrix4.diagonal3Values(1 - 0.012 * t, 1 + 0.025 * t, 1),
            child: child,
          ),
        );
      },
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        switchInCurve: Curves.easeOutBack,
        transitionBuilder: (child, animation) => ScaleTransition(
          scale: Tween(begin: 0.85, end: 1.0).animate(animation),
          alignment: Alignment.bottomCenter,
          child: FadeTransition(opacity: animation, child: child),
        ),
        child: Image.asset(
          'assets/mascot/${mood.name}.png',
          package: Bahi.package,
          key: ValueKey(mood),
          width: size,
          height: size,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.medium,
          excludeFromSemantics: true,
        ),
      ),
    );
  }
}

class BahiNote extends StatelessWidget {
  const BahiNote({super.key, required this.text, this.mood = BahiMood.happy, this.title, this.action, this.size = 112});

  final String text;
  final String? title;
  final BahiMood mood;
  final Widget? action;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Bahi(mood: mood, size: size),
          const SizedBox(height: 12),
          if (title != null) ...[
            Text(title!, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
          ],
          Text(text, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}
