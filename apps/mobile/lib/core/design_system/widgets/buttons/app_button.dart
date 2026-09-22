import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_motion.dart';
import '../../tokens/app_radii.dart';
import '../../tokens/app_spacing.dart';

enum AppButtonVariant {
  primary,
  secondary,

  /// Same shape/behavior as [primary], different color pair
  /// (`colors.ctaBright`/`colors.onCtaBright`) -- added 2026-09-22 for the
  /// welcome screen's phone button in dark theme only (owner found the
  /// default gold too dull there); every other primary-button call site
  /// is unaffected since they keep passing [primary].
  ctaBright,
}

/// Primary/secondary action button (file 07 §4 "AppButton").
///
/// Height defaults to 50 (the welcome screen uses 48 explicitly per file 07
/// §6.1 — pass `height: 48` there). Full width, icon 8px left of the label.
/// Disabled buttons stay visually active and simply error on tap per spec
/// ("кнопка остаётся активной и отвечает ошибкой при попытке") — `isEnabled`
/// controls whether [onPressed] actually fires, not the button's appearance,
/// except where [isEnabled] is false AND [onPressed] is null (truly inert,
/// e.g. a golden-test fixture).
///
/// [onTapDown] is a pass-through hook (not used by AppButton itself) so
/// [GavelStrikeButton] can learn the tap position without a side-channel
/// gesture detector competing in the same gesture arena — see stage 1.5
/// architecture review in docs/CHANGELOG.md.
class AppButton extends StatefulWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.isEnabled = true,
    this.height = 50,
    this.onTapDown,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool isLoading;
  final bool isEnabled;
  final double height;
  final ValueChanged<TapDownDetails>? onTapDown;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  bool get _interactive => widget.isEnabled && !widget.isLoading && widget.onPressed != null;

  void _setPressed(bool value) {
    if (!_interactive) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    final Color background;
    final Color foreground;
    switch (widget.variant) {
      case AppButtonVariant.primary:
        background = colors.accent;
        foreground = colors.onAccent;
      case AppButtonVariant.ctaBright:
        background = colors.ctaBright;
        foreground = colors.onCtaBright;
      case AppButtonVariant.secondary:
        background = colors.surface;
        foreground = colors.text;
    }

    final content = widget.isLoading
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2.2, color: foreground),
          )
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 20, color: foreground),
                const SizedBox(width: AppSpacing.sm),
              ],
              Flexible(
                child: Text(
                  widget.label,
                  style: typography.button.copyWith(color: foreground),
                  textAlign: TextAlign.center,
                  softWrap: true,
                ),
              ),
            ],
          );

    return Semantics(
      button: true,
      enabled: _interactive,
      label: widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (details) {
          _setPressed(true);
          widget.onTapDown?.call(details);
        },
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: _interactive ? widget.onPressed : null,
        child: AnimatedScale(
          scale: _pressed ? AppMotion.pressScaleFactor : 1.0,
          duration: AppMotion.pressScale,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: widget.height),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(AppRadii.button),
              ),
              alignment: Alignment.center,
              child: content,
            ),
          ),
        ),
      ),
    );
  }
}
