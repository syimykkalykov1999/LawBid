import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/display/brand_glyphs.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Back-navigation chevron used on the phone/otp auth screens (file 07 §6.2:
/// "Стрелка назад (22)"; file 07 §9 a11y: "стрелка назад 44×44 зона"). Not a
/// new visual invention — this materializes exactly those two numbers
/// (22px glyph inside a 44x44 tap target) as one reusable widget instead of
/// re-building the same `GestureDetector`+`SizedBox` on every screen that
/// needs a back button.
class AppBackButton extends StatefulWidget {
  const AppBackButton({
    required this.onPressed,
    super.key,
    this.semanticLabel = 'Назад',
  });

  final VoidCallback onPressed;
  final String semanticLabel;

  @override
  State<AppBackButton> createState() => _AppBackButtonState();
}

class _AppBackButtonState extends State<AppBackButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: widget.semanticLabel,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.onPressed,
        child: AnimatedScale(
          scale: _pressed && !context.reduceMotion
              ? AppMotion.pressScaleFactor
              : 1.0,
          duration: AppMotion.pressScale,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Center(
              child: ChevronGlyph(
                direction: ChevronDirection.left,
                size: 22,
                color: colors.text,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
