import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_dialog.dart'
    show AppDialogMotion;
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
    this.onLongPress,
    this.highlight = false,
    this.highlightRadius = BorderRadius.zero,
    this.highlightOver = false,
  });

  final Widget child;
  final VoidCallback? onTap;

  /// Owner 13.11 (row 93, WhatsApp / Telegram): a list row (a chat, a case,
  /// a notification) lights up while pressed, in the design system's
  /// [AppColorTokens.chip] (the colour of a selected chat row). iPhone: the
  /// grey cell highlight — on at the press, fading out on the iOS spring
  /// (`AppDialogMotion`, from Flutter's Cupertino code); Android: the
  /// Material ripple (`InkRipple`). Reduce motion: on and off at once.
  final bool highlight;

  /// The corners of the highlight (the row's own shape).
  final BorderRadius highlightRadius;

  /// For a row drawn as a solid card (a case): the highlight lies over it,
  /// half strength, on both platforms (a ripple under a solid card would
  /// not show).
  final bool highlightOver;

  /// Optional long-press action (context menus).
  final VoidCallback? onLongPress;

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
    final reduce = context.reduceMotion;
    final scale = _pressed && !reduce ? AppMotion.pressScaleFactor : 1.0;
    if (widget.highlight) return _highlighted(context, scale, reduce: reduce);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(pressed: true),
      onTapUp: (_) => _set(pressed: false),
      onTapCancel: () => _set(pressed: false),
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: AnimatedScale(
        scale: scale,
        duration: AppMotion.pressScale,
        curve: AppMotion.enterCurve,
        child: widget.child,
      ),
    );
  }

  Widget _highlighted(
    BuildContext context,
    double scale, {
    required bool reduce,
  }) {
    final theme = Theme.of(context);
    final tint = theme.extension<AppColorTokens>()!.chip;
    final content = AnimatedScale(
      scale: scale,
      duration: AppMotion.pressScale,
      curve: AppMotion.enterCurve,
      child: widget.child,
    );
    final android = theme.platform == TargetPlatform.android;
    if (android && !reduce && !widget.highlightOver) {
      return Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTapDown: (_) => _set(pressed: true),
          onTapUp: (_) => _set(pressed: false),
          onTapCancel: () => _set(pressed: false),
          onTap: widget.onTap,
          onLongPress: widget.onLongPress,
          borderRadius: widget.highlightRadius,
          splashFactory: InkRipple.splashFactory,
          splashColor: tint,
          highlightColor: Colors.transparent,
          child: content,
        ),
      );
    }
    final on = _pressed && widget.onTap != null;
    final shown = widget.highlightOver ? tint.withValues(alpha: 0.5) : tint;
    final decoration = BoxDecoration(
      color: on ? shown : shown.withValues(alpha: 0),
      borderRadius: widget.highlightRadius,
    );
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(pressed: true),
      onTapUp: (_) => _set(pressed: false),
      onTapCancel: () => _set(pressed: false),
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: AnimatedContainer(
        // On at once (as UIKit's cell highlight), off on the iOS spring.
        duration: on || reduce ? Duration.zero : AppDialogMotion.duration,
        curve: AppDialogMotion.curve,
        decoration: widget.highlightOver ? null : decoration,
        foregroundDecoration: widget.highlightOver ? decoration : null,
        child: content,
      ),
    );
  }
}
