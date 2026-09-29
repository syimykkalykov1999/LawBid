import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_tap_target.dart';

enum AppTabKey { feed, search, mine, profile }

@immutable
class AppTabConfig {
  const AppTabConfig({
    required this.key,
    required this.icon,
    required this.activeIcon,
    required this.label,
  });

  final AppTabKey key;
  final IconData icon;
  final IconData activeIcon;
  final String label;
}

/// Bottom navigation (file 01 §3: "Пять вкладок: Лента | Поиск | + | Моё |
/// Профиль"). Deliberately role-UNAWARE — [tabs] always has exactly 4
/// entries (the labels/icons differ per role, e.g. Attorney's Feed tab also
/// has a "Кейсы" sub-tab, but that's the Feed screen's own concern, not the
/// nav bar's); role branching happens one layer up in
/// `core/navigation/shell/bottom_nav_config.dart`. This keeps AppBottomNav
/// golden-testable with zero role/auth dependency (docs/CHANGELOG.md stage
/// 1.5 architecture review).
///
/// The center "+" is a fixed action ([onCreatePressed]), not a 5th selectable
/// tab — see the same architecture review for why.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    required this.tabs,
    required this.currentIndex,
    required this.onTabSelected,
    required this.onCreatePressed,
    super.key,
    this.createSemanticLabel = 'Создать',
  }) : assert(
          tabs.length == 4,
          'AppBottomNav expects exactly 4 tabs plus the fixed center "+"',
        );

  final List<AppTabConfig> tabs;
  final int currentIndex;
  final ValueChanged<int> onTabSelected;
  final VoidCallback onCreatePressed;
  final String createSemanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    // First 2 tabs, center "+", last 2 tabs — matches the spec's visual
    // order (Лента, Поиск, [+], Моё, Профиль).
    final left = tabs.sublist(0, 2);
    final right = tabs.sublist(2, 4);

    final stateDuration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;

    // UI modernization pass (2026-09-27): the selected tab gets a gold-
    // tinted pill behind its icon that animates in, plus a light selection
    // haptic on tap. Hit area is the whole Expanded column (>= 48 tall).
    Widget buildTab(AppTabConfig tab, int index) {
      final selected = index == currentIndex;
      final color = selected ? colors.accent : colors.textSecondary;
      return Expanded(
        child: Semantics(
          button: true,
          selected: selected,
          label: tab.label,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (!selected) HapticFeedback.selectionClick();
              onTabSelected(index);
            },
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedContainer(
                    duration: stateDuration,
                    curve: AppMotion.enterCurve,
                    width: AppSizes.navIndicatorWidth,
                    height: AppSizes.navIndicatorHeight,
                    decoration: BoxDecoration(
                      color: selected
                          ? colors.goldTint
                          : colors.goldTint.withValues(alpha: 0),
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    alignment: Alignment.center,
                    child: AnimatedSwitcher(
                      duration: stateDuration,
                      transitionBuilder: (child, animation) => ScaleTransition(
                        scale: Tween<double>(begin: 0.85, end: 1)
                            .animate(animation),
                        child: FadeTransition(opacity: animation, child: child),
                      ),
                      child: Icon(
                        selected ? tab.activeIcon : tab.icon,
                        key: ValueKey<bool>(selected),
                        size: AppSizes.iconMd,
                        color: color,
                      ),
                    ),
                  ),
                  // 6 (was 2): keeps the label's own box clear of the
                  // selection pill, so the pill tint never sits behind the
                  // text (p12 leaf-1.6 contrast pass, docs/01 §8.4).
                  const SizedBox(height: AppSpacing.sm - 2),
                  AnimatedDefaultTextStyle(
                    duration: stateDuration,
                    style: typography.caption.copyWith(
                      color: color,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                    ),
                    // Tab labels grow with the system text size only up
                    // to 1.35x (the platform convention for tab bars —
                    // iOS shows the large-content viewer instead): the
                    // 58px bar must never clip at 200% (docs/01 §8.4).
                    child: MediaQuery.withClampedTextScaling(
                      maxScaleFactor: AppSizes.navLabelMaxTextScale,
                      child: Text(
                        tab.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // Owner 2026-09-29: slightly rounded top corners. Flutter cannot
    // combine a one-sided Border with a radius, so the hairline along the
    // top edge and around the two corners is stroked by _TopOutlinePainter.
    const topRadius = BorderRadius.vertical(
      top: Radius.circular(AppSizes.bottomNavRadius),
    );
    return CustomPaint(
      foregroundPainter: _TopOutlinePainter(
        color: colors.border,
        radius: AppSizes.bottomNavRadius,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bg,
          borderRadius: topRadius,
          boxShadow: [
            BoxShadow(
              color: colors.shadow,
              blurRadius: AppSizes.cardShadowBlur,
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 58,
            // Side inset keeps the outer tabs clear of the rounded corners
            // and the hairline border (also what the a11y contrast check
            // samples inside each tab's rect).
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Row(
                children: [
                  buildTab(left[0], 0),
                  buildTab(left[1], 1),
                  AppTapTarget(
                    child: Semantics(
                      button: true,
                      label: createSemanticLabel,
                      excludeSemantics: true,
                      child: AppPressable(
                        onTap: onCreatePressed,
                        child: Container(
                          width: AppSizes.touchTarget,
                          height: AppSizes.touchTarget,
                          decoration: BoxDecoration(
                            color: colors.accent,
                            shape: BoxShape.circle,
                            border: Border.all(color: colors.gold, width: 1.5),
                            boxShadow: [
                              BoxShadow(
                                color: colors.shadow,
                                blurRadius: AppSizes.cardShadowOffsetY,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          alignment: Alignment.center,
                          child:
                              Icon(Icons.add, color: colors.onAccent, size: 26),
                        ),
                      ),
                    ),
                  ),
                  buildTab(right[0], 2),
                  buildTab(right[1], 3),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hairline along the nav's top edge, following the two rounded corners
/// and down the sides — no line along the bottom (screen edge).
class _TopOutlinePainter extends CustomPainter {
  const _TopOutlinePainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    const inset = 0.5;
    final r = radius;
    final path = Path()
      ..moveTo(inset, size.height)
      ..lineTo(inset, r)
      ..arcToPoint(Offset(r, inset), radius: Radius.circular(r))
      ..lineTo(size.width - r, inset)
      ..arcToPoint(Offset(size.width - inset, r), radius: Radius.circular(r))
      ..lineTo(size.width - inset, size.height);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_TopOutlinePainter old) =>
      old.color != color || old.radius != radius;
}
