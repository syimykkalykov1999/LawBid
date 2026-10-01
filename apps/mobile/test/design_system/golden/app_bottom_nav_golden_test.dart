import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Golden coverage for AppBottomNav (file 01 §15 acceptance: "нижнее меню
/// совпадает с разделом 3" — 5 visual slots, 4 selectable tabs + center "+").
void main() {
  final tabs = [
    const AppTabConfig(key: AppTabKey.feed, icon: AppIcons.articleOutlined, activeIcon: AppIcons.article, label: 'Лента'),
    const AppTabConfig(key: AppTabKey.search, icon: AppIcons.searchOutlined, activeIcon: AppIcons.search, label: 'Поиск'),
    const AppTabConfig(key: AppTabKey.mine, icon: AppIcons.folderOutlined, activeIcon: AppIcons.folder, label: 'Моё'),
    const AppTabConfig(key: AppTabKey.profile, icon: AppIcons.personOutline, activeIcon: AppIcons.person, label: 'Профиль'),
  ];

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme = brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('AppBottomNav - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        AppBottomNav(
          tabs: tabs,
          currentIndex: 0,
          onTabSelected: (_) {},
          onCreatePressed: () {},
        ),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(375, 80),
      );
      await screenMatchesGolden(tester, 'app_bottom_nav_$name');
    });
  }
}
