import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
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
      // Owner 2026-10-13: no tinted block under the selected tab; the icon
      // itself turns gold (the gold of the client check).
      final iconColor = selected ? colors.goldAccent : colors.textSecondary;
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
            // Owner 2026-10-12: a narrow pill (52) behind the icon, centred,
            // not the whole fifth of the bar.
            child: Center(
              child: AnimatedContainer(
                duration: stateDuration,
                curve: AppMotion.enterCurve,
                width: 52,
                margin: const EdgeInsets.symmetric(vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedSwitcher(
                      duration: stateDuration,
                      transitionBuilder: (child, animation) => ScaleTransition(
                        scale: Tween<double>(begin: 0.85, end: 1)
                            .animate(animation),
                        child: FadeTransition(opacity: animation, child: child),
                      ),
                      child: AppIcon(
                        selected ? tab.activeIcon : tab.icon,
                        key: ValueKey<bool>(selected),
                        size: AppSizes.iconMd + 2,
                        color: iconColor,
                      ),
                    ),
                  ],
                ),
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
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.pill),
          // Owner 2026-10-13 (speed): the blur costs a full-width pass every
          // frame over the scrolling feed; only the Glass theme needs it.
          child: BackdropFilter(
            enabled: colors.isGlass,
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: DecoratedBox(
              decoration: BoxDecoration(
                // Owner 2026-10-12: see-through, the feed shows under it.
                color: colors.isGlass
                    ? colors.sheet
                    : colors.surface.withValues(alpha: 0.96),
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(color: colors.border),
              ),
              child: SizedBox(
                height: 46,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                  child: Row(
                    children: [
                      buildTab(left[0], 0),
                      buildTab(left[1], 1),
                      // Owner 2026-10-19 («кнопки прилипают к плюсу»): the
                      // "+" takes one fifth of the bar like every tab, so
                      // the five icons stand at equal distances.
                      Expanded(
                        child: Center(
                          child: AppTapTarget(
                            child: Semantics(
                              button: true,
                              label: createSemanticLabel,
                              excludeSemantics: true,
                              child: AppPressable(
                                onTap: onCreatePressed,
                                child: Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                      colors: [colors.goldLight, colors.gold],
                                    ),
                                    shape: BoxShape.circle,
                                    boxShadow: [
                                      BoxShadow(
                                        color:
                                            colors.gold.withValues(alpha: 0.35),
                                        blurRadius: 10,
                                        offset: const Offset(0, 3),
                                      ),
                                    ],
                                  ),
                                  alignment: Alignment.center,
                                  child: AppIcon(
                                    AppIcons.addRounded,
                                    color: colors.navy,
                                    size: 22,
                                  ),
                                ),
                              ),
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
        ),
      ),
    );
  }
}
