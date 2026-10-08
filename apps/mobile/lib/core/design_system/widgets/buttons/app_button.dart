import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart'
    show GavelStrikeButton;
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/buttons/gavel_strike_button.dart'
    show GavelStrikeButton;
import 'package:lawbid/core/design_system/widgets/feedback/app_snackbar.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_tap_target.dart';

enum AppButtonVariant {
  primary,
  secondary,

  /// Same shape/behavior as [primary], different color pair
  /// (`colors.ctaBright`/`colors.onCtaBright`) -- added 2026-09-22 for the
  /// welcome screen's phone button in dark theme only (owner found the
  /// default gold too dull there); every other primary-button call site
  /// is unaffected since they keep passing [primary].
  ctaBright,

  /// Filled `danger` / `onDanger` — irreversible actions (delete account).
  /// Added in the UI modernization pass (2026-09-27).
  danger,
}

/// Primary/secondary action button (file 07 §4 "AppButton").
///
/// Height defaults to 50 (the welcome screen uses 48 explicitly per file 07
/// §6.1 — pass `height: 48` there). Full width, icon 8px left of the label.
/// Owner 2026-10-07 (phone test): a button whose conditions are not met
/// looks inactive (dimmed, [dimWhenDisabled] on by default) and, when
/// tapped anyway, says what is missing ([disabledHint]) instead of doing
/// nothing silently.
///
/// [onTapDown] is a pass-through hook (not used by AppButton itself) so
/// [GavelStrikeButton] can learn the tap position without a side-channel
/// gesture detector competing in the same gesture arena — see stage 1.5
/// architecture review in docs/CHANGELOG.md.
class AppButton extends StatefulWidget {
  const AppButton({
    required this.label,
    required this.onPressed,
    super.key,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.isEnabled = true,
    this.height = 50,
    this.onTapDown,
    this.dimWhenDisabled = true,
    this.disabledHint,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool isLoading;
  final bool isEnabled;
  final double height;
  final ValueChanged<TapDownDetails>? onTapDown;

  /// Render at reduced opacity while not interactive (not while loading).
  /// On by default since 2026-10-07: an inactive button must look inactive.
  final bool dimWhenDisabled;

  /// Owner 2026-10-07: what to do first (e.g. «Выберите видео»), shown
  /// when the inactive button is tapped. Null = the tap does nothing.
  final String? disabledHint;

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  bool get _interactive =>
      widget.isEnabled && !widget.isLoading && widget.onPressed != null;

  void _disabledTap() {
    final hint = widget.disabledHint;
    if (_interactive || widget.isLoading || hint == null || hint.isEmpty) {
      return;
    }
    showAppSnackBar(context, hint);
  }

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
    Color? borderColor;
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
        // Hairline outline (UI modernization pass, 2026-09-27): in light
        // theme `surface` == `bg`, so without it the button had no visible
        // edge. The welcome screen never uses this variant.
        borderColor = colors.border;
      case AppButtonVariant.danger:
        background = colors.dangerFill;
        foreground = colors.onDanger;
    }

    final content = widget.isLoading
        ? SizedBox(
            width: 20,
            height: 20,
            child:
                CircularProgressIndicator(strokeWidth: 2.2, color: foreground),
          )
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.icon != null) ...[
                AppIcon(widget.icon, size: 20, color: foreground),
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

    return AppTapTarget(
      child: Semantics(
        button: true,
        enabled: _interactive,
        label: widget.label,
        // The visible Text would repeat the label ("Retry\nRetry"); it is
        // excluded, so the tap action is re-declared here.
        excludeSemantics: true,
        onTap: _interactive ? widget.onPressed : null,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) {
            _setPressed(true);
            widget.onTapDown?.call(details);
          },
          onTapUp: (_) => _setPressed(false),
          onTapCancel: () => _setPressed(false),
          onTap: _interactive ? widget.onPressed : _disabledTap,
          child: _maybeDim(
            AnimatedScale(
              scale: _pressed && !context.reduceMotion
                  ? AppMotion.pressScaleFactor
                  : 1.0,
              duration: AppMotion.pressScale,
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: widget.height),
                child: Container(
                  width: double.infinity,
                  // Horizontal inset keeps long (translated) labels off the
                  // rounded edges when they wrap.
                  padding: const EdgeInsets.symmetric(
                    vertical: AppSpacing.md,
                    horizontal: AppSpacing.md,
                  ),
                  decoration: BoxDecoration(
                    color: background,
                    borderRadius: BorderRadius.circular(AppRadii.button),
                    border: borderColor == null
                        ? null
                        : Border.all(color: borderColor),
                  ),
                  alignment: Alignment.center,
                  child: content,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _maybeDim(Widget child) {
    if (!widget.dimWhenDisabled) return child;
    return AnimatedOpacity(
      opacity: _interactive || widget.isLoading ? 1 : 0.45,
      duration: AppMotion.stateChange,
      child: child,
    );
  }
}
