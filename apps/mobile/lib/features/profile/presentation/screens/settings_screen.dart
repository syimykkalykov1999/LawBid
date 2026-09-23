import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';
import '../../../../core/l10n/widgets/language_picker_sheet.dart';
import '../../../../core/navigation/app_routes.dart';

/// `/profile/settings` (file 01 §3.6: "Настройки (гамбургер): Аккаунт,
/// Безопасность, Язык, Тема, Подписка (адвокат), История кейсов
/// (защищённый раздел, детали в файле 4), Уведомления, Помощь, Правовая
/// информация, Выйти, Удалить аккаунт").
///
/// 2026-09-22 owner follow-up: the theme switcher used to live directly on
/// the Profile tab stub (a bare `SegmentedButton`, stage-1.5 placeholder —
/// see `profile_screen.dart`'s git history). The owner pointed out that's
/// not how other apps do it (Instagram/TikTok: profile → gear icon →
/// settings screen), which also happens to be exactly what §3.6 specifies.
/// Moved here, plus every other §3.6 row as a stub list — only Тема and
/// Язык are wired to real controllers today. Phase 4 of the auth
/// networking work (docs/CHANGELOG.md, continuing directly after Phase 3
/// social login, commit 2bbeba5) wires Безопасность -> Active Devices
/// (`AppRoutes.activeDevices`) and Удалить аккаунт -> the delete-account
/// flow (`AppRoutes.deleteAccount`). Аккаунт, Выйти, Подписка (file 3),
/// История кейсов (file 4), and Уведомления's deeper categories (file 5)
/// still show the "not built yet" affordance already used elsewhere
/// (welcome screen's social buttons, legal docs).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final themeMode = ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;

    void showNotBuiltYet() {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t.t('auth.welcome.notBuiltYet'))),
      );
    }

    String themeLabel(ThemeMode mode) => switch (mode) {
          ThemeMode.system => t.t('settings.theme.system'),
          ThemeMode.light => t.t('settings.theme.light'),
          ThemeMode.dark => t.t('settings.theme.dark'),
        };

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('settings.title')),
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: colors.text),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        children: [
          _SettingsRow(
            label: t.t('settings.account'),
            onTap: showNotBuiltYet,
          ),
          _SettingsRow(
            label: t.t('settings.security'),
            onTap: () => context.push(AppRoutes.activeDevices),
          ),
          _SettingsRow(
            label: t.t('settings.language'),
            onTap: () => LanguagePickerSheet.show(context),
          ),
          _SettingsRow(
            label: t.t('settings.theme'),
            trailingText: themeLabel(themeMode),
            onTap: () => _ThemePickerSheet.show(context),
          ),
          _SettingsRow(
            label: t.t('settings.subscription'),
            onTap: showNotBuiltYet,
          ),
          _SettingsRow(
            label: t.t('settings.caseHistory'),
            onTap: showNotBuiltYet,
          ),
          _SettingsRow(
            label: t.t('settings.notifications'),
            onTap: showNotBuiltYet,
          ),
          _SettingsRow(
            label: t.t('settings.help'),
            onTap: showNotBuiltYet,
          ),
          _SettingsRow(
            label: t.t('settings.legal'),
            onTap: showNotBuiltYet,
          ),
          const SizedBox(height: AppSpacing.md),
          _SettingsRow(
            label: t.t('settings.logout'),
            destructive: true,
            onTap: showNotBuiltYet,
          ),
          _SettingsRow(
            label: t.t('settings.deleteAccount'),
            destructive: true,
            onTap: () => context.push(AppRoutes.deleteAccount),
          ),
        ],
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.label,
    required this.onTap,
    this.trailingText,
    this.destructive = false,
  });

  final String label;
  final VoidCallback onTap;
  final String? trailingText;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final labelColor = destructive ? colors.danger : colors.text;

    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Expanded(child: Text(label, style: typography.body.copyWith(color: labelColor))),
              if (trailingText != null) ...[
                Text(
                  trailingText!,
                  style: typography.bodySmall.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(width: AppSpacing.xs),
              ],
              if (!destructive) Icon(Icons.chevron_right, size: 20, color: colors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

/// Theme picker (file 01 §8.1: "Системная / Светлая / Тёмная") — a small
/// bottom sheet rather than the welcome screen's single quick-toggle icon
/// button, since here all 3 [ThemeMode] values need a home, not just a
/// light<->dark shortcut.
class _ThemePickerSheet extends ConsumerWidget {
  const _ThemePickerSheet();

  static Future<void> show(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.roleCard)),
      ),
      builder: (_) => const _ThemePickerSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final current = ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;

    Widget option(ThemeMode mode, String label, IconData icon) {
      final selected = mode == current;
      return Semantics(
        button: true,
        selected: selected,
        label: label,
        child: InkWell(
          onTap: () {
            ref.read(themeModeControllerProvider.notifier).setThemeMode(mode);
            Navigator.of(context).pop();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                Icon(icon, size: 20, color: colors.text),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(label, style: typography.body.copyWith(color: colors.text))),
                if (selected) Icon(Icons.check, size: 20, color: colors.gold),
              ],
            ),
          ),
        ),
      );
    }

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              t.t('settings.theme'),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            option(ThemeMode.system, t.t('settings.theme.system'), Icons.smartphone),
            option(ThemeMode.light, t.t('settings.theme.light'), Icons.light_mode_outlined),
            option(ThemeMode.dark, t.t('settings.theme.dark'), Icons.dark_mode_outlined),
          ],
        ),
      ),
    );
  }
}
