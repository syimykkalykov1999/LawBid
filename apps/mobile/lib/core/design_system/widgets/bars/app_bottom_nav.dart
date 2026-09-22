import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';

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
    super.key,
    required this.tabs,
    required this.currentIndex,
    required this.onTabSelected,
    required this.onCreatePressed,
    this.createSemanticLabel = 'Создать',
  }) : assert(tabs.length == 4, 'AppBottomNav expects exactly 4 tabs plus the fixed center "+"');

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

    Widget buildTab(AppTabConfig tab, int index) {
      final selected = index == currentIndex;
      final color = selected ? colors.accent : colors.textSecondary;
      return Expanded(
        child: Semantics(
          button: true,
          selected: selected,
          label: tab.label,
          child: InkWell(
            onTap: () => onTabSelected(index),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(selected ? tab.activeIcon : tab.icon, size: 24, color: color),
                  const SizedBox(height: 2),
                  Text(tab.label, style: typography.caption.copyWith(color: color)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 58,
          child: Row(
            children: [
              buildTab(left[0], 0),
              buildTab(left[1], 1),
              Semantics(
                button: true,
                label: createSemanticLabel,
                child: InkWell(
                  onTap: onCreatePressed,
                  customBorder: const CircleBorder(),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: colors.accent, shape: BoxShape.circle),
                      alignment: Alignment.center,
                      child: Icon(Icons.add, color: colors.onAccent, size: 26),
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
    );
  }
}
