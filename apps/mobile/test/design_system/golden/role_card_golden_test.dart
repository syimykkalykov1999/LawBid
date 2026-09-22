import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Golden coverage for RoleCard (file 07 §D.1/§D.3 acceptance: selected-card
/// state, both role variants, both themes).
void main() {
  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme = brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('RoleCard client - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        Padding(
          padding: const EdgeInsets.all(16),
          child: RoleCard(
            icon: Icons.person_outline,
            title: 'Клиент',
            description: 'Опубликуйте кейс и выбирайте предложения адвокатов.',
            isSelected: true,
            onTap: _noop,
          ),
        ),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(320, 130),
      );
      await screenMatchesGolden(tester, 'role_card_client_$name');
    });

    testGoldens('RoleCard attorney - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        Padding(
          padding: const EdgeInsets.all(16),
          child: RoleCard(
            icon: Icons.gavel,
            title: 'Адвокат',
            description: 'Лицензированный юрист: находите клиентов по своей практике и штату.',
            isSelected: false,
            isAttorneyFixedStyle: true,
            showProBadge: true,
            onTap: _noop,
          ),
        ),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(320, 130),
      );
      await screenMatchesGolden(tester, 'role_card_attorney_$name');
    });
  }
}

void _noop() {}
