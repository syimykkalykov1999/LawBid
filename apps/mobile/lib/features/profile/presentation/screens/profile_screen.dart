import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';
import '../../../../core/design_system/theme/theme_mode_providers.dart';

/// Stage 1.5 stub (file 01 §15). Real content (public/closed profile,
/// settings) is file 3. Doubles as the theme-mode toggle demo for this
/// stage's acceptance criterion ("переключение тем").
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final themeModeAsync = ref.watch(themeModeControllerProvider);

    return Scaffold(
      appBar: AppTopBar(title: Text(t.t('profile.stub.title'))),
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Тема'),
            const SizedBox(height: AppSpacing.sm),
            SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(value: ThemeMode.system, label: Text('Системная')),
                ButtonSegment(value: ThemeMode.light, label: Text('Светлая')),
                ButtonSegment(value: ThemeMode.dark, label: Text('Тёмная')),
              ],
              selected: {themeModeAsync.value ?? ThemeMode.system},
              onSelectionChanged: (selection) {
                ref.read(themeModeControllerProvider.notifier).setThemeMode(selection.first);
              },
            ),
          ],
        ),
      ),
    );
  }
}
