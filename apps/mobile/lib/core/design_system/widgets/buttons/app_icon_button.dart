import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../tokens/app_motion.dart';
import '../../tokens/app_radii.dart';
import '../motion/app_tap_target.dart';

/// Social-login icon button (file 07 §4 "AppIconButton"): 44x44, radius 12,
/// `surface` fill, 1px `border`, 20px icon in `text` color.
///
/// [onTapDown] is the same pass-through hook `AppButton` has (see its doc
/// comment) — added in stage 1.7 (docs/CHANGELOG.md) so `GavelStrikeIconButton`
/// can learn the tap position the same way `GavelStrikeButton` does for
/// `AppButton`, needed because file 07 §7.4 lists the welcome screen's three
/// social-login icon buttons among the gavel-strike buttons, not just the
/// phone button. Optional and additive — no existing call site changes.
class AppIconButton extends StatefulWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.semanticLabel,
    this.onTapDown,
    this.isLoading = false,
  });

  final Widget icon;
  final VoidCallback? onPressed;
  final String semanticLabel;
  final ValueChanged<TapDownDetails>? onTapDown;
  final bool isLoading;

  @override
  State<AppIconButton> createState() => _AppIconButtonState();
}

class _AppIconButtonState extends State<AppIconButton> {
  bool _pressed = false;

  bool get _interactive => widget.onPressed != null && !widget.isLoading;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // AppTapTarget: 44px visual (file 07 §4) with a 48px touch/semantics
    // area — layout and paint unchanged (welcome goldens stay identical).
    return AppTapTarget(
      child: Semantics(
        button: true,
        label: widget.semanticLabel,
        enabled: _interactive,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: !_interactive
              ? null
              : (details) {
                  setState(() => _pressed = true);
                  widget.onTapDown?.call(details);
                },
          onTapUp:
              !_interactive ? null : (_) => setState(() => _pressed = false),
          onTapCancel:
              !_interactive ? null : () => setState(() => _pressed = false),
          onTap: _interactive ? widget.onPressed : null,
          child: AnimatedScale(
            scale: _pressed ? AppMotion.pressScaleFactor : 1.0,
            duration: AppMotion.pressScale,
            child: Container(
              constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(color: colors.border),
              ),
              alignment: Alignment.center,
              child: widget.isLoading
                  ? SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: colors.text),
                    )
                  : IconTheme(
                      data: IconThemeData(size: 20, color: colors.text),
                      child: widget.icon,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
