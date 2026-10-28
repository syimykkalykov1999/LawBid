import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';

/// Owner 2026-10-19: the small round icon button at the end of a row of
/// chips (the magnifier of Tasks; owner 2026-10-23 also the magnifier and the
/// filter of Q&A): a 32 dp circle in a 44 dp touch area. [selected] draws the
/// ring in the text colour (the search is open); [dot] marks a filter that
/// is on.
class AppRoundChipButton extends StatelessWidget {
  const AppRoundChipButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.selected = false,
    this.dot = false,
    super.key,
  });

  /// The circle's diameter; the chip pills that share a row with these
  /// buttons (Q&A segment, Tasks chips) are exactly this tall.
  static const double diameter = 32;

  final IconData icon;

  /// The screen-reader label.
  final String label;
  final VoidCallback onTap;
  final bool selected;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: diameter,
                height: diameter,
                decoration: BoxDecoration(
                  color: colors.chip,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected || dot ? colors.text : colors.border,
                  ),
                ),
                child: AppIcon(icon, size: 18, color: colors.text),
              ),
              if (dot)
                PositionedDirectional(
                  top: -1,
                  end: -1,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: colors.accent,
                      shape: BoxShape.circle,
                    ),
                    child: const SizedBox.square(dimension: 8),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
