import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../tokens/app_motion.dart';
import '../../tokens/app_radii.dart';

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
  });

  final Widget icon;
  final VoidCallback? onPressed;
  final String semanticLabel;
  final ValueChanged<TapDownDetails>? onTapDown;

  @override
  State<AppIconButton> createState() => _AppIconButtonState();
}

class _AppIconButtonState extends State<AppIconButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: widget.semanticLabel,
      enabled: widget.onPressed != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: widget.onPressed == null
            ? null
            : (details) {
                setState(() => _pressed = true);
                widget.onTapDown?.call(details);
              },
        onTapUp: widget.onPressed == null ? null : (_) => setState(() => _pressed = false),
        onTapCancel: widget.onPressed == null ? null : () => setState(() => _pressed = false),
        onTap: widget.onPressed,
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
            child: IconTheme(
              data: IconThemeData(size: 20, color: colors.text),
              child: widget.icon,
            ),
          ),
        ),
      ),
    );
  }
}
