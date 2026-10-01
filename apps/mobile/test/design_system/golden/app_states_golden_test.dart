import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Golden coverage for the empty / error / offline states (UI
/// modernization pass, 2026-09-27, docs/CHANGELOG.md). Strings are test
/// fixtures, not UI copy.
void main() {
  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme =
        brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('App states - $name', (tester) async {
      final builder =
          GoldenBuilder.column(bgColor: theme.scaffoldBackgroundColor)
            ..addScenario(
              'empty',
              const SizedBox(
                width: 360,
                height: 280,
                child: AppEmptyState(
                  icon: AppIcons.balanceRounded,
                  message: 'Nothing here yet',
                ),
              ),
            )
            ..addScenario(
              'error',
              SizedBox(
                width: 360,
                height: 320,
                child: AppErrorState(
                  message: "Couldn't load your devices",
                  retryLabel: 'Retry',
                  onRetry: () {},
                ),
              ),
            )
            ..addScenario(
              'offline',
              const SizedBox(
                width: 360,
                height: 320,
                child: AppOfflineState(
                  title: "You're offline",
                  message: 'Check your internet connection and try again.',
                ),
              ),
            );
      await tester.pumpWidgetBuilder(
        builder.build(),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(400, 1080),
      );
      await screenMatchesGolden(tester, 'app_states_$name');
    });
  }
}
