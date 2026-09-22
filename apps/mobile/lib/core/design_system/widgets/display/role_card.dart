import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_colors.dart';
import '../../tokens/app_motion.dart';
import '../../tokens/app_radii.dart';

/// Role-selection card (file 07 §4 "RoleCard", used on `/onboarding/role`,
/// file 07 §6.4 — that screen itself is built in stage 1.7; this widget is
/// the stage-1.5 reusable primitive).
///
/// The Attorney variant ([isAttorneyFixedStyle]) is ALWAYS navy with white
/// text in both themes — see [AppColorsFixed]'s doc comment for why this
/// bypasses the normal token system by design.
///
/// A11y (docs/CHANGELOG.md stage 1.5): behaves as a member of a radio group
/// — [Semantics.inMutuallyExclusiveGroup] + [Semantics.selected] — since
/// this is a custom-drawn card, not a native `Radio`. The checkmark badge
/// and PRO badge are excluded from the semantics tree individually; the PRO
/// text is folded into the card's own semantics label instead, so nothing is
/// announced twice and nothing is silently dropped.
class RoleCard extends StatelessWidget {
  const RoleCard({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.isSelected,
    required this.onTap,
    this.isAttorneyFixedStyle = false,
    this.showProBadge = false,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool isSelected;
  final VoidCallback onTap;
  final bool isAttorneyFixedStyle;
  final bool showProBadge;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    final Color background;
    final Color titleColor;
    final Color descriptionColor;
    final Border border;

    if (isAttorneyFixedStyle) {
      background = AppColorsFixed.attorneyCardNavy;
      titleColor = AppColorsFixed.attorneyCardTitleText;
      descriptionColor = AppColorsFixed.attorneyCardDescriptionText;
      border = isSelected
          ? Border.all(color: colors.gold, width: 1.5)
          : Border.all(color: AppColorsFixed.attorneyCardGoldBorder, width: 1);
    } else {
      background = colors.surface;
      titleColor = colors.text;
      descriptionColor = colors.textSecondary;
      border = Border.all(color: isSelected ? colors.gold : colors.border, width: isSelected ? 1.5 : 1);
    }

    final semanticLabel = showProBadge ? '$title, PRO' : title;

    return Semantics(
      button: true,
      selected: isSelected,
      inMutuallyExclusiveGroup: true,
      label: semanticLabel,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: ExcludeSemantics(
          child: Stack(
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(AppRadii.roleCard),
                  border: border,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(icon, size: 20, color: isAttorneyFixedStyle ? colors.gold : titleColor),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            title,
                            style: typography.roleTitle.copyWith(color: titleColor),
                          ),
                        ),
                        if (showProBadge) _ProBadge(colors: colors, style: typography.badge),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Padding(
                      padding: const EdgeInsets.only(right: 30),
                      child: Text(
                        description,
                        style: typography.bodySmall.copyWith(color: descriptionColor),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                right: 12,
                bottom: 12,
                child: AnimatedScale(
                  scale: isSelected ? 1 : 0.6,
                  duration: AppMotion.roleCardCheckmark,
                  child: AnimatedOpacity(
                    opacity: isSelected ? 1 : 0,
                    duration: AppMotion.roleCardCheckmark,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(color: colors.gold, shape: BoxShape.circle),
                      alignment: Alignment.center,
                      child: Icon(Icons.check, size: 13, color: colors.navy),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProBadge extends StatelessWidget {
  const _ProBadge({required this.colors, required this.style});

  final AppColorTokens colors;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        border: Border.all(color: colors.gold),
        borderRadius: BorderRadius.circular(AppRadii.proBadge),
      ),
      child: Text('PRO', style: style.copyWith(color: colors.gold)),
    );
  }
}
