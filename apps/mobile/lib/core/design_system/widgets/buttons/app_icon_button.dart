import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../tokens/app_motion.dart';
import '../../tokens/app_radii.dart';

/// Social-login icon button (file 07 §4 "AppIconButton"): 44x44, radius 12,
/// `surface` fill, 1px `border`, 20px icon in `text` color.
class AppIconButton extends StatefulWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.semanticLabel,
  });

  final Widget icon;
  final VoidCallback? onPressed;
  final String semanticLabel;

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
        onTapDown: widget.onPressed == null ? null : (_) => setState(() => _pressed = true),
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
