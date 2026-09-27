import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Tap target with the design system's press feedback (file 07 §4: scale
/// 0.98 over 120ms) for custom surfaces — cards, list rows, sheet options.
/// Scale is skipped under reduce-motion; the tap itself still works.
///
/// Semantics are the caller's job (wrap in `Semantics(button: true, ...)`)
/// so the label can include row-specific state.
class AppPressable extends StatefulWidget {
  const AppPressable({
    required this.child,
    required this.onTap,
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;

  @override
  State<AppPressable> createState() => _AppPressableState();
}

class _AppPressableState extends State<AppPressable> {
  bool _pressed = false;

  void _set({required bool pressed}) {
    if (widget.onTap == null || _pressed == pressed) return;
    setState(() => _pressed = pressed);
  }

  @override
  Widget build(BuildContext context) {
    final scale =
        _pressed && !context.reduceMotion ? AppMotion.pressScaleFactor : 1.0;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(pressed: true),
      onTapUp: (_) => _set(pressed: false),
      onTapCancel: () => _set(pressed: false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: scale,
        duration: AppMotion.pressScale,
        curve: AppMotion.enterCurve,
        child: widget.child,
      ),
    );
  }
}
