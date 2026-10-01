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
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';

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

    // Owner 2026-09-30: a floating pill bar (smaller, soft shadow, inset
    // from the screen edges); the selected tab is a tinted rounded block
    // behind BOTH icon and label. Haptic on tap; hit area = whole tab.
    Widget buildTab(AppTabConfig tab, int index) {
      final selected = index == currentIndex;
      // Label contrast (WCAG 4.5:1) on the tinted block: the selected
      // label uses the text colour, the icon carries the gold accent.
      final color = selected ? colors.text : colors.textSecondary;
      final iconColor = selected ? colors.goldDark : colors.textSecondary;
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
            child: AnimatedContainer(
              duration: stateDuration,
              curve: AppMotion.enterCurve,
              margin: const EdgeInsets.symmetric(
                horizontal: 2,
                vertical: AppSpacing.xs + 1,
              ),
              decoration: BoxDecoration(
                color: selected
                    ? colors.goldTint
                    : colors.goldTint.withValues(alpha: 0),
                borderRadius: BorderRadius.circular(AppRadii.pill),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedSwitcher(
                    duration: stateDuration,
                    transitionBuilder: (child, animation) => ScaleTransition(
                      scale:
                          Tween<double>(begin: 0.85, end: 1).animate(animation),
                      child: FadeTransition(opacity: animation, child: child),
                    ),
                    child: AppIcon(
                      selected ? tab.activeIcon : tab.icon,
                      key: ValueKey<bool>(selected),
                      size: AppSizes.iconMd - 2,
                      color: iconColor,
                    ),
                  ),
                  const SizedBox(height: 2),
                  AnimatedDefaultTextStyle(
                    duration: stateDuration,
                    style: typography.caption.copyWith(
                      color: color,
                      fontSize: 11,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                    // Tab labels grow with the system text size only up to
                    // 1.35x (platform convention for tab bars, docs/01 §8.4).
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

    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.xs,
          AppSpacing.md,
          0,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: colors.border),
            boxShadow: [
              BoxShadow(
                color: colors.shadow,
                blurRadius: 18,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: SizedBox(
            height: 60,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
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
                          width: 42,
                          height: 42,
                          margin: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.xs),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [colors.goldLight, colors.gold],
                            ),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: colors.gold.withValues(alpha: 0.35),
                                blurRadius: 10,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          alignment: Alignment.center,
                          child: AppIcon(AppIcons.addRounded,
                              color: colors.navy, size: 24),
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
