import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../theme.dart';

const double glassSheetRadius = 28;
const double glassBlur = 28;
const double glassOpacityLight = 0.97;
const double glassOpacityDark = 0.9;

bool glassBlurEnabled = true;

bool glassIsSolid(BuildContext context) => !glassBlurEnabled || (MediaQuery.maybeHighContrastOf(context) ?? false);

class MycaGlass extends StatelessWidget {
  const MycaGlass({
    super.key,
    required this.child,
    this.borderRadius = BorderRadius.zero,
    this.blur = glassBlur,
    this.opacity,
    this.edge = true,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final double blur;
  final double? opacity;
  final bool edge;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final solid = glassIsSolid(context);
    final fill = p.surface.withValues(alpha: solid ? 1 : (opacity ?? (dark ? glassOpacityDark : glassOpacityLight)));
    final sheen = (dark ? Colors.white : Colors.white).withValues(alpha: dark ? 0.06 : 0.55);
    final body = DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: borderRadius,
        gradient: solid
            ? null
            : LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.center,
                colors: [Color.alphaBlend(sheen, fill), fill],
              ),
        border: edge && !solid ? Border.all(color: p.line.withValues(alpha: 0.7), width: 0.8) : null,
      ),
      child: Material(type: MaterialType.transparency, child: child),
    );
    if (solid) return ClipRRect(borderRadius: borderRadius, child: body);
    return ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: body,
      ),
    );
  }
}

class MycaGlassSheet extends StatelessWidget {
  const MycaGlassSheet({super.key, required this.child, this.handle = true});

  final Widget child;
  final bool handle;

  @override
  Widget build(BuildContext context) {
    final p = paletteOf(context);
    return MycaGlass(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(glassSheetRadius)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (handle)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Semantics(
                label: 'Drag to close',
                child: Container(
                  width: 36,
                  height: 5,
                  decoration: BoxDecoration(color: p.line, borderRadius: BorderRadius.circular(3)),
                ),
              ),
            ),
          Flexible(child: child),
        ],
      ),
    );
  }
}

Future<T?> showMycaSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
  bool useSafeArea = false,
  bool isDismissible = true,
  bool enableDrag = true,
  bool? showDragHandle,
  bool useRootNavigator = false,
  BoxConstraints? constraints,
  Color? barrierColor,
  RouteSettings? routeSettings,
}) {
  return showModalBottomSheet<T>(
    context: context,
    builder: (sheetContext) => MycaGlassSheet(handle: showDragHandle ?? true, child: builder(sheetContext)),
    isScrollControlled: isScrollControlled,
    useSafeArea: useSafeArea,
    isDismissible: isDismissible,
    enableDrag: enableDrag,
    useRootNavigator: useRootNavigator,
    constraints: constraints,
    barrierColor: barrierColor,
    routeSettings: routeSettings,
    backgroundColor: Colors.transparent,
    elevation: 0,
    showDragHandle: false,
    clipBehavior: Clip.none,
  );
}
